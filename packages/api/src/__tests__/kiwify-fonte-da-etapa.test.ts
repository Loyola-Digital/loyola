/**
 * Qual fonte a etapa usa, e que subtype a planilha virtual assume.
 *
 * ## Por que isto precisa de teste
 *
 * O subtype é o que diz ao agregador se aquela venda é da captação, do produto
 * principal ou do TMB. A planilha virtual da Kiwify o herdava da PRIMEIRA
 * planilha da etapa — e nas etapas que ainda não têm planilha nenhuma (2 das 8
 * Captações Pagas medidas em 13/10/2026) caía num `main_product` chumbado,
 * numa rota que havia pedido `capture`. Nada quebrava na tela de hoje porque
 * nenhuma rota relê o campo; a `sales-conversion` relia, e por isso saiu desse
 * caminho (ver o comentário nela).
 *
 * Errar aqui não dá erro: dá venda contada no papel errado.
 */

import { describe, expect, it } from "vitest";
import type { Database } from "../db/client.js";
import { kiwifyStageConfigs } from "../db/schema.js";
import {
  aFonteEhKiwify,
  fontesDeVendaDaEtapa,
  produtosDaListaDeOfertas,
} from "../services/kiwify-vendas-cache.js";
import type { FonteDeVendas } from "../services/kiwify-vendas-cache.js";

const PROJ = "738cda16-c5be-4268-9c98-92e46c359569";
const ETAPA = "7ba2af47-3e84-45e2-900d-49660a3acb3e";

type Cfg = Partial<typeof kiwifyStageConfigs.$inferSelect> | null;

/**
 * O banco reduzido ao que estas duas funções pedem: a config da etapa
 * (`.where().limit()`) e as vendas do recorte (`.where().orderBy()`).
 */
function bancoFake(cfg: Cfg, vendas: unknown[] = []): Database {
  return {
    select: () => ({
      from: (tabela: unknown) => {
        const linhas = tabela === kiwifyStageConfigs ? (cfg ? [cfg] : []) : vendas;
        const fim = { limit: async () => linhas, orderBy: async () => linhas };
        return { where: () => fim };
      },
    }),
  } as unknown as Database;
}

const venda = () => ({
  projectId: PROJ,
  saleId: "venda-1",
  productId: "prod-1",
  productName: "Super Funcionário com Claude 2 Ed.",
  offerId: "oferta-1",
  offerName: "Lote 2",
  status: "paid",
  paymentMethod: "pix",
  brutoCentavos: 4490,
  liquidoCentavos: 2008,
  taxaCentavos: 473,
  currency: "BRL",
  installments: 1,
  parentOrderId: null,
  criadaEm: new Date("2026-10-02T10:00:00Z"),
  aprovadaEm: new Date("2026-10-02T10:00:00Z"),
  reembolsadaEm: null,
  customerEmail: "cliente@exemplo.com",
  customerName: "José Silva",
  utmSource: "ig",
  utmMedium: "social",
  utmCampaign: "dgpg05",
  utmContent: "link_in_bio",
  utmTerm: "dgpg05-cap",
  sck: "dgpg05_bio_ig",
  sincronizadaEm: new Date(),
});

const planilha = (over: Partial<FonteDeVendas>): FonteDeVendas =>
  ({
    id: "planilha-1",
    stageId: ETAPA,
    spreadsheetId: "1abc",
    spreadsheetName: "Vendas",
    sheetName: "Página1",
    subtype: "capture",
    columnMapping: { email: "E-mail" },
    orderBumpProducts: [],
    productTypes: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as FonteDeVendas;

describe("a fonte da etapa", () => {
  it("sem config, é a planilha", async () => {
    expect(await aFonteEhKiwify(bancoFake(null), ETAPA)).toBe(false);
  });

  it("config com fonte planilha não é Kiwify", async () => {
    expect(await aFonteEhKiwify(bancoFake({ fonteDeVendas: "planilha" }), ETAPA)).toBe(false);
  });

  it("config com fonte kiwify é Kiwify", async () => {
    expect(await aFonteEhKiwify(bancoFake({ fonteDeVendas: "kiwify" }), ETAPA)).toBe(true);
  });
});

describe("a planilha virtual", () => {
  it("devolve as planilhas intactas quando a fonte é a planilha", async () => {
    const minhas = [planilha({ subtype: "capture" })];
    const fontes = await fontesDeVendaDaEtapa(
      bancoFake({ fonteDeVendas: "planilha" }),
      PROJ,
      ETAPA,
      minhas,
      "capture",
    );
    expect(fontes).toBe(minhas);
  });

  it("assume o subtype que a ROTA pediu, não o da primeira planilha", async () => {
    const fontes = await fontesDeVendaDaEtapa(
      bancoFake({ fonteDeVendas: "kiwify", productIds: ["prod-1"], offerIds: [] }, [venda()]),
      PROJ,
      ETAPA,
      [planilha({ subtype: "main_product" })],
      "capture",
    );
    expect(fontes).toHaveLength(1);
    expect(fontes[0]!.subtype).toBe("capture");
  });

  it("etapa sem planilha nenhuma: o subtype é o pedido, e não um main_product chumbado", async () => {
    // As 2 Captações Pagas sem planilha. Antes a virtual saía `main_product`.
    const fontes = await fontesDeVendaDaEtapa(
      bancoFake({ fonteDeVendas: "kiwify", productIds: ["prod-1"], offerIds: [] }, [venda()]),
      PROJ,
      ETAPA,
      [],
      "capture",
    );
    expect(fontes[0]!.subtype).toBe("capture");
    expect(fontes[0]!.dados?.rows).toHaveLength(1);
  });

  it("preserva order bump e tipos de produto da planilha que a etapa já tinha", async () => {
    // Configuração do time: não tem equivalente na Kiwify e não pode se perder
    // ao trocar a fonte, senão order bump passa a contar como produto.
    const fontes = await fontesDeVendaDaEtapa(
      bancoFake({ fonteDeVendas: "kiwify", productIds: ["prod-1"], offerIds: [] }, [venda()]),
      PROJ,
      ETAPA,
      [planilha({ orderBumpProducts: ["Combo extra"], productTypes: { "Combo extra": "bump" } })],
      "capture",
    );
    expect(fontes[0]!.orderBumpProducts).toEqual(["Combo extra"]);
    expect(fontes[0]!.productTypes).toEqual({ "Combo extra": "bump" });
  });
});

describe("os produtos da lista de ofertas", () => {
  it("usa os marcados na tela, que ainda não foram salvos", () => {
    // O pedido do Lucas: marco o produto e só aparecem as ofertas DELE.
    expect(produtosDaListaDeOfertas("prod-novo", ["prod-salvo"])).toEqual(["prod-novo"]);
  });

  it("aceita vários, e limpa espaço e vazio do CSV", () => {
    expect(produtosDaListaDeOfertas("a, b,,c ", [])).toEqual(["a", "b", "c"]);
  });

  it("sem nada marcado, cai nos salvos — é quem abriu a tela e não mexeu", () => {
    expect(produtosDaListaDeOfertas(undefined, ["prod-salvo"])).toEqual(["prod-salvo"]);
    expect(produtosDaListaDeOfertas("", ["prod-salvo"])).toEqual(["prod-salvo"]);
    expect(produtosDaListaDeOfertas(" , ", ["prod-salvo"])).toEqual(["prod-salvo"]);
  });

  it("sem marcados e sem salvos, não filtra produto nenhum", () => {
    expect(produtosDaListaDeOfertas(undefined, null)).toEqual([]);
  });
});
