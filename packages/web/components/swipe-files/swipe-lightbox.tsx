"use client";

/**
 * Swipe Files — visualizador em tela cheia.
 *
 * Molde do lightbox de criativos do Tráfego (navegação por teclado, setas,
 * painel lateral de metadados), adaptado pro acervo: aqui o painel carrega a
 * taxonomia e as notas do time, que é o que faz a referência ser útil meses
 * depois — "por que salvamos isso".
 */

import { useEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, ExternalLink, Star, Trash2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SwipeFile } from "@/lib/hooks/use-swipe-files";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function SwipeLightbox({
  items,
  index,
  onClose,
  onNavigate,
  onToggleFavorite,
  onDelete,
}: {
  items: SwipeFile[];
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
  onToggleFavorite: (item: SwipeFile) => void;
  onDelete: (item: SwipeFile) => void;
}) {
  const item = items[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    // Trava o scroll do fundo enquanto o lightbox está aberto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, items.length, onClose, onNavigate]);

  if (!item) return null;

  const media = item.assetKind === "link" ? item.ogImage : item.fileUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10 text-white/70 hover:bg-white/10 hover:text-white"
        onClick={onClose}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </Button>

      {index > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 z-10 h-10 w-10 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
          aria-label="Anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      )}
      {index < items.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 z-10 h-10 w-10 text-white/70 hover:bg-white/10 hover:text-white"
          style={{ top: "50%" }}
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
          aria-label="Próximo"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      )}

      <div
        className="flex max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mídia */}
        <div className="flex min-w-0 flex-1 items-center justify-center bg-black/40 p-2">
          {item.assetKind === "video" && item.fileUrl ? (
            // Sem <track>: é criativo de anúncio de terceiro, não temos legenda
            // pra fornecer. O título e as notas ficam no painel ao lado.
            <video
              src={item.fileUrl}
              controls
              autoPlay
              aria-label={item.title}
              className="max-h-[86vh] max-w-full rounded"
            />
          ) : media ? (
            // <img> cru é o padrão do codebase — o otimizador do Next exigiria
            // liberar o host do bucket em next.config.
            <img src={media} alt={item.title} className="max-h-[86vh] max-w-full rounded object-contain" />
          ) : (
            <div className="p-16 text-center text-sm text-white/60">
              Sem preview visual — abra o link original.
            </div>
          )}
        </div>

        {/* Metadados: o "por que salvamos isso" */}
        <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border/40 p-4 lg:flex">
          <h2 className="text-base font-semibold leading-tight">{item.title}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.createdByName ? `${item.createdByName} · ` : ""}{fmtWhen(item.createdAt)}
          </p>

          <div className="mt-3 flex gap-1.5">
            <Button
              variant={item.isFavorite ? "default" : "outline"}
              size="sm"
              className="h-8 flex-1 gap-1.5 text-xs"
              onClick={() => onToggleFavorite(item)}
            >
              <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-current" : ""}`} />
              {item.isFavorite ? "Destaque" : "Destacar"}
            </Button>
            {item.fileUrl && (
              <Button variant="outline" size="icon" className="h-8 w-8" asChild title="Baixar">
                <a href={item.fileUrl} download target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(item)}
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {item.notes && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Por que salvamos
              </p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed">{item.notes}</p>
            </div>
          )}

          <dl className="mt-4 space-y-2">
            {([
              ["Marca", item.brand],
              ["Nicho", item.niche],
              ["Plataforma", item.platform],
              ["Formato", item.format],
            ] as const)
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="text-right text-xs">{v}</dd>
                </div>
              ))}
          </dl>

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          )}

          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {item.ogSiteName ?? "Abrir original"} <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <p className="mt-auto pt-4 text-[10px] text-muted-foreground">
            {index + 1} de {items.length} · ← → navega · Esc fecha
          </p>
        </aside>
      </div>
    </div>
  );
}
