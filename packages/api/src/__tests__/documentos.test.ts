import { describe, expect, it } from "vitest";
import {
  formatarCnpj,
  formatarCpf,
  soDigitos,
  tipoDaChavePix,
  validarCnpj,
  validarCpf,
} from "../services/documentos.js";

describe("validarCpf", () => {
  it("aceita CPF válido, com e sem máscara", () => {
    // Gerado pelo próprio algoritmo — não é de ninguém.
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    // É para isto que a validação existe: um dígito trocado que só daria erro
    // na emissão da nota, semanas depois.
    expect(validarCpf("529.982.247-24")).toBe(false);
  });

  it("recusa todos os dígitos iguais", () => {
    // Passa no módulo 11 por acidente matemático; é a única fraude que o
    // algoritmo sozinho não pega.
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("00000000000")).toBe(false);
  });

  it("recusa comprimento errado", () => {
    expect(validarCpf("5299822472")).toBe(false);
    expect(validarCpf("529982247250")).toBe(false);
    expect(validarCpf("")).toBe(false);
  });
});

describe("validarCnpj", () => {
  it("aceita CNPJ válido, com e sem máscara", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11222333000181")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(validarCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("recusa todos os dígitos iguais", () => {
    expect(validarCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("recusa comprimento errado", () => {
    expect(validarCnpj("1122233300018")).toBe(false);
    expect(validarCnpj("")).toBe(false);
  });
});

describe("formatação", () => {
  it("põe a máscara quando o número está completo", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve o que veio quando não dá para formatar", () => {
    // Meio de digitação: mascarar um número incompleto embaralharia o cursor.
    expect(formatarCpf("529982")).toBe("529982");
    expect(formatarCnpj("112223")).toBe("112223");
  });

  it("soDigitos tira tudo que não é número", () => {
    expect(soDigitos("529.982.247-25")).toBe("52998224725");
    expect(soDigitos("+55 (11) 90000-0000")).toBe("5511900000000");
  });
});

describe("tipoDaChavePix", () => {
  it("reconhece chave aleatória (UUID)", () => {
    expect(tipoDaChavePix("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "aleatoria",
    );
  });

  it("reconhece e-mail", () => {
    expect(tipoDaChavePix("financeiro@loyola.com.br")).toBe("email");
  });

  it("recusa e-mail malformado em vez de chamar de outra coisa", () => {
    expect(tipoDaChavePix("financeiro@loyola")).toBe("desconhecida");
  });

  it("reconhece CPF e CNPJ como chave", () => {
    expect(tipoDaChavePix("529.982.247-25")).toBe("cpf");
    expect(tipoDaChavePix("11.222.333/0001-81")).toBe("cnpj");
  });

  it("reconhece telefone com DDI", () => {
    expect(tipoDaChavePix("+5511900000000")).toBe("telefone");
  });

  it("aceita telefone sem DDI, que a pessoa conserta com dois caracteres", () => {
    expect(tipoDaChavePix("(11) 90000-0000")).toBe("telefone");
  });

  it("um CPF inválido de 11 dígitos cai em telefone, não em CPF", () => {
    // A ordem do teste importa: os dois têm onze dígitos, e chamar de CPF algo
    // que não passa no dígito verificador seria mentir sobre o que entendemos.
    expect(tipoDaChavePix("11111111111")).toBe("telefone");
  });

  it("vazio é desconhecida", () => {
    expect(tipoDaChavePix("   ")).toBe("desconhecida");
  });
});
