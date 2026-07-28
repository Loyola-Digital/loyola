/**
 * Story 41.8 — Motor de cálculo do relatório de funil perpétuo (botão 3).
 *
 * `computePerpetualReport` é uma função PURA: recebe vendas e spend já
 * carregados e devolve o objeto de métricas. Isso não é preciosismo — é o que
 * permite conferir os 3 funis da §C.10 casa a casa em teste, sem depender de
 * planilha nem de rede.
 *
 * ⚠️ REGRA QUE ATRAVESSA O ARQUIVO (§C.3.6.1): a atribuição de uma venda a
 * campanha / conjunto / criativo é feita SEMPRE por ID — `utmCampaign` é o
 * Campaign ID, `utmMedium` o adset ID, `utmContent` o ad ID (padrão Loyola,
 * Stories 29.13 e 29.16). NUNCA por substring de nome. Os dois atalhos por nome
 * falharam em produção de formas silenciosas:
 *   - sufixo do nome (`estaticos`) casa com `hot--estaticos` E `cold--estaticos`
 *     → 4 campanhas somaram 484 vendas num funil de 246;
 *   - nome completo quebra quando o Meta reordena tokens (`[FZA1]` vai pro fim)
 *     → 38 de 209 vendas atribuídas, sem erro nenhum.
 * Venda sem ID resolvível vai para `semAtribuicao`, nunca para heurística.
 */

import { classifyTemperatura } from "../utils/lead-origin.js";
import { daysBetween, shiftDayKey } from "../utils/sale-date.js";
import type { PerpetualReportConfig, PerpetualRates } from "./perpetual-report-config.js";

// ------------------------------------------------------------------
// Entrada
// ------------------------------------------------------------------

/** Uma linha aprovada da planilha, já recortada no período e com dia civil de SP. */
export interface PerpetualSaleRow {
  email: string;
  dia: string;
  valorBruto: number;
  utmSource: string | null;
  /** Campaign ID. A ÚNICA chave de atribuição de campanha. */
  utmCampaign: string | null;
  /** Adset ID. */
  utmMedium: string | null;
  /** Ad ID. */
  utmContent: string | null;
  produto: string | null;
}

export interface CampaignSpendRow {
  campaignId: string;
  campaignName: string;
  /** Spend cru da Meta, sem gross-up. */
  spend: number;
  /** Spend com o imposto de mídia aplicado (§2.3c). */
  spendComImposto: number;
}

export interface AdSpendRow {
  adId: string;
  campaignId: string;
  spend: number;
}

export interface PerpetualReportInput {
  config: PerpetualReportConfig;
  rates: PerpetualRates;
  periodo: { inicio: string; fim: string };
  vendas: PerpetualSaleRow[];
  campanhas: CampaignSpendRow[];
  /** Opcional: sem ad-level, a invariante P1 é pulada e declarada. */
  anuncios?: AdSpendRow[];
  entrega?: { impressoes: number; cliques: number };
  /** Vendas contadas pelo pixel Meta — só para o alerta de divergência (W-P1). */
  vendasPixel?: number | null;
  /** id → nome, para exibir conjunto/criativo sem ID cru. */
  nomes?: { adsets?: Record<string, string>; ads?: Record<string, string> };
}

// ------------------------------------------------------------------
// Saída
// ------------------------------------------------------------------

export interface SegmentoRow {
  chave: string;
  label: string;
  investimento: number;
  pctInvestimento: number;
  vendas: number;
  faturamento: number;
  cac: number | null;
  roas: number | null;
  margem: number;
}

export interface MemorialLinha {
  label: string;
  valor: number;
  /** Fração aplicada sobre o bruto. Nulo nas linhas de total. */
  pct: number | null;
  tipo: "bruto" | "deducao" | "subtotal" | "investimento" | "resultado";
}

export interface TendenciaMetrica {
  metrica: string;
  total: number | null;
  ultimos7: number | null;
  deltaPct: number | null;
  /** true quando cair é melhorar (CAC). O render inverte a cor. */
  menorEhMelhor: boolean;
}

export interface PerpetualReportAlerta {
  codigo: string;
  mensagem: string;
}

