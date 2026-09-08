import { describe, expect, it } from "vitest";
import { decodificarHtml, LIMITE_DE_PERDA } from "../decodificar-html";

/** Os bytes que o navegador entregaria para este texto, em UTF-8. */
const emUtf8 = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;

/** Os mesmos caracteres gravados por um editor Windows-1252 (1 byte cada). */
const emLatin1 = (texto: string) => {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
};

describe("decodificarHtml", () => {
  it("lê UTF-8, que é o caso comum", () => {
    expect(decodificarHtml(emUtf8("<h1>Imersão</h1>"))).toBe("<h1>Imersão</h1>");
  });

  it("cai para Windows-1252 quando o UTF-8 se estraga demais", () => {
    // Uma página de vendas real: acento em toda frase. Em UTF-8 cada um destes
    // bytes é inválido sozinho, e passa do limite.
    const html = "<p>Inscrição até domingo. Não perca a última condição.</p>";
    expect(decodificarHtml(emLatin1(html))).toBe(html);
  });

  it("não troca de palpite por um caractere solto", () => {
    // O losango pode ser conteúdo — um emoji que o autor colou errado. Trocar
    // a decodificação inteira por causa dele estragaria a página que está boa.
    const comUmPerdido = "<p>preço \uFFFD normal</p>";
    expect(decodificarHtml(emUtf8(comUmPerdido))).toBe(comUmPerdido);
  });

  it("aguenta ficar exatamente no limite sem virar", () => {
    const noLimite = "<p>" + "\uFFFD".repeat(LIMITE_DE_PERDA) + "</p>";
    expect(decodificarHtml(emUtf8(noLimite))).toBe(noLimite);
  });

  it("devolve texto mesmo com bytes que não formam nada", () => {
    const lixo = new Uint8Array([0xff, 0xfe, 0xff, 0xfe, 0xff]).buffer as ArrayBuffer;
    expect(typeof decodificarHtml(lixo)).toBe("string");
  });
});
