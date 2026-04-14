"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import {
  MarkdownTable,
  MarkdownThead,
  MarkdownTbody,
  MarkdownTr,
  MarkdownTh,
  MarkdownTd,
} from "./markdown-table";

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  // Code: distinguish inline vs block. ReactMarkdown marks block code with a
  // className like `language-xxx`; inline code has no language class.
  code({ className, children, ...props }) {
    const match = /language-([\w-]+)/.exec(className ?? "");
    const raw = String(children ?? "").replace(/\n$/, "");
    const isBlock = Boolean(match) || raw.includes("\n");

    if (!isBlock) {
      return (
        <code
          className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-brand"
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock code={raw} language={match?.[1]} />;
  },
  // react-markdown wraps code blocks in <pre>; we already render our own
  // container inside <CodeBlock>, so pass through unchanged.
  pre({ children }) {
    return <>{children}</>;
  },

  table: (props: ComponentProps<"table">) => <MarkdownTable {...props} />,
  thead: (props: ComponentProps<"thead">) => <MarkdownThead {...props} />,
  tbody: (props: ComponentProps<"tbody">) => <MarkdownTbody {...props} />,
  tr: (props: ComponentProps<"tr">) => <MarkdownTr {...props} />,
  th: (props: ComponentProps<"th">) => <MarkdownTh {...props} />,
  td: (props: ComponentProps<"td">) => <MarkdownTd {...props} />,

  a({ children, href, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline-offset-2 hover:underline"
        {...props}
      >
        {children}
      </a>
    );
  },

  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="my-3 border-l-2 border-brand/50 bg-muted/30 py-1 pl-3 italic text-muted-foreground"
        {...props}
      >
        {children}
      </blockquote>
    );
  },

  ul({ children, ...props }) {
    return (
      <ul className="my-3 list-disc space-y-1 pl-5 marker:text-muted-foreground/60" {...props}>
        {children}
      </ul>
    );
  },
  ol({ children, ...props }) {
    return (
      <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground/60" {...props}>
        {children}
      </ol>
    );
  },

  h1: ({ children, ...props }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold text-foreground" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-2 mt-4 text-lg font-bold text-foreground" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold text-foreground" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mb-1 mt-3 text-sm font-semibold text-foreground" {...props}>
      {children}
    </h4>
  ),

  p({ children, ...props }) {
    return (
      <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props}>
        {children}
      </p>
    );
  },

  hr: (props) => <hr className="my-4 border-border/50" {...props} />,
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
