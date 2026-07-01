import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders assistant markdown (GFM: tables, lists, code, links) styled with
 * Tailwind Typography. Tuned to sit inside a chat bubble.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:my-1.5 prose-p:leading-relaxed first:prose-p:mt-0 last:prose-p:mb-0",
        "prose-headings:mt-3 prose-headings:mb-1.5",
        "prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-background/70 prose-pre:p-3 prose-pre:text-xs",
        'prose-code:rounded prose-code:bg-background/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-[""] prose-code:after:content-[""]',
        "prose-pre:prose-code:bg-transparent prose-pre:prose-code:p-0",
        "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
        "prose-a:font-medium prose-a:underline prose-a:underline-offset-2",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
