/**
 * Story 49.19 — entrada sintética do teste de LP, sobre a da 49.5
 * (`debriefing-payload-sintetico.ts`) e a da 49.18 (`debriefing-midia-anuncios-49-18.ts`),
 * que não são alteradas.
 *
 * Usa SÓ o que já existia no commit-base da story (`a1d8d121`): o mesmo arquivo
 * roda lá, num script, para medir o SHA do HTML inteiro de antes (AC7). O campo
 * novo da entrada (`adsetName`) é ignorado pelo código de antes.
 *
 * Campanhas de captação (o que a fixture diferencia, AC8):
 * - LPA × LPG em vídeo: mesmos anúncios, mesmos conjuntos (a LPG com o nome do
 *   conjunto em minúsculas — o nome normalizado é o mesmo) → par válido. A LPG
 *   estreia em 19/04: a janela comum começa aí (as compras da LPA de 17 e 18/04
 *   ficam fora). No final (19–24/04, 6 dias) a LPG vence; na parcial (19–21/04,
 *   3 dias) dá empate. A LPA, pior, leva a maior parcela da verba (AC6);
 * - LPF × LPH em estático: par válido com 3 dias em comum no final (20, 21 e
 *   23/04, com intervalo) e 2 dias na parcial → "sem leitura";
 * - LPA em estático com um conjunto a mais → sem par (conjuntos diferentes);
 * - LPB em vídeo com outros anúncios → sem par (anúncios diferentes);
 * - LPD em estático com os anúncios e conjuntos do par de vídeo → sem par (formato diferente);
 * - uma campanha sem código de LP (fora do teste, contada).
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
import { AGORA_FINAL_MIDIA, AGORA_PARCIAL_MIDIA, IDS, configDaMidia } from "./debriefing-midia-anuncios-49-18.js";

export { IDS, PARAMS_DA_MIDIA as PARAMS_DO_TESTE_DE_LP } from "./debriefing-midia-anuncios-49-18.js";

export const CAMP_LP = {
  aVid: "lanc--vendas-captacao--hot--cbo--videos--lpa",
  gVid: "lanc--vendas-captacao--hot--cbo--videos--lpg",
  aEst: "lanc--vendas-captacao--hot--cbo--estaticos--lpa",
  fEst: "lanc--vendas-captacao--hot--cbo--estaticos--lpf",
  hEst: "lanc--vendas-captacao--hot--cbo--estaticos--lph",
  bVid: "lanc--vendas-captacao--cold--cbo--videos--lpb",
  dEst: "lanc--vendas-captacao--hot--cbo--estaticos--lpd",
  semLp: "lanc--vendas-captacao--hot--cbo--videos",
} as const;

const CONJ = { quente: "01_QUENTE-30D", listas: "02_LISTAS", interesses: "03_INTERESSES" } as const;
export const ANUNCIOS_DO_VIDEO = ["adv01--claude", "adv02--claude"] as const;
export const ANUNCIOS_DO_ESTATICO = ["ad01--estatico", "ad02--estatico"] as const;

type Anuncio = AnuncioDiaInput & { landingPageViews?: number | null; adsetName?: string | null };

interface Campanha {
  id: string;
  nome: string;
  conjuntos: readonly string[];
  anuncios: readonly string[];
  dias: readonly string[];
  spendPorAnuncio: number;
  lpvPorAnuncio: number;
}

const DIAS = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => `2026-04-${String(de + i).padStart(2, "0")}`);

export const CAMPANHAS_DO_TESTE_DE_LP: readonly Campanha[] = [
  { id: "c-lpa-vid", nome: CAMP_LP.aVid, conjuntos: [CONJ.quente, CONJ.listas], anuncios: ANUNCIOS_DO_VIDEO, dias: DIAS(17, 24), spendPorAnuncio: 30, lpvPorAnuncio: 12 },
  // O mesmo conjunto com outra caixa: o nome normalizado é o mesmo (AC2).
  { id: "c-lpg-vid", nome: CAMP_LP.gVid, conjuntos: ["01_quente-30d", CONJ.listas], anuncios: ANUNCIOS_DO_VIDEO, dias: DIAS(19, 24), spendPorAnuncio: 20, lpvPorAnuncio: 12 },
  { id: "c-lpa-est", nome: CAMP_LP.aEst, conjuntos: [CONJ.quente, CONJ.listas, CONJ.interesses], anuncios: ANUNCIOS_DO_ESTATICO, dias: DIAS(17, 24), spendPorAnuncio: 10, lpvPorAnuncio: 5 },
  { id: "c-lpf-est", nome: CAMP_LP.fEst, conjuntos: [CONJ.quente, CONJ.listas], anuncios: ANUNCIOS_DO_ESTATICO, dias: DIAS(18, 24), spendPorAnuncio: 10, lpvPorAnuncio: 5 },
  { id: "c-lph-est", nome: CAMP_LP.hEst, conjuntos: [CONJ.quente, CONJ.listas], anuncios: ANUNCIOS_DO_ESTATICO, dias: ["2026-04-20", "2026-04-21", "2026-04-23"], spendPorAnuncio: 10, lpvPorAnuncio: 5 },
  { id: "c-lpb-vid", nome: CAMP_LP.bVid, conjuntos: [CONJ.quente, CONJ.listas], anuncios: ["adv09--outro"], dias: DIAS(18, 20), spendPorAnuncio: 15, lpvPorAnuncio: 6 },
  { id: "c-lpd-est", nome: CAMP_LP.dEst, conjuntos: [CONJ.quente, CONJ.listas], anuncios: ANUNCIOS_DO_VIDEO, dias: DIAS(19, 21), spendPorAnuncio: 5, lpvPorAnuncio: 2 },
  { id: "c-sem-lp", nome: CAMP_LP.semLp, conjuntos: [CONJ.quente], anuncios: ["adv05--sem-lp"], dias: DIAS(18, 19), spendPorAnuncio: 20, lpvPorAnuncio: 4 },
];

/** Ad ID de (campanha, conjunto, anúncio): único por campanha, como na Meta. */
export function adIdDe(campanhaId: string, conjunto: number, anuncio: number): string {
  const c = CAMPANHAS_DO_TESTE_DE_LP.findIndex((x) => x.id === campanhaId);
  if (c < 0) throw new Error(`campanha ${campanhaId}`);
  return `1203000000${String(c).padStart(2, "0")}${String(conjunto).padStart(3, "0")}${String(anuncio).padStart(3, "0")}`;
}

