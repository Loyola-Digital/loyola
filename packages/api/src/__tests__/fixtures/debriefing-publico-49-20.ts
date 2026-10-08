/**
 * Story 49.20 — entrada sintética da recompra por origem (AC1) e da pesquisa por
 * pergunta (AC2), sobre a da 49.18 (`debriefing-midia-anuncios-49-18.ts`) e a da
 * 49.5 (`debriefing-payload-sintetico.ts`), que não são alteradas.
 *
 * Usa SÓ o que já existia no commit-base da story (`a1d8d121`): o mesmo arquivo
 * roda lá, num script, para medir o SHA do HTML inteiro e do payload de antes
 * (AC3). Nada desta fixture depende de código da 49.20.
 *
 * O que a fixture diferencia:
 * - origem de cada comprador de captação (a do Motor I: UTM do lead, senão a da
 *   venda): c1 Pago Quente (lead), c2 Instagram orgânico (lead), c3 Pago N/D
 *   (`utm_source = google`), c4 Sem track real, c6 Pago Frio ADV+ (cold-adv no
 *   `utm_term`), c7 Pago Frio, c8 Pago Frio ADV+ (cold-adv no NOME da
 *   campanha, sem term), c9 WhatsApp (depois do corte da parcial); c5 só tem
 *   order bump (avulso, não é comprador de captação);
 * - base do lançamento de comparação: c1, c3 (outra grafia) e c6 nos leads, c2
 *   nos compradores e c4 (Sem track) casado SÓ pelo telefone (outro e-mail);
 * - pesquisa: faixa + sexo + idade no atual; sexo + renda na comparação, que
 *   declara "sem faixa A→D" (a planilha não calcula); "Não binário" só no
 *   atual e "Outro" só na comparação; "feminino " com outra grafia no atual e
 *   "masculino" (minúsculas) na comparação; uma resposta depois do corte da
 *   parcial (c8, 24/04).
 */

import type { Utm } from "@loyola-x/shared";
import type { DebriefingConfigLancamento } from "../../services/debriefing-config.js";
import { computeDebriefingMoneyTime, type DebriefingMoneyTimeInput } from "../../services/debriefing-money-time-engine.js";
import {
  computeDebriefingAudience,
  type BaseAnteriorInput,
  type PesquisaInput,
  type RespostaInput,
} from "../../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../../services/debriefing-audience-loader.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../../services/debriefing-payload.js";
import { CAP, PESQ, entradaAudienceSintetica } from "./debriefing-payload-sintetico.js";
import {
  AGORA_FINAL_MIDIA,
  AGORA_PARCIAL_MIDIA,
  IDS,
  anunciosSinteticos,
  configDaMidia,
  conteudoDasVendas,
  entradaMtMidia,
} from "./debriefing-midia-anuncios-49-18.js";

/** O lançamento de comparação DA comparação (a base dela). */
export const FUNIL_DA_BASE_DA_COMPARACAO = "20000000-0000-4000-8000-000000000003";

export const UTM_ADV_TERM: Utm = { source: "fb", medium: "paid", campaign: "camp-adv", term: "Instagram_Feed_lanc--vendas-captacao--cold-adv--cbo|conj-01|ad01" };
export const UTM_FRIO: Utm = { source: "fb", medium: "paid", campaign: "camp-cold", term: "Instagram_Feed_lanc--vendas-captacao--cold--cbo|conj-02|v02" };
export const UTM_ADV_CAMPANHA: Utm = { source: "fb", medium: "paid", campaign: "120200000000000777", campaignName: "lanc--vendas-captacao--cold-adv--cbo--estaticos" };
export const UTM_WHATSAPP: Utm = { source: "whatsapp", medium: "grupo" };
export const UTM_GOOGLE: Utm = { source: "google", medium: "cpc" };

