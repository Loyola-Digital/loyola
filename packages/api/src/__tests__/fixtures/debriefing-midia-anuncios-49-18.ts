/**
 * Story 49.18 — entrada sintética da mídia por anúncio, sobre a da 49.5
 * (`debriefing-payload-sintetico.ts`, que não é alterada).
 *
 * Usa SÓ o que já existia no commit-base da story (`c0a63eb4`): o mesmo
 * arquivo roda lá, num script, para medir o SHA do HTML inteiro de antes
 * (AC8). Os campos novos da entrada (`landingPageViews`, `textosDosAnuncios`)
 * são ignorados pelo código de antes.
 *
 * O que a fixture diferencia (AC9):
 * - um nome com dois Ad IDs (`ad01--lote--claude`: um no quente, outro no frio
 *   ADV+) — as métricas somam;
 * - escassez com acento (`último-dia`) e sem acento, em maiúsculas (`ULTIMAS HORAS`);
 * - `cold-adv` no nome da campanha;
 * - estático, vídeo e campanha sem formato;
 * - `landing_page_view` ausente num nome inteiro (o de vídeo);
 * - comprador sem Ad ID e comprador com Ad ID fora do ad-level;
 * - comprador com ingresso E order bump (duas linhas, o bump com o Ad ID de outro
 *   anúncio): atribuído pela linha de ingresso, faturamento somado, tier superior;
 * - um anúncio sem comprador (CPA "—").
 */

import type { DebriefingConfigLancamento } from "../../services/debriefing-config.js";
import {
  computeDebriefingMoneyTime,
  configDoMotor,
  type DebriefingMoneyTimeInput,
  type VendaCruaInput,
} from "../../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience, type AnuncioDiaInput } from "../../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../../services/debriefing-audience-loader.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../../services/debriefing-payload.js";
import { entradaAudienceSintetica, entradaMoneyTimeSintetica } from "./debriefing-payload-sintetico.js";

export const AD_A1 = "120200000000000001";
export const AD_A2 = "120200000000000002";
export const AD_B = "120200000000000003";
export const AD_C = "120200000000000004";
export const AD_ESC1 = "120200000000000005";
export const AD_ESC2 = "120200000000000006";
/** Ad ID que está numa venda e NÃO está no ad-level de captação. */
export const AD_FORA = "120200000000000099";

export const NOME_A = "ad01--lote--claude";
export const NOME_B = "v02--video-claude";
export const NOME_C = "ad03--sem-compra";
export const NOME_ESC1 = "ad07--lote-promo--último-dia";
export const NOME_ESC2 = "AD09 ULTIMAS HORAS";

const CAMP = {
  hotEst: "lanc--vendas-captacao--hot--cbo--estaticos--lpa",
  advEst: "lanc--vendas-captacao--cold-adv--cbo--estaticos--lpa",
  coldVid: "lanc--vendas-captacao--cold--cbo--videos--lpa",
  hotVid: "lanc--vendas-captacao--hot--cbo--videos",
  hotEsc: "lanc--vendas-captacao--hot--cbo--estaticos-escassez--lpa",
  semFormato: "lanc--vendas-captacao--hot--cbo--lpa",
} as const;

type Anuncio = AnuncioDiaInput & { landingPageViews?: number | null };

const ad = (adId: string, adName: string, campaignName: string, dia: string, spendBruto: number, linkClicks: number | null, lpv: number | null): Anuncio => ({
  adId,
  adName,
  campaignId: `c-${campaignName.length}`,
  campaignName,
  dia,
  spendBruto,
  impressoes: spendBruto * 10,
  linkClicks,
  landingPageViews: lpv,
});

