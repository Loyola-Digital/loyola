import { describe, it, expect, vi } from "vitest";
import { extrairComprovante } from "../services/comprovante-extract";

/**
 * O modelo é mockado de propósito: o que precisa de rede é a leitura da imagem,
 * mas o que quebra em produção é a NORMALIZAÇÃO do que ele devolve — valor como
 * string "R$ 1.234,56", data em dd/mm/aaaa, CPF mascarado. É isso que os testes
 * cobrem.
 */
function clienteFake(input: Record<string, unknown>) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "tool_use", name: "registrar_comprovante", input }],
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const arquivo = { buffer: Buffer.from("x"), mimeType: "image/png" };

describe("extrairComprovante", () => {
  it("normaliza o que o modelo devolve certo", async () => {
    const r = await extrairComprovante(
      clienteFake({
        customerName: "  Maria Silva ",
        value: 1234.56,
        saleDate: "2026-08-14",
        paymentMethod: "PIX",
        customerCpf: "123.456.789-09",
        customerPhone: "(11) 98765-4321",
        camposNaoEncontrados: [],
      }),
      arquivo,
    );
    expect(r.customerName).toBe("Maria Silva");
    expect(r.value).toBe(1234.56);
    expect(r.saleDate).toBe("2026-08-14");
    expect(r.customerCpf).toBe("12345678909");
    expect(r.customerPhone).toBe("11987654321");
    expect(r.camposNaoEncontrados).toEqual([]);
  });

  it("aceita valor em texto no formato brasileiro", async () => {
    const r = await extrairComprovante(
      clienteFake({ value: "R$ 1.234,56", camposNaoEncontrados: [] }),
      arquivo,
    );
    expect(r.value).toBe(1234.56);
  });

  it("aceita valor em texto no formato americano", async () => {
    const r = await extrairComprovante(clienteFake({ value: "1234.56", camposNaoEncontrados: [] }), arquivo);
    expect(r.value).toBe(1234.56);
  });

  it("converte data dd/mm/aaaa mesmo tendo pedido ISO", async () => {
    const r = await extrairComprovante(
      clienteFake({ saleDate: "14/08/2026", camposNaoEncontrados: [] }),
      arquivo,
    );
    expect(r.saleDate).toBe("2026-08-14");
  });

  it("descarta CPF mascarado em vez de gravar dígito errado", async () => {
    const r = await extrairComprovante(
      clienteFake({ customerCpf: "***.456.789-**", camposNaoEncontrados: [] }),
      arquivo,
    );
    // Os dígitos visíveis não formam um CPF — não podem virar um.
    expect(r.customerCpf).toBeNull();
    expect(r.camposNaoEncontrados).toContain("customerCpf");
  });

  it("aceita CNPJ (14 dígitos) e descarta telefone sem DDD", async () => {
    const r = await extrairComprovante(
      clienteFake({
        customerCpf: "12.345.678/0001-95",
        customerPhone: "98765432",
        camposNaoEncontrados: [],
      }),
      arquivo,
    );
    expect(r.customerCpf).toBe("12345678000195");
    expect(r.customerPhone).toBeNull();
  });

  it("valor zero ou negativo não vira venda", async () => {
    const zero = await extrairComprovante(clienteFake({ value: 0, camposNaoEncontrados: [] }), arquivo);
    expect(zero.value).toBeNull();
    const negativo = await extrairComprovante(clienteFake({ value: -50, camposNaoEncontrados: [] }), arquivo);
    expect(negativo.value).toBeNull();
  });

  it("lista como não encontrado tudo que ficou nulo, mesmo o modelo dizendo que achou", async () => {
    const r = await extrairComprovante(
      clienteFake({
        customerName: "Maria",
        value: "não consegui ler",
        saleDate: null,
        camposNaoEncontrados: [],
      }),
      arquivo,
    );
    expect(r.camposNaoEncontrados).toContain("value");
    expect(r.camposNaoEncontrados).toContain("saleDate");
    expect(r.camposNaoEncontrados).not.toContain("customerName");
  });

  it("remove da lista o campo que o modelo disse faltar mas veio preenchido", async () => {
    const r = await extrairComprovante(
      clienteFake({
        customerName: "Maria",
        value: 100,
        camposNaoEncontrados: ["customerName"],
      }),
      arquivo,
    );
    expect(r.camposNaoEncontrados).not.toContain("customerName");
  });

  it("explode quando o modelo responde sem chamar a ferramenta", async () => {
    const cliente = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "não sei" }] }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    await expect(extrairComprovante(cliente, arquivo)).rejects.toThrow(/estruturados/i);
  });

  it("manda PDF como documento e imagem como imagem", async () => {
    const cliente = clienteFake({ camposNaoEncontrados: [] });
    await extrairComprovante(cliente, { buffer: Buffer.from("x"), mimeType: "application/pdf" });
    const pdfCall = cliente.messages.create.mock.calls[0][0];
    expect(pdfCall.messages[0].content[0].type).toBe("document");

    const cliente2 = clienteFake({ camposNaoEncontrados: [] });
    await extrairComprovante(cliente2, { buffer: Buffer.from("x"), mimeType: "image/jpeg" });
    const imgCall = cliente2.messages.create.mock.calls[0][0];
    expect(imgCall.messages[0].content[0].type).toBe("image");
  });
});