export interface PerpetualReport {
  periodo: { inicio: string; fim: string; dias: number };
  kpis: {
    investimentoBruto: number;
    investimentoComImposto: number;
    vendas: number;
    transacoes: number;
    faturamentoBruto: number;
    ticketMedio: number | null;
    cac: number | null;
    roas: number | null;
    margem: number;
    margemPct: number | null;
    cacBreakeven: number | null;
    /** Quanto o CAC está acima (positivo) ou abaixo (negativo) do equilíbrio. */
    cacVsBreakeven: number | null;
    impressoes: number | null;
    cliques: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
  };
  memorialMargem: MemorialLinha[];
  segmentos: {
    quenteFrio: SegmentoRow[];
    /** Ausente quando `temSplitFormato` é false — some, não vai zerado (§C.9). */
    formato?: SegmentoRow[];
    campanhas: SegmentoRow[];
    /** Ausentes quando a maioria das vendas não traz o ID (W-P4). */
    publicos?: SegmentoRow[];
    criativos?: SegmentoRow[];
  };
  tendencia:
    | { disponivel: true; metricas: TendenciaMetrica[] }
    | { disponivel: false; motivo: string; vendasPorDia: { dia: string; vendas: number }[] };
  organico: { vendas: number; faturamento: number };
  reconciliacao: {
    somaCampanhas: number;
    sobreposicao: number;
    semAtribuicao: number;
  };
  alertas: PerpetualReportAlerta[];
  fontes: {
    expert: string;
    funil: string;
    produto: string | null;
    prefixoCampanha: string | null;
    campanhasVinculadas: number;
    receitaLiquidaPct: number;
    impostoPct: number;
  };
}

/** Invariante violada — o caller traduz em 422 (§C.8). */
export class InvarianteError extends Error {
  readonly erro = "INVARIANTE_VIOLADO";
  constructor(
    readonly codigo: string,
    readonly detalhe: string,
    readonly acao: string,
  ) {
    super(`${codigo}: ${detalhe}`);
    this.name = "InvarianteError";
  }
  toResponse() {
    return { erro: this.erro, codigo: this.codigo, detalhe: this.detalhe, acao: this.acao };
  }
}

const TOL = 0.01;

// ------------------------------------------------------------------
// Helpers de classificação
// ------------------------------------------------------------------

/** Remove acentos — a planilha traz `o-netão-te-ensina`, o Gerenciador pode não trazer. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Formato pelo nome da CAMPANHA (§C.3.6). Nunca pelo `utm_term`: nome de
 * criativo costuma conter "VIDEO" (`106_VIDEO_QUASE-CONCLUIU`) e envenenaria a
 * leitura. Campanha fora do padrão (ex.: `vencedores`) vira categoria própria.
 */
export function classifyFormato(campaignName: string): "videos" | "estaticos" | "outros" {
  const n = normalizeName(campaignName);
  if (n.includes("video")) return "videos";
  if (n.includes("estatic")) return "estaticos";
  return "outros";
}

const TEMP_LABEL: Record<string, string> = {
  quente: "🔥 Quente",
  frio: "❄️ Frio",
  indefinido: "Sem temperatura",
};

const FORMATO_LABEL: Record<string, string> = {
  videos: "Vídeos",
  estaticos: "Estáticos",
  outros: "Outros",
};

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------------
// Motor
// ------------------------------------------------------------------

