import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  lerVendasDaPlanilha,
  prepararVendasDoPeriodo,
  type PlanilhaDeVendasLida,
} from "../services/launch-report-loader.js";
import { computeLaunchReportMetrics } from "../services/launch-report-engine.js";
import { validateLaunchReport } from "../services/launch-report-guards.js";

/**
 * Story 41.10 — dedup por (ID da venda, produto) no loader do Resumão.
 *
 * O caminho testado é o do loader de verdade, sem o I/O: planilha →
 * `lerVendasDaPlanilha` (status, dia, preço, bump, dedup) → corte de período e
 * valor (`prepararVendasDoPeriodo`) → motor → guardas (W9/W10).
 *
 * O padrão que originou a story, reproduzido em escala com dado sintético e sem
 * PII: no n8n do DG-PG02, 25 vendas de R$ 99 aparecem duas vezes com o MESMO
 * `ID` da venda; a segunda linha tem `Transaction` vazia e o horário 3 h antes.
 * Dedup por `Transaction` não pega nenhuma — o mapeamento tem de apontar para `ID`.
 */

const HEADERS = [
  "ID",
  "Transaction",
  "Data Criação",
  "E-mail",
  "Produto",
  "Preço",
  "Evento",
  "utm_source",
  "utm_term",
  "utm_content",
] as const;

const MAPPING: Record<string, string> = {
  transactionId: "ID",
  productName: "Produto",
  dataVenda: "Data Criação",
  email: "E-mail",
  valorBruto: "Preço",
  status: "Evento",
  utm_source: "utm_source",
  utm_term: "utm_term",
  utm_content: "utm_content",
};

interface Linha {
  id: string;
  tx?: string;
  data: string;
  email: string;
  produto: string;
  preco: string;
  evento?: string;
  source?: string;
  term?: string;
}

const row = (l: Linha): string[] => [
  l.id,
  l.tx ?? "",
  l.data,
  l.email,
  l.produto,
  l.preco,
  l.evento ?? "paid",
  l.source ?? "",
  l.term ?? "",
  "",
];

const INGRESSO = "Ingresso Imersão";
const BUMP = "Gravação Bump";
const bumpsDe = (lista: string[]) => {
  const s = new Set(lista.map((p) => p.trim().toLowerCase()));
  return (p: string | null) => s.has((p ?? "").trim().toLowerCase());
};

function planilha(rows: string[][], mapping: Record<string, string> = MAPPING): PlanilhaDeVendasLida {
  return { nome: "n8n-kiwify-captação", headers: [...HEADERS], rows, mapping };
}

/** Planilha → loader → motor → guardas, numa janela. */
function rodar(
  p: PlanilhaDeVendasLida,
  periodo: { inicio: string; fim: string },
  bumps: string[] = [BUMP],
) {
  const lida = lerVendasDaPlanilha(p, bumpsDe(bumps));
  const { vendas, removidasNaJanela } = prepararVendasDoPeriodo(lida.linhas, lida.removidas, periodo);
  const m = computeLaunchReportMetrics({
    periodo,
    impostoPct: 0,
    impostoOrigem: "default",
    impostoJaAplicado: true,
    campanhas: [],
    vendas,
  });
  const g = validateLaunchReport(m, {
    dedup: {
      removidasNaJanela,
      naoAplicada: lida.dedupNaoAplicada ? [lida.dedupNaoAplicada] : [],
    },
  });
  return { m, g, lida, removidasNaJanela };
}

const JANELA = { inicio: "2026-05-01", fim: "2026-05-11" };
const pad = (i: number) => String(i).padStart(2, "0");

/**
 * 30 vendas de R$ 99 do produto de captação (e-mails a01…a30@x.com), `ID` e
 * `Transaction` preenchidos. No fim da planilha, as 25 duplicatas do padrão do
 * PG02: mesmo `ID` de V01…V25, `Transaction` VAZIA, 3 h antes.
 */
