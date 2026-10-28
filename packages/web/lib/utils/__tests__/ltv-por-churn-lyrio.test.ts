import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  FAIXAS,
  alertasDoLtvCac,
  arpuDoOverview,
  calcularLtvPorChurn,
  cardsDoLtvPorChurn,
  churnDasConsultas,
  decimosDaRelacao,
  faixaDaRelacao,
  fmtRelacao,
  margemDosPercentuais,
  relacaoLtvCac,
  type ArpuMensal,
  type ChurnMensal,
  type EntradaDoLtvPorChurn,
  type MargemMensal,
} from "../ltv-por-churn-lyrio";
import { ALERTA_DO_CAC_SO_MIDIA } from "../aquisicao-lyrio";
import { fmtBRL, percentuaisDaConfig, type CardDoResumo } from "../resumo-mobile-lyrio";
import { estadoDaFonte } from "../estado-da-fonte-revenuecat";

/**
 * Story 42.15 (AC10) — LTV sobre margem por churn, LTV/CAC, CAC máximo, faixas
 * e alertas. "Hoje" fixo em 28/10/2026: o churn de 30 dias vai de 29/09 a 28/10.
 *
 * Valores de referência escolhidos para a conta fechar à mão: MRR US$ 600, 120
 * assinaturas, câmbio 5 → ARPU R$ 25,00; margem 100 − 15 − 4 − 1 = 80%; churn
 * 13 ÷ 520 = 2,5% → tempo de vida 40 meses; LTV = 25 × 80% ÷ 2,5% = R$ 800,00.
 */
const ARPU: ArpuMensal = { periodo: "mensal", mrrUsd: 600, assinaturasAtivas: 120 };
const MARGEM: MargemMensal = { periodo: "mensal", platformFeePct: 15, taxPct: 4, otherCostsPct: 1 };
const CHURN: ChurnMensal = {
  periodo: "mensal",
  dias: 30,
  desde: "2026-09-29",
  ate: "2026-10-28",
  expiracoesPagas: 13,
  assinaturasNoInicio: 520,
  diaDoChart: "2026-09-29",
  serieDesde: "2026-08-10",
};
const entrada = (p: Partial<EntradaDoLtvPorChurn> = {}): EntradaDoLtvPorChurn => ({
  ctx: { diasDoFiltro: 90, hoje: "2026-10-28", serieDesde: "2026-08-10" },
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
  arpu: { tipo: "pronto", dados: ARPU },
  margem: { tipo: "pronto", dados: MARGEM },
  churn: { tipo: "pronto", dados: CHURN },
  cac: { tipo: "pronto", centavos: 25000, investimentoCentavos: 250000, pessoas: 10 },
  ...p,
});
const textos = (c: CardDoResumo) => JSON.stringify([c.formula, c.secundarias]);

describe("AC10d — o LTV por churn com valores conhecidos", () => {
  it("ARPU 25, margem 80%, churn 2,5% → tempo de vida 40 meses e LTV R$ 800,00", () => {
    const r = calcularLtvPorChurn(ARPU, MARGEM, CHURN, 5);
    expect(r).toEqual({ tipo: "pronto", arpuBrl: 25, margemPct: 80, churn: 0.025, vidaMeses: 40, ltvBrl: 800 });
  });
  it("(b, PO-02) a margem é só a dos três percentuais: mudar o investimento não muda o LTV (a mídia entra uma vez, no CAC)", () => {
    const a = cardsDoLtvPorChurn(entrada()).ltv.valor;
    const b = cardsDoLtvPorChurn(entrada({ cac: { tipo: "pronto", centavos: 99900, investimentoCentavos: 999000, pessoas: 10 } })).ltv.valor;
    expect(a).toBe(fmtBRL(800));
    expect(b).toBe(a);
  });
  it("o memorial mostra os dados usados com a fonte, o churn com numerador e denominador, o tempo de vida e a conta substituída", () => {
    const c = cardsDoLtvPorChurn(entrada()).ltv;
    expect(c.valor).toBe(fmtBRL(800));
    const v = Object.fromEntries(c.formula!.values.map((x) => [x.label, String(x.value)]));
    expect(v["Expirações pagas"]).toBe("13");
    expect(v["Assinaturas pagas ativas em 29/09"]).toBe("520");
    expect(v["Churn mensal"]).toBe("13 ÷ 520 = 2,50%");
    expect(v["Tempo de vida"]).toBe("1 ÷ 2,50% = 40,00 meses");
    expect(v["Margem de contribuição"]).toBe("100% − 15,00% − 4,00% − 1,00% = 80,00%");
    expect(c.formula!.result).toBe(`(${fmtBRL(25)} × 80,00%) ÷ 2,50% = ${fmtBRL(800)}`);
    expect(c.formula!.values.map((x) => x.source).join(" ")).toContain("charts/actives");
    expect(c.formula!.period).toContain("churn de 29/09 a 28/10 (30 dias fixos");
    expect(c.declaracao).toMatchObject({ etiqueta: "30d fixo", destaque: true, segueOFiltro: false });
    expect(c.formula!.note).toContain("em UTC");
  });
});

