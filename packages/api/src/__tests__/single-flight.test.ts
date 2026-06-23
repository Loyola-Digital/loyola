import { describe, it, expect, vi } from "vitest";
import { singleFlight, inFlightCount } from "../utils/single-flight.js";

describe("singleFlight", () => {
  it("coalesces concurrent calls with the same key into a single execution", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "result";
    });

    // 4 pessoas batendo na MESMA chave ao mesmo tempo (o cenário relatado).
    const [a, b, c, d] = await Promise.all([
      singleFlight("k", fn),
      singleFlight("k", fn),
      singleFlight("k", fn),
      singleFlight("k", fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1); // <- mata a "consulta em dobro"
    expect([a, b, c, d]).toEqual(["result", "result", "result", "result"]);
  });

  it("does NOT coalesce calls with different keys", async () => {
    const fn = vi.fn(async (v: string) => v);
    await Promise.all([
      singleFlight("k1", () => fn("1")),
      singleFlight("k2", () => fn("2")),
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-executes after the in-flight promise settles (it is not a cache)", async () => {
    const fn = vi.fn(async () => "x");
    await singleFlight("k", fn);
    await singleFlight("k", fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(inFlightCount()).toBe(0);
  });

  it("propagates rejection to all waiters and clears the key", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const results = await Promise.allSettled([
      singleFlight("err", fn),
      singleFlight("err", fn),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // chave liberada após rejeição — não fica presa
    expect(inFlightCount()).toBe(0);
    // próxima chamada re-executa
    await expect(singleFlight("err", async () => "ok")).resolves.toBe("ok");
  });

  it("does not leak the key when fn throws synchronously", async () => {
    const fn = () => {
      throw new Error("sync boom");
    };
    await expect(singleFlight("sync", fn as () => Promise<never>)).rejects.toThrow("sync boom");
    expect(inFlightCount()).toBe(0);
  });
});
