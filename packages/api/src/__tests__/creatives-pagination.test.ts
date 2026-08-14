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
  spend: number;
}

/** Mesma regra do endpoint (`public-meta.ts`). */
function ordenar(criativos: Criativo[]): Criativo[] {
  return [...criativos].sort((a, b) => {
    const d = b.spend - a.spend;
    return d !== 0 ? d : a.adId.localeCompare(b.adId);
  });
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
    const semDesempate = (arr: Criativo[]) => [...arr].sort((x, y) => y.spend - x.spend);
    const a = semDesempate(muitos).map((c) => c.adId);
    const b = semDesempate([...muitos].reverse()).map((c) => c.adId);
    expect(a).not.toEqual(b);
  });

  it("a métrica continua sendo o critério principal", () => {
    const ord = ordenar(muitos);
    for (let i = 1; i < ord.length; i++) {
      expect(ord[i - 1].spend).toBeGreaterThanOrEqual(ord[i].spend);
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
