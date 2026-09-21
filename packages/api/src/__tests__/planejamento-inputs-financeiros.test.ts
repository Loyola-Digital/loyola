import { describe, it, expect } from "vitest";
import {
  derivarInputsFinanceiros,
  statusDaDistribuicao,
  CAMPOS_DOS_INPUTS_FINANCEIROS,
  type InputsFinanceiros,
} from "@loyola-x/shared";

/**
 * Story 48.1 — aba `[1] Inputs Financeiros`, derivação pura.
 *
 * Entradas: apêndice A da spec (dados MASCARADOS). Saídas: §1.4 "Casos de
 * teste", três tabelas. Duas diferenças deliberadas em relação à spec, as duas
 * consequência de D5 (as quatro fontes pagas dividem pela margem-alvo dos
 * PAGOS): `G37 = 31 250,00` (não 14 423,08) e `G31 = 208 333,33` (não
 * 191 506,41). `#DIV/0!` da planilha → `null`.
 */

function perto(a: number | null, b: number, casas = 2) {
  expect(a).not.toBeNull();
  expect(a as number).toBeCloseTo(b, casas);
}

/** Apêndice A — aba 1. */
const A: InputsFinanceiros = {
  pctReembolso: 0.04,
  pctMarketplace: 0.09,
  pctImposto: 0.12,
  pctCustoProduto: 0.06,
  pctComissoes: 0.03,
  pctOutrosCustos: 0.01,
  metaMargemTotal: 250000,
  pctMargemPagos: 0.25,
  ticketMedio: 1200,
  mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000,
  pctInvestMeta: 0.4,
  pctMetaQuente: 0.8,
  pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4,
  pctOrgEmail: 0.3,
  pctOrgInstagram: 0.15,
  pctOrgTelegram: 0.05,
  pctOrgYoutube: 0.05,
  pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000,
  baseEmail: 50000,
  baseInstagram: 30000,
  baseTelegram: 8000,
  baseYoutube: 120000,
  baseAreaMembros: 6000,
};

const VAZIO: InputsFinanceiros = Object.fromEntries(CAMPOS_DOS_INPUTS_FINANCEIROS.map((k) => [k, null])) as unknown as InputsFinanceiros;

describe("§1.4 tabela 1 — cadeia margem → receita (G14, G15, G13, F17, F19)", () => {
  it("linha 1: custos 35 %, meta 250 000, 25 % pagos, MC pagos 30 %", () => {
    const d = derivarInputsFinanceiros(A);
    expect(d.pctCustosTotal).toBeCloseTo(0.35, 10);
    expect(d.mcAlvoOrganicos).toBeCloseTo(0.65, 10);
    perto(d.metaMargemPagos, 62500);
    perto(d.metaMargemOrganicos, 187500);
    perto(d.receitaMetaPagos, 208333.33);
    perto(d.receitaMetaOrganicos, 288461.54);
    perto(d.receitaMetaTotal, 496794.87);
    perto(d.mcAlvoMedia, 0.503226, 6);
  });

  it("linha 2: 0 % pagos → toda a meta nos orgânicos", () => {
    const d = derivarInputsFinanceiros({ ...A, pctMargemPagos: 0 });
    expect(d.metaMargemPagos).toBe(0);
    perto(d.metaMargemOrganicos, 250000);
    expect(d.receitaMetaPagos).toBe(0);
    perto(d.receitaMetaOrganicos, 384615.38);
    perto(d.receitaMetaTotal, 384615.38);
    perto(d.mcAlvoMedia, 0.65, 6);
  });

  it("linha 3: MC dos pagos zero → receita dos pagos, total e média sem base (null), orgânicos seguem", () => {
    const d = derivarInputsFinanceiros({ ...A, mcAlvoPagos: 0 });
    expect(d.receitaMetaPagos).toBeNull();
    perto(d.receitaMetaOrganicos, 288461.54);
    expect(d.receitaMetaTotal).toBeNull();
    expect(d.mcAlvoMedia).toBeNull();
  });

  it("linha 4: custos somam exatamente 100 % → margem-alvo zero → orgânicos, total e média null; pagos calculam", () => {
    const d = derivarInputsFinanceiros({
      ...A,
      pctReembolso: 0.25,
      pctMarketplace: 0.25,
      pctImposto: 0.25,
      pctCustoProduto: 0.125,
      pctComissoes: 0.0625,
      pctOutrosCustos: 0.0625,
      metaMargemTotal: 100000,
      pctMargemPagos: 0.5,
      mcAlvoPagos: 0.2,
    });
    expect(d.pctCustosTotal).toBe(1);
    expect(d.mcAlvoOrganicos).toBe(0);
    perto(d.metaMargemPagos, 50000);
    perto(d.receitaMetaPagos, 250000);
    expect(d.receitaMetaOrganicos).toBeNull();
    expect(d.receitaMetaTotal).toBeNull();
    expect(d.mcAlvoMedia).toBeNull();
  });

  it("PO-04 = B: custos acima de 100 % → margem-alvo negativa → receita NEGATIVA, como na planilha (não null)", () => {
    const d = derivarInputsFinanceiros({ ...A, pctImposto: 0.32 }); // 0,04+0,09+0,32+0,06+0,03+0,01 = 0,55 → margem-alvo 0,45
    expect(d.mcAlvoOrganicos).toBeCloseTo(0.45, 10);
    const e = derivarInputsFinanceiros({ ...A, pctImposto: 0.97 }); // total 1,20 → margem-alvo −0,20
    expect(e.mcAlvoOrganicos).toBeCloseTo(-0.2, 10);
    perto(e.receitaMetaOrganicos, -937500); // 187 500 ÷ −0,20
    expect(e.canais.whatsapp.receita).not.toBeNull();
    expect(e.canais.whatsapp.receita as number).toBeLessThan(0);
  });
});

