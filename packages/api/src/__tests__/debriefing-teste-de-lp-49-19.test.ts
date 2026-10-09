/**
 * Story 49.19 — teste de LP no Debriefing (AC1–AC8).
 *
 * Três camadas, cada uma com as próprias provas:
 * - o motor puro (`computeTesteDeLp`), com entradas mínimas montadas aqui;
 * - o Motor II e o orquestrador (`gerarDebriefing`) de ponta a ponta, sobre a
 *   fixture `debriefing-teste-de-lp-49-19.ts` (relógio fixado, final e parcial);
 * - o render a partir do payload completo.
 * O Fisher em si é provado contra referências publicadas em `fisher-exato.test.ts`.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DIAS_MINIMOS_DO_TESTE_DE_LP,
  computeTesteDeLp,
  lpDaCampanha,
  textoDoPValor,
  type AnuncioDiaDoTesteDeLp,
  type EntradaDoTesteDeLp,
  type ParDeLp,
  type TesteDeLp,
} from "../services/debriefing-teste-de-lp.js";
import type { CompradorDaMidia } from "../services/debriefing-midia-anuncios.js";
import { fisherExatoBilateral } from "../services/fisher-exato.js";
import { MARCA_DA_MIDIA_POR_ANUNCIO, MARCA_DO_TESTE_DE_LP, SECOES_DO_DEBRIEFING, renderDebriefing } from "../services/debriefing-render.js";
import { gerarDebriefing } from "../services/debriefing-generate.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { configSintetica } from "./fixtures/debriefing-payload-sintetico.js";
import {
  ANUNCIOS_DO_VIDEO,
  CAMP_LP,
  CENARIOS_DO_AC7,
  PARAMS_DO_TESTE_DE_LP,
  depsDoTesteDeLp,
  payloadDoTesteDeLp,
  type CenarioDoTesteDeLp,
} from "./fixtures/debriefing-teste-de-lp-49-19.js";

const FATOR = 1 / (1 - 0.1215);
const ROT = { projeto: "Expert", lancamento: "PG05", etapas: {}, funis: {} };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Construtores da entrada do motor puro
// ---------------------------------------------------------------------------

interface CampanhaDeTeste {
  id: string;
  nome: string;
  conjuntos?: readonly (string | null)[];
  anuncios?: readonly (string | null)[];
  dias: readonly string[];
  inv?: number;
  /** landing_page_view por linha, por dia (na ordem de `dias`); `null` = a Meta não devolveu. */
  lpv?: readonly (number | null)[] | number | null;
}

const D = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
const dias = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => D(de + i));

function linhas(c: CampanhaDeTeste): AnuncioDiaDoTesteDeLp[] {
  const out: AnuncioDiaDoTesteDeLp[] = [];
  (c.conjuntos ?? ["01_QUENTE"]).forEach((conj, ci) =>
    (c.anuncios ?? ["ad01"]).forEach((an, ai) =>
      c.dias.forEach((dia, di) => {
        const lpv = c.lpv === undefined ? 10 : Array.isArray(c.lpv) ? (c.lpv[di] ?? null) : (c.lpv as number | null);
        out.push({
          adId: `${c.id}-${ci}-${ai}`,
          nome: an,
          campaignName: c.nome,
          campaignId: c.id,
          adsetName: conj,
          dia,
          investimentoComImposto: c.inv ?? 10,
          linkClicks: null,
          landingPageViews: lpv,
        });
      }),
    ),
  );
  return out;
}

const comprador = (adId: string | null, dia: string | null, over: Partial<CompradorDaMidia> = {}): CompradorDaMidia => ({
  adId,
  dia,
  faturamento: 99,
  tierSuperior: false,
  ...over,
});
const n = (k: number, adId: string, dia: string, over: Partial<CompradorDaMidia> = {}) => Array.from({ length: k }, () => comprador(adId, dia, over));

const entrada = (campanhas: CampanhaDeTeste[], compradores: CompradorDaMidia[] = [], vendasComConteudo = true): EntradaDoTesteDeLp => ({
  anuncios: campanhas.flatMap(linhas),
  compradores,
  vendasComConteudo,
});

const VID = (lp: string) => `lanc--vendas-captacao--hot--cbo--videos--${lp}`;
const EST = (lp: string) => `lanc--vendas-captacao--hot--cbo--estaticos--${lp}`;

const par = (t: TesteDeLp, lps: string): ParDeLp => {
  const p = t.pares.find((x) => x.lps.join("×") === lps);
  expect(p, lps).toBeDefined();
  return p!;
};

// ---------------------------------------------------------------------------
// AC1 — a LP de cada campanha
// ---------------------------------------------------------------------------

describe("AC1 — LP pelo código no nome da campanha (os parsers existentes)", () => {
  it("bloco `--lp…` (RE_LP do parseUtmTerm), rótulo fino e chave pela 1ª letra (chaveLp)", () => {
    expect(lpDaCampanha("dg-pg05-out-26--vendas-captacao--2026-09-30--hot--cbo--videos--lpa")).toEqual({ lp: "LPA", rotulo: "LPA", regra: "bloco-lp" });
    expect(lpDaCampanha("dg-pg04--vendas-captacao--2026-07-11--cold--cbo--videos--lote00--lpaa")).toEqual({ lp: "LPA", rotulo: "LPAA", regra: "bloco-lp" });
    // bloco composto, como o parseUtmTerm já lê
    expect(lpDaCampanha("lanc--vendas-captacao--hot--cbo--videos-lpf")?.lp).toBe("LPF");
    // a cópia da Meta não vira outra LP
    expect(lpDaCampanha("lanc--vendas-captacao--hot--cbo--estaticos--lpe — Cópia")?.lp).toBe("LPE");
  });

  it("nome do Epic 47 (9 campos, o último com o formato `lp` + uma letra)", () => {
    expect(lpDaCampanha("bbe_churrasco-premium_a01_of01_2026_hot_cbo_videos_lpb")).toEqual({ lp: "LPB", rotulo: "LPB", regra: "nomenclatura-epic-47" });
    // 8 campos ou o último fora do formato → sem LP
    expect(lpDaCampanha("bbe_churrasco_a01_of01_2026_hot_cbo_lpb")).toBeNull();
    expect(lpDaCampanha("bbe_churrasco_a01_of01_2026_hot_cbo_videos_lp1")).toBeNull();
  });

  it("sem código → null; nada de casar `lp` no meio de palavra (o falso positivo do `/lp([a-z])/`)", () => {
    expect(lpDaCampanha("lanc--vendas-captacao--hot--cbo--videos")).toBeNull();
    expect(lpDaCampanha("lanc--helpdesk--vendas-captacao")).toBeNull();
    expect(lpDaCampanha("")).toBeNull();
    expect(lpDaCampanha(null)).toBeNull();
  });

  it("campanha sem LP fica fora do teste e é contada (quantas e quanto investimento)", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), dias: dias(1, 3) },
        { id: "g", nome: VID("lpg"), dias: dias(1, 3) },
        { id: "s1", nome: "lanc--vendas-captacao--hot--cbo--videos", dias: dias(1, 2), inv: 7 },
        { id: "s2", nome: "lanc--vendas-captacao--cold--cbo--estaticos", dias: [D(1)], inv: 5 },
      ]),
    );
    expect(t.semLp).toMatchObject({ campanhas: 2, investimentoComImposto: 19, nomes: ["lanc--vendas-captacao--cold--cbo--estaticos", "lanc--vendas-captacao--hot--cbo--videos"] });
    expect(t.semLp.memoria).toContain("2 campanha(s)");
    expect(t.porLp.map((x) => [x.lp, x.campanhas, x.investimentoComImposto])).toEqual([
      ["LPA", 1, 30],
      ["LPG", 1, 30],
    ]);
    expect(t.campanhas.map((c) => [c.campanha, c.lp])).toEqual([
      ["lanc--vendas-captacao--cold--cbo--estaticos", null],
      ["lanc--vendas-captacao--hot--cbo--videos", null],
      [VID("lpa"), "LPA"],
      [VID("lpg"), "LPG"],
    ]);
    // nenhuma das sem LP entra em par ou em "sem par"
    expect(t.pares.map((p) => p.lps)).toEqual([["LPA", "LPG"]]);
    expect(t.semPar).toEqual([]);
  });

  it("lpaa e lpa são a mesma LP (chaveLp): não formam par entre si", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), dias: dias(1, 3) }, { id: "aa", nome: VID("lpaa"), dias: dias(1, 3) }]));
    expect(t.porLp).toEqual([{ lp: "LPA", rotulos: ["LPA", "LPAA"], campanhas: 2, investimentoComImposto: 60 }]);
    expect(t.pares).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC2 — pares justos
