import { describe, it, expect } from "vitest";
import {
  filtrarPorPublico,
  avisoDeNaoClassificados,
  type ClassificacaoDeEntidade,
} from "../filtro-de-publico";

interface Linha { id: string; spend: number }
const L = (id: string, spend: number): Linha => ({ id, spend });

const MAPA: Record<string, ClassificacaoDeEntidade> = {
  a1: { temperatura: "frio", nivel: "campanha" },
  a2: { temperatura: "quente", nivel: "campanha" },
  a3: { temperatura: "frio", nivel: "conjunto" },
  // a4 propositalmente ausente — é o grupo do AC4.
};
const LINHAS = [L("a1", 100), L("a2", 200), L("a3", 50), L("a4", 30)];

describe("filtrarPorPublico", () => {
  it("`todos` devolve tudo, sem contar exclusão", () => {
    const r = filtrarPorPublico(LINHAS, "todos", (l) => l.id, MAPA);
    expect(r.linhas).toHaveLength(4);
    expect(r.semClassificacao).toBe(0);
    expect(r.doOutroPublico).toBe(0);
  });

  it("`frio` devolve só as frias", () => {
    const r = filtrarPorPublico(LINHAS, "frio", (l) => l.id, MAPA);
    expect(r.linhas.map((l) => l.id)).toEqual(["a1", "a3"]);
  });

  it("separa quem ficou de fora por FALTA de classificação de quem é do outro público", () => {
    // A distinção é o ponto: uma é limite do dado, a outra é o filtro
    // funcionando. Somá-las esconderia o problema real.
    const r = filtrarPorPublico(LINHAS, "frio", (l) => l.id, MAPA);
    expect(r.semClassificacao).toBe(1); // a4
    expect(r.doOutroPublico).toBe(1);   // a2, que é quente
  });

  it("AC3 — quente + frio + não classificado fecha com todos", () => {
    const soma = (ls: Linha[]) => ls.reduce((s, l) => s + l.spend, 0);
    const todos = filtrarPorPublico(LINHAS, "todos", (l) => l.id, MAPA);
    const q = filtrarPorPublico(LINHAS, "quente", (l) => l.id, MAPA);
    const f = filtrarPorPublico(LINHAS, "frio", (l) => l.id, MAPA);
    const naoClassificadas = LINHAS.filter((l) => !MAPA[l.id]);
    expect(soma(q.linhas) + soma(f.linhas) + soma(naoClassificadas)).toBe(soma(todos.linhas));
  });

  it("mapa ausente não derruba — tudo cai em não classificado", () => {
    const r = filtrarPorPublico(LINHAS, "frio", (l) => l.id, undefined);
    expect(r.linhas).toHaveLength(0);
    expect(r.semClassificacao).toBe(4);
  });
});

describe("avisoDeNaoClassificados (AC4)", () => {
  it("em `todos`, não há aviso", () => {
    const r = filtrarPorPublico(LINHAS, "todos", (l) => l.id, MAPA);
    expect(avisoDeNaoClassificados(r, "todos")).toBeNull();
  });

  it("com filtro e nenhuma linha sem classificação, não há aviso", () => {
    const r = filtrarPorPublico([L("a1", 1), L("a2", 2)], "frio", (l) => l.id, MAPA);
    expect(avisoDeNaoClassificados(r, "frio")).toBeNull();
  });

  it("com filtro e linhas sem classificação, o aviso diz quantas e explica a soma", () => {
    const r = filtrarPorPublico(LINHAS, "frio", (l) => l.id, MAPA);
    const aviso = avisoDeNaoClassificados(r, "frio")!;
    expect(aviso).toContain("1");
    expect(aviso).toMatch(/não fecha com Todos/i);
  });

  it("o plural acompanha", () => {
    const muitas = [...LINHAS, L("a5", 1), L("a6", 1)];
    const r = filtrarPorPublico(muitas, "frio", (l) => l.id, MAPA);
    expect(avisoDeNaoClassificados(r, "frio")!).toContain("3 linhas ficaram");
  });
});
