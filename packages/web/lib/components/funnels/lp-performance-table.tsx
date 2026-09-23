"use client";

/**
 * Story 18.44 / 18.46: Tabela única de performance de LPs.
 *
 * Story 18.46:
 * - Uma única tabela com UMA linha por LP (coluna "LP" em vez de "Dia").
 * - Sem título/identificação por LP no topo (a LP é a primeira coluna).
 * - Cliques/Impressões ocultadas (Story 18.45 AC4); Leads/CPL (free) ou Vendas/CPV (paid)
 *   logo após Investimento.
 * - O filtro de público (Hot/Cold/Todos) é controlado pela seção pai (botões temáticos).
 *
 * Story 18.83: com a API nova, cada linha é a URL de destino do anúncio (link
 * puro, hiperlinkado — padrão do perpétuo), a linha "Sem link resolvido" traz as
 * causas e a correção manual POR CAMPANHA, e o lápis do `lp_links` sai. Com a
 * API anterior (rótulos "LPA"), a tabela é a de antes, com o lápis.
 */

import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Pencil,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  calculatePaidMetrics,
  calculateFreeMetrics,
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/lib/utils/lp-metrics-calculator";
import type { LpRow } from "@/lib/hooks/useLpPerformanceData";
import { LpFunnelCard } from "@/components/funnels/lp-funnel-card";
import type { LpFunnelRow } from "@/lib/hooks/use-sales-journey";
import {
  CHAVE_SEM_LINK,
  ROTULO_SEM_LINK,
  chaveDoCardDaLp,
  descreverSemLink,
  type SemLinkDaLinha,
} from "@/lib/utils/lps-do-lancamento";

/** Story 18.60: inteiro pt-BR para colunas de contagem (Ing. Únicos/Totais, LP View). */
function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("pt-BR");
}

interface LpPerformanceTableProps {
  rows: LpRow[];
  stageType: "paid" | "free"; // "Captação Paga" ou "Captação Gratuita"
  isLoading?: boolean;
  /** Story 18.56: URL por LP (chave = lpName trim+lowercase). */
  lpLinks?: Record<string, string>;
  /**
   * Story 18.56: salva/remove (url vazia) o link de uma LP. Só vale no modo
   * rótulo (API anterior à 18.83): no modo URL o lápis sai (AC6) — a linha já é
   * o link, e o caminho manual é a correção por campanha.
   */
  onSaveLpLink?: (lpName: string, url: string) => Promise<void>;
  /**
   * Story 18.83 (AC5): grava/remove (url vazia) a correção de UMA campanha.
   * Ausente = sem correção na tela (guest, ou tela sem etapa editável).
   */
  onSalvarCorrecao?: (campaignId: string, url: string) => Promise<void>;
  /**
   * Mini-funil por LP (chave = lpName UPPERCASE, como o backend devolve).
   * Ausente = a coluna de expansão não aparece e a tabela fica idêntica à antiga.
   */
  funnelByLp?: Record<string, LpFunnelRow>;
  funnelLoading?: boolean;
  /** Conversão lead → compra do conjunto, como régua dentro de cada card. */
  refConversao?: number | null;
  /** % de atribuições herdadas do lead de captação (aviso no card). */
  pctHeranca?: number | null;
  /** Tipos de planilha da etapa — etapa sem fonte sai da cadeia do card. */
  temFonte?: { aplicacao: boolean; pesquisa: boolean };
  /** Rótulos das planilhas por etapa, para o tooltip de cada linha do funil. */
  fontesPorEtapa?: { captacao: string[]; aplicacao: string[]; pesquisa: string[] };
  /**
   * Chamado na PRIMEIRA expansão. O mini-funil lê todas as planilhas do funil no
   * servidor, então a leitura só acontece se alguém pedir para ver.
   */
  onFirstExpand?: () => void;
}

/**
 * Story 18.58: explicação de cálculo/fonte de cada coluna (tooltip do header).
 * Fonte de verdade das fórmulas: lp-metrics-calculator.ts (implementações) e
 * useLpPerformanceData.ts (agregação/imposto/atribuição). Se uma fórmula
 * mudar lá, atualizar o texto aqui.
 */