// ---------------------------------------------------------------------------

describe("AC2 — só pares com o mesmo formato, os mesmos anúncios e os mesmos conjuntos (pelo NOME)", () => {
  const base = { conjuntos: ["01_QUENTE", "02_LISTAS"], anuncios: ["adv01--claude", "adv02--claude"], dias: dias(1, 3) };

  it("par válido: ids de conjunto e de anúncio diferentes, nomes iguais (caixa, acento e sufixo de cópia não contam)", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), ...base },
        { id: "g", nome: VID("lpg"), ...base, conjuntos: ["01_quente", "02_LISTAS - Copy"], anuncios: ["ADV01--Claude", "adv02--claude — Cópia"] },
      ]),
    );
    expect(t.pares).toHaveLength(1);
    const p = t.pares[0]!;
    expect(p.lps).toEqual(["LPA", "LPG"]);
    expect(p.formato).toBe("video");
    expect(p.conjuntos).toEqual(["01_QUENTE", "02_LISTAS"]);
    expect(p.anuncios).toEqual(["adv01--claude", "adv02--claude"]);
    expect(t.semPar).toEqual([]);
    // o mesmo criativo casa pelo nome normalizado nas duas LPs (as visitas da LPG não somem)
    expect(p.mesmoCriativo.map((c) => c.porLp.map((x) => x.landingPageViews))).toEqual([
      [60, 60],
      [60, 60],
    ]);
  });

  it("formato diferente → sem par, com o motivo", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: EST("lpg"), ...base }]));
    expect(t.pares).toEqual([]);
    expect(t.semPar.map((g) => [g.lp, g.maisProxima, g.diferencas])).toEqual([
      ["LPA", "LPG", ["formato"]],
      ["LPG", "LPA", ["formato"]],
    ]);
    expect(t.semPar[0]!.texto).toContain("difere em formato");
  });

  it("anúncios diferentes (um a mais) → sem par", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: VID("lpg"), ...base, anuncios: [...base.anuncios, "adv03--claude"] }]));
    expect(t.pares).toEqual([]);
    expect(t.semPar.map((g) => g.diferencas)).toEqual([["anuncios"], ["anuncios"]]);
    expect(t.semPar[0]!.texto).toContain("nomes de anúncio");
  });

  it("R12-6: conjuntos diferentes com nomes em comum → par pela INTERSEÇÃO (o conjunto a mais fica fora)", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: VID("lpg"), ...base, conjuntos: ["01_QUENTE"] }]));
    const p = par(t, "LPA×LPG");
    expect(p.conjuntos).toEqual(["01_QUENTE"]);
    expect(p.conjuntosForaDoPar).toEqual([{ lp: "LPA", conjuntos: ["02_LISTAS"] }]);
    expect(t.semPar).toEqual([]);
  });

  it("R12-6: interseção vazia → sem par, com o motivo", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: VID("lpg"), ...base, conjuntos: ["09_OUTRO"] }]));
    expect(t.pares).toEqual([]);
    expect(t.semPar.map((g) => g.diferencas)).toEqual([["conjuntos"], ["conjuntos"]]);
    expect(t.semPar[0]!.texto).toContain("nenhum nome de conjunto em comum");
  });

  it("R12-6: os anúncios são comparados DENTRO dos conjuntos em comum", () => {
    // A LPA tem um anúncio a mais, mas só no conjunto que a LPG não tem.
    const anuncios = [
      ...linhas({ id: "a", nome: VID("lpa"), conjuntos: ["01_QUENTE"], anuncios: ["adv01"], dias: dias(1, 3) }),
      ...linhas({ id: "a", nome: VID("lpa"), conjuntos: ["02_LISTAS"], anuncios: ["adv01", "adv09"], dias: dias(1, 3) }).map((l) => ({ ...l, adId: `x${l.adId}` })),
      ...linhas({ id: "g", nome: VID("lpg"), conjuntos: ["01_QUENTE"], anuncios: ["adv01"], dias: dias(1, 3) }),
    ];
    const t = computeTesteDeLp({ anuncios, compradores: [], vendasComConteudo: true });
    const p = par(t, "LPA×LPG");
    expect([p.conjuntos, p.anuncios]).toEqual([["01_QUENTE"], ["adv01"]]);
    // dentro da interseção os anúncios diferem → sem par
    const outra = computeTesteDeLp({
      anuncios: [...anuncios, ...linhas({ id: "g2", nome: VID("lpf"), conjuntos: ["02_LISTAS"], anuncios: ["adv01"], dias: dias(1, 3) })],
      compradores: [],
      vendasComConteudo: true,
    });
    expect(outra.pares.map((x) => x.lps.join("×"))).toEqual(["LPA×LPG"]);
    expect(outra.semPar.find((g) => g.lp === "LPF")!.diferencas).toEqual(["anuncios"]);
  });

  it("R12-6 (o caso do PG05): LPA com 4 conjuntos × LPF com 3 — par nos 3; o 4º fica fora das visitas, das compras, da verba e da janela", () => {
    const tres = ["00_LISTAS", "01_ALLINONE30D", "01_SEGUIDORES"];
    const anuncios = [
      ...linhas({ id: "a", nome: EST("lpa"), conjuntos: tres, dias: dias(1, 4), inv: 10, lpv: 10 }),
      // o 4º conjunto da LPA: mais caro, mais visitas, um dia só dele (05/10) e compradores
      ...linhas({ id: "a", nome: EST("lpa"), conjuntos: ["01_ALLINONE90D_INTERESSES"], dias: dias(1, 5), inv: 100, lpv: 50 }).map((l) => ({ ...l, adId: "a-90d" })),
      ...linhas({ id: "f", nome: EST("lpf"), conjuntos: tres, dias: dias(1, 5), inv: 10, lpv: 10 }),
    ];
    const t = computeTesteDeLp({
      anuncios,
      compradores: [...n(5, "a-90d", D(2)), comprador("a-0-0", D(2)), comprador("f-1-0", D(3))],
      vendasComConteudo: true,
    });
    const p = par(t, "LPA×LPF");
    expect(t.semPar).toEqual([]);
    expect(p.conjuntos).toEqual(tres);
    expect(p.conjuntosForaDoPar).toEqual([{ lp: "LPA", conjuntos: ["01_ALLINONE90D_INTERESSES"] }]);
    expect(p.janela.dias).toEqual(dias(1, 4));
    expect(p.lados.map((l) => [l.investimentoComImposto, l.landingPageViews, l.compradores, l.comprasNaTaxa])).toEqual([
      [120, 120, 1, 1],
      [120, 120, 1, 1],
    ]);
    expect(p.lados.map((l) => l.pctDaVerba.valor)).toEqual([50, 50]);
    expect(p.investimentoDoPar).toBe(240);
  });

  it("o motivo aponta a LP mais próxima (a de menos diferenças)", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), ...base },
        { id: "b", nome: EST("lpb"), ...base, conjuntos: ["09_OUTRO"] },
        { id: "c", nome: VID("lpc"), ...base, conjuntos: ["09_OUTRO"] },
      ]),
    );
    const a = t.semPar.find((g) => g.lp === "LPA")!;
    expect([a.maisProxima, a.diferencas]).toEqual(["LPC", ["conjuntos"]]);
    const b = t.semPar.find((g) => g.lp === "LPB")!;
    expect([b.maisProxima, b.diferencas]).toEqual(["LPC", ["formato"]]);
  });

  it("conjunto sem nome (linha sem adset_name) ou campanha sem formato → nunca forma par", () => {
    const semConj = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: VID("lpg"), ...base, conjuntos: ["01_QUENTE", null] }]));
    expect(semConj.pares).toEqual([]);
    expect(semConj.semPar.find((g) => g.lp === "LPG")!.texto).toContain("linha sem adset_name");
    const semFormato = computeTesteDeLp(
      entrada([
        { id: "a", nome: "lanc--vendas-captacao--hot--cbo--lpa", ...base },
        { id: "g", nome: "lanc--vendas-captacao--hot--cbo--lpg", ...base },
      ]),
    );
    expect(semFormato.pares).toEqual([]);
    expect(semFormato.semPar.map((g) => g.diferencas)).toEqual([["formato"], ["formato"]]);
  });

  it("única LP no lançamento → sem par, sem LP mais próxima", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "a2", nome: EST("lpa"), ...base }]));
    expect(t.semPar.map((g) => [g.lp, g.maisProxima, g.diferencas])).toEqual([
      ["LPA", null, []],
      ["LPA", null, []],
    ]);
    expect(t.semPar[0]!.texto).toContain("única LP");
  });

  it("três LPs com a mesma assinatura → três pares (cada um com a própria janela)", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), ...base, dias: dias(1, 6) },
        { id: "f", nome: VID("lpf"), ...base, dias: dias(2, 6) },
        { id: "g", nome: VID("lpg"), ...base, dias: dias(4, 6) },
      ]),
    );
    expect(t.pares.map((p) => [p.lps.join("×"), p.janela.dias.length])).toEqual([
      ["LPA×LPF", 5],
      ["LPA×LPG", 3],
      ["LPF×LPG", 3],
    ]);
  });

  it("duas campanhas da MESMA LP com a mesma assinatura somam do mesmo lado", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a1", nome: VID("lpa"), ...base },
        { id: "a2", nome: `${VID("lpa")} — Cópia`, ...base },
        { id: "g", nome: VID("lpg"), ...base },
      ]),
    );
    const p = par(t, "LPA×LPG");
    expect(p.lados[0].campanhas).toHaveLength(2);
    expect(p.lados[0].investimentoComImposto).toBe(2 * 2 * 2 * 3 * 10);
  });

  it("campanhas da MESMA LP com outros conjuntos ou outros anúncios NÃO se somam: cada uma é comparada por si", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a1", nome: VID("lpa"), ...base },
        { id: "a2", nome: `${VID("lpa")} — Cópia`, ...base, conjuntos: ["09_OUTRO"] },
        { id: "a3", nome: `${VID("lpa")} — Cópia 2`, ...base, anuncios: ["adv09--outro"] },
        { id: "g", nome: VID("lpg"), ...base },
      ]),
    );
    expect(t.pares.map((x) => [x.lps.join("×"), x.lados[0].campanhas])).toEqual([["LPA×LPG", [VID("lpa")]]]);
    expect(t.semPar.map((g) => [g.campanhas, g.diferencas])).toEqual([
      [[`${VID("lpa")} — Cópia`], ["conjuntos"]],
      [[`${VID("lpa")} — Cópia 2`], ["anuncios"]],
    ]);
  });

  it("TEST-003 (R12-6): campanhas da mesma LP cujos nomes só diferem na normalização se juntam — 1 par, 2 campanhas", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a1", nome: VID("lpa"), conjuntos: ["01_QUENTE"], anuncios: ["adv01"], dias: dias(1, 3) },
        { id: "a2", nome: `${VID("lpa")}--b`, conjuntos: ["01_quente"], anuncios: ["ADV01"], dias: dias(1, 3) },
        { id: "g", nome: VID("lpg"), conjuntos: ["01_QUENTE"], anuncios: ["adv01"], dias: dias(1, 3) },
      ]),
    );
    expect(t.pares).toHaveLength(1);
    expect(par(t, "LPA×LPG").lados[0].campanhas).toHaveLength(2);
  });

  it("TEST-003 (R12-6): duas campanhas da MESMA LP com conjunto em comum nunca formam par entre si", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a1", nome: VID("lpa"), conjuntos: ["01_QUENTE", "02_LISTAS"], anuncios: ["adv01"], dias: dias(1, 3) },
        { id: "a2", nome: `${VID("lpa")}--b`, conjuntos: ["01_QUENTE"], anuncios: ["adv01"], dias: dias(1, 3) },
      ]),
    );
    expect(t.pares).toEqual([]);
  });

  it("TEST-003 (R12-6): o conjunto a mais da SEGUNDA LP também sai em conjuntosForaDoPar", () => {
    const t = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), conjuntos: ["01_QUENTE"], dias: dias(1, 3) },
        { id: "g", nome: VID("lpg"), conjuntos: ["01_QUENTE", "02_LISTAS"], dias: dias(1, 3) },
      ]),
    );
    expect(par(t, "LPA×LPG").conjuntosForaDoPar).toEqual([{ lp: "LPG", conjuntos: ["02_LISTAS"] }]);
  });

  it("TEST-003 (R12-6, ponto 4): comprador de anúncio da interseção que só rodou fora da janela, comprando NA janela, conta", () => {
    const anuncios = [
      ...linhas({ id: "a", nome: VID("lpa"), dias: dias(1, 3) }),
      ...linhas({ id: "a", nome: VID("lpa"), dias: [D(5)] }).map((l) => ({ ...l, adId: "a-copia" })),
      ...linhas({ id: "g", nome: VID("lpg"), dias: dias(1, 3) }),
    ];
    const t = computeTesteDeLp({ anuncios, compradores: [comprador("a-copia", D(2))], vendasComConteudo: true });
    const p = par(t, "LPA×LPG");
    expect(p.janela.dias).toEqual(dias(1, 3));
    expect(p.lados[0].compradores).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC3 — janela comum
// ---------------------------------------------------------------------------

describe("AC3 — a janela do par = os dias em que TODAS as LPs tiveram investimento", () => {
  it("a LP que estreia depois define o início; o que é de fora (investimento, visitas e compras) não entra", () => {
    const t = computeTesteDeLp(
      entrada(
        [
          { id: "a", nome: VID("lpa"), dias: dias(1, 6) },
          { id: "g", nome: VID("lpg"), dias: dias(3, 8) },
        ],
        [comprador("a-0-0", D(1)), comprador("a-0-0", D(2)), comprador("a-0-0", D(4)), comprador("g-0-0", D(7)), comprador("g-0-0", D(5))],
      ),
    );
    const p = par(t, "LPA×LPG");
    expect(p.janela.dias).toEqual(dias(3, 6));
    expect([p.janela.inicio, p.janela.fim]).toEqual([D(3), D(6)]);
    expect(p.janela.memoria).toContain("4 (03/10/2026 a 06/10/2026)");
    expect(p.lados.map((l) => [l.investimentoComImposto, l.landingPageViews, l.compradores])).toEqual([
      [40, 40, 1],
      [40, 40, 1],
    ]);
  });

  it("dia com linha mas sem investimento não conta; dia fora de uma das LPs também não (janela com intervalo)", () => {
    const anuncios = [
      ...linhas({ id: "a", nome: VID("lpa"), dias: dias(1, 5) }),
      ...linhas({ id: "g", nome: VID("lpg"), dias: [D(1), D(2), D(4), D(5)] }),
    ].map((l) => (l.campaignId === "g" && l.dia === D(5) ? { ...l, investimentoComImposto: 0 } : l));
    const t = computeTesteDeLp({ anuncios, compradores: [], vendasComConteudo: true });
    const p = par(t, "LPA×LPG");
    expect(p.janela.dias).toEqual([D(1), D(2), D(4)]);
    expect(p.janela.memoria).toContain("com intervalo");
  });

  it("comprador sem dia legível não entra em janela nenhuma", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), dias: dias(1, 3) }, { id: "g", nome: VID("lpg"), dias: dias(1, 3) }], [comprador("a-0-0", null), comprador("a-0-0", D(2))]));
    expect(par(t, "LPA×LPG").lados[0].compradores).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC4 — métrica, Fisher e "sem leitura"
