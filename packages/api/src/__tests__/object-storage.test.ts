/**
 * A lista de tipos aceitos no upload.
 *
 * É uma lista FECHADA porque o que entra aqui é servido publicamente pelo
 * bucket. Um teste por tipo permitido parece exagero até alguém "simplificar"
 * a checagem para `startsWith("application/")` e liberar executável.
 */

import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, isAllowedMime, presignUpload } from "../services/object-storage.js";

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

describe("a URL assinada não pode carregar checksum", () => {
  /**
   * O bug que travou o upload deste app desde sempre.
   *
   * Desde a v3.729 o SDK inclui um CRC32 por padrão. Numa URL assinada isso é
   * fatal: na hora de assinar não existe corpo, então o parâmetro sai como
   * `x-amz-checksum-crc32=AAAAAA==` (o CRC32 do vazio) e vai colado na
   * assinatura. O navegador manda o arquivo real, o provedor calcula o CRC32
   * do corpo, compara com o do vazio e recusa — o Supabase com **500**, o que
   * faz parecer problema do servidor deles.
   */
  it("presignUpload não põe x-amz-checksum-crc32 na URL", async () => {
    const cfg = {
      endpoint: "https://exemplo.storage.supabase.co/storage/v1/s3",
      accessKeyId: "fake",
      secretAccessKey: "fake",
      bucket: "swipe-files",
      publicUrl: "https://exemplo.storage.supabase.co/storage/v1/object/public/swipe-files",
      region: "us-east-2",
    };
    const { uploadUrl } = await presignUpload(cfg, { mime: "application/pdf" });
    const params = [...new URL(uploadUrl).searchParams.keys()];

    expect(params.some((p) => /checksum/i.test(p))).toBe(false);
  });

  it("a chave sai com a extensão do MIME, não do nome enviado", async () => {
    // Nome vindo do cliente é entrada não confiável: path traversal, colisão,
    // caractere exótico. A extensão vem do tipo, que já passou pela allowlist.
    const cfg = {
      endpoint: "https://exemplo.storage.supabase.co/storage/v1/s3",
      accessKeyId: "fake",
      secretAccessKey: "fake",
      bucket: "swipe-files",
      publicUrl: "https://exemplo.com/pub",
      region: "us-east-2",
    };
    const { key } = await presignUpload(cfg, { mime: "application/pdf" });
    expect(key).toMatch(/^swipe\/[0-9a-f-]{36}\.pdf$/);
  });
});
