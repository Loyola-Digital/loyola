/**
 * O formulário do Tally virando rascunho do modelo de Lead Scoring.
 *
 * O modelo é montado hoje à mão num fluxo do n8n e colado na aba de scoring
 * ("ctrl+c / ctrl+v do modelo externo"). O que estes testes travam é a parte
 * mecânica dessa transcrição: toda pergunta e toda alternativa precisam chegar,
 * na forma exata que o motor lê — e a pontuação precisa chegar ZERADA, porque
 * quanto vale cada resposta é conhecimento do negócio e um palpite plausível
 * aqui não seria revisado por ninguém.
 */

import { describe, expect, it } from "vitest";
import { lerPerguntas } from "../services/tally.js";
import { faixasPadrao, rascunhoDeScoring, recalcularTotais } from "../services/tally-para-scoring.js";

/** A forma que a API do Tally devolve (documentação, 02/10/2026). */
const RESPOSTA_DO_TALLY = {
  questions: [
    { id: "b1", type: "HEADING_1", title: "Pesquisa de perfil" },
    { id: "b2", type: "INPUT_EMAIL", title: "Qual é o seu e-mail?" },
    {
      id: "b3",
      type: "MULTIPLE_CHOICE",
      title: "Qual é o faturamento médio mensal do seu negócio?",
      fields: [
        { uuid: "f1", type: "MULTIPLE_CHOICE_OPTION", title: "Até R$ 10 mil" },
        { uuid: "f2", type: "MULTIPLE_CHOICE_OPTION", title: "De R$ 10 mil a R$ 50 mil" },
        { uuid: "f3", type: "MULTIPLE_CHOICE_OPTION", title: "Mais de R$ 100 mil" },
      ],
    },
    {
      id: "b4",
      type: "DROPDOWN",
      title: "Há quanto tempo você tem o negócio?",
      fields: [
        { uuid: "f4", type: "DROPDOWN_OPTION", title: "Menos de 1 ano" },
        { uuid: "f5", type: "DROPDOWN_OPTION", title: "Mais de 3 anos" },
      ],
    },
    { id: "b5", type: "TEXTAREA", title: "O que mais te impede de crescer hoje?" },
    { id: "b6", type: "DIVIDER", title: "" },
    { id: "b7", type: "MULTIPLE_CHOICE", title: "Pergunta apagada", isDeleted: true, fields: [] },
  ],
};

describe("lerPerguntas", () => {
  it("separa pergunta de enfeite: título e divisória ficam de fora", () => {
    const r = lerPerguntas(RESPOSTA_DO_TALLY);
    expect(r.map((p) => p.id)).toEqual(["b2", "b3", "b4", "b5"]);
  });

  it("as alternativas vêm de `fields`, na ordem do formulário", () => {
    const faturamento = lerPerguntas(RESPOSTA_DO_TALLY).find((p) => p.id === "b3");
    expect(faturamento?.opcoes).toEqual([
      "Até R$ 10 mil",
      "De R$ 10 mil a R$ 50 mil",
      "Mais de R$ 100 mil",
    ]);
  });

  it("campo aberto não ganha alternativa — não há o que pontuar", () => {
    const aberta = lerPerguntas(RESPOSTA_DO_TALLY).find((p) => p.id === "b5");
    expect(aberta?.opcoes).toEqual([]);
  });

  it("pergunta apagada no Tally não entra", () => {
    expect(lerPerguntas(RESPOSTA_DO_TALLY).some((p) => p.id === "b7")).toBe(false);
  });

  it("tipo desconhecido entra como pergunta — sumir seria pior que aparecer", () => {
    const r = lerPerguntas({
      questions: [{ id: "x", type: "TIPO_QUE_O_TALLY_INVENTOU_AMANHA", title: "Nova pergunta" }],
    });
    expect(r).toHaveLength(1);
  });

  it("resposta vazia não explode", () => {
    expect(lerPerguntas({})).toEqual([]);
  });
});

