/**
 * Story 49.4 — I/O do Motor II do Debriefing (público).
 *
 * Lê do banco e das planilhas e entrega ao motor puro
 * (`debriefing-audience-engine.ts`) o que ele precisa, sem tabular nada:
 *
 * - **vendas**: as MESMAS do Motor I. O loader da 49.3
 *   (`loadDebriefingMoneyTimeInput`) é chamado com o mesmo leitor de
 *   planilha (memoizado — cada aba é lida uma vez) e as linhas passam pela
 *   sequência de higiene da 49.3 (`higienizarVendasDoDebriefing`, com as
 *   funções de `debriefing-hygiene.ts`); daí saem `comprouCaptacao`,
 *   `comprouPrincipal` e `comprouTierSuperior`. Assim `compradoresCaptacao`
 *   tem as mesmas chaves nos dois motores (49.5 F3) e o classificador, a config
 *   dele e o nome de campanha das UTMs (decisão 4) são os da 49.3;
 * - **pesquisa**: `funnel_surveys` das etapas com pesquisa da config, colunas
 *   por `resolveColumnIndexes` (a mesma resolução do Resumão e da 49.1) e
 *   `linhaTemRespondente` (a mesma regra de linha vazia) — e-mail, telefone e
 *   data chegam CRUS (a normalização é do motor, que devolve só hash);
 * - **anúncios**: `meta_ad_insights_daily` das campanhas de captação no
 *   período, e o nome do Ad ID no cache do banco (`meta_ad_insights_daily`,
 *   depois `meta_entity_names_cache`); o post publicado de cada Ad ID (R7-9)
 *   sai de `meta_ad_creatives_cache` pela cascata da 18.88 (`postDoAnuncio`:
 *   Instagram → Facebook), recortado por `project_id` (`condicaoDoCacheDeCriativos`);
 *   Story 49.18: cada linha anúncio × dia leva também o `landing_page_view` de
 *   `actions` (ausente = `null`), e cada Ad ID do cache leva o `title`/`body`
 *   de nível superior do criativo (o único texto que o cache guarda); a venda
 *   higienizada leva o valor (a conversão `valorBrl` do Motor I; TMB = 0) e o dia;
 * - **conta do Ads Manager**: `funnels.metaAccountId` → `meta_ads_accounts`; sem
 *   conta no funil, a ÚNICA conta ativa vinculada ao projeto
 *   (`meta_ads_account_projects`, a mesma fonte do backfill de nomes). Em
 *   produção (2026-10-02) nenhum dos 19 funis tem `meta_account_id`; os três
 *   projetos liberados têm exatamente uma conta cada;
 * - **base anterior** (AC10): o Loyola não guarda leads em tabela — guarda a
 *   referência às planilhas (`funnel_spreadsheets` tipo `leads` e
 *   `funnel_surveys`), lidas ao vivo. Com fonte de leads legível → base
 *   `leads+compradores`; sem → `compradores` (lacuna `BASE_ANTERIOR_SEM_LEADS`).
 *   Os compradores do anterior vêm das planilhas de venda (status pago) e das
 *   `manual_sales` não reembolsadas (decisão 3A da 49.3). Story 49.11: a base
 *   é SÓ a comparação principal (o 1º da lista) — nada soma entre lançamentos;
 * - **série histórica** (49.11): para CADA lançamento da lista
 *   (`lancamentosComparacao`), as chaves de pergunta com resposta nas pesquisas
 *   do funil (`seriesDeComparacao`, na ordem), com o mesmo leitor memoizado;
 * - **pesquisa de captação** (49.11, R6-7): a pesquisa marcada em
 *   `pesquisaDeCaptacaoPorEtapa[stageId]` sai com `pesquisaDeCaptacao: true` —
 *   o motor a usa no desempate sem data, sem conhecer nome de aba.
 *
 * Nenhuma chamada à Meta, nenhum fan-out por criativo (regra de rate limit do
 * projeto). Planilha configurada que falha ao ler lança `DADO_INDISPONIVEL` —
 * nunca vira lista vazia ("erro virando ausência na tela").
 */

import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { utmContentEfetivo, type Utm } from "@loyola-x/shared";
import {
  funnelSpreadsheets,
  funnelStages,
  funnelSurveys,
  funnels,
  manualSales,
  metaAdCreativesCache,
  metaAdInsightsDaily,
  metaAdsAccountProjects,
  metaAdsAccounts,
  metaEntityNamesCache,
} from "../db/schema.js";
import type { Database } from "../db/client.js";
import { readSheetData } from "./google-sheets.js";
import { valorBrl } from "./launch-report-sales-value.js";
import { condicaoDoCacheDeCriativos } from "./lp-do-anuncio.js";
import { postDoAnuncio } from "../utils/post-do-criativo.js";
import { resolveSalesSheetsForStage } from "./sales-daily-sync.js";
import { linhaTemRespondente, resolveColumnIndexes } from "./survey-aggregation.js";
import type { DebriefingConfigLancamento } from "./debriefing-config.js";
import {
  DebriefingDadoIndisponivelError,
  comNomeDeCampanha,
  lerFonteDeLead,
  linkClicksDeActions,
  loadDebriefingMoneyTimeInput,
  type DebriefingMoneyTimeInputCarregado,
} from "./debriefing-money-time-loader.js";
import { GRUPO_DO_PAPEL, type DebriefingMoneyTimeInput, type GrupoDaEtapa } from "./debriefing-money-time-engine.js";
import {
  dataBrt,
  deduplicarVendas,
  emCentavos,
  ehTmb,
  filtrarPorStatus,
  anteriorAAbertura,
  janelaDaGeracao,
  lerValorMonetario,
  type PlanilhaParaDedup,
} from "./debriefing-hygiene.js";
import type {
  AnuncioDiaInput,
  BaseAnteriorInput,
  DebriefingAudienceInput,
  IdentidadeInput,
  PesquisaInput,
  RespostaInput,
  SerieDeComparacaoInput,
  VendaHigienizadaInput,
} from "./debriefing-audience-engine.js";
import type { TextoDoAnuncio } from "./debriefing-midia-anuncios.js";

