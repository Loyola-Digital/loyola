import { describe, expect, it } from "vitest";
import {
  ganchoExplicaOAlcance,
  linhaDeMeta,
  nivelPor,
  piorNivel,
  progressoDoMes,
  semaforoPorFormato,
  simularSaldo,
} from "../instagram-metas";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";

let n = 0;
const post = (over: Partial<InstagramMedia> = {}): InstagramMedia => ({
  id: `m${n++}`,
  media_type: "IMAGE",
  media_product_type: "FEED",
  timestamp: "2026-10-15T12:00:00+0000",
  reach: 10_000,
  shares: 50,
  saved: 50,
  ...over,
});

const reels = (over: Partial<InstagramMedia> = {}) =>
  post({ media_type: "VIDEO", media_product_type: "REELS", ...over });

describe("nivelPor e piorNivel", () => {
  it("100% é no caminho, 70% é atenção, abaixo disso precisa melhorar", () => {
    expect(nivelPor(140)).toBe("bom");
    expect(nivelPor(100)).toBe("bom");
    expect(nivelPor(70)).toBe("atencao");
    expect(nivelPor(69.9)).toBe("ruim");
  });

  it("um formato não está bem se uma das três metas falhou", () => {
    expect(piorNivel(["bom", "bom", "ruim"])).toBe("ruim");
    expect(piorNivel(["bom", "atencao"])).toBe("atencao");
    expect(piorNivel(["bom", "bom"])).toBe("bom");
  });
});

describe("progressoDoMes", () => {
  it("mês fechado não tem ritmo parcial", () => {
    expect(progressoDoMes("2026-09", new Date("2026-10-04T12:00:00"))).toBeNull();
  });

  it("no dia 4 de um mês de 30 dias, 10% do mês passou", () => {
    expect(progressoDoMes("2026-11", new Date("2026-11-04T09:00:00"))!).toBeCloseTo(0.1);
  });

  it("o dia de hoje conta inteiro — o mês ainda está acontecendo", () => {
    // Dia 1: nada de mês completo ainda, então nenhuma meta é cobrada.
    expect(progressoDoMes("2026-11", new Date("2026-11-01T23:00:00"))).toBe(0);
  });
});

describe("linhaDeMeta", () => {
  it("mês fechado compara com a meta inteira", () => {
    const l = linhaDeMeta("Saldo", 580, 1500, null);
    expect(Math.round(l.pctDaMeta)).toBe(39);
    expect(l.nivel).toBe("ruim");
    expect(l.esperadoAteHoje).toBeNull();
  });

  it("mês em curso compara com o ritmo, não com o total", () => {
    // 13% da meta no dia 4 não é "precisa melhorar": é o ritmo exato. Comparar
    // o parcial com o total pintaria todo começo de mês de vermelho.
    const l = linhaDeMeta("Saldo", 150, 1500, 0.1);
    expect(l.nivel).toBe("bom");
    expect(Math.round(l.pctDaMeta)).toBe(10);
    expect(l.esperadoAteHoje).toBe(150);
  });

  it("meta zerada não vira divisão por zero", () => {
    expect(linhaDeMeta("Sem meta", 10, 0, null).pctDaMeta).toBe(0);
  });
});

describe("semaforoPorFormato", () => {
  const posts = [
    ...Array.from({ length: 8 }, () => reels({ reach: 12_000, shares: 100, saved: 20 })),
    ...Array.from({ length: 4 }, () => post({ media_type: "CAROUSEL_ALBUM", reach: 30_000, shares: 300, saved: 100 })),
  ];

  it("mede frequência, alcance e interesse de cada formato contra a sua meta", () => {
    const linhas = semaforoPorFormato(posts, { reels: { freq: 2, alcance: 15_000, interesse: 12 } }, 28);
    const r = linhas.find((l) => l.formato === "reels")!;
    expect(r.posts).toBe(8);
    expect(r.medidas.find((m) => m.chave === "freq")!.resultado).toBeCloseTo(2);
    expect(r.medidas.find((m) => m.chave === "alcance")!.resultado).toBe(12_000);
    expect(r.medidas.find((m) => m.chave === "interesse")!.resultado).toBeCloseTo(10);
  });

  it("a cor do formato é a pior das três medidas", () => {
    // Frequência na meta, alcance em 80%, interesse em 83% → atenção.
    const linhas = semaforoPorFormato(posts, { reels: { freq: 2, alcance: 15_000, interesse: 12 } }, 28);
    expect(linhas.find((l) => l.formato === "reels")!.nivel).toBe("atencao");
  });

  it("formato sem meta não é julgado — fica sem nível, não ruim", () => {
    const linhas = semaforoPorFormato(posts, {}, 28);
    const c = linhas.find((l) => l.formato === "carrossel")!;
    expect(c.medidas.every((m) => m.nivel === null)).toBe(true);
    expect(c.nivel).toBe("bom");
  });

  it("formato sem post no período não entra na lista", () => {
    expect(semaforoPorFormato(posts, {}, 28).some((l) => l.formato === "estatico")).toBe(false);
  });
});

describe("ganchoExplicaOAlcance", () => {
  it("separa os Reels que seguraram os 3 segundos dos que não", () => {
    const r = ganchoExplicaOAlcance([
      ...Array.from({ length: 3 }, () => reels({ skip_rate: 30, reach: 40_000 })),
      ...Array.from({ length: 3 }, () => reels({ skip_rate: 60, reach: 10_000 })),
    ])!;
    expect(r.forte).toEqual({ n: 3, alcance: 40_000 });
    expect(r.fraco).toEqual({ n: 3, alcance: 10_000 });
  });

  it("com amostra pequena de um dos lados não conclui nada", () => {
    expect(
      ganchoExplicaOAlcance([
        ...Array.from({ length: 5 }, () => reels({ skip_rate: 30 })),
        reels({ skip_rate: 90 }),
      ]),
    ).toBeNull();
    expect(ganchoExplicaOAlcance([reels({ skip_rate: 30 })])).toBeNull();
  });
});

describe("simularSaldo", () => {
  const base = { novosPorPost: 80, posts: 34, saidasPct: 79, meta: 1500 };

  it("projeta o saldo com as saídas descontadas", () => {
    const s = simularSaldo(base);
    expect(s.saldo).toBe(571); // 80 × 34 × 0,21
    expect(s.nivel).toBe("ruim");
  });

  it("diz quantos posts seriam necessários mantendo as saídas de hoje", () => {
    // O número absurdo é a conclusão: publicar mais não resolve sozinho.
    expect(simularSaldo(base).postsNecessarios).toBe(90);
  });

  it("e quanto as saídas teriam de cair mantendo os posts de hoje", () => {
    expect(simularSaldo(base).saidasNecessariasPct!).toBeCloseTo(44.9, 1);
  });

  it("quando nem com zero saída daria, não inventa uma porcentagem", () => {
    expect(simularSaldo({ ...base, posts: 10 }).saidasNecessariasPct).toBeNull();
  });

  it("bateu a meta é 'no caminho'", () => {
    expect(simularSaldo({ ...base, saidasPct: 20 }).nivel).toBe("bom");
  });
});
