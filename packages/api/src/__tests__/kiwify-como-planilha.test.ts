/**
 * A Kiwify virando planilha virtual para o agregador de vendas da etapa.
 *
 * O agregador tem ~1700 linhas afinadas contra dados reais. A integração não
 * escreve um segundo cálculo — ela entrega a MESMA forma de entrada
 * (`{ headers, rows, mapping }`) com um dado melhor. O que precisa de teste,
 * então, é a tradução: errar uma coluna aqui devolve `-1` no `indexOf` lá e a
 * etapa zera sem avisar.
 */

import { describe, expect, it } from "vitest";
import {
  COLUNAS,
  MAPEAMENTO,
  canalDaVenda,
  dataDaVenda,
  emReais,
  vendasComoPlanilha,
} from "../services/kiwify-como-planilha.js";

type Venda = Parameters<typeof vendasComoPlanilha>[0][number];

const venda = (over: Partial<Venda> = {}): Venda =>
  ({
    projectId: "p1",
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
    criadaEm: new Date("2026-09-30T23:54:46Z"),
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
    ...over,
  }) as Venda;

describe("o contrato com o agregador", () => {
  it("todo campo do mapeamento existe nos cabeçalhos", () => {
    // É esta a checagem que importa: o agregador faz
    // `headers.indexOf(mapping.campo)` e, não achando, devolve -1 e descarta a
    // coluna em silêncio. Um rename sem este teste zeraria a etapa.
    for (const [campo, cabecalho] of Object.entries(MAPEAMENTO)) {
      expect(COLUNAS, campo).toContain(cabecalho);
    }
  });

  it("cada linha tem exatamente uma célula por cabeçalho", () => {
    const { headers, rows } = vendasComoPlanilha([venda(), venda({ saleId: "v2" })]);
    expect(rows).toHaveLength(2);
    for (const linha of rows) expect(linha).toHaveLength(headers.length);
  });

  it("o valor cai na coluna que o mapeamento promete", () => {
    const { headers, rows } = vendasComoPlanilha([venda()]);
    const em = (campo: keyof typeof MAPEAMENTO) => rows[0][headers.indexOf(MAPEAMENTO[campo])];
    expect(em("email")).toBe("cliente@exemplo.com");
    expect(em("transactionId")).toBe("venda-1");
    expect(em("valorBruto")).toBe("44.90");
    expect(em("valorLiquido")).toBe("20.08");
    expect(em("utm_source")).toBe("ig");
    expect(em("productName")).toBe("Super Funcionário com Claude 2 Ed.");
    expect(em("status")).toBe("paid");
  });
});

describe("emReais", () => {
  it("centavos viram reais com duas casas", () => {
    expect(emReais(4490)).toBe("44.90");
    expect(emReais(2008)).toBe("20.08");
    expect(emReais(0)).toBe("0.00");
  });

  it("nulo vira vazio, não zero", () => {
    // Zero é um valor ("vendeu de graça"); vazio é "não sei". O agregador
    // trata os dois diferente, e inventar 0,00 aqui seria afirmar o que a
    // Kiwify não disse.
    expect(emReais(null)).toBe("");
    expect(emReais(undefined)).toBe("");
  });
});

describe("dataDaVenda", () => {
  it("usa a APROVAÇÃO, não a criação", () => {
    // Um pix gerado no dia 30 e pago no dia 2 pertence ao dia 2. Contá-lo no 30
    // move faturamento para um mês em que ele não aconteceu — e no fim do mês
    // isso é a diferença entre bater e não bater a meta.
    expect(dataDaVenda(venda())).toBe("2026-10-02");
  });

  it("sem aprovação, cai na criação", () => {
    expect(dataDaVenda(venda({ aprovadaEm: null }))).toBe("2026-09-30");
  });

  it("sem data nenhuma devolve vazio, não hoje", () => {
    expect(dataDaVenda(venda({ aprovadaEm: null, criadaEm: null }))).toBe("");
  });
});