type LerPlanilha = (spreadsheetId: string, sheetName: string) => Promise<{ headers: string[]; rows: string[][] }>;
type MappingDaPesquisa = (typeof funnelSurveys.$inferSelect)["columnMapping"];

// ---------------------------------------------------------------------------
// Peças puras (testáveis sem banco)
// ---------------------------------------------------------------------------

/**
 * Leitor que lê cada aba UMA vez por execução. Passado ao loader da 49.3 e
 * reusado aqui: vendas e pesquisa não voltam ao Google. Falha não é guardada
 * (a próxima chamada tenta de novo e o erro chega a quem chamou).
 */
export function memoizarLeitura(ler: LerPlanilha): LerPlanilha {
  const cache = new Map<string, Promise<{ headers: string[]; rows: string[][] }>>();
  return (spreadsheetId, sheetName) => {
    const k = `${spreadsheetId}\u0000${sheetName}`;
    const emCache = cache.get(k);
    if (emCache) return emCache;
    const p = ler(spreadsheetId, sheetName).catch((e: unknown) => {
      cache.delete(k);
      throw e;
    });
    cache.set(k, p);
    return p;
  };
}

/**
 * A sequência de higiene de vendas da 49.3 (`computeDebriefingMoneyTime`,
 * passos 1–7), na MESMA ordem e com as MESMAS funções de
 * `debriefing-hygiene.ts`: etapa fora da config sai; `filtrarPorStatus`
 * (transação reembolsada sai inteira); valor negativo e linha sem valor (fora
 * do TMB) saem; `deduplicarVendas` (camada 1 por ID da venda, camada 2 por
 * e-mail + produto); corte pela janela `janelaDoDebriefing(datasChave)`
 * (decisão 2A) depois da dedup (venda sem dia fica);
 * venda do principal antes da abertura do carrinho sai (decisão 7).
 *
 * Um teste diferencial trava `compradoresCaptacao` idêntico ao do Motor I
 * sobre a mesma entrada.
 *
 * `conteudoPorLinha`: `planilhaId#linha` → célula de `utm_content` da venda.
 */
export function higienizarVendasDoDebriefing(
  entrada: Pick<DebriefingMoneyTimeInput, "config" | "planilhas" | "vendas">,
  conteudoPorLinha: ReadonlyMap<string, string | null> = new Map(),
): VendaHigienizadaInput[] {
  const { config } = entrada;
  const janela = janelaDaGeracao(config);
  const grupoDaEtapa = new Map<string, GrupoDaEtapa>(config.etapas.map((e) => [e.stageId, GRUPO_DO_PAPEL[e.papel]]));
  const planilhaPorId = new Map(entrada.planilhas.map((p) => [p.planilhaId, p]));

  const lidas = entrada.vendas.flatMap((v) => {
    const planilha = planilhaPorId.get(v.planilhaId);
    if (!planilha) {
      throw new Error(`higienizarVendasDoDebriefing: venda de planilha desconhecida (${v.planilhaId})`);
    }
    const grupo = grupoDaEtapa.get(planilha.stageId);
    if (!grupo) return [];
    return [
      {
        v,
        grupo,
        tmb: ehTmb(planilha.plataforma),
        idDaVenda: (v.idDaVendaCru ?? "").trim() || null,
        lido: lerValorMonetario(v.valorBrutoCru),
        dia: dataBrt(v.dataVendaCru),
      },
    ];
  });
  type Lida = (typeof lidas)[number];

  const { pagas } = filtrarPorStatus(lidas, {
    planilhaId: (l) => l.v.planilhaId,
    statusCru: (l) => l.v.statusCru,
    idDaVenda: (l) => l.idDaVenda,
    temColunaStatus: (id) => planilhaPorId.get(id)?.temColunaStatus ?? false,
  });
  const candidatas = pagas.filter((l) => !l.lido.negativo && (l.tmb || l.lido.valor > 0));
  const dedup = deduplicarVendas(
    candidatas,
    {
      planilhaId: (l: Lida) => l.v.planilhaId,
      idDaVenda: (l: Lida) => l.idDaVenda,
      produto: (l: Lida) => l.v.produto,
      emailCru: (l: Lida) => l.v.emailCru,
    },
    new Map<string, PlanilhaParaDedup>(
      entrada.planilhas.map((p) => [
        p.planilhaId,
        {
          planilhaId: p.planilhaId,
          nome: p.nome,
          temColunaId: p.temColunaId,
          temColunaProduto: p.temColunaProduto,
          camada2Vale: p.camada2Vale,
        },
      ]),
    ),
  );
  // 49.18: o valor de cada linha pela MESMA conversão do Motor I (`valorBrl` sobre
  // as mantidas fora do TMB, antes do corte da janela); TMB conta a venda e soma 0.
  const naoTmb = dedup.mantidas.filter((l) => !l.tmb);
  const convertidos = valorBrl(naoTmb.map((l) => ({ produto: l.v.produto, preco: l.lido.valor, moeda: l.v.moeda, data: l.dia ?? "" })));
  const centavosPorLinha = new Map<Lida, number>();
  naoTmb.forEach((l, i) => centavosPorLinha.set(l, emCentavos(convertidos.valores[i] ?? 0)));
  const contaveis = dedup.mantidas.filter((l) => {
    if (l.dia !== null && (l.dia < janela.inicio || l.dia > janela.fim)) return false;
    // 49.12: carrinho "ainda não aconteceu" (abertura nula) = toda venda datada é anterior a ele.
    return !(l.grupo === "principal" && l.dia !== null && anteriorAAbertura(l.dia, config.datasChave.aberturaCarrinho));
  });

  return contaveis.map((l) => ({
    planilhaId: l.v.planilhaId,
    linha: l.v.linha,
    grupo: l.grupo,
    emailCru: l.v.emailCru,
    telefoneCru: l.v.telefoneCru,
    utm: { ...l.v.utm },
    utmContentCru: conteudoPorLinha.get(`${l.v.planilhaId}#${l.v.linha}`) ?? null,
    sellerName: l.v.sellerName,
    comprouCaptacao: l.grupo === "captacao" && (l.v.tipo === "ingresso" || l.v.tipo === "combo"),
    comprouPrincipal: l.grupo === "principal",
    comprouTierSuperior: l.grupo === "captacao" && (l.v.tipo === "combo" || l.v.tipo === "order_bump"),
    centavos: centavosPorLinha.get(l) ?? 0,
    dia: l.dia,
  }));
}

