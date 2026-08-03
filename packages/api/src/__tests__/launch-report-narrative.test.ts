import { describe, it, expect } from "vitest";
import {
  moedaBr, inteiroBr, pctBr, numeroBr, dataBr, diaMesBr,
  variacaoPct, pctComSinal, verboDirecao, avaliacao, seta, classeDirecao,
  sinalRoas, escaparHtml, escaparJson,
} from "../services/launch-report-narrative";

/** Story 41.5 — §6 (zero literal narrativo) e AC6 (formatação BR). */

describe("formatação BR (AC6) — nada em formato US", () => {
  it("moeda usa ponto no milhar e vírgula no decimal", () => {
    expect(moedaBr(1234.56)).toBe("R$ 1.234,56");
    expect(moedaBr(233_572.94)).toBe("R$ 233.572,94");
    expect(moedaBr(0)).toBe("R$ 0,00");
  });

  it("moeda nunca sai como 1,234.56", () => {
    expect(moedaBr(1234.56)).not.toContain("1,234.56");
  });

  it("negativo mantém o sinal", () => {
    expect(moedaBr(-1956.01)).toBe("R$ -1.956,01");
  });

  it("inteiro com separador de milhar", () => {
    expect(inteiroBr(2_391_255)).toBe("2.391.255");
    expect(inteiroBr(1410)).toBe("1.410");
    expect(inteiroBr(0)).toBe("0");
  });

  it("inteiro arredonda", () => {
    expect(inteiroBr(1409.6)).toBe("1.410");
  });

  it("percentual com vírgula", () => {
    expect(pctBr(12.3)).toBe("12,3%");
    expect(pctBr(1.84, 2)).toBe("1,84%");
  });

  it("número com casas fixas", () => {
    expect(numeroBr(0.9646, 4)).toBe("0,9646");
    expect(numeroBr(2, 2)).toBe("2,00");
  });

  it("data como dd/mm/aa", () => {
    expect(dataBr("2026-07-27")).toBe("27/07/26");
    expect(dataBr("2026-04-17")).toBe("17/04/26");
  });

  it("data NÃO usa Date — não escorrega de fuso", () => {
    // new Date("2026-01-01") é UTC; em fuso negativo daria 31/12/25.
    expect(dataBr("2026-01-01")).toBe("01/01/26");
  });

  it("data em formato inesperado volta como veio, sem inventar", () => {
    expect(dataBr("sem-data")).toBe("sem-data");
  });

  it("dia/mês para eixos curtos", () => {
    expect(diaMesBr("2026-07-27")).toBe("27/07");
  });

  it("valores não-finitos não viram NaN no documento", () => {
    expect(moedaBr(NaN)).toBe("R$ 0,00");
    expect(inteiroBr(Infinity)).toBe("0");
    expect(pctBr(NaN)).toBe("0,0%");
  });
});

describe("variacaoPct", () => {
  it("calcula a variação relativa", () => {
    expect(variacaoPct(100, 177)).toBeCloseTo(77, 6);
    expect(variacaoPct(159.39, 87.72)).toBeCloseTo(-44.97, 1);
  });

  it("base zero → null, não Infinity", () => {
    expect(variacaoPct(0, 100)).toBeNull();
  });

  it("valores iguais → 0", () => {
    expect(variacaoPct(50, 50)).toBe(0);
  });
});

describe("pctComSinal — sinal sempre explícito (§6)", () => {
  it("positivo ganha +", () => {
    expect(pctComSinal(77)).toBe("+77,0%");
  });

  it("negativo usa o menos tipográfico", () => {
    expect(pctComSinal(-17)).toBe("−17,0%");
  });

  it("zero não ganha sinal", () => {
    expect(pctComSinal(0)).toBe("0,0%");
  });

  it("null vira travessão, não 'NaN%'", () => {
    expect(pctComSinal(null)).toBe("—");
  });

  it("os pesos da decomposição da §10 saem certos", () => {
    expect(pctComSinal(49)).toBe("+49,0%");
    expect(pctComSinal(-10)).toBe("−10,0%");
    expect(pctComSinal(-17)).toBe("−17,0%");
    expect(pctComSinal(77)).toBe("+77,0%");
  });
});

describe("verboDirecao — o coração do §6", () => {
  it("deriva o verbo do sinal", () => {
    expect(verboDirecao(100, 200)).toBe("subiu");
    expect(verboDirecao(200, 100)).toBe("caiu");
    expect(verboDirecao(100, 100)).toBe("ficou estável");
  });

  it("aceita verbos customizados", () => {
    expect(verboDirecao(1, 2, { subiu: "cresceu", caiu: "encolheu" })).toBe("cresceu");
    expect(verboDirecao(2, 1, { subiu: "cresceu", caiu: "encolheu" })).toBe("encolheu");
  });

  it("REGRESSÃO do bug do §6: o verbo inverte quando os dados invertem", () => {
    // O caso real: "a conversão piorou de 1,74% para 1,98%" — ela MELHOROU.
    const a = 1.744, b = 1.984;
    expect(verboDirecao(a, b)).toBe("subiu");
    expect(verboDirecao(b, a)).toBe("caiu");
    expect(verboDirecao(a, b)).not.toBe(verboDirecao(b, a));
  });
});

