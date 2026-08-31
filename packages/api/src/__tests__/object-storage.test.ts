/**
 * A lista de tipos aceitos no upload.
 *
 * É uma lista FECHADA porque o que entra aqui é servido publicamente pelo
 * bucket. Um teste por tipo permitido parece exagero até alguém "simplificar"
 * a checagem para `startsWith("application/")` e liberar executável.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  checarStorage,
  explicarErroDeStorage,
  isAllowedMime,
} from "../services/object-storage.js";

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

describe("o erro do provedor vira uma frase acionável", () => {
  /**
   * O upload falhou em produção e a tela mostrou `Internal Server Error` — que
   * é o que sobra quando se lê só a `message` do erro do SDK. Bucket
   * inexistente e credencial sem permissão produzem a MESMA frase, e as duas
   * se resolvem de formas opostas.
   */
  it("NoSuchBucket manda criar o bucket, não falar com o suporte", () => {
    const r = explicarErroDeStorage({ name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } });
    expect(r.mensagem).toMatch(/bucket não existe/i);
    expect(r.codigo).toBe("NoSuchBucket");
    expect(r.status).toBe(404);
  });

  it("AccessDenied aponta permissão, que é outra coisa", () => {
    const r = explicarErroDeStorage({ name: "AccessDenied" });
    expect(r.mensagem).toMatch(/permissão/i);
  });

  it("assinatura errada nomeia as duas variáveis que a causam", () => {
    const r = explicarErroDeStorage({ name: "SignatureDoesNotMatch" });
    expect(r.mensagem).toContain("STORAGE_SECRET_ACCESS_KEY");
    expect(r.mensagem).toContain("STORAGE_REGION");
  });

  it("erro desconhecido preserva a mensagem E acrescenta o código", () => {
    // O código é o que permite procurar; a mensagem sozinha não.
    const r = explicarErroDeStorage({ name: "TooManyBuckets", message: "deu ruim" });
    expect(r.mensagem).toBe("deu ruim (TooManyBuckets)");
  });

  it("`Error` genérico não polui a frase com o próprio nome", () => {
    const r = explicarErroDeStorage({ name: "Error", message: "Internal Server Error" });
    expect(r.mensagem).toBe("Internal Server Error");
  });

  it("erro sem nada devolve uma frase, nunca undefined", () => {
    expect(explicarErroDeStorage({}).mensagem).toBeTruthy();
    expect(explicarErroDeStorage(null).mensagem).toBeTruthy();
  });
});

describe("o check de storage", () => {
  it("sem variáveis, diz isso em vez de tentar a rede", async () => {
    const r = await checarStorage({ endpoint: "", accessKeyId: "", secretAccessKey: "", bucket: "", publicUrl: "" });
    expect(r.ok).toBe(false);
    expect(r.erro?.codigo).toBe("NOT_CONFIGURED");
  });
});
