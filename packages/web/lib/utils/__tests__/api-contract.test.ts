// Story 29.46 (AC5) — os quatro casos do AC, sobre a função pura.
import { describe, it, expect } from "vitest";
import { compareApiContract } from "@/lib/utils/api-contract";

describe("compareApiContract", () => {
  // AC5.4 — o caso das três ocorrências registradas no projeto.
  it("api menor que web = API atras", () => {
    expect(compareApiContract(3, 4)).toEqual({ kind: "api-atras", api: 3, web: 4 });
  });

  // AC5.5 — acontece quando o deploy da Vercel atrasa em vez do da API.
  it("api maior que web = web atras", () => {
    expect(compareApiContract(5, 4)).toEqual({ kind: "web-atras", api: 5, web: 4 });
  });

  // AC5.6
  it("iguais = alinhado", () => {
    expect(compareApiContract(4, 4)).toEqual({ kind: "alinhado" });
  });

  // AC5.7 — o caso que impede a story de disparar contra si mesma: no dia do
  // merge, a API em producao ainda nao devolve `contract`.
  it("contrato ausente nao vira alarme", () => {
    expect(compareApiContract(undefined, 4)).toEqual({ kind: "alinhado" });
    expect(compareApiContract(null, 4)).toEqual({ kind: "alinhado" });
  });

  it("valor nao numerico e tratado como ausente", () => {
    expect(compareApiContract(Number.NaN, 4)).toEqual({ kind: "alinhado" });
    expect(compareApiContract("3" as unknown as number, 4)).toEqual({ kind: "alinhado" });
  });
});
