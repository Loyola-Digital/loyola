/**
 * Story 49.3 — higiene do Debriefing (funções puras de `debriefing-hygiene.ts`).
 *
 * Cada armadilha tem o caso positivo e o que falharia com a correção revertida:
 * parser (#2), dedup (#1), telefone `.0` (DG §10.1), data no fuso certo,
 * imposto uma vez (nunca × 1,13).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aplicarImposto,
  chavesDeComprador,
  dataBrt,
  deduplicarVendas,
  desembrulharUtm,
  diasEntre,
  ehManual,
  ehTmb,
  fatorDoImposto,
  filtrarPorStatus,
  hashDeEmail,
  janelaDoDebriefing,
  lerValorMonetario,
  normalizarTelefone,
  resolverColunaPrecoDebriefing,
  textoTmb,
  type PlanilhaParaDedup,
} from "../services/debriefing-hygiene.js";
import { phoneTail } from "../utils/lead-origin.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

describe("AC2 — leitura numérica única (armadilha #2, R-49-4)", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["29.9", 29.9],
    ["4.000", 4000],
    ["1.097,00", 1097],
    ["R$ 1.234,56", 1234.56],
    ["R$ 99,00", 99],
    ["99", 99],
  ])("%s → %s", (celula, esperado) => {
    const r = lerValorMonetario(celula);
    expect(r.valor).toBe(esperado);
    expect(r.negativo).toBe(false);
    expect(r.vazio).toBe(false);
  });

  it("'29.9' nunca vira 299 (a armadilha #2 literal)", () => {
    expect(lerValorMonetario("29.9").valor).not.toBe(299);
  });

  it("limite conhecido do parser, à vista: um ponto + 3 dígitos é milhar ('1.234' → 1234)", () => {
    expect(lerValorMonetario("1.234").valor).toBe(1234);
  });

  it.each(["-99,00", "R$ -1.234,56", "-R$ 99", "− 99,00", "(99,00)"])(
    "sinal negativo é marcado (o parser descarta o sinal): %s",
    (celula) => {
      const r = lerValorMonetario(celula);
      expect(r.negativo).toBe(true);
      expect(r.valor).toBeGreaterThan(0);
    },
  );

  it.each([null, undefined, "", "   ", "—", "n/a"])("célula sem número = vazio: %s", (celula) => {
    expect(lerValorMonetario(celula as string | null)).toEqual({ valor: 0, negativo: false, vazio: true });
  });
});

describe("AC5 — coluna de preço (bruto, nunca líquido nem total com acréscimo)", () => {
  const headers = ["ID", "Produto", "Preço", "Valor líquido", "Total com acréscimo", "Valor oferta"];

  it("mapping em 'Valor líquido' → usa 'Preço' e marca divergência", () => {
    const r = resolverColunaPrecoDebriefing("Valor líquido", headers);
    expect(r.coluna).toBe("Preço");
    expect(r.mappingDivergente).toBe(true);
    expect(r.colunaDoMapping).toBe("Valor líquido");
  });

  it("mapping em 'Total com acréscimo' → usa 'Preço'", () => {
    expect(resolverColunaPrecoDebriefing("Total com acréscimo", headers).coluna).toBe("Preço");
  });

  it("a regra do Epic 41 continua valendo ('Valor oferta' → 'Preço')", () => {
    expect(resolverColunaPrecoDebriefing("Valor oferta", headers).coluna).toBe("Preço");
  });

  it("mapping limpo é respeitado; líquido sem coluna 'Preço' não vira preço", () => {
    expect(resolverColunaPrecoDebriefing("Preço", headers)).toMatchObject({ coluna: "Preço", mappingDivergente: false });
    expect(resolverColunaPrecoDebriefing("Líquido", ["Líquido"]).coluna).toBeNull();
  });
});

describe("AC6 — imposto uma vez, regra do Loyola (nunca × 1,13)", () => {
  it("conferência do Epic 41: 111.188,35 × 1/(1−0,1215) = 126.566,14", () => {
    expect(aplicarImposto(111188.35, "2026-04-20", 0.1215).toFixed(2)).toBe("126566.14");
  });

  it("não é × 1,13 (que daria 125.642,84)", () => {
    const comImposto = aplicarImposto(111188.35, "2026-04-20", 0.1215);
    expect(comImposto).not.toBeCloseTo(111188.35 * 1.13, 2);
  });

  it("antes de 2026-01-01 não há gross-up, com ou sem override (resolução 6)", () => {
    expect(aplicarImposto(1000, "2025-12-31", 0.1215)).toBe(1000);
    expect(aplicarImposto(1000, "2025-12-31", 0.08)).toBe(1000);
    expect(aplicarImposto(1000, "2026-01-01", 0.08)).toBeCloseTo(1000 / 0.92, 10);
  });

  it("fator declarado = 1/(1−pct); alíquota fora de [0,1) lança (nunca Infinity)", () => {
    expect(fatorDoImposto(0.1215)).toBeCloseTo(1.138304, 6);
    expect(() => aplicarImposto(10, "2026-02-01", 1)).toThrow(RangeError);
    expect(() => fatorDoImposto(-0.1)).toThrow(RangeError);
  });

  it("nenhum 1,13 / 1.13 nos arquivos do motor — nem em comentário (CONTRACT-003: a 49.5 AC9 lê como texto)", () => {
    for (const f of ["debriefing-hygiene.ts", "debriefing-money-time-engine.ts", "debriefing-money-time-loader.ts"]) {
      const src = readFileSync(join(AQUI, "..", "services", f), "utf8");
      expect(src, f).not.toMatch(/(?<!\d)1[.,]13(?!\d)/);
    }
  });
});

describe("AC9 — dataBrt: quatro formatos, instante convertido para São Paulo", () => {
  it.each([
    ["17/04/2026", "2026-04-17"],
    ["7/4/2026 23:10:00", "2026-04-07"],
    ["2026-04-17", "2026-04-17"],
    ["2026-04-17 10:00:00", "2026-04-17"],
    // ISO com Z na virada: 01:30 UTC de 18/04 = 22:30 BRT de 17/04.
    ["2026-04-18T01:30:00Z", "2026-04-17"],
    ["2026-04-18T01:30:00.000Z", "2026-04-17"],
    ["2026-04-18T03:30:00Z", "2026-04-18"],
    ["2026-04-17T22:30:00-03:00", "2026-04-17"],
    // epoch-ms (PG01): 2026-04-18T01:30:00Z
    [String(Date.UTC(2026, 3, 18, 1, 30)), "2026-04-17"],
    [`${Date.UTC(2026, 3, 18, 1, 30)}.0`, "2026-04-17"],
  ])("%s → %s", (celula, esperado) => {
    expect(dataBrt(celula)).toBe(esperado);
  });

  it.each(["17 Apr 2026", "31/02/2026", "2026-13-01", "abc", "", "1713", "17/04/26"])(
    "formato não reconhecido → null (nunca data inventada): %s",
    (celula) => {
      expect(dataBrt(celula)).toBeNull();
    },
  );

  it("diasEntre conta dias de calendário", () => {
    expect(diasEntre("2026-04-17", "2026-05-26")).toBe(39);
    expect(diasEntre("2026-04-17", "2026-04-16")).toBe(-1);
  });
});

describe("AC9 — normalizarTelefone (armadilha DG §10.1)", () => {
  it("o sufixo de float '.0' sai antes dos não-dígitos", () => {
    expect(normalizarTelefone("553175058180.0")).toBe("75058180");
    expect(normalizarTelefone("553175058180")).toBe("75058180");
    expect(normalizarTelefone(553175058180)).toBe("75058180");
  });

  it("o defeito do phoneTail fica registrado (não é alterado por esta story)", () => {
    expect(phoneTail("553175058180.0")).toBe("50581800");
    expect(normalizarTelefone("553175058180.0")).not.toBe(phoneTail("553175058180.0"));
  });

  it("máscara e < 8 dígitos", () => {
    expect(normalizarTelefone("+55 (31) 7505-8180")).toBe("75058180");
    expect(normalizarTelefone("1234567")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
  });
});

describe("chaves anônimas de comprador (decisão 11 — sem PII)", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  it("a chave de e-mail é o sha256 do e-mail normalizado (a mesma de public-sales-rows)", () => {
    expect(hashDeEmail("  A@X.com ")).toBe(sha("a@x.com"));
  });

  it("porEmail separa; porEmailOuTelefone une pelo telefone; nenhuma chave carrega o dado cru", () => {
    const linhas = [
      { emailCru: "a@x.com", telefoneCru: "553175058180.0", planilhaId: "p", linha: 1 },
      { emailCru: "outro@x.com", telefoneCru: "(31) 7505-8180", planilhaId: "p", linha: 2 },
      { emailCru: "c@x.com", telefoneCru: null, planilhaId: "p", linha: 3 },
      { emailCru: null, telefoneCru: null, planilhaId: "p", linha: 4 },
    ];
    const k = chavesDeComprador(linhas);
    expect(new Set(k.porEmail).size).toBe(4);
    expect(k.porEmailOuTelefone[0]).toBe(k.porEmailOuTelefone[1]);
    expect(new Set(k.porEmailOuTelefone).size).toBe(3);
    const tudo = JSON.stringify(k);
    expect(tudo).not.toMatch(/@|75058180|x\.com/);
  });

  it("une em cadeia (A↔tel↔B, B↔C por e-mail) e a chave do grupo não depende da ordem", () => {
    const base = [
      { emailCru: "a@x.com", telefoneCru: "11111111", planilhaId: "p", linha: 1 },
      { emailCru: "b@x.com", telefoneCru: "11111111", planilhaId: "p", linha: 2 },
      { emailCru: "b@x.com", telefoneCru: "22222222", planilhaId: "p", linha: 3 },
    ];
    const k1 = chavesDeComprador(base).porEmailOuTelefone;
    const k2 = chavesDeComprador([...base].reverse()).porEmailOuTelefone;
    expect(new Set(k1).size).toBe(1);
    expect(k1[0]).toBe(k2[0]);
  });
});

describe("AC3 — status: só pago vira receita; transação reembolsada sai inteira", () => {
  type L = { p: string; s: string | null; id: string | null };
  const acesso = {
    planilhaId: (l: L) => l.p,
    statusCru: (l: L) => l.s,
    idDaVenda: (l: L) => l.id,
    temColunaStatus: (p: string) => p !== "sem-status",
  };

  it("conta por bucket e pareia o reembolso pelo ID na mesma planilha", () => {
    const r = filtrarPorStatus<L>(
      [
        { p: "a", s: "paid", id: "1" },
        { p: "a", s: "refunded", id: "1" },
        { p: "a", s: "chargedback", id: "2" },
        { p: "a", s: "waiting_payment", id: "3" },
        { p: "a", s: "Aprovada", id: "4" },
        { p: "b", s: "paid", id: "1" }, // outra planilha: o reembolso de "a" não a derruba
        { p: "sem-status", s: "refunded", id: "9" }, // planilha sem coluna de status: legado = pago
      ],
      acesso,
    );
    expect(r.pagas.map((l) => `${l.p}:${l.id}`)).toEqual(["a:4", "b:1", "sem-status:9"]);
    expect(r.excluidasPorStatus).toEqual({ refunded: 1, chargeback: 1, other: 1, pareadaComReembolso: 1 });
  });
});

describe("AC3 — dedup em duas camadas (armadilha #1)", () => {
  type L = { p: string; id: string | null; prod: string | null; email: string | null; n: number };
  const acesso = {
    planilhaId: (l: L) => l.p,
    idDaVenda: (l: L) => l.id,
    produto: (l: L) => l.prod,
    emailCru: (l: L) => l.email,
  };
  const planilhas = (sem?: Partial<PlanilhaParaDedup>) =>
    new Map<string, PlanilhaParaDedup>([
      ["a", { planilhaId: "a", nome: "Vendas A", temColunaId: true, temColunaProduto: true, camada2Vale: true, ...sem }],
      ["b", { planilhaId: "b", nome: "Vendas B", temColunaId: true, temColunaProduto: true, camada2Vale: true }],
    ]);

  it("camada 1: mesmo ID e produto colapsa (sobrevive a primeira); bump do mesmo pedido não; sem ID nunca", () => {
    const r = deduplicarVendas<L>(
      [
        { p: "a", id: "T1", prod: "Imersão", email: "x@x.com", n: 1 },
        { p: "a", id: "T1", prod: "imersão ", email: "y@x.com", n: 2 }, // dup (produto normalizado)
        { p: "a", id: "T1", prod: "GPT", email: "x@x.com", n: 3 }, // bump do mesmo pedido
        { p: "a", id: null, prod: "Imersão", email: "z@x.com", n: 4 },
        { p: "a", id: null, prod: "Imersão", email: "w@x.com", n: 5 },
        { p: "b", id: "T1", prod: "Imersão", email: "k@x.com", n: 6 }, // outra planilha: não colapsa
      ],
      acesso,
      planilhas(),
    );
    expect(r.removidasCamada1.map((l) => l.n)).toEqual([2]);
    expect(r.camada1).toEqual({ antes: 6, depois: 5, removidas: 1 });
    expect(r.dedupNaoAplicada).toEqual([]);
  });

  it("camada 2: mesmo (e-mail, produto) colapsa; produtos distintos do mesmo e-mail não; sem e-mail nunca", () => {
    const r = deduplicarVendas<L>(
      [
        { p: "a", id: "A1", prod: "Imersão", email: "X@x.com", n: 1 },
        { p: "a", id: "A2", prod: "Imersão", email: "x@x.com ", n: 2 }, // PURCHASE_COMPLETE: outro ID, mesma compra
        { p: "a", id: "A3", prod: "Combo", email: "x@x.com", n: 3 },
        { p: "a", id: "A4", prod: "GPT", email: "x@x.com", n: 4 },
        { p: "a", id: "A5", prod: "Imersão", email: null, n: 5 },
        { p: "a", id: "A6", prod: "Imersão", email: null, n: 6 },
      ],
      acesso,
      planilhas(),
    );
    expect(r.removidasCamada2.map((l) => l.n)).toEqual([2]);
    expect(r.camada2).toEqual({ antes: 6, depois: 5, removidas: 1 });
    for (const c of [r.camada1, r.camada2]) expect(c.antes - c.depois).toBe(c.removidas);
  });

  it("41.12 R7-4/R7-5: planilha de etapa fora do escopo (`camada2Vale: false`) não colapsa nem ocupa a vaga", () => {
    const linhas: L[] = [
      { p: "b", id: "B1", prod: "Imersão", email: "x@x.com", n: 1 }, // etapa fora (ex.: Vendas) — vem antes
      { p: "b", id: "B2", prod: "Imersão", email: "x@x.com", n: 2 }, // recompra na etapa fora: fica
      { p: "a", id: "A1", prod: "Imersão", email: "x@x.com", n: 3 }, // captação: 1ª no escopo, sobrevive
      { p: "a", id: "A2", prod: "Imersão", email: "x@x.com", n: 4 }, // recompra na captação: sai
    ];
    const pl = new Map<string, PlanilhaParaDedup>([
      ["a", { planilhaId: "a", nome: "Vendas A", temColunaId: true, temColunaProduto: true, camada2Vale: true }],
      ["b", { planilhaId: "b", nome: "Vendas B", temColunaId: true, temColunaProduto: true, camada2Vale: false }],
    ]);
    const r = deduplicarVendas<L>(linhas, acesso, pl);
    expect(r.removidasCamada2.map((l) => l.n)).toEqual([4]);
    expect(r.mantidas.map((l) => l.n)).toEqual([1, 2, 3]); // ordem preservada
    expect(r.camada2).toEqual({ antes: 4, depois: 3, removidas: 1 });
  });

  it("planilha sem transactionId ou productName mapeado: camada 1 não roda nela e é declarada", () => {
    const linhas: L[] = [
      { p: "a", id: "T1", prod: "Imersão", email: "x@x.com", n: 1 },
      { p: "a", id: "T1", prod: "Imersão", email: "y@x.com", n: 2 },
    ];
    const semId = deduplicarVendas<L>(linhas, acesso, planilhas({ temColunaId: false }));
    expect(semId.camada1.removidas).toBe(0);
    expect(semId.dedupNaoAplicada).toEqual([{ planilhaId: "a", planilha: "Vendas A", faltando: ["transactionId"] }]);
    const semProduto = deduplicarVendas<L>(linhas, acesso, planilhas({ temColunaProduto: false }));
    expect(semProduto.dedupNaoAplicada[0]!.faltando).toEqual(["productName"]);
  });

  it("teste estático: a camada 1 importa deduplicarPorIdDaVenda (41.10) e não redefine a chave", () => {
    const src = readFileSync(join(AQUI, "..", "services", "debriefing-hygiene.ts"), "utf8");
    expect(src).toMatch(/import \{ deduplicarPorIdDaVenda \} from "\.\.\/utils\/dedup-por-id-da-venda\.js"/);
    expect(src).toMatch(/deduplicarPorIdDaVenda\(daPlanilha,/);
    expect(src).not.toMatch(/function chaveDeDedupDaVenda|idDaVenda\.trim\(\)\}\\u0000/);
  });
});

describe("AC4 — TMB", () => {
  it("o subtype `tmb` é o único sinal; o texto de sinalização é fixo", () => {
    expect(ehTmb("tmb")).toBe(true);
    expect(ehTmb(" TMB ")).toBe(true);
    expect(ehTmb("main_product")).toBe(false);
    expect(textoTmb(70, 3)).toBe("70 vendas, 3 via TMB (valor não considerado)");
  });
  it("inteiros com milhar pt-BR (QA 49.6 FMT-496-1: o PG02 saía \"2293 vendas\")", () => {
    expect(textoTmb(2293, 5)).toBe("2.293 vendas, 5 via TMB (valor não considerado)");
    expect(textoTmb(12_500, 1_040)).toBe("12.500 vendas, 1.040 via TMB (valor não considerado)");
  });
});

describe("decisão 2A — janelaDoDebriefing: inicioCaptacao → maior fim", () => {
  const base = {
    inicioCaptacao: "2026-04-17",
    fimCarrinho: "2026-05-15",
    reabertura: { houve: false } as const,
    downsell: { houve: false } as const,
  };

  it("só carrinho: fim do carrinho", () => {
    expect(janelaDoDebriefing(base)).toMatchObject({ inicio: "2026-04-17", fim: "2026-05-15", fimPor: "fimCarrinho" });
  });

  it("downsell depois do carrinho estica; reabertura depois do downsell estica mais", () => {
    const ds = { houve: true as const, fim: "2026-05-18" };
    expect(janelaDoDebriefing({ ...base, downsell: ds })).toMatchObject({ fim: "2026-05-18", fimPor: "downsell.fim" });
    expect(
      janelaDoDebriefing({ ...base, downsell: ds, reabertura: { houve: true, fim: "2026-05-22" } }),
    ).toMatchObject({ fim: "2026-05-22", fimPor: "reabertura.fim" });
    // ordem não importa: downsell depois da reabertura
    expect(
      janelaDoDebriefing({ ...base, downsell: { houve: true, fim: "2026-05-30" }, reabertura: { houve: true, fim: "2026-05-22" } }),
    ).toMatchObject({ fim: "2026-05-30", fimPor: "downsell.fim" });
  });

  it("extra que acaba antes do carrinho não encurta; empate fica com o carrinho", () => {
    expect(janelaDoDebriefing({ ...base, downsell: { houve: true, fim: "2026-05-10" } })).toMatchObject({
      fim: "2026-05-15",
      fimPor: "fimCarrinho",
    });
    expect(janelaDoDebriefing({ ...base, reabertura: { houve: true, fim: "2026-05-15" } }).fimPor).toBe("fimCarrinho");
  });

  it("TEST-005 (QA-M2): empate do fim do downsell com o fim do carrinho fica com o carrinho", () => {
    expect(janelaDoDebriefing({ ...base, downsell: { houve: true, fim: "2026-05-15" } })).toMatchObject({
      fim: "2026-05-15",
      fimPor: "fimCarrinho",
    });
    // empate triplo: continua o carrinho
    expect(
      janelaDoDebriefing({ ...base, downsell: { houve: true, fim: "2026-05-15" }, reabertura: { houve: true, fim: "2026-05-15" } }).fimPor,
    ).toBe("fimCarrinho");
  });

  it("a regra vai por extenso e data inválida lança (nunca janela inventada)", () => {
    expect(janelaDoDebriefing(base).regra).toMatch(/inicioCaptacao.*maior entre fimCarrinho, reabertura\.fim e downsell\.fim/);
    expect(() => janelaDoDebriefing({ ...base, fimCarrinho: "15/05/2026" })).toThrow(RangeError);
    expect(() => janelaDoDebriefing({ ...base, inicioCaptacao: "2026-06-01" })).toThrow(RangeError);
  });
});

describe("decisão 3A — plataforma manual", () => {
  it("ehManual só para a plataforma 'manual'; manual não é TMB", () => {
    expect(ehManual("manual")).toBe(true);
    expect(ehManual(" Manual ")).toBe(true);
    expect(ehManual("main_product")).toBe(false);
    expect(ehTmb("manual")).toBe(false);
  });
});

describe("regra 9 da skill — UTM em array do Postgres ({\"qr\",\"qr\"} → qr)", () => {
  it.each([
    ["qr", "qr", "texto"],
    ["  qr  ", "qr", "texto"],
    ['{"qr"}', "qr", "array"],
    ['{"qr","qr"}', "qr", "array"],
    ['{ "qr" , "qr" }', "qr", "array"],
    ["{qr,qr,qr}", "qr", "array"],
    ['{"qr",""}', "qr", "array"],
    ["{qr,NULL}", "qr", "array"],
    ['{"dg pg02","dg pg02"}', "dg pg02", "array"],
    ['{"a \\"b\\"","a \\"b\\""}', 'a "b"', "array"],
    ["{}", null, "array"],
    ['{"",""}', null, "array"],
  ])("%j → %j (%s)", (celula, valor, formato) => {
    expect(desembrulharUtm(celula)).toEqual({ valor, formato });
  });

  it("valores DISTINTOS ficam como o texto cru (array-ambiguo) — nunca escolhe um deles", () => {
    expect(desembrulharUtm('{"backend","lote-3"}')).toEqual({ valor: '{"backend","lote-3"}', formato: "array-ambiguo" });
    expect(desembrulharUtm("{fb,ig,fb}")).toEqual({ valor: "{fb,ig,fb}", formato: "array-ambiguo" });
  });

  it("o que só parece array fica como texto: JSON, macro do Meta, chave aberta, vazio", () => {
    expect(desembrulharUtm('{"co":"123"}')).toEqual({ valor: '{"co":"123"}', formato: "texto" });
    expect(desembrulharUtm("{{adset.id}}")).toEqual({ valor: "{{adset.id}}", formato: "texto" });
    expect(desembrulharUtm('{"qr"')).toEqual({ valor: '{"qr"', formato: "texto" });
    expect(desembrulharUtm('{"qr}')).toEqual({ valor: '{"qr}', formato: "texto" });
    expect(desembrulharUtm("")).toEqual({ valor: null, formato: "texto" });
    expect(desembrulharUtm(null)).toEqual({ valor: null, formato: "texto" });
    expect(desembrulharUtm(undefined)).toEqual({ valor: null, formato: "texto" });
  });
});