/** UTM da venda de captação por e-mail (c1, c2 e c4 decidem pela UTM do lead, que a 49.5 já tem). */
const UTM_DA_VENDA: Readonly<Record<string, Utm>> = {
  "c3@x.com": UTM_GOOGLE,
  "c6@x.com": UTM_ADV_TERM,
  "c7@x.com": UTM_FRIO,
  "c8@x.com": UTM_ADV_CAMPANHA,
  "c9@x.com": UTM_WHATSAPP,
};

/** Motor I: a entrada da 49.18 com a UTM de venda de cada origem. */
export function entradaMtPublico(config: DebriefingConfigLancamento, lado: "atual" | "comparacao"): DebriefingMoneyTimeInput {
  const mt = entradaMtMidia(config, lado);
  return {
    ...mt,
    vendas: mt.vendas.map((v) => (v.planilhaId === "p-cap" && UTM_DA_VENDA[v.emailCru ?? ""] ? { ...v, utm: UTM_DA_VENDA[v.emailCru ?? ""]! } : v)),
  };
}

const id = (emailCru: string | null, telefoneCru: string | null = null) => ({ emailCru, telefoneCru });

/** A base do lançamento de comparação de cada lado (só quando a config tem comparação). */
export function baseDoLado(lado: "atual" | "comparacao", funnelId: string): BaseAnteriorInput {
  return lado === "atual"
    ? {
        funnelId,
        tipo: "leads+compradores",
        // c4 casa SÓ pelo telefone (o e-mail da base é outro).
        leads: [id("c1@x.com"), id("C3@X.com "), id("c6@x.com"), id("outro.c4@x.com", "11 98888-7777"), id("ninguem@x.com")],
        compradores: [id("c2@x.com"), id("sem-compra@x.com")],
        chavesDePerguntaComResposta: ["Sexo", "Renda"],
      }
    : {
        funnelId,
        tipo: "leads+compradores",
        leads: [id("c1@x.com"), id("c8@x.com")],
        compradores: [],
        chavesDePerguntaComResposta: null,
      };
}

let linha = 0;
function resp(email: string, dia: string, respostas: Record<string, string | null>): RespostaInput {
  linha += 1;
  return {
    pesquisaId: PESQ,
    linha,
    linhaTemRespondente: true,
    emailCru: email,
    telefoneCru: null,
    dataRespostaCru: dia,
    utm: {},
    utmContentCru: null,
    respostas,
  };
}

/** A pesquisa e as perguntas confirmadas de cada lado. */
export function pesquisaDoLado(lado: "atual" | "comparacao"): {
  perguntasConfirmadas: DebriefingConfigLancamento["perguntasConfirmadas"];
  pesquisa: PesquisaInput;
  respondentes: RespostaInput[];
} {
  linha = 0;
  if (lado === "atual") {
    return {
      perguntasConfirmadas: { [CAP]: { faixa: "faixa", sexo: "Sexo", idade: "Idade" } },
      pesquisa: {
        pesquisaId: PESQ,
        stageId: CAP,
        rotulo: "pesquisa / respostas",
        temColunaEmail: true,
        chavesDePergunta: ["faixa", "Sexo", "Idade"],
        cabecalhoDaChave: { faixa: "Faixa", Sexo: "Sexo", Idade: "Idade" },
      },
      respondentes: [
        resp("c1@x.com", "18/04/2026", { faixa: "A", Sexo: "Feminino", Idade: "25-34" }),
        resp("c2@x.com", "19/04/2026", { faixa: "B", Sexo: "Masculino", Idade: "35-44" }),
        resp("c3@x.com", "19/04/2026", { faixa: "D", Sexo: "feminino ", Idade: "25-34" }),
        resp("c4@x.com", "20/04/2026", { faixa: "C", Sexo: "Masculino", Idade: "" }),
        // Depois do corte da parcial (21/04): só o final a vê.
        resp("c8@x.com", "24/04/2026", { faixa: "A", Sexo: "Feminino", Idade: "45+" }),
        resp("x1@x.com", "20/04/2026", { faixa: "B", Sexo: "Não binário", Idade: "25-34" }),
      ],
    };
  }
  return {
    // A comparação declara que a pesquisa não tem faixa A→D (a planilha não calcula).
    perguntasConfirmadas: { [CAP]: { faixa: null, sexo: "Sexo", renda: "Renda" } },
    pesquisa: {
      pesquisaId: PESQ,
      stageId: CAP,
      rotulo: "pesquisa / respostas",
      temColunaEmail: true,
      chavesDePergunta: ["Sexo", "Renda"],
      cabecalhoDaChave: { Sexo: "Sexo", Renda: "Renda" },
    },
    respondentes: [
      resp("c1@x.com", "18/04/2026", { Sexo: "Feminino", Renda: "Até 5 mil" }),
      resp("c2@x.com", "19/04/2026", { Sexo: "Feminino", Renda: "5 a 10 mil" }),
      // "masculino" em minúsculas: a grafia da comparação difere da do atual ("Masculino").
      resp("c6@x.com", "19/04/2026", { Sexo: "masculino", Renda: "Até 5 mil" }),
      resp("y1@x.com", "20/04/2026", { Sexo: "masculino", Renda: "Acima de 10 mil" }),
      resp("y2@x.com", "20/04/2026", { Sexo: "Outro", Renda: null }),
    ],
  };
}