// ---------------------------------------------------------------------------

describe("AC4 — compras ÷ visitas, CPA, ROAS, tier e o Fisher exato bilateral", () => {
  /** Um par de 3 dias com (compras, visitas) dados por LP — 1 conjunto, 1 anúncio. */
  function parCom(a: { compras: number; visitas: readonly number[]; inv?: number }, g: { compras: number; visitas: readonly number[]; inv?: number }, extra: Partial<EntradaDoTesteDeLp> = {}) {
    const e = entrada(
      [
        { id: "a", nome: VID("lpa"), dias: dias(1, 3), lpv: a.visitas, inv: a.inv ?? 10 },
        { id: "g", nome: VID("lpg"), dias: dias(1, 3), lpv: g.visitas, inv: g.inv ?? 10 },
      ],
      [...n(a.compras, "a-0-0", D(2)), ...n(g.compras, "g-0-0", D(3))],
    );
    return par(computeTesteDeLp({ ...e, ...extra }), "LPA×LPG");
  }

  it("a tabela do Fisher é (compras, visitas − compras) de cada LP — referência da Wikipédia: p ≈ 0,002759 → veredito", () => {
    const p = parCom({ compras: 1, visitas: [4, 3, 3] }, { compras: 11, visitas: [5, 5, 4] });
    expect(p.fisher!.tabela).toEqual([
      [1, 9],
      [11, 3],
    ]);
    expect(p.fisher!.pValor).toBeCloseTo(41 / 14858, 14);
    expect([p.resultado, p.vencedora]).toEqual(["veredito", "LPG"]);
    expect(p.texto).toContain("LPG vence LPA");
    expect(p.texto).toContain("p = 0,0028");
  });

  it("p muito pequeno sai como \"p < 0,0001\" (nunca \"p = 0,0000\")", () => {
    const p = parCom({ compras: 0, visitas: [100, 100, 100] }, { compras: 40, visitas: [100, 100, 100] });
    expect(p.fisher!.pValor).toBeLessThan(0.0001);
    expect(p.texto).toContain("Fisher exato bilateral, p < 0,0001 < 0,05).");
  });

  it("p logo abaixo de 0,05 (0,04990) → veredito; logo acima (0,05008) → empate, segue rodando", () => {
    const abaixo = parCom({ compras: 1, visitas: [4, 4, 3] }, { compras: 10, visitas: [7, 7, 7] });
    expect(abaixo.fisher!.tabela).toEqual([
      [1, 10],
      [10, 11],
    ]);
    expect(abaixo.fisher!.pValor).toBeCloseTo(247649 / 4962480, 14);
    expect(abaixo.resultado).toBe("veredito");
    const acima = parCom({ compras: 1, visitas: [2, 2, 2] }, { compras: 13, visitas: [6, 6, 6] });
    expect(acima.fisher!.tabela).toEqual([
      [1, 5],
      [13, 5],
    ]);
    expect(acima.fisher!.pValor).toBeCloseTo(963 / 19228, 14);
    expect([acima.resultado, acima.vencedora]).toEqual(["empate", null]);
    expect(acima.texto).toMatch(/^Empate, segue rodando: .*p = 0,0501 ≥ 0,05/);
  });

  it("p = exatamente 0,05 → empate (p ≥ 0,05), decidido sem erro de ponto flutuante", () => {
    const p = parCom({ compras: 0, visitas: [1, 1, 0] }, { compras: 12, visitas: [5, 5, 4] });
    expect(p.fisher!.tabela).toEqual([
      [0, 2],
      [12, 2],
    ]);
    expect(p.resultado).toBe("empate");
  });

  it("as métricas de cada LP: CPA, ROAS, tier e compras ÷ visitas na janela", () => {
    const e = entrada(
      [
        { id: "a", nome: VID("lpa"), dias: dias(1, 3), lpv: 100, inv: 50 },
        { id: "g", nome: VID("lpg"), dias: dias(1, 3), lpv: 100, inv: 30 },
      ],
      [comprador("a-0-0", D(1), { faturamento: 297, tierSuperior: true }), comprador("a-0-0", D(2)), comprador("g-0-0", D(3), { faturamento: 99 })],
    );
    const p = par(computeTesteDeLp(e), "LPA×LPG");
    const [a, g] = p.lados;
    expect([a.compradores, a.comprasNaTaxa, a.landingPageViews]).toEqual([2, 2, 300]);
    expect(a.compraPorVisita.valor).toBeCloseTo((2 / 300) * 100, 12);
    expect(a.cpa.valor).toBeCloseTo(150 / 2, 12);
    expect(a.roas.valor).toBeCloseTo((297 + 99) / 150, 12);
    expect(a.tierSuperior.valor).toBeCloseTo(0.5, 12);
    expect([g.compradores, g.cpa.valor, g.tierSuperior.valor]).toEqual([1, 90, 0]);
    // o p-valor que vai ao documento é o do Fisher sobre a tabela das duas
    expect(p.fisher!.pValor).toBe(fisherExatoBilateral(2, 298, 1, 299).pValor);
  });

  it("o numerador só leva compradores de anúncios com landing_page_view (a regra da 49.18)", () => {
    const e = entrada(
      [
        { id: "a", nome: VID("lpa"), anuncios: ["ad01", "ad02"], dias: dias(1, 3), lpv: 10 },
        { id: "g", nome: VID("lpg"), anuncios: ["ad01", "ad02"], dias: dias(1, 3), lpv: 10 },
      ],
      [comprador("a-0-0", D(1)), comprador("a-0-1", D(1))],
    );
    const anuncios = e.anuncios.map((l) => (l.adId === "a-0-1" ? { ...l, landingPageViews: null } : l));
    const p = par(computeTesteDeLp({ ...e, anuncios }), "LPA×LPG");
    expect([p.lados[0].compradores, p.lados[0].comprasNaTaxa, p.lados[0].landingPageViews]).toEqual([2, 1, 30]);
    expect(p.fisher!.tabela[0]).toEqual([1, 29]);
  });

  it(`"sem leitura" com 2 dias na janela comum; com ${DIAS_MINIMOS_DO_TESTE_DE_LP} já há leitura`, () => {
    const com = (k: number) =>
      par(computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), dias: dias(1, 5) }, { id: "g", nome: VID("lpg"), dias: dias(6 - k, 5) }], [comprador("g-0-0", D(5))])), "LPA×LPG");
    const dois = com(2);
    expect([dois.janela.dias.length, dois.resultado, dois.motivoSemLeitura, dois.fisher]).toEqual([2, "sem-leitura", "MENOS_DE_3_DIAS", null]);
    expect(dois.texto).toContain("2 dia(s), menos que os 3");
    const tres = com(3);
    expect([tres.janela.dias.length, tres.resultado, tres.motivoSemLeitura]).toEqual([3, "empate", null]);
    expect(tres.fisher).not.toBeNull();
  });

  it("R2: sem landing_page_view no período → sem leitura com o motivo (nunca 0)", () => {
    const p = parCom({ compras: 1, visitas: [5, 5, 5] }, { compras: 1, visitas: [5, 5, 5] }, {
      anuncios: entrada([
        { id: "a", nome: VID("lpa"), dias: dias(1, 3), lpv: null },
        { id: "g", nome: VID("lpg"), dias: dias(1, 3), lpv: 5 },
      ]).anuncios,
    });
    expect([p.resultado, p.motivoSemLeitura, p.lados[0].landingPageViews]).toEqual(["sem-leitura", "LANDING_PAGE_VIEW_AUSENTE", null]);
    expect(p.texto).toContain("landing_page_view na janela para LPA");
  });

  it("zero visitas, compras acima das visitas e venda sem utm_content → sem leitura, cada um com o seu motivo", () => {
    expect(parCom({ compras: 0, visitas: [0, 0, 0] }, { compras: 1, visitas: [5, 5, 5] }).motivoSemLeitura).toBe("SEM_VISITAS");
    expect(parCom({ compras: 4, visitas: [1, 1, 1] }, { compras: 1, visitas: [5, 5, 5] }).motivoSemLeitura).toBe("COMPRAS_ACIMA_DAS_VISITAS");
    expect(parCom({ compras: 1, visitas: [5, 5, 5] }, { compras: 1, visitas: [5, 5, 5] }, { vendasComConteudo: false }).motivoSemLeitura).toBe("SEM_UTM_CONTENT_NA_VENDA");
  });
});

