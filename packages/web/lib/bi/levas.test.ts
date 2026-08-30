import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarControleDeLevas, type ContextoDaLeva } from "./levas";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("T1 · debounce entre trocas de filtro", () => {
  it("duas trocas rápidas geram UMA leva", async () => {
    const executar = vi.fn(async (_e: unknown, _ctx: unknown) => {});
    const controle = criarControleDeLevas(executar, 500);

    controle.pedir({ p: 1 });
    vi.advanceTimersByTime(300);
    controle.pedir({ p: 2 });
    vi.advanceTimersByTime(499);
    expect(executar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(executar).toHaveBeenCalledTimes(1);
    expect(executar).toHaveBeenLastCalledWith({ p: 2 }, expect.anything());
  });

  it("o botão de atualizar não espera o debounce", async () => {
    const executar = vi.fn(async () => {});
    const controle = criarControleDeLevas(executar, 500);
    await controle.agora({ p: 1 });
    expect(executar).toHaveBeenCalledTimes(1);
  });
});

describe("T2 · a leva velha não pinta", () => {
  it("a anterior é abortada e deixa de ser a atual", async () => {
    const contextos: ContextoDaLeva[] = [];
    const controle = criarControleDeLevas(async (_e, ctx) => {
      contextos.push(ctx);
      // Nunca resolve: simula a leva lenta que ainda está em voo.
      await new Promise(() => {});
    }, 500);

    // Sem `await`: a leva 1 fica em voo de propósito — é justamente o estado
    // em que a resposta antiga poderia vencer a nova.
    void controle.agora({ p: 1 });
    expect(contextos[0]!.ehAtual()).toBe(true);

    void controle.agora({ p: 2 });
    // A resposta da leva 1 pode chegar agora — e precisa ser descartada.
    expect(contextos[0]!.ehAtual()).toBe(false);
    expect(contextos[0]!.sinal.aborted).toBe(true);
    expect(contextos[1]!.ehAtual()).toBe(true);
  });

  it("cancelar invalida a leva em voo", async () => {
    const contextos: ContextoDaLeva[] = [];
    const controle = criarControleDeLevas(async (_e, ctx) => {
      contextos.push(ctx);
      await new Promise(() => {});
    }, 500);

    void controle.agora({ p: 1 });
    controle.cancelar();
    expect(contextos[0]!.ehAtual()).toBe(false);
    expect(contextos[0]!.sinal.aborted).toBe(true);
  });

  it("cancelar também mata a leva ainda agendada", async () => {
    const executar = vi.fn(async () => {});
    const controle = criarControleDeLevas(executar, 500);
    controle.pedir({ p: 1 });
    controle.cancelar();
    await vi.advanceTimersByTimeAsync(600);
    expect(executar).not.toHaveBeenCalled();
  });
});