const COLUMN_TOOLTIPS = {
  lp: "LP identificada pelo Campaign Name da campanha Meta (nome contém \"lpX\"; sem lpX → LPA)",
  investimento: "Soma do gasto Meta das campanhas da LP + imposto de 12,15%",
  leads: "Leads da planilha atribuídos à LP (utm_term/utm_content contém lpX), respeitando o filtro Hot/Cold. LP sem formulário (nenhum lead na planilha) conta pelo Lead do pixel da Meta — marcada com \"pixel\"",
  cpl: "Investimento ÷ Leads",
  cpm: "(Investimento ÷ Impressões) × 1000",
  cpc: "Investimento ÷ Cliques",
  ctr: "(Cliques ÷ Impressões) × 100",
  lpView: "Landing Page Views reais da Meta API, somados por LP",
  connectRate: "(LP Views ÷ Cliques no link) × 100 — % dos cliques que carregaram a LP; pode passar de 100% por particularidades de rastreamento",
  txConvPaid: "(Ingressos Únicos ÷ Cliques no link) × 100",
  txConvFree: "(Leads ÷ Cliques no link) × 100",
  roas: "Fat. Total ÷ Investimento",
  // Story 18.60 (Captação Paga)
  ingressosUnicos: "Compradores únicos de ingresso da LP (dedup por email, sem order bump), atribuídos via co= da venda → campanha da LP",
  ingressosTotais: "Todas as vendas (ingresso + order bump) atribuídas à LP via co= da venda",
  cplPagoUnico: "Investimento ÷ Ingressos Únicos da LP",
  faturamentoUnico: "Faturamento das compras únicas de captação da LP (dedup por email, sem order bump)",
  faturamentoTotal: "Faturamento bruto de todas as vendas (ingresso + order bump) atribuídas à LP via co=",
} as const;

/**
 * Story 18.83 (PO-02) — com a API nova, a LP é a URL de destino do ANÚNCIO, e
 * os textos acima (regra do nome da campanha) ficariam falsos. Lição 18.58: o
 * tooltip é a documentação da fórmula. Só as chaves que mudam.
 */
const COLUMN_TOOLTIPS_POR_URL: Partial<Record<keyof typeof COLUMN_TOOLTIPS, string>> = {
  lp: "URL de destino do anúncio (link do criativo na Meta), sem query, sem www e sem barra final. Uma campanha que leva a duas páginas é dividida entre elas, anúncio a anúncio. Anúncio sem link no cache de criativos vai para \"Sem link resolvido\"",
  investimento: "Soma do gasto Meta dos anúncios que levam a esta URL + imposto de 12,15%",
  leads: "Leads pagos da planilha cujo utm_content (ad_id) é de um anúncio que leva a esta URL, respeitando o filtro Hot/Cold. URL sem formulário (nenhum lead na planilha) conta pelo Lead do pixel da Meta desses anúncios — marcada com \"pixel\"",
  ingressosUnicos: "Compradores únicos de ingresso (dedup por email, sem order bump), atribuídos via co= da venda → anúncio → URL",
  ingressosTotais: "Todas as vendas (ingresso + order bump) atribuídas via co= da venda → anúncio → URL",
  faturamentoUnico: "Faturamento das compras únicas de captação (dedup por email, sem order bump), via co= → anúncio → URL",
  faturamentoTotal: "Faturamento bruto de todas as vendas (ingresso + order bump) atribuídas via co= → anúncio → URL",
};

/**
 * Story 18.60: modelo de colunas dirigido por descritor — habilita reorder,
 * tooltip e sort clicável (padrão da tabela de Criativos). A coluna "LP"
 * (texto/link via LpNameCell) fica FORA deste array (não é ordenável).
 */
type LpSortKey =
  | "investimento"
  | "ingressosUnicos"
  | "ingressosTotais"
  | "revenueUnico"
  | "revenueTotal"
  | "roas"
  | "cplPagoUnico"
  | "txConv"
  | "cpm"
  | "cpc"
  | "ctr"
  | "lpViews"
  | "connectRate"
  | "leads"
  | "cpl";

type LpColKind = "currency" | "int" | "percent" | "ratio";

interface LpColumn {
  key: LpSortKey;
  label: string;
  tooltip: string;
  kind: LpColKind;
}

