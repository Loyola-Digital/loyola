/**
 * Achar as colunas da pesquisa pelo cabeçalho.
 *
 * O caso real: a etapa Evento do bbe-pr2-out-26 mapeava o e-mail como "email",
 * coluna que o formulário não tem ("Qual é o seu e-mail"). O índice vinha -1, o
 * casamento por e-mail não acontecia e o mapa mostrava 9 pessoas em vez de 10 —
 * sem erro nenhum na tela.
 */

import { describe, expect, it } from "vitest";
import {
  acharColunaDeEmail,
  acharColunaDeFaturamento,
  acharColunaDeIngresso,
  acharColunaDeNome,
  acharColunaDeTelefone,
} from "../services/colunas-da-pesquisa.js";

/** O cabeçalho real da Pesquisa-Aplicação (recortado). */
const HEADERS = [
  "Submission ID",
  "Respondent ID",
  "Submitted at",
  "Qual é o seu nome",
  "Qual é o seu e-mail",
  "Qual é o seu WhatsApp",
  "Qual é o nome do seu restaurante (ou do restaurante em que você trabalha)?",
  "Qual é o faturamento médio mensal do seu negócio?",
];

describe("acharColunaDeEmail", () => {
  it("mapeamento que não existe cai na detecção pelo cabeçalho", () => {
    expect(acharColunaDeEmail(HEADERS, "email")).toBe(4);
  });

  it("mapeamento certo manda", () => {
    expect(acharColunaDeEmail(["a", "E-mail", "Qual é o seu e-mail"], "E-mail")).toBe(1);
  });

  it("sem coluna de e-mail, -1", () => {
    expect(acharColunaDeEmail(["Nome", "Telefone"], "email")).toBe(-1);
  });
});

describe("acharColunaDeNome", () => {
  it("é o nome da PESSOA, não o do restaurante", () => {
    expect(acharColunaDeNome(HEADERS)).toBe(3);
  });

  it("planilha só com o nome do restaurante não casa gente", () => {
    expect(acharColunaDeNome(["Qual é o nome do seu restaurante?", "E-mail"])).toBe(-1);
  });
});

describe("acharColunaDeTelefone", () => {
  it("acha WhatsApp", () => {
    expect(acharColunaDeTelefone(HEADERS)).toBe(5);
  });

  it("acha celular e telefone", () => {
    expect(acharColunaDeTelefone(["Celular"])).toBe(0);
    expect(acharColunaDeTelefone(["Telefone de contato"])).toBe(0);
  });
});

describe("acharColunaDeIngresso", () => {
  const LEADS = ["Nome", "Email", "CPF/CNPJ", "Celular", "Tipo", "Empresa", "Categoria", "Observação"];

  it('acha "Categoria" — a planilha do BBE-PR2-OUT/26 chama assim', () => {
    expect(acharColunaDeIngresso(LEADS)).toBe(6);
  });

  it('acha "Ingresso" — o nome usado nas outras', () => {
    expect(acharColunaDeIngresso(["Nome", "Ingresso"])).toBe(1);
  });

  it("não confunde com coluna que só CONTÉM a palavra", () => {
    expect(acharColunaDeIngresso(["Nome", "Quantos ingressos comprou?"])).toBe(-1);
  });
});

describe("acharColunaDeFaturamento", () => {
  it("acha a pergunta do formulário", () => {
    expect(acharColunaDeFaturamento(HEADERS)).toBe(7);
  });

  it("NÃO confunde com a renda pessoal — são perguntas diferentes no mesmo form", () => {
    const h = ["Qual é a sua renda mensal média pessoal (não do seu negócio)?"];
    expect(acharColunaDeFaturamento(h)).toBe(-1);
  });

  it("planilha de participantes não tem faturamento", () => {
    expect(acharColunaDeFaturamento(["Nome", "Email", "Celular", "Categoria"])).toBe(-1);
  });
});
