"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCode } from "@/lib/shiki";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group/code relative my-4 overflow-hidden rounded-lg border border-border/50 bg-[#22272e]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/30 bg-black/20 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/80">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label={copied ? "Copiado" : "Copiar código"}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      {html ? (
        <div
          className="code-block-content overflow-x-auto text-sm [&>pre]:!bg-transparent [&>pre]:!m-0 [&>pre]:!p-3 [&>pre]:leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 overflow-x-auto bg-transparent p-3 text-sm leading-relaxed text-foreground/80">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