describe("avaliacao — separada do verbo por causa das métricas de custo", () => {
  it("métrica normal: subir é melhorar", () => {
    expect(avaliacao(1, 2)).toBe("melhorou");
    expect(avaliacao(2, 1)).toBe("piorou");
  });

  it("métrica de custo: cair é melhorar", () => {
    expect(avaliacao(200, 100, true)).toBe("melhorou");
    expect(avaliacao(100, 200, true)).toBe("piorou");
  });

  it("o VERBO não inverte em métrica de custo — só a avaliação", () => {
    // CPV de 200 para 100: o verbo é "caiu" e a avaliação é "melhorou".
    expect(verboDirecao(200, 100)).toBe("caiu");
    expect(avaliacao(200, 100, true)).toBe("melhorou");
  });

  it("igual é estável", () => {
    expect(avaliacao(5, 5)).toBe("estável");
    expect(avaliacao(5, 5, true)).toBe("estável");
  });
});

describe("seta e cor", () => {
  it("seta segue o valor, não a avaliação", () => {
    expect(seta(1, 2)).toBe("▲");
    expect(seta(2, 1)).toBe("▼");
    expect(seta(1, 1)).toBe("–");
  });

  it("cor inverte em métrica de custo (AC5 da 41.6)", () => {
    // CPV menor em B é VERDE, apesar da seta para baixo.
    expect(classeDirecao(200, 100, true)).toBe("ok");
    expect(seta(200, 100)).toBe("▼");
    // e em métrica normal, menor é vermelho
    expect(classeDirecao(200, 100, false)).toBe("ruim");
  });

  it("estável é neutro nos dois casos", () => {
    expect(classeDirecao(5, 5)).toBe("neutro");
    expect(classeDirecao(5, 5, true)).toBe("neutro");
  });
});

describe("sinalRoas", () => {
  it("ROAS >= 1 paga o investimento", () => {
    expect(sinalRoas(1)).toBe("✅");
    expect(sinalRoas(1.85)).toBe("✅");
  });

  it("ROAS < 1 alerta", () => {
    expect(sinalRoas(0.9646)).toBe("⚠️");
    expect(sinalRoas(0.4457)).toBe("⚠️");
  });
});

describe("escape — nomes de campanha e produto não são confiáveis", () => {
  it("escapa os cinco caracteres perigosos", () => {
    expect(escaparHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escaparHtml("a & b")).toBe("a &amp; b");
    expect(escaparHtml("o'brien")).toBe("o&#39;brien");
  });

  it("o & é trocado PRIMEIRO — senão as entidades seriam escapadas de novo", () => {
    expect(escaparHtml("<")).toBe("&lt;");
    expect(escaparHtml("&lt;")).toBe("&amp;lt;");
  });

  it("null e undefined viram string vazia, não 'null'", () => {
    expect(escaparHtml(null)).toBe("");
    expect(escaparHtml(undefined)).toBe("");
  });

  it("nome de campanha real com em-dash passa intacto", () => {
    expect(escaparHtml("dg-pg02-abr-26—vendas-captacao")).toBe("dg-pg02-abr-26—vendas-captacao");
  });

  it("escaparJson neutraliza fechamento de tag no bloco de dados", () => {
    expect(escaparJson({ x: "</script>" })).not.toContain("</script>");
    expect(escaparJson({ x: "</script>" })).toContain("\\u003c");
  });
});

describe("AC4 — o teste de regressão que a story exige", () => {
  it("dois datasets de direções OPOSTAS produzem textos diferentes", () => {
    const frase = (a: number, b: number) =>
      `O ticket ${verboDirecao(a, b)} de ${moedaBr(a)} para ${moedaBr(b)} (${pctComSinal(variacaoPct(a, b))})`;

    const caindo = frase(159.39, 87.72);
    const subindo = frase(87.72, 159.39);

    expect(caindo).toContain("caiu");
    expect(caindo).toContain("−");
    expect(subindo).toContain("subiu");
    expect(subindo).toContain("+");
    expect(caindo).not.toBe(subindo);
  });

  it("nenhum verbo ou percentual fica fixo entre execuções", () => {
    const pares: [number, number][] = [[1, 2], [2, 1], [5, 5]];
    const verbos = pares.map(([a, b]) => verboDirecao(a, b));
    expect(new Set(verbos).size).toBe(3);
  });
});
