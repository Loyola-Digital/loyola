"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Maximize2,
  AlertTriangle,
  ImageOff,
  Instagram,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTopPerformers,
  useVideoSource,
  type MetaAdCreative,
} from "@/lib/hooks/use-traffic-analytics";
// Story 29.66: cascata e rótulo vêm do módulo (é o que o runner de teste
// enxerga). O hook reexporta a cascata, mas importar da fonte deixa claro de
// onde ela vem.
import { creativePermalink, rotuloDoPermalink } from "@/lib/utils/creative-permalink";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import { MetricTooltip } from "@/components/metrics/metric-tooltip";
import {
  buildFunnelSpendFormula,
  buildFunnelCtrFormula,
  buildFunnelCplFormula,
  enrichFormulaForEntity,
} from "@/lib/formulas/funnels";
import type { MetricFormula } from "@/lib/types/metric-formula";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import { PISO_DE_REPRODUCOES } from "@loyola-x/shared/src/video-camadas";
import {
  aggregateCreativesByName,
  aggregateCreativesByAd,
  enrichWithPaidLeads,
  mergeSurveyForGroup,
  mergeSurveyDynamicForGroup,
  computeRelevanceThreshold,
  applyRelevanceFilter,
  type AggregatedCreative,
} from "@/lib/utils/top-creatives";
import type {
  SurveyDataByAdId,
  SurveyDataByAdIdDynamic,
  SurveyQuestionMeta,
} from "@/lib/hooks/use-survey-aggregation";
import { useCreativeRevenue } from "@/lib/hooks/use-creative-revenue";
import { useStageCreativePerformance } from "@/lib/hooks/useStageCreativePerformance";
import {
  conversaoDoCriativo,
  custoPorConversao,
  motivoSemConversao,
  vendasDeduzidas,
  ingressosDoGrupo,
} from "@/lib/utils/conversao-do-criativo";
import {
  VISOES,
  VISAO_INICIAL,
  visaoPorId,
  presetModificado,
  chipsDeFiltro,
  limparCampo,
  aplicarBuscaEMidia,
  roasDoCriativo,
  ordenarPorMetrica,
  chaveDoCriativo,
  presetEfetivo,
  type FiltrosDaGaleria,
  type MetricaDeOrdenacao,
} from "@/lib/utils/top-criativos-visoes";
import {
  CATEGORIAS,
  METRICAS,
  metricasPadrao,
  contarPorCategoria,
  contarMarcadas,
  buscarMetricas,
  categoriasIndisponiveis,
  valorDaMetrica,
  maximosPorMetrica,
  larguraDaBarra,
  corDaBarra,
  type CategoriaId,
  type ContextoDeMetrica,
} from "@/lib/utils/metricas-do-criativo";
import { useDriveCreatives } from "@/lib/hooks/use-drive-creatives";
import { fmtCurrency as fmtCurrencyCompleto, fmtInt } from "@/lib/utils/format-number";

// ============================================================
// Tipos locais e formatters
// ============================================================

/**
 * Story 18.74: a lista de ordenações continua completa aqui — inclusive as que
 * NÃO viraram aba (`CPL Qual`, `Leads`). Elas seguem alcançáveis pelo controle
 * de ordenação da barra de ferramentas: uma aba a menos não pode significar uma
 * leitura a menos.
 */
interface MetricOption {
  value: MetricaDeOrdenacao;
  label: string;
  sortLabel: string;
  needsReview?: boolean;
}

const METRIC_OPTIONS: MetricOption[] = [
  { value: "cpl", label: "CPL", sortLabel: "Menor CPL" },
  { value: "cplQualified", label: "CPL Qual", sortLabel: "Menor CPL Qualificado", needsReview: true },
  { value: "leads", label: "Leads", sortLabel: "Mais Leads" },
  { value: "ctr", label: "CTR", sortLabel: "Maior CTR" },
  { value: "spend", label: "Investimento", sortLabel: "Maior Investimento" },
  // Story 29.65: gancho do vídeo. Ordena DESC e só entram criativos com a
  // métrica — ver `sortByMetric` e o aviso de omitidos.
  { value: "hook", label: "Hook", sortLabel: "Melhores Hooks" },
  // Story 18.74 (AC4): faturamento da planilha ÷ investimento — nunca o
  // `roasLegacy` do pixel, que é outro número com o mesmo nome.
  { value: "roas", label: "ROAS", sortLabel: "Maiores ROAS" },
  // Story 18.79 (AC6): comprador dedupado da planilha (`vendasDeduzidas`), não
  // o `sales` do pixel — ver o comentário do tipo em `top-criativos-visoes.ts`.
  { value: "vendas", label: "Vendas", sortLabel: "Mais Vendas" },
];

/**
 * Story 29.65 (AC5) — mesma meta de cor da coluna "Hook" do Detalhamento
 * (`perpetual-dashboard.tsx`) e da Captação (18.65). Duas telas com o mesmo
 * nome de métrica e faixas de cor diferentes é como se perde a confiança no
 * painel inteiro.
 */
const META_HOOK_VERDE = 25;

function hookColorClass(val: number | null): string {
  if (val === null) return "text-muted-foreground";
  return val >= META_HOOK_VERDE ? "text-emerald-500" : "text-foreground";
}

// Story 18.73: valor e contagem completos, sem K/M e com centavos.
// Ver `lib/utils/format-number`.
const fmtCurrency = fmtCurrencyCompleto;
const fmtNumber = fmtInt;

function fmtPercent(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)}%`;
}

function creativeImgSrc(c: MetaAdCreative | null): string {
  return c?.imageUrl || c?.thumbnailUrl || "";
}

/**
 * Imagem do card: DRIVE primeiro, Meta como reserva.
 *
 * O preview da Meta expira quando a campanha é desligada — e é aí que alguém
 * vai olhar o histórico. Se o Drive não tiver o arquivo (ou estiver sem
 * acesso), cai na Meta e ninguém fica sem imagem.
 */
function srcDoCriativo(
  c: MetaAdCreative | null,
  nome: string | null | undefined,
  doDrive: (n: string | null | undefined) => { url: string } | null,
): string {
  return doDrive(nome)?.url || creativeImgSrc(c);
}

/**
 * De onde a imagem veio, pra tooltip.
 *
 * Sem isto, "carregou o criativo errado" vira investigação: não dá pra saber se
 * veio do Drive ou da Meta, nem de qual pasta.
 */
function origemDoCriativo(
  nome: string | null | undefined,
  doDrive: (n: string | null | undefined) => { pasta: string; editada: boolean } | null,
): string {
  const d = doDrive(nome);
  if (!d) return "Preview da Meta (sem arquivo correspondente no Drive)";
  return `Drive · ${d.pasta}`;
}

/** True quando não há imageUrl HD e estamos caindo em thumbnail_url low-res. */
function isLowResFallback(c: MetaAdCreative | null): boolean {
  return !c?.imageUrl && !!c?.thumbnailUrl;
}

/**
 * Thumbnail resiliente a URLs do Meta Ads que já expiraram/404. Se a imagem
 * falha ao carregar, renderiza um placeholder com ícone em vez de um quadrado
 * quebrado. Usa `key={src}` pra re-tentar quando a URL muda entre itens.
 *
 * Story 21.7 follow-up: quando só há thumbnail (low-res do Meta, ~128px),
 * renderiza a versão com `image-rendering: auto` e blur sutil pra disfarçar
 * a pixelização em vez de esticar áspero.
 */
function CreativeThumbnail({
  title,
  src,
  alt,
  className,
  isLowRes = false,
}: {
  src: string;
  alt: string;
  className: string;
  isLowRes?: boolean;
  /** Tooltip de origem (Drive + pasta, ou Meta). */
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  // Reset fallback quando a src muda (ex: lightbox navegando entre itens)
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    // Story 28.2: placeholder com contraste explícito (antes ficava preto chapado
    // em dark mode porque `bg-muted/30` empilhado no parent + ícone /40 opacity).
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-1 bg-muted/70 text-muted-foreground`}>
        <ImageOff className="h-8 w-8" />
        <span className="text-[10px] font-medium">Sem preview</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      className={className}
      onError={() => setFailed(true)}
      style={isLowRes ? { imageRendering: "auto", filter: "blur(1.5px)" } : undefined}
    />
  );
}

