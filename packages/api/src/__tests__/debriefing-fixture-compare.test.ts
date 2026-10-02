/**
 * Story 49.5 AC7/AC8 — fixtures de regressão e o comparador com a separação do
 * fator de imposto. Os testes (a)–(g) do AC8 rodam sobre fixtures SINTÉTICAS
 * (construídas a partir do payload dos motores reais), não sobre o §8 real.
 */

import { describe, expect, it } from "vitest";
import {
  CAMPOS_COMPARAVEIS,
  SEM_CAMPO_EQUIVALENTE,
  compararComFixture,
  fatorK,
  toleranciaDaClasse,
  type FixtureDeDebriefing,
  type MetricaDaFixture,
} from "../services/debriefing-fixture-compare.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import { aplicarImposto } from "../services/debriefing-hygiene.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { payloadMinimo } from "./fixtures/debriefing-payload-sintetico.js";
import dgPg01 from "./fixtures/debriefing/danilo-gato-pg01.js";
import dgPg02 from "./fixtures/debriefing/danilo-gato-pg02.js";
import dgPg04 from "./fixtures/debriefing/danilo-gato-pg04.js";
import dgPg02Loyola from "./fixtures/debriefing/danilo-gato-pg02-loyola.js";
import fzL1 from "./fixtures/debriefing/fernanda-zapparolli-l1.js";
import fzL2 from "./fixtures/debriefing/fernanda-zapparolli-l2.js";
import netao from "./fixtures/debriefing/netao-bbe-pr1.js";

const FIXTURES: FixtureDeDebriefing[] = [dgPg01, dgPg02, dgPg04, fzL1, fzL2, netao, dgPg02Loyola];
const FATOR_SKILL = 1.13;

// ---------------------------------------------------------------------------
// AC7 — formato
// ---------------------------------------------------------------------------

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => strings(v, out));
  return out;
}

