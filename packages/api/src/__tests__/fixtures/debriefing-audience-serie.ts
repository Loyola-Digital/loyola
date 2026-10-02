/**
 * Story 49.11 — entrada sintética (sem PII real) do Motor II para a série
 * histórica N-ária e o desempate pela pesquisa de captação.
 *
 * Fixture (não termina em `.test.ts`, então o vitest não o coleta). A entrada
 * base é UM lançamento de comparação (`baseAnterior`), uma pesquisa e nenhuma
 * marca de pesquisa de captação — o caso de hoje. O golden
 * `debriefing-audience-n1.golden.json` é o payload que o motor da `main`
 * (`b419a7f3`, antes da 49.11) devolvia para ESTA entrada; o teste de n = 1
 * compara contra ele.
 */

import { CLASSIFICADOR_VERSAO, classificarOrigem, type Utm } from "@loyola-x/shared";
import type {
  DebriefingAudienceInput,
  PesquisaInput,
  RespostaInput,
  VendaHigienizadaInput,
} from "../../services/debriefing-audience-engine.js";

export const CAP = "stage-cap";
export const PESQ = "pesq-captacao";
export const PESQ_ALUNOS = "pesq-alunos";
export const AD1 = "120000000000000001";
export const AD2 = "120000000000000002";

const classificador = {
  versao: CLASSIFICADOR_VERSAO,
  classificar: (e: Parameters<typeof classificarOrigem>[0]) =>
    classificarOrigem(e, { closerMediums: ["x1"], closerNomes: [], closerPorSellerName: true, ferramentasDeAtendimento: [] }),
};

export const pesquisaPrincipal: PesquisaInput = {
  pesquisaId: PESQ,
  stageId: CAP,
  rotulo: "Painel / Pesquisa-Captação",
  temColunaEmail: true,
  chavesDePergunta: ["faixa", "renda_mensal", "Sexo"],
  // modo legado: a chave `renda_mensal` é apelido; o cabeçalho é a pergunta
  cabecalhoDaChave: { faixa: "Faixa 1", renda_mensal: "Qual a sua renda mensal?", Sexo: "Sexo" },
};

let linha = 0;
export function resp(
  p: Partial<RespostaInput> & { email?: string | null; faixa?: string; renda?: string; sexo?: string },
): RespostaInput {
  linha += 1;
  return {
    pesquisaId: p.pesquisaId ?? PESQ,
    linha: p.linha ?? linha,
    linhaTemRespondente: p.linhaTemRespondente ?? true,
    emailCru: p.email === undefined ? null : p.email,
    telefoneCru: p.telefoneCru ?? null,
    dataRespostaCru: p.dataRespostaCru ?? null,
    utm: p.utm ?? {},
    utmContentCru: p.utmContentCru ?? null,
    respostas: p.respostas ?? {
      faixa: p.faixa ?? null,
      renda_mensal: p.renda ?? null,
      Sexo: p.sexo ?? null,
    },
  };
}

function venda(p: Partial<VendaHigienizadaInput> & { email?: string | null }): VendaHigienizadaInput {
  return {
    planilhaId: p.planilhaId ?? "cap:s1",
    linha: p.linha ?? 1,
    grupo: p.grupo ?? "captacao",
    emailCru: p.email === undefined ? null : p.email,
    telefoneCru: p.telefoneCru ?? null,
    utm: p.utm ?? {},
    utmContentCru: p.utmContentCru ?? null,
    sellerName: p.sellerName ?? null,
    comprouCaptacao: p.comprouCaptacao ?? false,
    comprouPrincipal: p.comprouPrincipal ?? false,
    comprouTierSuperior: p.comprouTierSuperior ?? false,
  };
}

const HOT: Utm = { source: "fb", term: "lp|hot|dg-pg02-ia-01" };

/** Entrada mutável (a do motor é `readonly`). */
export type EntradaDeSerie = Omit<DebriefingAudienceInput, "respondentes" | "compradores" | "pesquisas"> & {
  pesquisas: PesquisaInput[];
  respondentes: RespostaInput[];
  compradores: VendaHigienizadaInput[];
};

/** UM lançamento de comparação (o caso de hoje): a série é "existe nos dois". */
export function entradaDeSerie(): EntradaDeSerie {
  linha = 0;
  return {
    config: {
      perguntasConfirmadas: { [CAP]: { faixa: "faixa", renda: "renda_mensal", sexo: "Sexo" } },
      dimensaoDeCriativo: "ia-humano",
      imposto: { valor: 0.1215, origem: "default" },
    },
    janela: { inicio: "2026-04-17", fim: "2026-05-31", fimPor: "fimCarrinho", regra: "teste" },
    pesquisas: [pesquisaPrincipal],
    respondentes: [
      resp({ email: "a@x.com", faixa: "A", renda: "Até 5 mil", sexo: "Feminino", utm: HOT, utmContentCru: AD1, dataRespostaCru: "17/04/2026" }),
      resp({ email: "b@x.com", faixa: "B", renda: "5 a 10 mil", sexo: "Masculino", utm: HOT, utmContentCru: AD2, dataRespostaCru: "17/04/2026" }),
      resp({ email: "c@x.com", faixa: "D", renda: "Até 5 mil", utm: { source: "ig" }, dataRespostaCru: "18/04/2026" }),
      resp({ email: "c@x.com", faixa: "C", renda: "Até 5 mil", utm: { source: "ig" }, dataRespostaCru: "19/04/2026" }),
      resp({ email: "d@x.com", faixa: "C", sexo: "Feminino", utm: { medium: "x1" } }),
      resp({ email: null, linhaTemRespondente: false }),
    ],
    compradores: [
      venda({ email: "a@x.com", linha: 1, comprouCaptacao: true, utm: HOT, utmContentCru: AD1 }),
      venda({ email: "b@x.com", linha: 2, comprouCaptacao: true, comprouTierSuperior: true }),
      venda({ email: "z@x.com", linha: 3, comprouCaptacao: true }),
      venda({ email: "a@x.com", planilhaId: "prin:s1", linha: 1, grupo: "principal", comprouPrincipal: true }),
    ],
    criativos: {
      anuncios: [
        { adId: AD1, adName: "dg-pg02-ia-01", campaignId: "111", campaignName: "dg--vendas-captacao--hot", dia: "2026-04-20", spendBruto: 100, impressoes: 1000, linkClicks: 50 },
      ],
      nomesDeAnuncio: { [AD1]: "dg-pg02-ia-01" },
      contaDeAnuncios: "3717530711643512",
    },
    baseAnterior: {
      funnelId: "funil-pg01",
      tipo: "leads+compradores",
      leads: [
        { emailCru: "a@x.com", telefoneCru: null },
        { emailCru: "w@x.com", telefoneCru: null },
      ],
      compradores: [{ emailCru: "b@x.com", telefoneCru: null }],
      // `faixa` pela chave; a renda pelo CABEÇALHO (a chave do anterior é outra)
      chavesDePerguntaComResposta: ["faixa", "Qual a sua renda mensal?"],
    },
    classificador,
  };
}
