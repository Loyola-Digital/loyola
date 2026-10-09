/**
 * Story 49.20 — público no Debriefing: recompra por origem do comprador (AC1)
 * e pesquisa atual × comparação por pergunta (AC2, R11-2), no parcial e no
 * final (AC3), com as seções antigas intocadas.
 *
 * Motores REAIS sobre a entrada sintética da 49.5/49.18 com a fixture da 49.20,
 * o orquestrador `gerarDebriefing` de ponta a ponta com o relógio fixado e o
 * render a partir do payload. Os SHA do AC3 foram medidos no commit-base da
 * story (`f2cf6f1e`, depois do rebase; antes, `a1d8d121`) pelo script `ac3-4920.mts` (Dev Agent Record), sobre ESTA
 * fixture.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classificarOrigem } from "@loyola-x/shared";
import {
  ORIGENS_DA_RECOMPRA,
  ORIGENS_PAGAS_DA_RECOMPRA,
  computeRecompraPorOrigem,
  origemDaRecompra,
  type DebriefingAudience,
  type DimensaoDePublico,
  type OrigemDaRecompra,
  type RecompraPorOrigem,
} from "../services/debriefing-audience-engine.js";
import { computeDebriefingMoneyTime, ehFrioAdv, textoDaTemperatura } from "../services/debriefing-money-time-engine.js";
import { publicoDaCampanha } from "../services/debriefing-midia-anuncios.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { MAX_RESPOSTAS_POR_PERGUNTA, montarPesquisaPorPergunta, montarResumoMacro, type PesquisaPorPergunta } from "../services/debriefing-resumo-macro.js";
import {
  MARCA_DA_PESQUISA_POR_PERGUNTA,
  MARCA_DA_RECOMPRA_POR_ORIGEM,
  MARCA_DO_AVISO_CPA_CAC,
  MARCA_DO_TESTE_DE_LP,
  SECOES_DO_DEBRIEFING,
  blocoDaPesquisaPorPergunta,
  renderDebriefing,
  type ComparacaoDoDebriefing,
} from "../services/debriefing-render.js";
import { gerarDebriefing } from "../services/debriefing-generate.js";
import { configSintetica } from "./fixtures/debriefing-payload-sintetico.js";
import { IDS } from "./fixtures/debriefing-midia-anuncios-49-18.js";
import {
  CENARIOS_DO_PUBLICO,
  PARAMS_DO_PUBLICO,
  UTM_ADV_CAMPANHA,
  UTM_ADV_TERM,
  UTM_FRIO,
  configDoLado,
  depsDoPublico,
  entradaMtPublico,
  payloadPublico,
  type CenarioDoPublico,
} from "./fixtures/debriefing-publico-49-20.js";
import { blocosDa4920, semAcrescimosDa4920, semCamposDa4920, tirarDivs } from "./fixtures/debriefing-acrescimos-49-20.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ROT = { projeto: "Expert", lancamento: "PG05", etapas: {}, funis: { [IDS.FB]: "PG04" } };

/** AC3 — medidos no commit-base `f2cf6f1e` (a 49.18 rebaseada sobre a main; HTML inteiro e payload, relógio fixado), sobre esta fixture. */
const SHA_DA_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "725c71291a60104e8a0cd732140ced1deb2ae616703b7624b58026a82d6c798e", payload: "66039cb92774ff212856918f27dfea811c979026adb758335e3115c6b859ba8f" },
  "final-comparacao-recalculada": { html: "ece32c2ecb1ee1e939e0b942a9cad774e95cfbec2f110cc2a877a85d6859ea54", payload: "089aa747ea2bed8579a91af5a8379bc5e3eb58f00def0f31ef17574d51adc63e" },
  "final-comparacao-salva-antiga": { html: "72f1b5962ffa615ac8cada202cbb727ce121e94130ca3ae0a0b4c4b01960b03c", payload: "dd6b86ba6f6e09d0ef801269f934ca4a513c78190c904f5eebe7fa869cafac77" },
  "parcial-edicao-unica": { html: "41d5ded383dbc517e14f6623d3c1f3455af48e9a5c8a7d11ec0ad1cb76d4d40d", payload: "1b4fa3990c0a16e28ac9c879e11a2393245f718e12a5e3d1fdfc905c0d32fe46" },
  "parcial-comparacao-recalculada": { html: "cfbc1f067ddca99c6949437c211793d052dad208210e2b60201fc1e0e5e50e35", payload: "edb3f623604354fbc239303d29ff018ea3227445863e5191587df8a053f569d2" },
  "parcial-comparacao-salva": { html: "5b082cc18e3b7fc81283bc804c36c3106c54dbf1ff8648b322f346305a36c264", payload: "b8a7db5e6102ccfa9c551a639ae36be97ae1a96bbb768cc19992224c53cc047d" },
};

async function gerar(c: CenarioDoPublico) {
  const d = depsDoPublico(c, configSintetica());
  const r = await gerarDebriefing(d, PARAMS_DO_PUBLICO);
  expect(r.status).toBe(200);
  const body = r.body as { html: string; payload: DebriefingPayload };
  expect(d.gravados[0]!.html).toBe(body.html);
  return { html: body.html, payload: body.payload };
}

/** Os blocos da 49.20 de um tipo (texto bruto). */
function blocos(html: string, abertura: string): string[] {
  const out: string[] = [];
  let resto = html;
  for (;;) {
    const i = resto.indexOf(abertura);
    if (i < 0) return out;
    const sem = tirarDivs(resto.slice(i), abertura).html;
    const tamanho = resto.length - i - sem.length;
    out.push(resto.slice(i, i + tamanho));
    resto = resto.slice(i + tamanho);
  }
}
const recompra = (html: string) => {
  const b = blocos(html, `<div ${MARCA_DA_RECOMPRA_POR_ORIGEM}>`);
  expect(b).toHaveLength(1);
  return b[0]!;
};
const pesquisa = (html: string, onde: "resumo" | "qualificacao") => blocos(html, `<div ${MARCA_DA_PESQUISA_POR_PERGUNTA}="${onde}">`);

