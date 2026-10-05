/**
 * Story 49.3 — I/O do Motor I do Debriefing (dinheiro e tempo).
 *
 * Lê do banco e das planilhas e entrega ao motor puro
 * (`debriefing-money-time-engine.ts`) o que ele precisa, sem calcular nada:
 *
 * - **mídia**: `meta_campaign_insights_daily` (spend CRU — não o de
 *   `stage-daily`/`accumulate`, que já sai com `applyMetaTax` e impediria o
 *   override `imposto_pct`), só das campanhas vinculadas a cada etapa
 *   (`funnel_stages.campaigns`). `link_click` sai de `actions` distinguindo
 *   ausente (`null`) de zero (`0`) — nunca `parseActionCount`, que devolve 0
 *   para ausente;
 * - **vendas**: as planilhas de `resolveSalesSheetsForStage` lidas por
 *   `readSheetData`, com preço, data e telefone entregues COMO NA CÉLULA
 *   (R-49-4: os `parseNumber*` locais leem `"4.000"` como 4). A mesma aba
 *   (`spreadsheetId` + `sheetName`) ligada a mais de uma etapa é lida UMA vez,
 *   com o vínculo de `escolherVinculoDaFonte`, e declarada em
 *   `fontesDuplicadas` (REL-001 — no PG02 a `n8n-kiwify-downsell` dobrava o
 *   downsell);
 * - **leads**: as fontes da jornada (`funnel_surveys` + `funnel_spreadsheets`
 *   que não são de venda, filtradas pela etapa) — mesmo critério de
 *   `fontesDeOrigem` em `routes/stage-sales-journey.ts`, replicado aqui sem
 *   mudar a rota;
 * - **vendas manuais** (`manual_sales`, decisão 3A): as da etapa, sem as
 *   reembolsadas (`refunded_at`), com o valor BRUTO (`value`) — a mesma leitura
 *   de `computeSalesDailyForStage` (`sales-daily-sync.ts`), replicada aqui sem
 *   mudar o serviço. Viram uma "planilha" a mais da etapa, de plataforma
 *   `"manual"`; o `seller_name` vai como `sellerName` (Closer do Netão). Nome,
 *   CPF e endereço do cliente nunca são lidos;
 * - **janela** (decisão 2A): `janelaDoDebriefing(config.datasChave)` — a mesma
 *   que o motor usa para cortar vendas e mídia;
 * - **nome da campanha das UTMs** (decisão 4): `utm_campaign` (id) → nome em
 *   `funnel_stages.campaigns` e, na falta, em `meta_ad_insights_daily`;
 * - **config do classificador** (`montarConfigClassificador`, reusada pela
 *   49.4): `closerMediums`/`closerPorSellerName`/`ferramentasDeAtendimento` da
 *   config da 49.1 + nomes de `seller_aliases` e `stage_event_closers`.
 *
 * Nenhuma chamada à Meta, nenhum fan-out por campanha/criativo (regra de rate
 * limit do projeto). Planilha configurada que falha ao ler lança
 * `DADO_INDISPONIVEL` — nunca vira lista vazia ("erro virando ausência na tela").
 */

