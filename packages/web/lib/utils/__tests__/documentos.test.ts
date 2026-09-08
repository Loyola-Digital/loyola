import { describe, expect, it } from "vitest";
import {
  mascararCnpj,
  mascararCpf,
  NOME_DA_CHAVE,
  tipoDaChavePix,
  validarCnpj,
  validarCpf,
} from "../documentos";

describe("máscara enquanto digita", () => {
  it("só formata o que já foi digitado", () => {
    // Encher o campo de pontos à frente do cursor faria a pessoa apagar por
    // engano o que o campo pôs sozinho.
    expect(mascararCpf("529")).toBe("529");
    expect(mascararCpf("52998")).toBe("529.98");
    expect(mascararCpf("529982247")).toBe("529.982.247");
    expect(mascararCpf("52998224725")).toBe("529.982.247-25");
  });

  it("ignora o que passa do tamanho", () => {
    expect(mascararCpf("529982247259999")).toBe("529.982.247-25");
    expect(mascararCnpj("112223330001819999")).toBe("11.222.333/0001-81");
  });

  it("mascara CNPJ progressivamente", () => {
    expect(mascararCnpj("11")).toBe("11");
    expect(mascararCnpj("11222")).toBe("11.222");
    expect(mascararCnpj("11222333")).toBe("11.222.333");
    expect(mascararCnpj("112223330001")).toBe("11.222.333/0001");
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("reaplica a máscara sobre texto já mascarado", () => {
    // Acontece a cada tecla: o valor no campo já tem pontos quando volta.
    expect(mascararCpf("529.982.247-25")).toBe("529.982.247-25");
  });
});

describe("validação no cliente bate com a do servidor", () => {
  it("aceita válidos e recusa dígito trocado", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("recusa todos iguais", () => {
    expect(validarCpf("11111111111")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });
});

describe("tipoDaChavePix", () => {
  it("nomeia cada formato do Banco Central", () => {
    expect(tipoDaChavePix("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "aleatoria",
    );
    expect(tipoDaChavePix("financeiro@loyola.com.br")).toBe("email");
    expect(tipoDaChavePix("529.982.247-25")).toBe("cpf");
    expect(tipoDaChavePix("+5511900000000")).toBe("telefone");
  });

  it("tem rótulo para todo tipo, inclusive o desconhecido", () => {
    // Sem isto a tela mostraria "undefined" embaixo do campo.
    for (const t of [
      "cpf",
      "cnpj",
      "email",
      "telefone",
      "aleatoria",
      "desconhecida",
    ] as const) {
      expect(NOME_DA_CHAVE[t]).toBeTruthy();
    }
  });
});