export function computePerpetualReport(input: PerpetualReportInput): PerpetualReport {
  const { config, rates, periodo } = input;
  const alertas: PerpetualReportAlerta[] = [];
  const dias = daysBetween(periodo.inicio, periodo.fim);

  // ---- 1. Campanhas do funil: a fonte é o vínculo por ID (correção @po) ----
  const campanhaPorId = new Map(input.campanhas.map((c) => [c.campaignId, c]));
  const investimentoBruto = input.campanhas.reduce((s, c) => s + c.spend, 0);
  const investimentoComImposto = input.campanhas.reduce((s, c) => s + c.spendComImposto, 0);

  // ---- 2. Separar venda paga de orgânica (§C.3.1) ----
  const origensPagas = new Set(config.origensPagas.map((o) => o.toLowerCase()));
  const pagas: PerpetualSaleRow[] = [];
  const organicas: PerpetualSaleRow[] = [];
  for (const v of input.vendas) {
    const src = (v.utmSource ?? "").toLowerCase();
    if (origensPagas.has(src)) pagas.push(v);
    else organicas.push(v);
  }

  // ---- 3. Unidade contada: e-mail distinto (§C.3.2) ----
  // Order bump conta no faturamento mas não cria comprador — por isso vendas é
  // contagem de e-mails e transações é contagem de linhas.
  const emailsPagos = new Set(pagas.map((v) => v.email.trim().toLowerCase()));
  const vendas = emailsPagos.size;
  const transacoes = pagas.length;
  const faturamentoBruto = pagas.reduce((s, v) => s + v.valorBruto, 0);

  const ticketMedio = safeDiv(faturamentoBruto, vendas);
  const cac = safeDiv(investimentoComImposto, vendas);
  const roas = safeDiv(faturamentoBruto, investimentoComImposto);

  // ---- 4. Margem de contribuição (§C.3.4) ----
  const receitaLiquida = faturamentoBruto * rates.receitaLiquidaPct;
  const margem = receitaLiquida - investimentoComImposto;
  const memorialMargem = buildMemorial(faturamentoBruto, rates, investimentoComImposto, receitaLiquida, margem);

  // ---- 5. CAC de equilíbrio (§C.3.5) ----
  // Note que NÃO entra o reembolso: o ponto de equilíbrio é sobre as taxas que
  // incidem em toda venda, não sobre a estimativa de devolução.
  const cacBreakeven =
    ticketMedio === null
      ? null
      : ticketMedio * (1 - rates.plataforma - rates.imposto - rates.outros);

  // ---- 6. Segmentação (§C.3.6) — atribuição SEMPRE por ID ----
  const seg = buildSegmentos(input, pagas, campanhaPorId, investimentoComImposto, rates, alertas);

  // ---- 7. Tendência (§C.3.7) ----
  const tendencia = buildTendencia(input, pagas, dias, periodo, rates, alertas);

  // ---- 8. Alertas de qualidade ----
  if (input.vendasPixel != null && input.vendasPixel !== vendas) {
    alertas.push({
      codigo: "W-P1",
      mensagem: `Divergência pixel × planilha: ${input.vendasPixel} vs ${vendas} vendas. A planilha é a fonte do relatório.`,
    });
  }
  if (vendas > 0 && vendas < 20) {
    alertas.push({
      codigo: "W-P2",
      mensagem: `Amostra pequena (${vendas} vendas): leituras por criativo e por público são direcionais — não desligue criativo por CAC alto com esse volume.`,
    });
  }
  for (const c of input.campanhas) {
    if (c.spend > 0 && !seg.vendasPorCampanha.has(c.campaignId)) {
      alertas.push({
        codigo: "W-P5",
        mensagem: `Campanha "${c.campaignName}" gastou ${c.spend.toFixed(2)} e não teve venda atribuída.`,
      });
    }
  }
  if (seg.semAtribuicao > 0) {
    alertas.push({
      codigo: "W-P6",
      mensagem: `${seg.semAtribuicao} venda(s) sem campanha identificável — é a diferença entre o total e o que as tabelas por campanha somam.`,
    });
  }
  if (organicas.length > 0) {
    alertas.push({
      codigo: "ORGANICO",
      mensagem: `${organicas.length} venda(s) fora do tráfego pago — ficam fora de CAC, ROAS e margem.`,
    });
  }

  const report: PerpetualReport = {
    periodo: { ...periodo, dias },
    kpis: {
      investimentoBruto: round2(investimentoBruto),
      investimentoComImposto: round2(investimentoComImposto),
      vendas,
      transacoes,
      faturamentoBruto: round2(faturamentoBruto),
      ticketMedio,
      cac,
      roas,
      margem,
      margemPct: safeDiv(margem, faturamentoBruto),
      cacBreakeven,
      cacVsBreakeven: cac !== null && cacBreakeven !== null ? cac - cacBreakeven : null,
      impressoes: input.entrega?.impressoes ?? null,
      cliques: input.entrega?.cliques ?? null,
      ctr: input.entrega ? safeDiv(input.entrega.cliques, input.entrega.impressoes) : null,
      cpc: input.entrega ? safeDiv(investimentoComImposto, input.entrega.cliques) : null,
      cpm: input.entrega
        ? safeDiv(investimentoComImposto * 1000, input.entrega.impressoes)
        : null,
    },
    memorialMargem,
    segmentos: seg.segmentos,
    tendencia,
    organico: {
      vendas: new Set(organicas.map((v) => v.email.trim().toLowerCase())).size,
      faturamento: round2(organicas.reduce((s, v) => s + v.valorBruto, 0)),
    },
    reconciliacao: {
      somaCampanhas: seg.somaCampanhas,
      sobreposicao: seg.sobreposicao,
      semAtribuicao: seg.semAtribuicao,
    },
    alertas,
    fontes: {
      expert: config.projectName,
      funil: config.funnelName,
      produto: config.produto,
      prefixoCampanha: config.prefixoCampanha,
      campanhasVinculadas: config.campanhas.length,
      receitaLiquidaPct: rates.receitaLiquidaPct,
      impostoPct: config.impostoPct,
    },
  };

  assertInvariantes(report, input, receitaLiquida, vendas, alertas, seg.emailsPorDimensao);
  return report;
}

