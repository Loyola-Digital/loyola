import { describe, it, expect } from "vitest";
import {
  atribuirPorCampanha,
  type VendaParaAtribuir,
  type LeadParaAtribuir,
} from "../services/campaign-attribution.js";

/**
 * Story 44.3. O que estes testes protegem não é a soma — é a honestidade da
 * cobertura. Uma atribuição parcial apresentada como completa vira uma Conv.
 * Checkout subestimada que ninguém consegue distinguir de operação ruim.
 */

const mapa = new Map<string, string>([
  ["120248243282650208", "camp-A"],
  ["120247828941780208", "camp-B"],
]);

const venda = (o: Partial<VendaParaAtribuir> = {}): VendaParaAtribuir => ({
  utmContent: "120248243282650208",
  valorBruto: 100,
  status: "paid",
  ...o,
});
const lead = (o: Partial<LeadParaAtribuir> = {}): LeadParaAtribuir => ({
  utmContent: "120248243282650208",
  chave: "a@x.com",
  ...o,
});

describe("atribuirPorCampanha — vendas", () => {
  it("soma venda e receita na campanha do utm_content", () => {
    const r = atribuirPorCampanha([venda(), venda({ valorBruto: 50 })], [], mapa);
    expect(r.porCampanha).toHaveLength(1);
    expect(r.porCampanha[0].campaignId).toBe("camp-A");
    expect(r.porCampanha[0].vendasAtribuidas).toBe(2);
    expect(r.porCampanha[0].receitaAtribuida).toBe(150);
  });

  /**
   * AC3 — o débito que `stage-sales-data` carrega e que esta story não herda.
   * `isRefundBucket` excluiria só refunded/chargeback; "recusada" cai no bucket
   * "other" e passaria.
   */
  it("descarta status que NÃO é pago — inclusive os que não são reembolso", () => {
    const r = atribuirPorCampanha(
      [
        venda({ status: "paid" }),
        venda({ status: "refunded" }),
        venda({ status: "chargeback" }),
        venda({ status: "recusada" }),
        venda({ status: "aguardando pagamento" }),
      ],
      [],
      mapa,
    );
    expect(r.totalVendas).toBe(1);
    expect(r.porCampanha[0].vendasAtribuidas).toBe(1);
  });

  it("status não mapeado (null) conta como venda — legado sem coluna de status", () => {
    const r = atribuirPorCampanha([venda({ status: null })], [], mapa);
    expect(r.totalVendas).toBe(1);
  });

  /**
   * AC6 — a venda inatribuível continua no total da etapa. É o denominador da
   * cobertura; tirá-la de lá esconderia a perda em vez de declará-la.
   */
  it("venda sem utm_content entra no total mas não em campanha nenhuma", () => {
    const r = atribuirPorCampanha([venda(), venda({ utmContent: null })], [], mapa);
    expect(r.totalVendas).toBe(2);
    expect(r.totalReceita).toBe(200);
    expect(r.porCampanha[0].vendasAtribuidas).toBe(1);
    expect(r.coberturaVendas).toBe(0.5);
  });

  /**
   * "Não resolveu" ≠ "não veio". Id que não resolve é cache desatualizado ou
   * anúncio de outra conta; vazio é tráfego sem UTM. Causas diferentes, ações
   * diferentes — não podem virar o mesmo número.
   */
  it("distingue utm_content ausente de utm_content que não resolve", () => {
    const r = atribuirPorCampanha(
      [venda({ utmContent: null }), venda({ utmContent: "999999999999" })],
      [],
      mapa,
    );
    expect(r.utmContentNaoResolvido).toBe(1);
    expect(r.coberturaVendas).toBe(0);
  });

  it("utm_content que não é Ad ID não conta como não-resolvido", () => {
    // `link_in_bio`, `org`, `imersao` são utm_content legítimos que não são id.
    const r = atribuirPorCampanha([venda({ utmContent: "link_in_bio" })], [], mapa);
    expect(r.utmContentNaoResolvido).toBe(0);
    expect(r.coberturaVendas).toBe(0);
  });

  it("separa por campanha quando há mais de uma", () => {
    const r = atribuirPorCampanha(
      [venda(), venda({ utmContent: "120247828941780208", valorBruto: 300 })],
      [],
      mapa,
    );
    expect(r.porCampanha).toHaveLength(2);
    // ordenado por receita desc
    expect(r.porCampanha[0].campaignId).toBe("camp-B");
  });
});

describe("atribuirPorCampanha — leads", () => {
  it("deduplica lead por chave, no total e por campanha", () => {
    const r = atribuirPorCampanha(
      [],
      [lead(), lead(), lead({ chave: "b@x.com" })],
      mapa,
    );
    expect(r.totalLeadsUnicos).toBe(2);
    expect(r.porCampanha[0].leadsUnicosAtribuidos).toBe(2);
    expect(r.coberturaLeads).toBe(1);
  });

  it("lead sem utm entra no total e derruba a cobertura", () => {
    const r = atribuirPorCampanha([], [lead(), lead({ chave: "b@x.com", utmContent: null })], mapa);
    expect(r.totalLeadsUnicos).toBe(2);
    expect(r.coberturaLeads).toBe(0.5);
  });

  it("lead sem chave é ignorado — não infla o total", () => {
    const r = atribuirPorCampanha([], [lead({ chave: "" })], mapa);
    expect(r.totalLeadsUnicos).toBe(0);
    expect(r.coberturaLeads).toBeNull();
  });
});

describe("atribuirPorCampanha — cobertura", () => {
  /** "Não dá para saber" não é "cobertura zero". */
  it("cobertura é null quando não há denominador, nunca 0", () => {
    const r = atribuirPorCampanha([], [], mapa);
    expect(r.coberturaVendas).toBeNull();
    expect(r.coberturaLeads).toBeNull();
    expect(r.totalVendas).toBe(0);
  });

  it("cobertura 1 quando tudo é atribuível", () => {
    const r = atribuirPorCampanha([venda(), venda()], [lead()], mapa);
    expect(r.coberturaVendas).toBe(1);
    expect(r.coberturaLeads).toBe(1);
  });

  /** Venda descartada por status não entra no denominador — não é perda de atribuição. */
  it("status não-pago não conta na cobertura", () => {
    const r = atribuirPorCampanha([venda(), venda({ status: "refused", utmContent: null })], [], mapa);
    expect(r.totalVendas).toBe(1);
    expect(r.coberturaVendas).toBe(1);
  });
});
