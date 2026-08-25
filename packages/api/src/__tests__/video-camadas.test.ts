import { describe, it, expect } from "vitest";
import {
  calcularTaxas, avaliar, ranquearPorCamada, avaliarContraAlvo, classificar,
  sugerirRemontagens, anguloDoNome, medianaDeVideo as mediana, ALVOS, PISO_DE_REPRODUCOES,
  type CriativoDeVideo, type Camada,
} from "@loyola-x/shared";

/** Contagens na proporção medida em produção (2026-08-25). */
const v = (
  adId: string, adName: string,
  impressoes: number, views3s: number | null, thruplay: number | null, p75: number | null,
): CriativoDeVideo => ({ adId, adName, impressoes, views3s, thruplay, p75 });

describe("as três taxas", () => {
  it("play rate é 3s ÷ impressões — decisão do gestor sobre o denominador", () => {
    const t = calcularTaxas(v("a", "x", 1000, 238, 62, 27));
    expect(t.playRate).toBeCloseTo(0.238, 3);
  });

  it("conversão do hook é ThruPlay ÷ 3s", () => {
    // ThruPlay = completou OU ≥15s. Não existe `video_15_sec` na API.
    const t = calcularTaxas(v("a", "x", 1000, 238, 62, 27));
    expect(t.conversaoDoHook).toBeCloseTo(0.2605, 3);
  });

  it("retenção do body é p75 ÷ 3s", () => {
    const t = calcularTaxas(v("a", "x", 1000, 238, 62, 27));
    expect(t.retencaoDoBody).toBeCloseTo(0.1134, 3);
  });

  it("sem o denominador, a taxa é null e NÃO zero", () => {
    // `views3s` só existe desde 02/08/2026. Zero diria "ninguém assistiu";
    // null diz "não medimos" — e foi o que produziu taxas de 234% quando o
    // numerador cobria meses e o denominador cobria semanas.
    const t = calcularTaxas(v("a", "x", 1000, null, 62, 27));
    expect(t.conversaoDoHook).toBeNull();
    expect(t.retencaoDoBody).toBeNull();
    expect(t.playRate).toBeNull();
  });

  it("impressão zero não vira divisão por zero", () => {
    expect(calcularTaxas(v("a", "x", 0, 10, 5, 2)).playRate).toBeNull();
  });
});

describe("piso de amostra (AC3)", () => {
  it("abaixo do piso, o criativo é marcado e sai do ranking", () => {
    const av = avaliar([
      v("bom", "x", 100, 3, 3, 3),            // 100% em tudo, com 3 reproduções
      v("real", "y", 1000, 200, 52, 23),
    ]);
    expect(av.find((c) => c.adId === "bom")!.amostraBaixa).toBe(true);
    const r = ranquearPorCamada(av, "corpo");
    expect(r.map((c) => c.adId)).toEqual(["real"]);
  });

  it("o piso é 50 reproduções de 3s", () => {
    expect(PISO_DE_REPRODUCOES).toBe(50);
    expect(avaliar([v("a", "x", 1000, 50, 10, 5)])[0].amostraBaixa).toBe(false);
    expect(avaliar([v("a", "x", 1000, 49, 10, 5)])[0].amostraBaixa).toBe(true);
  });
});

describe("ranking independente por camada (AC4)", () => {
  const AV = avaliar([
    v("abre", "aberto--tema-a", 1000, 700, 100, 50),   // play 70%
    v("prom", "promessa--tema-a", 1000, 200, 140, 30), // conv 70%
    v("corp", "corpo--tema-a", 1000, 200, 60, 90),     // body 45%
  ]);

  it("cada camada tem seu campeão, e eles diferem", () => {
    expect(ranquearPorCamada(AV, "abertura")[0].adId).toBe("abre");
    expect(ranquearPorCamada(AV, "promessa")[0].adId).toBe("prom");
    expect(ranquearPorCamada(AV, "corpo")[0].adId).toBe("corp");
  });
});

describe("avaliação contra o alvo", () => {
  const AV = avaliar([
    v("a", "x", 1000, 238, 62, 27),
    v("b", "y", 1000, 300, 80, 40),
  ]);

  it("sinaliza quando NINGUÉM atinge o alvo", () => {
    // O alvo do play rate (90%) está acima do melhor criativo da conta (70,8%).
    // Sem este sinal, um painel todo vermelho é lido como "inventário ruim"
    // quando pode ser "alvo mal calibrado" — e só quem definiu decide.
    const r = avaliarContraAlvo(AV, "abertura");
    expect(r.alvo).toBe(ALVOS.abertura);
    expect(r.quantosAtingem).toBe(0);
    expect(r.nenhumAtinge).toBe(true);
  });

  it("o alvo configurado tem precedência — desenho de `alvoVigente` (44.9)", () => {
    const r = avaliarContraAlvo(AV, "abertura", 0.2);
    expect(r.alvo).toBe(0.2);
    expect(r.quantosAtingem).toBe(2);
    expect(r.nenhumAtinge).toBe(false);
  });

  it("devolve a mediana da conta como referência", () => {
    const r = avaliarContraAlvo(AV, "abertura");
    expect(r.medianaDaConta).toBeCloseTo(0.269, 3);
  });

  it("lista vazia não reporta `nenhumAtinge`", () => {
    // Sem criativo, ninguém atinge — mas isso não é sinal sobre o alvo.
    const r = avaliarContraAlvo([], "abertura");
    expect(r.nenhumAtinge).toBe(false);
  });
});

