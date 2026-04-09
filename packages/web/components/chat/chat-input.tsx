"use client";

import { useState, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, X, Loader2, FileText } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useMinds } from "@/lib/hooks/use-minds";
import { MindMentionPopup, type MindOption } from "./mind-mention-popup";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface AttachmentData {
  attachmentContext: string;
  attachmentMeta: { filename: string; mimeType: string; textLength: number };
}

interface ChatInputProps {
  onSend: (
    message: string,
    attachment?: AttachmentData,
  ) => void;
  disabled: boolean;
  mindName?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ChatInput({ onSend, disabled, mindName }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getToken } = useAuth();

  // Mind mention state
  const { squads } = useMinds();
  const allMinds: MindOption[] = useMemo(
    () => (squads ?? []).flatMap((s) => s.minds.map((m) => ({ id: m.id, name: m.name, squad: s.displayName }))),
    [squads]
  );
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  // Attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [extractedMeta, setExtractedMeta] = useState<{
    filename: string;
    mimeType: string;
    textLength: number;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadError(null);

      try {
        const token = await getToken();
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? `Erro ${res.status}`);
        }

        const data = await res.json();
        setExtractedText(data.extractedText);
        setExtractedMeta({
          filename: data.filename,
          mimeType: data.mimeType,
          textLength: data.textLength,
        });
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Erro ao processar arquivo",
        );
        setSelectedFile(null);
      } finally {
        setIsUploading(false);
      }
    },
    [getToken],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset file input
      e.target.value = "";

      // Client-side size check
      if (file.size > MAX_FILE_SIZE) {
        setUploadError("Arquivo muito grande. Máximo: 10MB");
        return;
      }

      setUploadError(null);
      setSelectedFile(file);
      setExtractedText(null);
      setExtractedMeta(null);
      handleUpload(file);
    },
    [handleUpload],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setExtractedText(null);
    setExtractedMeta(null);
    setUploadError(null);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    if (extractedText && extractedMeta) {
      onSend(trimmed, {
        attachmentContext: extractedText,
        attachmentMeta: extractedMeta,
      });
    } else {
      onSend(trimmed);
    }

    setValue("");
    handleRemoveFile();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend, extractedText, extractedMeta, handleRemoveFile]);

  const handleMentionSelect = useCallback((mind: MindOption) => {
    const before = value.substring(0, mentionStart);
    const after = value.substring(textareaRef.current?.selectionStart ?? value.length);
    const newValue = `${before}/${mind.name.toLowerCase().replace(/\s+/g, "-")} ${after}`;
    setValue(newValue);
    setMentionVisible(false);
    setMentionQuery("");
    setMentionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [value, mentionStart]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionVisible) {
        const filtered = mentionQuery
          ? allMinds.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          : allMinds;
        const shown = filtered.slice(0, 8);

        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, shown.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          if (shown[mentionIndex]) { e.preventDefault(); handleMentionSelect(shown[mentionIndex]); return; }
        }
        if (e.key === "Escape") { e.preventDefault(); setMentionVisible(false); return; }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, mentionVisible, mentionQuery, mentionIndex, allMinds, handleMentionSelect],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, []);

  const canSend = value.trim().length > 0 && !disabled;
  const clipDisabled = disabled || isUploading;

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Attachment preview chip */}
        {(selectedFile || uploadError) && (
          <div className="mb-2">
            {uploadError ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
                <span>{uploadError}</span>
                <button
                  onClick={handleRemoveFile}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : selectedFile ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm text-foreground shadow-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[200px] truncate">
                  {selectedFile.name}
                </span>
                <span className="text-muted-foreground">
                  ({formatFileSize(selectedFile.size)})
                </span>
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                ) : extractedText ? (
                  <span className="text-xs text-success">✓</span>
                ) : null}
                <button
                  onClick={handleRemoveFile}
                  className="ml-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Mind mention popup */}
        <MindMentionPopup
          minds={allMinds}
          query={mentionQuery}
          selectedIndex={mentionIndex}
          onSelect={handleMentionSelect}
          visible={mentionVisible}
        />

        <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-colors focus-within:border-ring/50 focus-within:shadow-[0_0_0_1px_hsl(var(--color-ring)/0.2)]">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={clipDisabled}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
              clipDisabled
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              const newVal = e.target.value;
              setValue(newVal);
              handleInput();

              // Detect / for mind mention
              const cursor = e.target.selectionStart ?? newVal.length;
              const textBefore = newVal.substring(0, cursor);
              const slashMatch = textBefore.match(/(?:^|\s)\/([\w-]*)$/);
              if (slashMatch) {
                setMentionVisible(true);
                setMentionQuery(slashMatch[1]);
                setMentionStart(textBefore.lastIndexOf("/"));
                setMentionIndex(0);
              } else {
                setMentionVisible(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={mindName ? `Mensagem para ${mindName}...` : "Digite sua mensagem..."}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
              canSend
                ? "bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover hover:shadow-md active:scale-95"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/50">
          Enter para enviar, Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