// ------------------------------------------------------------------
// Memorial (§C.3.4) — linha a linha, nunca só o resultado
// ------------------------------------------------------------------

function buildMemorial(
  bruto: number,
  rates: PerpetualRates,
  investimento: number,
  receitaLiquida: number,
  margem: number,
): MemorialLinha[] {
  const linhas: MemorialLinha[] = [
    { label: "Faturamento bruto", valor: round2(bruto), pct: null, tipo: "bruto" },
    {
      label: "Taxa de plataforma",
      valor: -round2(bruto * rates.plataforma),
      pct: rates.plataforma,
      tipo: "deducao",
    },
    { label: "Imposto", valor: -round2(bruto * rates.imposto), pct: rates.imposto, tipo: "deducao" },
    { label: "Outros", valor: -round2(bruto * rates.outros), pct: rates.outros, tipo: "deducao" },
  ];
  // Só aparece quando a planilha não tem status real — senão o reembolso já saiu
  // do bruto e a linha seria uma cobrança em dobro.
  if (rates.reembolso > 0) {
    linhas.push({
      label: "Reembolso (estimado)",
      valor: -round2(bruto * rates.reembolso),
      pct: rates.reembolso,
      tipo: "deducao",
    });
  }
  linhas.push(
    {
      label: "Receita líquida",
      valor: round2(receitaLiquida),
      pct: rates.receitaLiquidaPct,
      tipo: "subtotal",
    },
    {
      label: "Investimento (com imposto)",
      valor: -round2(investimento),
      pct: null,
      tipo: "investimento",
    },
    { label: "MARGEM DE CONTRIBUIÇÃO", valor: round2(margem), pct: null, tipo: "resultado" },
  );
  return linhas;
}

// ------------------------------------------------------------------
// Segmentação — toda atribuição por ID (§C.3.6.1)
// ------------------------------------------------------------------

interface Bucket {
  investimento: number;
  emails: Set<string>;
  faturamento: number;
  label: string;
}

function emptyBucket(label: string): Bucket {
  return { investimento: 0, emails: new Set(), faturamento: 0, label };
}

function toRows(
  buckets: Map<string, Bucket>,
  investimentoTotal: number,
  rates: PerpetualRates,
): SegmentoRow[] {
  return [...buckets.entries()]
    .map(([chave, b]) => {
      const vendas = b.emails.size;
      return {
        chave,
        label: b.label,
        investimento: round2(b.investimento),
        pctInvestimento: investimentoTotal === 0 ? 0 : b.investimento / investimentoTotal,
        vendas,
        faturamento: round2(b.faturamento),
        cac: safeDiv(b.investimento, vendas),
        roas: safeDiv(b.faturamento, b.investimento),
        margem: round2(b.faturamento * rates.receitaLiquidaPct - b.investimento),
      };
    })
    .sort((a, b) => b.investimento - a.investimento);
}