/** A config de cada lado (perguntas confirmadas da pesquisa dele). */
export function configDoLado(base: DebriefingConfigLancamento, lado: "atual" | "comparacao"): DebriefingConfigLancamento {
  return { ...base, perguntasConfirmadas: pesquisaDoLado(lado).perguntasConfirmadas } as DebriefingConfigLancamento;
}

/** Payload pelos motores reais; a base de comparação entra só quando a config tem comparação. */
export function payloadPublico(config: DebriefingConfigLancamento, opts: { lado?: "atual" | "comparacao"; geradoEm?: Date | string } = {}): DebriefingPayload {
  const lado = opts.lado ?? "atual";
  const mtIn = entradaMtPublico(config, lado);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au0 = entradaAudienceSintetica(mtIn);
  const j = mt.janela;
  const pq = pesquisaDoLado(lado);
  const comparacao = config.lancamentoComparacaoFunnelId;
  const au = computeDebriefingAudience({
    ...au0,
    config: { ...au0.config, perguntasConfirmadas: pq.perguntasConfirmadas },
    janela: j,
    pesquisas: [pq.pesquisa],
    respondentes: pq.respondentes,
    compradores: higienizarVendasDoDebriefing(mtIn, conteudoDasVendas(mtIn)),
    criativos: {
      anuncios: anunciosSinteticos(lado === "comparacao" ? 2 : 1).filter((a) => a.dia >= j.inicio && a.dia <= j.fim),
      nomesDeAnuncio: {},
      contaDeAnuncios: "3717530711643512",
      postsDosAnuncios: {},
    } as Parameters<typeof computeDebriefingAudience>[0]["criativos"],
    baseAnterior: comparacao ? baseDoLado(lado, comparacao) : null,
  });
  return montarPayloadDebriefing(mt, au, config, opts.geradoEm ?? "2026-10-02T12:00:00.000Z");
}

// ---------------------------------------------------------------------------
// Cenários pelo orquestrador (`gerarDebriefing`), com o relógio fixado
// ---------------------------------------------------------------------------

export interface CenarioDoPublico {
  modo: "final" | "parcial";
  comparacao: null | "recalculada" | "salva-antiga";
}

export const PARAMS_DO_PUBLICO = { projectId: IDS.P, funnelId: IDS.F, stageId: IDS.S, userId: IDS.U, userRole: "user", investimentoOficial: null } as const;

