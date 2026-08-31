/**
 * A lista de tipos aceitos no upload.
 *
 * É uma lista FECHADA porque o que entra aqui é servido publicamente pelo
 * bucket. Um teste por tipo permitido parece exagero até alguém "simplificar"
 * a checagem para `startsWith("application/")` e liberar executável.
 */

import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, isAllowedMime } from "../services/object-storage.js";

describe("tipos permitidos", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"])(
    "%s é aceito",
    (mime) => expect(isAllowedMime(mime)).toBe(true),
  );

  it.each(["video/mp4", "video/quicktime", "video/webm"])("%s é aceito", (mime) =>
    expect(isAllowedMime(mime)).toBe(true),
  );

  it("PDF é aceito — criativo de anúncio chega assim", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
  });
});

describe("tipos recusados", () => {
  it.each([
    "application/octet-stream",
    "application/x-msdownload",
    "text/html",
    "image/svg+xml",
    "application/zip",
    "application/json",
  ])("%s é recusado", (mime) => expect(isAllowedMime(mime)).toBe(false));

  it("liberar PDF não abriu a porta para `application/*`", () => {
    // O teste que importa depois desta mudança: a checagem continua sendo por
    // item, não por prefixo.
    expect(isAllowedMime("application/javascript")).toBe(false);
    expect(isAllowedMime("application/x-httpd-php")).toBe(false);
  });

  it("SVG segue fora: é XML e executa script no navegador", () => {
    expect(isAllowedMime("image/svg+xml")).toBe(false);
  });

  it("mime vazio ou inventado não passa", () => {
    expect(isAllowedMime("")).toBe(false);
    expect(isAllowedMime("application/pdf; charset=utf-8")).toBe(false);
  });
});

describe("limite de tamanho", () => {
  it("são 200 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
  });
});

describe("o upload não passa mais por URL assinada", () => {
  /**
   * O caminho anterior — navegador → bucket, por URL assinada — foi removido.
   *
   * Dois motivos, nesta ordem: o Supabase Storage responde **500** ao `PUT`
   * assinado, e manter dois caminhos para a mesma coisa, um deles quebrado em
   * produção, é pior que ter um só.
   *
   * O bug que apareceu no meio do caminho vale registro: desde a v3.729 o SDK
   * inclui um CRC32 por padrão, e numa URL assinada ele sai como o CRC32 do
   * VAZIO — colado na assinatura. `requestChecksumCalculation: "WHEN_REQUIRED"`
   * segue no cliente porque protege o upload pelo servidor pelo mesmo motivo:
   * provedor S3-compatível que não implementa o checksum novo recusa.
   */
  it("presignUpload não é mais exportado", async () => {
    const mod = (await import("../services/object-storage.js")) as Record<string, unknown>;
    expect(mod.presignUpload).toBeUndefined();
    expect(typeof mod.uploadDireto).toBe("function");
  });
});