describe("AC7 — formato das 7 fixtures", () => {
  it("6 de comparação (skill) e 1 governante (Loyola/Epic 41)", () => {
    expect(FIXTURES).toHaveLength(7);
    expect(FIXTURES.filter((f) => f.oraculo.papel === "comparacao").map((f) => f.lancamento).sort()).toEqual(
      ["BBE-PR1", "DG-PG01", "DG-PG02", "DG-PG04", "FZ-L1-FEV26", "FZ-L2-JUN26"],
    );
    const gov = FIXTURES.filter((f) => f.oraculo.papel === "governante");
    expect(gov.map((f) => [f.id, f.oraculo.id, f.fatorImpostoDaFonte])).toEqual([["dg-pg02-loyola", "loyola-epic41", "loyola"]]);
  });

  it.each(FIXTURES.map((f) => [f.id, f]))("%s: papel do oráculo, mapeamento, unidade e origem válidos", (_id, f) => {
    expect(f.oraculo.papel).toBe(f.oraculo.id === "loyola-epic41" ? "governante" : "comparacao");
    expect(f.oraculo.janela.de <= f.oraculo.janela.ate).toBe(true);
    const chaves = f.metricas.map((m) => m.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const m of f.metricas) {
      expect(Number.isFinite(m.valor), m.chave).toBe(true);
      expect(m.origem, m.chave).toMatch(/§/);
      if (m.mapeamento === SEM_CAMPO_EQUIVALENTE) continue;
      const campo = CAMPOS_COMPARAVEIS[m.mapeamento];
      expect(campo, `${f.id}/${m.chave} → ${m.mapeamento}`).toBeDefined();
      expect(campo!.unidade, `${f.id}/${m.chave}`).toBe(m.unidade);
      if (m.classe === "custo" || m.classe === "dinheiro") expect(m.unidade).toBe("BRL");
      if (m.classe === "razao-de-custo") expect(m.unidade).toBe("razao");
      if (m.classe === "volume") expect(m.unidade).toBe("contagem");
    }
    for (const d of f.divergenciasClassificadas ?? []) {
      expect(chaves).toContain(d.chave);
      expect(["fonte-janela", "definicao", "bug"]).toContain(d.causa);
      expect(d.classificadaPor.length).toBeGreaterThan(0);
    }
  });

  it.each(FIXTURES.map((f) => [f.id, f]))("%s: só números — nenhuma string com @ ou 8+ dígitos seguidos (LGPD)", (_id, f) => {
    for (const s of strings(f)) {
      expect(s).not.toMatch(/@/);
      expect(s).not.toMatch(/\d{8,}/);
    }
  });

  it("o Netão declara o custo do evento como SEM_CAMPO_EQUIVALENTE (fora da comparação, listado)", () => {
    const sem = netao.metricas.filter((m) => m.mapeamento === SEM_CAMPO_EQUIVALENTE).map((m) => m.chave);
    expect(sem).toEqual(expect.arrayContaining(["custosFixosEventoMaisMidia", "lucroLiquidoCheio", "recebidoPrincipal"]));
    const r = compararComFixture(payloadMinimo(), netao);
    expect(r.semCampoEquivalente.map((s) => s.chave)).toEqual(sem);
    expect(r.linhas.map((l) => l.chave)).not.toContain("custosFixosEventoMaisMidia");
  });

  it("governante do PG02: valores da Correção 41.10 e as divergências de camada 2 classificadas como definição (até a 41.12 fatia A)", () => {
    const v = Object.fromEntries(dgPg02Loyola.metricas.map((m) => [m.chave, m.valor]));
    expect(v).toMatchObject({
      vendas: 2197,
      vendasCaptacao: 1900,
      vendasOrderBump: 297,
      ingressosUnicos: 1807,
      faturamentoTotal: 231097.94,
      faturamentoCaptacao: 198736.4,
      faturamentoOrderBump: 32361.54,
      investimentoCaptacao: 126566.14,
      vendasPrincipal: 71,
      faturamentoPrincipal: 245800,
      faturamentoDownsell: 20714.4,
    });
    // A4 da 41.10: captação + bump = total, ao centavo.
    expect(Math.abs(v.faturamentoCaptacao! + v.faturamentoOrderBump! - v.faturamentoTotal!)).toBeLessThan(0.005);
    expect(dgPg02Loyola.datasChave).toEqual({
      inicioCaptacao: "2026-04-16",
      aberturaCarrinho: "2026-05-09",
      fimCarrinho: "2026-05-27",
      downsell: { abertura: "2026-06-03", fim: "2026-06-13" },
    });
    const classificadas = (dgPg02Loyola.divergenciasClassificadas ?? []).map((d) => [d.chave, d.causa]);
    expect(classificadas).toEqual(
      ["vendas", "vendasCaptacao", "vendasOrderBump", "faturamentoTotal", "faturamentoCaptacao", "faturamentoOrderBump"].map((c) => [c, "definicao"]),
    );
  });

  it("INFO-001: closer no principal e ROAS só ingresso do PG02 (skill) classificados como definição, não falha", () => {
    const c = Object.fromEntries((dgPg02.divergenciasClassificadas ?? []).map((d) => [d.chave, d.causa]));
    expect(c).toEqual({ closerPrincipal: "definicao", roasSoIngresso: "definicao" });
  });

  it("todas as fixtures mapeiam para campos que o comparador conhece (roda sem lançar)", () => {
    const p = payloadMinimo();
    for (const f of FIXTURES) {
      const r = compararComFixture(p, f);
      expect(r.linhas.length + r.semCampoEquivalente.length).toBe(f.metricas.length);
      if (f.oraculo.papel === "comparacao") expect(r.bloqueiaConferencia).toBe(false);
    }
  });

  it("oráculo da skill rotulado governante é recusado (decisão 1)", () => {
    expect(() => compararComFixture(payloadMinimo(), { ...dgPg02, oraculo: { ...dgPg02.oraculo, papel: "governante" } })).toThrow(/sempre "comparacao"/);
  });

  it("fixture antes do corte do gross-up (BF25) é recusada: K não vale", () => {
    const bf = { ...dgPg02, oraculo: { ...dgPg02.oraculo, janela: { de: "2025-10-20", ate: "2025-12-01" } } };
    expect(() => compararComFixture(payloadMinimo(), bf)).toThrow(/antes do corte/);
  });
});

