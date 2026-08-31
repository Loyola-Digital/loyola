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
 *
 * O card não tem moldura: numa biblioteca visual, uma borda desenhada ao redor
 * de cada peça compete com a peça. O que separa um card do outro é o espaço.
 */

import { useState } from "react";
import {
  AlertCircle, Bell, Library, Plus, Search, Star, X, Play, Link2, ImageIcon, FileText, Filter,
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
import { ClickUpAlertDialog } from "@/components/swipe-files/clickup-alert-dialog";
import { PdfCapa } from "@/components/swipe-files/pdf-capa";
import { SwipeLightbox } from "@/components/swipe-files/swipe-lightbox";

const KIND_META: Record<AssetKind, { label: string; Icon: typeof Play }> = {
  image: { label: "Imagem", Icon: ImageIcon },
  video: { label: "Vídeo", Icon: Play },
  pdf: { label: "PDF", Icon: FileText },
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

/**
 * Um card da grade.
 *
 * ## A imagem É o card
 *
 * Sem moldura, sem fundo, sem caixa de metadados. Numa biblioteca visual, a
 * borda de cada card compete com o conteúdo dela: trinta retângulos desenhados
 * ao redor de trinta imagens fazem a tela parecer uma planilha. O que reconhece
 * uma referência é a peça em si — o resto é legenda.
 *
 * ## O que fica visível e o que espera o hover
 *
 * Título e marca ficam sempre: é o que se lê ao varrer a grade procurando algo
 * meio lembrado. As tags e o tipo do arquivo aparecem no hover — são úteis
 * quando já se parou num card, e ruído enquanto se está passando o olho.
 *
 * A estrela é a exceção: se já está marcada, fica visível sempre. Um destaque
 * que só aparece quando o mouse chega não destaca nada.
 */
function SwipeCard({
  item,
  onOpen,
  onToggleFavorite,
}: {
  item: SwipeFile;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  // O PDF não vira <img>: o navegador não desenha a primeira página numa tag de
  // imagem. `PdfCapa` renderiza a capa; o lightbox abre o documento de verdade.
  const media =
    item.assetKind === "link" ? item.ogImage : item.assetKind === "pdf" ? null : item.fileUrl;
  const { label, Icon } = KIND_META[item.assetKind];
  // Reserva a proporção conhecida pra o masonry não saltar enquanto carrega.
  const ratio = item.width && item.height ? item.width / item.height : null;

  return (
    <div className="group mb-4 break-inside-avoid">
      <div className="relative overflow-hidden rounded-2xl bg-muted/30">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left"
          aria-label={`Abrir ${item.title}`}
        >
          <div className="relative" style={ratio ? { aspectRatio: String(ratio) } : undefined}>
            {media ? (
              <img
                src={media}
                alt={item.title}
                loading="lazy"
                className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                style={ratio ? { aspectRatio: String(ratio) } : undefined}
              />
            ) : item.assetKind === "pdf" ? (
              // Entra mesmo sem `fileUrl`: o PDF sem link é sintoma de storage
              // mal configurado, e a capa sabe dizer isso. O ícone genérico
              // escondia o problema atrás de algo que parecia normal.
              <PdfCapa url={item.fileUrl} titulo={item.title} tamanhoBytes={item.fileSizeBytes} />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center">
                <Icon className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}

            {/* Escurece no hover para o texto de cima ganhar contraste sobre
                qualquer imagem — inclusive as claras. */}
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

            {item.assetKind === "video" && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
                  <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
                </span>
              </span>
            )}

            {/* Tipo e tags só no hover: quem está varrendo a grade olha as
                peças, não os rótulos. */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                <Icon className="h-2.5 w-2.5" />
                {label}
              </span>
              {item.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm"
                >
                  {t}
                </span>
              ))}
              {item.tags.length > 2 && (
                <span className="text-[10px] text-white/70">+{item.tags.length - 2}</span>
              )}
            </span>
          </div>
        </button>

        {/* Irmã do botão, não filha: um <button> dentro de outro é inválido, e
            o leitor de tela anuncia a ação errada. */}
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={item.isFavorite ? "Remover destaque" : "Destacar"}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-all ${
            item.isFavorite
              ? "bg-primary text-primary-foreground"
              : "bg-black/50 text-white opacity-0 hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Legenda solta, sem caixa. Duas linhas de título porque um nome cortado
          no meio não ajuda a reconhecer nada. */}
      <div className="px-1 pt-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug" title={item.title}>
          {item.title}
        </p>
        {(item.brand || item.platform || item.format) && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {[item.brand, item.platform, item.format].filter(Boolean).join(" · ")}
          </p>
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
  const [avisoOpen, setAvisoOpen] = useState(false);
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAvisoOpen(true)}
            title="Avisar no ClickUp quando entrar referência nova"
            aria-label="Configurar aviso no ClickUp"
          >
            <Bell className="h-4 w-4" />
          </Button>
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nova referência
          </Button>
        </div>
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

          {(["image", "video", "pdf", "link"] as const).map((k) => (
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
        <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
          {/* Alturas variadas de propósito: blocos iguais não parecem a grade
              que vai aparecer, e o salto na troca fica evidente. */}
          {[280, 200, 340, 240, 300, 190, 320, 260, 210, 290, 230, 310].map((h, i) => (
            <Skeleton key={i} className="mb-4 break-inside-avoid rounded-2xl" style={{ height: h }} />
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
          className={`columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 ${
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

      <ClickUpAlertDialog open={avisoOpen} onOpenChange={setAvisoOpen} />

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