/** Ad-level de captação (antes do corte da janela, que é do loader). `fator` multiplica o spend (comparação). */
export function anunciosDoTesteDeLp(fator = 1): Anuncio[] {
  const out: Anuncio[] = [];
  for (const c of CAMPANHAS_DO_TESTE_DE_LP) {
    c.conjuntos.forEach((conj, ci) =>
      c.anuncios.forEach((nome, ai) => {
        for (const dia of c.dias) {
          out.push({
            adId: adIdDe(c.id, ci, ai),
            adName: nome,
            campaignId: c.id,
            campaignName: c.nome,
            adsetName: conj,
            dia,
            spendBruto: c.spendPorAnuncio * fator,
            impressoes: c.spendPorAnuncio * 100,
            linkClicks: c.lpvPorAnuncio * 2,
            landingPageViews: c.lpvPorAnuncio,
          });
        }
      }),
    );
  }
  return out;
}

/**
 * Compradores de captação: [campanha, conjunto, anúncio, dia (DD/MM), quantos].
 * LPA vídeo: 2 antes da janela comum (17 e 18/04) + 1 em 20/04 + 1 em 23/04.
 * LPG vídeo: 6 em 19–21/04 + 8 em 22–24/04 (vence no final, empata na parcial).
 * LPF/LPH estático: 1 cada em 20/04. LPA estático: 1. Sem LP: 1.
 */
