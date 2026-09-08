/**
 * O tipo do arquivo no upload.
 *
 * O que protege: um `.html` (ou `.png`) legítimo não pode ser recusado porque
 * o navegador escreveu `application/octet-stream` no multipart. Era isso que
 * impedia a página de subir — a pessoa via "Tipo não permitido" e não tinha o
 * que fazer, porque o arquivo estava certo.
 */

import { describe, expect, it } from "vitest";
import { resolverMime } from "../services/object-storage.js";

describe("resolverMime", () => {
  it("usa o cabeçalho quando ele é aceito", () => {
    expect(resolverMime("a.png", "image/png")).toBe("image/png");
    expect(resolverMime("p.html", "text/html")).toBe("text/html");
  });

  it("tolera o `; charset=` que o navegador acrescenta no HTML", () => {
    expect(resolverMime("p.html", "text/html; charset=utf-8")).toBe("text/html");
  });

  it("cai na EXTENSÃO quando o cabeçalho é vago — o bug que isto conserta", () => {
    expect(resolverMime("pagina.html", "application/octet-stream")).toBe("text/html");
    expect(resolverMime("peca.PNG", "application/octet-stream")).toBe("image/png");
    expect(resolverMime("vsl.mp4", "")).toBe("video/mp4");
  });

  it("recusa o que não está na lista, venha de onde vier", () => {
    expect(resolverMime("arte.psd", "image/vnd.adobe.photoshop")).toBeNull();
    expect(resolverMime("pack.zip", "application/zip")).toBeNull();
    expect(resolverMime("script.js", "text/javascript")).toBeNull();
  });

  it("sem nome e sem cabeçalho útil, recusa em vez de chutar", () => {
    expect(resolverMime(undefined, "application/octet-stream")).toBeNull();
    expect(resolverMime("sem-extensao", "")).toBeNull();
  });

  it("a extensão NÃO promove tipo fora da lista de permitidos", () => {
    // `.svg` não está em ALLOWED_MIME — a extensão não pode abrir exceção.
    expect(resolverMime("icone.svg", "image/svg+xml")).toBeNull();
  });
});
