import { describe, it, expect } from "vitest";
import {
  normalizarNome,
  classificarFase,
  classificarPublico,
  classificarOrigem,
  adNameDoTerm,
  FASES_CAMPANHA,
  FASE_NAO_PADRAO,
} from "../services/launch-report-normalize";

/**
 * Story 41.2 — funções puras do §2.
 *
 * Os nomes de campanha usados aqui são **reais**, copiados de
 * `funnel_stages.campaigns` em produção (dg-pg02 e dg-pg04, 2026-07-30).
 * Não inventar nomes de teste: o valor destes casos está em serem o dado
 * que quebrou antes.
 */

describe("normalizarNome (§2.1)", () => {
  it("troca em-dash por -- e baixa a caixa", () => {
    expect(normalizarNome("DG-PG02-ABR-26—VENDAS-CAPTACAO")).toBe("dg-pg02-abr-26--vendas-captacao");
  });

  it("troca TODAS as ocorrências, não só a primeira", () => {
    // Caso real: em-dash antes do prefixo de fase E antes do hot/cold.
    expect(normalizarNome("dg-pg02-abr-26—vendas-downsell-2026-06-03—hot--cbo--mix-estaticos")).toBe(
      "dg-pg02-abr-26--vendas-downsell-2026-06-03--hot--cbo--mix-estaticos",
    );
  });

  it("não mexe em nome que já usa -- (PG04)", () => {
    const n = "dg-pg04-ago-26--vendas-captacao--2026-07-09--cold--cbo--videos--lote00--lpa";
    expect(normalizarNome(n)).toBe(n);
  });

  it("trata null/undefined/vazio como string vazia", () => {
    expect(normalizarNome(null)).toBe("");
    expect(normalizarNome(undefined)).toBe("");
    expect(normalizarNome("")).toBe("");
  });
});

describe("classificarFase (§2.2)", () => {
  it("acha o prefixo em qualquer posição, não só no início", () => {
    // O nome real COMEÇA com o código do lançamento — match por prefixo literal falharia.
    expect(classificarFase("dg-pg02-abr-26--vendas-captacao--2026-04-18—hot--cbo--estaticos")).toBe(
      "vendas-captacao",
    );
  });

  it("classifica campanha com em-dash antes do hot/cold (34 casos reais no PG02)", () => {
    expect(classificarFase("dg-pg02-abr-26--vendas-captacao--2026-04-17—cold--cbo--videos")).toBe(
      "vendas-captacao",
    );
  });

  it("classifica campanha com em-dash antes do próprio prefixo de fase", () => {
    // Sem normalizar, o segmento viria como "abr-26—vendas-downsell-2026-06-03" e
    // o match por substring de "vendas-downsell" ainda funcionaria — mas o
    // split por "--" (usado adiante no pipeline) não.
    expect(classificarFase("dg-pg02-abr-26—vendas-downsell-2026-06-03—hot--cbo--mix-videos")).toBe(
      "vendas-downsell",
    );
  });

  it("cobre os 5 prefixos confirmados em produção", () => {
    expect(classificarFase("fz-m2-ago26--leads-captacao--hot--videos--lpa")).toBe("leads-captacao");
    expect(classificarFase("dg-pg02-abr-26--leads-downsell--2026-05-22—hot--cbo--videos--lpb")).toBe(
      "leads-downsell",
    );
    expect(classificarFase("dg-pg02-abr-26--vendas-principal--2026-05-09—hot--cbo--videos")).toBe(
      "vendas-principal",
    );
    expect(classificarFase("dg-pg04-ago-26--vendas-captacao--2026-07-11--cold--cbo--videos")).toBe(
      "vendas-captacao",
    );
    expect(classificarFase("dg-pg02-abr-26—vendas-downsell-2026-06-03—cold-cbo--mix-estaticos")).toBe(
      "vendas-downsell",
    );
  });

  it("o downsell vence o captacao/principal quando os dois aparecem", () => {
    // Ordem de FASES_CAMPANHA: os mais específicos primeiro.
    expect(classificarFase("x--leads-downsell--leads-captacao--y")).toBe("leads-downsell");
    expect(classificarFase("x--vendas-downsell--vendas-captacao--y")).toBe("vendas-downsell");
  });

  it("nome fora da convenção vira NAO_PADRAO — nunca é descartado em silêncio", () => {
    expect(classificarFase("2026-03-28_netao_lead-bbe-escala-lp01_hot_cbo_estatico")).toBe(
      FASE_NAO_PADRAO,
    );
    expect(classificarFase("campanha aleatoria sem convencao")).toBe(FASE_NAO_PADRAO);
    expect(classificarFase("")).toBe(FASE_NAO_PADRAO);
    expect(classificarFase(null)).toBe(FASE_NAO_PADRAO);
  });

  it("os 5 prefixos são exatamente os esperados", () => {
    expect([...FASES_CAMPANHA]).toEqual([
      "leads-downsell",
      "leads-captacao",
      "vendas-downsell",
      "vendas-captacao",
      "vendas-principal",
    ]);
  });
});