describe("§1.4 tabela 2 — investimento (G24:G29) e metas de pagos (F32:G37)", () => {
  it("linha 1: 100 000 · Meta 40 % · quente 80 % (Meta) e 75 % (Google)", () => {
    const d = derivarInputsFinanceiros(A);
    perto(d.investMeta, 40000);
    perto(d.investMetaQuente, 32000);
    perto(d.investMetaFrio, 8000);
    perto(d.investGoogle, 60000);
    perto(d.investGoogleQuente, 45000);
    perto(d.investGoogleFrio, 15000);
    perto(d.margemMetaAds, 25000);
    perto(d.margemMetaQuente, 20000);
    perto(d.margemMetaFrio, 5000);
    perto(d.margemGoogleAds, 37500);
    perto(d.margemGoogleQuente, 28125);
    perto(d.margemGoogleFrio, 9375);
    perto(d.receitaMetaQuente, 66666.67);
    perto(d.receitaMetaFrio, 16666.67);
    perto(d.receitaGoogleQuente, 93750);
  });

  it("não reproduz DV-001 (D5): Google frio ÷ margem-alvo dos PAGOS → 31 250,00, não 14 423,08; e G31 = 208 333,33, não 191 506,41", () => {
    const d = derivarInputsFinanceiros(A);
    perto(d.receitaGoogleFrio, 31250); // planilha: 9 375 ÷ 0,65 = 14 423,08
    perto(d.receitaMetaAds, 83333.33);
    perto(d.receitaGoogleAds, 125000);
    perto(d.receitaMetaPagosSoma, 208333.33); // planilha: 191 506,41
  });

  it("invariante (PO-03 a): a soma das quatro fontes é SEMPRE a receita necessária dos pagos", () => {
    for (const variacao of [A, { ...A, pctInvestMeta: 1 }, { ...A, pctInvestMeta: 0.13, pctMetaQuente: 0.5, pctGoogleQuente: 0.1 }, { ...A, mcAlvoPagos: 0.73 }]) {
      const d = derivarInputsFinanceiros(variacao);
      expect(d.receitaMetaPagosSoma).not.toBeNull();
      expect(d.receitaMetaPagosSoma as number).toBeCloseTo(d.receitaMetaPagos as number, 6);
    }
  });

  it("linha 2: Meta 100 % → Google zero em verba, margem e receita; G31 = 208 333,33", () => {
    const d = derivarInputsFinanceiros({ ...A, pctInvestMeta: 1 });
    perto(d.investMeta, 100000);
    perto(d.investMetaQuente, 80000);
    perto(d.investMetaFrio, 20000);
    expect(d.investGoogle).toBe(0);
    perto(d.margemMetaAds, 62500);
    perto(d.margemMetaQuente, 50000);
    perto(d.margemMetaFrio, 12500);
    expect(d.margemGoogleAds).toBe(0);
    perto(d.receitaMetaQuente, 166666.67);
    perto(d.receitaMetaFrio, 41666.67);
    expect(d.receitaGoogleQuente).toBe(0);
    expect(d.receitaGoogleFrio).toBe(0);
    perto(d.receitaMetaPagosSoma, 208333.33);
  });

  it("linha 3: metas de margem por fonte NÃO dependem do investimento total (D6: só dos %)", () => {
    const d = derivarInputsFinanceiros({ ...A, investimentoAnuncios: 50000 });
    perto(d.investMeta, 20000);
    perto(d.investGoogleFrio, 7500);
    perto(d.margemMetaQuente, 20000); // igual à linha 1
    perto(d.receitaGoogleQuente, 93750);
    perto(d.receitaMetaPagosSoma, 208333.33);
  });
});

