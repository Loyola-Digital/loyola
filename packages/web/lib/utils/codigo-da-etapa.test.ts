import { describe, expect, it } from "vitest";
import { TIPOS_CRIAVEIS, campanhasQueCasam } from "./codigo-da-etapa";

const campanhas = [
  { id: "1", name: "fz-a1-2026" },
  { id: "2", name: "fz-a2-2026" },
  { id: "3", name: "[FZ-A1] Hot Outubro" },
  { id: "4", name: "bbe-hamburguer-leads" },
];

describe("campanhasQueCasam", () => {
  it("pega a etapa certa e só ela", () => {
    expect(campanhasQueCasam(campanhas, "fz-a1").map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("ignora caixa e espaço — é o que vem de um campo de texto", () => {
    expect(campanhasQueCasam(campanhas, "  FZ-A2 ").map((c) => c.id)).toEqual(["2"]);
  });

  it("código vazio devolve NENHUMA, não todas", () => {
    // Substring de "" é sempre verdadeira: sem este guarda, abrir o wizard
    // pré-selecionaria todas as campanhas da conta.
    expect(campanhasQueCasam(campanhas, "")).toEqual([]);
    expect(campanhasQueCasam(campanhas, "   ")).toEqual([]);
  });

  it("código que não existe devolve lista vazia, sem explodir", () => {
    expect(campanhasQueCasam(campanhas, "dg-pg09")).toEqual([]);
    expect(campanhasQueCasam([], "fz-a1")).toEqual([]);
  });
});

describe("TIPOS_CRIAVEIS", () => {
  it("não oferece `lyrio` — ele nasce do funil mobile, não da mão de ninguém", () => {
    expect(TIPOS_CRIAVEIS).not.toContain("lyrio");
  });

  it("não tem tipo repetido (a grade os renderiza por `key`)", () => {
    expect(new Set(TIPOS_CRIAVEIS).size).toBe(TIPOS_CRIAVEIS.length);
  });
});