function buildSegmentos(
  input: PerpetualReportInput,
  pagas: PerpetualSaleRow[],
  campanhaPorId: Map<string, CampaignSpendRow>,
  investimentoTotal: number,
  rates: PerpetualRates,
  alertas: PerpetualReportAlerta[],
) {
  const { config } = input;

  const quenteFrio = new Map<string, Bucket>();
  const formato = new Map<string, Bucket>();
  const campanhas = new Map<string, Bucket>();
  const publicos = new Map<string, Bucket>();
  const criativos = new Map<string, Bucket>();

  // --- investimento: vem da campanha, distribuído pelas classificações do NOME dela
  for (const c of input.campanhas) {
    const temp = classifyTemperatura(c.campaignName);
    const fmt = classifyFormato(c.campaignName);

    getOrInit(quenteFrio, temp, TEMP_LABEL[temp] ?? temp).investimento += c.spendComImposto;
    if (config.temSplitFormato) {
      getOrInit(formato, fmt, FORMATO_LABEL[fmt] ?? fmt).investimento += c.spendComImposto;
    }
    getOrInit(campanhas, c.campaignId, c.campaignName).investimento += c.spendComImposto;
  }

  // --- vendas: atribuição por ID. Sem ID resolvível → semAtribuicao.
  const vendasPorCampanha = new Map<string, Set<string>>();
  const emailsAtribuidos = new Map<string, Set<string>>(); // email → campanhas
  const emailsSemAtribuicao = new Set<string>();
  let comMedium = 0;
  let comContent = 0;

  for (const v of pagas) {
    const email = v.email.trim().toLowerCase();
    const cid = v.utmCampaign?.trim() || null;
    const campanha = cid ? campanhaPorId.get(cid) : undefined;

    if (!campanha) {
      // ⚠️ Aqui é onde a tentação de "achar pelo nome" apareceria. Não caímos
      // nela: sem ID que bata com campanha vinculada, a venda é declarada.
      emailsSemAtribuicao.add(email);
    } else {
      const temp = classifyTemperatura(campanha.campaignName);
      const fmt = classifyFormato(campanha.campaignName);

      addVenda(getOrInit(quenteFrio, temp, TEMP_LABEL[temp] ?? temp), email, v.valorBruto);
      if (config.temSplitFormato) {
        addVenda(getOrInit(formato, fmt, FORMATO_LABEL[fmt] ?? fmt), email, v.valorBruto);
      }
      addVenda(
        getOrInit(campanhas, campanha.campaignId, campanha.campaignName),
        email,
        v.valorBruto,
      );

      if (!vendasPorCampanha.has(campanha.campaignId)) {
        vendasPorCampanha.set(campanha.campaignId, new Set());
      }
      vendasPorCampanha.get(campanha.campaignId)!.add(email);

      if (!emailsAtribuidos.has(email)) emailsAtribuidos.set(email, new Set());
      emailsAtribuidos.get(email)!.add(campanha.campaignId);
    }

    // Público e criativo: agrupados por NOME resolvido (em CBO o mesmo criativo
    // existe em dezenas de conjuntos), mas a chave de origem é o ID.
    const adsetId = v.utmMedium?.trim() || null;
    if (adsetId) {
      comMedium++;
      const nome = input.nomes?.adsets?.[adsetId] ?? adsetId;
      addVenda(getOrInit(publicos, normalizeName(nome), nome), email, v.valorBruto);
    }
    const adId = v.utmContent?.trim() || null;
    if (adId) {
      comContent++;
      const nome = input.nomes?.ads?.[adId] ?? adId;
      addVenda(getOrInit(criativos, normalizeName(nome), nome), email, v.valorBruto);
    }
  }

  // --- investimento por anúncio → público/criativo, quando houver ad-level
  for (const a of input.anuncios ?? []) {
    const nome = input.nomes?.ads?.[a.adId];
    if (!nome) continue;
    const b = criativos.get(normalizeName(nome));
    if (b) b.investimento += a.spend;
  }

  // --- W-P4: dimensão indisponível quando a maioria das vendas não traz o ID
  const total = pagas.length;
  const publicoIndisponivel = total > 0 && comMedium / total <= 0.5;
  const criativoIndisponivel = total > 0 && comContent / total <= 0.5;
  if (publicoIndisponivel || criativoIndisponivel) {
    const quais = [publicoIndisponivel && "público", criativoIndisponivel && "criativo"]
      .filter(Boolean)
      .join(" e ");
    alertas.push({
      codigo: "W-P4",
      mensagem: `Dimensão de ${quais} indisponível: mais da metade das vendas não traz o ID na UTM.`,
    });
  }

  // --- reconciliação (§C.3.6.2)
  const somaCampanhas = [...vendasPorCampanha.values()].reduce((s, set) => s + set.size, 0);
  // Sobreposição: quem comprou depois de clicar em anúncios de campanhas
  // diferentes é contado uma vez por campanha, mas é UM comprador no total.
  let sobreposicao = 0;
  for (const campanhasDoEmail of emailsAtribuidos.values()) {
    if (campanhasDoEmail.size > 1) sobreposicao += campanhasDoEmail.size - 1;
  }
  // Só conta como "sem atribuição" quem NÃO apareceu em nenhuma campanha.
  const semAtribuicao = [...emailsSemAtribuicao].filter((e) => !emailsAtribuidos.has(e)).length;

  // União de e-mails por dimensão. Necessária porque somar os baldes NÃO serve
  // de checagem: um comprador pode legitimamente aparecer em dois baldes da
  // mesma dimensão (clicou num anúncio quente e depois num frio). Ver P7b.
  const unir = (m: Map<string, Bucket>) => {
    const u = new Set<string>();
    for (const b of m.values()) for (const e of b.emails) u.add(e);
    return u;
  };
  const emailsPorDimensao: Record<string, Set<string>> = {
    quenteFrio: unir(quenteFrio),
    campanhas: unir(campanhas),
    formato: unir(formato),
    publicos: unir(publicos),
    criativos: unir(criativos),
  };

  const segmentos: PerpetualReport["segmentos"] = {
    quenteFrio: toRows(quenteFrio, investimentoTotal, rates),
    campanhas: toRows(campanhas, investimentoTotal, rates),
  };
  // Ausente ≠ zerado: sem split, a seção some do relatório (§C.9).
  if (config.temSplitFormato) segmentos.formato = toRows(formato, investimentoTotal, rates);
  if (!publicoIndisponivel && publicos.size > 0) {
    segmentos.publicos = toRows(publicos, investimentoTotal, rates);
  }
  if (!criativoIndisponivel && criativos.size > 0) {
    segmentos.criativos = toRows(criativos, investimentoTotal, rates);
  }

  return {
    segmentos,
    vendasPorCampanha,
    somaCampanhas,
    sobreposicao,
    semAtribuicao,
    emailsPorDimensao,
  };
}