describe("§1.4 tabela 3 — orgânicos (E41, F42:G47) e status E40 (RN-008, RN-009)", () => {
  it("linha 1: 40/30/15/5/5/5 → ✅ 100%; receitas por canal e G41 = 288 461,54 = G15", () => {
    const d = derivarInputsFinanceiros(A);
    expect(d.pctCheckOrganicos).toBeCloseTo(1, 10);
    expect(d.statusOrganicos.texto).toBe("✅ 100%");
    perto(d.canais.whatsapp.margem, 75000);
    perto(d.canais.whatsapp.receita, 115384.62);
    perto(d.canais.email.receita, 86538.46);
    perto(d.canais.instagram.receita, 43269.23);
    perto(d.canais.telegram.receita, 14423.08);
    perto(d.receitaMetaOrganicosSoma, 288461.54);
    // invariante (PO-03 b): com os % fechando 100 %, a soma por canal é a receita dos orgânicos
    expect(d.receitaMetaOrganicosSoma as number).toBeCloseTo(d.receitaMetaOrganicos as number, 6);
  });

  it("linha 2: 93 % → ⚠️ Falta distribuir 7%; G41 = 268 269,23 ≠ G15", () => {
    const d = derivarInputsFinanceiros({ ...A, pctOrgYoutube: 0.03, pctOrgAreaMembros: 0 });
    expect(d.statusOrganicos).toMatchObject({ estado: "falta", pontos: 7, texto: "⚠️ Falta distribuir 7%" });
    perto(d.receitaMetaOrganicosSoma, 268269.23);
    expect(d.receitaMetaOrganicosSoma as number).not.toBeCloseTo(d.receitaMetaOrganicos as number, 2);
  });

  it("linha 3: 110 % → ⛔️ Opa, passou de 100%! Reduzir 10%; WhatsApp 50 % → 93 750 / 144 230,77", () => {
    const d = derivarInputsFinanceiros({ ...A, pctOrgWhatsapp: 0.5 });
    expect(d.statusOrganicos).toMatchObject({ estado: "passou", pontos: 10, texto: "⛔️ Opa, passou de 100%! Reduzir 10%" });
    perto(d.canais.whatsapp.margem, 93750);
    perto(d.canais.whatsapp.receita, 144230.77);
    perto(d.receitaMetaOrganicosSoma, 317307.69);
  });

  it("linha 4: tudo vazio → ⚠️ Falta distribuir 100%; canais em zero (não null — a base 0,65 existe)", () => {
    const d = derivarInputsFinanceiros({ ...A, pctOrgWhatsapp: null, pctOrgEmail: null, pctOrgInstagram: null, pctOrgTelegram: null, pctOrgYoutube: null, pctOrgAreaMembros: null });
    expect(d.statusOrganicos.texto).toBe("⚠️ Falta distribuir 100%");
    expect(d.canais.whatsapp.margem).toBe(0);
    expect(d.canais.whatsapp.receita).toBe(0);
    expect(d.receitaMetaOrganicosSoma).toBe(0);
  });

  it("AC10: soma que fecha 100 % por construção mostra ✅ 100%, nunca 'Falta distribuir 0%' nem 'Reduzir 0%' — em qualquer ordem de ponto flutuante", () => {
    // O ruído existe neste motor, e depende da ORDEM da soma:
    expect(0.7 + 0.2 + 0.1).toBe(0.9999999999999999);
    expect(0.15 + 0.05 + 0.4 + 0.3 + 0.05 + 0.05).toBe(1.0000000000000002);
    // …e não pode aparecer no status (uma comparação `soma === 1` cairia num dos dois lados):
    expect(statusDaDistribuicao([0.7, 0.2, 0.1, 0, 0, 0]).texto).toBe("✅ 100%");
    expect(statusDaDistribuicao([0.15, 0.05, 0.4, 0.3, 0.05, 0.05]).texto).toBe("✅ 100%");
    expect(statusDaDistribuicao([0.3, 0.3, 0.1, 0.1, 0.1, 0.1]).texto).toBe("✅ 100%");
    expect(statusDaDistribuicao([0.1, 0.2, 0.7, null, undefined, 0]).estado).toBe("ok");
    const d = derivarInputsFinanceiros({ ...A, pctOrgWhatsapp: 0.7, pctOrgEmail: 0.2, pctOrgInstagram: 0.1, pctOrgTelegram: 0, pctOrgYoutube: 0, pctOrgAreaMembros: 0 });
    expect(d.statusOrganicos.texto).toBe("✅ 100%");
  });

  it("arredondamento dos pontos: meia unidade afasta-se de zero (93,5 % → falta 7 %; 106,5 % → reduzir 7 %)", () => {
    expect(statusDaDistribuicao([0.935]).texto).toBe("⚠️ Falta distribuir 7%");
    expect(statusDaDistribuicao([1.065]).texto).toBe("⛔️ Opa, passou de 100%! Reduzir 7%");
  });
});