/** As linhas de uma tabela (`célula | célula`), a partir do título que vem antes dela. */
function linhasDaTabela(html: string, depoisDe = ""): string[] {
  const depois = depoisDe ? html.split(depoisDe)[1]! : html;
  const tab = depois.slice(0, depois.indexOf("</table>"));
  return [...tab.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]!.replace(/<[^>]+>/g, "").trim()).join(" | ").trimEnd(),
  );
}
function secoesPorTitulo(html: string): Map<string, string> {
  return new Map([...html.matchAll(/<section[^>]*data-secao="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((m) => [m[1]!.replace(/&amp;/g, "&"), m[0]]));
}
const linhaDa = (r: RecompraPorOrigem, o: OrigemDaRecompra) => r.linhas.find((l) => l.origem === o)!;
const resumo = (r: RecompraPorOrigem) => r.linhas.map((l) => [l.origem, l.compradores, l.naBase, l.pctDaOrigem.valor, l.pctDaRecompra.valor]);
const rec = (p: DebriefingPayload) => {
  expect(p.publico.recompraPorOrigem).toBeDefined();
  return p.publico.recompraPorOrigem!;
};

// ---------------------------------------------------------------------------
// AC1 — a regra do ADV+ (a mesma da 49.18) e a origem do comprador no Motor I
// ---------------------------------------------------------------------------

describe("AC1 — ADV+ separado do frio pela regra da 49.18", () => {
  it("ehFrioAdv: frio pelo Quente × Frio do Motor I E cold-adv no texto", () => {
    expect(ehFrioAdv("lanc--vendas-captacao--cold-adv--cbo")).toBe(true);
    expect(ehFrioAdv("Instagram_Feed_LANC--COLD-ADV--cbo|conj|ad")).toBe(true);
    expect(ehFrioAdv("lanc--vendas-captacao--cold--cbo")).toBe(false);
    // "adv" fora do frio não é ADV+ (o hot decide antes).
    expect(ehFrioAdv("lanc--hot--cold-adv")).toBe(false);
    expect(ehFrioAdv("lanc--adv--cbo")).toBe(false);
    expect(ehFrioAdv(null)).toBe(false);
  });

  it("a mídia por anúncio (49.18) segue a MESMA função: Frio ADV+ ⇔ ehFrioAdv", () => {
    for (const nome of ["lanc--cold-adv--x", "lanc--cold--x", "lanc--hot--x", "lanc--hot--cold-adv", "lanc--x", "", null]) {
      expect(publicoDaCampanha(nome) === "Frio ADV+", String(nome)).toBe(ehFrioAdv(nome));
    }
  });

  it("textoDaTemperatura: o texto que decidiu (term ou nome da campanha) da UTM efetiva (lead ou venda)", () => {
    const lead = { term: "t-lead", campaignName: "c-lead" };
    const venda = { term: "t-venda", campaignName: "c-venda" };
    expect(textoDaTemperatura({ fonteUtm: "lead", temperaturaDecididaPor: "utm_term" }, lead, venda)).toBe("t-lead");
    expect(textoDaTemperatura({ fonteUtm: "lead", temperaturaDecididaPor: "campaign_name" }, lead, venda)).toBe("c-lead");
    expect(textoDaTemperatura({ fonteUtm: "venda", temperaturaDecididaPor: "utm_term" }, lead, venda)).toBe("t-venda");
    expect(textoDaTemperatura({ fonteUtm: "venda", temperaturaDecididaPor: "campaign_name" }, lead, venda)).toBe("c-venda");
    expect(textoDaTemperatura({ fonteUtm: "venda", temperaturaDecididaPor: null }, lead, venda)).toBeNull();
    expect(textoDaTemperatura({ fonteUtm: "nenhuma", temperaturaDecididaPor: null }, lead, venda)).toBeNull();
    // O classificador decide pelo term quando ele diz a temperatura, e pelo nome da campanha quando não.
    const cfg = { closerMediums: [], closerNomes: [], closerPorSellerName: false, ferramentasDeAtendimento: [] };
    expect(classificarOrigem({ lead: null, venda: UTM_ADV_TERM }, cfg)).toMatchObject({ canal: "Pago Frio", fonteUtm: "venda", temperaturaDecididaPor: "utm_term" });
    expect(classificarOrigem({ lead: null, venda: UTM_ADV_CAMPANHA }, cfg)).toMatchObject({ canal: "Pago Frio", fonteUtm: "venda", temperaturaDecididaPor: "campaign_name" });
  });

  it("Motor I: c6 (cold-adv no term) e c8 (cold-adv no nome da campanha) são frioAdv; c7 (cold) não; a Tabela 1 não muda", () => {
    const mt = computeDebriefingMoneyTime(entradaMtPublico(configSintetica(), "atual"));
    const frios = mt.compradores.filter((c) => c.canal === "Pago Frio");
    expect(frios).toHaveLength(3);
    expect(frios.filter((c) => c.frioAdv === true)).toHaveLength(2);
    expect(mt.compradores.filter((c) => c.frioAdv !== undefined && c.canal !== "Pago Frio")).toEqual([]);
    // Tabela 1: o ADV+ continua dentro do Pago Frio (P-23 aberta).
    expect(mt.tabela1.canais.find((c) => c.canal === "Pago Frio")!.ingressos).toBe(3);
    expect(mt.tabela1.canais.map((c) => c.canal)).not.toContain("Pago Frio ADV+");
  });

  it("Motor I: a UTM do LEAD decide quando existe — lead cold-adv com venda fria comum é ADV+; o inverso não", () => {
    const e = entradaMtPublico(configSintetica(), "atual");
    const comLead = (emailCru: string, utm: typeof UTM_FRIO) => [...e.leads, { emailCru, telefoneCru: null, dataCriacaoCru: "18/04/2026", utm }];
    // c7: venda fria comum, lead cold-adv → ADV+ (3 no total).
    expect(computeDebriefingMoneyTime({ ...e, leads: comLead("c7@x.com", UTM_ADV_TERM) }).compradores.filter((c) => c.frioAdv === true)).toHaveLength(3);
    // c6: venda cold-adv, lead frio comum → deixa de ser ADV+ (1 no total).
    expect(computeDebriefingMoneyTime({ ...e, leads: comLead("c6@x.com", UTM_FRIO) }).compradores.filter((c) => c.frioAdv === true)).toHaveLength(1);
  });

  it("Motor I: o ADV+ é lido no texto que DECIDIU a temperatura — term frio comum com nome de campanha cold-adv não é ADV+", () => {
    const e = entradaMtPublico(configSintetica(), "atual");
    const so = { ...UTM_FRIO, campaignName: "lanc--cold-adv--x" };
    const mt = computeDebriefingMoneyTime({ ...e, vendas: e.vendas.map((v) => (v.emailCru === "c7@x.com" ? { ...v, utm: so } : v)) });
    expect(mt.compradores.filter((c) => c.frioAdv === true)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// AC1 — recompra por origem (motor puro e composição)
// ---------------------------------------------------------------------------

describe("AC1 — recompra aberta pela origem do comprador", () => {
  const cl = (chaves: string[] | undefined, aplicavel = true): Pick<DebriefingAudience["crossLaunch"], "aplicavel" | "motivo" | "compradoresNaBaseAnterior"> => ({
    aplicavel,
    ...(aplicavel ? {} : { motivo: "SEM_LANCAMENTO_DE_COMPARACAO" }),
    ...(chaves ? { compradoresNaBaseAnterior: chaves } : {}),
  });
  const compradorDa = (o: OrigemDaRecompra, chave: string) =>
    o === "Pago Frio ADV+" ? { chave, canal: "Pago Frio" as const, frioAdv: true as const } : { chave, canal: o };

  it.each(ORIGENS_DA_RECOMPRA.map((o) => [o]))("%s: o comprador cai na linha da origem; já na base conta só ele; pago só se a origem é paga", (o) => {
    const r = computeRecompraPorOrigem([compradorDa(o, "e:1"), compradorDa(o, "e:2"), { chave: "e:3", canal: "Outros orgânicos" }], cl(["e:1"]));
    expect(r.aplicavel).toBe(true);
    const l = linhaDa(r, o);
    expect([l.compradores, l.naBase, l.pctDaOrigem.valor, l.pctDaRecompra.valor]).toEqual([o === "Outros orgânicos" ? 3 : 2, 1, o === "Outros orgânicos" ? (1 / 3) * 100 : 50, 100]);
    for (const outra of r.linhas.filter((x) => x.origem !== o)) expect(outra.naBase, outra.origem).toBe(0);
    const paga = ORIGENS_PAGAS_DA_RECOMPRA.includes(o);
    expect(r.pago).toMatchObject({ compradores: paga ? 2 : 0, naBase: paga ? 1 : 0 });
    expect(r.pago!.daCasa.valor).toBe(paga ? 50 : null);
  });

  it("as listas: as 10 origens na ordem dos canais com o ADV+ logo depois do frio; as 4 pagas", () => {
    expect(ORIGENS_DA_RECOMPRA).toEqual([
      "Pago Quente",
      "Pago Frio",
      "Pago Frio ADV+",
      "Pago N/D",
      "Instagram orgânico",
      "WhatsApp",
      "ManyChat",
      "Outros orgânicos",
      "Aquisição não rastreada (só closer)",
      "Sem track real",
    ]);
    expect(ORIGENS_PAGAS_DA_RECOMPRA).toEqual(["Pago Quente", "Pago Frio", "Pago Frio ADV+", "Pago N/D"]);
    expect(origemDaRecompra({ canal: "Pago Frio", frioAdv: true })).toBe("Pago Frio ADV+");
    expect(origemDaRecompra({ canal: "Pago Frio" })).toBe("Pago Frio");
    // frioAdv fora do frio não cria ADV+ (só o frio tem a quebra).
    expect(origemDaRecompra({ canal: "Pago Quente", frioAdv: true })).toBe("Pago Quente");
  });

  it("fixture (final): cada origem com quantidade e %, inclusive ADV+ e Sem track; a soma fecha com o cross-launch", () => {
    const p = payloadPublico({ ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never);
    const r = rec(p);
    expect(resumo(r)).toEqual([
      ["Pago Quente", 1, 1, 100, 20],
      ["Pago Frio", 1, 0, 0, 0],
      ["Pago Frio ADV+", 2, 1, 50, 20],
      ["Pago N/D", 1, 1, 100, 20],
      ["Instagram orgânico", 1, 1, 100, 20],
      ["WhatsApp", 1, 0, 0, 0],
      ["ManyChat", 0, 0, null, 0],
      ["Outros orgânicos", 0, 0, null, 0],
      ["Aquisição não rastreada (só closer)", 0, 0, null, 0],
      ["Sem track real", 1, 1, 100, 20],
    ]);
    expect(r.total).toMatchObject({ compradores: 8, naBase: 5, pctDaRecompra: { valor: 100, numerador: 5, denominador: 5 } });
    const ja = p.publico.crossLaunch.jaEmBaseAnterior.captacao as { numerador: number; denominador: number };
    expect([ja.numerador, ja.denominador]).toEqual([r.total!.naBase, r.total!.compradores]);
    expect(r.linhas.reduce((s, l) => s + l.naBase, 0)).toBe(r.total!.naBase);
    expect(r.linhas.reduce((s, l) => s + l.compradores, 0)).toBe(p.dinheiroTempo.ingressosUnicos);
    expect(r.linhas.reduce((s, l) => s + (l.pctDaRecompra.valor ?? 0), 0)).toBeCloseTo(100, 10);
  });

  it("% do pago que é gente da casa = compradores pagos já na base ÷ compradores pagos (3 de 5)", () => {
    const r = rec(payloadPublico({ ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never));
    expect(r.pago).toMatchObject({ compradores: 5, naBase: 3 });
    expect(r.pago!.daCasa).toMatchObject({ valor: 60, numerador: 3, denominador: 5 });
  });

  it("a mesma regra de casamento do cross-launch: o Sem track (c4) está na base só pelo telefone", () => {
    const cfg = { ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never;
    expect(linhaDa(rec(payloadPublico(cfg)), "Sem track real")).toMatchObject({ compradores: 1, naBase: 1 });
  });

  it("não se aplica (nunca zero): sem comparação, payload anterior à 49.20 e chave que o Motor I não conhece", () => {
    const sem = computeRecompraPorOrigem([{ chave: "e:1", canal: "Pago Quente" }], cl(undefined, false));
    expect(sem).toMatchObject({ aplicavel: false, motivo: "SEM_LANCAMENTO_DE_COMPARACAO", linhas: [], total: null, pago: null });
    expect(computeRecompraPorOrigem([{ chave: "e:1", canal: "Pago Quente" }], cl(undefined))).toMatchObject({ aplicavel: false, motivo: "RECOMPRA_NAO_CALCULADA" });
    expect(computeRecompraPorOrigem([{ chave: "e:1", canal: "Pago Quente" }], cl(["e:1", "e:9"]))).toMatchObject({
      aplicavel: false,
      motivo: "CHAVES_DIFERENTES_ENTRE_OS_MOTORES",
      total: null,
    });
  });

  it("o motor não muta a entrada", () => {
    const compradores = [{ chave: "e:1", canal: "Pago Frio" as const, frioAdv: true as const }];
    const c = cl(["e:1"]);
    const antes = JSON.stringify([compradores, c]);
    computeRecompraPorOrigem(compradores, c);
    expect(JSON.stringify([compradores, c])).toBe(antes);
  });

  it("composição: montarPayloadDebriefing cruza a origem do Motor I com as chaves do cross-launch do Motor II", () => {
    const p = payloadPublico({ ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never);
    const chaves = p.publico.crossLaunch.compradoresNaBaseAnterior!;
    expect(chaves).toHaveLength(5);
    expect([...chaves].sort()).toEqual(chaves);
    // Toda chave é de um comprador de captação dos dois motores (sem PII: hash).
    for (const k of chaves) {
      expect(p.publico.compradoresCaptacao.porEmail).toContain(k);
      expect(k).toMatch(/^(e|a):[0-9a-f]{64}$/);
    }
    const de = new Map(p.dinheiroTempo.compradores.map((c) => [c.chave, origemDaRecompra(c)]));
    const naBase = ORIGENS_DA_RECOMPRA.map((o) => chaves.filter((k) => de.get(k) === o).length);
    expect(rec(p).linhas.map((l) => l.naBase)).toEqual(naBase);
    // A composição recalcula a partir dos motores (não lê nada de fora).
    const p2 = montarPayloadDebriefing(p.dinheiroTempo, { ...p.publico, recompraPorOrigem: undefined } as DebriefingAudience, p.config, p.geradoEm);
    expect(p2.publico.recompraPorOrigem).toEqual(p.publico.recompraPorOrigem);
  });

  it("listas Comunidade/Front continuam lacuna LISTAS_FRONT_COMUNIDADE (sem fonte), nunca uma origem nem aproximadas", async () => {
    const { html, payload } = await gerar({ modo: "final", comparacao: "recalculada" });
    expect(payload.lacunas.find((l) => l.codigo === "LISTAS_FRONT_COMUNIDADE")).toMatchObject({ motivo: "sem fonte no Loyola" });
    expect(rec(payload).linhas.map((l) => l.origem).join(" ")).not.toMatch(/Comunidade|Front/);
    const s11 = secoesPorTitulo(html).get("Cross-launch & Listas")!;
    expect(s11).toContain("Listas-mestre Front / Comunidade");
    expect(recompra(html)).toContain("LISTAS_FRONT_COMUNIDADE");
    // A lacuna das listas continua DEPOIS do bloco da recompra, na mesma seção.
    expect(s11.indexOf("Listas-mestre Front / Comunidade")).toBeGreaterThan(s11.indexOf(MARCA_DA_RECOMPRA_POR_ORIGEM));
  });
});

// ---------------------------------------------------------------------------
// AC1 — no documento (seção 11), com a comparação
// ---------------------------------------------------------------------------

describe("AC1 — a recompra no documento (seção 11)", () => {
  it("final × comparação recalculada: as colunas dos dois lados, o total e o pago da casa", async () => {
    const { html } = await gerar({ modo: "final", comparacao: "recalculada" });
    const b = recompra(html);
    expect(linhasDaTabela(b)).toEqual([
      "Origem do comprador | PG04: compradores | PG04: já na base | PG04: % da origem | PG04: % da recompra | PG05: compradores | PG05: já na base | PG05: % da origem | PG05: % da recompra",
      "Pago Quente | 1 | 1 | 100,0% | 50,0% | 1 | 1 | 100,0% | 20,0%",
      "Pago Frio | 0 | 0 | — | 0,0% | 1 | 0 | 0,0% | 0,0%",
      "Pago Frio ADV+ | 2 | 1 | 50,0% | 50,0% | 2 | 1 | 50,0% | 20,0%",
      "Pago N/D | 1 | 0 | 0,0% | 0,0% | 1 | 1 | 100,0% | 20,0%",
      "Instagram orgânico | 1 | 0 | 0,0% | 0,0% | 1 | 1 | 100,0% | 20,0%",
      "WhatsApp | 0 | 0 | — | 0,0% | 1 | 0 | 0,0% | 0,0%",
      "ManyChat | 0 | 0 | — | 0,0% | 0 | 0 | — | 0,0%",
      "Outros orgânicos | 0 | 0 | — | 0,0% | 0 | 0 | — | 0,0%",
      "Aquisição não rastreada (só closer) | 0 | 0 | — | 0,0% | 0 | 0 | — | 0,0%",
      "Sem track real | 1 | 0 | 0,0% | 0,0% | 1 | 1 | 100,0% | 20,0%",
      "Total | 6 | 2 | 33,3% | 100,0% | 8 | 5 | 62,5% | 100,0%",
    ]);
    expect(b.replace(/<[^>]+>/g, "")).toContain(
      "PG04: 50,0% (2 de 4 compradores pagos já estavam na base) · PG05: 60,0% (3 de 5 compradores pagos já estavam na base).",
    );
  });

  it("final × relatório salvo antes da 49.20: o lado da comparação é \"—\" com nota, nunca zero", async () => {
    const { html } = await gerar({ modo: "final", comparacao: "salva-antiga" });
    const b = recompra(html);
    const l = linhasDaTabela(b);
    expect(l[1]).toBe("Pago Quente | — | — | — | — | 1 | 1 | 100,0% | 20,0%");
    expect(l[11]).toBe("Total | — | — | — | — | 8 | 5 | 62,5% | 100,0%");
    expect(b).toContain("PG04: recompra não calculada — o payload é anterior à Story 49.20 — “—”, nunca zero.");
    expect(b.replace(/<[^>]+>/g, "")).toContain("PG04: — (não calculada — o payload é anterior à Story 49.20) · PG05: 60,0%");
  });

  it("parcial × comparação recalculada no mesmo D+N: o WhatsApp (c9, depois do corte) sai dos dois lados", async () => {
    const { html, payload } = await gerar({ modo: "parcial", comparacao: "recalculada" });
    expect(rec(payload).total).toMatchObject({ compradores: 7, naBase: 5 });
    expect(linhasDaTabela(recompra(html))[6]).toBe("WhatsApp | 0 | 0 | — | 0,0% | 0 | 0 | — | 0,0%");
  });

  it("edição única: o bloco diz que não se aplica (sem tabela)", async () => {
    for (const modo of ["final", "parcial"] as const) {
      const { html } = await gerar({ modo, comparacao: null });
      const b = recompra(html);
      expect(b).toContain("Recompra por origem de PG05:</b> SEM_LANCAMENTO_DE_COMPARACAO.");
      expect(b).not.toContain("<table");
    }
  });

  it("render a partir do payload (não recalcula): um número trocado no payload aparece no documento", () => {
    const p = payloadPublico({ ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never);
    const r = rec(p);
    linhaDa(r, "Pago Frio ADV+").naBase = 77;
    r.pago!.daCasa = { ...r.pago!.daCasa, valor: 12.5 };
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(linhasDaTabela(recompra(html))[3]).toBe("Pago Frio ADV+ | 2 | 77 | 50,0% | 20,0%");
    expect(recompra(html)).toContain("PG05: <b>12,5%</b>");
  });

  it("payload anterior à 49.20 (sem o campo): o bloco diz que não foi calculada", () => {
    const p = payloadPublico({ ...configSintetica(), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never);
    delete p.publico.recompraPorOrigem;
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(recompra(html)).toContain("não calculada — o payload é anterior à Story 49.20");
  });
});

// ---------------------------------------------------------------------------
// AC2 — pesquisa por pergunta, atual × comparação (motor puro)
// ---------------------------------------------------------------------------

describe("AC2 — pesquisa por pergunta (montarPesquisaPorPergunta)", () => {
  const cfgComComp = () => ({ ...configDoLado(configSintetica(), "atual"), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] }) as never;
  const lados = () => {
    const atual = payloadPublico(cfgComComp());
    const comp = payloadPublico(
      { ...configDoLado(configSintetica(), "comparacao"), funnelId: IDS.FB, lancamentoComparacaoFunnelId: null, lancamentosComparacao: [] } as never,
      { lado: "comparacao" },
    );
    return { atual, comp };
  };
  const montar = () => {
    const { atual, comp } = lados();
    return montarPesquisaPorPergunta({ payload: atual, nomeAtual: "PG05", comparacao: { funnelId: IDS.FB, nome: "PG04", payload: comp, origem: { tipo: "recalculada" } } });
  };
  const pergunta = (campo: string) => {
    const q = montar().perguntas.find((x) => x.campo === campo);
    expect(q, campo).toBeDefined();
    return q!;
  };

  it("as perguntas na ordem do motor (faixa primeiro), com a presença de cada uma", () => {
    expect(montar().perguntas.map((q) => [q.campo, q.presenca])).toEqual([
      ["faixa", "so-atual"],
      ["idade", "so-atual"],
      ["sexo", "nos-dois"],
      ["renda", "so-comparacao"],
    ]);
  });

  it("pergunta nos dois: lado a lado (% dos respondentes de cada um), alinhada pela grafia normalizada", () => {
    const q = pergunta("sexo");
    expect([q.nAtual, q.nComparacao]).toEqual([6, 5]);
    expect(q.linhas.map((l) => [l.rotulo, l.comparacao && [l.comparacao.n, l.comparacao.pct], l.atual && [l.atual.n, l.atual.pct]])).toEqual([
      // "feminino " (outra grafia) é o mesmo Feminino.
      ["Feminino", [2, 40], [3, 50]],
      ["Masculino", [2, 40], [2, (2 / 6) * 100]],
      ["Outro", [1, 20], null],
      ["Não binário", null, [1, (1 / 6) * 100]],
    ]);
    expect(q.semResposta).toEqual({ atual: { n: 0, pct: 0 }, comparacao: { n: 0, pct: 0 } });
    expect(q.nota).toBeUndefined();
  });

  it("os % são os do Motor II de cada lado (nenhum número novo)", () => {
    const { atual, comp } = lados();
    const q = pergunta("sexo");
    const dimA = atual.publico.dimensoes.find((d) => d.campo === "sexo")!;
    const dimC = comp.publico.dimensoes.find((d) => d.campo === "sexo")!;
    const mesma = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
    for (const l of q.linhas) {
      if (l.atual) expect(l.atual.pct).toBe(dimA.total.valores.find((v) => mesma(v.rotulo, l.rotulo))!.pct.valor);
      if (l.comparacao) expect(l.comparacao.pct).toBe(dimC.total.valores.find((v) => mesma(v.rotulo, l.rotulo))!.pct.valor);
    }
    // A grafia da comparação ("masculino") é outra; a linha alinhada leva a do atual.
    expect(dimC.total.valores.map((v) => v.rotulo)).toContain("masculino");
  });

  it("pergunta só no atual: só esse lado, com a nota do porquê", () => {
    const q = pergunta("idade");
    expect([q.nAtual, q.nComparacao]).toEqual([6, null]);
    expect(q.linhas.every((l) => l.comparacao === null)).toBe(true);
    expect(q.semResposta.comparacao).toBeNull();
    expect(q.nota).toBe("Só em PG05: em PG04, pergunta não confirmada na configuração.");
  });

  it("pergunta só na comparação: só esse lado, com a nota do porquê", () => {
    const q = pergunta("renda");
    expect([q.nAtual, q.nComparacao]).toEqual([null, 5]);
    expect(q.linhas.map((l) => [l.rotulo, l.atual, l.comparacao?.n])).toEqual([
      ["Até 5 mil", null, 2],
      ["5 a 10 mil", null, 1],
      ["Acima de 10 mil", null, 1],
    ]);
    expect(q.nota).toBe("Só em PG04: em PG05, pergunta não confirmada na configuração.");
  });

  it("faixa que a planilha não calcula: lacuna, nunca reconstruída (nenhuma linha de faixa da comparação)", () => {
    const pp = montar();
    const q = pergunta("faixa");
    expect(q.linhas.map((l) => l.rotulo)).toEqual(["A", "B", "C", "D"]);
    expect(q.linhas.every((l) => l.comparacao === null)).toBe(true);
    expect(q.nota).toMatch(/^Só em PG05: em PG04, faixa não calculada \(SEM_FAIXA_A_D/);
    expect(pp.lacunasDeFaixa).toEqual([expect.stringMatching(/^PG04: faixa \(lead score\) não calculada pela planilha — SEM_FAIXA_A_D.*; lacuna, não reconstruída\.$/)]);
  });

  it("cobertura de cada lado = compradores casados com respondente ÷ compradores (publico.taxaDeResposta)", () => {
    const { atual, comp } = lados();
    const pp = montar();
    expect(pp.cobertura.atual).toEqual({ valor: 62.5, numerador: 5, denominador: 8 });
    expect(pp.cobertura.comparacao).toEqual({ valor: 50, numerador: 3, denominador: 6 });
    expect(pp.cobertura.atual.valor).toBe(atual.publico.taxaDeResposta.valor);
    expect(pp.cobertura.comparacao!.valor).toBe(comp.publico.taxaDeResposta.valor);
  });

  it("sem comparação: edição única e parcial cuja comparação só tem relatório salvo — o motivo, sem perguntas", () => {
    const { atual } = lados();
    expect(montarPesquisaPorPergunta({ payload: atual, nomeAtual: "PG05", comparacao: null })).toMatchObject({
      perguntas: [],
      semComparacao: "edição única — sem lançamento de comparação na configuração",
      cobertura: { comparacao: null },
    });
    expect(
      montarPesquisaPorPergunta({ payload: atual, nomeAtual: "PG05", comparacao: null, comparacaoSemDelta: { funnelId: IDS.FB, nome: "PG04", salvoEm: "2026-07-01" } }).semComparacao,
    ).toMatch(/^a comparação PG04 só tem relatório salvo/);
  });

  it("teto de respostas: as de maior % entre os dois lados; as demais contadas fora da tabela", () => {
    const { atual, comp } = lados();
    const valores = (n: number, base: number) =>
      Array.from({ length: n }, (_, i) => ({ rotulo: `R${String(i).padStart(2, "0")}`, n: base + i, pct: { valor: base + i, memoria: "" } }));
    const dim = (vs: ReturnType<typeof valores>): DimensaoDePublico =>
      ({ campo: "profissao", total: { n: 100, valores: vs, semResposta: { n: 0, pct: { valor: 0, memoria: "" } } } }) as unknown as DimensaoDePublico;
    atual.publico.dimensoes = [dim(valores(14, 1))];
    // Na comparação, R00 (o menor do atual) é o maior de todos.
    comp.publico.dimensoes = [dim([{ rotulo: "R00", n: 90, pct: { valor: 90, memoria: "" } }])];
    const q = montarPesquisaPorPergunta({ payload: atual, nomeAtual: "PG05", comparacao: { funnelId: IDS.FB, nome: "PG04", payload: comp, origem: { tipo: "recalculada" } } }).perguntas[0]!;
    expect(q.linhas).toHaveLength(MAX_RESPOSTAS_POR_PERGUNTA);
    expect(q.respostasForaDaTabela).toBe(14 - MAX_RESPOSTAS_POR_PERGUNTA);
    expect(q.linhas.map((l) => l.rotulo)).toEqual(["R00", "R13", "R12", "R11", "R10", "R09", "R08", "R07", "R06", "R05", "R04", "R03"]);
  });

  it("o resumo macro leva a pesquisa por pergunta (o mesmo cálculo puro)", () => {
    const { atual, comp } = lados();
    const e = { payload: atual, nomeAtual: "PG05", comparacao: { funnelId: IDS.FB, nome: "PG04", payload: comp, origem: { tipo: "recalculada" as const } }, alertas: [] };
    expect(montarResumoMacro(e).pesquisaPorPergunta).toEqual(montarPesquisaPorPergunta(e));
  });
});

// ---------------------------------------------------------------------------
// AC2 — onde a comparação por pergunta aparece (R11-2) e onde NÃO aparece (R6-6)
// ---------------------------------------------------------------------------

describe("AC2 — no documento: resumo (parcial e final), seção 12 só na parcial", () => {
  it.each([
    ["final", "recalculada"],
    ["final", "salva-antiga"],
    ["parcial", "recalculada"],
  ] as const)("%s × comparação %s: a tabela lado a lado no resumo, com a cobertura de cada um", async (modo, comparacao) => {
    const { html } = await gerar({ modo, comparacao });
    const [b] = pesquisa(html, "resumo");
    expect(b).toBeDefined();
    const tSexo = linhasDaTabela(b!, 'data-pergunta="sexo"');
    expect(tSexo[0]).toMatch(/^Resposta \| PG04 \(n = 5\) \| PG05 \(n = \d\)$/);
    expect(tSexo.find((l) => l.startsWith("Outro |"))).toMatch(/^Outro \| 20,0% \(1\) \| —$/);
    expect(b).toContain("Cobertura = compradores de captação casados com um respondente ÷ compradores de captação. PG04: 50,0% (3 de 6 compradores)");
    // O bloco do resumo fica entre a curva e as maiores diferenças.
    const rm = html.slice(html.indexOf("data-resumo-macro"), html.indexOf('<div class="nav">'));
    expect(rm.indexOf(`${MARCA_DA_PESQUISA_POR_PERGUNTA}="resumo"`)).toBeGreaterThan(rm.indexOf("data-curva-acumulada"));
    expect(rm.indexOf(`${MARCA_DA_PESQUISA_POR_PERGUNTA}="resumo"`)).toBeLessThan(rm.indexOf("Maiores diferenças"));
  });

  it("parcial: a mesma comparação também na seção Qualificação (as seções do documento parcial)", async () => {
    const { html } = await gerar({ modo: "parcial", comparacao: "recalculada" });
    const s12 = secoesPorTitulo(html).get("Qualificação")!;
    const [q] = pesquisa(s12, "qualificacao");
    expect(q).toBeDefined();
    const [r] = pesquisa(html, "resumo");
    // O mesmo conteúdo do resumo (a mesma fonte: resumoMacro.pesquisaPorPergunta).
    expect(q!.replace(`="qualificacao"><h3 class="gr" style="margin-top:22px">`, '="resumo"><h3 class="gr">')).toBe(r);
    expect(linhasDaTabela(q!, 'data-pergunta="sexo"')).toEqual([
      "Resposta | PG04 (n = 5) | PG05 (n = 5)",
      "Feminino | 40,0% (2) | 40,0% (2)",
      "Masculino | 40,0% (2) | 40,0% (2)",
      "Não binário | — | 20,0% (1)",
      "Outro | 20,0% (1) | —",
      "Sem resposta | 0,0% (0) | 0,0% (0)",
    ]);
  });

  it.each(["recalculada", "salva-antiga", null] as const)("final (comparação %s): a seção 12 NÃO traz a comparação por pergunta (R6-6)", async (comparacao) => {
    const { html } = await gerar({ modo: "final", comparacao });
    expect(pesquisa(html, "qualificacao")).toEqual([]);
    const s12 = secoesPorTitulo(html).get("Qualificação")!;
    expect(s12).not.toContain(MARCA_DA_PESQUISA_POR_PERGUNTA);
    expect(s12).toBe(secoesPorTitulo(semAcrescimosDa4920(html)).get("Qualificação"));
  });

  it("pergunta só de um lado: só a coluna desse lado, com a nota; a faixa da comparação vira lacuna", async () => {
    const { html } = await gerar({ modo: "final", comparacao: "recalculada" });
    const [b] = pesquisa(html, "resumo");
    expect(linhasDaTabela(b!, 'data-pergunta="idade"')[0]).toBe("Resposta | PG05 (n = 6)");
    expect(linhasDaTabela(b!, 'data-pergunta="renda"')[0]).toBe("Resposta | PG04 (n = 5)");
    expect(b).toContain("Só em PG04: em PG05, pergunta não confirmada na configuração.");
    expect(b).toContain('<div class="warn" data-lacuna><b>Faixa (lead score)</b> — PG04: faixa (lead score) não calculada pela planilha');
    expect(linhasDaTabela(b!, 'data-pergunta="faixa"')[0]).toBe("Resposta | PG05 (n = 6)");
  });

  it("parcial cuja comparação só tem relatório salvo: sem comparação por pergunta, com o motivo (resumo e seção 12)", async () => {
    const { html } = await gerar({ modo: "parcial", comparacao: "salva-antiga" });
    for (const onde of ["resumo", "qualificacao"] as const) {
      const [b] = pesquisa(html, onde);
      expect(b).toContain("Sem comparação por pergunta:</b> a comparação PG04 só tem relatório salvo");
      expect(b).not.toContain("<table");
    }
  });

  it("edição única: resumo (final e parcial) e seção 12 (parcial) dizem que não há comparação", async () => {
    for (const modo of ["final", "parcial"] as const) {
      const { html } = await gerar({ modo, comparacao: null });
      expect(pesquisa(html, "resumo")[0]).toContain("Sem comparação por pergunta:</b> edição única");
      expect(pesquisa(html, "qualificacao")).toHaveLength(modo === "parcial" ? 1 : 0);
    }
  });

  it("QA TEST-001 (P5): com respostas além do teto, o documento diz quantas ficaram fora; sem elas, nada", () => {
    const linhas = Array.from({ length: MAX_RESPOSTAS_POR_PERGUNTA }, (_, i) => ({ rotulo: `r${i}`, atual: { n: 1, pct: 1 }, comparacao: { n: 1, pct: 1 } }));
    const pp = (fora: number): PesquisaPorPergunta => ({
      cobertura: { atual: { valor: 50, numerador: 1, denominador: 2 }, comparacao: { valor: 50, numerador: 1, denominador: 2 } },
      perguntas: [
        { campo: "profissao", rotulo: "profissão", presenca: "nos-dois", nAtual: 15, nComparacao: 15, linhas, semResposta: { atual: { n: 0, pct: 0 }, comparacao: { n: 0, pct: 0 } }, respostasForaDaTabela: fora },
      ],
      lacunasDeFaixa: [],
    });
    for (const onde of ["resumo", "qualificacao"] as const) {
      expect(blocoDaPesquisaPorPergunta(pp(3), "PG05", "PG04", onde)).toContain(
        `Mostrando as ${MAX_RESPOSTAS_POR_PERGUNTA} respostas de maior % entre os dois lados; 3 outra(s) ficam fora da tabela.`,
      );
      expect(blocoDaPesquisaPorPergunta(pp(0), "PG05", "PG04", onde)).not.toContain("ficam fora da tabela");
    }
  });

  it("render a partir do payload (não recalcula): um número trocado em resumoMacro.pesquisaPorPergunta aparece no resumo e na seção 12 da parcial", async () => {
    const { payload } = await gerar({ modo: "parcial", comparacao: null });
    const pp = payload.resumoMacro!.pesquisaPorPergunta!;
    pp.cobertura.atual = { valor: 12.5, numerador: 1, denominador: 8 };
    const html = renderDebriefing({ payload, comparacao: null, rotulos: ROT, alertas: [] });
    for (const onde of ["resumo", "qualificacao"] as const) expect(pesquisa(html, onde)[0]).toContain("PG05: 12,5% (1 de 8 compradores)");
  });

  it("faixa na ordem A→D (não pela %): na parcial o B é o maior e continua em 2º", async () => {
    const { payload } = await gerar({ modo: "parcial", comparacao: "recalculada" });
    const fx = payload.resumoMacro!.pesquisaPorPergunta!.perguntas.find((q) => q.campo === "faixa")!;
    expect(fx.linhas.map((l) => [l.rotulo, l.atual!.n])).toEqual([
      ["A", 1],
      ["B", 2],
      ["C", 1],
      ["D", 1],
    ]);
  });

  it("orquestrador: a comparação do resumo é a do payload da comparação principal (valores da coluna dela)", async () => {
    const { payload } = await gerar({ modo: "final", comparacao: "recalculada" });
    const sexo = payload.resumoMacro!.pesquisaPorPergunta!.perguntas.find((q) => q.campo === "sexo")!;
    expect(sexo.nComparacao).toBe(5);
    expect(sexo.linhas.find((l) => l.rotulo === "Outro")!.comparacao).toEqual({ n: 1, pct: 20 });
    expect(payload.resumoMacro!.pesquisaPorPergunta!.cobertura.comparacao).toEqual({ valor: 50, numerador: 3, denominador: 6 });
  });
});

// ---------------------------------------------------------------------------
// AC3 — final e parcial; o resto do documento não muda
// ---------------------------------------------------------------------------

/**
 * Story 49.19 (rebase sobre a 49.20): o commit-base destes SHA (`f2cf6f1e`) não tinha o
 * teste de LP, que é aditivo — um `<section data-teste-de-lp>` na aba de mídia e
 * `publico.testeDeLp`. A prova do AC3 tira também esse acréscimo; os SHA ficam os medidos.
 */
function semO4919(html: string): string {
  const ini = html.indexOf(`<section ${MARCA_DO_TESTE_DE_LP}>`);
  expect(ini).toBeGreaterThan(-1);
  return html.slice(0, ini) + html.slice(html.indexOf("</section>", ini) + "</section>".length);
}

/**
 * Story 49.21 (rebase sobre a 49.19/49.20): o commit-base destes SHA também não tinha o
 * aviso CPA × CAC, que é só render — um `<div class="warn" data-aviso-cpa-cac>` acima do
 * ranking da Mídia por Anúncio, sem campo no payload. Todos estes cenários têm ranking, então
 * há exatamente um aviso; a prova do AC3 o tira também e os SHA ficam os medidos.
 */
function semOAvisoDa4921(html: string): string {
  const r = tirarDivs(html, `<div class="warn" ${MARCA_DO_AVISO_CPA_CAC}>`);
  expect(r.removidos).toBe(1);
  return r.html;
}

describe("AC3 — parcial e final; HTML inteiro e payload iguais aos do commit-base, descontados os acréscimos", () => {
  it.each(Object.keys(CENARIOS_DO_PUBLICO))("%s: HTML inteiro sem os blocos e payload sem os campos novos = os do commit-base", async (nome) => {
    const { html, payload } = await gerar(CENARIOS_DO_PUBLICO[nome]!);
    expect(sha(html)).not.toBe(SHA_DA_BASE[nome]!.html);
    expect(sha(semOAvisoDa4921(semO4919(semAcrescimosDa4920(html))))).toBe(SHA_DA_BASE[nome]!.html);
    expect(payload.publico.recompraPorOrigem).toBeDefined();
    expect(payload.resumoMacro!.pesquisaPorPergunta).toBeDefined();
    const p = semCamposDa4920(payload);
    expect(p.publico.testeDeLp).toBeDefined();
    delete p.publico.testeDeLp;
    expect(sha(JSON.stringify(p))).toBe(SHA_DA_BASE[nome]!.payload);
    // Sem bump da versão do payload.
    expect(payload.versao).toBe(1);
  });

  it.each(Object.keys(CENARIOS_DO_PUBLICO))("%s: por título, só a seção 11 muda no final; a 11 e a 12 na parcial", async (nome) => {
    const c = CENARIOS_DO_PUBLICO[nome]!;
    const { html } = await gerar(c);
    const novo = secoesPorTitulo(html);
    const antes = secoesPorTitulo(semAcrescimosDa4920(html));
    expect([...novo.keys()]).toEqual([...SECOES_DO_DEBRIEFING]);
    const mudaram = SECOES_DO_DEBRIEFING.filter((t) => novo.get(t) !== antes.get(t));
    expect(mudaram).toEqual(c.modo === "final" ? ["Cross-launch & Listas"] : ["Cross-launch & Listas", "Qualificação"]);
    expect(blocosDa4920(html)).toEqual({ recompra: 1, pesquisaNoResumo: 1, pesquisaNaQualificacao: c.modo === "parcial" ? 1 : 0 });
  });

  it("onde as tabelas entraram: a recompra na seção 11 depois da tabela do cross-launch e antes das lacunas; nenhuma numeração nova", async () => {
    const { html } = await gerar({ modo: "parcial", comparacao: "recalculada" });
    const s11 = secoesPorTitulo(html).get("Cross-launch & Listas")!;
    expect(s11.indexOf(MARCA_DA_RECOMPRA_POR_ORIGEM)).toBeGreaterThan(s11.indexOf("Compradores do principal já na base anterior"));
    expect(s11.indexOf(MARCA_DA_RECOMPRA_POR_ORIGEM)).toBeLessThan(s11.indexOf("data-lacuna"));
    const nums = [...html.matchAll(/<span class="sec-num">(\d{2})<\/span>/g)].map((m) => m[1]);
    expect(nums).toEqual(SECOES_DO_DEBRIEFING.map((_, i) => String(i).padStart(2, "0")));
    // A descrição da seção 12 (R6-6) não muda: a exceção R11-2 é dita dentro do bloco.
    const s12 = secoesPorTitulo(html).get("Qualificação")!;
    expect(s12).toContain("sem % por lançamento, decisão R6-6");
  });

  it("comparação com o render direto (sem orquestrador): o resumo calcula a pesquisa pelo mesmo cálculo puro", () => {
    const atual = payloadPublico({ ...configDoLado(configSintetica(), "atual"), lancamentoComparacaoFunnelId: IDS.FB, lancamentosComparacao: [IDS.FB] } as never);
    const cp = payloadPublico({ ...configDoLado(configSintetica(), "comparacao"), funnelId: IDS.FB } as never, { lado: "comparacao" });
    const comp: ComparacaoDoDebriefing = { funnelId: IDS.FB, nome: "PG04", payload: cp, origem: { tipo: "recalculada" } };
    expect(atual.resumoMacro).toBeUndefined();
    const html = renderDebriefing({ payload: atual, comparacao: comp, rotulos: ROT, alertas: [] });
    expect(linhasDaTabela(pesquisa(html, "resumo")[0]!, 'data-pergunta="sexo"')[1]).toBe("Feminino | 40,0% (2) | 50,0% (3)");
  });
});
