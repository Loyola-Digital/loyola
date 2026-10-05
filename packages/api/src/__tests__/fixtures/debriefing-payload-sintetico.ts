/**
 * Story 49.5 — entrada sintética que PRODUZ cada armadilha da skill e o payload
 * que os motores REAIS (49.3 e 49.4) geram a partir dela.
 *
 * Sem PII real: e-mails `cN@x.com`, telefones fictícios. Fica fora de
 * `fixtures/debriefing/` (lá só há números de oráculo, teste de formato LGPD).
 *
 * Armadilhas presentes na entrada: dup 2× por ID da venda (#1), "4.000" (#2),
 * produto fora de `product_types` (#3), telefone com ".0" (higiene), e-mail
 * repetido na pesquisa (#6), lead anterior à venda (#4), cauda além de D+35
 * (#7), dia de gasto ~zero (#10), venda do principal antes da abertura
 * (decisão 7), venda via TMB (check 2), etapa sem `link_click` (WF5).
 */

import { CLASSIFICADOR_VERSAO, classificarOrigem, type ConfigClassificador, type Utm } from "@loyola-x/shared";
import type { DebriefingConfigLancamento } from "../../services/debriefing-config.js";
import {
  CRITERIO_DE_UNICO_HEADLINE,
  computeDebriefingMoneyTime,
  type ClassificadorInjetado,
  type DebriefingMoneyTimeInput,
  type MidiaCampanhaDiaInput,
  type VendaCruaInput,
} from "../../services/debriefing-money-time-engine.js";
import {
  computeDebriefingAudience,
  type DebriefingAudienceInput,
  type RespostaInput,
} from "../../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../../services/debriefing-audience-loader.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../../services/debriefing-payload.js";

export const CAP = "stage-cap";
export const PRIN = "stage-prin";
export const PESQ = "pesq-cap";
export const GERADO_EM = "2026-10-02T12:00:00.000Z";

const CFG_CLASSIF: ConfigClassificador = {
  closerMediums: ["closer-medium"],
  closerNomes: [],
  closerPorSellerName: true,
  ferramentasDeAtendimento: [],
};
export const classificador: ClassificadorInjetado = {
  versao: CLASSIFICADOR_VERSAO,
  classificar: (e) => classificarOrigem(e, CFG_CLASSIF),
};

export function configSintetica(): DebriefingConfigLancamento {
  return {
    tipoDeFunil: "launch",
    stageId: CAP,
    funnelId: "funil-sintetico",
    projectId: "projeto-sintetico",
    datasChave: {
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-11",
      fimCarrinho: "2026-06-30",
      reabertura: { houve: false },
      downsell: { houve: false },
    },
    lancamentoComparacaoFunnelId: null,
    lancamentosComparacao: [],
    pesquisaDeCaptacaoPorEtapa: {},
    etapas: [
      { stageId: CAP, papel: "vendas-captacao" },
      { stageId: PRIN, papel: "vendas-principal" },
    ],
    perguntasConfirmadas: { [CAP]: { faixa: "faixa", sexo: "Sexo" } },
    closerMediums: ["closer-medium"],
    closerPorSellerName: true,
    ferramentasDeAtendimento: [],
    dimensaoDeCriativo: "ia-humano",
    imposto: { valor: 0.1215, origem: "default" },
    validado: true,
    validadoEm: null,
    validadoPor: null,
    avisos: [],
  };
}

const HOT: Utm = { source: "fb", medium: "paid", campaign: "camp-hot", term: "lp|hot|ad-01" };
const ORG: Utm = { source: "ig", medium: "bio" };

let seq = 0;
function venda(planilhaId: string, over: Partial<VendaCruaInput>): VendaCruaInput {
  seq += 1;
  return {
    planilhaId,
    linha: seq,
    idDaVendaCru: `T${seq}`,
    produto: "Imersão",
    tipo: "ingresso",
    tipoClassificado: true,
    valorBrutoCru: "99,00",
    moeda: null,
    statusCru: "paid",
    emailCru: `c${seq}@x.com`,
    telefoneCru: null,
    dataVendaCru: "20/04/2026",
    utm: {},
    sellerName: null,
    ...over,
  };
}

const midia = (over: Partial<MidiaCampanhaDiaInput>): MidiaCampanhaDiaInput => ({
  stageId: CAP,
  campaignId: "c-cap-hot",
  campaignName: "lanc--vendas-captacao--hot--cbo",
  dia: "2026-04-20",
  spendBruto: 100,
  impressoes: 10000,
  linkClicks: 200,
  ...over,
});