function fixturePg02(): string[][] {
  const originais: string[][] = [];
  const duplicatas: string[][] = [];
  for (let i = 1; i <= 30; i++) {
    const hora = 10 + (i % 10);
    const base: Linha = {
      id: `V${pad(i)}`,
      tx: `V${pad(i)}`,
      data: `09/05/2026 ${pad(hora)}:04:33`,
      email: `a${pad(i)}@x.com`,
      produto: INGRESSO,
      preco: "99,00",
      source: i % 2 === 0 ? "meta" : "youtube",
      term: i % 2 === 0 ? "Instagram_Feed_dg--hot|adset|ad" : "",
    };
    originais.push(row(base));
    if (i <= 25) {
      duplicatas.push(row({ ...base, tx: "", data: `09/05/2026 ${pad(hora - 3)}:04:00` }));
    }
  }
  return [...originais, ...duplicatas];
}

describe("AC3 — padrão do PG02: 25 duplicatas com o mesmo ID e Transaction vazia", () => {
  const semDedup = rodar(planilha(fixturePg02(), { ...MAPPING, transactionId: "" }), JANELA);
  const comDedup = rodar(planilha(fixturePg02()), JANELA);

  it("(a) vendas caem exatamente 25 e o faturamento exatamente R$ 2.475,00", () => {
    expect(semDedup.m.ingressos.totais).toBe(55);
    expect(comDedup.m.ingressos.totais).toBe(30);
    expect(semDedup.m.ingressos.totais - comDedup.m.ingressos.totais).toBe(25);
    expect(semDedup.m.faturamento.total - comDedup.m.faturamento.total).toBeCloseTo(2475, 6);
    expect(comDedup.m.faturamento.total).toBeCloseTo(2970, 6);
  });

  it("(b) ingressos únicos NÃO mudam — as duplicatas são do mesmo e-mail", () => {
    expect(comDedup.m.ingressos.unicos).toBe(30);
    expect(semDedup.m.ingressos.unicos).toBe(30);
  });

  it("(c) W9 reporta 25 linhas e R$ 2.475,00, sem bloquear", () => {
    expect(comDedup.removidasNaJanela.linhas).toBe(25);
    expect(comDedup.removidasNaJanela.valor).toBeCloseTo(2475, 6);
    const w9 = comDedup.g.alertas.find((a) => a.codigo === "W9");
    expect(w9?.mensagem).toContain("25 linhas duplicadas por ID da venda removidas (R$ 2.475,00)");
    expect(comDedup.g.bloqueado).toBe(false);
    expect(comDedup.g.alertas.find((a) => a.codigo === "W10")).toBeUndefined();
  });

  it("a sobrevivente é a primeira (a com Transaction preenchida) — dia, UTM e preço são os dela", () => {
    // QA-41.10 TEST-002: no fixture do PG02 as duas linhas de cada par têm o
    // mesmo dia, a mesma UTM e o mesmo preço — trocar a sobrevivente não muda
    // nada observável. Aqui cada par difere no que o relatório soma, então a
    // escolha da sobrevivente aparece no resultado.
    //   S1: primeira em 09/05 (dentro), Pago, R$ 99 · duplicata em 08/05 (fora), sem UTM, R$ 79
    //   S2: primeira em 10/05, sem UTM, R$ 99      · duplicata em 10/05, Pago, R$ 149
    const rows = [
      row({ id: "S1", tx: "S1", data: "09/05/2026 10:04:33", email: "s1@x.com", produto: INGRESSO, preco: "99,00", source: "meta", term: "Instagram_Feed_dg--hot|adset|ad" }),
      row({ id: "S2", tx: "S2", data: "10/05/2026 11:00:00", email: "s2@x.com", produto: INGRESSO, preco: "99,00" }),
      row({ id: "S1", tx: "", data: "08/05/2026 23:04:00", email: "s1@x.com", produto: INGRESSO, preco: "79,00" }),
      row({ id: "S2", tx: "", data: "10/05/2026 08:00:00", email: "s2@x.com", produto: INGRESSO, preco: "149,00", source: "meta", term: "Instagram_Feed_dg--hot|adset|ad" }),
    ];
    const r = rodar(planilha(rows), { inicio: "2026-05-09", fim: "2026-05-11" });

    // a linha mantida de cada ID é a primeira da planilha
    const s1 = r.lida.linhas.find((l) => l.txId === "S1");
    const s2 = r.lida.linhas.find((l) => l.txId === "S2");
    expect(s1).toMatchObject({ dia: "2026-05-09", precoCru: 99, utmSource: "meta" });
    expect(s2).toMatchObject({ dia: "2026-05-10", precoCru: 99, utmSource: null });
    expect(r.lida.removidas.map((l) => [l.txId, l.dia, l.precoCru])).toEqual([
      ["S1", "2026-05-08", 79],
      ["S2", "2026-05-10", 149],
    ]);

    // e é ela que o relatório soma: as duas vendas caem na janela, R$ 198,
    // uma paga (S1) e uma não paga (S2); só a duplicata de S2 cai na janela (W9).
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.m.faturamento.total).toBeCloseTo(198, 6);
    expect(r.m.ingressos.porOrigem.Pago).toBe(1);
    expect(r.m.faturamento.pago).toBeCloseTo(99, 6);
    expect(r.removidasNaJanela).toEqual({ linhas: 1, valor: 149 });
  });

  it("dedup por `Transaction` NÃO pega nenhuma — é por isso que o T0 lê o mapeamento", () => {
    const porTransaction = rodar(planilha(fixturePg02(), { ...MAPPING, transactionId: "Transaction" }), JANELA);
    expect(porTransaction.m.ingressos.totais).toBe(55);
    expect(porTransaction.removidasNaJanela.linhas).toBe(0);
  });
});