type Tooltips = Record<keyof typeof COLUMN_TOOLTIPS, string>;

// Ordem da Captação Paga (elicitação 18.60): Investimento → Ing. Únicos/Totais →
// Fat. Único/Total → ROAS → CPL Pago Único → Tx Conv. → CPM/CPC/CTR → LP View → Connect Rate.
const paidColumns = (t: Tooltips): LpColumn[] => [
  { key: "investimento", label: "Investimento (R$)", tooltip: t.investimento, kind: "currency" },
  { key: "ingressosUnicos", label: "Ing. Únicos", tooltip: t.ingressosUnicos, kind: "int" },
  { key: "ingressosTotais", label: "Ing. Totais", tooltip: t.ingressosTotais, kind: "int" },
  { key: "revenueUnico", label: "Fat. Único (R$)", tooltip: t.faturamentoUnico, kind: "currency" },
  { key: "revenueTotal", label: "Fat. Total (R$)", tooltip: t.faturamentoTotal, kind: "currency" },
  { key: "roas", label: "ROAS", tooltip: t.roas, kind: "ratio" },
  { key: "cplPagoUnico", label: "CPL Pago Único", tooltip: t.cplPagoUnico, kind: "currency" },
  { key: "txConv", label: "Tx Conv. (%)", tooltip: t.txConvPaid, kind: "percent" },
  { key: "cpm", label: "CPM", tooltip: t.cpm, kind: "currency" },
  { key: "cpc", label: "CPC", tooltip: t.cpc, kind: "currency" },
  { key: "ctr", label: "CTR (%)", tooltip: t.ctr, kind: "percent" },
  { key: "lpViews", label: "LP View", tooltip: t.lpView, kind: "int" },
  { key: "connectRate", label: "Connect Rate (%)", tooltip: t.connectRate, kind: "percent" },
];

// Captação Gratuita: ordem/colunas idênticas a hoje (só ganha sort + tooltips).
const freeColumns = (t: Tooltips): LpColumn[] => [
  { key: "investimento", label: "Investimento (R$)", tooltip: t.investimento, kind: "currency" },
  { key: "leads", label: "Leads", tooltip: t.leads, kind: "int" },
  { key: "cpl", label: "CPL", tooltip: t.cpl, kind: "currency" },
  { key: "cpm", label: "CPM", tooltip: t.cpm, kind: "currency" },
  { key: "cpc", label: "CPC", tooltip: t.cpc, kind: "currency" },
  { key: "ctr", label: "CTR (%)", tooltip: t.ctr, kind: "percent" },
  { key: "lpViews", label: "LP View", tooltip: t.lpView, kind: "int" },
  { key: "connectRate", label: "Connect Rate (%)", tooltip: t.connectRate, kind: "percent" },
  { key: "txConv", label: "Tx Conv. (%)", tooltip: t.txConvFree, kind: "percent" },
];

/** Story 18.60: valor numérico por coluna (null = "—"; sort trata null como 0). */
type LpComputedRow = {
  lpName: string;
  values: Record<LpSortKey, number | null>;
  leadsFonte?: "planilha" | "pixel";
  /** Story 18.83: identidade da linha no modo URL (ausente no modo rótulo). */
  lpKey?: string;
  url?: string | null;
  semLink?: SemLinkDaLinha;
  correcoes?: { campaignId: string; campaignName: string }[];
};

function formatCell(value: number | null, kind: LpColKind): React.ReactNode {
  switch (kind) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "ratio":
      return formatRatio(value);
    case "int":
      return formatInt(value);
  }
}

/** Story 18.56 (AC4): só http(s):// — bloqueia typos e esquemas maliciosos. */
function isValidLpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Story 18.56: nome da LP hiperlinkado (quando há URL) + lápis que abre um
 * popover de edição. Sem `onSaveLpLink` a célula fica idêntica à anterior.
 */