/** Ad-level de captação (antes do corte da janela, que é do loader). */
export function anunciosSinteticos(fator = 1): Anuncio[] {
  return [
    ad(AD_A1, NOME_A, CAMP.hotEst, "2026-04-20", 100 * fator, 50, 40),
    ad(AD_A2, NOME_A, CAMP.advEst, "2026-04-21", 50 * fator, 20, 10),
    ad(AD_B, NOME_B, CAMP.coldVid, "2026-04-20", 80 * fator, 30, null),
    ad(AD_C, NOME_C, CAMP.hotVid, "2026-04-21", 10 * fator, 4, 2),
    ad(AD_ESC1, NOME_ESC1, CAMP.hotEsc, "2026-04-20", 30 * fator, 10, 8),
    ad(AD_ESC1, NOME_ESC1, CAMP.hotEsc, "2026-04-21", 15 * fator, 5, 4),
    ad(AD_ESC2, NOME_ESC2, CAMP.semFormato, "2026-04-21", 20 * fator, 5, 4),
    // Depois do corte da parcial (21/04, D+4) — só a janela final o vê.
    ad(AD_B, NOME_B, CAMP.coldVid, "2026-04-25", 40 * fator, 10, null),
  ];
}

/** utm_content por e-mail da venda de captação (o `co=` da planilha). */
const CONTEUDO: Readonly<Record<string, string>> = {
  "c1@x.com": AD_A1,
  "c2@x.com": AD_A2,
  "c3@x.com": AD_ESC1,
  "c4@x.com": "org",
  "c6@x.com": AD_ESC2,
  "c7@x.com": AD_B,
  "c8@x.com": AD_FORA,
  "c9@x.com": AD_B,
  "c10@x.com": AD_B,
};

const venda = (linha: number, emailCru: string, over: Partial<VendaCruaInput> = {}): VendaCruaInput => ({
  planilhaId: "p-cap",
  linha,
  idDaVendaCru: `M${linha}`,
  produto: "Imersão",
  tipo: "ingresso",
  tipoClassificado: true,
  valorBrutoCru: "99,00",
  moeda: null,
  statusCru: "paid",
  emailCru,
  telefoneCru: null,
  dataVendaCru: "20/04/2026",
  utm: {},
  sellerName: null,
  ...over,
});

/**
 * QA 49.18 (TEST-001, E10) — identidade UNIDA: o c10 compra o ingresso (pelo
 * anúncio B) com e-mail e telefone; o order bump vem noutro registro, com OUTRO
 * e-mail e o MESMO telefone. Pelo critério headline (e-mail) são duas pessoas e
 * o bump é avulso; pela união e-mail ∪ telefone seriam uma. Fora do cenário
 * padrão (não muda os SHA do AC8): só com `identidadeUnida`.
 */
export const VENDAS_DE_IDENTIDADE_UNIDA: readonly VendaCruaInput[] = [
  venda(106, "c10@x.com", { telefoneCru: "11955554444" }),
  venda(107, "c10.outro@x.com", { telefoneCru: "5511955554444", produto: "Bump Extra", tipo: "order_bump", valorBrutoCru: "47,00" }),
];

/** Entrada do Motor I com as vendas extras (c6…c9); `lado = "comparacao"` tira c7 e c9 e dobra a mídia. */
export function entradaMtMidia(
  config: DebriefingConfigLancamento,
  lado: "atual" | "comparacao" = "atual",
  opts: { identidadeUnida?: boolean } = {},
): DebriefingMoneyTimeInput {
  const base = entradaMoneyTimeSintetica();
  const extras = [
    venda(101, "c6@x.com", { produto: "Combo", tipo: "combo", valorBrutoCru: "297,00", dataVendaCru: "21/04/2026" }),
    venda(102, "c7@x.com", { dataVendaCru: "21/04/2026" }),
    venda(103, "c8@x.com"),
    // Depois do corte da parcial (21/04): só o final o vê.
    venda(104, "c9@x.com", { dataVendaCru: "25/04/2026" }),
    // O c1 também leva o order bump, numa linha com o utm_content de OUTRO anúncio (o B): o
    // comprador é do anúncio da linha de ingresso (A1) e o faturamento dele soma as duas linhas.
    venda(105, "c1@x.com", { idDaVendaCru: "M105", produto: "Bump Extra", tipo: "order_bump", valorBrutoCru: "47,00" }),
    ...(opts.identidadeUnida ? VENDAS_DE_IDENTIDADE_UNIDA : []),
  ].filter((v) => lado === "atual" || (v.emailCru !== "c7@x.com" && v.emailCru !== "c9@x.com"));
  return { ...base, config: configDoMotor(config), vendas: [...base.vendas, ...extras] };
}

