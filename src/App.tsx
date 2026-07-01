import { useState } from "react";
import { Bot, Github, SendHorizonal, Terminal, User } from "lucide-react";

const REPO_URL = "https://github.com/fly-apps/tanstack-sprite-agent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { useSandboxChat } from "@/lib/use-sandbox-chat";
import type { ChatMessage, ToolStep } from "@/lib/use-sandbox-chat";

const SUGGESTIONS = [
  "What OS, kernel, and node version is this sandbox?",
  "Write fib.py that prints the first 10 Fibonacci numbers, then run it.",
  "Create a git repo, add a README, and show me the log.",
];

function ToolStepView({ tool }: { tool: ToolStep }) {
  const output = [
    (tool.stdout ?? "").trimEnd(),
    tool.stderr ? `[stderr] ${tool.stderr.trimEnd()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div className="w-full max-w-[85%] space-y-1.5">
      <Marker variant="border">
        <MarkerIcon>
          {tool.status === "running" ? (
            <Spinner className="size-3.5" />
          ) : (
            <Terminal className="size-3.5" />
          )}
        </MarkerIcon>
        <MarkerContent className={cn("font-mono", tool.status === "running" && "shimmer")}>
          {tool.command || "run_bash"}
        </MarkerContent>
      </Marker>
      {tool.status !== "running" && (
        <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {output || "(no output)"}
          {tool.exitCode !== undefined && (
            <span
              className={
                "mt-1 block text-[11px] " +
                (tool.exitCode === 0 ? "opacity-50" : "text-destructive")
              }
            >
              exit {tool.exitCode}
            </span>
          )}
        </pre>
      )}
    </div>
  );
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const showBubble = message.text.length > 0 || message.tools.length === 0;
  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar>
        <Avatar>
          {!isUser && <AvatarImage src="/logo.webp" alt="Sprites" />}
          <AvatarFallback className={isUser ? "" : "bg-primary text-primary-foreground"}>
            {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        {message.tools.map((tool) => (
          <ToolStepView key={tool.id} tool={tool} />
        ))}
        {showBubble && (
          <Bubble variant={isUser ? "default" : "muted"} align={isUser ? "end" : "start"}>
            <BubbleContent className={isUser ? "whitespace-pre-wrap" : undefined}>
              {message.text ? (
                isUser ? (
                  message.text
                ) : (
                  <Markdown>{message.text}</Markdown>
                )
              ) : isUser ? (
                ""
              ) : (
                <span className="shimmer shimmer-duration-1500">Thinking…</span>
              )}
            </BubbleContent>
          </Bubble>
        )}
      </MessageContent>
    </Message>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <img src="/logo.webp" alt="Sprites" className="size-32 rounded-3xl" />
      <div>
        <div className="text-lg font-semibold">Claude, in a real Linux sandbox</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Every command runs inside an isolated Sprite via{" "}
          <code className="font-mono">@tanstack/ai-sandbox-sprites</code>. Try one:
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            variant="outline"
            className="h-auto whitespace-normal px-4 py-2 text-left"
            onClick={() => onPick(s)}
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A slim rail of tick marks in the transcript's left gutter — one per user turn.
 * The current turn's tick is highlighted, hovering shows the turn text, and
 * clicking jumps to it. Uses the MessageScroller hooks
 * (`useMessageScrollerVisibility` + `useMessageScroller().scrollToMessage`), so
 * it must render inside `MessageScrollerProvider` (as a child of the scroller
 * frame, which is `position: relative`).
 */
function TurnTicks({ messages }: { messages: Array<ChatMessage> }) {
  const { currentAnchorId } = useMessageScrollerVisibility();
  const { scrollToMessage } = useMessageScroller();
  const turns = messages.filter((m) => m.role === "user");
  if (turns.length < 2) return null;
  return (
    <div className="absolute inset-y-0 left-0 z-10 flex flex-col items-start justify-center gap-2 py-8 ps-1.5">
      {turns.map((m, i) => {
        const active = m.id === currentAnchorId;
        const label = m.text.replace(/\s+/g, " ").trim();
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => scrollToMessage(m.id, { align: "start" })}
            aria-label={`Jump to turn ${i + 1}`}
            className="group/tick relative flex h-3 items-center"
          >
            <span
              className={cn(
                "h-0.5 rounded-full transition-all duration-200",
                active
                  ? "w-5 bg-foreground"
                  : "w-2.5 bg-muted-foreground/40 group-hover/tick:w-4 group-hover/tick:bg-foreground/70",
              )}
            />
            <span className="pointer-events-none absolute left-7 max-w-[16rem] translate-x-1 truncate rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-all group-hover/tick:translate-x-0 group-hover/tick:opacity-100">
              {i + 1}. {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const { messages, busy, send } = useSandboxChat();
  const [input, setInput] = useState("");

  const submit = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || busy) return;
    setInput("");
    void send(value);
  };

  return (
    <div className="mx-auto flex h-screen w-full max-w-3xl flex-col">
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <img src="/logo.webp" alt="Sprites" className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">TanStack AI × Sprites</div>
          <div className="truncate text-xs text-muted-foreground">
            Claude with a real Linux sandbox — powered by @tanstack/ai-sandbox-sprites
          </div>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Github className="size-5" />
        </a>
      </header>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport className="py-6 pe-5 ps-9">
            <MessageScrollerContent>
              {messages.length === 0 ? (
                <EmptyState onPick={submit} />
              ) : (
                messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <ChatMessageView message={message} />
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <TurnTicks messages={messages} />
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form
        className="flex items-end gap-2 border-t px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Ask Claude to run something in the sandbox…"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          {busy ? <Spinner className="size-4" /> : <SendHorizonal className="size-4" />}
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
