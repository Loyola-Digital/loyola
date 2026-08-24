/**
 * Stories 18.66 e 18.67 — verificação por reversão.
 *
 * As tabelas do "🧪 Verificação por reversão" das duas stories. Cada teste tem
 * que FALHAR com o defeito de volta.
 *
 * Os fixtures reproduzem os dois casos que a medição em produção mostrou serem
 * decisivos e que dados "bem-comportados" não exercitam:
 *   - comprador SÓ com bump (111 em produção, 10% do total)
 *   - comprador com DOIS bumps (4 em produção)
 */
import { describe, it, expect } from "vitest";
import {
  resumirOrderBump,
  tabelaPorPublico,
  classificarPublicoDaVenda,
  PISO_DE_AMOSTRA,
  type LinhaDeVenda,
} from "../utils/order-bump.js";

function venda(
  email: string,
  bruto: number,
  isOrderBump = false,
  utmSource: string | null = "meta",
  utmTerm: string | null = "hot_cbo",
): LinhaDeVenda {
  return { email, bruto, isOrderBump, utmSource, utmTerm };
}

/**
 * Fixture desenhado sobre a forma real da planilha do DG & CPDF:
 * - 2 compradores pagos quentes, um deles com bump
 * - 1 comprador orgânico com DOIS bumps (o caso que separa linha de comprador)
 * - 1 comprador SÓ com bump (sem principal) — o caso que separa acessório de avulso
 */
const FIXTURE: LinhaDeVenda[] = [
  venda("quente1@x.com", 100),
  venda("quente2@x.com", 100),
  venda("quente2@x.com", 50, true),
  venda("organico@x.com", 200, false, "instagram", null),
  venda("organico@x.com", 30, true, "instagram", null),
  venda("organico@x.com", 20, true, null, null),
  venda("sobump@x.com", 300, true, null, null),
];

describe("acessório e avulso são coisas diferentes (18.66, AC1)", () => {
  const r = resumirOrderBump(FIXTURE, true);

  it("bump de quem tem principal é acessório", () => {
    // quente2 (50) + organico (30+20) = 100
    expect(r.bumpAcessorio).toBe(100);
  });

  it("bump de quem NÃO tem principal é avulso, e não entra na conta do bump", () => {
    // Sem esta separação, os 300 de `sobump@x.com` entrariam como bump e a
    // representatividade saltaria de 12,5% para 50% — o mesmo salto que em
    // produção leva 26,3% para 45,58%.
    expect(r.bumpAvulso).toBe(300);
    expect(r.compradoresSoBump).toBe(1);
  });

  it("a representatividade usa só o acessório sobre o total", () => {
    // total = 400 principal + 100 acessório + 300 avulso = 800
    expect(r.faturamentoTotal).toBe(800);
    expect(r.representatividade).toBeCloseTo(100 / 800, 10);
  });

  it("o denominador é o TOTAL, não o principal", () => {
    // 100/400 = 25% seria o número inflado.
    expect(r.representatividade).not.toBeCloseTo(100 / 400, 5);
  });
});

describe("a contagem é de compradores, não de linhas (18.66, AC4)", () => {
  const r = resumirOrderBump(FIXTURE, true);

  it("comprador com DOIS bumps conta uma vez", () => {
    // 3 linhas de bump acessório (quente2 + organico×2), mas 2 compradores.
    expect(r.compradoresComBump).toBe(2);
    expect(r.compradoresComPrincipal).toBe(3);
    expect(r.taxaDeAdesao).toBeCloseTo(2 / 3, 10);
  });

  it("o comprador só-bump não entra no denominador", () => {
    // Ele não tem produto principal — não é "um comprador que não aderiu".
    expect(r.compradoresComPrincipal).toBe(3);
  });
});

describe("sem faturamento não há representatividade", () => {
  it("lista vazia devolve null, não zero", () => {
    const r = resumirOrderBump([], true);
    expect(r.representatividade).toBeNull();
    expect(r.taxaDeAdesao).toBeNull();
  });

  it("`temConfiguracao` é o que a UI usa para sumir com o card (AC5)", () => {
    expect(resumirOrderBump(FIXTURE, false).temConfiguracao).toBe(false);
  });
});

describe("os cinco públicos (18.67, AC1)", () => {
  it("origem e temperatura se cruzam só nos pagos", () => {
    expect(classificarPublicoDaVenda("meta", "hot_cbo")).toBe("Pago quente");
    expect(classificarPublicoDaVenda("meta", "cold_abo")).toBe("Pago frio");
    expect(classificarPublicoDaVenda("meta", "xyz")).toBe("Pago indefinido");
    expect(classificarPublicoDaVenda("instagram", "hot")).toBe("Orgânico");
    expect(classificarPublicoDaVenda(null, "hot")).toBe("Sem Track");
  });

  it("orgânico NÃO herda temperatura — inventá-la seria classificação nova", () => {
    expect(classificarPublicoDaVenda("manychat", "cold")).toBe("Orgânico");
  });
});

