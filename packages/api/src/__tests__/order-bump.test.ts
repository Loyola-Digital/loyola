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
  transacaoAgrupa,
  tiposQueAncoram,
  type LinhaDeVenda,
  tipoPadraoDaEtapa,
  type TipoDeProdutoNaVenda,
} from "../utils/order-bump.js";

/**
 * Story 18.68 — as linhas agora carregam DATA, porque a unidade de análise é o
 * checkout. `t` é o deslocamento em segundos dentro do mesmo checkout: sem ele
 * todas cairiam no mesmo instante e a janela nunca seria exercitada.
 */
const T0 = new Date("2026-07-20T10:00:00Z").getTime();
function venda(
  email: string,
  bruto: number,
  isOrderBump = false,
  utmSource: string | null = "meta",
  utmTerm: string | null = "hot_cbo",
  t = 0,
): LinhaDeVenda {
  return {
    email,
    bruto,
    tipo: isOrderBump ? "order_bump" : "ingresso",
    data: new Date(T0 + t * 1000),
    utmSource,
    utmTerm,
  };
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

  it("a representatividade é sobre a receita da CAPTAÇÃO (18.68, AC7)", () => {
    // ⚠️ MUDOU na 18.68. Antes o denominador era `principal + acessório +
    // avulso` (800 aqui). Agora é só a captação — 400 principal + 100
    // acessório = 500 — porque o avulso é venda de OUTRA oferta, e mantê-lo no
    // denominador dilui a métrica com receita que não é do funil.
    //
    // Medido em produção: no dg-pg02 o denominador antigo incluía R$ 252.772
    // de Mentoria, Automações e Comunidade, e a representatividade saía 2,95%
    // em vez de 6,39%.
    expect(r.faturamentoTotal).toBe(500);
    expect(r.representatividade).toBeCloseTo(100 / 500, 10);
  });

  it("o avulso NÃO entra no denominador", () => {
    // 100/800 = 12,5% era o número diluído da regra antiga.
    expect(r.representatividade).not.toBeCloseTo(100 / 800, 5);
    expect(r.bumpAvulso).toBe(300);
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

  it("Σ (AOV c/ bump × compradores) = receita da captação", () => {
    // Desde a 18.68 o `faturamentoTotal` JÁ é só a captação, então não há mais
    // o que subtrair — a tabela fecha com ele diretamente.
    const r = resumirOrderBump(FIXTURE, true);
    const t = tabelaPorPublico(FIXTURE);
    const soma = t.reduce((s, l) => s + l.aovComBump! * l.compradores, 0);
    expect(soma).toBeCloseTo(r.faturamentoTotal, 6);
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
  tipo: "ingresso" | "principal" | "order_bump" | "combo" | "upsell",
  utmSource: string | null = "meta",
  utmTerm: string | null = "hot",
  t = 0,
): LinhaDeVenda {
  return { email, bruto, tipo, data: new Date(T0 + t * 1000), utmSource, utmTerm };
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

// ============================================================================
// Gate QA (29.61) — venda sem rastreio é "Sem Track", nunca "Orgânico".
//
// A rota do perpétuo tem, poucas linhas acima do ponto que alimenta esta
// análise, um `sanitizeUtmValue(...) ?? SEM_ORIGEM_LABEL` — porque ali o valor
// vira rótulo de agrupamento. Repetir esse `??` no caminho da análise seria um
// defeito silencioso, e o teste abaixo é o que impede alguém de "harmonizar"
// as duas linhas depois.
// ============================================================================

describe("Gate QA — UTM ausente não pode virar Orgânico", () => {
  it("null é Sem Track", () => {
    expect(classificarPublicoDaVenda(null, null)).toBe("Sem Track");
    expect(classificarPublicoDaVenda(undefined, null)).toBe("Sem Track");
    expect(classificarPublicoDaVenda("", null)).toBe("Sem Track");
  });

  it("um RÓTULO de ausência seria classificado como Orgânico — a armadilha", () => {
    // Este teste documenta o defeito em vez de escondê-lo: `classifyOrigem` vê
    // uma string não vazia que não está em PAID_UTM_SOURCES e devolve
    // "Orgânico". Por isso o caminho da análise passa `null`.
    expect(classificarPublicoDaVenda("(sem origem)", null)).toBe("Orgânico");
  });

  it("o balde Sem Track é distinto do Orgânico na tabela", () => {
    const t = tabelaPorPublico([
      { email: "a@x.com", bruto: 100, tipo: "ingresso", data: new Date(T0), utmSource: null, utmTerm: null },
      { email: "b@x.com", bruto: 100, tipo: "ingresso", data: new Date(T0), utmSource: "instagram", utmTerm: null },
    ]);
    expect(t.map((l) => l.publico).sort()).toEqual(["Orgânico", "Sem Track"]);
  });
});

// ============================================================================
// Card de AOV no topo — o número precisa FECHAR com a linha "Total" da tabela
// por público, que fica logo abaixo dele na tela.
// ============================================================================

describe("AOV geral do card", () => {
  it("é (principal + bump acessório) ÷ compradores com principal", () => {
    const r = resumirOrderBump(FIXTURE, true);
    // 400 de principal + 100 de bump acessório, 3 compradores com principal.
    expect(r.aovGeral).toBeCloseTo(500 / 3, 10);
  });

  it("fecha com a linha Total da tabela por público", () => {
    // Se as bases divergissem, o card mostraria um número que não bate com
    // nenhuma linha da tabela logo abaixo, e o leitor tentaria reconciliar.
    const r = resumirOrderBump(FIXTURE, true);
    const t = tabelaPorPublico(FIXTURE);
    const n = t.reduce((s, l) => s + l.compradores, 0);
    const receita = t.reduce((s, l) => s + l.aovComBump! * l.compradores, 0);
    expect(r.aovGeral).toBeCloseTo(receita / n, 8);
  });

  it("NÃO inclui o comprador só-bump", () => {
    // Ele não tem produto principal: entrar no denominador puxaria o AOV para
    // baixo e o número deixaria de bater com a tabela.
    const r = resumirOrderBump(FIXTURE, true);
    expect(r.compradoresSoBump).toBe(1);
    expect(r.aovGeral).not.toBeCloseTo(800 / 4, 5);
  });

  it("sem compradores é null, não zero", () => {
    expect(resumirOrderBump([], true).aovGeral).toBeNull();
  });
});

// ============================================================================
// Story 18.68 — o CHECKOUT é a unidade, não o comprador.
//
// ⚠️ O fixture tem recompra distante E bump no mesmo segundo, de propósito.
// Com só um dos dois, trocar a chave de agrupamento não muda nada e metade
// destes testes seria decorativa.
// ============================================================================

function linha(
  email: string,
  bruto: number,
  tipo: "ingresso" | "principal" | "order_bump" | "combo" | "upsell",
  segundos: number,
  transacaoId: string | null = null,
): LinhaDeVenda {
  return {
    email, bruto, tipo,
    data: new Date(T0 + segundos * 1000),
    transacaoId,
    utmSource: "meta", utmTerm: "hot",
  };
}

/**
 * Reproduz o caso real: comprador leva ingresso + bump no mesmo checkout e,
 * 14 dias depois, compra o mesmo produto de bump de novo. A regra antiga
 * contava as duas como order bump.
 */
const DIA = 86_400;
const COM_RECOMPRA: LinhaDeVenda[] = [
  linha("a@x.com", 40, "ingresso", 0),
  linha("a@x.com", 197, "order_bump", 2),      // mesmo checkout
  linha("a@x.com", 197, "order_bump", 14 * DIA), // RECOMPRA, 14 dias depois
];

describe("Story 18.68 — recompra não é order bump (AC1)", () => {
  it("o bump de 14 dias depois vira checkout próprio", () => {
    const r = resumirOrderBump(COM_RECOMPRA, true);
    // Só o bump de 2s é acessório. O de 14 dias não tem principal no checkout
    // dele, então é venda avulsa.
    expect(r.bumpAcessorio).toBe(197);
    expect(r.bumpAvulso).toBe(197);
    // Com a regra antiga (por comprador) os dois somariam em acessório: 394.
    expect(r.bumpAcessorio).not.toBe(394);
  });

  it("o comprador conta uma vez na captação, não duas", () => {
    const r = resumirOrderBump(COM_RECOMPRA, true);
    expect(r.compradoresComPrincipal).toBe(1);
    expect(r.compradoresComBump).toBe(1);
  });
});

describe("Story 18.68 — a janela agrupa em CADEIA (AC5)", () => {
  it("três linhas a 0s, 2s e 4s são UM checkout", () => {
    const r = resumirOrderBump([
      linha("b@x.com", 40, "ingresso", 0),
      linha("b@x.com", 197, "order_bump", 2),
      linha("b@x.com", 97, "upsell", 4),
    ], true);
    expect(r.compradoresComPrincipal).toBe(1);
    expect(r.bumpAvulso).toBe(0);
  });

  it("uma cadeia longa não se parte se cada passo cabe na janela", () => {
    // 0, 50, 100, 150 — cada passo tem 50s, mas a ponta está a 150s do início.
    // Comparar com a PRIMEIRA linha partiria isso em dois checkouts.
    const r = resumirOrderBump([
      linha("c@x.com", 40, "ingresso", 0),
      linha("c@x.com", 10, "order_bump", 50),
      linha("c@x.com", 10, "order_bump", 100),
      linha("c@x.com", 10, "order_bump", 150),
    ], true);
    expect(r.compradoresComPrincipal).toBe(1);
    expect(r.bumpAcessorio).toBe(30);
  });

  it("acima da janela, separa", () => {
    const r = resumirOrderBump([
      linha("d@x.com", 40, "ingresso", 0),
      linha("d@x.com", 197, "order_bump", 61),
    ], true);
    expect(r.bumpAcessorio).toBe(0);
    expect(r.bumpAvulso).toBe(197);
  });
});

describe("Story 18.68 — cascata de sinais (AC2/AC3)", () => {
  it("`transactionId` que AGRUPA é usado, e o sinal é declarado", () => {
    const r = resumirOrderBump([
      linha("e@x.com", 40, "ingresso", 0, "PED-1"),
      // 2 horas depois, mas MESMO pedido: a transação manda.
      linha("e@x.com", 197, "order_bump", 7200, "PED-1"),
    ], true);
    expect(r.sinalDeCheckout).toBe("transacao");
    expect(r.bumpAcessorio).toBe(197);
  });

  it("`transactionId` com valores TODOS ÚNICOS não é ID de pedido", () => {
    // É o caso real do dg-pg02: `Transaction` é igual ao ID da linha. Usá-lo
    // reportaria zero order bump, em silêncio.
    const linhas = [
      linha("f@x.com", 40, "ingresso", 0, "LINHA-1"),
      linha("f@x.com", 197, "order_bump", 2, "LINHA-2"),
    ];
    expect(transacaoAgrupa(linhas)).toBe(false);
    const r = resumirOrderBump(linhas, true);
    expect(r.sinalDeCheckout).toBe("janela");
    expect(r.bumpAcessorio).toBe(197);
  });

  it("sem data e sem transação que agrupe, a análise não sai (AC4)", () => {
    const semData: LinhaDeVenda[] = [
      { email: "g@x.com", bruto: 40, tipo: "ingresso", data: null },
      { email: "g@x.com", bruto: 197, tipo: "order_bump", data: null },
    ];
    const r = resumirOrderBump(semData, true);
    expect(r.sinalDeCheckout).toBe("indisponivel");
    // Não cai de volta para agrupar por comprador — que era o defeito.
    expect(r.compradoresComPrincipal).toBe(0);
    expect(r.representatividade).toBeNull();
  });
});

// ============================================================================
// Story 18.69 — Combo é um tipo próprio, com números próprios.
// ============================================================================

/** Ingresso R$ 39,90 + bump R$ 197 num checkout; combo R$ 236,90 em outro. */
const COM_COMBO: LinhaDeVenda[] = [
  linha("h@x.com", 39.9, "ingresso", 0),
  linha("h@x.com", 197, "order_bump", 1),
  linha("i@x.com", 236.9, "combo", 10),
  linha("j@x.com", 39.9, "ingresso", 20),
];

describe("Story 18.69 — o combo entra na captação (AC1)", () => {
  it("checkout só com combo É checkout de captação", () => {
    // Gate PO (F1): se "captação" exigisse o produto de ENTRADA, este checkout
    // sairia do denominador — 68% dele no dg-pg02.
    const r = resumirOrderBump(COM_COMBO, true);
    expect(r.compradoresComPrincipal).toBe(3);
    expect(r.faturamentoTotal).toBeCloseTo(39.9 + 197 + 236.9 + 39.9, 6);
  });

  it("o combo tem representatividade e conversão próprias", () => {
    const r = resumirOrderBump(COM_COMBO, true);
    expect(r.comboReceita).toBeCloseTo(236.9, 6);
    expect(r.compradoresComCombo).toBe(1);
    expect(r.taxaDeCombo).toBeCloseTo(1 / 3, 10);
  });

  it("combo NUNCA é somado ao order bump", () => {
    // Decisão do gestor: dois blocos, sem total. Se somassem, a
    // representatividade seria (197+236,90)/513,70 = 84%.
    const r = resumirOrderBump(COM_COMBO, true);
    expect(r.representatividade).toBeCloseTo(197 / 513.7, 6);
    expect(r.comboRepresentatividade).toBeCloseTo(236.9 / 513.7, 6);
    expect(r.representatividade! + r.comboRepresentatividade!).toBeLessThan(1);
  });

  it("a tabela por público quebra as duas ofertas", () => {
    const t = tabelaPorPublico(COM_COMBO);
    const quente = t.find((l) => l.publico === "Pago quente")!;
    expect(quente.compradores).toBe(3);
    expect(quente.compradoresComBump).toBe(1);
    expect(quente.compradoresComCombo).toBe(1);
    expect(quente.taxaCombo).toBeCloseTo(1 / 3, 10);
  });
});

// ============================================================================
// Story 18.68 (AC7) — ingresso é da CAPTAÇÃO; principal é de outra etapa.
//
// O caso que motivou: a planilha do dg-pg02 tem Mentoria ClaudeLab (R$ 4.500)
// e Automações e Sistemas (R$ 5.000) misturadas com os ingressos de R$ 39,90.
// Enquanto "não classificado" virava `principal` e `principal` ancorava a
// captação, essas vendas dobravam o denominador.
// ============================================================================

describe("Story 18.68 (AC7) — produto de outra etapa fica fora do denominador", () => {
  const COM_OUTRA_ETAPA: LinhaDeVenda[] = [
    linha("k@x.com", 39.9, "ingresso", 0),
    linha("k@x.com", 197, "order_bump", 1),
    // Mentoria: produto da etapa de Vendas, na mesma planilha.
    linha("z@x.com", 4500, "principal", 5000),
  ];

  it("a Mentoria não entra na receita da captação", () => {
    const r = resumirOrderBump(COM_OUTRA_ETAPA, true);
    expect(r.faturamentoTotal).toBeCloseTo(39.9 + 197, 6);
    // Com ela dentro seriam R$ 4.736,90 e a representatividade cairia de
    // 83% para 4% — foi o que aconteceu na medição contra produção.
    expect(r.faturamentoTotal).not.toBeCloseTo(4736.9, 2);
  });

  it("e não conta como comprador da captação", () => {
    const r = resumirOrderBump(COM_OUTRA_ETAPA, true);
    expect(r.compradoresComPrincipal).toBe(1);
  });

  it("`principal` ANCORA quando não há ingresso classificado (o Perpétuo)", () => {
    // Retrocompatibilidade: no Perpétuo o produto vendido é o `principal` e não
    // existe ingresso. Se `principal` deixasse de ancorar, o perpétuo zeraria.
    const perpetuo: LinhaDeVenda[] = [
      linha("p1@x.com", 347, "principal", 0),
      linha("p1@x.com", 97, "order_bump", 2),
    ];
    const r = resumirOrderBump(perpetuo, true);
    expect(r.compradoresComPrincipal).toBe(1);
    expect(r.faturamentoTotal).toBeCloseTo(444, 6);
  });

  it("a presença de UM ingresso já muda quem ancora", () => {
    const s = tiposQueAncoram([linha("x@x.com", 10, "ingresso", 0)]);
    expect(s.has("ingresso")).toBe(true);
    expect(s.has("principal")).toBe(false);
    const semIngresso = tiposQueAncoram([linha("y@x.com", 10, "principal", 0)]);
    expect(semIngresso.has("principal")).toBe(true);
  });
});

describe("Story 18.68 — produto não classificado DENTRO do checkout de captação", () => {
  it("soma na receita: foi pago no mesmo pedido", () => {
    // Caso real: 25 vendas de "Claude para Negócios" (R$ 1.925) no dg-pg04,
    // dentro de checkouts de captação, sem classificação.
    const r = resumirOrderBump([
      linha("m@x.com", 39.9, "ingresso", 0),
      linha("m@x.com", 77, "principal", 2), // não classificado, mesmo checkout
    ], true);
    expect(r.faturamentoTotal).toBeCloseTo(116.9, 6);
  });

  it("a ordem no array não muda o resultado (dois passes)", () => {
    // Um passe só decidiria "é captação?" na ordem de leitura: o produto que
    // viesse ANTES do ingresso ficaria de fora.
    const depois = resumirOrderBump([
      linha("n@x.com", 39.9, "ingresso", 0),
      linha("n@x.com", 77, "principal", 2),
    ], true);
    const antes = resumirOrderBump([
      linha("o@x.com", 77, "principal", 0),
      linha("o@x.com", 39.9, "ingresso", 2),
    ], true);
    expect(antes.faturamentoTotal).toBeCloseTo(depois.faturamentoTotal, 6);
  });
});

// ============================================================
// Story 18.70 (AC7) — o default por etapa, e por que ele contamina o conjunto.
// ============================================================
describe("tipoPadraoDaEtapa", () => {
  it("captação: produto não classificado é ingresso", () => {
    expect(tipoPadraoDaEtapa("paid")).toBe("ingresso");
    expect(tipoPadraoDaEtapa("event_capture")).toBe("ingresso");
  });

  it("etapa de Vendas: produto não classificado é principal", () => {
    expect(tipoPadraoDaEtapa("sales")).toBe("principal");
  });
});

describe("uma linha não classificada não pode derrubar o denominador (18.70)", () => {
  const linha = (email: string, tipo: TipoDeProdutoNaVenda, bruto: number): LinhaDeVenda => ({
    email, tipo, bruto, data: new Date("2026-08-01T10:00:00Z"),
    transacaoId: null, utmSource: null, utmTerm: null,
  });

  /**
   * O caso real do `dg-pg02`: 4 compras de planilha classificadas `principal`
   * e 1 venda manual cujo produto tem grafia diferente.
   */
  const CLASSIFICADAS = [
    linha("a@x.com", "principal", 4500),
    linha("b@x.com", "principal", 4500),
    linha("c@x.com", "principal", 3000),
    linha("d@x.com", "principal", 3000),
  ];
  const MANUAL_VALOR = 2500;

  it("com o default certo, a manual SOMA ao denominador", () => {
    const linhas = [...CLASSIFICADAS, linha("e@x.com", tipoPadraoDaEtapa("sales"), MANUAL_VALOR)];
    const r = resumirOrderBump(linhas, false);
    expect(r.faturamentoPrincipal).toBe(15000 + MANUAL_VALOR);
    expect(r.compradoresComPrincipal).toBe(5);
  });

  it("com o default errado, a manual EXPULSA as outras quatro", () => {
    // A regressão que o AC7 fecha: `tiposQueAncoram` decide pelo conjunto, e
    // uma única linha `ingresso` troca as âncoras de {principal,combo} para
    // {ingresso,combo}. As 4 classificadas somem e sobra a manual sozinha —
    // que foi exatamente o R$ 31.300 medido em produção.
    const linhas = [...CLASSIFICADAS, linha("e@x.com", "ingresso", MANUAL_VALOR)];
    const r = resumirOrderBump(linhas, false);
    expect(r.faturamentoPrincipal).toBe(MANUAL_VALOR);
    expect(r.compradoresComPrincipal).toBe(1);
  });

  it("a captação não muda: lá o ingresso é quem deve ancorar", () => {
    // AC8 — nenhuma regressão na Captação Paga.
    const linhas = [
      linha("a@x.com", tipoPadraoDaEtapa("paid"), 29.9),
      linha("b@x.com", tipoPadraoDaEtapa("paid"), 29.9),
      linha("c@x.com", "combo", 226.9),
    ];
    const r = resumirOrderBump(linhas, false);
    expect(r.faturamentoPrincipal).toBeCloseTo(29.9 + 29.9 + 226.9, 2);
    expect(r.compradoresComPrincipal).toBe(3);
  });
});
