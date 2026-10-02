import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Story 41.11 — dedup por (ID da venda, produto) no loader do relatório de
 * Perpétuo (botão 3).
 *
 * O caminho testado é o do loader de verdade: planilha → `parseVendas`
 * (reembolso, filtros de linha, dedup na planilha inteira, corte de janela) →
 * motor → `alertasDaDedup` (W-P7/W-P8). O último bloco roda
 * `loadPerpetualReport` inteiro, com o I/O trocado por dublês, para provar que
 * os alertas chegam ao `report.alertas` que a rota devolve.
 *
 * O padrão do PG02 (41.10), reproduzido com dado sintético e sem PII: a mesma
 * venda duas vezes com o MESMO `ID`, a segunda com `Transaction` vazia e o
 * horário 3 h antes.
 */

// Dublês do I/O — só o `loadPerpetualReport` (último bloco) os usa.
vi.mock("../services/google-sheets.js", () => ({ readSheetData: vi.fn() }));
vi.mock("../services/perpetual-report-config.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/perpetual-report-config.js")>();
  return { ...real, loadPerpetualReportConfig: vi.fn() };
});
vi.mock("../services/nomenclatura/mapa-de-campanhas.js", () => ({
  mapaDeDimensoes: vi.fn(async () => new Map()),
}));

import {
  parseVendas,
  alertasDaDedup,
  loadPerpetualReport,
} from "../services/perpetual-report-loader.js";
import { computePerpetualReport } from "../services/perpetual-report-metrics.js";
import {
  resolvePerpetualRates,
  loadPerpetualReportConfig,
  type PerpetualReportConfig,
} from "../services/perpetual-report-config.js";
import { readSheetData } from "../services/google-sheets.js";
import type { Database } from "../db/client.js";

const HEADERS = [
  "ID",
  "Transaction",
  "Data",
  "E-mail",
  "Produto",
  "Valor",
  "Evento",
  "utm_source",
  "utm_campaign",
  "utm_medium",
  "utm_content",
];

const MAPPING: Record<string, string> = {
  transactionId: "ID",
  productName: "Produto",
  dataVenda: "Data",
  email: "E-mail",
  valorBruto: "Valor",
  status: "Evento",
  utm_source: "utm_source",
  utm_campaign: "utm_campaign",
  utm_medium: "utm_medium",
  utm_content: "utm_content",
};

interface Linha {
  id: string;
  tx?: string;
  /** Instante em UTC — o loader converte para o dia de São Paulo. */
  data: string;
  email: string;
  produto?: string;
  valor?: string;
  evento?: string;
}

const CURSO = "Curso Perpétuo";
const BUMP = "Bump Aulas Extras";

const row = (l: Linha): string[] => [
  l.id,
  l.tx ?? "",
  l.data,
  l.email,
  l.produto ?? CURSO,
  l.valor ?? "100,00",
  l.evento ?? "paid",
  "meta",
  "camp-1",
  "adset-1",
  "ad-1",
];

/** O mapeamento sem um campo — o funil que não mapeou aquela coluna. */
function semCampo(campo: string): Record<string, string> {
  const m = { ...MAPPING };
  delete m[campo];
  return m;
}

const sheet = (rows: string[][]) => ({ headers: [...HEADERS], rows });
const pad = (i: number) => String(i).padStart(2, "0");

function makeConfig(): PerpetualReportConfig {
  return {
    funnelId: "f-1",
    funnelName: "Funil sintético",
    projectId: "p-1",
    projectName: "Projeto",
    metaAccountId: "act_1",
    campanhas: [],
    prefixoCampanha: null,
    produto: CURSO,
    produtosOrderBump: [],
    temSplitFormato: false,
    origensPagas: ["meta"],
    inicioTrafego: null,
    validado: true,
    validadoEm: null,
    validadoPor: null,
    impostoPct: 0.1215,
    impostoOrigem: "default",
    taxaPlataformaPct: null,
    taxaImpostoPct: null,
    taxaOutrosPct: null,
    margemDesejadaPct: null,
    cmv: null,
    gatewayPctVar: null,
    funnelArchitecture: null,
    chainDefectReading: null,
    manualRates: {},
    ceilings: {},
  };
}