describe("padrão-ouro e fracos (AC7)", () => {
  const MED: Record<Camada, number | null> = { abertura: 0.24, promessa: 0.26, corpo: 0.11 };

  it("acima da mediana nas três = padrão-ouro", () => {
    const c = avaliar([v("g", "x", 1000, 400, 150, 60)])[0];
    expect(classificar(c, MED)).toBe("padrao_ouro");
  });

  it("abaixo nas três = candidato a pausar", () => {
    const c = avaliar([v("f", "x", 1000, 100, 10, 5)])[0];
    expect(classificar(c, MED)).toBe("fraco_nos_tres");
  });

  it("misto = recombinável", () => {
    const c = avaliar([v("m", "x", 1000, 400, 10, 60)])[0];
    expect(classificar(c, MED)).toBe("recombinavel");
  });

  it("sem as três taxas, não classifica como fraco", () => {
    // Dado ausente não é desempenho ruim. Marcar como "candidato a pausar" um
    // criativo fora da janela de sincronização o mataria por falta de medida.
    const c = avaliar([v("s", "x", 1000, null, null, null)])[0];
    expect(classificar(c, MED)).toBe("recombinavel");
  });
});

describe("sugestões de remontagem (AC5/AC6)", () => {
  it("cruza os campeões de cada camada", () => {
    const av = avaliar([
      v("abre", "a--tema-x", 1000, 700, 100, 50),
      v("prom", "b--tema-x", 1000, 200, 140, 30),
      v("corp", "c--tema-x", 1000, 200, 60, 90),
    ]);
    const s = sugerirRemontagens(av, 1);
    expect(s).toHaveLength(1);
    expect(s[0].abertura.adId).toBe("abre");
    expect(s[0].promessa.adId).toBe("prom");
    expect(s[0].corpo.adId).toBe("corp");
  });

  it("promessa e corpo do mesmo ângulo → coerente", () => {
    const av = avaliar([
      v("abre", "a--delegue-producao", 1000, 700, 100, 50),
      v("prom", "b--delegue-producao", 1000, 200, 140, 30),
      v("corp", "c--delegue-producao", 1000, 200, 60, 90),
    ]);
    const s = sugerirRemontagens(av, 1)[0];
    expect(s.coerente).toBe(true);
    expect(s.nota).toContain("mesmo ângulo");
  });

  it("abertura de outro ângulo NÃO quebra a coerência", () => {
    // A abertura é visual e "quase não depende do que está sendo dito" (nota do
    // gestor). Exigir os três iguais descartaria combinações legítimas.
    const av = avaliar([
      v("abre", "a--novo-cigarro", 1000, 700, 100, 50),
      v("prom", "b--celular-na-mao", 1000, 200, 140, 30),
      v("corp", "c--celular-na-mao", 1000, 200, 60, 90),
    ]);
    const s = sugerirRemontagens(av, 1)[0];
    expect(s.coerente).toBe(true);
    expect(s.nota).toMatch(/visual/i);
  });

  it("promessa e corpo de ângulos diferentes → ALERTA, e a sugestão aparece", () => {
    // O ângulo é inferido do nome, por convenção. Descartar por ele esconderia
    // sugestões boas cujo nome não segue o padrão — então alerta, não filtro.
    const av = avaliar([
      v("abre", "a--delegue-producao", 1000, 700, 100, 50),
      v("prom", "b--ganhe-tempo", 1000, 200, 140, 30),
      v("corp", "c--delegue-producao", 1000, 200, 60, 90),
    ]);
    const s = sugerirRemontagens(av, 1)[0];
    expect(s.coerente).toBe(false);
    expect(s.nota).toContain("⚠️");
    expect(s.nota).toMatch(/pagar a expectativa/i);
  });

  it("um vídeo campeão nas três não vira sugestão — é padrão-ouro", () => {
    const av = avaliar([
      v("todos", "a--tema", 1000, 700, 500, 400),
      v("outro", "b--tema", 1000, 100, 10, 5),
    ]);
    expect(sugerirRemontagens(av, 1)).toHaveLength(0);
  });

  it("sem criativos acima do piso, não há sugestão", () => {
    expect(sugerirRemontagens(avaliar([v("a", "x", 100, 3, 2, 1)]))).toHaveLength(0);
  });
});

describe("anguloDoNome", () => {
  it("extrai o trecho após o último `--`", () => {
    expect(anguloDoNome("ad21-dg-pg04-jul26--delegue-60_-da-sua-produção"))
      .toBe("delegue-60_-da-sua-produção");
  });

  it("nome sem separador não tem ângulo inferível", () => {
    expect(anguloDoNome("criativo01")).toBeNull();
  });
});

describe("mediana", () => {
  it("ímpar e par", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });
  it("vazio é null", () => {
    expect(mediana([])).toBeNull();
  });
});