const COMPRAS: readonly [string, number, number, string, number][] = [
  ["c-lpa-vid", 0, 0, "17/04/2026", 1],
  ["c-lpa-vid", 1, 1, "18/04/2026", 1],
  ["c-lpa-vid", 0, 1, "20/04/2026", 1],
  ["c-lpa-vid", 1, 0, "23/04/2026", 1],
  ["c-lpg-vid", 0, 0, "19/04/2026", 2],
  ["c-lpg-vid", 1, 1, "20/04/2026", 2],
  ["c-lpg-vid", 0, 1, "21/04/2026", 2],
  ["c-lpg-vid", 1, 0, "22/04/2026", 3],
  ["c-lpg-vid", 0, 0, "24/04/2026", 5],
  ["c-lpf-est", 0, 0, "20/04/2026", 1],
  ["c-lph-est", 1, 1, "20/04/2026", 1],
  ["c-lpa-est", 2, 0, "19/04/2026", 1],
  ["c-sem-lp", 0, 0, "18/04/2026", 1],
];

/** As vendas de captação dos compradores do teste de LP (ingresso; o 1º da LPG leva combo). */
export function vendasDoTesteDeLp(lado: "atual" | "comparacao" = "atual"): { vendas: VendaCruaInput[]; conteudo: Map<number, string> } {
  const vendas: VendaCruaInput[] = [];
  const conteudo = new Map<number, string>();
  let linha = 500;
  for (const [camp, conj, an, dia, n] of COMPRAS) {
    for (let i = 0; i < n; i++) {
      linha += 1;
      // A comparação perde metade dos compradores (números diferentes do atual).
      if (lado === "comparacao" && linha % 2 === 0) continue;
      const combo = camp === "c-lpg-vid" && i === 0 && dia === "19/04/2026";
      vendas.push({
        planilhaId: "p-cap",
        linha,
        idDaVendaCru: `LP${linha}`,
        produto: combo ? "Combo" : "Imersão",
        tipo: combo ? "combo" : "ingresso",
        tipoClassificado: true,
        valorBrutoCru: combo ? "297,00" : "99,00",
        moeda: null,
        statusCru: "paid",
        emailCru: `lp${linha}@x.com`,
        telefoneCru: null,
        dataVendaCru: dia,
        utm: {},
        sellerName: null,
      });
      conteudo.set(linha, adIdDe(camp, conj, an));
    }
  }
  return { vendas, conteudo };
}

export function entradaMtDoTesteDeLp(config: DebriefingConfigLancamento, lado: "atual" | "comparacao" = "atual"): DebriefingMoneyTimeInput {
  const base = entradaMoneyTimeSintetica();
  return { ...base, config: configDoMotor(config), vendas: [...base.vendas, ...vendasDoTesteDeLp(lado).vendas] };
}

/** `p-cap#linha` → utm_content, como `conteudoDaPlanilhaDeVenda`. */
export function conteudoDoTesteDeLp(mt: DebriefingMoneyTimeInput, lado: "atual" | "comparacao" = "atual"): Map<string, string | null> {
  const { conteudo } = vendasDoTesteDeLp(lado);
  const m = new Map<string, string | null>();
  for (const v of mt.vendas) if (v.planilhaId === "p-cap") m.set(`p-cap#${v.linha}`, conteudo.get(v.linha) ?? null);
  return m;
}