/** Planilha → `parseVendas` → motor → alertas da dedup, numa janela. */
function rodar(
  rows: string[][],
  periodo: { inicio: string; fim: string },
  mapping: Record<string, string> = MAPPING,
) {
  const lida = parseVendas(sheet(rows), mapping, periodo);
  const config = makeConfig();
  const report = computePerpetualReport({
    config,
    rates: resolvePerpetualRates(config, "kiwify", lida.hasStatusCol),
    periodo,
    vendas: lida.vendas,
    campanhas: [],
  });
  const alertas = alertasDaDedup(lida.dedup);
  return { lida, k: report.kpis, alertas, motor: report.alertas };
}

const JANELA = { inicio: "2026-07-01", fim: "2026-07-31" };

/**
 * 10 vendas de R$ 100 (a01…a10@x.com), `ID` e `Transaction` preenchidos, às
 * 15h UTC de 20/07. No fim da planilha, 5 duplicatas: V01…V04 no padrão do
 * PG02 (mesmo `ID`, `Transaction` VAZIA, 3 h antes) e V05 com o `ID` e a
 * `Transaction` preenchidos nas duas linhas.
 */
function fixturePg02(): string[][] {
  const originais: string[][] = [];
  const duplicatas: string[][] = [];
  for (let i = 1; i <= 10; i++) {
    const id = `V${pad(i)}`;
    originais.push(row({ id, tx: `T${pad(i)}`, data: "2026-07-20T15:00:00Z", email: `a${pad(i)}@x.com` }));
    if (i <= 4) duplicatas.push(row({ id, tx: "", data: "2026-07-20T12:00:00Z", email: `a${pad(i)}@x.com` }));
    if (i === 5) duplicatas.push(row({ id, tx: `T${pad(i)}`, data: "2026-07-20T12:00:00Z", email: `a${pad(i)}@x.com` }));
  }
  return [...originais, ...duplicatas];
}

