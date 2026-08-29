/**
 * A fila de salvamento do canvas.
 *
 * Os três testes que importam são de CONCORRÊNCIA: debounce, um por vez e
 * descarga. Nenhum deles aparece olhando a tela — só aparecem em produção, como
 * layout que volta sozinho.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFilaDeSalvamento } from "./fila-de-salvamento";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Um `salvar` que só resolve quando o teste mandar. */
function salvarControlado() {
  const chamadas: unknown[] = [];
  const resolvedores: (() => void)[] = [];
  const salvar = vi.fn(async (v: unknown) => {
    chamadas.push(v);
    await new Promise<void>((resolve) => resolvedores.push(resolve));
  });
  return {
    salvar,
    chamadas,
    /** Libera a chamada de índice `i`. */
    liberar(i = 0) {
      resolvedores[i]?.();
    },
    emVoo: () => resolvedores.length,
  };
}

describe("T1 · debounce", () => {
  it("dois agendamentos em sequência geram UM salvamento", async () => {
    const salvar = vi.fn(async () => {});
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600 });

    fila.agendar({ n: 1 });
    vi.advanceTimersByTime(200);
    fila.agendar({ n: 2 });
    vi.advanceTimersByTime(599);
    expect(salvar).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(salvar).toHaveBeenCalledTimes(1);
    // O último valor vence: o arrasto que interessa é onde o widget parou.
    expect(salvar).toHaveBeenCalledWith({ n: 2 });
  });

  it("agendamentos separados por mais que o atraso geram dois salvamentos", async () => {
    const salvar = vi.fn(async () => {});
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600 });

    fila.agendar({ n: 1 });
    await vi.advanceTimersByTimeAsync(700);
    fila.agendar({ n: 2 });
    await vi.advanceTimersByTimeAsync(700);

    expect(salvar).toHaveBeenCalledTimes(2);
  });
});

describe("T2 · nunca dois em voo", () => {
  it("o segundo espera o primeiro terminar", async () => {
    const c = salvarControlado();
    const fila = criarFilaDeSalvamento(c.salvar, { atrasoMs: 600 });

    fila.agendar({ n: 1 });
    await vi.advanceTimersByTimeAsync(600);
    expect(c.salvar).toHaveBeenCalledTimes(1);

    // Chega mais coisa enquanto o primeiro ainda não respondeu.
    fila.agendar({ n: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(c.salvar).toHaveBeenCalledTimes(1);

    c.liberar(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.salvar).toHaveBeenCalledTimes(2);
    expect(c.chamadas[1]).toEqual({ n: 2 });
  });

  it("três arrastos durante um salvamento lento viram UM salvamento depois", async () => {
    // Sem isto, o canvas dispararia um PUT por arrasto assim que o primeiro
    // voltasse — e a resposta lenta de um sobrescreveria a rápida do outro.
    const c = salvarControlado();
    const fila = criarFilaDeSalvamento(c.salvar, { atrasoMs: 600 });

    fila.agendar({ n: 1 });
    await vi.advanceTimersByTimeAsync(600);

    for (const n of [2, 3, 4]) {
      fila.agendar({ n });
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(c.salvar).toHaveBeenCalledTimes(1);

    c.liberar(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.salvar).toHaveBeenCalledTimes(2);
    expect(c.chamadas[1]).toEqual({ n: 4 });
  });
});

describe("T3 · descarga", () => {
  it("descarregar salva o pendente sem esperar o temporizador", async () => {
    const salvar = vi.fn(async () => {});
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600 });

    fila.agendar({ n: 1 });
    await fila.descarregar();

    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("descarregar sem nada pendente não salva à toa", async () => {
    const salvar = vi.fn(async () => {});
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600 });
    await fila.descarregar();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("depois da descarga a fila fica livre", async () => {
    const salvar = vi.fn(async () => {});
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600 });
    fila.agendar({ n: 1 });
    await fila.descarregar();
    expect(fila.ocupada()).toBe(false);
  });
});

describe("falha", () => {
  it("erro não trava a fila: o próximo salvamento acontece", async () => {
    const salvar = vi
      .fn()
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValue(undefined);
    const aoFalhar = vi.fn();
    const fila = criarFilaDeSalvamento(salvar, { atrasoMs: 600, aoFalhar });

    fila.agendar({ n: 1 });
    await vi.advanceTimersByTimeAsync(600);
    expect(aoFalhar).toHaveBeenCalledTimes(1);

    fila.agendar({ n: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(salvar).toHaveBeenCalledTimes(2);
  });
});