// ---------------------------------------------------------------------------
// AC5 e AC6
// ---------------------------------------------------------------------------

describe("AC5 — o mesmo criativo nas duas LPs", () => {
  it("cada nome de anúncio do par com compras ÷ visitas em cada LP, na janela", () => {
    const t = computeTesteDeLp(
      entrada(
        [
          { id: "a", nome: VID("lpa"), anuncios: ["adv01", "adv02"], dias: dias(1, 4), lpv: 25 },
          { id: "g", nome: VID("lpg"), anuncios: ["adv01", "adv02"], dias: dias(2, 4), lpv: 25 },
        ],
        [comprador("a-0-0", D(1)), comprador("a-0-0", D(2)), ...n(3, "g-0-0", D(3)), comprador("g-0-1", D(4)), comprador("a-0-1", D(4))],
      ),
    );
    const p = par(t, "LPA×LPG");
    expect(p.mesmoCriativo.map((c) => [c.nome, c.porLp.map((x) => [x.lp, x.compras, x.landingPageViews, x.compraPorVisita.valor])])).toEqual([
      ["adv01", [["LPA", 1, 75, (1 / 75) * 100], ["LPG", 3, 75, (3 / 75) * 100]]],
      ["adv02", [["LPA", 1, 75, (1 / 75) * 100], ["LPG", 1, 75, (1 / 75) * 100]]],
    ]);
  });
});

