import { describe, expect, it } from "vitest";
import {
  alcanceVezesTipico,
  destaquesDoPeriodo,
  quantil,
  referenciasPorFormato,
  statusDoPost,
} from "../instagram-sinal";
import { interessePorMil } from "../instagram-posts";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";

function post(over: Partial<InstagramMedia> = {}): InstagramMedia {
  return {
    id: Math.random().toString(36).slice(2),
    media_type: "IMAGE",
    media_product_type: "FEED",
    timestamp: "2026-10-15T12:00:00+0000",
    reach: 10_000,
    shares: 50,
    saved: 50,
    ...over,
  };
}

/** Reels com o sinal que eu quiser, para montar uma distribuição. */
const reels = (sinal: number) =>
  post({ media_product_type: "REELS", media_type: "VIDEO", reach: 10_000, shares: sinal * 10, saved: 0 });

describe("interessePorMil", () => {
  it("compara posts de tamanhos diferentes na mesma régua", () => {
    const grande = post({ reach: 90_000, shares: 900, saved: 0 });
    const pequeno = post({ reach: 9_000, shares: 180, saved: 0 });
    expect(interessePorMil(grande)).toBeCloseTo(10);
    expect(interessePorMil(pequeno)).toBeCloseTo(20);
  });

  it("sem alcance ou sem nenhum dos dois números não inventa zero", () => {
    expect(interessePorMil(post({ reach: null }))).toBeNull();
    expect(interessePorMil(post({ shares: null, saved: null }))).toBeNull();
    // Um dos dois presente basta: o outro realmente foi zero.
    expect(interessePorMil(post({ reach: 1_000, shares: 10, saved: null }))).toBeCloseTo(10);
  });
});

describe("quantil", () => {
  it("interpola entre os dois valores vizinhos", () => {
    expect(quantil([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
    expect(quantil([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantil([], 0.5)).toBeNull();
  });
});

describe("statusDoPost", () => {
  const amostra = [2, 4, 6, 8, 10, 12, 14].map(reels);

  it("usa os quartis do próprio formato", () => {
    const refs = referenciasPorFormato(amostra);
    expect(statusDoPost(reels(20), refs)).toBe("forte");
    expect(statusDoPost(reels(8), refs)).toBe("na linha");
    expect(statusDoPost(reels(1), refs)).toBe("fraco");
  });

  it("um Reels não é julgado pela régua do carrossel", () => {
    // Carrosséis se espalham muito mais por pessoa alcançada. Na régua geral,
    // todo Reels seria "fraco" — e isso só diria que ele é um Reels.
    const refs = referenciasPorFormato([
      ...amostra,
      ...[40, 50, 60, 70, 80].map((s) =>
        post({ media_type: "CAROUSEL_ALBUM", reach: 10_000, shares: s * 10, saved: 0 }),
      ),
    ]);
    expect(statusDoPost(reels(13), refs)).toBe("forte");
  });

  it("com poucos posts do formato fica em branco em vez de chutar", () => {
    const refs = referenciasPorFormato([reels(2), reels(10)]);
    expect(refs.reels?.n).toBe(2);
    expect(statusDoPost(reels(10), refs)).toBeNull();
  });
});

describe("alcanceVezesTipico", () => {
  it("diz quantas vezes o post é um post típico do formato", () => {
    const refs = referenciasPorFormato([
      post({ reach: 10_000 }),
      post({ reach: 20_000 }),
      post({ reach: 30_000 }),
    ]);
    expect(alcanceVezesTipico(post({ reach: 40_000 }), refs)).toBeCloseTo(2);
  });
});

describe("destaquesDoPeriodo", () => {
  it("cada pergunta pode eleger um post diferente", () => {
    const campeaoDeAlcance = post({ id: "alcance", reach: 100_000, shares: 10, saved: 0 });
    const campeaoDeSinal = post({ id: "sinal", reach: 5_000, shares: 400, saved: 100 });
    const campeaoDeSeguidores = post({ id: "seguidores", reach: 8_000, follows: 300 });
    const d = destaquesDoPeriodo([campeaoDeAlcance, campeaoDeSinal, campeaoDeSeguidores]);

    expect(d.map((x) => x.pergunta)).toEqual(["Mais viu", "Mais espalhou", "Mais seguidores"]);
    expect(d[0].post.id).toBe("alcance");
    expect(d[1].post.id).toBe("sinal");
    expect(d[2].post.id).toBe("seguidores");
  });

  it("sem Reels medido, a pergunta do gancho simplesmente não aparece", () => {
    expect(destaquesDoPeriodo([post()]).some((d) => d.pergunta === "Melhor gancho")).toBe(false);
    const comGancho = destaquesDoPeriodo([post({ media_product_type: "REELS", skip_rate: 35.5 })]);
    expect(comGancho.find((d) => d.pergunta === "Melhor gancho")?.valor).toBe("64,5% passaram de 3 s");
  });
});