/** `p-cap#linha` → utm_content, como `conteudoDaPlanilhaDeVenda`. */
export function conteudoDasVendas(mt: DebriefingMoneyTimeInput): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const v of mt.vendas) {
    if (v.planilhaId !== "p-cap") continue;
    m.set(`p-cap#${v.linha}`, v.linha === 105 ? AD_B : (CONTEUDO[v.emailCru ?? ""] ?? null));
  }
  return m;
}

export type TextosDaFixture = Record<string, { title: string | null; body: string | null }>;

/** Payload pelos motores reais, com o ad-level cortado na janela (o que o loader faz por SQL). */
export function payloadMidia(
  config: DebriefingConfigLancamento,
  opts: { lado?: "atual" | "comparacao"; geradoEm?: Date | string; semAdLevel?: boolean; textos?: TextosDaFixture; identidadeUnida?: boolean } = {},
): DebriefingPayload {
  const lado = opts.lado ?? "atual";
  const mtIn = entradaMtMidia(config, lado, { identidadeUnida: opts.identidadeUnida === true });
  const mt = computeDebriefingMoneyTime(mtIn);
  const au0 = entradaAudienceSintetica(mtIn);
  const j = mt.janela;
  const anuncios = opts.semAdLevel ? [] : anunciosSinteticos(lado === "comparacao" ? 2 : 1).filter((a) => a.dia >= j.inicio && a.dia <= j.fim);
  const au = computeDebriefingAudience({
    ...au0,
    janela: j,
    compradores: higienizarVendasDoDebriefing(mtIn, conteudoDasVendas(mtIn)),
    criativos: {
      anuncios,
      nomesDeAnuncio: {},
      contaDeAnuncios: "3717530711643512",
      postsDosAnuncios: { [AD_A2]: "https://www.instagram.com/p/POST-A2/", [AD_B]: "https://www.facebook.com/1/posts/B" },
      ...(opts.textos ? { textosDosAnuncios: opts.textos } : {}),
    } as Parameters<typeof computeDebriefingAudience>[0]["criativos"],
  });
  return montarPayloadDebriefing(mt, au, config, opts.geradoEm ?? "2026-10-02T12:00:00.000Z");
}

// ---------------------------------------------------------------------------
// Cenários pelo orquestrador (`gerarDebriefing`), com o relógio fixado
// ---------------------------------------------------------------------------

export const IDS = {
  P: "10000000-0000-4000-8000-000000000001",
  F: "20000000-0000-4000-8000-000000000001",
  FB: "20000000-0000-4000-8000-000000000002",
  S: "30000000-0000-4000-8000-000000000001",
  SB: "30000000-0000-4000-8000-000000000002",
  U: "40000000-0000-4000-8000-000000000001",
} as const;
export const PARAMS_DA_MIDIA = { projectId: IDS.P, funnelId: IDS.F, stageId: IDS.S, userId: IDS.U, userRole: "user", investimentoOficial: null } as const;
/** 12:00 de 22/04/2026 em Brasília → corte 21/04 (D+4). */
export const AGORA_PARCIAL_MIDIA = new Date("2026-04-22T15:00:00.000Z");
export const AGORA_FINAL_MIDIA = new Date("2026-10-02T12:00:00.000Z");

export interface CenarioDaMidia {
  modo: "final" | "parcial";
  comparacao: null | "recalculada" | "salva-antiga";
  semAdLevel?: boolean;
  textos?: TextosDaFixture;
}

