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
  DownloadCloud, HelpCircle, Loader2, Sparkles, ArrowLeft, FolderOpen, LayoutGrid, Bookmark, Code2,
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
  useBuscaPorContexto,
  useSwipesPorIds,
  useSwipeFiles, useUpdateSwipeFile, useDeleteSwipeFile,
  type SwipeFile, type SwipeFilters, type AssetKind, type ColecaoDoSwipe,
} from "@/lib/hooks/use-swipe-files";
import { AddSwipeDialog } from "@/components/swipe-files/add-swipe-dialog";
import { ClickUpAlertDialog } from "@/components/swipe-files/clickup-alert-dialog";
import { ImportarDoClickUp } from "@/components/swipe-files/importar-do-clickup";
import { PdfCapa } from "@/components/swipe-files/pdf-capa";
import { SwipeLightbox } from "@/components/swipe-files/swipe-lightbox";
import { Chip, GrupoDeFiltro } from "@/components/swipe-files/filtros-do-swipe";
import { GradeDeColecoes } from "@/components/swipe-files/colecoes";
import { SalvarEmColecao } from "@/components/swipe-files/salvar-em-colecao";
import { miniaturaDoSwipe } from "@/lib/utils/miniatura-do-swipe";
import { deveBuscarPorContexto } from "@/lib/utils/busca-por-contexto";
import { useTermoEmRepouso } from "@/lib/hooks/use-termo-em-repouso";

/**
 * A explicação de como a biblioteca funciona.
 *
 * Página fora do app, e não uma tela aqui dentro: ela é lida uma vez por
 * pessoa, muda quando as regras de catalogação mudam, e vale para quem ainda
 * nem tem acesso ao Loyola X. Manter isso como rota do app custaria uma tela
 * que quase nunca é aberta.
 */
const COMO_FUNCIONA = "https://claude.ai/code/artifact/04aa2ccd-e6b9-470b-a6f1-5b0c3280004e";

const KIND_META: Record<AssetKind, { label: string; Icon: typeof Play }> = {
  image: { label: "Imagem", Icon: ImageIcon },
  video: { label: "Vídeo", Icon: Play },
  pdf: { label: "PDF", Icon: FileText },
  link: { label: "Link", Icon: Link2 },
  // "Página" e não "HTML": quem salva uma landing page do navegador não pensa
  // no formato do arquivo, pensa na página que quis guardar.
  html: { label: "Página", Icon: Code2 },
};

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
/**
 * A capa de um vídeo: o primeiro quadro dele.
 *
 * `preload="metadata"` faz o navegador buscar só o cabeçalho e desenhar um
 * quadro — alguns quilobytes, não o arquivo inteiro. O `#t=0.1` pede o quadro
 * de um décimo de segundo em vez do zero: muitos vídeos abrem em preto, e uma
 * grade de retângulos pretos não diz o que é cada peça.
 *
 * `muted` e `playsInline` não são decoração: sem eles o iOS assume tela cheia
 * e ignora o pedido de quadro.
 */
