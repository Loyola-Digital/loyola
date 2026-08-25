/**
 * Story 18.69 — o payload do PUT de classificação.
 *
 * ## Por que este teste existe
 *
 * `productTypes` estava no tipo `UpdateOrderBumpsInput` e NÃO era incluído no
 * body: o diálogo enviava, o TypeScript aceitava (o campo existe no tipo), e o
 * hook descartava em silêncio. A feature inteira ficou inerte em produção —
 * `product_types` gravava `null` em toda planilha.
 *
 * Typecheck, lint e dois gates passaram. O que faltava era um teste que
 * olhasse o CORPO ENVIADO, e não o tipo de entrada.
 */
import { describe, it, expect } from "vitest";
import { corpoDoPutDeClassificacao } from "../payload-order-bumps";

const CURRENT = {
  spreadsheetId: "sheet-1",
  spreadsheetName: "n8n-kiwify",
  sheetName: "captação",
  columnMapping: { email: "E-mail" },
};

describe("o corpo do PUT carrega a classificação", () => {
  it("`productTypes` vai no body — era o que faltava", () => {
    const body = corpoDoPutDeClassificacao({
      current: CURRENT,
      orderBumpProducts: ["Gravação"],
      productTypes: { "gravação": "order_bump", "combo 3 em 1": "combo" },
    });
    expect(body.productTypes).toEqual({ "gravação": "order_bump", "combo 3 em 1": "combo" });
  });

  it("a lista antiga continua indo junto", () => {
    // Enquanto houver código lendo dela, parar de enviá-la quebraria quem
    // ainda não migrou.
    const body = corpoDoPutDeClassificacao({
      current: CURRENT,
      orderBumpProducts: ["Gravação"],
      productTypes: { "gravação": "order_bump" },
    });
    expect(body.orderBumpProducts).toEqual(["Gravação"]);
  });

  it("sem classificação, o campo vai indefinido e o backend preserva o que havia", () => {
    const body = corpoDoPutDeClassificacao({ current: CURRENT, orderBumpProducts: [] });
    expect(body.productTypes).toBeUndefined();
  });

  it("o mapeamento de colunas não é perdido no caminho", () => {
    // O PUT exige `columnMapping`; enviá-lo vazio apagaria a configuração da
    // planilha — foi o dano que a Story 29.55 fechou por outra porta.
    const body = corpoDoPutDeClassificacao({ current: CURRENT, orderBumpProducts: [] });
    expect(body.columnMapping).toEqual({ email: "E-mail" });
  });
});
