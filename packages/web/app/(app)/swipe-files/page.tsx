"use client";

/**
 * Swipe Files — biblioteca de referências de anúncios (área Global).
 *
 * Acervo compartilhado do time: referência boa serve pra qualquer cliente, então
 * não é escopada por projeto — o recorte vem dos filtros.
 *
 * Layout em masonry (colunas CSS) e não grid rígido: anúncio vem em proporção
 * variada (story 9:16, feed 1:1, banner), e forçar tudo em `aspect-video`
 * cortaria justamente o que se quer olhar.
 */

import { useState } from "react";
import {
  AlertCircle, Library, Plus, Search, Star, X, Play, Link2, ImageIcon, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRole } from "@/lib/hooks/use-user-role";
import {
  useSwipeFiles, useUpdateSwipeFile, useDeleteSwipeFile,
  type SwipeFile, type SwipeFilters, type AssetKind,
} from "@/lib/hooks/use-swipe-files";
import { AddSwipeDialog } from "@/components/swipe-files/add-swipe-dialog";
import { SwipeLightbox } from "@/components/swipe-files/swipe-lightbox";

const KIND_META: Record<AssetKind, { label: string; Icon: typeof Play }> = {
  image: { label: "Imagem", Icon: ImageIcon },
  video: { label: "Vídeo", Icon: Play },
  link: { label: "Link", Icon: Link2 },
};

/** Chip de filtro — clicar de novo limpa. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SwipeCard({
  item,
  onOpen,
  onToggleFavorite,
}: {
  item: SwipeFile;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const media = item.assetKind === "link" ? item.ogImage : item.fileUrl;
  const { label, Icon } = KIND_META[item.assetKind];
  // Reserva a proporção conhecida pra o masonry não saltar enquanto carrega.
  const ratio = item.width && item.height ? item.width / item.height : null;

  return (
    <div className="group mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border/40 bg-card">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative bg-muted/40" style={ratio ? { aspectRatio: String(ratio) } : undefined}>
          {media ? (
            <img
              src={media}
              alt={item.title}
              loading="lazy"
              className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              style={ratio ? { aspectRatio: String(ratio) } : undefined}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}

          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Icon className="h-2.5 w-2.5" />
            {label}
          </span>

          {item.assetKind === "video" && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
              </span>
            </span>
          )}
        </div>
      </button>

      <div className="p-2.5">
        <div className="flex items-start gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs font-medium" title={item.title}>
            {item.title}
          </p>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`shrink-0 transition-colors ${
              item.isFavorite ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
            aria-label={item.isFavorite ? "Remover destaque" : "Destacar"}
          >
            <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-current" : ""}`} />
          </button>
        </div>

        {(item.brand || item.platform || item.format) && (
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {[item.brand, item.platform, item.format].filter(Boolean).join(" · ")}
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[9px]">{t}</Badge>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{item.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SwipeFilesPage() {
  const role = useUserRole();
  const [filters, setFilters] = useState<SwipeFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SwipeFile | null>(null);

  const { data, isLoading, isFetching } = useSwipeFiles(filters);
  const updateItem = useUpdateSwipeFile();
  const deleteItem = useDeleteSwipeFile();

  if (role === "guest") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Swipe Files é restrito à equipe interna.</p>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const facets = data?.facets ?? { platform: [], format: [], niche: [], brand: [], tags: [] };
  const ativos = Object.entries(filters).filter(([, v]) => v).length;

  function set<K extends keyof SwipeFilters>(key: K, value: SwipeFilters[K]) {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));
  }

  return (
    <div className="mx-auto max-w-[1500px] p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Library className="h-6 w-6 text-primary" />
            Swipe Files
          </h1>
          <p className="text-sm text-muted-foreground">
            Biblioteca de referências de anúncios do time. Print, vídeo ou link — tudo num lugar só.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova referência
        </Button>
      </div>

      {/* Uma linha de filtros acima de tudo que ela recorta. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
              placeholder="Buscar por título, marca ou anotação..."
              className="h-9 pl-8"
            />
          </div>

          {(["image", "video", "link"] as const).map((k) => (
            <Chip key={k} active={filters.kind === k} onClick={() => set("kind", k)}>
              {KIND_META[k].label}
            </Chip>
          ))}
          <Chip active={!!filters.favorites} onClick={() => set("favorites", !filters.favorites || undefined)}>
            <Star className={`mr-0.5 inline h-2.5 w-2.5 ${filters.favorites ? "fill-current" : ""}`} />
            Destaques
          </Chip>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            Mais filtros
            {ativos > 0 && <Badge variant="secondary" className="ml-1 px-1 text-[9px]">{ativos}</Badge>}
          </Button>

          {ativos > 0 && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs" onClick={() => setFilters({})}>
              <X className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-2 rounded-xl border border-border/40 p-3">
            {([
              ["Plataforma", "platform", facets.platform],
              ["Formato", "format", facets.format],
              ["Nicho", "niche", facets.niche],
              ["Marca", "brand", facets.brand],
              ["Tag", "tag", facets.tags],
            ] as const)
              .filter(([, , opts]) => opts.length > 0)
              .map(([label, key, opts]) => (
                <div key={key} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                  {opts.map((o) => (
                    <Chip key={o} active={filters[key] === o} onClick={() => set(key, o)}>
                      {o}
                    </Chip>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Galeria. Durante refiltro mantém o render anterior em opacidade
          reduzida — sem skeleton piscando e sem salto de layout. */}
      {isLoading ? (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="mb-3 h-48 break-inside-avoid" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-12 text-center">
          <Library className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {ativos > 0 ? "Nenhuma referência com esses filtros." : "A biblioteca está vazia."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ativos > 0
              ? "Tente afrouxar os filtros."
              : "Suba o primeiro print, vídeo ou link de anúncio que valha guardar."}
          </p>
        </div>
      ) : (
        <div
          className={`columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 ${
            isFetching ? "opacity-60 transition-opacity" : ""
          }`}
        >
          {items.map((item, i) => (
            <SwipeCard
              key={item.id}
              item={item}
              onOpen={() => setLightboxIndex(i)}
              onToggleFavorite={() =>
                updateItem.mutate({ id: item.id, input: { isFavorite: !item.isFavorite } })
              }
            />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {items.length} referência{items.length !== 1 ? "s" : ""}
          {items.length === 300 ? " (mostrando as 300 mais recentes)" : ""}
        </p>
      )}

      <AddSwipeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        facets={facets}
        storageReady={data?.storageReady ?? false}
      />

      {lightboxIndex !== null && (
        <SwipeLightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onToggleFavorite={(item) =>
            updateItem.mutate({ id: item.id, input: { isFavorite: !item.isFavorite } })
          }
          onDelete={(item) => {
            setLightboxIndex(null);
            setConfirmDelete(item);
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{confirmDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A referência sai da biblioteca do time e o arquivo é apagado do armazenamento. Não dá
              pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmDelete) return;
                deleteItem.mutate(confirmDelete.id, {
                  onSuccess: () => toast.success("Referência excluída"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
                });
                setConfirmDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