describe("o público vem do produto PRINCIPAL (18.67, AC2)", () => {
  it("bump sem utm_term não joga o comprador em indefinido", () => {
    // As 2 linhas de bump de `organico@x.com` têm utm nula ou orgânica — em
    // produção, 54% das linhas de bump não têm `utm_term`. Se o público viesse
    // da linha do bump, este comprador cairia em "Sem Track".
    const t = tabelaPorPublico(FIXTURE);
    const org = t.find((l) => l.publico === "Orgânico")!;
    expect(org.compradores).toBe(1);
    expect(org.receitaBump).toBe(50);
    expect(t.find((l) => l.publico === "Sem Track")).toBeUndefined();
  });
});

describe("taxa de bump e AOV por público (18.67, AC3/AC4)", () => {
  const t = tabelaPorPublico(FIXTURE);

  it("a taxa conta compradores, não linhas de bump", () => {
    const org = t.find((l) => l.publico === "Orgânico")!;
    // 2 linhas de bump, 1 comprador → 100%, não 200%.
    expect(org.compradoresComBump).toBe(1);
    expect(org.taxaBump).toBe(1);
  });

  it("as duas colunas de AOV, e a diferença entre elas", () => {
    const quente = t.find((l) => l.publico === "Pago quente")!;
    expect(quente.compradores).toBe(2);
    expect(quente.aovSemBump).toBe(100);        // 200 / 2
    expect(quente.aovComBump).toBe(125);        // 250 / 2
    // O delta é o que justifica investir no bump — uma coluna só o esconde.
    expect(quente.aovComBump! / quente.aovSemBump! - 1).toBeCloseTo(0.25, 10);
  });

  it("o comprador só-bump não aparece em público nenhum", () => {
    // Ele não tem principal, logo não tem origem conhecida. Atribuí-lo a um
    // público seria inventar de onde a venda veio.
    const totalCompradores = t.reduce((s, l) => s + l.compradores, 0);
    expect(totalCompradores).toBe(3);
  });
});

describe("a tabela fecha com a etapa (18.67, AC5)", () => {
  it("Σ compradores = compradores com principal", () => {
    const r = resumirOrderBump(FIXTURE, true);
    const t = tabelaPorPublico(FIXTURE);
    expect(t.reduce((s, l) => s + l.compradores, 0)).toBe(r.compradoresComPrincipal);
  });

  it("Σ (AOV c/ bump × compradores) = faturamento − bump avulso", () => {
    const r = resumirOrderBump(FIXTURE, true);
    const t = tabelaPorPublico(FIXTURE);
    const soma = t.reduce((s, l) => s + l.aovComBump! * l.compradores, 0);
    expect(soma).toBeCloseTo(r.faturamentoTotal - r.bumpAvulso, 6);
  });
});

describe("baldes vazios e ordenação (18.67, AC6/AC7)", () => {
  it("público sem comprador não vira linha", () => {
    const t = tabelaPorPublico(FIXTURE);
    expect(t.map((l) => l.publico).sort()).toEqual(["Orgânico", "Pago quente"]);
  });

  it("ordena por compradores, não por taxa", () => {
    // "Orgânico" tem taxa 100% e 1 comprador; "Pago quente" tem 50% e 2.
    // Ordenar por taxa poria um balde de 1 pessoa no topo.
    const t = tabelaPorPublico(FIXTURE);
    expect(t[0]!.publico).toBe("Pago quente");
  });
});

describe("comprador anônimo", () => {
  it("duas linhas sem e-mail são dois compradores, não um", () => {
    // Colapsá-las num balde único faria N anônimos virarem um comprador com
    // receita somada, e o AOV do público deles explodiria.
    const t = tabelaPorPublico([
      venda("", 100, false, null, null),
      venda("", 300, false, null, null),
    ]);
    const semTrack = t.find((l) => l.publico === "Sem Track")!;
    expect(semTrack.compradores).toBe(2);
    expect(semTrack.aovSemBump).toBe(200);
  });
});

// ============================================================================
// Story 29.61 — upsell como alavanca SEPARADA, e o piso de amostra.
//
// O Perpétuo classifica em três tipos (`principal`, `order_bump`, `upsell`)
// desde a 29.49; a Captação Paga só marca "é bump ou não é". Bump acontece no
// checkout e upsell depois da compra — fundi-los esconderia qual das duas está
// funcionando, que é a única pergunta que a coluna responde.
//
// ⚠️ O fixture tem comprador com bump E upsell de propósito. Sem ele, somar as
// duas colunas e separá-las dá o mesmo número e o AC3 não é exercitado.
// ============================================================================