describe("AC6 — para onde vai a verba", () => {
  const caso = (invA: number, invG: number, comprasA: number, comprasG: number) =>
    par(
      computeTesteDeLp(
        entrada(
          [
            { id: "a", nome: VID("lpa"), dias: dias(1, 3), lpv: 100, inv: invA },
            { id: "g", nome: VID("lpg"), dias: dias(1, 3), lpv: 100, inv: invG },
          ],
          [...n(comprasA, "a-0-0", D(1)), ...n(comprasG, "g-0-0", D(2))],
        ),
      ),
      "LPA×LPG",
    );

  it("parcela de cada LP no investimento do par na janela", () => {
    const p = caso(30, 10, 1, 5);
    expect(p.investimentoDoPar).toBe(120);
    expect(p.lados.map((l) => l.pctDaVerba.valor)).toEqual([75, 25]);
    expect(p.lados[0].pctDaVerba.memoria).toContain("investimento do par LPA × LPG na janela");
  });

  it("a LP pior (menor compras ÷ visitas) com a maior parcela → sinalizado; com a menor → não", () => {
    const invertida = caso(30, 10, 1, 5);
    expect(invertida.verbaInvertida).toBe(true);
    expect(invertida.textoDaVerba).toContain("(LPA, 0,33%) recebe a maior parcela da verba do par (75,00%)");
    expect(caso(10, 30, 1, 5).verbaInvertida).toBe(false);
    // a LP pior é a LPG aqui
    expect(caso(10, 30, 5, 1).verbaInvertida).toBe(true);
    // taxas iguais: não há pior
    expect(caso(30, 10, 2, 2).verbaInvertida).toBe(false);
  });

  it("vale também no empate, com a ressalva de que a diferença não é significativa", () => {
    const p = caso(30, 10, 1, 2);
    expect([p.resultado, p.verbaInvertida]).toEqual(["empate", true]);
    expect(p.textoDaVerba).toContain("não é significativa");
  });
});

// ---------------------------------------------------------------------------
// QA fix 1 (TEST-001) — fronteiras que o gate achou sem teste (rascunho do @qa)
// ---------------------------------------------------------------------------

describe("QA fix 1 — fronteiras da janela, da verba e do texto do p", () => {
  const doisLados = (a: Omit<CampanhaDeTeste, "nome">, g: Omit<CampanhaDeTeste, "nome">, cs: CompradorDaMidia[]) =>
    par(computeTesteDeLp(entrada([{ ...a, nome: VID("lpa") }, { ...g, nome: VID("lpg") }], cs)), "LPA×LPG");

  it("Q5: compra num dia do BURACO da janela (entre o início e o fim, sem investimento de uma LP) fica fora", () => {
    const p = doisLados({ id: "a", dias: dias(1, 5), lpv: 100 }, { id: "g", dias: [D(1), D(2), D(4), D(5)], lpv: 100 }, [...n(7, "a-0-0", D(3)), comprador("a-0-0", D(4))]);
    expect(p.janela.dias).toEqual([D(1), D(2), D(4), D(5)]);
    expect([p.lados[0].compradores, p.lados[0].comprasNaTaxa]).toEqual([1, 1]);
  });

  it("Q7: investimento igual nas duas LPs → não há 'maior parcela', sem sinal", () => {
    const p = doisLados({ id: "a", dias: dias(1, 3), lpv: 100, inv: 10 }, { id: "g", dias: dias(1, 3), lpv: 100, inv: 10 }, [comprador("a-0-0", D(1)), ...n(9, "g-0-0", D(1))]);
    expect(p.lados.map((l) => l.pctDaVerba.valor)).toEqual([50, 50]);
    expect([p.verbaInvertida, p.textoDaVerba]).toEqual([false, null]);
  });

  it("Q8: taxas iguais nas DUAS orientações da verba → sem sinal", () => {
    for (const [ia, ig] of [
      [30, 10],
      [10, 30],
    ] as const) {
      const p = doisLados({ id: "a", dias: dias(1, 3), lpv: 100, inv: ia }, { id: "g", dias: dias(1, 3), lpv: 100, inv: ig }, [...n(2, "a-0-0", D(1)), ...n(2, "g-0-0", D(1))]);
      expect(p.verbaInvertida, `${ia}×${ig}`).toBe(false);
    }
  });

  it("Q19: o limite do \"p < 0,0001\" — 0,0005 aparece com o valor; 0,00009 não", () => {
    expect(textoDoPValor(0.0005)).toBe("p = 0,0005");
    expect(textoDoPValor(0.0001)).toBe("p = 0,0001");
    expect(textoDoPValor(0.00009)).toBe("p < 0,0001");
  });
});

// ---------------------------------------------------------------------------
// REQ-001..003 do gate (decisões do @po, commit 73b57fa0)
// ---------------------------------------------------------------------------

/** O payload completo da fixture com o teste de LP trocado por um montado aqui — o render lê do payload. */
function htmlComTeste(t: TesteDeLp): string {
  const p = payloadDoTesteDeLp(configSintetica());
  p.publico.testeDeLp = t;
  return renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
}
const blocoDoTeste = (html: string) => {
  const i = html.indexOf(`<section ${MARCA_DO_TESTE_DE_LP}>`);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf("</section>", i) + "</section>".length);
};

describe("REQ-001 — o aviso de verba segue o resultado do par", () => {
  /** LPA pior (1 compra) com a maior verba; `k` dias em comum. */
  const invertido = (k: number) =>
    computeTesteDeLp(
      entrada(
        [
          { id: "a", nome: VID("lpa"), dias: dias(1, k), lpv: 100, inv: 30 },
          { id: "g", nome: VID("lpg"), dias: dias(1, k), lpv: 100, inv: 10 },
        ],
        [comprador("a-0-0", D(1)), ...n(5, "g-0-0", D(1))],
      ),
    );

  it("sem leitura (2 dias) com verba invertida: o aviso diz o motivo e não afirma significância", () => {
    const p = par(invertido(2), "LPA×LPG");
    expect([p.resultado, p.verbaInvertida]).toEqual(["sem-leitura", true]);
    expect(p.textoDaVerba).toBe(
      "A LP com menor compras ÷ visitas (LPA, 0,50%) recebe a maior parcela da verba do par (75,00%) — sem leitura: a janela comum tem 2 dia(s), menos que os 3 do método; o teste não rodou e a taxa ainda não indica perdedora.",
    );
    expect(p.textoDaVerba).not.toContain("não é significativa");
  });

  it("empate (3 dias) continua com a frase de hoje; o render mostra o aviso de cada caso a partir do payload", () => {
    const empate = par(invertido(3), "LPA×LPG");
    expect(empate.resultado).toBe("empate");
    expect(empate.textoDaVerba).toContain(" — a diferença de taxa não é significativa, mas a CBO está pondo mais verba nela.");
    const html = blocoDoTeste(htmlComTeste(invertido(2)));
    expect(html).toContain("data-verba-invertida><b>Verba</b> — A LP com menor compras ÷ visitas (LPA, 0,50%) recebe a maior parcela da verba do par (75,00%) — sem leitura: a janela comum tem 2 dia(s)");
    expect(html).not.toContain("não é significativa");
  });
});