describe("AC3 — os casos que não são o fácil", () => {
  it("(d) linha SEM ID repetida (mesmo e-mail, valor e produto) não colapsa", () => {
    const linha = row({ id: "", data: "09/05/2026 10:00:00", email: "z@x.com", produto: INGRESSO, preco: "99,00" });
    const r = rodar(planilha([linha, [...linha]]), JANELA);
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.m.faturamento.total).toBeCloseTo(198, 6);
    expect(r.removidasNaJanela.linhas).toBe(0);
  });

  it("(e) mesmo ID com produto diferente (ingresso + bump no mesmo pedido) conta DUAS vendas — padrão DG-PG04/BBE-A1", () => {
    const r = rodar(
      planilha([
        row({ id: "PED-1", tx: "PED-1", data: "09/05/2026 10:00:00", email: "b@x.com", produto: INGRESSO, preco: "49,90" }),
        row({ id: "PED-1", tx: "PED-1", data: "09/05/2026 10:00:05", email: "b@x.com", produto: BUMP, preco: "99,00" }),
      ]),
      JANELA,
    );
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.m.ingressos.captacao).toBe(1);
    expect(r.m.ingressos.orderBump).toBe(1);
    expect(r.m.faturamento.total).toBeCloseTo(148.9, 6);
    expect(r.g.alertas.find((a) => a.codigo === "W9")).toBeUndefined();
  });

  it("(f) inverter a ordem das duas linhas duplicadas não muda vendas, faturamento nem únicos", () => {
    const rows = fixturePg02();
    // troca a original de V01 (índice 0) com a duplicata dela (índice 30)
    const invertida = [...rows];
    [invertida[0], invertida[30]] = [invertida[30]!, invertida[0]!];
    const a = rodar(planilha(rows), JANELA);
    const b = rodar(planilha(invertida), JANELA);
    expect(b.m.ingressos.totais).toBe(a.m.ingressos.totais);
    expect(b.m.faturamento.total).toBeCloseTo(a.m.faturamento.total, 6);
    expect(b.m.ingressos.unicos).toBe(a.m.ingressos.unicos);
    expect(b.removidasNaJanela).toEqual(a.removidasNaJanela);
  });

  it("ID preenchido nas DUAS linhas (Transaction igual) também colapsa", () => {
    const base: Linha = { id: "V7", tx: "V7", data: "09/05/2026 10:00:00", email: "c@x.com", produto: INGRESSO, preco: "99,00" };
    const r = rodar(planilha([row(base), row(base)]), JANELA);
    expect(r.m.ingressos.totais).toBe(1);
    expect(r.removidasNaJanela).toEqual({ linhas: 1, valor: 99 });
  });

  it("reembolso de transação duplicada: sai INTEIRA, duplicatas incluídas, e não entra no W9", () => {
    const pago: Linha = { id: "R1", tx: "R1", data: "09/05/2026 10:00:00", email: "d@x.com", produto: INGRESSO, preco: "99,00" };
    const r = rodar(
      planilha([
        row(pago),
        row({ ...pago, tx: "", data: "09/05/2026 07:00:00" }),
        row({ ...pago, evento: "refunded", data: "12/05/2026 09:00:00" }),
        row({ id: "R2", tx: "R2", data: "09/05/2026 10:00:00", email: "e@x.com", produto: INGRESSO, preco: "99,00" }),
      ]),
      JANELA,
    );
    expect(r.m.ingressos.totais).toBe(1);
    expect(r.m.ingressos.unicos).toBe(1);
    expect(r.removidasNaJanela.linhas).toBe(0);
  });

  it("(g) janelas ADJACENTES: sobrevivente em D, duplicata em D−1 → a venda conta UMA vez em A + B", () => {
    // Caso real do PG02: 10/05 02:00 (primeira, com Transaction) × 09/05 23:00
    // (duplicata, 3 h antes). Com a dedup DEPOIS do corte, A contaria a
    // duplicata e B a sobrevivente: 2 vendas para 1 compra.
    const rows = [
      row({ id: "V1", tx: "V1", data: "10/05/2026 02:00:54", email: "f@x.com", produto: INGRESSO, preco: "99,00" }),
      row({ id: "V1", tx: "", data: "09/05/2026 23:00:00", email: "f@x.com", produto: INGRESSO, preco: "99,00" }),
    ];
    const a = rodar(planilha(rows), { inicio: "2026-05-01", fim: "2026-05-09" });
    const b = rodar(planilha(rows), { inicio: "2026-05-10", fim: "2026-05-20" });
    expect(a.m.ingressos.totais + b.m.ingressos.totais).toBe(1);
    expect(b.m.ingressos.totais).toBe(1); // o dia é o da sobrevivente
    expect(a.removidasNaJanela).toEqual({ linhas: 1, valor: 99 });
    expect(a.g.alertas.find((x) => x.codigo === "W9")?.mensagem).toContain(
      "1 linha duplicada por ID da venda removida (R$ 99,00)",
    );
    expect(b.g.alertas.find((x) => x.codigo === "W9")).toBeUndefined();
  });

  it("(h) planilha SEM `productName` mapeado: ingresso + bump do mesmo ID não colapsam e W10 aparece", () => {
    const rows = [
      row({ id: "PED-2", data: "09/05/2026 10:00:00", email: "g@x.com", produto: INGRESSO, preco: "49,90" }),
      row({ id: "PED-2", data: "09/05/2026 10:00:05", email: "g@x.com", produto: BUMP, preco: "99,00" }),
    ];
    const semProduto: Record<string, string> = { ...MAPPING };
    delete semProduto.productName;
    const r = rodar(planilha(rows, semProduto), JANELA);
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.removidasNaJanela.linhas).toBe(0);
    const w10 = r.g.alertas.find((a) => a.codigo === "W10");
    expect(w10?.mensagem).toContain('planilha "n8n-kiwify-captação"');
    expect(w10?.mensagem).toContain("produto (productName) não está mapeada");
    expect(w10?.mensagem).toContain("Mapear a coluna no wizard");
    expect(r.g.bloqueado).toBe(false);
  });

  it("(i) planilha SEM `transactionId` mapeado: nada colapsa e W10 aparece (é o PG02 em produção hoje)", () => {
    const r = rodar(planilha(fixturePg02(), { ...MAPPING, transactionId: "" }), JANELA);
    expect(r.m.ingressos.totais).toBe(55);
    expect(r.removidasNaJanela.linhas).toBe(0);
    const w10 = r.g.alertas.find((a) => a.codigo === "W10");
    expect(w10?.mensagem).toContain("ID da venda (transactionId) não está mapeada");
    expect(r.g.alertas.find((a) => a.codigo === "W9")).toBeUndefined();
  });

  it("W10 cita a coluna quando o mapping aponta para cabeçalho que não existe", () => {
    const r = rodar(planilha(fixturePg02(), { ...MAPPING, transactionId: "order_id" }), JANELA);
    expect(r.g.alertas.find((a) => a.codigo === "W10")?.mensagem).toContain(
      'ID da venda (transactionId) aponta para "order_id", que não existe na planilha',
    );
  });
});

