import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORES_DO_GOOGLE,
  hexDoColorId,
  PALETA_DO_GOOGLE,
} from "../services/cores-do-google.js";

describe("CORES_DO_GOOGLE", () => {
  it("tem as onze cores de evento, com os colorId do Google", () => {
    expect(CORES_DO_GOOGLE).toHaveLength(11);
    expect(CORES_DO_GOOGLE.map((c) => c.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
    ]);
  });

  it("não repete hex", () => {
    // Duas cores iguais na paleta cíclica fariam duas campanhas seguidas
    // saírem da mesma cor — o problema que a paleta existe para evitar.
    const hexes = CORES_DO_GOOGLE.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("todo hex é #rrggbb — vai direto para `background-color`", () => {
    for (const c of CORES_DO_GOOGLE) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("hexDoColorId", () => {
  it("traduz o colorId que o Google manda", () => {
    expect(hexDoColorId("11")).toBe("#D50000"); // Tomate
    expect(hexDoColorId("7")).toBe("#039BE5"); // Pavão
  });

  it("aceita número, porque a API às vezes manda assim", () => {
    expect(hexDoColorId(String(5))).toBe("#F6BF26");
  });

  it("devolve null quando o evento não tem cor própria", () => {
    // Não é falha: `colorId` só existe quando alguém pintou o evento à mão.
    // Quem trata o null decide o que fazer — aqui, a paleta por nome.
    expect(hexDoColorId(null)).toBeNull();
    expect(hexDoColorId(undefined)).toBeNull();
    expect(hexDoColorId("")).toBeNull();
  });

  it("devolve null para colorId fora da tabela", () => {
    expect(hexDoColorId("42")).toBeNull();
  });
});

describe("PALETA_DO_GOOGLE", () => {
  it("é só os hex, na ordem — o formato que a paleta cíclica espera", () => {
    expect(PALETA_DO_GOOGLE[0]).toBe(CORES_DO_GOOGLE[0]!.hex);
    expect(PALETA_DO_GOOGLE).toHaveLength(11);
  });
});

describe("a cópia no web não divergiu", () => {
  /**
   * A mesma tabela existe em `packages/web/lib/utils/cores-do-google.ts`,
   * porque o web não importa valores de `@loyola-x/shared`. Duas cópias
   * silenciosamente diferentes dariam cores distintas na mesma tela — o
   * problema que esta feature existe para resolver.
   */
  it("tem os mesmos id, nome e hex", () => {
    const fonte = readFileSync(
      new URL("../../../web/lib/utils/cores-do-google.ts", import.meta.url),
      "utf8",
    );
    for (const c of CORES_DO_GOOGLE) {
      expect(fonte).toContain(
        `{ id: "${c.id}", nome: "${c.nome}", hex: "${c.hex}" }`,
      );
    }
  });
});
