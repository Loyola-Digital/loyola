/**
 * A URL pública sai da CHAVE, não do que está gravado.
 *
 * Este teste nasceu de um link morto em produção: um deploy com
 * `STORAGE_PUBLIC_URL` ainda no valor de exemplo gravou
 * `https://seuprojeto.supabase.co/…` dentro do banco, e arrumar a variável
 * depois não consertou a linha — a URL errada já estava congelada nela.
 */

import { describe, expect, it } from "vitest";
import { pareceplaceholder, urlPublica } from "../services/object-storage.js";

const BASE = "https://abc123.storage.supabase.co/storage/v1/object/public/swipe-files";
const CHAVE = "swipe/d910f263-0cb2-4d1f-b1ac-b49381d9a9ea.pdf";

describe("urlPublica", () => {
  it("monta a partir da chave, ignorando a URL gravada", () => {
    // A linha quebrada de verdade, como está no banco.
    const linha = {
      fileKey: CHAVE,
      fileUrl: `https://SEUPROJETO.supabase.co/storage/v1/object/public/swipe-files/${CHAVE}`,
    };
    expect(urlPublica(linha, BASE)).toBe(`${BASE}/${CHAVE}`);
  });

  it("tolera barra sobrando na base", () => {
    expect(urlPublica({ fileKey: CHAVE }, `${BASE}///`)).toBe(`${BASE}/${CHAVE}`);
  });

  it("sem chave, devolve o que está gravado", () => {
    // Link externo colado à mão: não tem chave e nem deveria ter.
    const externo = "https://exemplo.com/anuncio.png";
    expect(urlPublica({ fileUrl: externo }, BASE)).toBe(externo);
  });

  it("sem base configurada, devolve o gravado em vez de inventar", () => {
    expect(urlPublica({ fileKey: CHAVE, fileUrl: "https://velho/x.pdf" }, undefined)).toBe(
      "https://velho/x.pdf",
    );
  });

  it("base ainda em placeholder não vira URL nova", () => {
    // Trocar um link morto por outro link morto não é conserto.
    const r = urlPublica(
      { fileKey: CHAVE, fileUrl: "https://gravado/x.pdf" },
      "https://seuprojeto.supabase.co/storage/v1/object/public/swipe-files",
    );
    expect(r).toBe("https://gravado/x.pdf");
  });

  it("nada gravado e nada configurado é null, não string quebrada", () => {
    expect(urlPublica({}, undefined)).toBeNull();
  });
});

describe("pareceplaceholder", () => {
  it("pega o valor que foi para produção", () => {
    expect(pareceplaceholder("https://seuprojeto.supabase.co/storage/v1/object/public/x")).toBe(
      true,
    );
  });

  it("não acusa uma URL real", () => {
    expect(pareceplaceholder(BASE)).toBe(false);
  });
});
