/**
 * A prévia dos totais no editor visual de Lead Scoring.
 *
 * `max_points`, `max_possible_score` e os limites das faixas são DERIVADOS dos
 * pontos. Mantidos à mão divergem em silêncio — um máximo velho desloca todas
 * as faixas e muda a classificação de todo mundo sem nenhum erro aparecer.
 * Quem recalcula ao salvar é o servidor; esta conta é a prévia da mesma regra,
 * e precisa dar o mesmo número.
 */

import { describe, expect, it } from "vitest";
import { totaisDoModelo } from "@/components/funnels/editor-de-scoring";

describe("totaisDoModelo", () => {
  it("cada pergunta vale a melhor resposta vezes o peso", () => {
    const r = totaisDoModelo({
      scoring_model: {
        questions: [
          { id: "q1", weight: 2, answers: [{ value: "a", points: 3 }, { value: "b", points: 10 }] },
          { id: "q2", weight: 1, answers: [{ value: "c", points: 5 }] },
        ],
      },
    });
    expect(r.porPergunta.get("q1")).toBe(20);
    expect(r.porPergunta.get("q2")).toBe(5);
    expect(r.total).toBe(25);
  });

  it("peso ausente conta como 1 — não como zero", () => {
    const r = totaisDoModelo({
      scoring_model: { questions: [{ id: "q1", answers: [{ value: "a", points: 7 }] }] },
    });
    expect(r.total).toBe(7);
  });

  it("pontuação condicional conta pelo melhor caso", () => {
    const r = totaisDoModelo({
      scoring_model: {
        questions: [
          {
            id: "q1",
            answers: [{ value: "sim", points_conditional: { if_q4_filled: 8, if_q4_empty: 2 } }],
          },
        ],
      },
    });
    expect(r.total).toBe(8);
  });

  it("pergunta de resposta aberta não soma nada", () => {
    const r = totaisDoModelo({
      scoring_model: { questions: [{ id: "q1", answers: [] }] },
    });
    expect(r.total).toBe(0);
  });

  it("modelo vazio dá zero em vez de explodir", () => {
    expect(totaisDoModelo({}).total).toBe(0);
    expect(totaisDoModelo({ scoring_model: {} }).total).toBe(0);
  });

  it("ponto negativo é respeitado — desqualificar é uma decisão legítima", () => {
    const r = totaisDoModelo({
      scoring_model: {
        questions: [{ id: "q1", answers: [{ value: "ruim", points: -5 }, { value: "bom", points: 4 }] }],
      },
    });
    expect(r.total).toBe(4);
  });
});