describe("AC10e/f/g/k — a relação LTV/CAC, o CAC máximo e a faixa", () => {
  it("o exemplo de referência da instrução: LTV R$ 345,00 ÷ CAC R$ 125,00 → 2,8x, CAC máximo R$ 115,00, faixa de 1,0x a 2,9x", () => {
    const r = relacaoLtvCac(345, 125)!;
    expect(r.exibida).toBe("2,8x");
    expect(r.cacMaximoBrl).toBe(115);
    expect(FAIXAS[r.faixa].intervalo).toBe("de 1,0x a 2,9x");
  });
  const bordas: [number, string, number][] = [
    [0.94, "0,9x", 1],
    [0.96, "1,0x", 2],
    [2.94, "2,9x", 2],
    [2.96, "3,0x", 3],
    [5.04, "5,0x", 3],
    [5.06, "5,1x", 4],
  ];
  for (const [v, exibida, faixa] of bordas) {
    it(`${v} → ${exibida}, faixa ${faixa} (a faixa usa o valor exibido)`, () => {
      const d = decimosDaRelacao(v);
      expect(fmtRelacao(d)).toBe(exibida);
      expect(faixaDaRelacao(d)).toBe(faixa);
      expect(relacaoLtvCac(v * 100, 100)!).toMatchObject({ exibida, faixa });
    });
  }
  it("o arredondamento é UM só, à prova do ponto flutuante: 0,95 → 1,0x (o `toFixed` daria 0,9)", () => {
    expect(fmtRelacao(decimosDaRelacao(0.95))).toBe("1,0x");
    expect(fmtRelacao(decimosDaRelacao(2.95))).toBe("3,0x");
    // 2,95 vindo de uma conta (29 ÷ 10 + 0,05 = 2,9499999999999997): × 10 dá 29,499999999999996,
    // e o arredondamento ingênuo daria 2,9x (faixa 2) para um número que é 2,95 (3,0x, saudável)
    const doisNoventaECinco = 29 / 10 + 0.05;
    expect(fmtRelacao(decimosDaRelacao(doisNoventaECinco))).toBe("3,0x");
    expect(faixaDaRelacao(decimosDaRelacao(doisNoventaECinco))).toBe(3);
  });
  it("CAC igual a 0 (ou negativo) não vira divisão: a relação é `null`", () => {
    expect(relacaoLtvCac(100, 0)).toBeNull();
    expect(relacaoLtvCac(100, -1)).toBeNull();
    expect(relacaoLtvCac(Number.NaN, 10)).toBeNull();
  });
  it("o card: 800 ÷ 250 = 3,2x, saudável; CAC máximo R$ 266,67 e a faixa em segundo plano; ícone de alerta", () => {
    const c = cardsDoLtvPorChurn(entrada()).relacao;
    expect(c.valor).toBe("3,2x");
    expect(c.secundarias).toEqual([
      { id: "cac-maximo", rotulo: "CAC máximo (3:1):", valor: `pode pagar até ${fmtBRL(266.67)} por cliente novo mantendo 3:1` },
      { id: "faixa", rotulo: "de 3,0x a 5,0x:", valor: "Saudável. Cobre a aquisição e deixa lucro." },
    ]);
    expect(c.alerta).toBe(true);
    expect(c.formula!.result).toBe(`${fmtBRL(800)} ÷ ${fmtBRL(250)} = 3,2x`);
  });
  it("(e) o memorial declara as duas janelas: o LTV mensal e o CAC do filtro, com as datas", () => {
    const p = cardsDoLtvPorChurn(entrada()).relacao.formula!.period;
    expect(p).toContain("churn de 29/09 a 28/10");
    expect(p).toContain("CAC: últimos 90 dias (31/07 a 28/10)");
  });
});

