<p align="center">
  <img src="https://github.com/user-attachments/assets/b984e0e2-72ec-4819-a408-74052495f333" alt="tanstack-sprite-agent" width="132" height="132" />
</p>

<h1 align="center">tanstack-sprite-agent</h1>

<p align="center">
  <b>Claude with a real Linux sandbox</b> — a <a href="https://sprites.dev">Sprite</a> (Fly.io) — in one <code>chat()</code> call.
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/TanStack-AI-ff4154?logo=react&logoColor=white" alt="TanStack AI" />
  <img src="https://img.shields.io/badge/sandbox-Sprites-7c3aed" alt="Sprites" />
  <img src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white" alt="Node >= 22" />
</p>

---

A chat app that gives Claude a **real Linux sandbox** — a [Sprite](https://sprites.dev) (Fly.io) — through a single `run_bash` tool. Ask it to inspect the machine, write and run code, install packages, or drive a git repo, and it does the work inside an isolated, disposable Sprite and streams the results back.

- **Chat** — [`@tanstack/ai`](https://tanstack.com/ai) + `@tanstack/ai-anthropic` (`anthropicText`).
- **Execution** — [`@tanstack/ai-sandbox-sprites`](https://www.npmjs.com/package/@tanstack/ai-sandbox-sprites) (`SpritesClient`): the `run_bash` tool runs commands inside a Sprite and streams stdout/stderr/exit back to the model.
- **UI** — React + Vite + Tailwind v4 with **shadcn (Base UI)** chat components: `MessageScroller` (auto-scrolls the live edge), `Message`, `Bubble`, `Marker` (each `run_bash` step renders as an inline marker with a spinner + shimmer while it runs), plus markdown-rendered responses.

When the model needs to run something, `chat()`'s agent loop calls `run_bash`; the tool execs the command in a Sprite (created lazily on first use and reused) and the model reads the real output.

## Quick start

```sh
git clone https://github.com/fly-apps/tanstack-sprite-agent
cd tanstack-sprite-agent
pnpm install

cp .env.example .env   # then fill in ANTHROPIC_API_KEY and SPRITES_API_KEY
set -a && . ./.env && set +a

pnpm serve             # vite build → node server.mjs, on http://localhost:8080
```

You need an **Anthropic API key** and a **[Sprites](https://sprites.dev) API token**. Then open http://localhost:8080 and try:

- "What OS, kernel, and node version is this sandbox?"
- "Write fib.py that prints the first 10 Fibonacci numbers, then run it."
- "Create a git repo, add a README, and show me the log."

### Development

Run the API and the Vite dev server side by side (Vite proxies `/api` → `:8081`):

```sh
PORT=8081 node server.mjs   # API
pnpm dev                    # UI with hot reload
```

## How it fits together

```
server.mjs            Node http server: serves the built UI + POST /api/chat (SSE)
src/App.tsx           the chat UI (shadcn Base UI components + markdown)
src/lib/use-sandbox-chat.ts   streaming hook: parses the AG-UI SSE into messages + tool steps
src/components/ui/    shadcn Base UI components (message-scroller, message, bubble, marker, spinner, …)
```

The browser POSTs the conversation to `/api/chat`; the server runs `chat()` with the `run_bash` tool and streams AG-UI Server-Sent Events back (text deltas + `TOOL_CALL_*`), which the client renders as chat bubbles and tool markers.

## Notes

- **One shared sandbox.** The demo creates a single Sprite on first tool use and reuses it. A production app would key a sandbox per session (see `@tanstack/ai-sandbox`'s `defineSandbox` / `withSandbox`) and tear it down when done.
- **The Anthropic key stays on the server** — nothing sensitive is written into the Sprite; the Sprite only ever runs the commands the model requests.
- **Cold start.** The first `run_bash` in a fresh Sprite waits for it to provision (~1–3 min); after that calls are fast, and an idle Sprite resumes on the next exec.

## Deploy on a Sprite

The app is a plain Node server, so it runs anywhere. To host it _on_ a Sprite and expose it at the Sprite's public URL, run it as a service bound to the proxied HTTP port:

```sh
sprite-env services create tanstack-sprite-agent \
  --cmd /.sprite/bin/node --args server.mjs \
  --dir "$PWD" \
  --env "ANTHROPIC_API_KEY=…,SPRITES_API_KEY=…,PORT=8080" \
  --http-port 8080
```

## License

MIT
