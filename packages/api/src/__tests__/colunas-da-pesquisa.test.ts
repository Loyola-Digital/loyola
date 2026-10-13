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

/**
 * Coluna mapeada que EXISTE e está vazia não pode ganhar da que tem dado.
 *
 * ## O caso real
 *
 * Captação Paga do dg-pg05-out-26, medido em 13/10/2026: a planilha de
 * respostas tem 58 colunas e DUAS gerações do mesmo formulário. O
 * `column_mapping` da etapa apontava para "Digite o e-mail de compra, por
 * favor:" — coluna que existe e está preenchida em **0,7%** das 269 linhas —
 * enquanto o e-mail vivo estava em "Agora seu e-mail de cadastro", preenchida
 * em **99,3%**.
 *
 * Como o cabeçalho mapeado existia, `indexOf` achava e a busca por nome nunca
 * rodava. Resultado: 267 dos 269 leads iam ao Meta sem e-mail nem telefone. O
 * Meta não casa com ninguém, o evento não vale nada, e nada disso aparece como
 * erro — só como "semIdentificador" num resumo que ninguém abre.
 */
describe("mapeamento que aponta para coluna vazia", () => {
  const headers = [
    "Agora seu e-mail de cadastro",
    "E o seu WhatsApp com DDD",
    "Digite seu nome e sobrenome",
    "Digite o e-mail de compra, por favor:",
    "Agora seu WhatsApp/Telefone:",
    "Qual é o seu nome e sobrenome?",
  ];
  // Duas gerações: a nova (0,1,2) viva, a antiga (3,4,5) com RESÍDUO.
  //
  // O resíduo é o ponto: na planilha real a coluna morta tinha 2 linhas
  // preenchidas de 269, e qualquer teste de "está vazia?" passa com 2.
  const linhas = [
    ...Array.from({ length: 10 }, (_, i) => [
      `novo${i}@x.com`, `4199232226${i}`, `Pessoa ${i}`, "", "", "",
    ]),
    ["novo10@x.com", "41988887777", "Ana Souza", "residuo@x.com", "19414083991", "Bruno Camers"],
  ];

  it("e-mail: a coluna viva vence a mapeada com resíduo", () => {
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", linhas)).toBe(0);
  });

  it("telefone: idem", () => {
    expect(acharColunaDeTelefone(headers, "Agora seu WhatsApp/Telefone:", linhas)).toBe(1);
  });

  it("nome: idem", () => {
    expect(acharColunaDeNome(headers, "Qual é o seu nome e sobrenome?", linhas)).toBe(2);
  });

  it("duas colunas REAIS: o mapeamento manda, mesmo sendo a menor", () => {
    // "e-mail de compra" e "e-mail de cadastro" são perguntas diferentes, e
    // quem configurou sabe qual quer. A razão de 5× existe pra não atropelar
    // isso: 10 contra 11 não troca.
    const ambasReais = Array.from({ length: 11 }, (_, i) => [
      `cad${i}@x.com`, "", "", i < 10 ? `compra${i}@x.com` : "", "", "",
    ]);
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", ambasReais)).toBe(3);
  });

  it("planilha que acabou de começar: as duas vazias, o mapeamento vale", () => {
    // Um limiar absoluto ("menos de 10% preenchido") quebraria aqui.
    const comecando = [["", "", "", "", "", ""], ["", "", "", "", "", ""]];
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", comecando)).toBe(3);
  });

  it("sem as linhas, o comportamento é o antigo — existir basta", () => {
    // Chamador que não tem as linhas em mão não consegue decidir melhor, e
    // obrigá-lo a tê-las seria pior que o problema.
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:")).toBe(3);
  });

  it("linhas vazias não mudam nada", () => {
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", [])).toBe(3);
  });

  it("mapeada inexistente segue caindo na busca por nome", () => {
    expect(acharColunaDeEmail(headers, "coluna que nunca existiu", linhas)).toBe(0);
  });

  it("a mapeada só perde para alternativa com 5× mais dado", () => {
    const umContraCinco = Array.from({ length: 5 }, (_, i) => [
      `cad${i}@x.com`, "", "", i === 0 ? "compra@x.com" : "", "", "",
    ]);
    // 1 × 5 < 5 é falso — empata na fronteira e o mapeamento é mantido.
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", umContraCinco)).toBe(3);
    const umContraSeis = [...umContraCinco, ["cad5@x.com", "", "", "", "", ""]];
    expect(acharColunaDeEmail(headers, "Digite o e-mail de compra, por favor:", umContraSeis)).toBe(0);
  });
});