describe("classificarPublico (§2.7)", () => {
  it("acha hot/cold no nome de campanha", () => {
    expect(classificarPublico("dg-pg02-abr-26--vendas-captacao--2026-04-17—hot--cbo--videos")).toBe(
      "Quente",
    );
    expect(classificarPublico("dg-pg02-abr-26--vendas-captacao--2026-04-17—cold--cbo--videos")).toBe(
      "Frio",
    );
  });

  it("acha hot/cold no MEIO do utm_term", () => {
    // Formato real: Instagram_Feed_<campaign>|<adset>|<ad>
    expect(
      classificarPublico("Instagram_Feed_dg-pg04-ago-26--vendas-captacao--hot--cbo|adset|ad"),
    ).toBe("Quente");
    expect(
      classificarPublico("Instagram_Feed_dg-pg04-ago-26--vendas-captacao--cold--cbo|adset|ad"),
    ).toBe("Frio");
  });

  it("aceita os termos em português", () => {
    expect(classificarPublico("campanha--quente--videos")).toBe("Quente");
    expect(classificarPublico("campanha--frio--videos")).toBe("Frio");
  });

  it("sem hot/cold → Indefinido (alimenta o invariante A1)", () => {
    expect(classificarPublico("dg-pg02--vendas-captacao--cbo--videos")).toBe("Indefinido");
    expect(classificarPublico("")).toBe("Indefinido");
    expect(classificarPublico(null)).toBe("Indefinido");
  });
});

describe("classificarOrigem (§2.6)", () => {
  it("utm_source de mídia paga → Pago", () => {
    expect(classificarOrigem("meta")).toBe("Pago");
    expect(classificarOrigem("facebook")).toBe("Pago");
    expect(classificarOrigem("google-ads")).toBe("Pago");
  });

  it("utm_source preenchida com outra coisa → Orgânico", () => {
    expect(classificarOrigem("youtube")).toBe("Orgânico");
    expect(classificarOrigem("instagram")).toBe("Orgânico");
  });

  it("vazia → Sem Track", () => {
    expect(classificarOrigem("")).toBe("Sem Track");
    expect(classificarOrigem(null)).toBe("Sem Track");
  });
});

describe("adNameDoTerm", () => {
  it("devolve o último segmento quando há 3+ partes", () => {
    expect(adNameDoTerm("Instagram_Feed_campanha|adset-hot|AD_106_VIDEO_depoimento")).toBe(
      "AD_106_VIDEO_depoimento",
    );
  });

  it("preserva a caixa original — o nome é exibido e cruzado com o cache da Meta", () => {
    expect(adNameDoTerm("a|b|Criativo VÍDEO 03")).toBe("Criativo VÍDEO 03");
  });

  it("apara espaços do segmento", () => {
    expect(adNameDoTerm("a|b|  ad-nome  ")).toBe("ad-nome");
  });

  it("devolve null com menos de 3 partes — não inventa nome", () => {
    expect(adNameDoTerm("campanha|adset")).toBeNull();
    expect(adNameDoTerm("só-a-campanha")).toBeNull();
  });

  it("devolve null quando o último segmento é vazio", () => {
    expect(adNameDoTerm("a|b|")).toBeNull();
    expect(adNameDoTerm("a|b|   ")).toBeNull();
  });

  it("devolve null para entrada vazia", () => {
    expect(adNameDoTerm("")).toBeNull();
    expect(adNameDoTerm(null)).toBeNull();
    expect(adNameDoTerm(undefined)).toBeNull();
  });
});