function LpNameCell({
  lpName,
  url,
  onSave,
}: {
  lpName: string;
  url?: string;
  onSave?: (lpName: string, url: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const canSave = trimmed === "" || isValidLpUrl(trimmed);

  async function handleSave() {
    if (!onSave || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(lpName, trimmed);
      setOpen(false);
    } catch {
      setError("Falha ao salvar — tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-primary"
          title={url}
        >
          {lpName}
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      ) : (
        lpName
      )}
      {onSave && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setDraft(url ?? "");
              setError(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={`Editar link da ${lpName}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2">
            <p className="text-sm font-medium">URL da {lpName}</p>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://exemplo.com/lp"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              autoFocus
            />
            {!canSave && (
              <p className="text-xs text-destructive">
                URL inválida — use http:// ou https://
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Vazio remove o link
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/**
 * Story 18.83 (AC2/AC5) — célula da LP no modo URL.
 *
 * - Linha de URL: link puro, hiperlinkado, no formato do perpétuo (texto = URL
 *   normalizada sem protocolo). Sem lápis (AC6). Se recebeu gasto por correção
 *   manual, um selo lista as campanhas e deixa remover cada uma.
 * - Linha "Sem link resolvido": as causas no tooltip e a correção POR CAMPANHA.
 */
function LpUrlCell({
  row,
  onSalvarCorrecao,
}: {
  row: LpComputedRow;
  onSalvarCorrecao?: (campaignId: string, url: string) => Promise<void>;
}) {
  if (row.lpKey === CHAVE_SEM_LINK) {
    return (
      <span className="inline-flex items-center gap-1.5 italic text-muted-foreground">
        <span
          title={row.semLink ? descreverSemLink(row.semLink) : "sem LP identificada"}
          className="cursor-help underline decoration-dotted decoration-border/60 underline-offset-2"
        >
          {ROTULO_SEM_LINK}
        </span>
        {onSalvarCorrecao && row.semLink && row.semLink.campanhas.length > 0 && (
          <CorrecaoPorCampanha campanhas={row.semLink.campanhas} onSalvar={onSalvarCorrecao} />
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.url}
          className="inline-flex max-w-[360px] items-center gap-1 truncate text-primary hover:underline"
        >
          <span className="truncate">{row.lpName}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
        </a>
      ) : (
        row.lpName
      )}
      {row.correcoes && row.correcoes.length > 0 && (
        <CorrecoesAplicadas correcoes={row.correcoes} onSalvar={onSalvarCorrecao} />
      )}
    </span>
  );
}

/** AC5: escolhe uma campanha com gasto em "Sem link resolvido" e informa a URL. */
function CorrecaoPorCampanha({
  campanhas,
  onSalvar,
}: {
  campanhas: SemLinkDaLinha["campanhas"];
  onSalvar: (campaignId: string, url: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [campanha, setCampanha] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const canSave = !!campanha && trimmed !== "" && isValidLpUrl(trimmed);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSalvar(campanha, trimmed);
      setOpen(false);
    } catch {
      setError("Falha ao salvar — tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCampanha(campanhas[0]?.id ?? "");
          setDraft("");
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1 text-[11px] not-italic text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Corrigir o link por campanha"
          title="Corrigir o link por campanha"
        >
          <Link2 className="h-3 w-3" />
          Corrigir
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-2 not-italic">
        <p className="text-sm font-medium">Corrigir o link por campanha</p>
        <p className="text-[11px] text-muted-foreground">
          Tudo o que a campanha tem nesta linha — os anúncios dela sem link ou, se ela não tem dado
          por anúncio, a campanha inteira — passa para a URL informada, com gasto, cliques, LP View,
          leads, vendas e ingressos. Anúncios que já têm link não mudam.
        </p>
        <select
          className="h-8 w-full rounded-md border border-border/50 bg-background px-1.5 text-xs"
          value={campanha}
          onChange={(e) => setCampanha(e.target.value)}
          aria-label="Campanha"
        >
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome || c.id} — {formatCurrency(c.investimento)}
            </option>
          ))}
        </select>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://exemplo.com/lp"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
          autoFocus
        />
        {trimmed !== "" && !isValidLpUrl(trimmed) && (
          <p className="text-xs text-destructive">URL inválida — use http:// ou https://</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** AC5: a linha recebeu gasto por correção — o selo lista e deixa remover. */
function CorrecoesAplicadas({
  correcoes,
  onSalvar,
}: {
  correcoes: { campaignId: string; campaignName: string }[];
  onSalvar?: (campaignId: string, url: string) => Promise<void>;
}) {
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nomes = correcoes.map((c) => c.campaignName || c.campaignId).join(", ");

  async function remover(campaignId: string) {
    if (!onSalvar) return;
    setRemovendo(campaignId);
    setError(null);
    try {
      await onSalvar(campaignId, "");
    } catch {
      setError("Falha ao remover — tente novamente.");
    } finally {
      setRemovendo(null);
    }
  }

  const selo = (
    <span
      className="cursor-help rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-600"
      title={`Correção manual por campanha: ${nomes}`}
    >
      correção manual
    </span>
  );
  if (!onSalvar) return selo;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Correções manuais desta LP">
          {selo}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-2">
        <p className="text-sm font-medium">Correção manual por campanha</p>
        <p className="text-[11px] text-muted-foreground">
          O que estas campanhas tinham sem link veio para esta URL. Remover devolve para
          &quot;Sem link resolvido&quot;.
        </p>
        <ul className="space-y-1">
          {correcoes.map((c) => (
            <li key={c.campaignId} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" title={c.campaignName}>
                {c.campaignName || c.campaignId}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remover(c.campaignId)}
                disabled={removendo !== null}
              >
                {removendo === c.campaignId ? "Removendo..." : "Remover"}
              </Button>
            </li>
          ))}
        </ul>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}

export function LpPerformanceTable({
  rows,
  stageType,
  isLoading = false,
  lpLinks,
  onSaveLpLink,
  onSalvarCorrecao,
  funnelByLp,
  funnelLoading = false,
  refConversao = null,
  pctHeranca = null,
  temFonte = { aplicacao: true, pesquisa: true },
  fontesPorEtapa,
  onFirstExpand,
}: LpPerformanceTableProps) {
  const isPaid = stageType === "paid";
  // Story 18.83: modo URL = a API mandou a URL do anúncio (linhas com `lpKey`).
  // Sem ela, a tabela é a de antes — rótulos da campanha, com o lápis.
  const modoUrl = rows.some((r) => r.lpKey !== undefined);
  const tooltips: Tooltips = modoUrl
    ? { ...COLUMN_TOOLTIPS, ...COLUMN_TOOLTIPS_POR_URL }
    : COLUMN_TOOLTIPS;
  const columns = isPaid ? paidColumns(tooltips) : freeColumns(tooltips);

  // Várias LPs podem ficar abertas ao mesmo tempo: comparar página A com página
  // B é o motivo de existir do mini-funil, e um acordeão de uma linha só
  // obrigaria a decorar o número da anterior.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const expansivel = !!funnelByLp || funnelLoading;

  function toggleExpandir(lpName: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(lpName)) {
        next.delete(lpName);
      } else {
        if (next.size === 0) onFirstExpand?.();
        next.add(lpName);
      }
      return next;
    });
  }

  // Story 18.60 (AC8/AC9): sort clicável por coluna. O estado vive aqui (filho),
  // então persiste ao trocar o filtro de público (Hot/Cold/Todos) ou o range —
  // a seção pai só troca as `rows`, não desmonta a tabela.
  const [sortCol, setSortCol] = useState<LpSortKey>("investimento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: LpSortKey) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // Story 18.60: computa métricas por LP e ordena pela coluna/direção ativas.
  const sortedRows: LpComputedRow[] = useMemo(() => {
    const computed = rows.map((row): LpComputedRow => {
      const m = isPaid
        ? calculatePaidMetrics({
            investimento: row.investimento,
            cliques: row.cliques,
            impressoes: row.impressoes,
            conversoes: row.conversoes,
            lpViews: row.lpViews,
            ingressosUnicos: row.ingressosUnicos ?? 0,
            revenueTotal: row.revenueTotal ?? 0,
          })
        : calculateFreeMetrics({
            investimento: row.investimento,
            cliques: row.cliques,
            impressoes: row.impressoes,
            conversoes: row.conversoes,
            lpViews: row.lpViews,
            leads: row.leads ?? 0,
          });
      return {
        lpName: row.lpName,
        leadsFonte: row.leadsFonte,
        lpKey: row.lpKey,
        url: row.url,
        semLink: row.semLink,
        correcoes: row.correcoes,
        values: {
          investimento: row.investimento,
          ingressosUnicos: row.ingressosUnicos ?? 0,
          ingressosTotais: row.ingressosTotais ?? 0,
          revenueUnico: row.revenueUnico ?? 0,
          revenueTotal: row.revenueTotal ?? 0,
          roas: m.roas ?? null,
          cplPagoUnico: m.cplPagoUnico ?? null,
          txConv: m.txConv,
          cpm: m.cpm,
          cpc: m.cpc,
          ctr: m.ctr,
          lpViews: row.lpViews,
          connectRate: m.connectRate,
          leads: row.leads ?? 0,
          cpl: m.cpl ?? null,
        },
      };
    });
    return computed.sort((a, b) => {
      // Story 18.83: "Sem link resolvido" fica no fim em qualquer ordenação,
      // como no perpétuo — é o resto, não uma página que compete com as outras.
      const sa = a.lpKey === CHAVE_SEM_LINK ? 1 : 0;
      const sb = b.lpKey === CHAVE_SEM_LINK ? 1 : 0;
      if (sa !== sb) return sa - sb;
      const av = a.values[sortCol] ?? 0;
      const bv = b.values[sortCol] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, isPaid, sortCol, sortDir]);

  // Story 18.62: linha "Total" no rodapé. Aditivas = soma dos inputs crus de
  // TODAS as `rows` (não `sortedRows` → imune ao sort, AC4); derivadas =
  // recalculadas pela MESMA calculadora aplicada aos totais (AC3 — nunca média).
  // `rows` já vem filtrada (Hot/Cold/range) pela seção pai, então o total bate
  // com as linhas visíveis (AC5) e o Investimento já traz o imposto de 12,15%.
  const totalsRow: Record<LpSortKey, number | null> | null = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const sum = rows.reduce(
      (acc, r) => ({
        investimento: acc.investimento + r.investimento,
        cliques: acc.cliques + r.cliques,
        impressoes: acc.impressoes + r.impressoes,
        conversoes: acc.conversoes + r.conversoes,
        lpViews: acc.lpViews + r.lpViews,
        ingressosUnicos: acc.ingressosUnicos + (r.ingressosUnicos ?? 0),
        ingressosTotais: acc.ingressosTotais + (r.ingressosTotais ?? 0),
        revenueUnico: acc.revenueUnico + (r.revenueUnico ?? 0),
        revenueTotal: acc.revenueTotal + (r.revenueTotal ?? 0),
        leads: acc.leads + (r.leads ?? 0),
      }),
      {
        investimento: 0,
        cliques: 0,
        impressoes: 0,
        conversoes: 0,
        lpViews: 0,
        ingressosUnicos: 0,
        ingressosTotais: 0,
        revenueUnico: 0,
        revenueTotal: 0,
        leads: 0,
      },
    );
    const m = isPaid
      ? calculatePaidMetrics({
          investimento: sum.investimento,
          cliques: sum.cliques,
          impressoes: sum.impressoes,
          conversoes: sum.conversoes,
          lpViews: sum.lpViews,
          ingressosUnicos: sum.ingressosUnicos,
          revenueTotal: sum.revenueTotal,
        })
      : calculateFreeMetrics({
          investimento: sum.investimento,
          cliques: sum.cliques,
          impressoes: sum.impressoes,
          conversoes: sum.conversoes,
          lpViews: sum.lpViews,
          leads: sum.leads,
        });
    return {
      investimento: sum.investimento,
      ingressosUnicos: sum.ingressosUnicos,
      ingressosTotais: sum.ingressosTotais,
      revenueUnico: sum.revenueUnico,
      revenueTotal: sum.revenueTotal,
      roas: m.roas ?? null,
      cplPagoUnico: m.cplPagoUnico ?? null,
      txConv: m.txConv,
      cpm: m.cpm,
      cpc: m.cpc,
      ctr: m.ctr,
      lpViews: sum.lpViews,
      connectRate: m.connectRate,
      leads: sum.leads,
      cpl: m.cpl ?? null,
    };
  }, [rows, isPaid]);

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Carregando...</div>;
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Nenhum dado disponível.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {/* Story 18.58/18.60: todos os headers com tooltip de cálculo + sort clicável */}
          <TableRow>
            {/* Coluna do chevron: só existe quando há mini-funil para mostrar. */}
            {expansivel && <TableHead className="w-8 px-1" />}
            {/* Coluna LP: tooltip, sem sort (texto/link via LpNameCell) */}
            <TableHead>
              <span
                title={tooltips.lp}
                className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
              >
                LP
              </span>
            </TableHead>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => handleSort(col.key)}
                title={col.tooltip}
                className="text-right cursor-pointer select-none hover:text-foreground"
              >
                <span className="inline-flex items-center justify-end gap-1">
                  {col.label}
                  {sortCol !== col.key ? (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  ) : sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row, i) => {
            // Story 18.83: a identidade da linha é a URL (modo URL) ou o rótulo.
            const id = row.lpKey ?? row.lpName;
            const semLink = row.lpKey === CHAVE_SEM_LINK;
            const aberta = expandidas.has(id);
            return (
              <React.Fragment key={id}>
                <TableRow className={aberta ? "border-b-0 bg-muted/30" : undefined}>
                  {expansivel && semLink && <TableCell className="px-1" />}
                  {expansivel && !semLink && (
                    <TableCell className="px-1">
                      <button
                        type="button"
                        onClick={() => toggleExpandir(id)}
                        aria-expanded={aberta}
                        aria-label={`${aberta ? "Recolher" : "Expandir"} funil da ${row.lpName}`}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {aberta ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    {modoUrl ? (
                      // Story 18.83: a linha É o link — sem lápis (AC6).
                      <LpUrlCell row={row} onSalvarCorrecao={onSalvarCorrecao} />
                    ) : (
                      // Story 18.56 (API anterior à 18.83): nome hiperlinkado +
                      // lápis (match pela chave normalizada, mesma do lpTotals).
                      <LpNameCell
                        lpName={row.lpName}
                        url={lpLinks?.[row.lpName.trim().toLowerCase()]}
                        onSave={onSaveLpLink}
                      />
                    )}
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-right tabular-nums">
                      {col.key === "leads" && row.leadsFonte === "pixel" && (
                        <span
                          title="Esta LP não tem formulário: os leads vêm do evento Lead do pixel da Meta"
                          className="mr-1.5 cursor-help rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-500"
                        >
                          pixel
                        </span>
                      )}
                      {formatCell(row.values[col.key], col.kind)}
                    </TableCell>
                  ))}
                </TableRow>

                {aberta && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={columns.length + (expansivel ? 2 : 1)} className="p-0">
                      {/*
                        `sticky left-0` porque a tabela tem 13 colunas e rola na
                        horizontal: sem isso, o card fica ancorado na borda
                        esquerda da TABELA, não da tela — quem rolou até o ROAS
                        para decidir qual LP abrir expandiria o card fora da
                        própria vista. No celular é a diferença entre ver e não
                        ver. A largura é contida no mesmo movimento: o card é uma
                        leitura vertical, e esticá-lo na tabela inteira afastaria
                        demais o rótulo da etapa do número dela.
                      */}
                      <div className="sticky left-0 w-[min(28rem,calc(100vw-3rem))] p-3">
                        <LpFunnelCard
                          lpName={row.lpName}
                          colorIndex={i}
                          stageType={stageType}
                          lpViews={row.values.lpViews ?? 0}
                          investimento={row.values.investimento ?? 0}
                          // Story 18.83 (AC9): casa pela URL (exata) ou pelo
                          // rótulo em maiúsculas (API anterior).
                          funil={funnelByLp?.[chaveDoCardDaLp(id)] ?? null}
                          refConversao={refConversao}
                          pctHeranca={pctHeranca}
                          temFonte={temFonte}
                          fontesPorEtapa={fontesPorEtapa}
                          isLoading={funnelLoading}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
        {/* Story 18.62: linha "Total" fixa no rodapé (imune ao sort). */}
        {totalsRow && (
          <TableFooter>
            <TableRow className="border-t-2 bg-muted/50 font-semibold hover:bg-muted/50">
              {expansivel && <TableCell className="px-1" />}
              <TableCell className="font-semibold">Total</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} className="text-right tabular-nums font-semibold">
                  {formatCell(totalsRow[col.key], col.kind)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