describe("REQ-002 — ressalvas fixas no bloco", () => {
  const NOTA_VISITAS = "Visitas = eventos <code>landing_page_view</code> da Meta, não pessoas; compras são pessoas. O teste trata cada visita como uma tentativa.";
  const NOTA_CONJUNTOS = "O par soma os conjuntos. Com a verba distribuída pela CBO, o total pode inverter o resultado de cada conjunto.";
  const NOTA_COMPARACOES = "Cada par é testado com p &lt; 0,05, sem correção para várias comparações; com 3 ou mais LPs, a chance de algum veredito falso é maior que 5%.";

  it("visitas × pessoas: sempre (com par e sem nenhum par); fora só quando não há teste", async () => {
    const { html } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    expect(bloco(html)).toContain(NOTA_VISITAS);
    expect(blocoDoTeste(htmlComTeste(computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), dias: dias(1, 3) }]))))).toContain(NOTA_VISITAS);
    const sem = await gerar(CENARIOS_DO_AC7["final-sem-ad-level"]!);
    expect(bloco(sem.html)).not.toContain(NOTA_VISITAS);
  });

  it("conjuntos somados: no par com 2+ conjuntos; ausente no par com 1 conjunto", async () => {
    const { html } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    expect(parDoBloco(html, "LPA×LPG")).toContain(NOTA_CONJUNTOS);
    expect(parDoBloco(html, "LPF×LPH")).toContain(NOTA_CONJUNTOS);
    const um = htmlComTeste(computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), dias: dias(1, 3) }, { id: "g", nome: VID("lpg"), dias: dias(1, 3) }])));
    expect(blocoDoTeste(um)).toContain('data-par-de-lp="LPA×LPG"');
    expect(blocoDoTeste(um)).not.toContain(NOTA_CONJUNTOS);
  });

  it("TEST-002: a nota conta CONJUNTOS, não anúncios — 1 conjunto e 2 anúncios: ausente; 2 conjuntos e 1 anúncio: presente", () => {
    const html = (conjuntos: string[], anuncios: string[]) =>
      blocoDoTeste(
        htmlComTeste(
          computeTesteDeLp(
            entrada([
              { id: "a", nome: VID("lpa"), conjuntos, anuncios, dias: dias(1, 3) },
              { id: "g", nome: VID("lpg"), conjuntos, anuncios, dias: dias(1, 3) },
            ]),
          ),
        ),
      );
    const umConjunto = html(["01_QUENTE"], ["adv01", "adv02"]);
    expect(umConjunto).toContain('data-par-de-lp="LPA×LPG"');
    expect(umConjunto).not.toContain(NOTA_CONJUNTOS);
    const umAnuncio = html(["01_QUENTE", "02_LISTAS"], ["adv01"]);
    expect(umAnuncio).toContain('data-par-de-lp="LPA×LPG"');
    expect(umAnuncio).toContain(NOTA_CONJUNTOS);
  });

  it("TEST-003 (R12-6): a nota conta só os conjuntos da interseção — 1 em comum + 1 fora do par: ausente", () => {
    const b = blocoDoTeste(
      htmlComTeste(
        computeTesteDeLp(
          entrada([
            { id: "a", nome: VID("lpa"), conjuntos: ["01_QUENTE", "02_LISTAS"], dias: dias(1, 3) },
            { id: "g", nome: VID("lpg"), conjuntos: ["01_QUENTE"], dias: dias(1, 3) },
          ]),
        ),
      ),
    );
    expect(b).toContain('data-par-de-lp="LPA×LPG"');
    expect(b).toContain("data-conjuntos-fora-do-par");
    expect(b).not.toContain(NOTA_CONJUNTOS);
  });

  it("várias comparações: em cada par de uma assinatura com 3+ LPs; ausente com 2", async () => {
    const tres = computeTesteDeLp(
      entrada([
        { id: "a", nome: VID("lpa"), dias: dias(1, 3) },
        { id: "f", nome: VID("lpf"), dias: dias(1, 3) },
        { id: "g", nome: VID("lpg"), dias: dias(1, 3) },
      ]),
    );
    expect(tres.pares.map((x) => x.lpsNaAssinatura)).toEqual([3, 3, 3]);
    const b = blocoDoTeste(htmlComTeste(tres));
    expect(b.split(NOTA_COMPARACOES)).toHaveLength(4);
    const { html, payload } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    // R12-6: na fixture, LPA, LPF e LPH estáticas se ligam pela interseção (3 LPs); o vídeo tem 2.
    expect(teste(payload).pares.map((x) => [x.lps.join("×"), x.lpsNaAssinatura])).toEqual([
      ["LPA×LPF", 3],
      ["LPA×LPH", 3],
      ["LPF×LPH", 3],
      ["LPA×LPG", 2],
    ]);
    expect(parDoBloco(html, "LPF×LPH")).toContain(NOTA_COMPARACOES);
    expect(parDoBloco(html, "LPA×LPG")).not.toContain(NOTA_COMPARACOES);
  });
});

describe("REQ-003 — cobertura por Ad ID no bloco", () => {
  it("a frase usa N e M do payload (a mesma conta da Mídia por Anúncio)", async () => {
    const { html, payload } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    const at = payload.publico.midiaPorAnuncio!.atribuicao;
    expect(at.semAdId).toBeGreaterThan(0);
    expect(at.compradores).toBeGreaterThan(at.semAdId);
    expect(bloco(html)).toContain(
      `Compras = compradores de captação atribuídos pelo Ad ID do <code>utm_content</code>; ${at.semAdId} de ${at.compradores} compradores de captação ficam fora por não terem Ad ID.`,
    );
    const p = payloadDoTesteDeLp(configSintetica());
    p.publico.midiaPorAnuncio!.atribuicao = { ...p.publico.midiaPorAnuncio!.atribuicao, semAdId: 7, compradores: 30 };
    expect(blocoDoTeste(renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] }))).toContain("; 7 de 30 compradores de captação ficam fora por não terem Ad ID.");
  });
});

