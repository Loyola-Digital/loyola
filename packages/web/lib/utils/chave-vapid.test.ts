import { describe, expect, it } from "vitest";
import { chaveVapidParaBytes } from "./chave-vapid";

describe("chaveVapidParaBytes", () => {
  it("devolve os 65 bytes de uma chave VAPID real", () => {
    // Chave pública de verdade (gerada por `web-push`): 65 bytes, começando
    // com 0x04, que é o prefixo de ponto não comprimido da curva P-256.
    const chave =
      "BA4tCTel3BlZ1vfmaPIFXQ7dhq8EP_YC_mRk3ihShmlpc0npCg8-aUL4v8UwSDcr5T613ajBM6XzQ6EeYOoV3Rw";
    const bytes = chaveVapidParaBytes(chave);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("converte os caracteres que só existem no base64url", () => {
    // `-` e `_` viram `+` e `/`. Sem a troca, `atob` lança.
    expect(Array.from(chaveVapidParaBytes("-_8"))).toEqual([251, 255]);
  });

  it("aceita chave sem o padding `=`", () => {
    // "AQ" (sem padding) e "AQ==" têm de dar o mesmo byte.
    expect(Array.from(chaveVapidParaBytes("AQ"))).toEqual([1]);
    expect(Array.from(chaveVapidParaBytes("AQ=="))).toEqual([1]);
  });

  it("o buffer é ArrayBuffer, não compartilhado", () => {
    expect(chaveVapidParaBytes("AQ").buffer).toBeInstanceOf(ArrayBuffer);
  });
});