/**
 * Story 28.2: heurística de emoji por questionKey/label da pesquisa. Mantém
 * os ícones familiares pras 4 perguntas legacy (faturamento/profissao/etc) e
 * usa um genérico pra qualquer pergunta custom configurada via mapping.
 */
function emojiForQuestion(key: string, label: string): string {
  const haystack = `${key} ${label}`.toLowerCase();
  if (/fatur|renda|receita|mensal/.test(haystack)) return "💰";
  if (/profiss[aã]o|cargo|trabalh/.test(haystack)) return "👤";
  if (/func[ií]on|equipe|colaborad|time|tamanho/.test(haystack)) return "👥";
  if (/voc[eê]\s*[eé]|perfil|segment|categori/.test(haystack)) return "📋";
  if (/cidade|estado|local|regi[aã]o/.test(haystack)) return "📍";
  if (/idade|anos/.test(haystack)) return "🎂";
  return "📊";
}

/**
 * Story 28.2: renderiza o bloco de pesquisa de um card. Prefere o caminho
 * dinâmico (questions[] + byAdIdDynamic) e cai pro legacy 4-keys quando só
 * `surveyDataByAdId` está disponível. Limita a 5 linhas pra não estourar o card.
 */
const MAX_SURVEY_LINES_PER_CARD = 5;

function renderSurveyBlock(
  c: AggregatedCreative,
  dynamic: SurveyDataByAdIdDynamic | undefined,
  questions: SurveyQuestionMeta[] | undefined,
  legacy: SurveyDataByAdId | undefined,
) {
  const hasDynamic = !!(dynamic && questions && questions.length > 0);

  if (hasDynamic) {
    const keys = questions!.map((q) => q.key);
    const merged = mergeSurveyDynamicForGroup(dynamic, keys, c.ids, c.leadsPagos);
    const lines = questions!
      .map((q) => ({ meta: q, top: merged[q.key] }))
      .filter((x) => x.top && x.top.total > 0 && x.top.count > 0);

    if (lines.length === 0) {
      return (
        <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/20">
          — Sem dados de pesquisa
        </p>
      );
    }

    return (
      <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/20">
        {lines.slice(0, MAX_SURVEY_LINES_PER_CARD).map(({ meta, top }) => {
          const t = top!;
          const pct = ((t.count / t.total) * 100).toFixed(2);
          const titleDetail = `${meta.label}: ${t.label} · ${t.count} de ${t.total} leads (${pct}%) — baseado em ${t.totalResponses} ${t.totalResponses === 1 ? "resposta" : "respostas"}`;
          return (
            <p key={meta.key} className="truncate" title={titleDetail}>
              {emojiForQuestion(meta.key, meta.label)} <span className="font-medium">{t.label}</span>
              <span className="text-muted-foreground/70"> · {t.count}/{t.total} ({pct}%)</span>
            </p>
          );
        })}
      </div>
    );
  }

  // Fallback legacy (pesquisas sem mapping configurado)
  if (!legacy) return null;
  const survey = mergeSurveyForGroup(legacy, c.ids, c.leadsPagos);
  if (
    !survey.faturamento &&
    !survey.profissao &&
    !survey.funcionarios &&
    !survey.voce_e
  ) {
    return (
      <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/20">
        — Sem dados de pesquisa
      </p>
    );
  }
  function line(emoji: string, top: typeof survey.faturamento) {
    if (!top || top.total === 0) return null;
    const pct = ((top.count / top.total) * 100).toFixed(2);
    const titleDetail = `${top.label} · ${top.count} de ${top.total} leads (${pct}%) — baseado em ${top.totalResponses} ${top.totalResponses === 1 ? "resposta" : "respostas"} da pesquisa`;
    return (
      <p className="truncate" title={titleDetail}>
        {emoji} <span className="font-medium">{top.label}</span>
        <span className="text-muted-foreground/70"> · {top.count}/{top.total} ({pct}%)</span>
      </p>
    );
  }
  return (
    <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/20">
      {line("💰", survey.faturamento)}
      {line("👤", survey.profissao)}
      {line("👥", survey.funcionarios)}
      {line("📋", survey.voce_e)}
    </div>
  );
}

/** Story 18.76: formata pelo tipo da métrica. `null` sempre vira `—`. */
function formatarValorDaMetrica(
  formato: "moeda" | "numero" | "percentual" | "multiplicador",
  valor: number | null,
): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  switch (formato) {
    case "moeda":
      return fmtCurrency(valor);
    case "numero":
      return fmtNumber(valor);
    case "percentual":
      return fmtPercent(valor);
    case "multiplicador":
      return `${valor.toFixed(2)}x`;
  }
}

function formatMetricValue(
  c: AggregatedCreative,
  metric: MetricaDeOrdenacao,
  /** Story 18.74: só a ordenação por ROAS precisa do cruzamento. */
  roasPorChave?: Map<string, number | null>,
  chave?: string,
  /** Story 18.79 (AC6): idem para vendas — mesmo cruzamento, mesma chave. */
  vendasPorChave?: Map<string, number | null>,
): string {
  switch (metric) {
    case "cpl":
      return fmtCurrency(c.cplPago);
    case "cplQualified":
      return fmtCurrency(c.cplQualified);
    case "leads":
      return fmtNumber(c.leadsPagos);
    case "ctr":
      return fmtPercent(c.ctr);
    case "spend":
      return fmtCurrency(c.spend);
    case "roas": {
      const r = roasPorChave?.get(chave ?? c.name);
      // `null` = sem investimento ou sem faturamento atribuído. `0` é medição.
      return r == null ? "—" : `${r.toFixed(2)}x`;
    }
    case "vendas": {
      // Story 18.79 (AC6). Sem o cruzamento o valor é `undefined`/`null` e sai
      // `—`; zero é medição e é impresso como 0.
      const v = vendasPorChave?.get(chave ?? c.name);
      return v == null ? "—" : fmtNumber(v);
    }
    default:
      return "—";
  }
}

/**
 * Ordena criativos pela métrica selecionada.
 * - cpl / cplQualified: ASC (menor = melhor); null vai pro final
 * - leads / ctr / spend: DESC (maior = melhor)
 */
// ============================================================
// LIGHTBOX
// ============================================================

interface LightboxItem {
  id: string;
  name: string;
  creative: MetaAdCreative | null;
  spend: number;
  impressions: number;
  clicks: number;
  /** CTR de link (decisão do gestor, 2026-09-03). `null` = métrica ausente. */
  ctr: number | null;
  cplPago: number | null;
  parentInfo?: string;
}

