import { describe, expect, it } from "vitest";
import { lerNdjson } from "./ndjson";

/** Um stream que entrega exatamente os pedaços dados — inclusive linhas partidas. */
function stream(pedacos: string[]): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of pedacos) controller.enqueue(codificador.encode(p));
      controller.close();
    },
  });
}

describe("linhas completas", () => {
  it("entrega uma por uma, na ordem", async () => {
    const recebidas: unknown[] = [];
    const r = await lerNdjson(stream(['{"a":1}\n', '{"a":2}\n']), (l) => recebidas.push(l));
    expect(recebidas).toEqual([{ a: 1 }, { a: 2 }]);
    expect(r.linhas).toBe(2);
  });

  it("a última linha sem quebra também é entregue", async () => {
    const recebidas: unknown[] = [];
    await lerNdjson(stream(['{"a":1}\n{"a":2}']), (l) => recebidas.push(l));
    expect(recebidas).toHaveLength(2);
  });
});

describe("linha partida entre chunks", () => {
  it("junta os pedaços em vez de tentar decodificar metade", async () => {
    // É o caso que acontece SEMPRE em rede real: o chunk termina no meio do JSON.
    const recebidas: unknown[] = [];
    await lerNdjson(stream(['{"wid', 'get":"a"}\n{"widget":"b"}\n']), (l) => recebidas.push(l));
    expect(recebidas).toEqual([{ widget: "a" }, { widget: "b" }]);
  });

  it("caractere multibyte partido entre chunks não vira lixo", async () => {
    const bytes = new TextEncoder().encode('{"n":"são"}\n');
    const meio = 8;
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, meio));
        c.enqueue(bytes.slice(meio));
        c.close();
      },
    });
    const recebidas: { n: string }[] = [];
    await lerNdjson<{ n: string }>(s, (l) => recebidas.push(l));
    expect(recebidas[0]!.n).toBe("são");
  });
});

describe("T3 · erro no meio não derruba o resto", () => {
  it("as linhas boas chegam e a ruim é contada", async () => {
    const recebidas: unknown[] = [];
    const r = await lerNdjson(
      stream(['{"ok":1}\n', "isto nao e json\n", '{"ok":2}\n']),
      (l) => recebidas.push(l),
    );
    expect(recebidas).toEqual([{ ok: 1 }, { ok: 2 }]);
    expect(r.ilegiveis).toBe(1);
  });

  it("linhas em branco são ignoradas sem contar como erro", async () => {
    const r = await lerNdjson(stream(['{"ok":1}\n\n\n']), () => {});
    expect(r).toEqual({ linhas: 1, ilegiveis: 0 });
  });
});

describe("aborto", () => {
  it("para de entregar quando o sinal já veio abortado", async () => {
    const controlador = new AbortController();
    controlador.abort();
    const recebidas: unknown[] = [];
    await lerNdjson(stream(['{"a":1}\n']), (l) => recebidas.push(l), controlador.signal);
    expect(recebidas).toEqual([]);
  });

  it("corpo nulo não quebra", async () => {
    expect(await lerNdjson(null, () => {})).toEqual({ linhas: 0, ilegiveis: 0 });
  });
});