describe("Story 41.11 — dedup por (ID da venda, produto) no loader do perpétuo", () => {
  it("AC2(a)(b)(c) — transações e faturamento caem exatamente pelas duplicatas; vendas (e-mails) não muda; W-P7 com contagem e valor", () => {
    const { k, alertas, lida } = rodar(fixturePg02(), JANELA);

    // Sem a dedup seriam 15 transações e R$ 1.500.
    expect(k.transacoes).toBe(10);
    expect(k.faturamentoBruto).toBe(1000);
    expect(k.vendas).toBe(10);
    expect(k.ticketMedio).toBe(100);

    expect(lida.dedup.removidasNaJanela).toEqual({ linhas: 5, valor: 500 });
    expect(lida.dedup.naoAplicada).toBeNull();
    expect(alertas).toHaveLength(1);
    expect(alertas[0].codigo).toBe("W-P7");
    expect(alertas[0].mensagem).toContain("5 linhas duplicadas por ID da venda removidas");
    expect(alertas[0].mensagem).toContain("R$ 500,00");
  });

  it("AC2(a) — CAC, ROAS e margem saem do faturamento deduplicado", () => {
    const lida = parseVendas(sheet(fixturePg02()), MAPPING, JANELA);
    const config = makeConfig();
    const r = computePerpetualReport({
      config,
      rates: resolvePerpetualRates(config, "kiwify", true),
      periodo: JANELA,
      vendas: lida.vendas,
      campanhas: [{ campaignId: "camp-1", campaignName: "C1", spend: 100, spendComImposto: 200 }],
    });
    expect(r.kpis.roas).toBe(5); // 1000 / 200 — com as duplicatas seria 7,5
    expect(r.kpis.cac).toBe(20); // 200 / 10 e-mails
  });

  it("W-P7 sai em singular com uma linha só", () => {
    const rows = [
      row({ id: "V01", tx: "T01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", valor: "99,90" }),
      row({ id: "V01", data: "2026-07-20T12:00:00Z", email: "a01@x.com", valor: "99,90" }),
    ];
    const { alertas } = rodar(rows, JANELA);
    expect(alertas.map((a) => a.mensagem)).toEqual([
      "1 linha duplicada por ID da venda removida (R$ 99,90) — mesmo ID da venda e mesmo produto na planilha contam uma vez (vale a primeira linha).",
    ]);
  });

  it("AC2(d) — linha sem ID repetida NÃO colapsa", () => {
    const rows = [
      row({ id: "", data: "2026-07-20T15:00:00Z", email: "a01@x.com" }),
      row({ id: "", data: "2026-07-20T15:00:00Z", email: "a01@x.com" }),
      row({ id: "null", data: "2026-07-20T15:00:00Z", email: "a01@x.com" }),
    ];
    const { k, alertas } = rodar(rows, JANELA);
    expect(k.transacoes).toBe(3);
    expect(k.faturamentoBruto).toBe(300);
    expect(alertas).toEqual([]);
  });

  it("AC2(e) — mesmo ID com produto diferente (curso + bump do mesmo pedido) conta as duas", () => {
    const rows = [
      row({ id: "P01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", produto: CURSO, valor: "297,00" }),
      row({ id: "P01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", produto: BUMP, valor: "47,00" }),
    ];
    const { k, alertas } = rodar(rows, JANELA);
    expect(k.transacoes).toBe(2);
    expect(k.faturamentoBruto).toBe(344);
    expect(k.vendas).toBe(1);
    expect(alertas).toEqual([]);
  });

  it("a chave do produto é normalizada (trim + minúsculas): mesmo produto com outra caixa colapsa", () => {
    const rows = [
      row({ id: "V01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", produto: "Curso Perpétuo" }),
      row({ id: "V01", data: "2026-07-20T12:00:00Z", email: "a01@x.com", produto: "  curso perpétuo " }),
    ];
    expect(rodar(rows, JANELA).k.transacoes).toBe(1);
  });

  it("AC2(f) — sobrevive a PRIMEIRA: inverter a ordem do par não muda os totais", () => {
    const direta = fixturePg02();
    // Duplicatas primeiro, originais depois.
    const invertida = [...direta.slice(10), ...direta.slice(0, 10)];
    const a = rodar(direta, JANELA);
    const b = rodar(invertida, JANELA);
    expect(b.k.transacoes).toBe(a.k.transacoes);
    expect(b.k.faturamentoBruto).toBe(a.k.faturamentoBruto);
    expect(b.lida.dedup.removidasNaJanela).toEqual(a.lida.dedup.removidasNaJanela);

    // E é mesmo a primeira na ordem da planilha que fica: na invertida, a linha
    // de 12h UTC (a duplicata) é a sobrevivente — e o dia dela é o que conta.
    const virada = [
      row({ id: "V01", data: "2026-07-20T01:00:00Z", email: "a01@x.com", valor: "100,00" }),
      row({ id: "V01", data: "2026-07-20T04:00:00Z", email: "a01@x.com", valor: "100,00" }),
    ];
    expect(parseVendas(sheet(virada), MAPPING, JANELA).vendas.map((v) => v.dia)).toEqual(["2026-07-19"]);
  });

  it("AC2(g) — janelas adjacentes: a venda cuja duplicata cruza a meia-noite de São Paulo conta UMA vez na soma das duas", () => {
    // Sobrevivente: 04h UTC de 20/07 = 01h de 20/07 em SP (dia D).
    // Duplicata: 3 h antes, 01h UTC de 20/07 = 22h de 19/07 em SP (dia D−1).
    const rows = [
      row({ id: "V01", tx: "T01", data: "2026-07-20T04:00:00Z", email: "a01@x.com" }),
      row({ id: "V02", tx: "T02", data: "2026-07-18T15:00:00Z", email: "a02@x.com" }),
      row({ id: "V03", tx: "T03", data: "2026-07-21T15:00:00Z", email: "a03@x.com" }),
      row({ id: "V01", tx: "", data: "2026-07-20T01:00:00Z", email: "a01@x.com" }),
    ];
    const A = rodar(rows, { inicio: "2026-07-01", fim: "2026-07-19" });
    const B = rodar(rows, { inicio: "2026-07-20", fim: "2026-07-31" });

    expect(A.k.transacoes).toBe(1); // só V02 — a duplicata de V01 saiu
    expect(B.k.transacoes).toBe(2); // V01 (sobrevivente, dia D) + V03
    // V01 conta uma vez na soma: com a dedup depois do corte, A contaria a
    // duplicata e a soma daria 4.
    expect(A.k.transacoes + B.k.transacoes).toBe(3);
    expect(A.k.faturamentoBruto + B.k.faturamentoBruto).toBe(300);

    // O W-P7 de A reporta a linha removida (o efeito na janela A); B não tem.
    expect(A.lida.dedup.removidasNaJanela).toEqual({ linhas: 1, valor: 100 });
    expect(A.alertas.map((a) => a.codigo)).toEqual(["W-P7"]);
    expect(B.alertas).toEqual([]);
  });

  it("removida fora da janela não gera W-P7 (contagem = efeito na janela)", () => {
    const rows = [
      row({ id: "V01", data: "2026-06-20T15:00:00Z", email: "a01@x.com" }),
      row({ id: "V01", data: "2026-06-20T12:00:00Z", email: "a01@x.com" }),
      row({ id: "V02", data: "2026-07-20T15:00:00Z", email: "a02@x.com" }),
    ];
    const { k, alertas, lida } = rodar(rows, JANELA);
    expect(k.transacoes).toBe(1);
    expect(lida.dedup.removidasNaJanela).toEqual({ linhas: 0, valor: 0 });
    expect(alertas).toEqual([]);
  });

  it("AC2(h) — transação estornada E duplicada sai inteira (as duas pagas e o estorno)", () => {
    const rows = [
      row({ id: "V01", data: "2026-07-20T15:00:00Z", email: "a01@x.com" }),
      row({ id: "V02", data: "2026-07-20T15:00:00Z", email: "a02@x.com" }),
      row({ id: "V01", data: "2026-07-20T12:00:00Z", email: "a01@x.com" }),
      row({ id: "V01", data: "2026-07-22T15:00:00Z", email: "a01@x.com", evento: "refunded" }),
    ];
    const { k, lida, alertas } = rodar(rows, JANELA);
    expect(k.transacoes).toBe(1);
    expect(k.faturamentoBruto).toBe(100);
    // Saiu pelo reembolso, não pela dedup — o W-P7 não conta essas linhas.
    expect(lida.dedup.removidasNaJanela.linhas).toBe(0);
    expect(alertas).toEqual([]);
  });

  it("dedup roda depois dos filtros de linha: a duplicata com e-mail sobrevive à original sem e-mail", () => {
    const rows = [
      row({ id: "V01", data: "2026-07-20T15:00:00Z", email: "" }),
      row({ id: "V01", data: "2026-07-20T12:00:00Z", email: "a01@x.com" }),
    ];
    const { k } = rodar(rows, JANELA);
    expect(k.transacoes).toBe(1);
  });

  it("AC2(i) — funil SEM productName mapeado: nada colapsa (curso + bump do mesmo pedido), totais de antes e W-P8", () => {
    const semProduto = semCampo("productName");
    const rows = [
      row({ id: "P01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", produto: CURSO, valor: "297,00" }),
      row({ id: "P01", data: "2026-07-20T15:00:00Z", email: "a01@x.com", produto: BUMP, valor: "47,00" }),
      // Duplicata de verdade também fica: sem a coluna, a dedup não roda.
      row({ id: "P02", data: "2026-07-20T15:00:00Z", email: "a02@x.com" }),
      row({ id: "P02", data: "2026-07-20T12:00:00Z", email: "a02@x.com" }),
    ];
    const { k, alertas, lida } = rodar(rows, JANELA, semProduto);
    expect(k.transacoes).toBe(4);
    expect(k.faturamentoBruto).toBe(544);
    expect(lida.dedup.naoAplicada).toEqual({
      faltando: [{ campo: "productName", colunaDoMapping: null }],
    });
    expect(alertas.map((a) => a.codigo)).toEqual(["W-P8"]);
    expect(alertas[0].mensagem).toContain("produto (productName) não está mapeada");
    expect(alertas[0].mensagem).toContain("wizard de planilhas do funil");
  });

  it("AC2(j) — funil SEM transactionId mapeado: nada colapsa e W-P8 cita a coluna de ID", () => {
    const semId = semCampo("transactionId");
    const { k, alertas, lida } = rodar(fixturePg02(), JANELA, semId);
    expect(k.transacoes).toBe(15);
    expect(k.faturamentoBruto).toBe(1500);
    expect(lida.dedup.removidasNaJanela).toEqual({ linhas: 0, valor: 0 });
    expect(alertas.map((a) => a.codigo)).toEqual(["W-P8"]);
    expect(alertas[0].mensagem).toContain("ID da venda (transactionId) não está mapeada");
  });

  it("W-P8 quando o mapeamento aponta para cabeçalho que não existe (as duas colunas)", () => {
    const quebrado = { ...MAPPING, transactionId: "Order ID", productName: "Nome do produto" };
    const { k, alertas } = rodar(fixturePg02(), JANELA, quebrado);
    expect(k.transacoes).toBe(15);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].codigo).toBe("W-P8");
    expect(alertas[0].mensagem).toContain('ID da venda (transactionId) aponta para "Order ID", que não existe na planilha');
    expect(alertas[0].mensagem).toContain('produto (productName) aponta para "Nome do produto", que não existe na planilha');
  });

  it("planilha sem duplicata: mesmas vendas, na mesma ordem, e nenhum alerta novo", () => {
    const rows = fixturePg02().slice(0, 10);
    const { lida, alertas } = rodar(rows, JANELA);
    expect(lida.vendas.map((v) => v.email)).toEqual(
      Array.from({ length: 10 }, (_, i) => `a${pad(i + 1)}@x.com`),
    );
    expect(alertas).toEqual([]);
  });
});