describe("AC10i — os casos de '—', com a causa; o LTV/CAC e o CAC máximo herdam", () => {
  const causa = (e: EntradaDoLtvPorChurn) => {
    const { ltv, relacao } = cardsDoLtvPorChurn(e);
    return { ltv: ltv.valor, causaLtv: JSON.stringify(ltv.formula), relacao: relacao.valor, causaRelacao: JSON.stringify(relacao.formula), maximo: relacao.secundarias?.[0]?.valor };
  };
  const casos: [string, Partial<EntradaDoLtvPorChurn>, string][] = [
    ["churn igual a 0", { churn: { tipo: "pronto", dados: { ...CHURN, expiracoesPagas: 0 } } }, "nenhuma expiração paga no período, churn zero não permite calcular o LTV"],
    ["assinaturas ativas iguais a 0", { arpu: { tipo: "pronto", dados: { ...ARPU, assinaturasAtivas: 0 } } }, "assinaturas ativas iguais a 0"],
    ["câmbio ausente", { cambio: { taxa: null, fonte: "x" } }, "câmbio US$ → R$ indisponível"],
    ["margem igual a 0%", { margem: { tipo: "pronto", dados: { ...MARGEM, platformFeePct: 60, taxPct: 30, otherCostsPct: 10 } } }, "igual ou menor que 0%"],
    ["margem negativa", { margem: { tipo: "pronto", dados: { ...MARGEM, platformFeePct: 90, taxPct: 30, otherCostsPct: 10 } } }, "igual ou menor que 0%"],
    ["denominador do churn igual a 0", { churn: { tipo: "pronto", dados: { ...CHURN, assinaturasNoInicio: 0 } } }, "nenhuma assinatura paga ativa em 29/09"],
  ];
  for (const [nome, p, texto] of casos) {
    it(`${nome}: LTV, LTV/CAC e CAC máximo '—', e o memorial diz qual insumo faltou`, () => {
      const r = causa(entrada(p));
      expect(r.ltv).toBe("—");
      expect(r.causaLtv).toContain(texto);
      expect(r.relacao).toBe("—");
      expect(r.causaRelacao).toContain(texto);
      expect(r.maximo).toBe("—");
    });
  }
  it("CAC desconhecido (Google em erro): o LTV continua; o LTV/CAC e o CAC máximo '—' com a causa", () => {
    const r = causa(entrada({ cac: { tipo: "indisponivel", causa: "Google Ads API indisponível: invalid_grant" } }));
    expect(r.ltv).toBe(fmtBRL(800));
    expect(r.relacao).toBe("—");
    expect(r.causaRelacao).toContain("CAC desconhecido: Google Ads API indisponível: invalid_grant");
    expect(r.maximo).toBe("—");
  });
  it("CAC igual a 0 e CAC sem novo pagante: '—' com a causa de cada um", () => {
    expect(causa(entrada({ cac: { tipo: "pronto", centavos: 0, investimentoCentavos: 0, pessoas: 10 } })).causaRelacao).toContain("CAC igual a 0");
    expect(causa(entrada({ cac: { tipo: "pronto", centavos: null, investimentoCentavos: 1000, pessoas: 0 } })).causaRelacao).toContain("nenhum novo pagante");
  });
  it("insumo carregando: skeleton, sem memorial (ainda não há o que explicar)", () => {
    const { ltv, relacao } = cardsDoLtvPorChurn(entrada({ churn: { tipo: "carregando" } }));
    expect(ltv).toMatchObject({ valor: "—", carregando: true });
    expect(ltv.formula).toBeUndefined();
    expect(relacao).toMatchObject({ valor: "—", carregando: true });
  });
  it("insumo em erro (overview, chart): '—' e o memorial diz qual faltou", () => {
    const { ltv } = cardsDoLtvPorChurn(entrada({ arpu: arpuDoOverview({ tipo: "erro", causa: "limite", mensagem: "RevenueCat 429" }) }));
    expect(ltv.valor).toBe("—");
    expect(JSON.stringify(ltv.formula)).toContain("overview do RevenueCat indisponível: RevenueCat 429");
  });
});