describe("Escopo item 7 — o produto que substitui o ingresso como captação define a atribuição e o bump herda", () => {
  // Nomes de produto só no TESTE: o código não conhece nome de produto (AC4).
  const PACOTE = "Combo 3 em 1: Gravação da Imersão + GPT";
  const GRAVACAO = "Curso / Gravação da Imersão";
  const rows = [
    row({ id: "C1", tx: "C1", data: "09/05/2026 10:00:00", email: "h@x.com", produto: PACOTE, preco: "246,90", source: "meta", term: "Instagram_Feed_dg--hot|adset|ad" }),
    row({ id: "C1", tx: "C1", data: "09/05/2026 10:00:05", email: "h@x.com", produto: GRAVACAO, preco: "99,00" }),
  ];

  it("com o pacote FORA da lista de bumps: ele é a captação, o comprador é Pago/Quente e o bump herda", () => {
    const r = rodar(planilha(rows), JANELA, [GRAVACAO, "GPT para Negócios"]);
    expect(r.m.ingressos.unicos).toBe(1);
    expect(r.m.ingressos.porOrigem.Pago).toBe(1);
    expect(r.m.ingressos.pagoQuente).toBe(1);
    // o bump (sem UTM) entra no faturamento PAGO, herdado do pacote
    expect(r.m.faturamento.pago).toBeCloseTo(345.9, 6);
    expect(r.m.faturamento.captacao).toBeCloseTo(246.9, 6);
    expect(r.m.faturamento.orderBump).toBeCloseTo(99, 6);
  });

  it("com o pacote DENTRO da lista de bumps (config antiga do PG02), o mesmo e-mail não é comprador", () => {
    const r = rodar(planilha(rows), JANELA, [PACOTE, "GPT para Negócios"]);
    expect(r.m.ingressos.unicos).toBe(1); // a Gravação vira a captação
    const soPacote = rodar(planilha([rows[0]!]), JANELA, [PACOTE, "GPT para Negócios"]);
    expect(soPacote.m.ingressos.unicos).toBe(0);
  });
});

describe("AC4 — o código não ganha nome de produto", () => {
  it("loader e engine do Resumão não contêm 'combo', 'gravaç' nem '3 em 1'", () => {
    for (const arq of ["launch-report-loader.ts", "launch-report-engine.ts"]) {
      const src = readFileSync(
        fileURLToPath(new URL(`../services/${arq}`, import.meta.url)),
        "utf8",
      );
      expect(src, arq).not.toMatch(/combo|gravaç|3 em 1/i);
    }
  });
});
