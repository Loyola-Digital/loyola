import { describe, it, expect } from "vitest";

/**
 * Story 43.4 — paginação do `/creatives`.
 *
 * O handler é uma rota Fastify com banco, então o que se testa aqui é a REGRA
 * que a story introduziu: ordenar com desempate estável e fatiar por
 * `offset`/`limit` sem repetir nem pular.
 *
 * O desempate por `adId` é o ponto. Ordenar só pela métrica deixa a ordem
 * indefinida entre empatados, e aí duas requisições consecutivas podem devolver
 * o mesmo criativo duas vezes — ou nenhuma. É o mesmo defeito que o QA-15
 * apontou na paginação do backfill da 42.6.
 */

interface Criativo {
  adId: string;
  /**
   * `null` é o caso que faltava: `safeDiv` devolve `null` sem denominador, e
   * 6 dos 10 `orderBy` da rota passam por ele (`ctr`, `cpc`, `cpm`, `cpl`,
   * `cpa`, `roas`). Até a 44.24 este teste só usava números, e por isso não
   * enxergava o defeito.
   */
  spend: number | null;
}

/**
 * Mesma regra do endpoint (`public-meta.ts`).
 *
 * ⚠️ Story 44.24 — **compara, não subtrai**. A versão anterior fazia
 * `orderVal(b) - orderVal(a)`, o que para duas métricas nulas (`-Infinity` nos
 * dois lados) dá **NaN** — e `NaN !== 0` é `true`, então o desempate por `adId`
 * nunca era alcançado. Ver o describe "métrica nula" no fim deste arquivo.
 */
function ordenar(criativos: Criativo[]): Criativo[] {
  return [...criativos].sort((a, b) => {
    const va = valorDeOrdem(a);
    const vb = valorDeOrdem(b);
    if (va < vb) return 1;
    if (va > vb) return -1;
    return a.adId.localeCompare(b.adId);
  });
}

/** O que o endpoint faz com métrica ausente: `null` vira `-Infinity`. */
function valorDeOrdem(c: Criativo): number {
  return typeof c.spend === "number" ? c.spend : -Infinity;
}

function paginar(criativos: Criativo[], offset: number, limit: number) {
  const ordenados = ordenar(criativos);
  const pagina = ordenados.slice(offset, offset + limit);
  return {
    total: ordenados.length,
    returned: pagina.length,
    offset,
    truncated: offset + pagina.length < ordenados.length,
    creatives: pagina,
  };
}

/** 448 criativos, com MUITOS empates de spend — o caso que quebra sem desempate. */
const muitos: Criativo[] = Array.from({ length: 448 }, (_, i) => ({
  adId: `ad_${String(i).padStart(4, "0")}`,
  spend: Math.floor(i / 10) * 100, // 10 criativos por valor de spend
}));

describe("ordenação estável", () => {
  it("empate é desfeito por adId, não pela ordem de entrada", () => {
    const a = ordenar(muitos);
    const b = ordenar([...muitos].reverse());
    expect(a.map((c) => c.adId)).toEqual(b.map((c) => c.adId));
  });

  it("sem desempate, a mesma entrada embaralhada daria ordens diferentes", () => {
    // Contraprova: é isto que a story evita.
    // Usa `valorDeOrdem` para não repetir a coerção de `null` aqui — e porque
    // o ponto desta contraprova é a AUSÊNCIA do desempate, não o tipo.
    const semDesempate = (arr: Criativo[]) =>
      [...arr].sort((x, y) => valorDeOrdem(y) - valorDeOrdem(x));
    const a = semDesempate(muitos).map((c) => c.adId);
    const b = semDesempate([...muitos].reverse()).map((c) => c.adId);
    expect(a).not.toEqual(b);
  });

  it("a métrica continua sendo o critério principal", () => {
    const ord = ordenar(muitos);
    for (let i = 1; i < ord.length; i++) {
      expect(valorDeOrdem(ord[i - 1]!)).toBeGreaterThanOrEqual(valorDeOrdem(ord[i]!));
    }
  });
});