function getOrInit(map: Map<string, Bucket>, chave: string, label: string): Bucket {
  let b = map.get(chave);
  if (!b) {
    b = emptyBucket(label);
    map.set(chave, b);
  }
  return b;
}

function addVenda(bucket: Bucket, email: string, valor: number): void {
  bucket.emails.add(email);
  bucket.faturamento += valor;
}

// ------------------------------------------------------------------
// Tendência (§C.3.7)
// ------------------------------------------------------------------

function buildTendencia(
  input: PerpetualReportInput,
  pagas: PerpetualSaleRow[],
  dias: number,
  periodo: { inicio: string; fim: string },
  rates: PerpetualRates,
  alertas: PerpetualReportAlerta[],
): PerpetualReport["tendencia"] {
  if (dias < 14) {
    alertas.push({
      codigo: "W-P3",
      mensagem: `Tendência não aplicável — funil com ${dias} dia(s) no recorte. Funil novo fica em aprendizado e não sustenta leitura de tendência.`,
    });
    const porDia = new Map<string, number>();
    for (const v of pagas) porDia.set(v.dia, (porDia.get(v.dia) ?? 0) + 1);
    return {
      disponivel: false,
      motivo: `Recorte de ${dias} dia(s) — a comparação exige 14 ou mais.`,
      vendasPorDia: [...porDia.entries()]
        .map(([dia, vendas]) => ({ dia, vendas }))
        .sort((a, b) => a.dia.localeCompare(b.dia)),
    };
  }

  const inicio7 = shiftDayKey(periodo.fim, -6);
  const ultimos = pagas.filter((v) => v.dia >= inicio7);

  const agg = (rows: PerpetualSaleRow[], janelaDias: number) => {
    const emails = new Set(rows.map((v) => v.email.trim().toLowerCase()));
    const fat = rows.reduce((s, v) => s + v.valorBruto, 0);
    // Investimento é rateado pela janela: não temos spend diário aqui, e o
    // objetivo é comparar ritmo, não fechar caixa.
    const invTotal = input.campanhas.reduce((s, c) => s + c.spendComImposto, 0);
    const inv = (invTotal / dias) * janelaDias;
    return {
      investimento: inv,
      vendas: emails.size,
      faturamento: fat,
      ticket: safeDiv(fat, emails.size),
      cac: safeDiv(inv, emails.size),
      roas: safeDiv(fat, inv),
    };
  };

  const t = agg(pagas, dias);
  const u = agg(ultimos, Math.min(7, dias));

  const delta = (a: number | null, b: number | null) =>
    a === null || b === null || a === 0 ? null : ((b - a) / Math.abs(a)) * 100;

  const metricas: TendenciaMetrica[] = [
    { metrica: "Investimento", total: t.investimento, ultimos7: u.investimento, deltaPct: delta(t.investimento, u.investimento), menorEhMelhor: false },
    { metrica: "Vendas", total: t.vendas, ultimos7: u.vendas, deltaPct: delta(t.vendas, u.vendas), menorEhMelhor: false },
    { metrica: "Faturamento", total: t.faturamento, ultimos7: u.faturamento, deltaPct: delta(t.faturamento, u.faturamento), menorEhMelhor: false },
    { metrica: "Ticket médio", total: t.ticket, ultimos7: u.ticket, deltaPct: delta(t.ticket, u.ticket), menorEhMelhor: false },
    // CAC é a única em que cair é melhorar — o render inverte a cor (§C.4).
    { metrica: "CAC", total: t.cac, ultimos7: u.cac, deltaPct: delta(t.cac, u.cac), menorEhMelhor: true },
    { metrica: "ROAS", total: t.roas, ultimos7: u.roas, deltaPct: delta(t.roas, u.roas), menorEhMelhor: false },
  ];

  return { disponivel: true, metricas };
}

