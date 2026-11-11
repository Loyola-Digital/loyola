import { describe, expect, it } from "vitest";
import { agruparPorTema, leituraDosTemas } from "../instagram-temas";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";

let n = 0;
function post(over: Partial<InstagramMedia> = {}): InstagramMedia {
  return {
    id: `m${n++}`,
    media_type: "IMAGE",
    media_product_type: "FEED",
    timestamp: "2026-10-15T12:00:00+0000",
    reach: 10_000,
    shares: 50,
    saved: 50,
    like_count: 100,
    comments_count: 10,
    ...over,
  };
}

/** Post do tema com o interesse/mil que eu quiser. */
const doTema = (tema: string, sinal: number, extra: Partial<InstagramMedia> = {}) =>
  post({ tema, reach: 10_000, shares: sinal * 10, saved: 0, ...extra });

describe("agruparPorTema", () => {
  it("ignora post sem tema em vez de criar um grupo vazio", () => {
    const linhas = agruparPorTema([post({ tema: null }), post({ tema: "   " }), doTema("Família", 5)]);
    expect(linhas.map((l) => l.tema)).toEqual(["Família"]);
    expect(linhas[0].posts).toBe(1);
  });

  it("ordena pelo que mais se espalha, não pelo que mais se publica", () => {
    const linhas = agruparPorTema([
      doTema("Muito publicado", 2),
      doTema("Muito publicado", 2),
      doTema("Muito publicado", 2),
      doTema("Pouco publicado", 20),
    ]);
    expect(linhas[0].tema).toBe("Pouco publicado");
  });

  it("usa mediana: um post viral não faz o tema inteiro parecer bom", () => {
    const linhas = agruparPorTema([doTema("A", 1), doTema("A", 1), doTema("A", 300)]);
    // A média seria ~100; a mediana diz como é o post típico.
    expect(linhas[0].interesse).toBeCloseTo(1);
  });

  it("conta quantos ainda estão com a etiqueta sugerida pela IA", () => {
    const linhas = agruparPorTema([
      doTema("A", 5, { tema_fonte: "ia" }),
      doTema("A", 5, { tema_fonte: "manual" }),
    ]);
    expect(linhas[0]).toMatchObject({ posts: 2, sugeridos: 1 });
  });

  it("tema sem alcance medido não quebra nem vira zero", () => {
    const linhas = agruparPorTema([post({ tema: "Sem dado", reach: null, shares: null, saved: null })]);
    expect(linhas[0]).toMatchObject({ posts: 1, alcance: null, interesse: null, engajamento: null });
  });
});

describe("leituraDosTemas", () => {
  const comTres = agruparPorTema([
    doTema("Espalha", 20),
    doTema("Espalha", 20),
    doTema("Meio", 10),
    doTema("Meio", 10),
    doTema("Morre", 2),
    doTema("Morre", 2),
  ]);

  it("compara o primeiro com o último e avisa que a amostra é pequena", () => {
    const frase = leituraDosTemas(comTres)!;
    expect(frase).toContain("Espalha se espalha 10,0× mais que Morre");
    expect(frase).toContain("2 post(s)");
  });

  it("com menos de três temas medidos não conclui nada", () => {
    expect(leituraDosTemas(agruparPorTema([doTema("A", 10), doTema("B", 2)]))).toBeNull();
  });

  it("diferença pequena vira 'o assunto não é o que decide'", () => {
    const parecidos = agruparPorTema([
      doTema("A", 10),
      doTema("A", 10),
      doTema("B", 9),
      doTema("B", 9),
      doTema("C", 8),
      doTema("C", 8),
    ]);
    expect(leituraDosTemas(parecidos)).toContain("Nenhum tema se destaca");
  });
});