describe("AC10h — os alertas de distorção", () => {
  const base = { diasDoFiltro: 90, inicioDoCac: "2026-07-31", inicioDoChurn: "2026-09-29", serieDesde: "2026-07-01", expiracoesPagas: 13 };
  it("o 'só mídia' aparece SEMPRE (D10), e os dois alertas que não se aplicam nunca aparecem", () => {
    for (const a of [alertasDoLtvCac(base), alertasDoLtvCac({ ...base, diasDoFiltro: 7 })]) {
      expect(a[0]).toBe(ALERTA_DO_CAC_SO_MIDIA);
      expect(a.join(" ")).not.toMatch(/receita bruta|permanência estimad/i);
    }
    expect(alertasDoLtvCac(base)).toEqual([ALERTA_DO_CAC_SO_MIDIA]);
  });
  it("'período curto' com 7 e com 28 dias (menos de 30); não com 30", () => {
    expect(alertasDoLtvCac({ ...base, diasDoFiltro: 7 })).toContain("Período curto: a janela do CAC tem menos de 30 dias.");
    expect(alertasDoLtvCac({ ...base, diasDoFiltro: 28 })).toContain("Período curto: a janela do CAC tem menos de 30 dias.");
    expect(alertasDoLtvCac({ ...base, diasDoFiltro: 30 }).join(" ")).not.toContain("Período curto");
  });
  it("PO-D1 — 'Base pequena' com 9 expirações pagas; não com 10", () => {
    expect(alertasDoLtvCac({ ...base, expiracoesPagas: 9 })).toContain("Base pequena: só 9 expirações pagas no período. Uma a mais ou a menos muda muito o LTV.");
    expect(alertasDoLtvCac({ ...base, expiracoesPagas: 10 }).join(" ")).not.toContain("Base pequena");
  });
  it("'Base incompleta' quando o churn ou o CAC começa antes da série", () => {
    expect(alertasDoLtvCac({ ...base, serieDesde: "2026-08-10" })).toContain("Base incompleta: a janela do CAC começa antes de 10/08, o início da série de assinaturas.");
    expect(alertasDoLtvCac({ ...base, serieDesde: "2026-10-01" })).toContain("Base incompleta: o período do churn e a janela do CAC começam antes de 01/10, o início da série de assinaturas.");
  });
  it("no card, os alertas estão no memorial, como lista", () => {
    const c = cardsDoLtvPorChurn(entrada({ ctx: { diasDoFiltro: 7, hoje: "2026-10-28", serieDesde: "2026-08-10" }, churn: { tipo: "pronto", dados: { ...CHURN, expiracoesPagas: 9 } } })).relacao;
    const alertas = c.formula!.values.filter((v) => v.label === "Alerta").map((v) => v.value);
    expect(alertas).toEqual([
      ALERTA_DO_CAC_SO_MIDIA,
      "Período curto: a janela do CAC tem menos de 30 dias.",
      "Base pequena: só 9 expirações pagas no período. Uma a mais ou a menos muda muito o LTV.",
    ]);
  });
});

