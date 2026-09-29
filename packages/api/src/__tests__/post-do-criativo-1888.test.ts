import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { postDoAnuncio, postDoGrupo } from "../utils/post-do-criativo.js";

/**
 * Story 18.88 — o link da coluna Preview do Desempenho de Criativos.
 *
 * AC1: por Ad Name, o post do ad_id de maior investimento entre os que têm
 * link; por ad_id, Instagram antes de Facebook (a cascata da 29.63).
 */

const IG_MAIOR = "https://www.instagram.com/p/MAIOR/";
const IG_MENOR = "https://www.instagram.com/p/MENOR/";
const FB_MAIOR = "https://www.facebook.com/100/posts/200";
const FB_MENOR = "https://www.facebook.com/100/posts/300";

describe("postDoAnuncio — a ordem por ad_id (29.63)", () => {
  it("o mesmo ad_id tem os dois → Instagram", () => {
    expect(postDoAnuncio({ igPermalinkUrl: IG_MAIOR, adPermalinkUrl: FB_MAIOR })).toBe(IG_MAIOR);
  });

  it("só Facebook → Facebook", () => {
    expect(postDoAnuncio({ igPermalinkUrl: null, adPermalinkUrl: FB_MAIOR })).toBe(FB_MAIOR);
  });

  it("nenhum dos dois, string vazia ou sem cache → null", () => {
    expect(postDoAnuncio({ igPermalinkUrl: null, adPermalinkUrl: null })).toBeNull();
    expect(postDoAnuncio({ igPermalinkUrl: "", adPermalinkUrl: "" })).toBeNull();
    expect(postDoAnuncio({})).toBeNull();
    expect(postDoAnuncio(undefined)).toBeNull();
  });

  it("lê o post do Facebook pelo nome do cache (`adPermalinkUrl`), não pelo da rota de vídeo", () => {
    // A rota de vídeo chama de `permalinkUrl`. O tipo aceita o objeto errado
    // (campos opcionais); aqui ele não pode virar link.
    const daRotaDeVideo = { permalinkUrl: FB_MAIOR } as unknown as Parameters<typeof postDoAnuncio>[0];
    expect(postDoAnuncio(daRotaDeVideo)).toBeNull();
  });
});

describe("postDoGrupo — um link por Ad Name (AC1)", () => {
  const posts = (entradas: Array<[string, string]>) => new Map(entradas);
  const spend = (entradas: Array<[string, number]>) => new Map(entradas);

  it("dois ad_ids, o maior com Instagram → o Instagram do maior", () => {
    // O menor vem PRIMEIRO: "primeiro ad_id" daria o link errado.
    const adIds = ["menor", "maior"];
    const r = postDoGrupo(
      adIds,
      spend([["menor", 10], ["maior", 90]]),
      posts([["menor", IG_MENOR], ["maior", IG_MAIOR]]),
    );
    expect(r).toBe(IG_MAIOR);
  });

  it("o maior só com Facebook e o menor com Instagram → o Facebook do maior", () => {
    const adIds = ["menor", "maior"];
    const porAnuncio = new Map<string, string>();
    porAnuncio.set("menor", postDoAnuncio({ igPermalinkUrl: IG_MENOR, adPermalinkUrl: FB_MENOR })!);
    porAnuncio.set("maior", postDoAnuncio({ igPermalinkUrl: null, adPermalinkUrl: FB_MAIOR })!);
    expect(postDoGrupo(adIds, spend([["menor", 10], ["maior", 90]]), porAnuncio)).toBe(FB_MAIOR);
  });

  it("o maior sem link nenhum e o menor com link → o do menor", () => {
    const adIds = ["maior", "menor"];
    const r = postDoGrupo(
      adIds,
      spend([["maior", 90], ["menor", 10]]),
      posts([["menor", IG_MENOR]]),
    );
    expect(r).toBe(IG_MENOR);
  });

  it("nenhum com link → null", () => {
    expect(postDoGrupo(["a", "b"], spend([["a", 5], ["b", 7]]), posts([]))).toBeNull();
    expect(postDoGrupo([], spend([]), posts([]))).toBeNull();
  });

  it("empate em investimento → o primeiro encontrado (como o vídeo)", () => {
    const r = postDoGrupo(
      ["a", "b"],
      spend([["a", 50], ["b", 50]]),
      posts([["a", IG_MENOR], ["b", IG_MAIOR]]),
    );
    expect(r).toBe(IG_MENOR);
  });

  it("ad_id com link e sem investimento registrado conta como 0, e ainda ganha de ninguém", () => {
    expect(postDoGrupo(["a"], spend([]), posts([["a", FB_MENOR]]))).toBe(FB_MENOR);
  });
});

/**
 * O FIO na rota: as funções acima só valem se a rota as chama. Ler o fonte é
 * grosseiro, mas levantar o Fastify com banco e Meta mockados provaria o mock
 * (mesmo padrão de `lp-correcao-e-fio-1883.test.ts`).
 */
describe("rota creative-performance — o fio do postUrl (18.88)", () => {
  const rota = readFileSync(
    new URL("../routes/stage-creative-performance.ts", import.meta.url),
    "utf-8",
  );

  it("resolve o post por ad_id na MESMA leitura do cache (sem consulta nova)", () => {
    expect(rota).toMatch(/const post = postDoAnuncio\(l\.creative\);\s*if \(post\) postPorAdId\.set\(l\.adId, post\);/);
    // uma única leitura do meta_ad_creatives_cache na rota
    expect(rota.match(/\.from\(metaAdCreativesCache\)/g)).toHaveLength(1);
  });

  it("escolhe pelo grupo com o spend por ad_id e devolve o campo só quando há link", () => {
    expect(rota).toMatch(/postDoGrupo\(group\.adIds, group\.spendByAdId, postPorAdId\)/);
    expect(rota).toMatch(/\.\.\.\(postUrl \? \{ postUrl \} : \{\}\)/);
  });
});