export function entradaMoneyTimeSintetica(): DebriefingMoneyTimeInput {
  seq = 0;
  const vendas: VendaCruaInput[] = [
    // #1: a mesma venda (mesmo ID e produto) duas vezes na planilha.
    venda("p-cap", { idDaVendaCru: "TX-1", emailCru: "c1@x.com", utm: HOT }),
    venda("p-cap", { idDaVendaCru: "TX-1", emailCru: "c1@x.com", utm: HOT }),
    venda("p-cap", { emailCru: "c2@x.com", produto: "Combo", tipo: "combo", valorBrutoCru: "297,00", utm: ORG }),
    // #3: produto fora de product_types — o default da etapa paga (ingresso).
    venda("p-cap", { emailCru: "c3@x.com", produto: "Produto Novo", tipoClassificado: false }),
    // ".0" no telefone (célula numérica do Sheets).
    venda("p-cap", { emailCru: "c4@x.com", telefoneCru: "5511988887777.0" }),
    venda("p-cap", { emailCru: "c5@x.com", produto: "Bump Extra", tipo: "order_bump", valorBrutoCru: "47,00" }),
    // #2: "4.000" é quatro mil reais.
    venda("p-prin", { emailCru: "c1@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000", dataVendaCru: "12/05/2026", utm: { medium: "closer-medium" } }),
    venda("p-prin", { emailCru: "c2@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000,00", dataVendaCru: "13/05/2026", utm: ORG }),
    // #7: cauda — lead em 18/04, venda em 15/06 (além de D+45).
    venda("p-prin", { emailCru: "c4@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000,00", dataVendaCru: "15/06/2026" }),
    // Decisão 7: principal antes da abertura do carrinho sai e é listada.
    venda("p-prin", { emailCru: "c3@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000,00", dataVendaCru: "05/05/2026" }),
    // Check 2: TMB conta a venda, o valor fica fora.
    venda("p-tmb", { emailCru: "c5@x.com", produto: "Mentoria", tipo: "principal", valorBrutoCru: "3.500,00", dataVendaCru: "14/05/2026" }),
  ];
  return {
    config: configSintetica(),
    criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE,
    planilhas: [
      { planilhaId: "p-cap", stageId: CAP, nome: "cap", plataforma: "main_product", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: true },
      { planilhaId: "p-prin", stageId: PRIN, nome: "prin", plataforma: "sales", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: false },
      { planilhaId: "p-tmb", stageId: PRIN, nome: "tmb", plataforma: "tmb", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: false },
    ],
    vendas,
    leads: [
      // #4: a coorte é pela data do LEAD (18/04), não da venda.
      { emailCru: "c1@x.com", telefoneCru: null, dataCriacaoCru: "18/04/2026", utm: HOT },
      { emailCru: "c2@x.com", telefoneCru: null, dataCriacaoCru: "19/04/2026", utm: ORG },
      { emailCru: "c4@x.com", telefoneCru: null, dataCriacaoCru: "18/04/2026", utm: {} },
    ],
    midia: [
      midia({ dia: "2026-04-20", spendBruto: 100 }),
      midia({ dia: "2026-04-21", spendBruto: 100 }),
      // #10: gasto ~zero — ROAS do dia é artefato.
      midia({ dia: "2026-04-22", spendBruto: 1, impressoes: 50, linkClicks: 1 }),
      midia({ stageId: PRIN, campaignId: "c-prin", campaignName: "lanc--vendas-principal--hot--cbo", dia: "2026-05-12", spendBruto: 50, impressoes: 3000, linkClicks: null }),
    ],
    classificador,
  };
}

let linhaPesq = 0;
function resp(email: string | null, faixa: string | null, over: Partial<RespostaInput> = {}): RespostaInput {
  linhaPesq += 1;
  return {
    pesquisaId: PESQ,
    linha: linhaPesq,
    linhaTemRespondente: email !== null,
    emailCru: email,
    telefoneCru: null,
    dataRespostaCru: "19/04/2026",
    utm: {},
    utmContentCru: null,
    respostas: { faixa, Sexo: "Feminino" },
    ...over,
  };
}

export function entradaAudienceSintetica(mt: DebriefingMoneyTimeInput): DebriefingAudienceInput {
  linhaPesq = 0;
  const config = configSintetica();
  return {
    config: { perguntasConfirmadas: config.perguntasConfirmadas, dimensaoDeCriativo: config.dimensaoDeCriativo, imposto: config.imposto },
    janela: computeDebriefingMoneyTime(mt).janela,
    pesquisas: [
      {
        pesquisaId: PESQ,
        stageId: CAP,
        rotulo: "pesquisa / respostas",
        temColunaEmail: true,
        chavesDePergunta: ["faixa", "Sexo"],
        cabecalhoDaChave: { faixa: "Faixa", Sexo: "Sexo" },
      },
    ],
    respondentes: [
      resp("c1@x.com", "A", { dataRespostaCru: "18/04/2026" }),
      // #6: o mesmo e-mail respondeu 2× — fica a resposta mais recente.
      resp("C1@x.com ", "B", { dataRespostaCru: "20/04/2026" }),
      resp("c2@x.com", "B"),
      resp("c3@x.com", "D"),
      resp("c4@x.com", "C"),
      resp(null, null),
    ],
    compradores: higienizarVendasDoDebriefing(mt),
    criativos: { anuncios: [], nomesDeAnuncio: {}, contaDeAnuncios: null, postsDosAnuncios: {} },
    baseAnterior: null,
    classificador,
  };
}

/** O payload que os motores reais produzem sobre a entrada sintética. */
export function payloadSintetico(): DebriefingPayload {
  const mtIn = entradaMoneyTimeSintetica();
  const mt = computeDebriefingMoneyTime(mtIn);
  const au = computeDebriefingAudience(entradaAudienceSintetica(mtIn));
  return montarPayloadDebriefing(mt, au, configSintetica(), GERADO_EM);
}

/** Cópia profunda para mutação mínima por teste. */
export function payloadMinimo(): DebriefingPayload {
  return structuredClone(payloadSintetico());
}