/** Payload pelos motores reais, com o ad-level cortado na janela (o que o loader faz por SQL). */
export function payloadDoTesteDeLp(
  config: DebriefingConfigLancamento,
  opts: { lado?: "atual" | "comparacao"; geradoEm?: Date | string; semAdLevel?: boolean; semConjunto?: boolean; semConteudo?: boolean } = {},
): DebriefingPayload {
  const lado = opts.lado ?? "atual";
  const mtIn = entradaMtDoTesteDeLp(config, lado);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au0 = entradaAudienceSintetica(mtIn);
  const j = mt.janela;
  const anuncios = opts.semAdLevel
    ? []
    : anunciosDoTesteDeLp(lado === "comparacao" ? 2 : 1)
        .filter((a) => a.dia >= j.inicio && a.dia <= j.fim)
        .map((a) => (opts.semConjunto ? { ...a, adsetName: null } : a));
  const au = computeDebriefingAudience({
    ...au0,
    janela: j,
    compradores: higienizarVendasDoDebriefing(mtIn, opts.semConteudo ? new Map() : conteudoDoTesteDeLp(mtIn, lado)),
    criativos: { anuncios, nomesDeAnuncio: {}, contaDeAnuncios: "3717530711643512", postsDosAnuncios: {} } as Parameters<typeof computeDebriefingAudience>[0]["criativos"],
  });
  return montarPayloadDebriefing(mt, au, config, opts.geradoEm ?? "2026-10-02T12:00:00.000Z");
}

// ---------------------------------------------------------------------------
// Cenários pelo orquestrador (`gerarDebriefing`), com o relógio fixado
// ---------------------------------------------------------------------------

export interface CenarioDoTesteDeLp {
  modo: "final" | "parcial";
  comparacao: null | "recalculada" | "salva-antiga";
  semAdLevel?: boolean;
}

/**
 * Dependências do `gerarDebriefing` para um cenário. A comparação "salva-antiga"
 * é um relatório salvo SEM a mídia por anúncio e sem o teste de LP.
 */
export function depsDoTesteDeLp(c: CenarioDoTesteDeLp, configBase: DebriefingConfigLancamento) {
  const gravados: { html: string; payload: DebriefingPayload }[] = [];
  const atual = configDaMidia(configBase, c);
  const comp = { ...configBase, stageId: IDS.SB, funnelId: IDS.FB, projectId: IDS.P } as DebriefingConfigLancamento;
  const config = c.comparacao ? { ...atual, lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } : atual;
  const salvo = (() => {
    if (c.comparacao !== "salva-antiga") return null;
    const p = payloadDoTesteDeLp(comp, { lado: "comparacao", geradoEm: "2026-07-01T12:00:00.000Z" });
    delete (p.publico as { midiaPorAnuncio?: unknown }).midiaPorAnuncio;
    delete (p.publico as { testeDeLp?: unknown }).testeDeLp;
    return { debriefingId: "50000000-0000-4000-8000-000000000009", salvoEm: "2026-07-01T12:00:00.000Z", payload: p };
  })();
  return {
    gravados,
    resolverEtapa: async () => ({ stageId: IDS.S, stageName: "Debriefing", stageType: "debriefing", funnelId: IDS.F, funnelName: "PG05", projectId: IDS.P, projectName: "Expert" }),
    carregarConfig: async (sid: string) => (sid === IDS.SB ? comp : config),
    etapasDeDebriefingDoFunil: async () => (c.comparacao === "recalculada" ? [IDS.SB] : []),
    ultimoPayloadSalvoDoFunil: async () => salvo,
    calcularPayload: async (cfg: DebriefingConfigLancamento, g: Date) =>
      payloadDoTesteDeLp(cfg, {
        lado: cfg.funnelId === IDS.FB ? "comparacao" : "atual",
        geradoEm: g,
        ...(c.semAdLevel ? { semAdLevel: true } : {}),
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

/** Os cenários do AC7 (HTML inteiro medido no commit-base e depois da story). */
export const CENARIOS_DO_AC7: Record<string, CenarioDoTesteDeLp> = {
  "final-edicao-unica": { modo: "final", comparacao: null },
  "final-comparacao-recalculada": { modo: "final", comparacao: "recalculada" },
  "final-comparacao-salva-antiga": { modo: "final", comparacao: "salva-antiga" },
  "parcial-edicao-unica": { modo: "parcial", comparacao: null },
  "parcial-comparacao-recalculada": { modo: "parcial", comparacao: "recalculada" },
  "parcial-comparacao-salva": { modo: "parcial", comparacao: "salva-antiga" },
  "final-sem-ad-level": { modo: "final", comparacao: null, semAdLevel: true },
};