function vendaPerp(
  email: string,
  bruto: number,
  tipo: "principal" | "order_bump" | "upsell",
  utmSource: string | null = "meta",
  utmTerm: string | null = "hot",
): LinhaDeVenda {
  return {
    email,
    bruto,
    isOrderBump: tipo === "order_bump",
    isUpsell: tipo === "upsell",
    utmSource,
    utmTerm,
  };
}

/** 12 compradores pagos quentes (acima do piso) + 2 orgânicos (abaixo). */
const PERP: LinhaDeVenda[] = [
  ...Array.from({ length: 12 }, (_, i) => vendaPerp(`q${i}@x.com`, 347, "principal")),
  // q0 leva bump E upsell — o caso que separa as duas colunas.
  vendaPerp("q0@x.com", 97, "order_bump"),
  vendaPerp("q0@x.com", 497, "upsell"),
  // q1 leva só bump.
  vendaPerp("q1@x.com", 97, "order_bump"),
  // q2 leva só upsell.
  vendaPerp("q2@x.com", 497, "upsell"),
  vendaPerp("o1@x.com", 347, "principal", "instagram", null),
  vendaPerp("o2@x.com", 347, "principal", "instagram", null),
  vendaPerp("o1@x.com", 97, "order_bump", "instagram", null),
];

describe("Story 29.61 — upsell é alavanca separada do bump (AC3)", () => {
  const t = tabelaPorPublico(PERP);
  const quente = t.find((l) => l.publico === "Pago quente")!;

  it("as duas taxas são contadas separadamente", () => {
    // 2 de 12 com bump (q0, q1); 2 de 12 com upsell (q0, q2).
    expect(quente.compradoresComBump).toBe(2);
    expect(quente.compradoresComUpsell).toBe(2);
    expect(quente.taxaBump).toBeCloseTo(2 / 12, 10);
    expect(quente.taxaUpsell).toBeCloseTo(2 / 12, 10);
  });

  it("o comprador com AMBOS conta uma vez em cada, não duas em nenhuma", () => {
    // Se upsell caísse no balde de bump, `compradoresComBump` seria 3.
    expect(quente.compradoresComBump).not.toBe(3);
    expect(quente.compradoresComUpsell).not.toBe(3);
  });

  it("a receita de upsell não é somada à de bump", () => {
    expect(quente.receitaBump).toBe(97 * 2);
    expect(quente.receitaUpsell).toBe(497 * 2);
  });
});

describe("Story 29.61 — o AOV soma TODOS os adicionais (AC4)", () => {
  const quente = tabelaPorPublico(PERP).find((l) => l.publico === "Pago quente")!;

  it("AOV sem adicionais é só o principal", () => {
    expect(quente.aovSemBump).toBe(347); // 12 × 347 / 12
  });

  it("AOV com adicionais inclui bump E upsell", () => {
    // (12×347 + 2×97 + 2×497) / 12
    expect(quente.aovComBump).toBeCloseTo((12 * 347 + 194 + 994) / 12, 8);
  });

  it("num funil de preço fixo, a diferença entre as colunas é a informação", () => {
    // O AOV sem adicionais é constante (preço único); só a segunda coluna varia.
    expect(quente.aovComBump! - quente.aovSemBump!).toBeCloseTo(99, 6);
  });
});

describe("Story 29.61 (AC3-bis) — piso de amostra", () => {
  const t = tabelaPorPublico(PERP);

  it("balde abaixo do piso é marcado", () => {
    // 2 compradores orgânicos: a taxa de 50% dali não tem a mesma autoridade
    // que a de 12 compradores.
    const org = t.find((l) => l.publico === "Orgânico")!;
    expect(org.compradores).toBe(2);
    expect(org.amostraBaixa).toBe(true);
  });

  it("balde acima do piso não é marcado", () => {
    expect(t.find((l) => l.publico === "Pago quente")!.amostraBaixa).toBe(false);
  });

  it("a linha NÃO some — o balde existe e o AOV dele vale", () => {
    expect(t.find((l) => l.publico === "Orgânico")).toBeDefined();
    expect(t.find((l) => l.publico === "Orgânico")!.aovSemBump).toBe(347);
  });

  it("exatamente no piso já conta como amostra normal", () => {
    const dez = Array.from({ length: PISO_DE_AMOSTRA }, (_, i) =>
      vendaPerp(`d${i}@x.com`, 100, "principal"),
    );
    expect(tabelaPorPublico(dez)[0]!.amostraBaixa).toBe(false);
  });
});

describe("Story 29.61 — a Captação Paga não regride", () => {
  it("linhas sem `isUpsell` seguem funcionando, com upsell zerado", () => {
    // A 18.67 não passa o campo. Se `undefined` caísse no ramo de upsell, o
    // produto principal viraria adicional e o AOV sem bump iria a zero.
    const t = tabelaPorPublico(FIXTURE);
    for (const l of t) {
      expect(l.compradoresComUpsell).toBe(0);
      expect(l.receitaUpsell).toBe(0);
      expect(l.aovSemBump).toBeGreaterThan(0);
    }
  });
});