describe("Story 41.11 — loadPerpetualReport anexa W-P7/W-P8 ao relatório", () => {
  const sheetRow = {
    funnelId: "f-1",
    type: "perpetual_sales",
    spreadsheetId: "s-1",
    sheetName: "Vendas",
    platform: "kiwify",
    columnMapping: MAPPING as Record<string, string | undefined>,
  };

  /** Só a consulta da planilha passa pelo banco (sem campanha vinculada). */
  function fakeDb(row: typeof sheetRow): Database {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => [row],
    };
    return { select: () => chain } as unknown as Database;
  }

  beforeEach(() => {
    vi.mocked(loadPerpetualReportConfig).mockResolvedValue(makeConfig());
  });

  it("duplicata na janela → W-P7 no report.alertas, depois dos alertas do motor", async () => {
    vi.mocked(readSheetData).mockResolvedValue({ ...sheet(fixturePg02()), totalRows: 15 });
    const r = await loadPerpetualReport(fakeDb(sheetRow), async () => null, {
      funnelId: "f-1",
      dataInicio: JANELA.inicio,
      dataFim: JANELA.fim,
    });
    expect(r.kpis.transacoes).toBe(10);
    const codigos = r.alertas.map((a) => a.codigo);
    expect(codigos).toContain("W-P7");
    expect(codigos[codigos.length - 1]).toBe("W-P7");
  });

  it("productName não mapeado → W-P8 no report.alertas", async () => {
    vi.mocked(readSheetData).mockResolvedValue({ ...sheet(fixturePg02()), totalRows: 15 });
    const semProduto = semCampo("productName");
    const r = await loadPerpetualReport(
      fakeDb({ ...sheetRow, columnMapping: semProduto }),
      async () => null,
      { funnelId: "f-1", dataInicio: JANELA.inicio, dataFim: JANELA.fim },
    );
    expect(r.kpis.transacoes).toBe(15);
    expect(r.alertas.map((a) => a.codigo)).toContain("W-P8");
  });
});