import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { CLASSIFICADOR_VERSAO, classificarOrigem, type ConfigClassificador, type Utm } from "@loyola-x/shared";
import {
  funnelSpreadsheets,
  funnelStages,
  funnelSurveys,
  manualSales,
  metaAdInsightsDaily,
  metaCampaignInsightsDaily,
  sellerAliases,
  stageEventClosers,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import type { Database } from "../db/client.js";
import { readSheetData } from "./google-sheets.js";
import { resolveSalesSheetsForStage, type ResolvedSalesSheet } from "./sales-daily-sync.js";
import { camada2ValeNaEtapa } from "./vendas-camada2-planilha.js";
import type { DebriefingConfigLancamento, DebriefingPapel } from "./debriefing-config.js";
import { TIPOS_DE_PRODUTO, productKey, tipoDoProduto, type TipoDeProduto } from "../utils/produto.js";
import { tipoPadraoDaEtapa } from "../utils/order-bump.js";
import {
  PLATAFORMA_MANUAL,
  desembrulharUtm,
  janelaDoDebriefing,
  resolverColunaPrecoDebriefing,
  type JanelaDoDebriefing,
} from "./debriefing-hygiene.js";
import type {
  ClassificadorInjetado,
  DebriefingMoneyTimeInput,
  FonteDuplicada,
  LeadInput,
  MidiaCampanhaDiaInput,
  PlanilhaDeVendaInput,
  VendaCruaInput,
} from "./debriefing-money-time-engine.js";

// ---------------------------------------------------------------------------
// Erro de dado
// ---------------------------------------------------------------------------

/** Dado configurado que não pôde ser lido. A 49.6 traduz em 422. */
export class DebriefingDadoIndisponivelError extends Error {
  readonly erro = "DADO_INDISPONIVEL";
  constructor(
    readonly detalhe: string,
    readonly acao: string,
  ) {
    super(detalhe);
    this.name = "DebriefingDadoIndisponivelError";
  }
  toResponse(): { erro: "DADO_INDISPONIVEL"; detalhe: string; acao: string } {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

// ---------------------------------------------------------------------------
// Peças puras (testáveis sem banco)
// ---------------------------------------------------------------------------

/**
 * `link_click` de uma linha de `meta_campaign_insights_daily.actions`.
 *
 * `actions` nulo ou sem `link_click` → `null` (não medido); `link_click` com
 * valor `0` → `0`. NÃO usar `parseActionCount` (`utils/meta-metrics.ts`), que
 * devolve 0 para ausente e reintroduziria o fallback silencioso.
 */
export function linkClicksDeActions(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  const a = actions.find(
    (x): x is { action_type: string; value: unknown } =>
      typeof x === "object" && x !== null && (x as { action_type?: unknown }).action_type === "link_click",
  );
  if (!a) return null;
  const n = typeof a.value === "number" ? a.value : Number.parseFloat(String(a.value ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** Valor numérico do Postgres (`numeric` chega string). Não é célula de planilha. */
function numeroDoBanco(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Índice por mapeamento explícito; fallback por apelido (mesmo padrão da jornada). */
function acharColuna(headers: readonly string[], mapeado: unknown, apelidos: RegExp | null): number {
  if (typeof mapeado === "string" && mapeado.trim()) {
    const i = headers.indexOf(mapeado);
    if (i !== -1) return i;
  }
  return apelidos ? headers.findIndex((h) => apelidos.test(h.trim())) : -1;
}

const APELIDOS = {
  email: /e-?mail/i,
  telefone: /telefone|whats|phone|celular/i,
  utm_source: /^utm_?source$|^s=$/i,
  utm_medium: /^utm_?medium$|^m=$/i,
  utm_campaign: /^utm_?campaign$|^c=$|^ca=$/i,
  utm_term: /^utm_?term$|^t=$|^te=$/i,
  dataLead: /^(data|date|timestamp|carimbo de data\/hora|submitted at)$/i,
} as const;

function celula(row: readonly string[], i: number): string | null {
  if (i === -1) return null;
  const v = (row[i] ?? "").trim();
  return v ? v : null;
}

/** Normaliza o mapa `product_types` (chave canônica, só tipos válidos). */
export function normalizarTiposDeProduto(
  mapas: readonly (Record<string, string> | null | undefined)[],
): Record<string, TipoDeProduto> {
  const validos = new Set<string>(TIPOS_DE_PRODUTO);
  const out: Record<string, TipoDeProduto> = {};
  for (const mapa of mapas) {
    for (const [prod, tipo] of Object.entries(mapa ?? {})) {
      const k = productKey(prod);
      if (k && validos.has(tipo)) out[k] = tipo as TipoDeProduto;
    }
  }
  return out;
}

export interface PlanilhaDeVendaLida {
  planilhaId: string;
  stageId: string;
  stageType: string | null;
  nome: string;
  plataforma: string;
  headers: readonly string[];
  rows: readonly string[][];
  mapping: Record<string, unknown>;
}

/**
 * Uma planilha de venda → linhas cruas para o motor. Pura.
 *
 * O preço sai da coluna resolvida por `resolverColunaPrecoDebriefing` e vai
 * como STRING (a célula). O tipo do produto é `product_types` quando o produto
 * consta lá (`tipoDoProduto`), senão o default da etapa (`tipoPadraoDaEtapa`)
 * com `tipoClassificado = false` — é o que alimenta `produtosNaoClassificados`.
 */
export function lerPlanilhaDeVenda(
  p: PlanilhaDeVendaLida,
  tiposDeProduto: Record<string, TipoDeProduto>,
): { planilha: PlanilhaDeVendaInput; vendas: VendaCruaInput[]; precoMappingDivergente: string | null } {
  const { headers, rows, mapping } = p;
  const ehTmbPlanilha = p.plataforma.trim().toLowerCase() === "tmb";

  const colPreco = resolverColunaPrecoDebriefing(
    (typeof mapping.valorBruto === "string" ? mapping.valorBruto : null) ??
      (typeof mapping.value === "string" ? mapping.value : null),
    headers,
  );
  const precoIdx = colPreco.coluna ? headers.indexOf(colPreco.coluna) : -1;
  if (precoIdx === -1 && !ehTmbPlanilha) {
    throw new DebriefingDadoIndisponivelError(
      `a planilha de vendas "${p.nome}" não tem coluna de preço utilizável (mapeada: ${colPreco.colunaDoMapping ?? "nenhuma"})`,
      "Mapear a coluna de preço BRUTO (\"Preço\") no wizard de planilhas da etapa",
    );
  }

  const exata = (campo: string) => acharColuna(headers, mapping[campo], null);
  const txIdx = exata("transactionId");
  const produtoIdx = exata("productName");
  const statusIdx = exata("status");
  const dataIdx = acharColuna(headers, mapping.dataVenda ?? mapping.date, null);
  const emailIdx = acharColuna(headers, mapping.email, APELIDOS.email);
  const telIdx = acharColuna(headers, mapping.telefone ?? mapping.phone, APELIDOS.telefone);
  const srcIdx = acharColuna(headers, mapping.utm_source, APELIDOS.utm_source);
  const medIdx = acharColuna(headers, mapping.utm_medium, APELIDOS.utm_medium);
  const cmpIdx = acharColuna(headers, mapping.utm_campaign, APELIDOS.utm_campaign);
  const termIdx = acharColuna(headers, mapping.utm_term, APELIDOS.utm_term);
  const closerIdx = exata("closer");
  const moedaIdx = headers.findIndex((h) => /moeda|currency/i.test(h));

  const vendas: VendaCruaInput[] = [];
  rows.forEach((row, i) => {
    const email = celula(row, emailIdx);
    const tx = celula(row, txIdx);
    const produto = celula(row, produtoIdx);
    const preco = celula(row, precoIdx);
    const data = celula(row, dataIdx);
    if (!email && !tx && !produto && !preco && !data) return; // linha vazia

    const classificado = !!produto && Object.prototype.hasOwnProperty.call(tiposDeProduto, productKey(produto));
    vendas.push({
      planilhaId: p.planilhaId,
      linha: i + 1,
      idDaVendaCru: tx,
      produto,
      tipo: classificado ? tipoDoProduto(produto, tiposDeProduto) : tipoPadraoDaEtapa(p.stageType),
      tipoClassificado: classificado,
      valorBrutoCru: preco,
      moeda: celula(row, moedaIdx),
      statusCru: celula(row, statusIdx),
      emailCru: email,
      telefoneCru: celula(row, telIdx),
      dataVendaCru: data,
      utm: {
        source: celula(row, srcIdx),
        medium: celula(row, medIdx),
        campaign: celula(row, cmpIdx),
        term: celula(row, termIdx),
      },
      sellerName: celula(row, closerIdx),
    });
  });

  return {
    planilha: {
      planilhaId: p.planilhaId,
      stageId: p.stageId,
      nome: p.nome,
      plataforma: p.plataforma,
      temColunaStatus: statusIdx !== -1,
      temColunaId: txIdx !== -1,
      temColunaProduto: produtoIdx !== -1,
      camada2Vale: camada2ValeNaEtapa(p.stageType),
    },
    vendas,
    precoMappingDivergente:
      colPreco.mappingDivergente && colPreco.colunaDoMapping
        ? `${p.nome}: mapping "${colPreco.colunaDoMapping}" trocado por "${colPreco.coluna ?? "—"}"`
        : null,
  };
}

export interface FonteDeLeadLida {
  label: string;
  headers: readonly string[];
  rows: readonly string[][];
  mapping: Record<string, unknown>;
}

/** Uma fonte de lead (pesquisa / planilha não-venda) → registros crus. Pura. */
export function lerFonteDeLead(f: FonteDeLeadLida): { leads: LeadInput[]; semIdentificador: boolean } {
  const { headers, rows, mapping } = f;
  const emailIdx = acharColuna(headers, mapping.email, APELIDOS.email);
  const telIdx = acharColuna(headers, mapping.phone ?? mapping.telefone, APELIDOS.telefone);
  if (emailIdx === -1 && telIdx === -1) return { leads: [], semIdentificador: true };
  const dataIdx = acharColuna(headers, mapping.timestamp ?? mapping.date, APELIDOS.dataLead);
  const srcIdx = acharColuna(headers, mapping.utm_source, APELIDOS.utm_source);
  const medIdx = acharColuna(headers, mapping.utm_medium, APELIDOS.utm_medium);
  const cmpIdx = acharColuna(headers, mapping.utm_campaign, APELIDOS.utm_campaign);
  const termIdx = acharColuna(headers, mapping.utm_term, APELIDOS.utm_term);

  const leads: LeadInput[] = [];
  for (const row of rows) {
    const email = celula(row, emailIdx);
    const tel = celula(row, telIdx);
    if (!email && !tel) continue;
    leads.push({
      emailCru: email,
      telefoneCru: tel,
      dataCriacaoCru: celula(row, dataIdx),
      utm: {
        source: celula(row, srcIdx),
        medium: celula(row, medIdx),
        campaign: celula(row, cmpIdx),
        term: celula(row, termIdx),
      },
    });
  }
  return { leads, semIdentificador: false };
}

/** Uma linha de `manual_sales` como o loader a lê (sem nome, CPF nem endereço do cliente). */
export interface VendaManualLida {
  id: string;
  /** `numeric` do Postgres (chega string). */
  value: string | number;
  product: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  sellerName: string | null;
  saleDate: Date | string;
}

/**
 * `numeric(12,2)` do banco → texto pt-BR sem ambiguidade (`"4000.00"` →
 * `"4000,00"`), para o motor ler pelo parser único como lê toda célula. Sem
 * isto, uma escala de 3 casas (`"4.000"`) seria lida como milhar.
 */
function numericComoCelula(v: string | number): string | null {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : null;
}

/**
 * As vendas manuais de UMA etapa → uma "planilha" a mais para o motor. Pura.
 *
 * Plataforma `"manual"` (o motor marca `fonte: "manual"`); sem coluna de status
 * (a reembolsada já ficou fora na leitura); o ID é o da linha em `manual_sales`
 * (nunca colapsa na camada 1); o tipo segue a regra das planilhas:
 * `product_types` quando o produto consta lá, senão o default da etapa — o
 * mesmo recorte do painel (`subtypeDasVendasManuais`: etapa de Vendas =
 * produto principal; as demais = ingresso).
 */
export function lerVendasManuais(
  stageId: string,
  stageType: string | null,
  linhas: readonly VendaManualLida[],
  tiposDeProduto: Record<string, TipoDeProduto>,
): { planilha: PlanilhaDeVendaInput; vendas: VendaCruaInput[] } {
  const planilhaId = `${stageId}:${PLATAFORMA_MANUAL}`;
  const vendas = linhas.map((m, i): VendaCruaInput => {
    const produto = (m.product ?? "").trim() || null;
    const classificado = !!produto && Object.prototype.hasOwnProperty.call(tiposDeProduto, productKey(produto));
    const dia = m.saleDate instanceof Date ? m.saleDate.toISOString() : String(m.saleDate ?? "").trim() || null;
    return {
      planilhaId,
      linha: i + 1,
      idDaVendaCru: m.id,
      produto,
      tipo: classificado ? tipoDoProduto(produto, tiposDeProduto) : tipoPadraoDaEtapa(stageType),
      tipoClassificado: classificado,
      valorBrutoCru: numericComoCelula(m.value),
      moeda: null,
      statusCru: null,
      emailCru: (m.customerEmail ?? "").trim() || null,
      telefoneCru: (m.customerPhone ?? "").trim() || null,
      dataVendaCru: dia,
      utm: {},
      sellerName: (m.sellerName ?? "").trim() || null,
    };
  });
  return {
    planilha: {
      planilhaId,
      stageId,
      nome: "Vendas manuais",
      plataforma: PLATAFORMA_MANUAL,
      temColunaStatus: false,
      temColunaId: true,
      temColunaProduto: true,
      camada2Vale: camada2ValeNaEtapa(stageType),
    },
    vendas,
  };
}

/** Um vínculo de uma aba de venda a uma etapa do lançamento. */
export interface VinculoDeAba {
  stageId: string;
  papel: DebriefingPapel;
  mapping: Record<string, unknown>;
}

/**
 * REL-001 — qual vínculo vale quando a MESMA aba está ligada a mais de uma
 * etapa (a aba é lida uma vez só; ler de novo dobra o faturamento). Pura.
 *
 * 1. mais colunas da camada 1 mapeadas e existentes no cabeçalho
 *    (`transactionId`, `productName`) — é o vínculo em que a dedup por ID roda;
 * 2. empate → o de etapa de papel `vendas-*`;
 * 3. empate → o primeiro na ordem recebida (a de `config.etapas`), registrado
 *    como `"empate-ordem-da-config"`.
 *
 * `criterio` diz qual dos três passos decidiu.
 */
export function escolherVinculoDaFonte(
  vinculos: readonly VinculoDeAba[],
  headers: readonly string[],
): { indice: number; criterio: FonteDuplicada["criterio"]; colunas: { temColunaId: boolean; temColunaProduto: boolean }[] } {
  if (vinculos.length === 0) throw new Error("escolherVinculoDaFonte: nenhum vínculo");
  const colunas = vinculos.map((v) => ({
    temColunaId: acharColuna(headers, v.mapping.transactionId, null) !== -1,
    temColunaProduto: acharColuna(headers, v.mapping.productName, null) !== -1,
  }));
  const pontos = colunas.map((c) => Number(c.temColunaId) + Number(c.temColunaProduto));
  const max = Math.max(...pontos);
  const porMapeamento = vinculos.map((_, i) => i).filter((i) => pontos[i] === max);
  if (porMapeamento.length === 1) return { indice: porMapeamento[0]!, criterio: "mapeamento-id-e-produto", colunas };
  const deVendas = porMapeamento.filter((i) => vinculos[i]!.papel.startsWith("vendas-"));
  if (deVendas.length === 1) return { indice: deVendas[0]!, criterio: "papel-de-vendas", colunas };
  const restantes = deVendas.length > 1 ? deVendas : porMapeamento;
  return { indice: restantes[0]!, criterio: "empate-ordem-da-config", colunas };
}

/**
 * Preenche `Utm.campaignName` a partir do id em `utm_campaign` — desembrulhado
 * (`{"123","123"}` → `123`, regra 9 da skill) para casar com o cadastro. A
 * célula fica como veio (o motor desembrulha na higiene). Não muta a entrada.
 */
export function comNomeDeCampanha(utm: Utm, nomes: ReadonlyMap<string, string>): Utm {
  const id = desembrulharUtm(utm.campaign).valor ?? "";
  const nome = id ? nomes.get(id) : undefined;
  return nome ? { ...utm, campaignName: nome } : { ...utm };
}

/** Config do classificador a partir das fontes já lidas. Pura. */
export function configClassificadorDe(
  config: Pick<DebriefingConfigLancamento, "closerMediums" | "closerPorSellerName" | "ferramentasDeAtendimento">,
  aliases: readonly { canonicalName: string; aliases: readonly string[] | null }[],
  closers: readonly { name: string }[],
): ConfigClassificador {
  const nomes = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = (s ?? "").trim().toLowerCase();
    if (n) nomes.add(n);
  };
  for (const a of aliases) {
    add(a.canonicalName);
    for (const x of a.aliases ?? []) add(x);
  }
  for (const c of closers) add(c.name);
  return {
    closerMediums: [...config.closerMediums],
    closerNomes: [...nomes].sort(),
    closerPorSellerName: config.closerPorSellerName,
    ferramentasDeAtendimento: [...config.ferramentasDeAtendimento],
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

type LerPlanilha = (spreadsheetId: string, sheetName: string) => Promise<{ headers: string[]; rows: string[][] }>;

/**
 * A config do classificador da 49.2 — UMA montagem, reusada pela 49.4
 * (armadilha #9: classificadores diferentes dão Closer 19 num lugar e 22 noutro).
 */
export async function montarConfigClassificador(
  db: Database,
  config: Pick<
    DebriefingConfigLancamento,
    "projectId" | "funnelId" | "closerMediums" | "closerPorSellerName" | "ferramentasDeAtendimento"
  >,
): Promise<ConfigClassificador> {
  const aliases = await db
    .select({ canonicalName: sellerAliases.canonicalName, aliases: sellerAliases.aliases })
    .from(sellerAliases)
    .where(eq(sellerAliases.projectId, config.projectId));
  const etapas = await db
    .select({ id: funnelStages.id })
    .from(funnelStages)
    .where(eq(funnelStages.funnelId, config.funnelId));
  const closers =
    etapas.length > 0
      ? await db
          .select({ name: stageEventClosers.name })
          .from(stageEventClosers)
          .where(inArray(stageEventClosers.stageId, etapas.map((e) => e.id)))
      : [];
  return configClassificadorDe(config, aliases, closers);
}

export interface LoadDebriefingMoneyTimeParams {
  /** A janela sai de `config.datasChave` (`janelaDoDebriefing`, decisão 2A) — não é parâmetro. */
  config: DebriefingConfigLancamento;
}

export interface DiagnosticoDoLoader {
  /** Decisão 2A: a janela em que a mídia foi lida (a mesma que o motor corta). */
  janela: JanelaDoDebriefing;
  /** Decisão 3A: vendas manuais lidas por etapa (reembolsadas já fora). */
  vendasManuais: { stageId: string; linhas: number }[];
  planilhasDeVenda: { planilhaId: string; stageId: string; nome: string; plataforma: string; linhas: number }[];
  fontesDeLead: { label: string; linhas: number; semIdentificador: boolean }[];
  precoMappingDivergente: string[];
  /** Campanha vinculada a mais de uma etapa do lançamento: conta só na primeira (ordem de `config.etapas`). */
  campanhasEmMaisDeUmaEtapa: { campaignId: string; etapas: string[] }[];
  /** REL-001: aba de venda ligada a mais de uma etapa — lida uma vez (também vai ao motor). */
  fontesDuplicadas: FonteDuplicada[];
}

export type DebriefingMoneyTimeInputCarregado = Omit<DebriefingMoneyTimeInput, "criterioDeUnico" | "maxD"> & {
  configClassificador: ConfigClassificador;
  diagnostico: DiagnosticoDoLoader;
};

const TIPOS_DE_VENDA = new Set(["sales", "perpetual_sales", "perpetual_upsell"]);

async function lerOuFalhar(lerPlanilha: LerPlanilha, spreadsheetId: string, sheetName: string, rotulo: string) {
  try {
    return await lerPlanilha(spreadsheetId, sheetName);
  } catch (e) {
    throw new DebriefingDadoIndisponivelError(
      `não foi possível ler ${rotulo} "${sheetName}": ${(e as Error).message}`,
      "Verificar o acesso à planilha (Google) e tentar de novo — o debriefing não sai com uma fonte faltando",
    );
  }
}

/**
 * Carrega a entrada do motor para `(projectId, funnelId, etapas, período)` da
 * config da 49.1. O `criterioDeUnico` (e o `maxD`) são do orquestrador.
 */
export async function loadDebriefingMoneyTimeInput(
  db: Database,
  params: LoadDebriefingMoneyTimeParams,
  deps: { lerPlanilha?: LerPlanilha } = {},
): Promise<DebriefingMoneyTimeInputCarregado> {
  const { config } = params;
  const janela = janelaDoDebriefing(config.datasChave);
  const lerPlanilha: LerPlanilha = deps.lerPlanilha ?? readSheetData;

  // ---- Etapas do funil (campanhas vinculadas + tipo) ----
  const etapasDoFunil = await db
    .select({ id: funnelStages.id, stageType: funnelStages.stageType, campaigns: funnelStages.campaigns })
    .from(funnelStages)
    .where(eq(funnelStages.funnelId, config.funnelId));
  const etapaPorId = new Map(etapasDoFunil.map((e) => [e.id, e]));
  for (const e of config.etapas) {
    if (!etapaPorId.has(e.stageId)) {
      throw new DebriefingDadoIndisponivelError(
        `a etapa ${e.stageId} da configuração do debriefing não pertence mais ao funil`,
        "Revisar as etapas que compõem o lançamento na configuração do debriefing",
      );
    }
  }
  const campanhasDe = (stageId: string) =>
    (((etapaPorId.get(stageId)?.campaigns as { id?: string; name?: string }[] | null) ?? []).filter(
      (c) => typeof c?.id === "string" && c.id,
    ) as { id: string; name?: string }[]);

  // Nome de campanha por id — todas as etapas do funil (decisão 4).
  const nomeDaCampanha = new Map<string, string>();
  for (const e of etapasDoFunil) {
    for (const c of campanhasDe(e.id)) if (c.name && !nomeDaCampanha.has(c.id)) nomeDaCampanha.set(c.id, c.name);
  }

  // ---- Vendas ----
  const idsDasEtapas = config.etapas.map((e) => e.stageId);
  const tiposPorEtapaRows = await db
    .select({ stageId: stageSalesSpreadsheets.stageId, productTypes: stageSalesSpreadsheets.productTypes })
    .from(stageSalesSpreadsheets)
    .where(inArray(stageSalesSpreadsheets.stageId, idsDasEtapas));
  const tiposPorEtapa = new Map<string, Record<string, TipoDeProduto>>();
  for (const id of idsDasEtapas) {
    tiposPorEtapa.set(
      id,
      normalizarTiposDeProduto(tiposPorEtapaRows.filter((r) => r.stageId === id).map((r) => r.productTypes)),
    );
  }

  const planilhas: PlanilhaDeVendaInput[] = [];
  const vendas: VendaCruaInput[] = [];
  const diagnostico: DiagnosticoDoLoader = {
    janela,
    vendasManuais: [],
    planilhasDeVenda: [],
    fontesDeLead: [],
    precoMappingDivergente: [],
    campanhasEmMaisDeUmaEtapa: [],
    fontesDuplicadas: [],
  };
  // REL-001: a mesma aba ligada a mais de uma etapa é UMA fonte — agrupa os
  // vínculos por `spreadsheetId|sheetName` (na ordem de `config.etapas`), lê a
  // aba uma vez e usa só o vínculo que vale; os demais vão a `fontesDuplicadas`.
  type Vinculo = { etapa: (typeof config.etapas)[number]; stageType: string | null; sheet: ResolvedSalesSheet };
  const vinculosPorAba = new Map<string, Vinculo[]>();
  for (const etapa of config.etapas) {
    const { sheets, stageType } = await resolveSalesSheetsForStage(db, etapa.stageId);
    for (const sheet of sheets) {
      const chave = `${sheet.spreadsheetId}|${sheet.sheetName}`;
      const lista = vinculosPorAba.get(chave) ?? [];
      lista.push({ etapa, stageType, sheet });
      vinculosPorAba.set(chave, lista);
    }
  }
  for (const vinculos of vinculosPorAba.values()) {
    const primeiro = vinculos[0]!;
    const dados = await lerOuFalhar(lerPlanilha, primeiro.sheet.spreadsheetId, primeiro.sheet.sheetName, "a planilha de vendas");
    const mappingDe = (v: Vinculo) => (v.sheet.columnMapping ?? {}) as Record<string, unknown>;
    const escolha = escolherVinculoDaFonte(
      vinculos.map((v) => ({ stageId: v.etapa.stageId, papel: v.etapa.papel, mapping: mappingDe(v) })),
      dados.headers,
    );
    const { etapa, stageType, sheet } = vinculos[escolha.indice]!;
    const lida = lerPlanilhaDeVenda(
      {
        planilhaId: `${etapa.stageId}:${sheet.id}`,
        stageId: etapa.stageId,
        stageType,
        nome: sheet.sheetName,
        plataforma: sheet.subtype,
        headers: dados.headers,
        rows: dados.rows,
        mapping: mappingDe(vinculos[escolha.indice]!),
      },
      tiposPorEtapa.get(etapa.stageId) ?? {},
    );
    planilhas.push(lida.planilha);
    vendas.push(...lida.vendas);
    if (lida.precoMappingDivergente) diagnostico.precoMappingDivergente.push(lida.precoMappingDivergente);
    diagnostico.planilhasDeVenda.push({
      planilhaId: lida.planilha.planilhaId,
      stageId: etapa.stageId,
      nome: sheet.sheetName,
      plataforma: sheet.subtype,
      linhas: lida.vendas.length,
    });
    if (vinculos.length > 1) {
      diagnostico.fontesDuplicadas.push({
        aba: sheet.sheetName,
        vinculos: vinculos.map((v, i) => ({
          stageId: v.etapa.stageId,
          papel: v.etapa.papel,
          planilhaId: `${v.etapa.stageId}:${v.sheet.id}`,
          ...escolha.colunas[i]!,
        })),
        vale: lida.planilha.planilhaId,
        stageIdQueVale: etapa.stageId,
        criterio: escolha.criterio,
        linhasNaoRelidas: lida.vendas.length * (vinculos.length - 1),
      });
    }
  }

  // ---- Vendas manuais (decisão 3A): as da etapa, sem as reembolsadas ----
  const manuais = await db
    .select({
      id: manualSales.id,
      stageId: manualSales.stageId,
      value: manualSales.value,
      product: manualSales.product,
      customerEmail: manualSales.customerEmail,
      customerPhone: manualSales.customerPhone,
      sellerName: manualSales.sellerName,
      saleDate: manualSales.saleDate,
    })
    .from(manualSales)
    .where(and(inArray(manualSales.stageId, idsDasEtapas), isNull(manualSales.refundedAt)))
    .orderBy(asc(manualSales.saleDate), asc(manualSales.id));
  for (const etapa of config.etapas) {
    const manuaisDaEtapa = manuais.filter((m) => m.stageId === etapa.stageId);
    if (manuaisDaEtapa.length === 0) continue;
    const lida = lerVendasManuais(
      etapa.stageId,
      etapaPorId.get(etapa.stageId)?.stageType ?? null,
      manuaisDaEtapa,
      tiposPorEtapa.get(etapa.stageId) ?? {},
    );
    planilhas.push(lida.planilha);
    vendas.push(...lida.vendas);
    diagnostico.vendasManuais.push({ stageId: etapa.stageId, linhas: lida.vendas.length });
  }

  // ---- Leads (fontes da jornada, por etapa do lançamento) ----
  const surveys = await db
    .select({
      stageId: funnelSurveys.stageId,
      spreadsheetId: funnelSurveys.spreadsheetId,
      spreadsheetName: funnelSurveys.spreadsheetName,
      sheetName: funnelSurveys.sheetName,
      columnMapping: funnelSurveys.columnMapping,
    })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.funnelId, config.funnelId));
  const planilhasDoFunil = await db
    .select({
      stageId: funnelSpreadsheets.stageId,
      type: funnelSpreadsheets.type,
      label: funnelSpreadsheets.label,
      spreadsheetId: funnelSpreadsheets.spreadsheetId,
      spreadsheetName: funnelSpreadsheets.spreadsheetName,
      sheetName: funnelSpreadsheets.sheetName,
      columnMapping: funnelSpreadsheets.columnMapping,
    })
    .from(funnelSpreadsheets)
    .where(eq(funnelSpreadsheets.funnelId, config.funnelId));
  const daEtapa = (stageId: string | null) => stageId === null || idsDasEtapas.includes(stageId);
  const fontes = [
    ...surveys
      .filter((s) => daEtapa(s.stageId))
      .map((s) => ({ ...s, label: `${s.spreadsheetName} / ${s.sheetName}` })),
    ...planilhasDoFunil
      .filter((s) => !TIPOS_DE_VENDA.has(s.type) && daEtapa(s.stageId))
      .map((s) => ({ ...s, label: s.label ? `${s.label} · ${s.sheetName}` : `${s.spreadsheetName} / ${s.sheetName}` })),
  ];
  const fontesVistas = new Set<string>();
  const leads: LeadInput[] = [];
  for (const f of fontes) {
    const chave = `${f.spreadsheetId}|${f.sheetName}`;
    if (fontesVistas.has(chave)) continue;
    fontesVistas.add(chave);
    const dados = await lerOuFalhar(lerPlanilha, f.spreadsheetId, f.sheetName, "a fonte de leads");
    const lida = lerFonteDeLead({
      label: f.label,
      headers: dados.headers,
      rows: dados.rows,
      mapping: (f.columnMapping ?? {}) as Record<string, unknown>,
    });
    leads.push(...lida.leads);
    diagnostico.fontesDeLead.push({ label: f.label, linhas: lida.leads.length, semIdentificador: lida.semIdentificador });
  }

  // ---- Mídia (spend cru, só campanhas vinculadas; cada campanha numa etapa) ----
  const etapaDaCampanha = new Map<string, string>();
  const campanhaInfo = new Map<string, string>();
  const etapasPorCampanha = new Map<string, string[]>();
  for (const e of config.etapas) {
    for (const c of campanhasDe(e.stageId)) {
      const lista = etapasPorCampanha.get(c.id) ?? [];
      lista.push(e.stageId);
      etapasPorCampanha.set(c.id, lista);
      if (!etapaDaCampanha.has(c.id)) {
        etapaDaCampanha.set(c.id, e.stageId);
        campanhaInfo.set(c.id, c.name ?? c.id);
      }
    }
  }
  for (const [campaignId, etapas] of etapasPorCampanha) {
    if (etapas.length > 1) diagnostico.campanhasEmMaisDeUmaEtapa.push({ campaignId, etapas });
  }

  const midia: MidiaCampanhaDiaInput[] = [];
  const idsCampanha = [...etapaDaCampanha.keys()];
  if (idsCampanha.length > 0) {
    const linhas = await db
      .select({
        campaignId: metaCampaignInsightsDaily.campaignId,
        dateStart: metaCampaignInsightsDaily.dateStart,
        spend: metaCampaignInsightsDaily.spend,
        impressions: metaCampaignInsightsDaily.impressions,
        actions: metaCampaignInsightsDaily.actions,
      })
      .from(metaCampaignInsightsDaily)
      .where(
        and(
          eq(metaCampaignInsightsDaily.projectId, config.projectId),
          inArray(metaCampaignInsightsDaily.campaignId, idsCampanha),
          gte(metaCampaignInsightsDaily.dateStart, janela.inicio),
          lte(metaCampaignInsightsDaily.dateStart, janela.fim),
        ),
      );
    for (const l of linhas) {
      midia.push({
        stageId: etapaDaCampanha.get(l.campaignId)!,
        campaignId: l.campaignId,
        campaignName: campanhaInfo.get(l.campaignId) ?? l.campaignId,
        dia: l.dateStart,
        spendBruto: numeroDoBanco(l.spend),
        impressoes: numeroDoBanco(l.impressions),
        linkClicks: linkClicksDeActions(l.actions),
      });
    }
    midia.sort((a, b) =>
      a.campaignId === b.campaignId ? (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0) : a.campaignId < b.campaignId ? -1 : 1,
    );
  }

  // ---- Nome da campanha das UTMs: funnel_stages.campaigns → meta_ad_insights_daily ----
  const idsDeUtm = new Set<string>();
  for (const u of [...vendas.map((v) => v.utm), ...leads.map((l) => l.utm)]) {
    const id = desembrulharUtm(u.campaign).valor ?? "";
    if (id && !nomeDaCampanha.has(id)) idsDeUtm.add(id);
  }
  if (idsDeUtm.size > 0) {
    const doAdLevel = await db
      .selectDistinct({ campaignId: metaAdInsightsDaily.campaignId, campaignName: metaAdInsightsDaily.campaignName })
      .from(metaAdInsightsDaily)
      .where(
        and(
          eq(metaAdInsightsDaily.projectId, config.projectId),
          inArray(metaAdInsightsDaily.campaignId, [...idsDeUtm]),
        ),
      );
    for (const r of doAdLevel) {
      if (r.campaignId && r.campaignName && !nomeDaCampanha.has(r.campaignId)) {
        nomeDaCampanha.set(r.campaignId, r.campaignName);
      }
    }
  }
  const vendasComNome = vendas.map((v) => ({ ...v, utm: comNomeDeCampanha(v.utm, nomeDaCampanha) }));
  const leadsComNome = leads.map((l) => ({ ...l, utm: comNomeDeCampanha(l.utm, nomeDaCampanha) }));

  // ---- Classificador da 49.2, com a config fechada dentro ----
  const configClassificador = await montarConfigClassificador(db, config);
  const classificador: ClassificadorInjetado = {
    versao: CLASSIFICADOR_VERSAO,
    classificar: (entrada) => classificarOrigem(entrada, configClassificador),
  };

  return {
    config: { datasChave: config.datasChave, etapas: config.etapas, imposto: config.imposto },
    planilhas,
    vendas: vendasComNome,
    leads: leadsComNome,
    midia,
    classificador,
    fontesDuplicadas: diagnostico.fontesDuplicadas,
    configClassificador,
    diagnostico,
  };
}
