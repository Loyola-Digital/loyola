import { describe, it, expect } from "vitest";
import { computeLeadBandMapFromColumn } from "../routes/lead-scoring";

/**
 * Faixa lida direto da planilha de pesquisa, sem lead scoring configurado.
 * Antes, funil com a coluna "Faixa 1" preenchida mas sem schema de scoring
 * jogava TODAS as vendas em "Sem perfil".
 */
const planilha = {
  headers: ["Agora seu e-mail de cadastro", "E o seu WhatsApp com DDD", "Faixa 1"],
  rows: [
    ["ANA@Exemplo.com ", "(11) 98765-4321", "A"],
    ["bruno@exemplo.com", "11 91234-5678", "c"],
    ["carla@exemplo.com", "", "D"],
    ["dario@exemplo.com", "", ""],
    ["elena@exemplo.com", "", "Z"],
    ["", "11 95555-4444", "B"],
  ],
};

const EMAIL = "Agora seu e-mail de cadastro";
const FAIXA = "Faixa 1";
const FONE = "E o seu WhatsApp com DDD";

describe("computeLeadBandMapFromColumn", () => {
  it("lê a faixa sem precisar de lead scoring", () => {
    const { byEmail } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA);
    expect(byEmail.get("ana@exemplo.com")).toBe("A");
    expect(byEmail.get("carla@exemplo.com")).toBe("D");
  });

  it("normaliza e-mail (trim + minúsculas) e faixa (maiúscula)", () => {
    const { byEmail } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA);
    expect(byEmail.get("bruno@exemplo.com")).toBe("C");
  });

  it("ignora faixa vazia ou fora de A–D", () => {
    const { byEmail } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA);
    expect(byEmail.has("dario@exemplo.com")).toBe(false);
    expect(byEmail.has("elena@exemplo.com")).toBe(false);
  });

  it("indexa por telefone quando a coluna é informada", () => {
    const { byPhone } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA, FONE);
    // últimos 8 dígitos
    expect(byPhone.get("87654321")).toBe("A");
    expect(byPhone.get("12345678")).toBe("C");
  });

  it("indexa por telefone mesmo sem e-mail na linha", () => {
    const { byPhone } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA, FONE);
    expect(byPhone.get("55554444")).toBe("B");
  });

  it("sem coluna de telefone, o índice por telefone fica vazio", () => {
    const { byPhone } = computeLeadBandMapFromColumn(planilha, EMAIL, FAIXA);
    expect(byPhone.size).toBe(0);
  });

  it("primeira resposta vence quando o contato responde duas vezes", () => {
    const duplicado = {
      headers: planilha.headers,
      rows: [
        ["dup@exemplo.com", "11 90000-1111", "A"],
        ["dup@exemplo.com", "11 90000-1111", "D"],
      ],
    };
    const { byEmail, byPhone } = computeLeadBandMapFromColumn(duplicado, EMAIL, FAIXA, FONE);
    expect(byEmail.get("dup@exemplo.com")).toBe("A");
    expect(byPhone.get("00001111")).toBe("A");
  });

  it("coluna inexistente devolve mapas vazios em vez de quebrar", () => {
    const r = computeLeadBandMapFromColumn(planilha, EMAIL, "Coluna Que Não Existe");
    expect(r.byEmail.size).toBe(0);
    expect(r.byPhone.size).toBe(0);
  });
});