/**
 * Dependências do `gerarDebriefing`. `configBase` é a config sintética da 49.5
 * (passada por quem chama). A comparação "salva-antiga" é um relatório salvo
 * ANTES da 49.20: sem os campos que a story acrescenta (no commit-base eles
 * nem existem — os `delete` não mudam nada lá).
 */
export function depsDoPublico(c: CenarioDoPublico, configBase: DebriefingConfigLancamento) {
  const gravados: { html: string; payload: DebriefingPayload }[] = [];
  const atual = configDoLado(configDaMidia(configBase, c), "atual");
  const comp = {
    ...configDoLado(configBase, "comparacao"),
    stageId: IDS.SB,
    funnelId: IDS.FB,
    projectId: IDS.P,
    lancamentoComparacaoFunnelId: FUNIL_DA_BASE_DA_COMPARACAO,
    lancamentosComparacao: [FUNIL_DA_BASE_DA_COMPARACAO],
  } as DebriefingConfigLancamento;
  const config = c.comparacao ? ({ ...atual, lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as DebriefingConfigLancamento) : atual;
  const salvo = (() => {
    if (c.comparacao !== "salva-antiga") return null;
    const p = payloadPublico(comp, { lado: "comparacao", geradoEm: "2026-07-01T12:00:00.000Z" });
    delete (p.publico as { recompraPorOrigem?: unknown }).recompraPorOrigem;
    delete (p.publico.crossLaunch as { compradoresNaBaseAnterior?: unknown }).compradoresNaBaseAnterior;
    for (const x of p.dinheiroTempo.compradores) delete (x as { frioAdv?: unknown }).frioAdv;
    if (p.resumoMacro) delete (p.resumoMacro as { pesquisaPorPergunta?: unknown }).pesquisaPorPergunta;
    return { debriefingId: "50000000-0000-4000-8000-000000000009", salvoEm: "2026-07-01T12:00:00.000Z", payload: p };
  })();
  return {
    gravados,
    resolverEtapa: async () => ({ stageId: IDS.S, stageName: "Debriefing", stageType: "debriefing", funnelId: IDS.F, funnelName: "PG05", projectId: IDS.P, projectName: "Expert" }),
    carregarConfig: async (sid: string) => (sid === IDS.SB ? comp : config),
    etapasDeDebriefingDoFunil: async () => (c.comparacao === "recalculada" ? [IDS.SB] : []),
    ultimoPayloadSalvoDoFunil: async () => salvo,
    calcularPayload: async (cfg: DebriefingConfigLancamento, g: Date) => payloadPublico(cfg, { lado: cfg.funnelId === IDS.FB ? "comparacao" : "atual", geradoEm: g }),
    nomes: async () => ({ funis: { [IDS.F]: "PG05", [IDS.FB]: "PG04" }, etapas: { "stage-cap": "Captação", "stage-prin": "Principal" } }),
    gravar: async (r: { html: string; payload: DebriefingPayload }) => {
      gravados.push(r);
      return { id: "60000000-0000-4000-8000-000000000001" };
    },
    estadoDoSyncDaMidia: async () => [],
    agora: () => (c.modo === "parcial" ? AGORA_PARCIAL_MIDIA : AGORA_FINAL_MIDIA),
  };
}

/** Os cenários do AC3 (HTML inteiro e payload medidos no commit-base e depois da story). */
export const CENARIOS_DO_PUBLICO: Record<string, CenarioDoPublico> = {
  "final-edicao-unica": { modo: "final", comparacao: null },
  "final-comparacao-recalculada": { modo: "final", comparacao: "recalculada" },
  "final-comparacao-salva-antiga": { modo: "final", comparacao: "salva-antiga" },
  "parcial-edicao-unica": { modo: "parcial", comparacao: null },
  "parcial-comparacao-recalculada": { modo: "parcial", comparacao: "recalculada" },
  "parcial-comparacao-salva": { modo: "parcial", comparacao: "salva-antiga" },
};
