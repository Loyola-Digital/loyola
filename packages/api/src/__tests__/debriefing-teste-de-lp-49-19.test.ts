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

  it("conjuntos diferentes (um a menos) → sem par", () => {
    const t = computeTesteDeLp(entrada([{ id: "a", nome: VID("lpa"), ...base }, { id: "g", nome: VID("lpg"), ...base, conjuntos: ["01_QUENTE"] }]));
    expect(t.pares).toEqual([]);
    expect(t.semPar.map((g) => g.diferencas)).toEqual([["conjuntos"], ["conjuntos"]]);
    expect(t.semPar[0]!.texto).toContain("nomes de conjunto");
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
    expect(t.semPar.map((g) => [g.lp, g.maisProxima, g.diferencas])).toEqual([
      ["LPA", "LPF", ["conjuntos"]],
      ["LPB", "LPA", ["anuncios"]],
      ["LPD", "LPA", ["formato"]],
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
    expect(t.pares.map((x) => x.motivoSemLeitura)).toEqual(["SEM_UTM_CONTENT_NA_VENDA", "SEM_UTM_CONTENT_NA_VENDA"]);
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
    expect(b).toContain("que difere em nomes de conjunto");
    expect(b).toContain("que difere em nomes de anúncio");
    expect(b).toContain("que difere em formato");
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
 * SHA-256 medidos no commit-base `a1d8d121` (a 49.18), com esta mesma fixture e
 * o mesmo relógio, pelo script `ac7-4919.mts` (scratchpad): o HTML INTEIRO e o
 * payload. Na story, o HTML sem o bloco da 49.19 e o payload sem
 * `publico.testeDeLp` dão os MESMOS SHA — cabeçalho, avisos, resumo macro, as 18
 * seções, a Mídia por Anúncio, o rodapé e o `const D` incluídos.
 */
const SHA_DO_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "12268e10baf2edd25d001b0e310aeefea47833bbdf08cdb081916bed51d790f0", payload: "7b1f46048e9c03fa31f902b9eb70ed35180a3ef7d6fb055c214c8de7ecb6d230" },
  "final-comparacao-recalculada": { html: "6cdc6ca02e9a94af3bbfc8fc2af05414ce56e99af2239c166caf773d5a8b0354", payload: "f2ad5259ba8007019e6ef5c03119494a147841fdbb8b673304ec6e895162d3c8" },
  "final-comparacao-salva-antiga": { html: "8901136820dea800fcc60fac47f1b9e693aa2d9e18fee6344639171ca3af139d", payload: "f8def5d1709bbccdf9a6dc58e01956de3aaed38ac63fc1d663327424f404fdd3" },
  "parcial-edicao-unica": { html: "41244a6ce6fcb2e49f79a53b7dba9e0e16ecf0a0190619b20451a8b0429ef823", payload: "5ea771f17779dbd404fb18bf8af78c54c4de1f87e882e1e84369edf89c21a708" },
  "parcial-comparacao-recalculada": { html: "02c42a9d83622f7f02557e938abc0b5b6de6292e22f4c52c1aafbf2d8a76dfca", payload: "7442f6bb767838119d0edc8ef1445d664e644efef496fa9648ff99851529de8e" },
  "parcial-comparacao-salva": { html: "f2013b990312b68836e0e826277ebd72ddc694170dd50f6d2867d37465497c0c", payload: "c20a465495886b49f8003e22e511171152cb083793dcad29504453aa19b93604" },
  "final-sem-ad-level": { html: "e34894d9e273929235ce153d20c46d677587b61daee33495db4437fc2f5b966b", payload: "a1b79e3e9aadeb1a485414ea73e39c3aeb3c4df33764b0a3c63a28ecb64bf950" },
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
