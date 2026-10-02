import { describe, it, expect } from "vitest";
import { linhaDedupPessoaProduto, textoDedupDosTotais } from "../dedup-pessoa-produto";

const NBSP = " ";

describe("Story 41.12 AC8 — linha da camada 2 no tooltip dos painéis", () => {
  it("campo ausente (API antiga) = nenhuma linha, nenhum erro", () => {
    expect(linhaDedupPessoaProduto(undefined)).toBeNull();
  });

  it("aplicada sem remover nada = nenhuma linha", () => {
    expect(linhaDedupPessoaProduto({ aplicada: true, removidas: { linhas: 0, valor: 0 } })).toBeNull();
  });

  it("removeu: contagem e valor", () => {
    expect(
      linhaDedupPessoaProduto({ aplicada: true, removidas: { linhas: 9, valor: 596.3 } }),
    ).toBe(`9 vendas repetidas (mesmo e-mail e produto) não somadas (R$${NBSP}596,30)`);
    expect(
      linhaDedupPessoaProduto({ aplicada: true, removidas: { linhas: 1, valor: 99 } }),
    ).toBe(`1 venda repetida (mesmo e-mail e produto) não somada (R$${NBSP}99,00)`);
  });

  it("não aplicada: a razão (coluna de produto não mapeada)", () => {
    const linha = linhaDedupPessoaProduto({
      aplicada: false,
      removidas: { linhas: 0, valor: 0 },
      naoAplicadaMotivo: 'coluna de produto não mapeada em "n8n"',
    });
    expect(linha).toBe('Recompra do mesmo produto não deduplicada: coluna de produto não mapeada em "n8n"');
  });
});

describe("Story 41.12 UX-001 — o texto dos tooltips de totais não contradiz a camada 2", () => {
  it("aplicada: a recompra do mesmo produto conta uma vez (não mais \"sem dedup\")", () => {
    expect(textoDedupDosTotais({ aplicada: true, removidas: { linhas: 9, valor: 596.3 } })).toBe(
      "recompra do mesmo produto pela mesma pessoa conta uma vez",
    );
  });

  it("API antiga ou regra não aplicada: o texto de antes, que segue verdadeiro", () => {
    expect(textoDedupDosTotais(undefined)).toBe("sem deduplicar e-mail");
    expect(
      textoDedupDosTotais({
        aplicada: false,
        removidas: { linhas: 0, valor: 0 },
        naoAplicadaMotivo: 'coluna de produto não mapeada em "n8n"',
      }),
    ).toBe("sem deduplicar e-mail");
  });
});