describe("paginação sem repetir nem pular (AC4)", () => {
  it("448 criativos saem completos em 3 requisições de 200", () => {
    const p1 = paginar(muitos, 0, 200);
    const p2 = paginar(muitos, 200, 200);
    const p3 = paginar(muitos, 400, 200);

    expect(p1.returned).toBe(200);
    expect(p2.returned).toBe(200);
    expect(p3.returned).toBe(48);

    const ids = [...p1.creatives, ...p2.creatives, ...p3.creatives].map((c) => c.adId);
    expect(ids).toHaveLength(448);
    expect(new Set(ids).size).toBe(448); // nenhum repetido
    expect(new Set(ids)).toEqual(new Set(muitos.map((c) => c.adId))); // nenhum pulado
  });

  it("`truncated` diz quando ainda falta", () => {
    expect(paginar(muitos, 0, 200).truncated).toBe(true);
    expect(paginar(muitos, 400, 200).truncated).toBe(false);
  });

  it("o default de limit=50 sinaliza truncamento — 50 de 448 não é o conjunto", () => {
    // Sem `total`/`truncated`, esta resposta PARECE completa. Era o defeito.
    const p = paginar(muitos, 0, 50);
    expect(p.returned).toBe(50);
    expect(p.total).toBe(448);
    expect(p.truncated).toBe(true);
  });

  it("offset além do fim devolve lista vazia sem truncated", () => {
    const p = paginar(muitos, 500, 200);
    expect(p.returned).toBe(0);
    expect(p.truncated).toBe(false); // não há o que buscar adiante
    expect(p.total).toBe(448);
  });

  it("página única cobre tudo quando limit ≥ total", () => {
    const p = paginar(muitos, 0, 500);
    expect(p.returned).toBe(448);
    expect(p.truncated).toBe(false);
  });
});


// ============================================================
// Story 44.24 (QA-4424-01) — métrica nula quebrava o desempate
// ============================================================

/** O comparador ANTIGO, preservado para a contraprova. */
function ordenarComoAntes(criativos: Criativo[]): Criativo[] {
  return [...criativos].sort((a, b) => {
    const d = valorDeOrdem(b) - valorDeOrdem(a);
    return d !== 0 ? d : a.adId.localeCompare(b.adId);
  });
}

/**
 * Todo mundo com a métrica nula — o caso real: num projeto de geração de leads
 * `purchases = 0` em todo criativo, então `cpa` e `roas` são `null` em TODOS.
 */
const todosNulos: Criativo[] = Array.from({ length: 30 }, (_, i) => ({
  adId: `ad_${String(i).padStart(4, "0")}`,
  spend: null,
}));

describe("métrica nula — o desempate tem que continuar valendo", () => {
  it("com a métrica nula em todos, ordena por adId", () => {
    const r = ordenar(todosNulos);
    expect(r.map((c) => c.adId)).toEqual(
      [...todosNulos].map((c) => c.adId).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("a ordem não depende da ordem de entrada — é o que paginar exige", () => {
    const a = ordenar(todosNulos).map((c) => c.adId);
    const b = ordenar([...todosNulos].reverse()).map((c) => c.adId);
    expect(a).toEqual(b);
  });

  it("CONTRAPROVA: o comparador antigo devolvia NaN e não desempatava", () => {
    // `-Infinity - (-Infinity)` = NaN; `NaN !== 0` é true, então o
    // `localeCompare` nunca era alcançado e sobrava a ordem de entrada.
    const antes = ordenarComoAntes(todosNulos).map((c) => c.adId);
    const antesInvertido = ordenarComoAntes([...todosNulos].reverse()).map((c) => c.adId);
    expect(antes).not.toEqual(antesInvertido);

    // E este é o ponto: com o fix, as duas coincidem.
    const depois = ordenar(todosNulos).map((c) => c.adId);
    const depoisInvertido = ordenar([...todosNulos].reverse()).map((c) => c.adId);
    expect(depois).toEqual(depoisInvertido);
  });

  it("nulo perde para número — ausência vai para o fim, nunca para o topo", () => {
    const misto: Criativo[] = [
      { adId: "ad_nulo", spend: null },
      { adId: "ad_zero", spend: 0 },
      { adId: "ad_alto", spend: 900 },
    ];
    expect(ordenar(misto).map((c) => c.adId)).toEqual(["ad_alto", "ad_zero", "ad_nulo"]);
  });

  it("paginar sobre métricas nulas não repete nem pula criativo", () => {
    const vistos = new Set<string>();
    for (let off = 0; off < todosNulos.length; off += 7) {
      for (const c of paginar(todosNulos, off, 7).creatives) {
        expect(vistos.has(c.adId)).toBe(false);
        vistos.add(c.adId);
      }
    }
    expect(vistos.size).toBe(todosNulos.length);
  });
});