describe("AC10k — a mistura de períodos", () => {
  it("o TIPO: um insumo com período diferente de `mensal` não compila (`@ts-expect-error`)", () => {
    // @ts-expect-error — o churn de uma semana não é um insumo mensal (AC10k, PO-05)
    const semanal: ChurnMensal = { ...CHURN, periodo: "semanal" };
    expect(semanal.periodo).toBe("semanal");
  });
  it("…e o compilador confirma: `periodo: \"semanal\"` dá erro de tipo; `\"mensal\"` não", () => {
    const modulo = fileURLToPath(new URL("../ltv-por-churn-lyrio.ts", import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), "ltv-4215-"));
    try {
      const compila = (periodo: string) => {
        const arq = join(dir, `caso-${periodo}.ts`);
        writeFileSync(arq, `import type { ChurnMensal, ArpuMensal, MargemMensal } from ${JSON.stringify(modulo.replace(/\.ts$/, ""))};\nexport const c: ChurnMensal = { periodo: "${periodo}", dias: 30, desde: "a", ate: "b", expiracoesPagas: 1, assinaturasNoInicio: 1, diaDoChart: "a", serieDesde: null };\nexport const a: ArpuMensal = { periodo: "${periodo}", mrrUsd: 1, assinaturasAtivas: 1 };\nexport const m: MargemMensal = { periodo: "${periodo}", platformFeePct: 1, taxPct: 1, otherCostsPct: 1 };\n`);
        const raiz = fileURLToPath(new URL("../../../", import.meta.url));
        const programa = ts.createProgram([arq], {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ES2022,
          baseUrl: raiz,
          paths: { "@/*": ["./*"] },
          types: [],
        });
        return ts.getPreEmitDiagnostics(programa, programa.getSourceFile(arq)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      };
      expect(compila("mensal")).toEqual([]);
      const erros = compila("semanal");
      expect(erros).toHaveLength(3);
      for (const e of erros) expect(e).toMatch(/"semanal".*"mensal"/s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
  it("a EXECUÇÃO: o churn de uma janela diferente de 30 dias é recusado com '—' e a causa", () => {
    const c = cardsDoLtvPorChurn(entrada({ churn: { tipo: "pronto", dados: { ...CHURN, dias: 28 } } })).ltv;
    expect(c.valor).toBe("—");
    expect(JSON.stringify(c.formula)).toContain("o churn veio de uma janela de 28 dias, não dos 30 dias fixos: misturaria períodos");
  });
  it("numerador e denominador de janelas diferentes (ou da série inteira) não viram churn", () => {
    const ativas = { tipo: "pronto" as const, dados: { configured: true, days: 30, desde: "2026-09-29", ate: "2026-10-28", diaDoChart: "2026-09-29", valor: 520 } };
    const derivadas = (days: number | null, desde: string | null) => ({ tipo: "pronto" as const, dados: { churnPagante: 13, serieDesde: "2026-08-10", days, desde } });
    expect(churnDasConsultas(derivadas(30, "2026-09-29"), ativas)).toEqual({ tipo: "pronto", dados: CHURN });
    expect(churnDasConsultas(derivadas(28, "2026-10-01"), ativas)).toMatchObject({ tipo: "indisponivel", causa: expect.stringContaining("não são da mesma janela") });
    expect(churnDasConsultas(derivadas(30, "2026-09-28"), ativas)).toMatchObject({ tipo: "indisponivel" });
    expect(churnDasConsultas(derivadas(null, null), ativas)).toMatchObject({ tipo: "indisponivel", causa: expect.stringContaining("série inteira") });
    expect(churnDasConsultas(derivadas(30, "2026-09-29"), { tipo: "pronto", dados: { ...ativas.dados, configured: false, valor: null } })).toMatchObject({ tipo: "indisponivel", causa: expect.stringContaining("nenhum app") });
    expect(churnDasConsultas({ tipo: "oculto" }, ativas)).toMatchObject({ tipo: "indisponivel", causa: expect.stringContaining("versão anterior") });
    expect(churnDasConsultas(derivadas(30, "2026-09-29"), { tipo: "carregando" })).toEqual({ tipo: "carregando" });
  });
});

describe("AC10j — os textos do AC10 não usam travessão entre palavras", () => {
  it("nem nos cards prontos, nem nos de '—', nem nas faixas e alertas", () => {
    const entre = /\p{L}[\s,.;:]*\s—\s+\p{L}/u;
    const todos = [
      ...Object.values(cardsDoLtvPorChurn(entrada())),
      ...Object.values(cardsDoLtvPorChurn(entrada({ churn: { tipo: "pronto", dados: { ...CHURN, expiracoesPagas: 0 } } }))),
      ...Object.values(cardsDoLtvPorChurn(entrada({ cac: { tipo: "indisponivel", causa: "x" } }))),
    ];
    for (const c of todos) expect(textos(c), c.rotulo).not.toMatch(entre);
    for (const f of Object.values(FAIXAS)) expect(f.texto).not.toContain("—");
  });
});

describe("QA loop 1 (REL-001) — a margem do LTV segue o ESTADO da configuração da etapa", () => {
  /** O 500 do GET …/revenuecat/config em produção (colunas da 0103 ausentes), como o `apiClient` entrega. */
  const config500 = estadoDaFonte<{ platformFeePct: number; taxPct: number; otherCostsPct: number }>({
    isLoading: false,
    error: { status: 500, message: "HTTP 500", body: { error: "Erro ao buscar a configuração" } },
    data: undefined,
  });
  const comConfig = (c: Parameters<typeof percentuaisDaConfig>[0]) => cardsDoLtvPorChurn(entrada({ margem: margemDosPercentuais(percentuaisDaConfig(c)) }));

  it("config em erro: LTV, LTV/CAC e CAC máximo '—', e o memorial diz que os percentuais da margem não carregaram", () => {
    const { ltv, relacao } = comConfig(config500);
    expect(ltv.valor).toBe("—");
    expect(ltv.carregando).toBeUndefined();
    expect(ltv.formula!.values).toContainEqual(
      expect.objectContaining({ label: "Insumo que faltou", value: "os percentuais da margem não carregaram (configuração da etapa indisponível: Erro ao buscar a configuração)" }),
    );
    expect(relacao.valor).toBe("—");
    expect(relacao.secundarias![0]).toMatchObject({ id: "cac-maximo", valor: "—" });
    expect(JSON.stringify(relacao.formula)).toContain("LTV sem número: os percentuais da margem não carregaram");
    // nunca a conta com os padrões 15/5/1 rotulada como "percentuais da etapa"
    for (const c of [ltv, relacao]) {
      expect(JSON.stringify(c.formula)).not.toContain("percentuais da etapa (Configurar)");
      expect(JSON.stringify(c.formula)).not.toContain("15,00%");
    }
  });
  it("config carregando: LTV e LTV/CAC em skeleton, sem memorial, e o CAC máximo '—'", () => {
    const { ltv, relacao } = comConfig({ tipo: "carregando" });
    expect(ltv).toMatchObject({ valor: "—", carregando: true });
    expect(ltv.formula).toBeUndefined();
    expect(relacao).toMatchObject({ valor: "—", carregando: true });
    expect(relacao.formula).toBeUndefined();
    expect(relacao.secundarias![0].valor).toBe("—");
  });
  it("config pronta: a conta usa os percentuais DELA (20/5/5 → 70%), não os padrões; LTV 25 × 70% ÷ 2,5% = R$ 700,00", () => {
    const { ltv, relacao } = comConfig({ tipo: "pronto", dados: { platformFeePct: 20, taxPct: 5, otherCostsPct: 5 } });
    expect(ltv.valor).toBe(fmtBRL(700));
    const v = Object.fromEntries(ltv.formula!.values.map((x) => [x.label, x]));
    expect(v["Margem de contribuição"]).toMatchObject({ value: "100% − 20,00% − 5,00% − 5,00% = 70,00%", source: expect.stringContaining("percentuais da etapa (Configurar)") });
    expect(relacao.valor).toBe("2,8x"); // 700 ÷ 250
  });
  it("config antiga (oculto) ou sem os três percentuais: '—' com a causa, nunca um padrão", () => {
    expect(percentuaisDaConfig({ tipo: "oculto" })).toMatchObject({ tipo: "indisponivel", causa: expect.stringContaining("os percentuais da margem não carregaram") });
    for (const dados of [{ platformFeePct: 15, taxPct: 5 }, { platformFeePct: 15, taxPct: null, otherCostsPct: 1 }, { platformFeePct: Number.NaN, taxPct: 5, otherCostsPct: 1 }]) {
      expect(percentuaisDaConfig({ tipo: "pronto", dados }), JSON.stringify(dados)).toEqual({ tipo: "indisponivel", causa: "a configuração da etapa não trouxe os percentuais da margem" });
    }
    const { ltv } = comConfig({ tipo: "pronto", dados: { platformFeePct: 15, taxPct: 5 } });
    expect(ltv.valor).toBe("—");
    expect(JSON.stringify(ltv.formula)).toContain("a configuração da etapa não trouxe os percentuais da margem");
  });
  it("percentuais em 0 são número (margem 100%), não ausência", () => {
    expect(percentuaisDaConfig({ tipo: "pronto", dados: { platformFeePct: 0, taxPct: 0, otherCostsPct: 0 } })).toEqual({ tipo: "pronto", dados: { platformFeePct: 0, taxPct: 0, otherCostsPct: 0 } });
    expect(margemDosPercentuais({ tipo: "pronto", dados: { platformFeePct: 0, taxPct: 0, otherCostsPct: 0 } })).toEqual({ tipo: "pronto", dados: { periodo: "mensal", platformFeePct: 0, taxPct: 0, otherCostsPct: 0 } });
  });
});

describe("QA loop 1 (TEST-001) — o ARPU do overview no caminho pronto", () => {
  it("lê `mrr` e `active_subscriptions` (não `active_trials`): MRR 1.887, 865 assinaturas", () => {
    const overview = { tipo: "pronto" as const, dados: [{ id: "mrr", value: 1887 }, { id: "active_trials", value: 30 }, { id: "active_subscriptions", value: 865 }] };
    expect(arpuDoOverview(overview)).toEqual({ tipo: "pronto", dados: { periodo: "mensal", mrrUsd: 1887, assinaturasAtivas: 865 } });
    // e o card usa esse ARPU: 1.887 ÷ 865 × 5
    const c = cardsDoLtvPorChurn(entrada({ arpu: arpuDoOverview(overview) })).ltv;
    expect(c.formula!.values.find((x) => x.label === "ARPU mensal")!.value).toBe(`US$ 1.887,00 ÷ 865 × ${fmtBRL(5)} = ${fmtBRL((1887 / 865) * 5)}`);
  });
  it("sem o MRR, ou sem as assinaturas ativas: '—' com a causa de cada um", () => {
    expect(arpuDoOverview({ tipo: "pronto", dados: [{ id: "active_subscriptions", value: 865 }, { id: "active_trials", value: 30 }] })).toEqual({
      tipo: "indisponivel",
      causa: "o overview do RevenueCat não trouxe o MRR",
    });
    expect(arpuDoOverview({ tipo: "pronto", dados: [{ id: "mrr", value: 1887 }, { id: "active_trials", value: 30 }] })).toEqual({
      tipo: "indisponivel",
      causa: "o overview do RevenueCat não trouxe as assinaturas ativas",
    });
    expect(arpuDoOverview({ tipo: "carregando" })).toEqual({ tipo: "carregando" });
    expect(arpuDoOverview({ tipo: "oculto" })).toMatchObject({ tipo: "indisponivel" });
  });
});

describe("QA loop 1 (TEST-006, Q50) — a precedência do `serieDesde` no 'Base incompleta'", () => {
  const baseIncompleta = (c: CardDoResumo) => c.formula!.values.filter((v) => v.label === "Alerta").map((v) => String(v.value)).find((v) => v.startsWith("Base incompleta")) ?? null;
  it("com o churn pronto, vale a data do CHURN (a mesma resposta do numerador), não a do contexto", () => {
    // churn: série desde 10/08 (só a janela do CAC, de 31/07, começa antes); contexto: 01/10 (o churn também começaria antes)
    const c = cardsDoLtvPorChurn(entrada({ ctx: { diasDoFiltro: 90, hoje: "2026-10-28", serieDesde: "2026-10-01" } })).relacao;
    expect(baseIncompleta(c)).toBe("Base incompleta: a janela do CAC começa antes de 10/08, o início da série de assinaturas.");
  });
  it("sem o churn, vale a data do contexto (os pagantes)", () => {
    const c = cardsDoLtvPorChurn(
      entrada({ ctx: { diasDoFiltro: 90, hoje: "2026-10-28", serieDesde: "2026-10-01" }, churn: { tipo: "indisponivel", causa: "x" } }),
    ).relacao;
    expect(baseIncompleta(c)).toBe("Base incompleta: a janela do CAC começa antes de 01/10, o início da série de assinaturas.");
  });
});