describe("D3 — vazio vale zero, denominador zero vale null, nunca NaN/Infinity/exceção", () => {
  it("formulário todo vazio: derivados zerados, receitas com margem-alvo dos pagos vazia em null, orgânicos com margem 100 %", () => {
    const d = derivarInputsFinanceiros(VAZIO);
    expect(d.pctCustosTotal).toBe(0);
    expect(d.mcAlvoOrganicos).toBe(1);
    expect(d.receitaMetaPagos).toBeNull(); // mcAlvoPagos vazio = 0 → sem base
    expect(d.receitaMetaOrganicos).toBe(0); // 250 000 × 0 … meta vazia → 0 ÷ 1 = 0
    expect(d.receitaMetaTotal).toBeNull();
    expect(d.mcAlvoMedia).toBeNull();
    expect(d.statusOrganicos.texto).toBe("⚠️ Falta distribuir 100%");
  });

  it("nenhuma combinação de limites produz NaN, Infinity ou exceção", () => {
    const casos: Partial<InputsFinanceiros>[] = [
      {},
      { metaMargemTotal: 0 },
      { mcAlvoPagos: 0 },
      { mcAlvoPagos: 1 },
      { pctMargemPagos: 1 },
      { investimentoAnuncios: 0 },
      { pctInvestMeta: 0, pctMetaQuente: 0, pctGoogleQuente: 0 },
      { pctInvestMeta: 1, pctMetaQuente: 1, pctGoogleQuente: 1 },
      { pctReembolso: 1, pctMarketplace: 1, pctImposto: 1 },
      { ticketMedio: 0 },
    ];
    const semLixo = (v: unknown): void => {
      if (v === null || typeof v === "string") return;
      if (typeof v === "number") {
        expect(Number.isFinite(v)).toBe(true);
        return;
      }
      if (Array.isArray(v)) return v.forEach(semLixo);
      if (typeof v === "object") Object.values(v as object).forEach(semLixo);
    };
    for (const c of casos) semLixo(derivarInputsFinanceiros({ ...A, ...c }));
    semLixo(derivarInputsFinanceiros(VAZIO));
  });

  it("CAMPOS_DOS_INPUTS_FINANCEIROS lista exatamente as 26 chaves do tipo (20 entradas da spec + 6 bases contam separadas: 20 = 14 + 6)", () => {
    // A spec conta "20 entradas manuais" agrupando os 6 percentuais de canal e as 6 bases como
    // dois campos compostos; no payload são 26 chaves escalares.
    expect(CAMPOS_DOS_INPUTS_FINANCEIROS).toHaveLength(26);
    expect(new Set(CAMPOS_DOS_INPUTS_FINANCEIROS).size).toBe(26);
  });
});