/**
 * `utm_campaign` (id) → nome, tirado do que o loader da 49.3 JÁ resolveu nas
 * vendas e nos leads (que incluem as linhas desta pesquisa). Reusa o resolvedor
 * dele em vez de repetir a consulta (decisão 4: um resolvedor só).
 */
export function nomesDeCampanhaResolvidos(
  entrada: Pick<DebriefingMoneyTimeInputCarregado, "vendas" | "leads">,
): Map<string, string> {
  const nomes = new Map<string, string>();
  for (const u of [...entrada.vendas.map((v) => v.utm), ...entrada.leads.map((l) => l.utm)]) {
    const id = (u.campaign ?? "").trim();
    const nome = (u.campaignName ?? "").trim();
    if (id && nome && !nomes.has(id)) nomes.set(id, nome);
  }
  return nomes;
}

function normalizarCabecalho(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/** Índice por nome mapeado (igualdade normalizada, como o Resumão); fallback por apelido. */
function acharColuna(headers: readonly string[], mapeado: unknown, apelidos: RegExp | null): number {
  if (typeof mapeado === "string" && mapeado.trim()) {
    const alvo = normalizarCabecalho(mapeado);
    const i = headers.findIndex((h) => normalizarCabecalho(h) === alvo);
    if (i !== -1) return i;
  }
  return apelidos ? headers.findIndex((h) => apelidos.test(h.trim())) : -1;
}

const APELIDOS = {
  email: /e-?mail/i,
  telefone: /telefone|whats|phone|celular/i,
  utm_medium: /^utm_?medium$|^m=$/i,
  utm_campaign: /^utm_?campaign$|^c=$|^ca=$/i,
  utm_content: /^utm_?content$|^co=$/i,
  data: /^(data|date|timestamp|carimbo de data\/hora|submitted at)$/i,
} as const;

function celula(row: readonly string[], i: number): string | null {
  if (i < 0) return null;
  const v = (row[i] ?? "").trim();
  return v ? v : null;
}

export interface PesquisaLida {
  pesquisaId: string;
  stageId: string;
  rotulo: string;
  headers: string[];
  rows: string[][];
  mapping: MappingDaPesquisa;
}

/**
 * Uma planilha de pesquisa → linhas cruas para o motor. Pura.
 *
 * Toda linha da planilha vira uma `RespostaInput` (o motor conta as vazias e
 * as duplicadas — AC2: nenhum n antes da higiene). As colunas de pergunta, de
 * e-mail, `utm_source`, `utm_term` e `utm_content` são as de
 * `resolveColumnIndexes`; `utm_medium`, `utm_campaign`, telefone e data seguem
 * o mapeamento da pesquisa com fallback por apelido.
 */
export function lerPesquisa(
  p: PesquisaLida,
  nomesDeCampanha: ReadonlyMap<string, string>,
): { pesquisa: PesquisaInput; respostas: RespostaInput[] } {
  const { indexes } = resolveColumnIndexes(p.headers, p.mapping);
  const m = (p.mapping ?? {}) as Record<string, unknown>;
  const medIdx = acharColuna(p.headers, m.utm_medium, APELIDOS.utm_medium);
  const cmpIdx = acharColuna(p.headers, m.utm_campaign, APELIDOS.utm_campaign);
  const telIdx = acharColuna(p.headers, m.phone ?? m.telefone, APELIDOS.telefone);
  const dataIdx = acharColuna(p.headers, m.timestamp ?? m.date, APELIDOS.data);
  const chaves = [...indexes.questions.keys()];
  const cabecalhoDaChave: Record<string, string> = {};
  for (const [chave, idx] of indexes.questions) cabecalhoDaChave[chave] = (p.headers[idx] ?? "").trim();

  const respostas: RespostaInput[] = p.rows.map((row, i) => {
    const respostasDaLinha: Record<string, string | null> = {};
    for (const [chave, idx] of indexes.questions) respostasDaLinha[chave] = celula(row, idx);
    const utm: Utm = {
      source: celula(row, indexes.utmSource),
      medium: celula(row, medIdx),
      campaign: celula(row, cmpIdx),
      term: celula(row, indexes.utmTerm),
    };
    return {
      pesquisaId: p.pesquisaId,
      linha: i + 1,
      linhaTemRespondente: linhaTemRespondente(row, indexes.email),
      emailCru: celula(row, indexes.email),
      telefoneCru: celula(row, telIdx),
      dataRespostaCru: celula(row, dataIdx),
      utm: comNomeDeCampanha(utm, nomesDeCampanha),
      utmContentCru: celula(row, indexes.utmContent),
      respostas: respostasDaLinha,
    };
  });
  return {
    pesquisa: {
      pesquisaId: p.pesquisaId,
      stageId: p.stageId,
      rotulo: p.rotulo,
      temColunaEmail: indexes.email >= 0,
      chavesDePergunta: chaves,
      cabecalhoDaChave,
    },
    respostas,
  };
}

/**
 * Chaves de pergunta — e o texto do cabeçalho de cada uma — com ao menos uma
 * resposta numa planilha de pesquisa (série histórica). O cabeçalho entra
 * porque o modo legado do mapeamento usa apelido como chave (`renda_mensal`)
 * enquanto o modo mapeado usa a própria pergunta.
 */
export function chavesComResposta(headers: string[], rows: readonly string[][], mapping: MappingDaPesquisa): string[] {
  const { indexes } = resolveColumnIndexes(headers, mapping);
  const out = new Set<string>();
  for (const [chave, idx] of indexes.questions) {
    if (rows.some((r) => linhaTemRespondente([...r], indexes.email) && celula(r, idx) !== null)) {
      out.add(chave);
      const cab = (headers[idx] ?? "").trim();
      if (cab) out.add(cab);
    }
  }
  return [...out].sort();
}

/** `utm_content` por linha de uma planilha de venda (`planilhaId#linha`, linha 1-based como na 49.3). */
export function conteudoDaPlanilhaDeVenda(
  planilhaId: string,
  headers: readonly string[],
  rows: readonly string[][],
  mapping: Record<string, unknown>,
): Map<string, string | null> {
  const idx = acharColuna(headers, mapping.utm_content, APELIDOS.utm_content);
  const out = new Map<string, string | null>();
  if (idx === -1) return out;
  rows.forEach((row, i) => out.set(`${planilhaId}#${i + 1}`, celula(row, idx)));
  return out;
}

/** Compradores de uma planilha de venda do lançamento anterior — só status pago, identidade crua. */
export function identidadesDeVenda(
  planilhaId: string,
  headers: readonly string[],
  rows: readonly string[][],
  mapping: Record<string, unknown>,
): IdentidadeInput[] {
  const exata = (campo: string) => (typeof mapping[campo] === "string" ? headers.indexOf(mapping[campo] as string) : -1);
  const emailIdx = acharColuna(headers, mapping.email, APELIDOS.email);
  const telIdx = acharColuna(headers, mapping.telefone ?? mapping.phone, APELIDOS.telefone);
  const statusIdx = exata("status");
  const txIdx = exata("transactionId");
  const linhas = rows
    .map((row) => ({ row, email: celula(row, emailIdx), tel: celula(row, telIdx) }))
    .filter((l) => l.email || l.tel);
  const { pagas } = filtrarPorStatus(linhas, {
    planilhaId: () => planilhaId,
    statusCru: (l) => celula(l.row, statusIdx),
    idDaVenda: (l) => celula(l.row, txIdx),
    temColunaStatus: () => statusIdx !== -1,
  });
  return pagas.map((l) => ({ emailCru: l.email, telefoneCru: l.tel }));
}

/**
 * Story 49.18 — `landing_page_view` de `actions` (`meta_ad_insights_daily`), na
 * mesma leitura do `link_click` (`linkClicksDeActions`): ausente = `null`, nunca 0.
 */
export function landingPageViewsDeActions(actions: unknown): number | null {
  if (!Array.isArray(actions)) return null;
  const a = actions.find(
    (x): x is { action_type: string; value: unknown } =>
      typeof x === "object" && x !== null && (x as { action_type?: unknown }).action_type === "landing_page_view",
  );
  if (!a) return null;
  const n = typeof a.value === "number" ? a.value : Number.parseFloat(String(a.value ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** Story 49.18 (AC6) — `title` e `body` do criativo do cache, aparados; vazio = `null`. */
export function textoDoCriativo(creative: { title?: string | null; body?: string | null } | null | undefined): TextoDoAnuncio {
  const t = (x: string | null | undefined) => (x ?? "").trim() || null;
  return { title: t(creative?.title), body: t(creative?.body) };
}

/** Conta de anúncios do link do Ads Manager: só dígitos (sem `act_`). */
export function contaDoAdsManager(metaAccountId: string | null | undefined): string | null {
  const t = (metaAccountId ?? "").trim().replace(/^act_/i, "");
  return /^\d+$/.test(t) ? t : null;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function lerOuFalhar(ler: LerPlanilha, spreadsheetId: string, sheetName: string, rotulo: string) {
  try {
    return await ler(spreadsheetId, sheetName);
  } catch (e) {
    throw new DebriefingDadoIndisponivelError(
      `não foi possível ler ${rotulo} "${sheetName}": ${(e as Error).message}`,
      "Verificar o acesso à planilha (Google) e tentar de novo — o debriefing não sai com uma fonte faltando",
    );
  }
}

function numeroDoBanco(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export interface LoadDebriefingAudienceParams {
  /** A janela sai de `config.datasChave` (`janelaDoDebriefing`, decisão 2A) — a mesma da 49.3. */
  config: DebriefingConfigLancamento;
  /**
   * `funnel_surveys.id` de pesquisas de etapa do lançamento que NÃO entram na
   * qualificação (ex.: "Pesquisa-Captação - Alunos" do PG02, pergunta aberta ao
   * dono — DEC-OWNER-1). Default: nenhuma — toda pesquisa das etapas com
   * pergunta confirmada entra, como antes. Só o mecanismo: quem decide e onde a
   * lista mora (config da 49.1) fica para depois da decisão do dono.
   */
  pesquisasExcluidas?: readonly string[];
}

export interface DiagnosticoDoLoaderDePublico {
  pesquisas: { pesquisaId: string; stageId: string; rotulo: string; linhas: number }[];
  /** Pesquisas do funil fora das etapas com pergunta confirmada (sem etapa ou de etapa fora do lançamento). */
  pesquisasForaDaConfig: { rotulo: string; stageId: string | null }[];
  /** Pesquisas de etapa do lançamento tiradas por `params.pesquisasExcluidas` (não lidas). */
  pesquisasExcluidas: { pesquisaId: string; rotulo: string; stageId: string }[];
  vendasLidas: number;
  vendasHigienizadas: number;
  /** Fontes de venda sem `utm_content` (coluna ausente, ou fonte que não é aba de planilha): o ingresso por criativo não conta com elas. */
  planilhasDeVendaSemUtmContent: string[];
  anuncios: number;
  adIdsSemNomeNoCache: number;
  /** R7-9: Ad IDs com post no cache, por rede (`instagram` = tem `igPermalinkUrl`), e os sem post. */
  postsDosAnuncios: { instagram: number; facebook: number; semPost: number };
  /** De onde veio a conta do link do Ads Manager; `ambigua` = projeto com mais de uma conta (link `null`). */
  contaDeAnuncios: "funil" | "projeto" | "ambigua" | null;
  baseAnterior: {
    funnelId: string;
    fontesDeLeads: { rotulo: string; linhas: number; semIdentificador: boolean }[];
    planilhasDeVenda: number;
    /** Decisão 3A: `manual_sales` do funil de comparação (reembolsadas fora). */
    vendasManuais: number;
  } | null;
}

export type DebriefingAudienceInputCarregado = DebriefingAudienceInput & { diagnostico: DiagnosticoDoLoaderDePublico };

/**
 * Carrega a entrada do Motor II para `(projectId, funnelId, etapas, período,
 * lançamento de comparação?)` da config da 49.1.
 *
 * `deps.entradaMoneyTime`: a composição (49.5) que já carregou o Motor I passa
 * a entrada dele; sem ela, o loader da 49.3 é chamado aqui com o mesmo leitor.
 */
export async function loadDebriefingAudienceInput(
  db: Database,
  params: LoadDebriefingAudienceParams,
  deps: { lerPlanilha?: LerPlanilha; entradaMoneyTime?: DebriefingMoneyTimeInputCarregado } = {},
): Promise<DebriefingAudienceInputCarregado> {
  const { config } = params;
  const janela = janelaDaGeracao(config);
  const ler = memoizarLeitura(deps.lerPlanilha ?? readSheetData);

  // ---- Vendas: as do Motor I, higienizadas pela mesma sequência ----
  const mt = deps.entradaMoneyTime ?? (await loadDebriefingMoneyTimeInput(db, { config }, { lerPlanilha: ler }));
  const conteudo = new Map<string, string | null>();
  const planilhasSemConteudo: string[] = [];
  const planilhasVistas = new Set<string>();
  // REL-001 da 49.3: a aba ligada a mais de uma etapa vale com UM vínculo (o que
  // o Motor I leu, `escolherVinculoDaFonte`). Os outros vínculos não são
  // relidos aqui — nem para o utm_content, nem para o diagnóstico.
  const planilhasDoMotorI = new Set(mt.planilhas.map((p) => p.planilhaId));
  for (const etapa of config.etapas) {
    const { sheets } = await resolveSalesSheetsForStage(db, etapa.stageId);
    for (const sheet of sheets) {
      const planilhaId = `${etapa.stageId}:${sheet.id}`;
      if (!planilhasDoMotorI.has(planilhaId)) continue;
      planilhasVistas.add(planilhaId);
      const dados = await lerOuFalhar(ler, sheet.spreadsheetId, sheet.sheetName, "a planilha de vendas");
      const doSheet = conteudoDaPlanilhaDeVenda(planilhaId, dados.headers, dados.rows, (sheet.columnMapping ?? {}) as Record<string, unknown>);
      if (doSheet.size === 0) planilhasSemConteudo.push(sheet.sheetName);
      for (const [k, v] of doSheet) conteudo.set(k, v);
    }
  }
  // Fonte de venda do Motor I que não é aba de planilha (ou cuja chave mudou):
  // fica sem utm_content e aparece no diagnóstico — nunca some em silêncio.
  for (const p of mt.planilhas) {
    if (!planilhasVistas.has(p.planilhaId)) planilhasSemConteudo.push(p.nome);
  }
  const compradores = higienizarVendasDoDebriefing(mt, conteudo);
  const nomesDeCampanha = nomesDeCampanhaResolvidos(mt);

  // ---- Pesquisa: etapas com pergunta confirmada (49.1) ----
  const etapasComPesquisa = new Set(Object.keys(config.perguntasConfirmadas));
  const excluidas = new Set(params.pesquisasExcluidas ?? []);
  const surveys = await db
    .select({
      id: funnelSurveys.id,
      stageId: funnelSurveys.stageId,
      spreadsheetId: funnelSurveys.spreadsheetId,
      spreadsheetName: funnelSurveys.spreadsheetName,
      sheetName: funnelSurveys.sheetName,
      columnMapping: funnelSurveys.columnMapping,
    })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.funnelId, config.funnelId));
  surveys.sort(
    (a, b) =>
      (a.stageId ?? "").localeCompare(b.stageId ?? "") ||
      a.spreadsheetId.localeCompare(b.spreadsheetId) ||
      a.sheetName.localeCompare(b.sheetName) ||
      a.id.localeCompare(b.id),
  );
  const pesquisas: PesquisaInput[] = [];
  const respondentes: RespostaInput[] = [];
  const diagnostico: DiagnosticoDoLoaderDePublico = {
    pesquisas: [],
    pesquisasForaDaConfig: [],
    pesquisasExcluidas: [],
    vendasLidas: mt.vendas.length,
    vendasHigienizadas: compradores.length,
    planilhasDeVendaSemUtmContent: planilhasSemConteudo,
    anuncios: 0,
    adIdsSemNomeNoCache: 0,
    postsDosAnuncios: { instagram: 0, facebook: 0, semPost: 0 },
    contaDeAnuncios: null,
    baseAnterior: null,
  };
  for (const s of surveys) {
    const rotulo = `${s.spreadsheetName} / ${s.sheetName}`;
    if (!s.stageId || !etapasComPesquisa.has(s.stageId)) {
      diagnostico.pesquisasForaDaConfig.push({ rotulo, stageId: s.stageId });
      continue;
    }
    if (excluidas.has(s.id)) {
      diagnostico.pesquisasExcluidas.push({ pesquisaId: s.id, rotulo, stageId: s.stageId });
      continue;
    }
    const dados = await lerOuFalhar(ler, s.spreadsheetId, s.sheetName, "a pesquisa");
    const lida = lerPesquisa(
      { pesquisaId: s.id, stageId: s.stageId, rotulo, headers: dados.headers, rows: dados.rows, mapping: s.columnMapping },
      nomesDeCampanha,
    );
    // R6-7: a pesquisa de captação marcada na config (por id — nunca por nome de aba).
    const marcada = config.pesquisaDeCaptacaoPorEtapa?.[s.stageId] === s.id;
    pesquisas.push(marcada ? { ...lida.pesquisa, pesquisaDeCaptacao: true } : lida.pesquisa);
    respondentes.push(...lida.respostas);
    diagnostico.pesquisas.push({ pesquisaId: s.id, stageId: s.stageId, rotulo, linhas: lida.respostas.length });
  }

  // ---- Anúncios (ad-level) das campanhas de captação, no período ----
  const idsCaptacao = config.etapas.filter((e) => GRUPO_DO_PAPEL[e.papel] === "captacao").map((e) => e.stageId);
  const campanhasCaptacao = new Set<string>();
  if (idsCaptacao.length > 0) {
    const etapas = await db
      .select({ campaigns: funnelStages.campaigns })
      .from(funnelStages)
      .where(inArray(funnelStages.id, idsCaptacao));
    for (const e of etapas) {
      for (const c of (e.campaigns as { id?: unknown }[] | null) ?? []) {
        if (typeof c?.id === "string" && c.id) campanhasCaptacao.add(c.id);
      }
    }
  }
  const anuncios: AnuncioDiaInput[] = [];
  if (campanhasCaptacao.size > 0) {
    const linhas = await db
      .select({
        adId: metaAdInsightsDaily.adId,
        adName: metaAdInsightsDaily.adName,
        campaignId: metaAdInsightsDaily.campaignId,
        campaignName: metaAdInsightsDaily.campaignName,
        dateStart: metaAdInsightsDaily.dateStart,
        spend: metaAdInsightsDaily.spend,
        impressions: metaAdInsightsDaily.impressions,
        actions: metaAdInsightsDaily.actions,
      })
      .from(metaAdInsightsDaily)
      .where(
        and(
          eq(metaAdInsightsDaily.projectId, config.projectId),
          inArray(metaAdInsightsDaily.campaignId, [...campanhasCaptacao]),
          gte(metaAdInsightsDaily.dateStart, janela.inicio),
          lte(metaAdInsightsDaily.dateStart, janela.fim),
        ),
      );
    for (const l of linhas) {
      anuncios.push({
        adId: l.adId,
        adName: l.adName,
        campaignId: l.campaignId,
        campaignName: l.campaignName,
        dia: l.dateStart,
        spendBruto: numeroDoBanco(l.spend),
        impressoes: numeroDoBanco(l.impressions),
        linkClicks: linkClicksDeActions(l.actions),
        landingPageViews: landingPageViewsDeActions(l.actions),
      });
    }
    anuncios.sort((a, b) => (a.adId === b.adId ? a.dia.localeCompare(b.dia) : a.adId.localeCompare(b.adId)));
  }
  diagnostico.anuncios = anuncios.length;

  // ---- Nome do Ad ID: cache do banco (insights → entity cache) ----
  const adIds = new Set<string>(anuncios.map((a) => a.adId));
  for (const c of [...respondentes.map((r) => r.utmContentCru), ...compradores.map((v) => v.utmContentCru)]) {
    const id = utmContentEfetivo(c);
    if (/^\d{10,}$/.test(id)) adIds.add(id);
  }
  const nomesDeAnuncio: Record<string, string> = {};
  const postsDosAnuncios: Record<string, string> = {};
  const textosDosAnuncios: Record<string, TextoDoAnuncio> = {};
  if (adIds.size > 0) {
    const ids = [...adIds];
    const doInsight = await db
      .select({ adId: metaAdInsightsDaily.adId, adName: metaAdInsightsDaily.adName, dateStart: metaAdInsightsDaily.dateStart })
      .from(metaAdInsightsDaily)
      .where(and(eq(metaAdInsightsDaily.projectId, config.projectId), inArray(metaAdInsightsDaily.adId, ids)))
      .orderBy(desc(metaAdInsightsDaily.dateStart));
    for (const r of doInsight) {
      const nome = (r.adName ?? "").trim();
      if (nome && !(r.adId in nomesDeAnuncio)) nomesDeAnuncio[r.adId] = nome;
    }
    const faltando = ids.filter((id) => !(id in nomesDeAnuncio));
    if (faltando.length > 0) {
      const doCache = await db
        .select({ entityId: metaEntityNamesCache.entityId, entityName: metaEntityNamesCache.entityName })
        .from(metaEntityNamesCache)
        .where(
          and(
            eq(metaEntityNamesCache.projectId, config.projectId),
            eq(metaEntityNamesCache.entityType, "ad"),
            inArray(metaEntityNamesCache.entityId, faltando),
          ),
        );
      for (const r of doCache) {
        const nome = (r.entityName ?? "").trim();
        if (nome) nomesDeAnuncio[r.entityId] = nome;
      }
    }
    diagnostico.adIdsSemNomeNoCache = ids.filter((id) => !(id in nomesDeAnuncio)).length;

    // R7-9: post publicado por Ad ID — DB-first, a MESMA leitura da 18.88 (nenhuma chamada à Meta).
    const doCacheDeCriativos = await db
      .select({ adId: metaAdCreativesCache.adId, creative: metaAdCreativesCache.creative })
      .from(metaAdCreativesCache)
      .where(condicaoDoCacheDeCriativos(config.projectId, ids));
    for (const r of doCacheDeCriativos) {
      // 49.18 (AC6): o texto do criativo — só o que o cache guarda (title/body de nível superior).
      textosDosAnuncios[r.adId] = textoDoCriativo(r.creative);
      const post = postDoAnuncio(r.creative);
      if (!post) continue;
      postsDosAnuncios[r.adId] = post;
      if (r.creative?.igPermalinkUrl) diagnostico.postsDosAnuncios.instagram += 1;
      else diagnostico.postsDosAnuncios.facebook += 1;
    }
    diagnostico.postsDosAnuncios.semPost = ids.length - Object.keys(postsDosAnuncios).length;
  }

  // ---- Conta do Ads Manager: a do funil; senão a única conta ativa do projeto ----
  const [contaDoFunil] = await db
    .select({ metaAccountId: metaAdsAccounts.metaAccountId })
    .from(funnels)
    .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, funnels.metaAccountId))
    .where(eq(funnels.id, config.funnelId))
    .limit(1);
  let contaDeAnuncios = contaDoAdsManager(contaDoFunil?.metaAccountId);
  diagnostico.contaDeAnuncios = contaDeAnuncios ? "funil" : null;
  if (!contaDeAnuncios) {
    const doProjeto = await db
      .select({ metaAccountId: metaAdsAccounts.metaAccountId })
      .from(metaAdsAccountProjects)
      .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, metaAdsAccountProjects.accountId))
      .where(and(eq(metaAdsAccountProjects.projectId, config.projectId), eq(metaAdsAccounts.isActive, true)));
    const contas = [...new Set(doProjeto.map((c) => contaDoAdsManager(c.metaAccountId)).filter((c): c is string => c !== null))];
    // Mais de uma conta no projeto: qual delas rodou o anúncio não está no banco — sem link, nunca um palpite.
    if (contas.length === 1) {
      contaDeAnuncios = contas[0]!;
      diagnostico.contaDeAnuncios = "projeto";
    } else if (contas.length > 1) {
      diagnostico.contaDeAnuncios = "ambigua";
    }
  }

  // ---- Base do lançamento de comparação (AC10) — SÓ a principal (49.11) ----
  const lista = comparacoesDoContrato(config);
  let baseAnterior: BaseAnteriorInput | null = null;
  const funilAnterior = lista[0] ?? null;
  if (funilAnterior) {
    const etapasAnt = await db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, funilAnterior));
    etapasAnt.sort((a, b) => a.id.localeCompare(b.id));
    const compradoresAnt: IdentidadeInput[] = [];
    const sheetsVistas = new Set<string>();
    for (const e of etapasAnt) {
      const { sheets } = await resolveSalesSheetsForStage(db, e.id);
      for (const sheet of sheets) {
        if (sheetsVistas.has(sheet.id)) continue;
        sheetsVistas.add(sheet.id);
        const dados = await lerOuFalhar(ler, sheet.spreadsheetId, sheet.sheetName, "a planilha de vendas do lançamento de comparação");
        compradoresAnt.push(
          ...identidadesDeVenda(sheet.id, dados.headers, dados.rows, (sheet.columnMapping ?? {}) as Record<string, unknown>),
        );
      }
    }
    // Decisão 3A (49.3): venda lançada à mão também é comprador; a reembolsada fica fora.
    const manuaisAnt =
      etapasAnt.length > 0
        ? await db
            .select({ email: manualSales.customerEmail, telefone: manualSales.customerPhone })
            .from(manualSales)
            .where(and(inArray(manualSales.stageId, etapasAnt.map((e) => e.id)), isNull(manualSales.refundedAt)))
            .orderBy(asc(manualSales.saleDate), asc(manualSales.id))
        : [];
    for (const m of manuaisAnt) {
      const email = (m.email ?? "").trim() || null;
      const telefone = (m.telefone ?? "").trim() || null;
      if (email || telefone) compradoresAnt.push({ emailCru: email, telefoneCru: telefone });
    }

    const fontesLeads = await db
      .select({
        label: funnelSpreadsheets.label,
        spreadsheetId: funnelSpreadsheets.spreadsheetId,
        spreadsheetName: funnelSpreadsheets.spreadsheetName,
        sheetName: funnelSpreadsheets.sheetName,
        columnMapping: funnelSpreadsheets.columnMapping,
      })
      .from(funnelSpreadsheets)
      .where(and(eq(funnelSpreadsheets.funnelId, funilAnterior), eq(funnelSpreadsheets.type, "leads")));
    const pesquisasAnt = await db
      .select({
        id: funnelSurveys.id,
        spreadsheetId: funnelSurveys.spreadsheetId,
        spreadsheetName: funnelSurveys.spreadsheetName,
        sheetName: funnelSurveys.sheetName,
        columnMapping: funnelSurveys.columnMapping,
      })
      .from(funnelSurveys)
      .where(eq(funnelSurveys.funnelId, funilAnterior));
    const fontes = [
      ...fontesLeads.map((f) => ({ ...f, rotulo: f.label ? `${f.label} · ${f.sheetName}` : `${f.spreadsheetName} / ${f.sheetName}`, pesquisa: false })),
      ...pesquisasAnt.map((f) => ({ ...f, rotulo: `${f.spreadsheetName} / ${f.sheetName}`, pesquisa: true })),
    ].sort((a, b) => a.spreadsheetId.localeCompare(b.spreadsheetId) || a.sheetName.localeCompare(b.sheetName));

    const leadsAnt: IdentidadeInput[] = [];
    const fontesDiag: NonNullable<DiagnosticoDoLoaderDePublico["baseAnterior"]>["fontesDeLeads"] = [];
    const vistas = new Set<string>();
    let chaves: Set<string> | null = null;
    for (const f of fontes) {
      const k = `${f.spreadsheetId}|${f.sheetName}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      const dados = await lerOuFalhar(ler, f.spreadsheetId, f.sheetName, "a fonte de leads do lançamento de comparação");
      const lida = lerFonteDeLead({
        label: f.rotulo,
        headers: dados.headers,
        rows: dados.rows,
        mapping: (f.columnMapping ?? {}) as Record<string, unknown>,
      });
      leadsAnt.push(...lida.leads.map((l) => ({ emailCru: l.emailCru, telefoneCru: l.telefoneCru })));
      fontesDiag.push({ rotulo: f.rotulo, linhas: lida.leads.length, semIdentificador: lida.semIdentificador });
      if (f.pesquisa) {
        chaves ??= new Set<string>();
        for (const c of chavesComResposta(dados.headers, dados.rows, f.columnMapping as MappingDaPesquisa)) chaves.add(c);
      }
    }
    // Fonte que existe mas não tem coluna de e-mail nem telefone não é base de leads.
    const temLeads = fontesDiag.some((f) => !f.semIdentificador);
    baseAnterior = {
      funnelId: funilAnterior,
      tipo: temLeads ? "leads+compradores" : "compradores",
      leads: temLeads ? leadsAnt : [],
      compradores: compradoresAnt,
      chavesDePerguntaComResposta: chaves ? [...chaves].sort() : null,
    };
    diagnostico.baseAnterior = {
      funnelId: funilAnterior,
      fontesDeLeads: fontesDiag,
      planilhasDeVenda: sheetsVistas.size,
      vendasManuais: manuaisAnt.length,
    };
  }

  // ---- Série histórica (49.11): as chaves de pergunta de CADA lançamento da lista ----
  // A principal já foi lida acima (mesmas pesquisas); as demais leem só as
  // pesquisas do funil, com o leitor memoizado. Falha = DADO_INDISPONIVEL.
  const seriesDeComparacao: SerieDeComparacaoInput[] = [];
  if (lista.length > 0) {
    // Nome só com 2+ (a composição só é declarada aí; com 1, o payload é o de antes).
    const nomes = new Map<string, string>();
    if (lista.length >= 2) {
      for (const f of await db.select({ id: funnels.id, name: funnels.name }).from(funnels).where(inArray(funnels.id, lista))) {
        nomes.set(f.id, f.name);
      }
    }
    for (const [i, funnelId] of lista.entries()) {
      const chaves =
        i === 0 ? (baseAnterior?.chavesDePerguntaComResposta ?? null) : await chavesDePerguntaDoFunil(db, ler, funnelId);
      seriesDeComparacao.push({ funnelId, nome: nomes.get(funnelId) ?? null, chavesDePerguntaComResposta: chaves });
    }
  }

  return {
    config: {
      perguntasConfirmadas: config.perguntasConfirmadas,
      dimensaoDeCriativo: config.dimensaoDeCriativo,
      imposto: config.imposto,
    },
    janela,
    pesquisas,
    respondentes,
    compradores,
    criativos: { anuncios, nomesDeAnuncio, contaDeAnuncios, postsDosAnuncios, textosDosAnuncios },
    baseAnterior,
    seriesDeComparacao,
    classificador: mt.classificador,
    diagnostico,
  };
}

/**
 * A lista de comparação do contrato (49.11). Contrato montado na forma
 * anterior (sem `lancamentosComparacao`) vale `[lancamentoComparacaoFunnelId]`.
 */
function comparacoesDoContrato(config: Pick<DebriefingConfigLancamento, "lancamentoComparacaoFunnelId" | "lancamentosComparacao">): string[] {
  if (config.lancamentosComparacao !== undefined) return [...config.lancamentosComparacao];
  return config.lancamentoComparacaoFunnelId ? [config.lancamentoComparacaoFunnelId] : [];
}

/**
 * Chaves (e cabeçalhos) de pergunta com resposta nas pesquisas de um funil de
 * comparação — a mesma leitura da principal (`chavesComResposta`), aba lida uma
 * vez. `null` = o funil não tem pesquisa conectada.
 */
async function chavesDePerguntaDoFunil(db: Database, ler: LerPlanilha, funnelId: string): Promise<string[] | null> {
  const pesquisas = await db
    .select({
      spreadsheetId: funnelSurveys.spreadsheetId,
      sheetName: funnelSurveys.sheetName,
      columnMapping: funnelSurveys.columnMapping,
    })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.funnelId, funnelId));
  if (pesquisas.length === 0) return null;
  pesquisas.sort((a, b) => a.spreadsheetId.localeCompare(b.spreadsheetId) || a.sheetName.localeCompare(b.sheetName));
  const chaves = new Set<string>();
  const vistas = new Set<string>();
  for (const p of pesquisas) {
    const k = `${p.spreadsheetId}|${p.sheetName}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    const dados = await lerOuFalhar(ler, p.spreadsheetId, p.sheetName, "a pesquisa do lançamento de comparação");
    for (const c of chavesComResposta(dados.headers, dados.rows, p.columnMapping as MappingDaPesquisa)) chaves.add(c);
  }
  return [...chaves].sort();
}
