import { useCallback, useRef, useState } from "react";

export type ToolStep = {
  id: string;
  command: string;
  status: "running" | "done" | "error";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: Array<ToolStep>;
};

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

/**
 * Minimal streaming chat hook. POSTs the conversation to `/api/chat` and parses
 * the AG-UI Server-Sent Events the server emits (TEXT_MESSAGE_CONTENT deltas and
 * TOOL_CALL_START / _ARGS / _END / _RESULT) into messages with inline tool steps.
 */
export function useSandboxChat() {
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [busy, setBusy] = useState(false);
  const assistantId = useRef<string | null>(null);

  const patch = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === assistantId.current ? fn(m) : m)));

  const patchTool = (id: string, up: Partial<ToolStep>) =>
    patch((m) => ({
      ...m,
      tools: m.tools.map((t) => (t.id === id ? { ...t, ...up } : t)),
    }));

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: ChatMessage = {
        id: uid("u"),
        role: "user",
        text: trimmed,
        tools: [],
      };
      const aId = uid("a");
      assistantId.current = aId;
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: aId, role: "assistant", text: "", tools: [] },
      ]);
      setBusy(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        if (!res.body) throw new Error("no response body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (line) handle(JSON.parse(line.slice(6)));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patch((m) => ({ ...m, text: `${m.text}\n\n[error] ${message}` }));
      } finally {
        setBusy(false);
      }

      function handle(ev: any) {
        switch (ev.type) {
          case "TEXT_MESSAGE_CONTENT":
            patch((m) => ({ ...m, text: m.text + (ev.delta ?? "") }));
            break;
          case "TOOL_CALL_START":
            patch((m) => ({
              ...m,
              tools: [...m.tools, { id: ev.toolCallId, command: "", status: "running" }],
            }));
            break;
          case "TOOL_CALL_ARGS": {
            let command = "";
            try {
              command = JSON.parse(ev.args).command ?? "";
            } catch {
              /* partial JSON while streaming — ignore */
            }
            if (command) patchTool(ev.toolCallId, { command });
            break;
          }
          case "TOOL_CALL_END":
            if (ev.input?.command) patchTool(ev.toolCallId, { command: ev.input.command });
            break;
          case "TOOL_CALL_RESULT": {
            try {
              const r = JSON.parse(ev.content);
              patchTool(ev.toolCallId, {
                status: r.exitCode === 0 ? "done" : "error",
                exitCode: r.exitCode,
                stdout: r.stdout,
                stderr: r.stderr,
              });
            } catch {
              patchTool(ev.toolCallId, { status: "done" });
            }
            break;
          }
          case "RUN_ERROR":
            patch((m) => ({
              ...m,
              text: `${m.text}\n\n[error] ${ev.error?.message ?? "run error"}`,
            }));
            break;
        }
      }
    },
    [busy, messages],
  );

  return { messages, busy, send };
}
