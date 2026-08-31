/**
 * A lista de tipos aceitos no upload.
 *
 * É uma lista FECHADA porque o que entra aqui é servido publicamente pelo
 * bucket. Um teste por tipo permitido parece exagero até alguém "simplificar"
 * a checagem para `startsWith("application/")` e liberar executável.
 */

import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  checarStorage,
  explicarErroDeStorage,
  isAllowedMime,
  uploadComCliente,
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

describe("o caminho do upload depende do tamanho", () => {
  /**
   * O `Upload` do lib-storage recebendo stream não sabe o tamanho, então usa
   * sempre *multipart upload* — mesmo para um PDF de 2,6 MB. O Supabase
   * responde `InternalError` a esse fluxo, e foi o que segurou o upload deste
   * app. Sabendo o tamanho, um `PutObject` simples resolve.
   */
  function streamDe(bytes: number): Readable {
    const pedaco = Buffer.alloc(64 * 1024, 1);
    let restante = bytes;
    return new Readable({
      read() {
        if (restante <= 0) return void this.push(null);
        const n = Math.min(pedaco.length, restante);
        restante -= n;
        this.push(pedaco.subarray(0, n));
      },
    });
  }

  const cfg = {
    endpoint: "https://exemplo.storage.supabase.co/storage/v1/s3",
    accessKeyId: "fake",
    secretAccessKey: "fake",
    bucket: "swipe-files",
    publicUrl: "https://exemplo.com/pub",
    region: "us-east-2",
  };

  it("arquivo pequeno vai por PutObject, com ContentLength", async () => {
    const enviados: string[] = [];
    const s3 = {
      send: vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        enviados.push(cmd.constructor.name);
        expect(cmd.input.ContentLength).toBe(2_000_000);
        return {};
      }),
    };
    await uploadComCliente(s3 as never, cfg, {
      corpo: streamDe(2_000_000),
      mime: "application/pdf",
    });
    expect(enviados).toEqual(["PutObjectCommand"]);
  });

  it("o conteúdo chega inteiro, não truncado", async () => {
    let recebido = 0;
    const s3 = {
      send: vi.fn(async (cmd: { input: { Body?: Buffer } }) => {
        recebido = cmd.input.Body?.length ?? 0;
        return {};
      }),
    };
    await uploadComCliente(s3 as never, cfg, {
      corpo: streamDe(1_234_567),
      mime: "image/png",
    });
    expect(recebido).toBe(1_234_567);
  });

  it("a URL pública sai com a extensão do MIME", async () => {
    const s3 = { send: vi.fn(async () => ({})) };
    const r = await uploadComCliente(s3 as never, cfg, {
      corpo: streamDe(100),
      mime: "application/pdf",
    });
    expect(r.key).toMatch(/^swipe\/[0-9a-f-]{36}\.pdf$/);
    expect(r.publicUrl).toBe(`https://exemplo.com/pub/${r.key}`);
  });

  it("tipo não permitido nem chega ao provedor", async () => {
    const s3 = { send: vi.fn(async () => ({})) };
    await expect(
      uploadComCliente(s3 as never, cfg, { corpo: streamDe(10), mime: "text/html" }),
    ).rejects.toThrow(/não permitido/i);
    expect(s3.send).not.toHaveBeenCalled();
  });
});

describe("InternalError do Supabase", () => {
  it("manda checar o que é verificável, em vez de repetir o erro", () => {
    // O Supabase usa `InternalError` para coisas diferentes — bucket ausente e
    // fluxo não suportado, entre elas. Como o código não distingue, a frase
    // aponta o diagnóstico em vez de fingir que sabe.
    const r = explicarErroDeStorage({ name: "InternalError" });
    expect(r.mensagem).toMatch(/bucket existe/i);
    expect(r.mensagem).toContain("storage-check");
  });
});