function CreativeLightbox({
  items,
  initialIndex,
  projectId,
  onClose,
  funnelContext,
  criativoDoDrive,
}: {
  items: LightboxItem[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
  funnelContext?: { days: number; funnelType?: "launch" | "perpetual" | "mobile"; funnelName?: string };
  criativoDoDrive: (n: string | null | undefined) => { url: string } | null;
}) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index];
  const isVideo = item.creative?.objectType === "VIDEO";

  const { data: videoData } = useVideoSource(
    isVideo ? projectId : null,
    isVideo ? (item.creative?.videoId ?? null) : null,
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + items.length) % items.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % items.length);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items.length, onClose]);

  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);
  const next = () => setIndex((i) => (i + 1) % items.length);

  const funnel = funnelContext ?? { days: 30 };
  const path = { ad: item.name };
  const spendFormula = enrichFormulaForEntity(
    buildFunnelSpendFormula(item.spend, funnel),
    path,
  );
  const ctrFormula = enrichFormulaForEntity(
    buildFunnelCtrFormula(item.ctr, funnel),
    path,
  );
  const cplFormula = item.cplPago != null
    ? enrichFormulaForEntity(buildFunnelCplFormula(item.spend, item.clicks > 0 ? item.clicks : 0, funnel, "pago"), path)
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-3xl w-full m-4 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {item.creative?.objectType === "VIDEO"
                ? "Video"
                : item.creative?.objectType === "CAROUSEL"
                  ? "Carousel"
                  : "Imagem"}
            </Badge>
            <span className="text-sm font-medium truncate">{item.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {index + 1} / {items.length}
            </span>
            <a
              href={srcDoCriativo(item.creative, item.name, criativoDoDrive)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Abrir imagem original"
              onClick={(e) => e.stopPropagation()}
            >
              <Maximize2 className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative bg-black min-h-[300px] max-h-[60vh] flex items-center justify-center overflow-hidden">
          {isVideo && videoData?.sourceUrl ? (
            <video
              key={videoData.sourceUrl}
              src={videoData.sourceUrl}
              controls
              autoPlay
              className="w-full max-h-[60vh] object-contain"
              poster={srcDoCriativo(item.creative, item.name, criativoDoDrive)}
            />
          ) : isVideo && videoData?.embedHtml ? (
            <iframe
              src={(() => {
                const match = videoData.embedHtml.match(/src="([^"]+)"/);
                return match ? match[1].replace(/&amp;/g, "&") + "&autoplay=1" : "";
              })()}
              className="w-full h-[60vh] border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          /* Story 29.66 (AC2/AC5) — o link do POST vem do criativo, não do
               vídeo. `videoData.permalinkUrl` é o permalink do VÍDEO no
               Facebook (rota `/video-source`, que só conhece o `videoId` e não
               sabe de que anúncio ele é). O criativo é quem carrega o post
               publicado, e é ele que o gestor reconhece.
               O permalink do vídeo fica como última reserva: melhor levar ao
               vídeo no Facebook do que não oferecer nada. O botão some por
               completo quando não há nenhum dos três. */
            ) : isVideo && (creativePermalink(item.creative) || videoData?.permalinkUrl) ? (
            <div className="text-center p-8">
              <CreativeThumbnail
                src={srcDoCriativo(item.creative, item.name, criativoDoDrive) || videoData?.picture || ""}
                alt={item.name}
                className="max-h-[40vh] object-contain mx-auto rounded-lg mb-4"
              />
              <a
                href={(creativePermalink(item.creative) || videoData?.permalinkUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Play className="h-4 w-4" /> {rotuloDoPermalink(creativePermalink(item.creative) || videoData?.permalinkUrl)}
              </a>
            </div>
          ) : !isVideo ? (
            <CreativeThumbnail
              src={srcDoCriativo(item.creative, item.name, criativoDoDrive)}
              alt={item.name}
              className="w-full max-h-[60vh] object-contain"
            />
          ) : (
            <div className="flex items-center justify-center p-8">
              <Play className="h-10 w-10 text-white opacity-60" />
            </div>
          )}

          {isVideo && !videoData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Play className="h-10 w-10 mx-auto mb-2 opacity-60" />
                <p className="text-xs opacity-80">Carregando vídeo...</p>
              </div>
            </div>
          )}

          {items.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 p-2 text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <div className="p-4 space-y-3 shrink-0 overflow-y-auto">
          {(() => {
            const cells: Array<{
              label: string;
              value: string;
              formula: MetricFormula | undefined;
            }> = [
              { label: "Investimento", value: fmtCurrency(item.spend), formula: spendFormula },
              { label: "Impressões", value: fmtNumber(item.impressions), formula: undefined },
              { label: "Cliques", value: fmtNumber(item.clicks), formula: undefined },
              { label: "CTR", value: fmtPercent(item.ctr), formula: ctrFormula },
              { label: "CPL Pago", value: fmtCurrency(item.cplPago), formula: cplFormula },
            ];
            return (
              <div className="grid grid-cols-5 gap-3">
                {cells.map((m) => (
                  <MetricTooltip key={m.label} label={m.label} value={m.value} formula={m.formula}>
                    <div className="text-center cursor-help">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p
                        className={`text-sm font-semibold ${m.formula ? "underline decoration-dotted decoration-muted-foreground/40 underline-offset-4" : ""}`}
                      >
                        {m.value}
                      </p>
                    </div>
                  </MetricTooltip>
                ))}
              </div>
            );
          })()}

          {item.creative?.title && <p className="text-sm font-medium">{item.creative.title}</p>}
          {item.creative?.body && (
            <p className="text-xs text-muted-foreground line-clamp-3">{item.creative.body}</p>
          )}

          {/* Story 29.63 (AC5): dois links que respondem a perguntas diferentes
              — "que peça é essa" (o post) e "para onde ela manda" (a LP). Ficam
              visualmente distintos de propósito: dois links iguais lado a lado
              abrindo coisas diferentes é o defeito que esta story corrigiu. */}
          <div className="flex flex-col gap-1">
            {creativePermalink(item.creative) && (
              <a
                href={creativePermalink(item.creative)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                title={creativePermalink(item.creative)!}
              >
                <Instagram className="h-3 w-3 shrink-0" />
                Ver criativo publicado
              </a>
            )}

            {item.creative?.linkUrl && (
              <a
                href={item.creative.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline truncate max-w-full"
                title={`Destino do clique: ${item.creative.linkUrl}`}
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {(() => {
                  try {
                    const u = new URL(item.creative!.linkUrl!);
                    return (
                      u.hostname +
                      (u.pathname.length > 1 ? u.pathname.split("/").slice(0, 3).join("/") : "")
                    );
                  } catch {
                    return item.creative!.linkUrl;
                  }
                })()}
              </a>
            )}
          </div>

          {item.parentInfo && (
            <p className="text-[10px] text-muted-foreground">{item.parentInfo}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GALLERY
// ============================================================

interface TopCreativesGalleryProps {
  projectId: string;
  days: number;
  campaignIds?: string[];
  funnelId?: string;
  /**
   * Stage atual (Story 21.7) — quando presente, ativa o hook
   * `useCreativeRevenue` que cruza planilha de leads × vendas e exibe
   * o faturamento real por criativo nos cards.
   */
  stageId?: string;
  /**
   * Story 18.75 (AC3): tipo da etapa (`paid`, `event_capture`, `free`, …).
   * É o que permite ao card distinguir ingresso de lead — as duas telas de
   * lançamento já o têm em mãos e passam adiante. O Perpétuo não passa nada:
   * ele se identifica por `funnelContext.funnelType`. Ausente = leads, o
   * comportamento de antes desta story.
   */
  stageType?: string | null;
  funnelContext?: {
    days: number;
    funnelType?: "launch" | "perpetual" | "mobile";
    funnelName?: string;
  };
  /**
   * Dados da pesquisa agregados por ad_id (Story 18.6 — legacy).
   * Mantido por retrocompat com pesquisas sem `columnMapping` configurado.
   * Story 28.2: prefira `surveyDataByAdIdDynamic` + `surveyQuestions`.
   */
  surveyDataByAdId?: SurveyDataByAdId;
  /**
   * Story 28.2: respostas dinâmicas por ad_id, indexadas pela questionKey do
   * mapping. Quando combinado com `surveyQuestions`, a galeria renderiza N
   * linhas custom em vez das 4 perguntas hardcoded legacy.
   */
  surveyDataByAdIdDynamic?: SurveyDataByAdIdDynamic;
  /**
   * Story 28.2: lista de perguntas com `showInDashboard: true` do mapping.
   * Vem direto de `useSurveyAggregation().questions`.
   */
  surveyQuestions?: SurveyQuestionMeta[];
  /**
   * Story 29.8 ext: pra perpetuals, vendas reais vem da PLANILHA não do Pixel.
   * Filtro de relevância (Story 8.9) usa CPA derivado do Pixel — fica
   * artificialmente alto e esconde quase todos os criativos. Passar `true`
   * desabilita o filtro por padrão (user pode toggle no UI se quiser).
   */
  defaultShowAll?: boolean;
  /** Story 29.8 ext: custom range no passado (ex: abril) propaga pro ranking */
  startDate?: string;
  endDate?: string;
}

export function TopCreativesGallery({
  projectId,
  days,
  campaignIds,
  funnelId,
  stageId,
  stageType,
  funnelContext,
  surveyDataByAdId,
  surveyDataByAdIdDynamic,
  surveyQuestions,
  defaultShowAll = false,
  startDate,
  endDate,
}: TopCreativesGalleryProps) {
  // Story 18.74 — a aba é um preset inteiro (ordenação + filtros + agrupamento);
  // `filtros` é o estado vivo, que a barra de ferramentas altera sem reescrever
  // o preset. `metric` e `showAll` continuam existindo como derivações para que
  // o resto do arquivo (avisos da 8.9 e da 29.65) siga funcionando igual.
  const [visaoId, setVisaoId] = useState<string>(VISAO_INICIAL);
  const visao = visaoPorId(visaoId);
  // Story 29.8: o Perpétuo abre sem o filtro de relevância (o CPA do Pixel fica
  // alto demais e esconde quase tudo). O preset da aba absorve esse default —
  // senão a aba nasceria marcada como modificada sem ninguém ter tocado nela.
  const [filtros, setFiltros] = useState<FiltrosDaGaleria>(() =>
    presetEfetivo(visaoPorId(VISAO_INICIAL), defaultShowAll),
  );
  const metric: MetricaDeOrdenacao = filtros.metrica;
  const showAll = filtros.incluirBaixoGasto;
  const presetDaAba = presetEfetivo(visao, defaultShowAll);
  const abaModificada = presetModificado(filtros, presetDaAba);
  const chips = chipsDeFiltro(filtros);

  /** Troca de aba: aplica o preset inteiro de uma vez (AC2). */
  const aplicarVisao = (id: string) => {
    setVisaoId(id);
    setFiltros(presetEfetivo(visaoPorId(id), defaultShowAll));
  };

  // Story 18.76 — painel de métricas.
  const [metricasMarcadas, setMetricasMarcadas] = useState<string[]>(() => metricasPadrao());
  const [painelAberto, setPainelAberto] = useState(false);
  const [buscaMetrica, setBuscaMetrica] = useState("");
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<CategoriaId>>(
    () => new Set(CATEGORIAS.filter((k) => !k.colapsadaPorPadrao).map((k) => k.id)),
  );

  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Criativos do Drive: substituem o preview da Meta quando existem.
  const { urlDoAnuncio: criativoDoDrive } = useDriveCreatives(projectId, funnelId, stageId);
  // Story 8.9: filtro de relevância estatística. Default OFF = filtro ATIVO
  // (esconde criativos sem volume estatístico). Não persiste entre sessões —
  // o threshold é dinâmico por período, persistir confundiria.
  // Story 29.8 ext: perpetuals desabilitam por default (vendas vem da planilha,
  // não do Pixel — CPA do Pixel é underreported e o threshold fica abusivo).
  /** Compat: o toggle da 8.9 agora escreve no campo do preset. */
  const setShowAll = (v: boolean | ((prev: boolean) => boolean)) =>
    setFiltros((f) => ({
      ...f,
      incluirBaixoGasto: typeof v === "function" ? v(f.incluirBaixoGasto) : v,
    }));

  // Story 21.7 — faturamento real por criativo (cruzamento leads × vendas).
  // Só ativa quando temos funnelId+stageId; hook é no-op (`enabled: false`)
  // caso contrário, então overhead zero nos dashboards que não passam stageId.
  const { data: revenueData } = useCreativeRevenue(
    projectId,
    funnelId ?? null,
    stageId ?? null,
    days,
    // Story 18.75 (AC9): o Perpétuo abre com range custom. Sem propagar, o card
    // somava vendas de uma janela ao lado do investimento de outra — e as duas
    // pareciam a mesma coisa.
    startDate,
    endDate,
  );

  // ============================================================
  // Story 18.75 — a unidade de conversão do card
  // ============================================================

  /** Vendas, ingressos ou leads — decidido pela tela, não pelo card. */
  const conv = useMemo(
    () => conversaoDoCriativo(funnelContext?.funnelType, stageType),
    [funnelContext?.funnelType, stageType],
  );

  /**
   * Ingressos por anúncio (Captação Paga). Vem da MESMA rota que alimenta a
   * tabela de Desempenho de Criativos (18.55) — se os dois números divergirem
   * na mesma tela, é defeito, não duas leituras válidas.
   *
   * Só liga na etapa paga: nas outras o hook fica desabilitado e não custa
   * requisição alguma.
   */
  const { data: ingressosData } = useStageCreativePerformance({
    projectId,
    funnelId: funnelId ?? "",
    stageId: stageId ?? "",
    days,
    enabled: conv.unidade === "ingressos" && !!funnelId && !!stageId,
  });

  /** Ingressos únicos por `ad_id`, para casar com os `ids` do grupo agregado. */
  const ingressosPorAdId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ingressosData?.creatives ?? []) {
      if (c.adId && c.ingressosUnicos != null) {
        m.set(c.adId, (m.get(c.adId) ?? 0) + c.ingressosUnicos);
      }
    }
    return m;
  }, [ingressosData]);


  const brlFormatter = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    [],
  );

  // Hotfix pos-Story 8.9: buscamos por SPEND desc em vez de CTR. Rationale: o
  // filtro de relevancia estatistica trabalha sobre spend, e o ranking por CTR
  // favorecia criativos pequenos com CTR anomalo, deixando grandes spenders
  // fora do payload.
  //
  // Story 18.78 (AC1): 100 → 500. As metricas do card sao SOMATORIOS do grupo,
  // entao um Ad Name com anuncios fora do corte somava menos aqui do que na
  // tabela que le todos — 14 de 28 grupos do bbe-pr2 (171 anuncios) tinham Hold
  // Rate divergente, e o perpetuo do BBE estava a 2 anuncios de entrar na
  // mesma faixa. O que protege o rate limit e o `CREATIVE_FETCH_LIMIT` do
  // backend, que segue em 100: alem dele o anuncio vem sem miniatura, mas com
  // os numeros.
  const { data, isLoading } = useTopPerformers(
    projectId,
    "spend" as const,
    500,
    days,
    campaignIds && campaignIds.length > 0 ? campaignIds : null,
    startDate,
    endDate,
  );

  const { data: spreadsheetsData } = useFunnelSpreadsheets(projectId, funnelId ?? "", stageId ?? null);
  const linkedSheet = useMemo(() => {
    if (!spreadsheetsData?.spreadsheets) return null;
    return (
      spreadsheetsData.spreadsheets.find((s) => s.type === "leads") ??
      spreadsheetsData.spreadsheets[0] ??
      null
    );
  }, [spreadsheetsData]);
  const { data: sheetData } = useFunnelSpreadsheetData(
    projectId,
    funnelId ?? "",
    linkedSheet?.id,
  );

  /**
   * A fonte da conversão está ligada? Distingue "não configurado" de "nenhuma
   * conversão no período" — as duas viram `—` na tela, e pedem ações
   * diferentes (AC5).
   */
  const temFonteDeConversao = useMemo(() => {
    if (conv.unidade === "vendas") return !!revenueData && !revenueData.semDados;
    if (conv.unidade === "ingressos") return !!ingressosData?.creatives?.length;
    return !!sheetData;
  }, [conv.unidade, revenueData, ingressosData, sheetData]);

  const aggregated = useMemo<AggregatedCreative[]>(() => {
    if (!data) return [];
    // Story 18.74 (AC3): a aba "Todos" muda a UNIDADE da lista — um card por
    // anúncio em vez de um por nome. Não é só outra ordenação.
    const agg =
      filtros.agrupamento === "anuncio"
        ? aggregateCreativesByAd(data.topPerformers)
        : aggregateCreativesByName(data.topPerformers);
    if (!sheetData) return agg;
    const filtered = filterSheetRowsByDays(sheetData, days);
    const utmContentMapped = !!sheetData.mapping.utm_content;
    const utmSourceMapped = !!sheetData.mapping.utm_source;
    return enrichWithPaidLeads(agg, filtered, utmContentMapped, utmSourceMapped);
  }, [data, sheetData, days, filtros.agrupamento]);

  /**
   * Story 18.74 (AC4) — ROAS por criativo, a partir do faturamento REAL da
   * planilha (o mesmo que o card imprime), nunca do ROAS do pixel. Ordenar por
   * um e exibir o outro é como o ranking passa a discordar do card.
   */
  const roasPorChave = useMemo(() => {
    const m = new Map<string, number | null>();
    if (!revenueData || revenueData.semDados) return m;
    for (const c of aggregated) {
      const { bruto } = vendasDeduzidas(c.ids, revenueData.byAdId);
      // Gate de QA: chaveado por `chaveDoCriativo`, NUNCA por nome. Na visão
      // "Todos" o mesmo nome cobre N anúncios e um mapa por nome faria todos
      // eles lerem o ROAS do último.
      m.set(chaveDoCriativo(c, filtros.agrupamento), roasDoCriativo(bruto, c.spend));
    }
    return m;
  }, [aggregated, revenueData, filtros.agrupamento]);

  /**
   * Story 18.79 (AC6) — vendas por criativo, do MESMO cruzamento que alimenta
   * o ROAS e o card. Derivar de outra fonte faria o ranking discordar do
   * número impresso no card, que é o defeito que a 18.74 já corrigiu no ROAS.
   */
  const vendasPorChave = useMemo(() => {
    const m = new Map<string, number | null>();
    if (!revenueData || revenueData.semDados) return m;
    for (const c of aggregated) {
      const { vendas } = vendasDeduzidas(c.ids, revenueData.byAdId);
      m.set(chaveDoCriativo(c, filtros.agrupamento), vendas);
    }
    return m;
  }, [aggregated, revenueData, filtros.agrupamento]);

  /**
   * As abas «Maiores ROAS» e «Mais Vendas» dependem da planilha (AC4 da 18.74,
   * AC6 da 18.79). Sem ela, ficam — desabilitadas e com o motivo (AC3).
   *
   * ⚠️ Medido em 2026-09-07 (`scripts/diagnostica-creative-revenue.ts`): só
   * **8 de 47** etapas em produção conseguem calcular. E na maioria das outras
   * o que falta NÃO é a planilha de vendas — é a de **leads**, ou as duas. Por
   * isso o tooltip fala das duas, em vez de acusar só uma.
   */
  const roasDisponivel = !!revenueData && !revenueData.semDados;

  /**
   * Story 18.76 — o contexto que as métricas de venda/conversão precisam e o
   * `AggregatedCreative` não carrega (vem do cruzamento com a planilha).
   */
  const contextoDeMetrica = useMemo(() => {
    return (c: AggregatedCreative): ContextoDeMetrica => {
      const { vendas, bruto } = revenueData && !revenueData.semDados
        ? vendasDeduzidas(c.ids, revenueData.byAdId)
        : { vendas: 0, bruto: 0 };
      const temVendas = !!revenueData && !revenueData.semDados;
      const conversoes =
        conv.unidade === "vendas"
          ? temVendas
            ? vendas
            : null
          : conv.unidade === "ingressos"
            ? ingressosDoGrupo(c.ids, ingressosPorAdId)
            : temFonteDeConversao
              ? c.leadsPagos
              : null;
      return {
        vendas: temVendas ? vendas : null,
        faturamento: temVendas ? bruto : null,
        conversoes,
      };
    };
  }, [revenueData, conv.unidade, ingressosPorAdId, temFonteDeConversao]);

  /** Métricas indisponíveis nesta etapa — checkbox desabilitado, não ausente. */
  const semCategoria = useMemo(
    () =>
      categoriasIndisponiveis({
        temPlanilhaDeLeads: !!sheetData,
        temPlanilhaDeVendas: !!revenueData && !revenueData.semDados,
      }),
    [sheetData, revenueData],
  );

  // Story 8.9: limiar de relevância estatística calculado sobre o conjunto
  // agregado completo. threshold = 2 × CPA agregado (ou 2 × gasto médio se
  // sem vendas). Filtro escondido quando mode === 'disabled'.
  const relevanceThreshold = useMemo(
    () => computeRelevanceThreshold(aggregated),
    [aggregated],
  );
  const { visible: relevantCreatives, hiddenCount } = useMemo(() => {
    if (showAll) return { visible: aggregated, hiddenCount: 0 };
    return applyRelevanceFilter(aggregated, relevanceThreshold);
  }, [aggregated, relevanceThreshold, showAll]);
  /**
   * Story 29.65 (AC3/AC4) — quem não pode disputar "Melhores Hooks".
   *
   * Duas exclusões, com motivos diferentes:
   *
   * - **sem `hookRate`**: nenhum anúncio do grupo trouxe `views3s`. Pode ser
   *   criativo estático (correto não ter gancho) ou vídeo cuja métrica a Meta
   *   não devolveu no período. Tratar isso como `0` jogaria o criativo para o
   *   fim da lista *como se fosse o pior gancho do funil* — uma acusação falsa.
   *   Medido ao vivo em 2026-08-26: 25% dos grupos no BBE, 50% no DG & CPDF.
   * - **`amostraBaixa`**: tem a métrica, mas abaixo do piso da 43.8. Um
   *   criativo com 3 reproduções e 60% de gancho lideraria o ranking sendo
   *   ruído estatístico.
   *
   * A contagem vira aviso na tela: um ranking que encolhe de 63 para 47 sem
   * dizer nada parece perda de dado.
   */
  const semHook = useMemo(
    () => (metric === "hook" ? relevantCreatives.filter((c) => c.hookRate === null).length : 0),
    [relevantCreatives, metric],
  );
  const hookAmostraBaixa = useMemo(
    () =>
      metric === "hook"
        ? relevantCreatives.filter((c) => c.hookRate !== null && c.amostraBaixa).length
        : 0,
    [relevantCreatives, metric],
  );
  const elegiveis = useMemo(
    () =>
      metric === "hook"
        ? relevantCreatives.filter((c) => c.hookRate !== null && !c.amostraBaixa)
        : relevantCreatives,
    [relevantCreatives, metric],
  );
  /** Story 18.74 (AC5): busca por nome + filtro de tipo de mídia. */
  const buscados = useMemo(
    () => aplicarBuscaEMidia(elegiveis, filtros),
    [elegiveis, filtros],
  );
  const sorted = useMemo(
    () => ordenarPorMetrica(buscados, metric, roasPorChave, filtros.agrupamento, vendasPorChave),
    [buscados, metric, roasPorChave, filtros.agrupamento, vendasPorChave],
  );

  /**
   * Story 18.76 (AC7): a barra compara os criativos EXIBIDOS entre si. Um
   * máximo global (ou fixo) faria todas as barras encolherem quando um outlier
   * entrasse na lista, sem que nada tivesse mudado nos criativos.
   */
  const maximosDasBarras = useMemo(
    () => maximosPorMetrica(metricasMarcadas, sorted, contextoDeMetrica),
    [metricasMarcadas, sorted, contextoDeMetrica],
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Story 8.9: se nada agregado, esconde o card inteiro. Mas se há criativos
  // agregados e o que zerou foi o filtro de relevância, mantemos o header pra
  // o usuário ter como destogglar.
  if (aggregated.length === 0) return null;

  const shown = expanded ? sorted : sorted.slice(0, 20);
  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.sortLabel ?? metric;
  const selectedOption = METRIC_OPTIONS.find((m) => m.value === metric);
  const showReviewBadge = !!selectedOption?.needsReview;

  const lightboxItems: LightboxItem[] = sorted.map((c) => ({
    id: c.ids[0],
    name: c.name,
    creative: c.creative,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.ctr,
    cplPago: c.cplPago,
    parentInfo: c.parentInfo,
  }));

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Top Criativos — {metricLabel}</h3>
          <p className="text-[11px] text-muted-foreground">
            {/* Story 18.74 (AC3): a mesma tela passa a somar unidades
                diferentes conforme a aba — declarar qual está em uso é o que
                impede alguém de comparar 40 anúncios com 12 criativos. */}
            {sorted.length}{" "}
            {filtros.agrupamento === "anuncio"
              ? sorted.length === 1
                ? "anúncio"
                : "anúncios"
              : sorted.length === 1
                ? "criativo agregado por nome"
                : "criativos agregados por nome"}
            {!showAll && hiddenCount > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                  title={
                    relevanceThreshold.mode === "cpa"
                      ? `Threshold = 2× CPA do período (${brlFormatter.format(relevanceThreshold.cpaMedio ?? 0)})`
                      : "Sem vendas no período — usando 2× gasto médio"
                  }
                  aria-label="Mostrar criativos com baixo gasto"
                >
                  {hiddenCount} {hiddenCount === 1 ? "oculto" : "ocultos"} por baixo gasto (&lt; {brlFormatter.format(relevanceThreshold.threshold)})
                </button>
              </>
            )}
            {/* Story 29.65 (AC3): quem ficou de fora do ranking de hook, e por
                quê. Sem isto, a lista encolhe em silêncio e parece dado perdido
                — em vez de critério aplicado. Os dois motivos aparecem
                separados porque pedem ações diferentes: um é natureza do
                criativo, o outro é volume insuficiente (que o tempo resolve). */}
            {metric === "hook" && (semHook > 0 || hookAmostraBaixa > 0) && (
              <>
                {" · "}
                <span
                  className="cursor-help underline decoration-dotted underline-offset-2"
                  title={[
                    semHook > 0
                      ? `${semHook} sem métrica de vídeo no período (estático, ou a Meta não devolveu reproduções). Ausência não é zero — por isso ficam fora do ranking em vez de aparecer como piores.`
                      : null,
                    hookAmostraBaixa > 0
                      ? `${hookAmostraBaixa} com menos de ${PISO_DE_REPRODUCOES} reproduções — amostra pequena demais para comparar.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("\n\n")}
                >
                  {semHook + hookAmostraBaixa} fora do ranking de hook
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Story 18.74 (AC1/AC2) — abas de visão                         */}
      {/* Cada aba carrega ordenação + filtros + agrupamento. Mexer em  */}
      {/* qualquer controle marca a aba (•) sem reescrever o preset:    */}
      {/* um clique nela restaura o original.                           */}
      {/* ============================================================ */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/30 -mx-1 px-1">
        {VISOES.map((v) => {
          const ativa = v.id === visaoId;
          /**
           * Story 18.79 (AC3/AC6) — as duas abas que dependem do cruzamento
           * com a planilha. Ficam na tela, desabilitadas e com o motivo: aba
           * que some ensina que o recurso não existe; aba cinza com motivo
           * ensina o que fazer para tê-lo.
           */
          const dependeDaPlanilha = v.id === "roas" || v.id === "vendas";
          const desabilitada = dependeDaPlanilha && !roasDisponivel;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              disabled={desabilitada}
              onClick={() => aplicarVisao(v.id)}
              title={
                desabilitada
                  ? // ⚠️ O texto fala das DUAS planilhas de propósito. Medido em
                    // 2026-09-07 (`diagnostica-creative-revenue.ts`): das 39
                    // etapas sem este cruzamento, na maioria o que falta é a de
                    // LEADS, ou as duas — culpar só a de vendas mandaria o
                    // gestor conectar o que já está conectado.
                    `${v.label} precisa cruzar leads × vendas: esta etapa precisa ` +
                    "de uma planilha de LEADS e uma de VENDAS conectadas. " +
                    "Falta ao menos uma das duas."
                  : v.descricao
              }
              className={`shrink-0 px-2.5 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
                desabilitada
                  ? "border-transparent text-muted-foreground/40 cursor-not-allowed"
                  : ativa
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
              {ativa && abaModificada && (
                <span className="ml-1 text-primary" title="Visão modificada — clique para restaurar">
                  •
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* Story 18.74 (AC5) — barra de ferramentas                      */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Buscar criativo..."
            aria-label="Buscar criativo pelo nome"
            className="h-7 w-[170px] rounded-md border border-border/40 bg-transparent pl-7 pr-2 text-[11px] outline-none focus:border-primary/50"
          />
        </div>

        {/* Story 18.79 (AC1) — o <Select> de ordenação saiu daqui.
            As abas acima já escolhem a métrica, e ter os dois era escolher a
            mesma coisa em dois lugares.

            ⚠️ `METRIC_OPTIONS` NÃO saiu: as abas leem a mesma lista, e
            `formatMetricValue`/`ordenarPorMetrica` dependem dela. */}

        <Select
          value={filtros.tipoDeMidia}
          onValueChange={(v) =>
            setFiltros((f) => ({ ...f, tipoDeMidia: v as FiltrosDaGaleria["tipoDeMidia"] }))
          }
        >
          <SelectTrigger className="h-7 w-[120px] text-xs" aria-label="Tipo de mídia">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Toda mídia</SelectItem>
            <SelectItem value="video">Só vídeo</SelectItem>
            <SelectItem value="estatico">Só estático</SelectItem>
          </SelectContent>
        </Select>

        {/* Story 18.79 (AC4) — o <Select> de agrupamento saiu: em uso normal é
            sempre um card por Ad Name.

            ⚠️ O agrupamento por Ad ID NÃO morreu. A aba "Todos" tem
            `agrupamento: "anuncio"` no preset e o mantém — é a visão crua, um
            card por anúncio. `chaveDoCriativo`, o tipo `Agrupamento` e o
            `presetModificado` seguem intactos; o chip de filtro ativo também,
            porque é ele que explica por que aquela aba mostra mais cards. */}

        {/* ==================================================== */}
        {/* Story 18.79 (AC5) — «Métricas» à ESQUERDA do          */}
        {/* «Mostrando todos», e com seta: o botão parecia um     */}
        {/* rótulo e ninguém percebia que abria um painel.        */}
        {/* ==================================================== */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPainelAberto((v) => !v)}
            aria-expanded={painelAberto}
            aria-haspopup="dialog"
            title="Escolher quais métricas aparecem em cada card"
            className={`inline-flex h-7 items-center gap-1 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
              painelAberto
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/40 text-foreground hover:bg-muted/50"
            }`}
          >
            {/* Story 18.79 (AC5) — rótulo explícito e seta.
                Antes era só a palavra "Métricas" em `text-muted-foreground`,
                do mesmo tamanho dos rótulos vizinhos: lia-se como legenda, não
                como controle. O texto agora diz o que o painel faz, a cor é a
                do conteúdo (não a de rótulo secundário) e a seta gira ao abrir,
                que é a convenção dos outros dropdowns desta barra. */}
            <SlidersHorizontal className="h-3 w-3" />
            Métricas do card
            {/* AC3 da 18.76: o badge é a soma dos checkboxes. Zero = sem badge. */}
            {contarMarcadas(metricasMarcadas) > 0 && ` (${contarMarcadas(metricasMarcadas)})`}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${painelAberto ? "rotate-180" : ""}`}
            />
          </button>

          {painelAberto && (
            <>
              {/* Clique fora fecha. Um painel que só fecha no botão prende o
                  usuário quando ele já foi olhar outra coisa na tela. */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setPainelAberto(false)}
                aria-hidden
              />
              <div
                role="dialog"
                aria-label="Painel de métricas"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPainelAberto(false);
                }}
                className="absolute z-50 mt-1 w-[290px] max-h-[420px] overflow-y-auto rounded-lg border border-border/50 bg-popover p-2 shadow-lg"
              >
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <input
                    autoFocus
                    value={buscaMetrica}
                    onChange={(e) => setBuscaMetrica(e.target.value)}
                    placeholder="Buscar métrica..."
                    aria-label="Buscar métrica"
                    className="h-7 w-full rounded-md border border-border/40 bg-transparent pl-7 pr-2 text-[11px] outline-none focus:border-primary/50"
                  />
                </div>

                {CATEGORIAS.map((cat) => {
                  const idsQueCasam = buscarMetricas(buscaMetrica);
                  const daCategoria = METRICAS.filter(
                    (m) => m.categoria === cat.id && idsQueCasam.includes(m.id),
                  );
                  // Busca não deixa categoria vazia na tela.
                  if (daCategoria.length === 0) return null;
                  // AC1: buscar EXPANDE a categoria com resultado — senão o
                  // usuário busca, vê o nome da categoria e nada dentro.
                  const aberta = buscaMetrica.trim() !== "" || categoriasAbertas.has(cat.id);
                  const marcadasNaCategoria = contarPorCategoria(metricasMarcadas, cat.id);
                  const indisponivel = semCategoria[cat.id];
                  return (
                    <div key={cat.id} className="mb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCategoriasAbertas((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat.id)) next.delete(cat.id);
                            else next.add(cat.id);
                            return next;
                          })
                        }
                        aria-expanded={aberta}
                        className="flex w-full items-center gap-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        {aberta ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        {cat.label}
                        {/* AC1: sem badge quando zero. */}
                        {marcadasNaCategoria > 0 && (
                          <span className="text-primary">({marcadasNaCategoria})</span>
                        )}
                        {indisponivel && (
                          <span className="ml-auto text-[9px] font-normal normal-case text-muted-foreground/60">
                            indisponível
                          </span>
                        )}
                      </button>

                      {aberta &&
                        daCategoria.map((m) => {
                          const marcada = metricasMarcadas.includes(m.id);
                          return (
                            <label
                              key={m.id}
                              title={indisponivel ?? undefined}
                              className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] ${
                                indisponivel
                                  ? "cursor-not-allowed text-muted-foreground/50"
                                  : "cursor-pointer hover:bg-muted/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={marcada}
                                disabled={!!indisponivel}
                                onChange={() =>
                                  setMetricasMarcadas((prev) =>
                                    prev.includes(m.id)
                                      ? prev.filter((x) => x !== m.id)
                                      : [...prev, m.id],
                                  )
                                }
                                className="h-3 w-3 accent-primary"
                              />
                              <span className="flex-1">{m.label}</span>
                              {/* AC4: o "i" traz a FÓRMULA, não o nome por extenso. */}
                              <span title={m.explicacao} className="cursor-help">
                                <Info className="h-3 w-3 text-muted-foreground/60" />
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Story 8.9: o toggle de relevância mudou de lugar, não de regra. */}
        {(relevanceThreshold.mode !== "disabled" || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors ${
              showAll
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border/40 bg-transparent text-muted-foreground hover:bg-muted/50"
            }`}
            aria-pressed={showAll}
            title={
              showAll
                ? "Filtro de relevância desativado — mostrando todos os criativos"
                : "Mostrando apenas criativos com gasto estatisticamente relevante"
            }
          >
            {showAll ? "Mostrando todos" : "Mostrar todos"}
          </button>
        )}
      </div>

      {/* Story 18.74 (AC6) — filtros ativos. Sem filtro, não ocupa espaço. */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.campo}
              type="button"
              onClick={() => setFiltros((f) => limparCampo(f, chip.campo))}
              title={`Remover: ${chip.texto}`}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border/40 bg-muted/30 text-[10px] hover:bg-muted/60 transition-colors"
            >
              {chip.texto}
              <X className="h-2.5 w-2.5" />
            </button>
          ))}
          {chips.length >= 2 && (
            <button
              type="button"
              onClick={() => setFiltros(presetDaAba)}
              className="text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Limpar tudo
            </button>
          )}
        </div>
      )}

      {showReviewBadge && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 dark:text-amber-400">
            <span className="font-medium">Métrica em revisão —</span> definição de lead qualificado
            pendente. Valores exibidos são do backend legado e podem divergir da metodologia atual.
          </p>
        </div>
      )}

      {/* Story 8.9: estado vazio quando filtro de relevância escondeu tudo */}
      {sorted.length === 0 && hiddenCount > 0 && (
        <div className="rounded-md border border-dashed border-border/40 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum criativo com gasto estatisticamente relevante no período.
          </p>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-2 text-xs underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Mostrar todos os {hiddenCount} criativos
          </button>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c, i) => {
          const funnel = funnelContext ?? { days: 30 };
          const path = { ad: c.name };
          const spendFormula = enrichFormulaForEntity(
            buildFunnelSpendFormula(c.spend, funnel),
            path,
          );
          // Story 18.75 — a conversão do card, na unidade da tela.
          const conversoes =
            conv.unidade === "vendas"
              ? temFonteDeConversao
                ? vendasDeduzidas(c.ids, revenueData?.byAdId).vendas
                : null
              : conv.unidade === "ingressos"
                ? ingressosDoGrupo(c.ids, ingressosPorAdId)
                : temFonteDeConversao
                  ? c.leadsPagos
                  : null;
          const motivoConv = motivoSemConversao(conv, temFonteDeConversao, conversoes);
          const custoConv = custoPorConversao(c.spend, conversoes);
          // Story 18.76: o mesmo contexto que alimentou os máximos das barras.
          const ctxMetrica = contextoDeMetrica(c);
          // A MESMA chave que o mapa de ROAS usa e que o React usa como `key`.
          // Duas noções de identidade é como o card lê o número de outro.
          const chaveDoCard = chaveDoCriativo(c, filtros.agrupamento);
          return (
            <div
              // Story 18.74 (AC3): na visão "Todos" o mesmo nome aparece N
              // vezes (um card por anúncio), então a chave é o ad_id.
              key={chaveDoCard}
              className="group rounded-lg border border-border/20 bg-muted/10 overflow-hidden hover:border-border/50 transition-all hover:shadow-md cursor-pointer"
              onClick={() => setLightboxIndex(i)}
            >
              <div className="relative aspect-video bg-muted/30">
                <CreativeThumbnail
                  src={srcDoCriativo(c.creative, c.name, criativoDoDrive)}
                  title={origemDoCriativo(c.name, criativoDoDrive)}
                  alt={c.name}
                  className="w-full h-full object-cover"
                  isLowRes={isLowResFallback(c.creative)}
                />

                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 bg-black/50 text-white border-white/20 backdrop-blur-sm"
                  >
                    {c.creative?.objectType === "VIDEO"
                      ? "Video"
                      : c.creative?.objectType === "CAROUSEL"
                        ? "Carousel"
                        : "Imagem"}
                  </Badge>
                  {c.ids.length > 1 && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-blue-500/30 text-white border-blue-200/40 backdrop-blur-sm"
                      title={`Agregado de ${c.ids.length} versões com mesmo nome`}
                    >
                      ×{c.ids.length}
                    </Badge>
                  )}
                </div>

                {c.creative?.objectType === "VIDEO" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="rounded-full bg-black/40 p-2 group-hover:bg-black/60 transition-colors">
                      <Play className="h-4 w-4 text-white fill-white" />
                    </div>
                  </div>
                )}

                <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                  {/* Story 29.63 (AC5): o post publicado. A URL da imagem é
                      assinada e expira; o permalink não — é por isso que o
                      gestor pediu "assim o anúncio nunca se perderá". */}
                  {creativePermalink(c.creative) && (
                    <a
                      href={creativePermalink(c.creative)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/50 p-1 text-white hover:bg-black/70 backdrop-blur-sm"
                      title="Ver o criativo publicado no Instagram"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Instagram className="h-3 w-3" />
                    </a>
                  )}
                  <a
                    href={srcDoCriativo(c.creative, c.name, criativoDoDrive)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/50 p-1 text-white hover:bg-black/70 backdrop-blur-sm"
                    title="Abrir a imagem em nova guia"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-[10px] font-bold bg-black/50 text-white rounded px-1.5 py-0.5 backdrop-blur-sm">
                    #{i + 1}
                  </span>
                </div>
              </div>

              <div className="p-2.5 space-y-2">
                <p className="text-[11px] font-medium truncate" title={c.name}>
                  {c.name}
                </p>
                <p className="text-lg font-bold tracking-tight">
                  {formatMetricValue(c, metric, roasPorChave, chaveDoCard, vendasPorChave)}
                </p>
                {/* Story 18.75 (AC1): grid 2×2 fixo. O CTR saiu daqui e desceu
                    uma linha (AC10) — o que o gestor precisa ler no card é
                    quantas conversões o criativo trouxe e quanto custou cada
                    uma, e isso muda de nome conforme a tela (AC2). */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] pt-1 border-t border-border/20">
                  <MetricTooltip label="Investimento" value={fmtCurrency(c.spend)} formula={spendFormula}>
                    <div onClick={(e) => e.stopPropagation()} className="cursor-help text-center">
                      <p className="text-muted-foreground">Invest.</p>
                      <p className="font-semibold underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                        {fmtCurrency(c.spend)}
                      </p>
                    </div>
                  </MetricTooltip>

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-help text-center"
                    title={`${fmtNumber(c.impressions)} impressões${c.ids.length > 1 ? ` — somadas dos ${c.ids.length} anúncios com este nome` : ""}`}
                  >
                    <p className="text-muted-foreground">Impressões</p>
                    <p className="font-semibold">{fmtNumber(c.impressions)}</p>
                  </div>

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-help text-center"
                    title={
                      motivoConv ??
                      `${fmtNumber(conversoes ?? 0)} ${conv.rotulo.toLowerCase()} da ${conv.fonte}${
                        conv.unidade === "vendas" && c.ids.length > 1
                          ? ` — comprador contado uma vez só entre os ${c.ids.length} anúncios do grupo`
                          : ""
                      }`
                    }
                  >
                    <p className="text-muted-foreground">{conv.rotulo}</p>
                    <p className={`font-semibold ${motivoConv ? "text-muted-foreground" : ""}`}>
                      {motivoConv ? "—" : fmtNumber(conversoes ?? 0)}
                    </p>
                  </div>

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-help text-center"
                    title={
                      motivoConv ??
                      `${conv.nomeCusto} = investimento ÷ ${conv.rotulo.toLowerCase()} = ${fmtCurrency(c.spend)} ÷ ${fmtNumber(conversoes ?? 0)}`
                    }
                  >
                    <p className="text-muted-foreground">{conv.rotuloCusto}</p>
                    <p className={`font-semibold ${custoConv == null ? "text-muted-foreground" : ""}`}>
                      {custoConv == null ? "—" : fmtCurrency(custoConv)}
                    </p>
                  </div>
                </div>

                {/* Story 18.79 (AC7) — a linha fixa de CTR saiu daqui.
                    Ele aparecia duas vezes no mesmo card: nesta linha e como
                    métrica selecionável no painel. Fica a selecionável — quem
                    quiser CTR marca, como faz com as outras. No LIGHTBOX ele
                    continua (`:609`), que é onde se olha o criativo inteiro. */}

                {/* ==================================================== */}
                {/* Story 18.76 (AC6) — uma barra por métrica marcada     */}
                {/* ==================================================== */}
                {metricasMarcadas.length > 0 && (
                  <div
                    className="space-y-1 pt-1.5 border-t border-border/20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {METRICAS.filter((m) => metricasMarcadas.includes(m.id)).map((m) => {
                      const valor = valorDaMetrica(m.id, c, ctxMetrica);
                      const largura = larguraDaBarra(valor, maximosDasBarras.get(m.id));
                      const cor = corDaBarra(m, valor);
                      // Cor da barra e do valor são a MESMA — é o que liga
                      // visualmente a linha inteira (AC6).
                      const classeCor =
                        cor === "meta-ok"
                          ? "text-emerald-500"
                          : cor === "custo"
                            ? "text-amber-500"
                            : cor === "meta-abaixo"
                              ? "text-foreground"
                              : "text-sky-500";
                      const classeFundo =
                        cor === "meta-ok"
                          ? "bg-emerald-500"
                          : cor === "custo"
                            ? "bg-amber-500"
                            : cor === "meta-abaixo"
                              ? "bg-muted-foreground/50"
                              : "bg-sky-500";
                      return (
                        <div key={m.id} className="flex items-center gap-1.5 text-[9px]" title={m.explicacao}>
                          <span className="w-[74px] shrink-0 truncate text-muted-foreground">
                            {m.label}
                          </span>
                          <span className="h-1 flex-1 rounded-full bg-muted/40 overflow-hidden">
                            {/* `null` desenha barra vazia: não medido nunca vira 0%. */}
                            {largura != null && (
                              <span
                                className={`block h-full rounded-full ${classeFundo}`}
                                style={{ width: `${largura}%` }}
                              />
                            )}
                          </span>
                          <span className={`w-[62px] shrink-0 text-right font-semibold tabular-nums ${classeCor}`}>
                            {formatarValorDaMetrica(m.formato, valor)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Story 29.65: o gancho só aparece quando o filtro é dele — nas
                    outras ordenações seria mais um número disputando um card já
                    cheio. `—` quando não há métrica; nunca 0,00%. */}
                {metric === "hook" && (
                  <div
                    className="text-[10px] text-center pt-1 border-t border-border/20 cursor-help"
                    onClick={(e) => e.stopPropagation()}
                    title={
                      c.hookRate === null
                        ? "Sem métrica de vídeo no período — este criativo não entra no ranking de hook."
                        : `${c.views3s?.toLocaleString("pt-BR")} reproduções de 3s ÷ impressões dos anúncios com vídeo${
                            c.ids.length > 1 ? ` · somado dos ${c.ids.length} anúncios com este nome` : ""
                          }. Meta: ${META_HOOK_VERDE}%`
                    }
                  >
                    <span className="text-muted-foreground">Hook: </span>
                    <span className={`font-semibold ${hookColorClass(c.hookRate)}`}>
                      {fmtPercent(c.hookRate)}
                    </span>
                  </div>
                )}

                {/* Breakdown de leads por origem (Story 21.2 — Task 6) */}
                {(c.leadsPagos > 0 || c.leadsOrg > 0 || c.leadsSemTrack > 0) && (
                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/20">
                    <span className="font-medium text-foreground/70">Leads: </span>
                    {c.leadsPagos > 0 && <span>{c.leadsPagos} Pagos</span>}
                    {c.leadsOrg > 0 && <span>{c.leadsPagos > 0 ? " | " : ""}{c.leadsOrg} Org</span>}
                    {c.leadsSemTrack > 0 && <span>{(c.leadsPagos > 0 || c.leadsOrg > 0) ? " | " : ""}{c.leadsSemTrack} S/orig</span>}
                  </div>
                )}

                {/* Faturamento real por criativo (Story 21.7). Dedup de email
                    entre múltiplos ad_ids do mesmo criativo agregado (AC-8). */}
                {revenueData && !revenueData.semDados ? (() => {
                  const seenEmails = new Set<string>();
                  let bruto = 0;
                  let vendas = 0;
                  for (const id of c.ids) {
                    const entry = revenueData.byAdId[id];
                    if (!entry) continue;
                    for (let i = 0; i < entry.emails.length; i++) {
                      const email = entry.emails[i];
                      if (seenEmails.has(email)) continue;
                      seenEmails.add(email);
                      // Share proporcional por venda (cada email conta 1 vez;
                      // bruto do ad foi somado já por email, então distribui
                      // pelo count de emails do ad pra pegar o share do email).
                      bruto += entry.faturamentoBruto / entry.emails.length;
                      vendas += 1;
                    }
                  }
                  if (bruto <= 0 || vendas === 0) return null;
                  return (
                    <div className="text-[10px] pt-1 border-t border-border/20">
                      <span className="text-foreground/80 font-medium">
                        💵 Faturado: {brlFormatter.format(bruto)}
                      </span>
                      <span className="text-muted-foreground/70"> · {vendas} {vendas === 1 ? "venda" : "vendas"}</span>
                    </div>
                  );
                })() : null}

                {/* Dados da pesquisa (Story 28.2: dinâmico via mapping; fallback legacy) */}
                {renderSurveyBlock(
                  c,
                  surveyDataByAdIdDynamic,
                  surveyQuestions,
                  surveyDataByAdId,
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 20 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {expanded ? "Mostrar menos" : `Ver todos (${sorted.length})`}
        </button>
      )}

      {lightboxIndex !== null && (
        <CreativeLightbox
          criativoDoDrive={criativoDoDrive}
          items={lightboxItems}
          initialIndex={lightboxIndex}
          projectId={projectId}
          onClose={() => setLightboxIndex(null)}
          funnelContext={funnelContext}
        />
      )}
    </div>
  );
}