function VideoCapa({ url, titulo }: { url: string; titulo: string }) {
  return (
    <video
      src={`${url}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      aria-label={titulo}
      className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

/** Uma cor estável a partir do texto — a mesma referência, sempre igual. */
function corDe(texto: string): string {
  let soma = 0;
  for (const c of texto) soma = (soma * 31 + c.charCodeAt(0)) % 100_000;
  const matiz = soma % 360;
  return `hsl(${matiz} 42% 32%)`;
}

/**
 * A capa de quem não tem imagem nenhuma.
 *
 * Medido no acervo: 85 dos 102 links não têm `og:image` — ou o site não
 * publica, ou é um HTML anexado no ClickUp, servido como texto puro. O
 * fallback anterior era um ícone cinza de 32px no meio de um retângulo vazio:
 * oitenta cards visualmente idênticos, indistinguíveis entre si e parecidos
 * com imagem que falhou ao carregar.
 *
 * Aqui o card mostra o que de fato identifica a referência — o domínio e o
 * título — sobre uma cor derivada dele. Não é bonito por acaso: é o mesmo
 * princípio das iniciais no diretório do time, onde uma silhueta repetida
 * também não distinguia ninguém.
 */
function CapaSemImagem({
  titulo,
  origem,
  Icone,
  rotulo,
}: {
  titulo: string;
  origem: string | null;
  Icone: typeof Play;
  rotulo: string;
}) {
  let dominio: string | null = null;
  try {
    if (origem) dominio = new URL(origem).hostname.replace(/^www\./, "");
  } catch {
    /* origem inválida: fica sem o domínio, que é só um enfeite aqui */
  }
  // O anexo do ClickUp no lugar do domínio não diz nada a ninguém.
  const eDoClickUp = dominio?.includes("clickup") ?? false;

  return (
    <div
      className="flex aspect-[4/5] flex-col justify-between p-3.5 text-white"
      style={{ background: `linear-gradient(150deg, ${corDe(titulo)}, rgba(0,0,0,.55))` }}
    >
      <Icone className="h-4 w-4 opacity-60" />
      <div className="min-w-0">
        <p className="line-clamp-4 text-[13px] font-semibold leading-snug">{titulo}</p>
        <p className="mt-1 truncate text-[10.5px] opacity-70">
          {dominio && !eDoClickUp ? dominio : rotulo}
        </p>
      </div>
    </div>
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
  /**
   * O que vira <img> na capa.
   *
   * A regra vive em `miniaturaDoSwipe` porque o mapa de funil desenha as
   * mesmas peças: PDF e VÍDEO ficam de fora, já que o navegador não desenha
   * nenhum dos dois numa tag de imagem. O vídeo já caiu no `fileUrl` uma vez
   * e virou `<img src="...mp4">` — ícone quebrado em cima de metade da grade.
   * Duas cópias dessa regra é como ela volta.
   */
  const { forma, url: media } = miniaturaDoSwipe(item);
  const ehImagem = forma === "imagem";
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
            {ehImagem && media ? (
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
            ) : item.assetKind === "video" && item.fileUrl ? (
              <VideoCapa url={item.fileUrl} titulo={item.title} />
            ) : (
              <CapaSemImagem
                titulo={item.title}
                origem={item.sourceUrl}
                Icone={Icon}
                rotulo={label}
              />
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
  const [importOpen, setImportOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SwipeFile | null>(null);
  /**
   * A peça aberta a partir da seção "por contexto".
   *
   * Estado próprio porque o lightbox da grade navega por ÍNDICE dentro de
   * `items` — e estas peças, por definição, não estão em `items`: são as que a
   * busca por texto não achou.
   */
  const [pecaPorContexto, setPecaPorContexto] = useState<SwipeFile | null>(null);
  /**
   * Qual das duas views está aberta.
   *
   * "Tudo" é a grade solta — boa para procurar e descobrir. "Coleções" é a
   * organização feita à mão, boa para pousar o olho. São necessidades
   * diferentes, e uma tela só nunca atende as duas bem.
   */
  const [view, setView] = useState<"tudo" | "colecoes">("tudo");
  /** A coleção aberta dentro da view de coleções. */
  const [colecaoAberta, setColecaoAberta] = useState<ColecaoDoSwipe | null>(null);
  /** De qual peça o menu "salvar em" está aberto. */
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useSwipeFiles({
    ...filters,
    // A coleção aberta é um filtro como outro qualquer — assim busca e
    // facetas continuam funcionando DENTRO dela, sem uma segunda tela.
    colecao: colecaoAberta?.id,
  });

  /**
   * A busca por contexto, quando a por texto não deu conta.
   *
   * O termo entra em repouso antes de chegar aqui — sem isso, digitar
   * "escassez" viraria oito chamadas ao modelo, uma por letra.
   */
  const termoParado = useTermoEmRepouso(filters.q ?? "");
  const porContexto = useBuscaPorContexto(
    termoParado,
    deveBuscarPorContexto({
      termo: termoParado,
      achadosPorTexto: data?.items.length ?? 0,
      carregandoTexto: isFetching || isLoading,
    }),
  );
  const idsPorContexto = (porContexto.data?.achados ?? []).map((a) => a.id);
  const { data: pecasPorContexto } = useSwipesPorIds(idsPorContexto);
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
  const total = data?.total ?? 0;
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
          {/* Importar cria centenas de registros numa tacada. Fora da mao de
              quem administra, e um botao para clicar sem querer. */}
          {(role === "admin" || role === "manager") && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setImportOpen(true)}
              title="Importar referencias de um canal do ClickUp"
              aria-label="Importar do ClickUp"
            >
              <DownloadCloud className="h-4 w-4" />
            </Button>
          )}
          {/*
            Como a biblioteca funciona, para o time.

            Fica ao lado dos outros controles e não escondido num menu: quem
            não sabe que a busca entende contexto — ou que plataforma e formato
            são lista fechada — não vai procurar essa explicação. Ela precisa
            estar onde a pessoa já está olhando.
          */}
          <Button
            variant="outline"
            size="icon"
            asChild
            title="Como o Swipe Files indexa e como buscar"
          >
            <a href={COMO_FUNCIONA} target="_blank" rel="noreferrer noopener" aria-label="Como funciona o Swipe Files">
              <HelpCircle className="h-4 w-4" />
            </a>
          </Button>
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

      {/*
        As duas maneiras de olhar a biblioteca.

        A grade solta é boa para procurar e descobrir; a coleção é boa para
        pousar o olho no que já foi separado. São necessidades diferentes, e
        empilhar as duas numa tela só faz a segunda desaparecer.
      */}
      <div className="flex items-center gap-1 border-b border-border/50">
        {([
          ["tudo", "Tudo", LayoutGrid],
          ["colecoes", "Coleções", FolderOpen],
        ] as const).map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            type="button"
            onClick={() => {
              setView(chave);
              setColecaoAberta(null);
            }}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
              view === chave
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icone className="h-3.5 w-3.5" />
            {rotulo}
          </button>
        ))}
      </div>

      {/* A lista de coleções. Abrir uma volta para a grade, filtrada. */}
      {view === "colecoes" && !colecaoAberta && (
        <GradeDeColecoes
          onAbrir={(c) => {
            setColecaoAberta(c);
            // Filtros de antes não se aplicam à coleção recém-aberta: a
            // pessoa clicou nela para ver o que TEM dentro.
            setFilters({});
          }}
        />
      )}

      {colecaoAberta && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[12px]"
            onClick={() => setColecaoAberta(null)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Coleções
          </Button>
          <span className="text-[15px] font-semibold">{colecaoAberta.nome}</span>
          <span className="text-[12px] text-muted-foreground">
            {items.length} {items.length === 1 ? "referência" : "referências"}
          </span>
        </div>
      )}

      {/* Uma linha de filtros acima de tudo que ela recorta. */}
      {(view === "tudo" || colecaoAberta) && (
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

          {(["image", "video", "html", "pdf", "link"] as const).map((k) => (
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

          {/* Quanto o recorte deixou de fora. Sem isso não dá para saber se o
              filtro pegou meia biblioteca ou três itens. */}
          {ativos > 0 && total > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {items.length} de {total}
            </span>
          )}
        </div>

        {/*
          Agrupar por atributo — a "pasta automática".

          Não precisa de tabela nem de manutenção: marca, nicho, plataforma e
          formato já organizam o acervo desde que a peça foi catalogada. É a
          resposta para "o que eu tenho de cada marca?", que nenhuma coleção
          feita à mão daria sem trabalho de arrumação.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Agrupar por</span>
          {([
            ["", "Nada"],
            ["brand", "Marca"],
            ["niche", "Nicho"],
            ["platform", "Plataforma"],
            ["format", "Formato"],
          ] as const).map(([valor, rotulo]) => (
            <Chip
              key={rotulo}
              active={(filters.agruparPor ?? "") === valor}
              onClick={() =>
                setFilters((f) => ({ ...f, agruparPor: valor || undefined }))
              }
            >
              {rotulo}
            </Chip>
          ))}
        </div>

        {showFilters && (
          <div className="space-y-2 rounded-xl border border-border/40 p-3">
            {(
              [
                ["Plataforma", "platform", facets.platform],
                ["Formato", "format", facets.format],
                ["Nicho", "niche", facets.niche],
                ["Marca", "brand", facets.brand],
                ["Tag", "tag", facets.tags],
              ] as const
            ).map(([label, key, opts]) => (
              <GrupoDeFiltro
                key={key}
                rotulo={label}
                opcoes={opts}
                ativo={filters[key]}
                onEscolher={(v) => set(key, v)}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Galeria. Durante refiltro mantém o render anterior em opacidade
          reduzida — sem skeleton piscando e sem salto de layout. */}
      {(view === "tudo" || colecaoAberta) && (
      <>
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
      ) : data?.grupos ? (
        /*
          Agrupado por atributo. Cada grupo é uma faixa com seu próprio
          cabeçalho e contagem — o que transforma a grade solta numa tela que
          se lê de cima para baixo, sem precisar de coleção nenhuma.
        */
        <div className={`space-y-6 ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
          {data.grupos.map((g) => {
            const doGrupo = g.ids
              .map((id) => items.find((i) => i.id === id))
              .filter((i): i is SwipeFile => !!i);
            if (doGrupo.length === 0) return null;
            return (
              <div key={g.valor ?? "__sem__"} className="space-y-2">
                <div className="flex items-baseline gap-2 border-b border-border/50 pb-1">
                  <h2 className="text-[14px] font-semibold">
                    {/* Sem valor no campo não é um grupo qualquer: é a fila do
                        que ainda precisa ser catalogado, e some-la esconderia
                        parte do acervo de quem escolheu agrupar. */}
                    {g.valor ?? "Sem esse dado"}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {doGrupo.length}
                  </span>
                </div>
                <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
                  {doGrupo.map((item) => (
                    <SwipeCard
                      key={item.id}
                      item={item}
                      onOpen={() => setLightboxIndex(items.indexOf(item))}
                      onToggleFavorite={() =>
                        updateItem.mutate({ id: item.id, input: { isFavorite: !item.isFavorite } })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
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

      {/*
        Encontradas por CONTEXTO.

        Seção separada, e não misturada na grade: são peças que a busca por
        texto não achou, e a pessoa precisa saber por que elas apareceram —
        daí o motivo em cada card. Diluídas entre as outras, pareceriam ruído
        de uma busca que trouxe coisa demais.
      */}
      {porContexto.isFetching && (
        <p className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Procurando por contexto — pelo que as peças <em>são</em>, não pela palavra…
        </p>
      )}

      {!porContexto.isFetching && (porContexto.data?.achados.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Encontradas por contexto
            <span className="font-normal text-muted-foreground">
              — não têm a palavra “{termoParado}”, mas respondem a ela
            </span>
          </p>
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
            {(porContexto.data?.achados ?? []).map((achado) => {
              const peca = (pecasPorContexto?.items ?? []).find((p) => p.id === achado.id);
              if (!peca) return null;
              return (
                <div key={peca.id} className="mb-4 break-inside-avoid">
                  <SwipeCard
                    item={peca}
                    onOpen={() => setPecaPorContexto(peca)}
                    onToggleFavorite={() =>
                      updateItem.mutate({ id: peca.id, input: { isFavorite: !peca.isFavorite } })
                    }
                  />
                  {/* O motivo é o que torna o resultado confiável: sem ele a
                      peça aparece sem explicação e parece engano da máquina. */}
                  <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
                    {achado.motivo}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {items.length} referência{items.length !== 1 ? "s" : ""}
          {items.length === 300 ? " (mostrando as 300 mais recentes)" : ""}
        </p>
      )}

      <ClickUpAlertDialog open={avisoOpen} onOpenChange={setAvisoOpen} />
      <ImportarDoClickUp open={importOpen} onOpenChange={setImportOpen} />

      </>
      )}

      <AddSwipeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        facets={facets}
        storageReady={data?.storageReady ?? false}
      />

      {/*
        "Salvar em…" fica fora do lightbox, flutuando por cima dele.

        Dentro, ele disputaria espaço com Destacar, Baixar e Excluir numa
        linha que já está cheia — e o menu precisa abrir por cima do overlay,
        que é o elemento mais alto da tela.
      */}
      {salvando && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setSalvando(null)} />
          <div className="fixed left-1/2 top-1/2 z-[71] -translate-x-1/2 -translate-y-1/2">
            <SalvarEmColecao swipeIds={[salvando]} onFechar={() => setSalvando(null)} />
          </div>
        </>
      )}

      {lightboxIndex !== null && (
        <>
        <button
          type="button"
          onClick={() => setSalvando(items[lightboxIndex]?.id ?? null)}
          className="fixed bottom-5 left-1/2 z-[65] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3.5 py-2 text-[12px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/85"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Salvar em coleção
        </button>
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
        </>
      )}

      {/* Uma peça achada por contexto: lista de uma só, porque ela não está na
          grade e não há por onde navegar a partir dela. */}
      {pecaPorContexto && (
        <SwipeLightbox
          items={[pecaPorContexto]}
          index={0}
          onClose={() => setPecaPorContexto(null)}
          onNavigate={() => {}}
          onToggleFavorite={(item) =>
            updateItem.mutate({ id: item.id, input: { isFavorite: !item.isFavorite } })
          }
          onDelete={(item) => {
            setPecaPorContexto(null);
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