describe("sem ad-level", () => {
  it("não aplicável, sem par nem número", () => {
    expect(computeTesteDeLp({ anuncios: [], compradores: [comprador("x", D(1))], vendasComConteudo: true })).toMatchObject({
      aplicavel: false,
      motivo: "SEM_AD_LEVEL",
      pares: [],
      semPar: [],
      semLp: { campanhas: 0, investimentoComImposto: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// Motor II e orquestrador de ponta a ponta (fixture, relógio fixado)
// ---------------------------------------------------------------------------

async function gerar(c: CenarioDoTesteDeLp) {
  const d = depsDoTesteDeLp(c, configSintetica());
  const r = await gerarDebriefing(d, PARAMS_DO_TESTE_DE_LP);
  expect(r.status).toBe(200);
  const body = r.body as { html: string; payload: DebriefingPayload };
  expect(d.gravados[0]!.html).toBe(body.html);
  return { html: body.html, payload: body.payload };
}
const teste = (p: DebriefingPayload): TesteDeLp => {
  expect(p.publico.testeDeLp).toBeDefined();
  return p.publico.testeDeLp!;
};
function bloco(html: string): string {
  const i = html.indexOf(`<section ${MARCA_DO_TESTE_DE_LP}>`);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf("</section>", i) + "</section>".length);
}
function semO4919(html: string): string {
  return html.replace(bloco(html), "");
}
function secoesPorTitulo(html: string): Map<string, string> {
  return new Map([...html.matchAll(/<section[^>]*data-secao="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((m) => [m[1]!.replace(/&amp;/g, "&"), m[0]]));
}
const parDoBloco = (html: string, lps: string) => {
  const b = bloco(html);
  const i = b.indexOf(`data-par-de-lp="${lps}"`);
  expect(i, lps).toBeGreaterThan(-1);
  return b.slice(i, b.indexOf("</div>", b.indexOf("Mesmo criativo", i)) + 6);
};

describe("Motor II e gerarDebriefing — ponta a ponta (final e parcial)", () => {
  it("final: LPG vence LPA no vídeo (6 dias, p = 0,0037); a LPA, pior, leva 60% da verba", async () => {
    const { payload } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    const t = teste(payload);
    const p = par(t, "LPA×LPG");
    expect(p.janela.dias).toEqual(["2026-04-19", "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24"]);
    expect(p.fisher!.tabela).toEqual([
      [2, 286],
      [14, 274],
    ]);
    expect(p.fisher!.pValor).toBeCloseTo(fisherExatoBilateral(2, 286, 14, 274).pValor, 15);
    expect([p.resultado, p.vencedora, p.verbaInvertida]).toEqual(["veredito", "LPG", true]);
    // investimento c/ imposto do Loyola (gross-up 12,15%, R11-0c): 4 Ad IDs × 6 dias × R$ 30 e × R$ 20
    expect(p.lados[0].investimentoComImposto).toBeCloseTo(4 * 6 * 30 * FATOR, 9);
    expect(p.lados[1].investimentoComImposto).toBeCloseTo(4 * 6 * 20 * FATOR, 9);
    expect(p.lados.map((l) => l.pctDaVerba.valor)).toEqual([60, 40].map((v) => expect.closeTo(v, 9)));
    // o comprador do combo (LPG, 19/04) leva o tier e o faturamento dele
    expect(p.lados[1].tierSuperior.valor).toBeCloseTo(1 / 14, 12);
    expect(p.lados[1].faturamento).toBe(13 * 99 + 297);
    expect(p.mesmoCriativo.map((c) => [c.nome, c.porLp.map((x) => [x.lp, x.compras, x.landingPageViews])])).toEqual([
      [ANUNCIOS_DO_VIDEO[0], [["LPA", 1, 144], ["LPG", 10, 144]]],
      [ANUNCIOS_DO_VIDEO[1], [["LPA", 1, 144], ["LPG", 4, 144]]],
    ]);
  });

  it("final: LPF × LPH com 3 dias em comum (com intervalo) → há leitura; o resto sem par, com o motivo; a campanha sem LP contada", async () => {
    const { payload } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    const t = teste(payload);
    const fh = par(t, "LPF×LPH");
    expect(fh.janela.dias).toEqual(["2026-04-20", "2026-04-21", "2026-04-23"]);
    expect([fh.resultado, fh.formato]).toEqual(["empate", "estatico"]);
    // R12-6: a LPA estática (3 conjuntos) pareia com LPF e LPH nos 2 em comum; o 3º fica fora.
    const af = par(t, "LPA×LPF");
    expect(af.conjuntos).toEqual(["01_QUENTE-30D", "02_LISTAS"]);
    expect(af.conjuntosForaDoPar).toEqual([{ lp: "LPA", conjuntos: ["03_INTERESSES"] }]);
    // o comprador do 03_INTERESSES (19/04) não entra; o investimento é o dos 2 conjuntos
    expect(af.lados[0].compradores).toBe(0);
    expect(af.lados[0].investimentoComImposto).toBeCloseTo(2 * 2 * 7 * 10 * FATOR, 9);
    expect(t.semPar.map((g) => [g.lp, g.maisProxima, g.diferencas])).toEqual([
      ["LPB", "LPA", ["anuncios"]],
      ["LPD", "LPA", ["anuncios"]],
    ]);
    expect(t.semLp.campanhas).toBe(1);
    expect(t.semLp.nomes).toEqual([CAMP_LP.semLp]);
    expect(t.semLp.investimentoComImposto).toBeCloseTo(2 * 20 * FATOR, 9);
  });

  it("parcial (corte 21/04): o mesmo par vira empate em 3 dias (p = 0,1204) e o LPF × LPH, com 2 dias, sem leitura", async () => {
    const { payload } = await gerar(CENARIOS_DO_AC7["parcial-edicao-unica"]!);
    const t = teste(payload);
    const ag = par(t, "LPA×LPG");
    expect(ag.janela.dias).toEqual(["2026-04-19", "2026-04-20", "2026-04-21"]);
    expect(ag.fisher!.tabela).toEqual([
      [1, 143],
      [6, 138],
    ]);
    expect([ag.resultado, ag.verbaInvertida]).toEqual(["empate", true]);
    expect(ag.fisher!.pValor).toBeCloseTo(0.1204, 4);
    const fh = par(t, "LPF×LPH");
    expect([fh.janela.dias.length, fh.resultado, fh.motivoSemLeitura]).toEqual([2, "sem-leitura", "MENOS_DE_3_DIAS"]);
  });

  it("vendas sem utm_content → todos os pares sem leitura (o Motor II repassa a falta)", () => {
    const p = payloadDoTesteDeLp(configSintetica(), { semConteudo: true });
    const t = teste(p);
    expect(t.vendasComConteudo).toBe(false);
    expect(t.pares).toHaveLength(4);
    expect(t.pares.every((x) => x.motivoSemLeitura === "SEM_UTM_CONTENT_NA_VENDA")).toBe(true);
  });

  it("linhas sem adset_name (loader anterior) → nenhum par: os conjuntos não são identificados", () => {
    const t = teste(payloadDoTesteDeLp(configSintetica(), { semConjunto: true }));
    expect(t.pares).toEqual([]);
    expect(t.semPar.every((g) => g.conjuntos === null && g.diferencas.includes("conjuntos"))).toBe(true);
  });

  it("sem ad-level: o bloco declara a lacuna (nunca tabela de zeros)", async () => {
    const { html, payload } = await gerar(CENARIOS_DO_AC7["final-sem-ad-level"]!);
    expect(teste(payload)).toMatchObject({ aplicavel: false, motivo: "SEM_AD_LEVEL" });
    expect(bloco(html)).toContain("sem ad-level no banco para o período");
    expect(bloco(html)).not.toContain("<table");
  });
});

// ---------------------------------------------------------------------------
// Render a partir do payload completo
// ---------------------------------------------------------------------------

describe("render — o bloco Teste de LP a partir do payload", () => {
  it("o veredito com o p-valor, a verba invertida, o mesmo criativo e o sem par", async () => {
    const { html } = await gerar(CENARIOS_DO_AC7["final-edicao-unica"]!);
    const ag = parDoBloco(html, "LPA×LPG");
    expect(ag).toContain('data-resultado="veredito"');
    expect(ag).toContain('<b style="color:var(--green)">Veredito:</b> LPG vence LPA em compras ÷ visitas (4,86% × 0,69%; Fisher exato bilateral, p = 0,0037 &lt; 0,05).');
    expect(ag).toMatch(/data-p-valor="0\.00370\d+"/);
    expect(ag).toContain("data-verba-invertida");
    expect(ag).toContain("(LPA, 0,69%) recebe a maior parcela da verba do par (60,00%).");
    expect(ag).toContain("19/04 a 24/04 (6 dia(s) em que as duas tiveram investimento)");
    // compras ÷ visitas de cada LP na tabela e o mesmo criativo
    expect(ag).toContain("0,69%");
    expect(ag).toContain("4,86%");
    expect(ag).toContain(
      '<td>adv01--claude</td><td>0,69% <span style="color:var(--muted);font-size:11px">(1 / 144)</span></td><td>6,94% <span style="color:var(--muted);font-size:11px">(10 / 144)</span></td>',
    );
    const fh = parDoBloco(html, "LPF×LPH");
    expect(fh).toContain('data-resultado="empate"');
    expect(fh).toContain('<b style="color:var(--gold)">Empate, segue rodando:</b> LPF 1,67% × LPH 1,67%');
    expect(fh).not.toContain("data-verba-invertida");
    const b = bloco(html);
    expect(b).toMatch(/data-sem-lp>Sem código de LP no nome: <b>1<\/b> campanha\(s\), <b>R\$\s45,53<\/b>/);
    expect(b).toContain("Campanhas com LP fora de par");
    expect(b).toContain("que difere em nomes de anúncio");
    expect(parDoBloco(html, "LPA×LPF")).toContain("<span data-conjuntos-fora-do-par>Fora do par (sem o mesmo conjunto na outra LP): LPA: 03_INTERESSES.</span>");
    expect(parDoBloco(html, "LPA×LPG")).not.toContain("data-conjuntos-fora-do-par");
  });

  it("parcial: sem leitura com o motivo e a nota do corte", async () => {
    const { html } = await gerar(CENARIOS_DO_AC7["parcial-edicao-unica"]!);
    const fh = parDoBloco(html, "LPF×LPH");
    expect(fh).toContain('data-resultado="sem-leitura"');
    expect(fh).toContain('<b style="color:var(--red)">Sem leitura:</b> a janela comum tem 2 dia(s), menos que os 3 do método.');
    expect(fh).not.toContain("data-p-valor");
    expect(bloco(html)).toContain("<b>Parcial:</b> dados até 21/04/26 (D+4)");
    expect(parDoBloco(html, "LPA×LPG")).toContain("Empate, segue rodando");
  });

  it("o bloco entra na aba de mídia, logo depois da Mídia por Anúncio e antes de Vendas do Principal, fora da numeração", async () => {
    for (const c of [CENARIOS_DO_AC7["final-edicao-unica"]!, CENARIOS_DO_AC7["parcial-edicao-unica"]!]) {
      const { html } = await gerar(c);
      const aba = html.split('id="tab-midia"')[1]!.split('<div class="tab')[0]!;
      const iMidia = aba.indexOf(`<section ${MARCA_DA_MIDIA_POR_ANUNCIO}>`);
      const iBloco = aba.indexOf(`<section ${MARCA_DO_TESTE_DE_LP}>`);
      const iVendas = aba.indexOf('data-secao="Vendas do Principal"');
      expect(iMidia).toBeGreaterThan(-1);
      expect(iBloco).toBeGreaterThan(iMidia);
      expect(aba.slice(iMidia, iBloco).match(/<section/g)).toHaveLength(1);
      expect(iVendas).toBeGreaterThan(iBloco);
      expect(bloco(html)).not.toContain("sec-num");
      const nums = [...html.matchAll(/<span class="sec-num">(\d{2})<\/span>/g)].map((m) => m[1]);
      expect(nums).toEqual(SECOES_DO_DEBRIEFING.map((_, i) => String(i).padStart(2, "0")));
    }
  });

  it("a coluna Compras é a do Fisher (compradores de anúncios com landing_page_view), não o total de compradores", () => {
    const p = payloadDoTesteDeLp(configSintetica());
    const ag = p.publico.testeDeLp!.pares.find((x) => x.lps.join("×") === "LPA×LPG")!;
    ag.lados[0].compradores = 99;
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(parDoBloco(html, "LPA×LPG")).toContain("<td><b>LPA</b></td><td>R$ 819,58</td><td>60,0%</td><td>288</td><td>2</td><td>0,69%</td>");
  });

  it("payload salvo antes da 49.19 (sem o campo): o bloco diz que não foi calculado", () => {
    const p = payloadDoTesteDeLp(configSintetica());
    delete p.publico.testeDeLp;
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(bloco(html)).toContain("Teste de LP não calculado");
  });

  it("sem nenhum par: a nota diz que não há teste a ler", () => {
    const p = payloadDoTesteDeLp(configSintetica(), { semConjunto: true });
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(bloco(html)).toContain("Nenhum par de LPs com o mesmo formato, os mesmos anúncios e os mesmos conjuntos");
    expect(bloco(html)).not.toContain("data-par-de-lp");
  });
});

// ---------------------------------------------------------------------------
// AC7 — vale no parcial e no final; o resto do documento não muda
// ---------------------------------------------------------------------------

/**
 * SHA-256 medidos na `main` `ec990ad0` (com a 49.20 mergeada; antes, `f2cf6f1e` e `a1d8d121`),
 * com esta mesma fixture e o mesmo relógio, por um `.test.ts` temporário sobre uma cópia
 * (`git archive`) da main: o HTML INTEIRO e o payload. Na story, o HTML sem o bloco da
 * 49.19 e o payload sem `publico.testeDeLp` dão os MESMOS SHA — cabeçalho, avisos, resumo
 * macro (com a pesquisa por pergunta da 49.20), as 18 seções (com a recompra por origem),
 * a Mídia por Anúncio, o rodapé e o `const D` incluídos.
 */
const SHA_DO_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "b9414cd434fb707e1135c097563aa1abf663f856007a970dc1be34a949cb9dd2", payload: "200c4223b98bb37224011729d4a64d1285dd154b965e3a6447d4c9ecaae24197" },
  "final-comparacao-recalculada": { html: "9944b899277f7d840639ec0476c9e66bf1c662b0940de1b1e484e4fadb4f1f2b", payload: "ea7381ee8983383ea17747a9b5fc00f2175bbce493e016b26c6f2ac0abf431c1" },
  "final-comparacao-salva-antiga": { html: "872f9a04b617fb2140d6405a1a63d2534763c014ef47d3710c5b1737c9c941ab", payload: "5fb55b39e18ed30783e522313b423033ae8e1e28056c91c487cdaa0516d80d6b" },
  "parcial-edicao-unica": { html: "c2a43b091f0bf033bcc3328cda0789010a0c3f0a7666b16a116cfe83f7320c14", payload: "e2140e53788975b723f9b23d94056a751a0ab698d555cc3a5b5d93336c2c645a" },
  "parcial-comparacao-recalculada": { html: "7c4148a4a5d0a533e77c35ea922ad3d6268842df1fe0bdb7d7ddc51b4c06f2e5", payload: "86312ffe69b23858cd2f4b9abe06b33267ed1e32e1149ab0c5794af6e7c747a5" },
  "parcial-comparacao-salva": { html: "3d71987d40c8c781a8251190dc3cf04c602e2bcfbf7a510113a33c3db7a10c67", payload: "5493446e909479ebee346bf5e1721ea24e08709a6730167413292b5623fbb787" },
  "final-sem-ad-level": { html: "b14a62917c7b53776d7f353db81adaf0307306772d917ae0614c348128d32fb9", payload: "39b8e3f5b3bbc5d92972e1ad4534b327645d58358f5b10b4ae3ad4a01f654ffb" },
};

describe("AC7 — vale no parcial e no final; o resto do documento não muda", () => {
  it.each(Object.keys(CENARIOS_DO_AC7))("%s: HTML inteiro sem o bloco e payload sem o campo novo = os do commit-base", async (nome) => {
    const { html, payload } = await gerar(CENARIOS_DO_AC7[nome]!);
    expect(sha(html)).not.toBe(SHA_DO_BASE[nome]!.html);
    expect(sha(semO4919(html))).toBe(SHA_DO_BASE[nome]!.html);
    const p = structuredClone(payload);
    expect(p.publico.testeDeLp).toBeDefined();
    delete p.publico.testeDeLp;
    expect(sha(JSON.stringify(p))).toBe(SHA_DO_BASE[nome]!.payload);
  });

  it("por título: as 18 seções iguais com e sem o campo novo, no final e no parcial, com comparação", async () => {
    for (const c of [CENARIOS_DO_AC7["final-comparacao-recalculada"]!, CENARIOS_DO_AC7["parcial-comparacao-recalculada"]!]) {
      const d = depsDoTesteDeLp(c, configSintetica());
      await gerarDebriefing(d, PARAMS_DO_TESTE_DE_LP);
      const novo = d.gravados[0]!.payload;
      const antigo = structuredClone(novo);
      delete antigo.publico.testeDeLp;
      const rot = { ...ROT, funis: { "20000000-0000-4000-8000-000000000002": "PG04" } };
      const comp = { funnelId: "20000000-0000-4000-8000-000000000002", nome: "PG04", payload: novo, origem: { tipo: "recalculada" as const } };
      const hn = secoesPorTitulo(renderDebriefing({ payload: novo, comparacao: comp, rotulos: rot, alertas: [] }));
      const ha = secoesPorTitulo(renderDebriefing({ payload: antigo, comparacao: { ...comp, payload: antigo }, rotulos: rot, alertas: [] }));
      expect([...hn.keys()]).toEqual([...SECOES_DO_DEBRIEFING]);
      for (const t of SECOES_DO_DEBRIEFING) expect(hn.get(t), t).toBe(ha.get(t));
    }
  });
});
