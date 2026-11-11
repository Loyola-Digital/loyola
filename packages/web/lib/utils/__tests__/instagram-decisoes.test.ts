import { describe, expect, it } from "vitest";
import { decisoesDoPeriodo, type NumerosParaDecidir } from "../instagram-decisoes";
import { funilDoPeriodo, larguraLog } from "../instagram-funil";
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

const base: NumerosParaDecidir = {
  alcance: 683_000,
  alcanceAnterior: 171_700,
  entraram: 2_748,
  sairam: 2_168,
  visitasAoPerfil: 10_600,
  cliquesNaBio: 668,
  engajamento: 10.4,
  engajamentoAnterior: 13.9,
  posts: [],
};

const titulos = (x: NumerosParaDecidir) => decisoesDoPeriodo(x).map((d) => d.titulo);

describe("decisoesDoPeriodo", () => {
  it("churn alto vira cartão urgente com a ação, não só o número", () => {
    const d = decisoesDoPeriodo(base).find((x) => x.titulo.includes("vai embora"))!;
    expect(d.nivel).toBe("urgente");
    expect(d.evidencia).toContain("79 de cada 100");
    expect(d.acao).toContain("depois do follow");
  });

  it("churn baixo não gera cartão nenhum", () => {
    expect(titulos({ ...base, sairam: 300 }).some((t) => t.includes("vai embora"))).toBe(false);
  });

  it("alcance em alta com engajamento em queda é explicado, não alarmado", () => {
    const d = decisoesDoPeriodo(base).find((x) => x.titulo.includes("engajamento caiu"))!;
    expect(d.nivel).toBe("bom");
    expect(d.acao).toContain("interesse por mil");
  });

  it("sem base do período anterior, essa leitura não aparece", () => {
    expect(
      titulos({ ...base, alcanceAnterior: null, engajamentoAnterior: null }).some((t) =>
        t.includes("engajamento caiu"),
      ),
    ).toBe(false);
  });

  it("o gancho só vira cartão quando a diferença é grande", () => {
    const comDiferenca = {
      ...base,
      posts: [
        ...Array.from({ length: 3 }, () => reels({ skip_rate: 30, reach: 40_000 })),
        ...Array.from({ length: 3 }, () => reels({ skip_rate: 60, reach: 10_000 })),
      ],
    };
    expect(titulos(comDiferenca).some((t) => t.includes("3 segundos"))).toBe(true);

    const semDiferenca = {
      ...base,
      posts: [
        ...Array.from({ length: 3 }, () => reels({ skip_rate: 30, reach: 11_000 })),
        ...Array.from({ length: 3 }, () => reels({ skip_rate: 60, reach: 10_000 })),
      ],
    };
    expect(titulos(semDiferenca).some((t) => t.includes("3 segundos"))).toBe(false);
  });

  it("visita alta com clique baixo aponta a bio, não o conteúdo", () => {
    const d = decisoesDoPeriodo({ ...base, cliquesNaBio: 200 }).find((x) =>
      x.titulo.includes("quase não clica"),
    )!;
    expect(d.evidencia).toContain("1,9%");
    expect(d.acao).toContain("bio que não converte");
  });

  it("6% de visita para clique não é alarme — o cartão não aparece", () => {
    // 668 de 10.600. Cartão para tudo é cartão para nada.
    expect(titulos(base).some((t) => t.includes("quase não clica"))).toBe(false);
  });

  it("com pouca visita ao perfil não conclui nada sobre a bio", () => {
    expect(titulos({ ...base, visitasAoPerfil: 20, cliquesNaBio: 0 }).some((t) => t.includes("quase não clica"))).toBe(
      false,
    );
  });

  it("tema campeão só vira cartão com três temas medidos e o dobro de diferença", () => {
    const comTemas = {
      ...base,
      posts: [
        post({ tema: "Família", reach: 10_000, shares: 200, saved: 0 }),
        post({ tema: "Família", reach: 10_000, shares: 200, saved: 0 }),
        post({ tema: "Meio", reach: 10_000, shares: 100, saved: 0 }),
        post({ tema: "Meio", reach: 10_000, shares: 100, saved: 0 }),
        post({ tema: "Bastidores", reach: 10_000, shares: 20, saved: 0 }),
        post({ tema: "Bastidores", reach: 10_000, shares: 20, saved: 0 }),
      ],
    };
    expect(titulos(comTemas).some((t) => t.includes("Família"))).toBe(true);
    // Sem etiqueta nenhuma, nada sobre tema.
    expect(titulos(base).some((t) => t.includes("se espalha"))).toBe(false);
  });
});

describe("funilDoPeriodo", () => {
  const etapas = funilDoPeriodo({ alcance: 683_000, visitasAoPerfil: 10_600, cliquesNaBio: 668 });

  it("cada etapa diz quanto passou da anterior", () => {
    expect(etapas[0].taxa).toBeNull();
    expect(etapas[1].taxa!).toBeCloseTo(1.55, 1);
    expect(etapas[2].taxa!).toBeCloseTo(6.3, 1);
  });

  it("a etapa que falta medir fica declarada e vazia, em vez de some", () => {
    const lead = etapas[3];
    expect(lead.faltaLigar).toBe(true);
    expect(lead.valor).toBeNull();
    expect(lead.explicacao).toContain("link rastreado");
  });

  it("alcance zero não vira divisão por zero", () => {
    expect(funilDoPeriodo({ alcance: 0, visitasAoPerfil: 0, cliquesNaBio: 0 })[1].taxa).toBeNull();
  });
});

describe("larguraLog", () => {
  it("mantém a etapa pequena visível ao lado da gigante", () => {
    // Em escala linear, 668 contra 683 mil seria 0,1% da barra — um fio.
    const pequena = larguraLog(668, 683_000);
    expect(pequena).toBeGreaterThan(0.4);
    expect(pequena).toBeLessThan(1);
    expect(larguraLog(683_000, 683_000)).toBe(1);
  });

  it("valor zero ou negativo não desenha barra", () => {
    expect(larguraLog(0, 1000)).toBe(0);
    expect(larguraLog(10, 0)).toBe(0);
  });
});