describe("canalDaVenda", () => {
  it("passa a utm_source adiante SEM reclassificar", () => {
    // Classificar aqui criaria uma segunda verdade sobre a mesma venda. O
    // agregador decide pago vs orgânico com `PAID_UTM_SOURCES`, e `ig` não
    // está lá — é link na bio, orgânico (a venda real traz
    // `sck: "..._org"`). Um mapa ingênuo diria "Meta Ads" e a mesma tela
    // mostraria a venda como paga num lugar e orgânica no outro.
    expect(canalDaVenda(venda({ utmSource: "ig" }))).toBe("ig");
    expect(canalDaVenda(venda({ utmSource: "meta-ads" }))).toBe("meta-ads");
    expect(canalDaVenda(venda({ utmSource: "newsletter" }))).toBe("newsletter");
  });

  it("sem UTM, diz que não sabe", () => {
    expect(canalDaVenda(venda({ utmSource: null }))).toBe("Não informado");
    expect(canalDaVenda(venda({ utmSource: "   " }))).toBe("Não informado");
  });
});

describe("venda sem e-mail", () => {
  it("sai de fora e é CONTADA — o agregador casa por e-mail", () => {
    const r = vendasComoPlanilha([
      venda(),
      venda({ saleId: "v2", customerEmail: null }),
      venda({ saleId: "v3", customerEmail: "   " }),
    ]);
    expect(r.rows).toHaveLength(1);
    // Contada, não sumida: some do cálculo mas não do relatório.
    expect(r.semEmail).toBe(2);
  });

  it("lista vazia não explode", () => {
    const r = vendasComoPlanilha([]);
    expect(r.rows).toEqual([]);
    expect(r.semEmail).toBe(0);
    expect(r.headers).toEqual([...COLUNAS]);
  });
});

/**
 * O status decide se a venda entra na conta.
 *
 * `routes/stage-sales-data.ts` só trata o bucket de REEMBOLSO de forma
 * especial: `refused` e `waiting_payment` cairiam direto em receita. Medido na
 * conta DG & CPDF em 13/10/2026, das 574 vendas de 30 dias: 54 recusadas
 * (R$ 13.995,39) e 43 aguardando pagamento (R$ 3.823,10) — R$ 17.818 de
 * faturamento que nunca existiu, 24% a mais.
 */
describe("filtro de status", () => {
  it("paga entra, reembolsada entra (o agregador desconta)", () => {
    const r = vendasComoPlanilha([
      venda({ saleId: "a", status: "paid" }),
      venda({ saleId: "b", status: "approved" }),
      venda({ saleId: "c", status: "refunded" }),
      venda({ saleId: "d", status: "chargedback" }),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.naoSaoVenda).toBe(0);
  });

  it("recusada e aguardando pagamento NÃO entram — e são contadas", () => {
    const r = vendasComoPlanilha([
      venda({ saleId: "a", status: "paid" }),
      venda({ saleId: "b", status: "refused" }),
      venda({ saleId: "c", status: "waiting_payment" }),
      venda({ saleId: "d", status: "pending" }),
      venda({ saleId: "e", status: "processing" }),
    ]);
    expect(r.rows).toHaveLength(1);
    // Contadas, não sumidas: um quarto do volume não pode evaporar em silêncio.
    expect(r.naoSaoVenda).toBe(4);
  });

  it("a proporção real da conta medida: 471 de 574 sobrevivem", () => {
    // Reproduz a distribuição de produção (paid 471, refused 54,
    // waiting_payment 43, refunded 6) para fixar o comportamento no número.
    const monte = (n: number, status: string, base: string) =>
      Array.from({ length: n }, (_, i) => venda({ saleId: `${base}${i}`, status }));
    const r = vendasComoPlanilha([
      ...monte(471, "paid", "p"),
      ...monte(54, "refused", "r"),
      ...monte(43, "waiting_payment", "w"),
      ...monte(6, "refunded", "d"),
    ]);
    // 471 pagas + 6 reembolsadas: o reembolso precisa chegar para ser descontado.
    expect(r.rows).toHaveLength(477);
    expect(r.naoSaoVenda).toBe(97);
  });

  it("status vazio conta como venda — igual à planilha sem marcação", () => {
    // `classifyRefundStatus` trata célula vazia como paga, e mudar isso aqui
    // divergiria do caminho da planilha.
    expect(vendasComoPlanilha([venda({ status: null })]).rows).toHaveLength(1);
  });
});
