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
