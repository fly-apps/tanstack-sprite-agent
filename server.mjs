/**
 * A minimal chat app that gives Claude a Linux sandbox — a Sprite
 * (sprites.dev, Fly.io) — through a single `run_bash` tool.
 *
 * The assistant answers via `@tanstack/ai` + `@tanstack/ai-anthropic`; when it
 * needs to actually run something, `chat()`'s agent loop calls `run_bash`, whose
 * server executor uses `@tanstack/ai-sandbox-sprites` (`SpritesClient`) to
 * execute the command inside a real, isolated Sprite and stream the result back.
 *
 * One Sprite is created lazily on first tool use and reused for the process
 * lifetime (kept simple for a demo — a real app would key a sandbox per session
 * and tear it down). No framework: plain Node `http` + Server-Sent Events.
 *
 * Env:
 *   ANTHROPIC_API_KEY  - Claude API key (the chat model)
 *   SPRITES_API_KEY    - Sprites API token (org/projectNumber/tokenId/secret)
 *   PORT               - listen port (default 8080)
 */
import http from "node:http";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { z } from "zod";
import { chat, maxIterations, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { SpritesClient } from "@tanstack/ai-sandbox-sprites";

const PORT = Number(process.env.PORT ?? 8080);
const HERE = dirname(fileURLToPath(import.meta.url));

for (const key of ["ANTHROPIC_API_KEY", "SPRITES_API_KEY"]) {
  if (!process.env[key]) throw new Error(`Missing ${key} in the environment`);
}

const client = new SpritesClient({ apiKey: process.env.SPRITES_API_KEY });

// One shared Sprite, created lazily on first `run_bash` call and reused.
let spritePromise;
function ensureSprite() {
  if (!spritePromise) {
    const name = `tanstack-chat-${Math.random().toString(36).slice(2, 8)}`;
    spritePromise = client
      .createSprite(name, { waitForCapacity: true })
      .then(() => {
        console.log(`[sandbox] created Sprite ${name}`);
        return name;
      })
      .catch((error) => {
        spritePromise = undefined; // let the next call retry
        throw error;
      });
  }
  return spritePromise;
}

const runBash = toolDefinition({
  name: "run_bash",
  description:
    "Execute a bash command inside the Linux sandbox (an isolated Sprite) and " +
    "return its stdout, stderr, and exit code. Use it to inspect the machine, " +
    "run code, create or edit files, install packages, etc. The sandbox has " +
    "node, npm, git, and python preinstalled and persists across calls.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to run in the sandbox."),
  }),
}).server(async ({ command }) => {
  const name = await ensureSprite();
  console.log(`[sandbox] ${name} $ ${command}`);
  const run = client.exec(name, { argv: ["bash", "-lc", command] });
  let stdout = "";
  let stderr = "";
  for await (const chunk of run.stdout) stdout += chunk;
  for await (const chunk of run.stderr) stderr += chunk;
  const exitCode = await run.wait();
  return {
    exitCode,
    stdout: stdout.slice(0, 12000),
    stderr: stderr.slice(0, 4000),
  };
});

const SYSTEM_PROMPT = [
  "You are a helpful engineering assistant with access to a real Linux sandbox",
  "through the run_bash tool. The sandbox is an isolated Sprite (a Fly.io",
  "micro-VM) with node, npm, git, and python available; its filesystem persists",
  "across calls within a conversation.",
  "",
  "When a question is best answered by actually running something — inspecting",
  "the environment, executing code, creating files, testing a snippet — use",
  "run_bash rather than guessing. Show the commands you run and summarize the",
  "output. Keep answers concise.",
].join("\n");

async function handleChat(req, res) {
  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" }).end("Bad JSON body");
    return;
  }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    res
      .writeHead(400, { "content-type": "text/plain" })
      .end("body.messages must be a non-empty array");
    return;
  }

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  const stream = chat({
    adapter: anthropicText("claude-sonnet-4-6"),
    tools: [runBash],
    systemPrompts: [SYSTEM_PROMPT],
    agentLoopStrategy: maxIterations(20),
    messages,
    abortController,
  });

  const response = toServerSentEventsResponse(stream, { abortController });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  Readable.fromWeb(response.body).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const DIST = join(HERE, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// Serve the Vite build from ./dist, falling back to index.html (SPA).
async function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = join(DIST, urlPath === "/" ? "index.html" : urlPath);
  try {
    if (!filePath.startsWith(DIST)) throw new Error("traversal");
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    const html = await readFile(join(DIST, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  } catch (error) {
    console.error("[server] error", error);
    if (!res.headersSent) res.writeHead(500);
    res.end("Internal error");
  }
});

server.listen(PORT, () => {
  console.log(`sandbox-sprites-chat listening on http://0.0.0.0:${PORT}`);
});