// ------------------------------------------------------------------
// Invariantes P1–P7 (§C.6 + §C.3.6.2)
// ------------------------------------------------------------------

function assertInvariantes(
  report: PerpetualReport,
  input: PerpetualReportInput,
  receitaLiquida: number,
  totalVendas: number,
  alertas: PerpetualReportAlerta[],
  emailsPorDimensao: Record<string, Set<string>>,
): void {
  const { kpis, segmentos, reconciliacao } = report;

  // P1 — Σ spend dos anúncios == Σ spend das campanhas
  if (input.anuncios && input.anuncios.length > 0) {
    const somaAds = input.anuncios.reduce((s, a) => s + a.spend, 0);
    const somaCamps = input.campanhas.reduce((s, c) => s + c.spend, 0);
    const diff = Math.abs(somaAds - somaCamps);
    if (diff > TOL) {
      // Cauda não capturada é comum; a spec manda DECLARAR o valor, não travar
      // quando a diferença é só de arredondamento de coleta.
      alertas.push({
        codigo: "P1-CAUDA",
        mensagem: `Diferença de R$ ${diff.toFixed(2)} entre o spend por anúncio e por campanha — cauda não capturada.`,
      });
    }
  }

  // P2 — todo c= de venda paga ∈ campanhas do funil (exato)
  // Não bloqueia: o desenho é declarar em `semAtribuicao` (W-P6). Bloquear aqui
  // impediria o relatório de um funil cujo histórico tem campanha desvinculada.
  // O que NÃO pode é sumir em silêncio — e não some.

  // P3 — Σ investimento dos segmentos de temperatura == total
  const somaTemp = segmentos.quenteFrio.reduce((s, r) => s + r.investimento, 0);
  if (Math.abs(somaTemp - kpis.investimentoComImposto) > TOL) {
    throw new InvarianteError(
      "P3",
      `soma do investimento por temperatura (${somaTemp.toFixed(2)}) difere do total (${kpis.investimentoComImposto.toFixed(2)})`,
      "Verificar a classificação hot/cold das campanhas vinculadas ao funil",
    );
  }

  // P4 — Σ investimento por formato == total (só com split)
  if (segmentos.formato) {
    const somaFmt = segmentos.formato.reduce((s, r) => s + r.investimento, 0);
    if (Math.abs(somaFmt - kpis.investimentoComImposto) > TOL) {
      throw new InvarianteError(
        "P4",
        `soma do investimento por formato (${somaFmt.toFixed(2)}) difere do total (${kpis.investimentoComImposto.toFixed(2)})`,
        "Conferir se todas as campanhas caem em vídeos, estáticos ou outros",
      );
    }
  }

  // P5 — receita líquida == faturamento × receitaLiquidaPct
  const esperado = kpis.faturamentoBruto * report.fontes.receitaLiquidaPct;
  if (Math.abs(receitaLiquida - esperado) > TOL) {
    throw new InvarianteError(
      "P5",
      `receita líquida (${receitaLiquida.toFixed(2)}) não bate com ${(report.fontes.receitaLiquidaPct * 100).toFixed(2)}% do bruto`,
      "Conferir as taxas configuradas para este funil",
    );
  }

  // P6 — margem == receita líquida − investimento
  if (Math.abs(kpis.margem - (receitaLiquida - kpis.investimentoComImposto)) > TOL) {
    throw new InvarianteError(
      "P6",
      `margem (${kpis.margem.toFixed(2)}) não é receita líquida menos investimento`,
      "Bug de cálculo — não conferir manualmente, reportar",
    );
  }

  // P7 — reconciliação de granularidade (§C.3.6.2)
  const reconciliado =
    reconciliacao.somaCampanhas - reconciliacao.sobreposicao + reconciliacao.semAtribuicao;
  if (reconciliado !== totalVendas) {
    throw new InvarianteError(
      "P7",
      `soma por campanha (${reconciliacao.somaCampanhas}) − sobreposição (${reconciliacao.sobreposicao}) + sem atribuição (${reconciliacao.semAtribuicao}) = ${reconciliado}, mas o total é ${totalVendas}`,
      "Bug de atribuição — a tabela por campanha não fecha com o total de vendas",
    );
  }

  // P7b — nenhuma dimensão pode conter mais COMPRADORES que o total.
  //
  // ⚠️ A §C.3.6.2 escreve isso como `Σ vendas(dimensão) <= total_vendas`, e essa
  // forma dá falso positivo: um comprador pode legitimamente cair em dois baldes
  // da mesma dimensão (clicou num anúncio quente e voltou por um frio), e aí a
  // soma dos baldes passa do total sem que nada esteja errado. É o mesmo
  // fenômeno de sobreposição que a própria §C.3.6.2 reconhece para campanhas —
  // ela só não estendeu a ressalva às outras dimensões.
  //
  // A checagem correta é sobre a UNIÃO dos e-mails: essa sim nunca pode passar
  // do total, e continua pegando o bug que a invariante existe para pegar
  // (venda atribuída a uma campanha que não é do funil).
  for (const [nome, emails] of Object.entries(emailsPorDimensao)) {
    if (emails.size > totalVendas) {
      throw new InvarianteError(
        "P7",
        `dimensão "${nome}" tem ${emails.size} compradores distintos, acima do total de ${totalVendas}`,
        "Bug de atribuição — há venda entrando numa dimensão sem estar no total",
      );
    }
  }
}