export function configDaMidia(base: DebriefingConfigLancamento, c: Pick<CenarioDaMidia, "modo">): DebriefingConfigLancamento {
  const cfg = { ...base, stageId: IDS.S, funnelId: IDS.F, projectId: IDS.P } as DebriefingConfigLancamento;
  if (c.modo === "final") return cfg;
  return {
    ...cfg,
    situacaoDoLancamento: "em-andamento",
    datasChave: { inicioCaptacao: "2026-04-17", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null },
    aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
  } as unknown as DebriefingConfigLancamento;
}

/**
 * Dependências do `gerarDebriefing` para um cenário. `configBase` é a config
 * sintética da 49.5 (passada por quem chama, para a fixture não importar mais
 * nada). A comparação "salva-antiga" é um relatório salvo SEM a mídia por
 * anúncio (o que uma geração anterior à 49.18 gravou).
 */
export function depsDaMidia(c: CenarioDaMidia, configBase: DebriefingConfigLancamento) {
  const gravados: { html: string; payload: DebriefingPayload }[] = [];
  const atual = configDaMidia(configBase, c);
  const comp = { ...configBase, stageId: IDS.SB, funnelId: IDS.FB, projectId: IDS.P } as DebriefingConfigLancamento;
  const config = c.comparacao ? { ...atual, lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } : atual;
  const salvo = (() => {
    if (c.comparacao !== "salva-antiga") return null;
    const p = payloadMidia(comp, { lado: "comparacao", geradoEm: "2026-07-01T12:00:00.000Z" });
    delete (p.publico as { midiaPorAnuncio?: unknown }).midiaPorAnuncio;
    return { debriefingId: "50000000-0000-4000-8000-000000000009", salvoEm: "2026-07-01T12:00:00.000Z", payload: p };
  })();
  return {
    gravados,
    resolverEtapa: async () => ({ stageId: IDS.S, stageName: "Debriefing", stageType: "debriefing", funnelId: IDS.F, funnelName: "PG05", projectId: IDS.P, projectName: "Expert" }),
    carregarConfig: async (sid: string) => (sid === IDS.SB ? comp : config),
    etapasDeDebriefingDoFunil: async () => (c.comparacao === "recalculada" ? [IDS.SB] : []),
    ultimoPayloadSalvoDoFunil: async () => salvo,
    calcularPayload: async (cfg: DebriefingConfigLancamento, g: Date) =>
      payloadMidia(cfg, {
        lado: cfg.funnelId === IDS.FB ? "comparacao" : "atual",
        geradoEm: g,
        ...(c.semAdLevel ? { semAdLevel: true } : {}),
        ...(c.textos && cfg.funnelId !== IDS.FB ? { textos: c.textos } : {}),
      }),
    nomes: async () => ({ funis: { [IDS.F]: "PG05", [IDS.FB]: "PG04" }, etapas: { "stage-cap": "Captação", "stage-prin": "Principal" } }),
    gravar: async (r: { html: string; payload: DebriefingPayload }) => {
      gravados.push(r);
      return { id: "60000000-0000-4000-8000-000000000001" };
    },
    estadoDoSyncDaMidia: async () => [],
    agora: () => (c.modo === "parcial" ? AGORA_PARCIAL_MIDIA : AGORA_FINAL_MIDIA),
  };
}

/** Os cenários do AC8 (HTML inteiro medido no commit-base e depois da story). */
export const CENARIOS_DO_AC8: Record<string, CenarioDaMidia> = {
  "final-edicao-unica": { modo: "final", comparacao: null },
  "final-comparacao-recalculada": { modo: "final", comparacao: "recalculada" },
  "final-comparacao-salva-antiga": { modo: "final", comparacao: "salva-antiga" },
  "parcial-edicao-unica": { modo: "parcial", comparacao: null },
  "parcial-comparacao-recalculada": { modo: "parcial", comparacao: "recalculada" },
  "parcial-comparacao-salva": { modo: "parcial", comparacao: "salva-antiga" },
  "final-sem-ad-level": { modo: "final", comparacao: null, semAdLevel: true },
};