// ---------------------------------------------------------------------------
// AC8 — separação do imposto
// ---------------------------------------------------------------------------

const metrica = (over: Partial<MetricaDaFixture> & Pick<MetricaDaFixture, "chave" | "valor" | "classe" | "unidade" | "mapeamento">): MetricaDaFixture => ({
  origem: "sintética §teste linha 'x'",
  ...over,
});

const fixtureSkill = (metricas: MetricaDaFixture[], papel: "comparacao" | "governante" = "comparacao"): FixtureDeDebriefing => ({
  id: "sintetica",
  expert: "teste",
  lancamento: "T",
  oraculo: {
    id: papel === "governante" ? "loyola-epic41" : "skill-export-cru",
    papel,
    fonte: "sintética",
    janela: { de: "2026-04-17", ate: "2026-06-30" },
    reconferidoEm: "2026-10-02",
  },
  fatorImpostoDaFonte: papel === "governante" ? "loyola" : FATOR_SKILL,
  metricas,
});

/** O custo que a SKILL teria publicado para este payload: spend cru × fator fixo. */
function custoDaSkill(p: DebriefingPayload): number {
  return p.dinheiroTempo.midia.porGrupo.captacao.investimentoBruto * FATOR_SKILL;
}

describe("AC8 — separação do fator de imposto", () => {
  it("(a) com impostoPct 0,1215 e fonte ×1,13, K = 1,0073486 ± 1e-6; fonte Loyola ⇒ K = 1", () => {
    expect(Math.abs(fatorK(0.1215, FATOR_SKILL) - 1.0073486)).toBeLessThan(1e-6);
    expect(fatorK(0.1215, "loyola")).toBe(1);
  });

  it("(a) o impostoPct vem do PAYLOAD, nunca de constante do comparador", () => {
    const p = payloadMinimo();
    p.dinheiroTempo.imposto.impostoPct = 0.2;
    const r = compararComFixture(p, fixtureSkill([]));
    expect(r.impostoPct).toBe(0.2);
    expect(r.K).toBeCloseTo(1.25 / FATOR_SKILL, 12);
  });

  it("(b) custo do payload = esperado × K sai ok-explicada-por-imposto", () => {
    const p = payloadMinimo();
    const esperado = custoDaSkill(p);
    const r = compararComFixture(p, fixtureSkill([metrica({ chave: "inv", valor: esperado, classe: "custo", unidade: "BRL", mapeamento: "investimentoCaptacao" })]));
    expect(r.linhas[0]!.status).toBe("ok-explicada-por-imposto");
    expect(Math.abs(r.linhas[0]!.esperadoAjustado - p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto)).toBeLessThan(0.01);
  });

  it("(c) ROAS do payload = esperado ÷ K também", () => {
    const p = payloadMinimo();
    const fat = p.dinheiroTempo.captacao.faturamentoCaptacao.valor!;
    const roasDaSkill = fat / custoDaSkill(p);
    const r = compararComFixture(p, fixtureSkill([metrica({ chave: "roas", valor: roasDaSkill, classe: "razao-de-custo", unidade: "razao", mapeamento: "roasCaptacao" })]));
    expect(r.linhas[0]!.status).toBe("ok-explicada-por-imposto");
  });

  it("(d) volume com 1 unidade de diferença sai diverge — K não absolve volume", () => {
    const p = payloadMinimo();
    const r = compararComFixture(p, fixtureSkill([
      metrica({ chave: "imp", valor: p.dinheiroTempo.midia.porGrupo.captacao.impressoes + 1, classe: "volume", unidade: "contagem", mapeamento: "impressoesCaptacao" }),
      // Diferença que o K "explicaria" se fosse aplicado a volume: continua diverge.
      metrica({ chave: "imp-k", valor: p.dinheiroTempo.midia.porGrupo.captacao.impressoes / fatorK(0.1215, FATOR_SKILL), classe: "volume", unidade: "contagem", mapeamento: "impressoesCaptacao" }),
    ]));
    expect(r.linhas.map((l) => l.status)).toEqual(["diverge", "diverge"]);
    expect(toleranciaDaClasse("volume")).toBe(0);
  });

  it("(e) motor que usasse o ×1,13 da skill no lugar do gross-up produz custo = esperado ORIGINAL e é marcado diverge", () => {
    const p = payloadMinimo();
    const esperado = custoDaSkill(p);
    // O motor errado: investimento com imposto = bruto × 1,13.
    p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto = esperado;
    const r = compararComFixture(p, fixtureSkill([metrica({ chave: "inv", valor: esperado, classe: "custo", unidade: "BRL", mapeamento: "investimentoCaptacao" })]));
    expect(r.linhas[0]!.status).toBe("diverge");
    expect(r.linhas[0]!.nota).toMatch(/fator de imposto da FONTE/);
  });

  it("(f) motor que aplicasse os dois (gross-up E ×1,13) sai diverge — e o F12 falha antes", () => {
    const p = payloadMinimo();
    const esperado = custoDaSkill(p);
    const m = p.dinheiroTempo.midia;
    for (const d of m.midiaDiariaPorEtapa) d.comImposto = aplicarImposto(d.bruto, d.dia, 0.1215) * FATOR_SKILL;
    for (const ag of [...Object.values(m.porEtapa), ...Object.values(m.porGrupo)]) {
      ag.investimentoComImposto *= FATOR_SKILL;
      for (const k of ["INV", "INV_QUENTE", "INV_FRIO", "INV_INDEFINIDO"] as const) ag.quenteFrio[k] *= FATOR_SKILL;
    }
    const r = compararComFixture(p, fixtureSkill([metrica({ chave: "inv", valor: esperado, classe: "custo", unidade: "BRL", mapeamento: "investimentoCaptacao" })]));
    expect(r.linhas[0]!.status).toBe("diverge");
    expect(validateDebriefing(p).invariantes.find((i) => i.codigo === "F12")!.status).toBe("failed");
  });

  it("(g) diverge contra qualquer oráculo NÃO bloqueia o validateDebriefing; só a governante sem classificação falha a conferência", () => {
    const p = payloadMinimo();
    const errado = [metrica({ chave: "vp", valor: 999, classe: "volume", unidade: "contagem", mapeamento: "vendasPrincipal" })];
    const skill = compararComFixture(p, fixtureSkill(errado));
    expect(skill.linhas[0]!.status).toBe("diverge");
    expect(skill.bloqueiaConferencia).toBe(false);
    const gov = compararComFixture(p, fixtureSkill(errado, "governante"));
    expect(gov.bloqueiaConferencia).toBe(true);
    expect(gov.divergenciasNaoClassificadas).toEqual(["vp"]);
    const govClassificada = compararComFixture(p, {
      ...fixtureSkill(errado, "governante"),
      divergenciasClassificadas: [{ chave: "vp", causa: "fonte-janela", nota: "teste", classificadaPor: "@qa", data: "2026-10-02" }],
    });
    expect(govClassificada.linhas[0]!.status).toBe("diverge");
    expect(govClassificada.linhas[0]!.classificacao?.causa).toBe("fonte-janela");
    expect(govClassificada.bloqueiaConferencia).toBe(false);
    expect(validateDebriefing(p).bloqueado).toBe(false);
  });

  it("governante (K = 1): custo igual ao do Loyola sai ok; dinheiro e taxa na tolerância da classe", () => {
    const p = payloadMinimo();
    const g = p.dinheiroTempo;
    const r = compararComFixture(p, fixtureSkill([
      metrica({ chave: "inv", valor: g.midia.porGrupo.captacao.investimentoComImposto, classe: "custo", unidade: "BRL", mapeamento: "investimentoCaptacao" }),
      metrica({ chave: "fat", valor: g.captacao.faturamentoCaptacao.valor! + 0.009, classe: "dinheiro", unidade: "BRL", mapeamento: "faturamentoCaptacao" }),
      metrica({ chave: "tx", valor: Math.round(g.conversaoIngressoPrincipal.valor! * 10000) / 100, classe: "taxa-de-volume", unidade: "pct", mapeamento: "conversaoIngressoPrincipal" }),
    ], "governante"));
    expect(r.K).toBe(1);
    expect(r.linhas.map((l) => l.status)).toEqual(["ok", "ok", "ok"]);
  });
});