describe("rascunhoDeScoring", () => {
  const perguntas = lerPerguntas(RESPOSTA_DO_TALLY);
  const rascunho = rascunhoDeScoring(perguntas, { projeto: "BBE" });
  const questions = rascunho.scoring_model?.questions ?? [];

  it("e-mail não vira pergunta de pontuação", () => {
    expect(questions.some((q) => q.label?.includes("e-mail"))).toBe(false);
  });

  it("toda alternativa chega, com ponto ZERADO esperando quem sabe o negócio", () => {
    const faturamento = questions.find((q) => q.id === "b3");
    expect(faturamento?.answers).toHaveLength(3);
    expect(faturamento?.answers.every((a) => "points" in a && a.points === 0)).toBe(true);
  });

  it("o alias de coluna cobre o título com e sem a interrogação", () => {
    const faturamento = questions.find((q) => q.id === "b3");
    expect(faturamento?.column_aliases).toContain("Qual é o faturamento médio mensal do seu negócio?");
    expect(faturamento?.column_aliases).toContain("Qual é o faturamento médio mensal do seu negócio");
  });

  it("pergunta aberta fica no modelo, sem alternativa", () => {
    const aberta = questions.find((q) => q.id === "b5");
    expect(aberta).toBeTruthy();
    expect(aberta?.answers).toEqual([]);
  });

  it("nasce com as quatro faixas — modelo sem faixa não classifica ninguém", () => {
    expect(rascunho.bands?.map((b) => b.id)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("recalcularTotais", () => {
  it("o máximo de cada pergunta é a melhor resposta vezes o peso", () => {
    const r = recalcularTotais({
      scoring_model: {
        questions: [
          { id: "q1", weight: 2, answers: [{ value: "a", points: 3 }, { value: "b", points: 10 }] },
          { id: "q2", weight: 1, answers: [{ value: "c", points: 5 }] },
        ],
      },
      bands: [],
    });
    const qs = r.scoring_model?.questions ?? [];
    expect(qs[0]?.max_points).toBe(20);
    expect(qs[1]?.max_points).toBe(5);
    expect(r.scoring_model?.max_possible_score).toBe(25);
  });

  it("as faixas acompanham o total — um máximo velho desloca todo mundo", () => {
    const r = recalcularTotais(
      {
        scoring_model: { questions: [{ id: "q1", answers: [{ value: "a", points: 100 }] }] },
        bands: [{ id: "A", range: { min: 0, max: 1 }, recommended_action: "antiga" }],
      },
      true,
    );
    expect(r.bands?.find((b) => b.id === "A")?.range).toEqual({ min: 75, max: 100 });
  });

  it("faixa já ajustada à mão é preservada quando não se pede para refazer", () => {
    const minha = [{ id: "A", range: { min: 10, max: 20 }, recommended_action: "minha" }];
    const r = recalcularTotais({
      scoring_model: { questions: [{ id: "q1", answers: [{ value: "a", points: 4 }] }] },
      bands: minha,
    });
    expect(r.bands).toEqual(minha);
  });

  it("pontuação condicional conta pelo melhor caso", () => {
    const r = recalcularTotais({
      scoring_model: {
        questions: [
          {
            id: "q1",
            answers: [
              { value: "sim", points_conditional: { if_q4_filled: 8, if_q4_empty: 2 } },
            ],
          },
        ],
      },
      bands: [],
    });
    expect(r.scoring_model?.max_possible_score).toBe(8);
  });
});

describe("faixasPadrao", () => {
  it("as quatro faixas cobrem de 0 ao máximo, sem buraco nem sobreposição", () => {
    const faixas = faixasPadrao(40);
    const ordenadas = [...faixas].sort((a, b) => a.range.min - b.range.min);
    expect(ordenadas[0]?.range.min).toBe(0);
    expect(ordenadas[ordenadas.length - 1]?.range.max).toBe(40);
    for (let i = 1; i < ordenadas.length; i += 1) {
      expect(ordenadas[i]!.range.min).toBe(ordenadas[i - 1]!.range.max + 1);
    }
  });

  it("modelo ainda sem pontos não gera faixa negativa", () => {
    for (const f of faixasPadrao(0)) {
      expect(f.range.min).toBeGreaterThanOrEqual(0);
      expect(f.range.max).toBeGreaterThanOrEqual(0);
    }
  });
});
