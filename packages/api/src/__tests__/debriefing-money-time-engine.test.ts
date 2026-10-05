/**
 * Story 49.3 — Motor I do Debriefing (`computeDebriefingMoneyTime`).
 *
 * Fixtures sintéticas, sem PII (e-mails `cN@x.com`), feitas para PRODUZIR o
 * ruído de cada armadilha: duplicata por evento (#1), "4.000" (#2), produto não
 * classificado (#3), data do lead × data da venda (#4), Sem track só pelo lead
 * (#5), cauda além de D+35 (#7), classificador injetado (#9), dia de gasto ~zero
 * (#10), venda cruzando a meia-noite UTC→BRT, venda antes da abertura.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASSIFICADOR_VERSAO, classificarOrigem, type ConfigClassificador } from "@loyola-x/shared";
import {
  CRITERIO_DE_UNICO_HEADLINE,
  FRACAO_LIMIAR_PICO_ARTEFATO,
  MAXD_PADRAO,
  computeDebriefingMoneyTime,
  type ClassificadorInjetado,
  type DebriefingMoneyTime,
  type DebriefingMoneyTimeInput,
  type LeadInput,
  type MidiaCampanhaDiaInput,
  type PlanilhaDeVendaInput,
  type VendaCruaInput,
} from "../services/debriefing-money-time-engine.js";
import { REGRA_DA_JANELA, aplicarImposto } from "../services/debriefing-hygiene.js";
import { lerPlanilhaDeVenda } from "../services/debriefing-money-time-loader.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const CAP = "stage-captacao";
const PRIN = "stage-principal";
const DOWN = "stage-downsell";
const REAB = "stage-reabertura";

const CFG_CLASSIF: ConfigClassificador = {
  closerMediums: ["x1"],
  closerNomes: ["isabela"],
  closerPorSellerName: true,
  ferramentasDeAtendimento: [],
};
const classificadorReal: ClassificadorInjetado = {
  versao: CLASSIFICADOR_VERSAO,
  classificar: (e) => classificarOrigem(e, CFG_CLASSIF),
};

type Config = DebriefingMoneyTimeInput["config"];
const configBase = (over: Partial<Config> = {}): Config => ({
  datasChave: {
    inicioCaptacao: "2026-04-17",
    aberturaCarrinho: "2026-05-11",
    fimCarrinho: "2026-05-15",
    reabertura: { houve: false },
    downsell: { houve: false },
  },
  etapas: [
    { stageId: CAP, papel: "vendas-captacao" },
    { stageId: PRIN, papel: "vendas-principal" },
  ],
  imposto: { valor: 0.1215, origem: "default" },
  ...over,
});

const planilha = (planilhaId: string, stageId: string, over: Partial<PlanilhaDeVendaInput> = {}): PlanilhaDeVendaInput => ({
  planilhaId,
  stageId,
  nome: planilhaId,
  plataforma: "main_product",
  temColunaStatus: true,
  temColunaId: true,
  temColunaProduto: true,
  camada2Vale: true,
  ...over,
});

let seq = 0;
const venda = (planilhaId: string, over: Partial<VendaCruaInput> = {}): VendaCruaInput => {
  seq += 1;
  return {
    planilhaId,
    linha: seq,
    idDaVendaCru: `T${seq}`,
    produto: "Imersão",
    tipo: "ingresso",
    tipoClassificado: true,
    valorBrutoCru: "99,00",
    moeda: null,
    statusCru: "paid",
    emailCru: `c${seq}@x.com`,
    telefoneCru: null,
    dataVendaCru: "20/04/2026",
    utm: {},
    sellerName: null,
    ...over,
  };
};
const principal = (over: Partial<VendaCruaInput> = {}) =>
  venda("p-prin", { produto: "Mentoria", tipo: "principal", valorBrutoCru: "1.000,00", dataVendaCru: "12/05/2026", ...over });

const midia = (over: Partial<MidiaCampanhaDiaInput> = {}): MidiaCampanhaDiaInput => ({
  stageId: CAP,
  campaignId: "c-cap-hot",
  campaignName: "dg-pg02--vendas-captacao--hot--cbo",
  dia: "2026-04-20",
  spendBruto: 100,
  impressoes: 10000,
  linkClicks: 200,
  ...over,
});

const PLANILHAS_PADRAO = [planilha("p-cap", CAP), planilha("p-prin", PRIN, { plataforma: "sales" })];

const input = (over: Partial<DebriefingMoneyTimeInput> = {}): DebriefingMoneyTimeInput => ({
  config: configBase(),
  criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE,
  planilhas: PLANILHAS_PADRAO,
  vendas: [],
  leads: [],
  midia: [],
  classificador: classificadorReal,
  ...over,
});

const rodar = (over: Partial<DebriefingMoneyTimeInput> = {}) => computeDebriefingMoneyTime(input(over));

/** Percorre o payload e devolve todo número não finito e toda métrica nula sem motivo. */
function varrer(x: unknown, caminho = "$", achados: string[] = []): string[] {
  if (typeof x === "number" && !Number.isFinite(x)) achados.push(`${caminho} = ${x}`);
  if (Array.isArray(x)) x.forEach((v, i) => varrer(v, `${caminho}[${i}]`, achados));
  else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("valor" in o && "memoria" in o && o.valor === null && typeof o.motivo !== "string") {
      achados.push(`${caminho}: valor null sem motivo`);
    }
    for (const [k, v] of Object.entries(o)) varrer(v, `${caminho}.${k}`, achados);
  }
  return achados;
}

function congelar<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) congelar(v);
  }
  return o;
}

// ---------------------------------------------------------------------------
// AC1
// ---------------------------------------------------------------------------

describe("AC1 — contrato puro, determinístico, com memória de cálculo", () => {
  const vendas = () => [
    venda("p-cap", { emailCru: "a@x.com" }),
    venda("p-cap", { emailCru: "b@x.com", produto: "Gravação", tipo: "order_bump", valorBrutoCru: "197,00" }),
    principal({ emailCru: "a@x.com" }),
  ];

  it("mesma entrada → JSON idêntico; entrada congelada não é mutada", () => {
    const a = rodar({ vendas: vendas(), midia: [midia()] });
    const b = computeDebriefingMoneyTime(congelar(input({ vendas: vendas(), midia: [midia()] })));
    // `linha`/`idDaVendaCru` vêm do `seq` global: normaliza para comparar só o motor.
    const semSeq = (r: DebriefingMoneyTime) => JSON.stringify(r).replace(/T\d+/g, "T#").replace(/"a:[0-9a-f]+"/g, '"a:#"');
    expect(semSeq(a)).toBe(semSeq(b));
    const fixa = input({ vendas: vendas(), midia: [midia()] });
    expect(JSON.stringify(computeDebriefingMoneyTime(fixa))).toBe(JSON.stringify(computeDebriefingMoneyTime(fixa)));
  });

  it("sem relógio nem aleatoriedade no motor e na higiene", () => {
    for (const f of ["debriefing-money-time-engine.ts", "debriefing-hygiene.ts"]) {
      const codigo = readFileSync(join(AQUI, "..", "services", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(codigo, f).not.toMatch(/Date\.now|new Date\(\s*\)|Math\.random|performance\.now/);
    }
  });

  it("divisão por zero → null com motivo; nenhum NaN/Infinity em lugar nenhum", () => {
    const r = rodar({ vendas: vendas(), midia: [] }); // sem mídia: todo ROAS/CPC sem denominador
    expect(r.roasCaptacao.valor).toBeNull();
    expect(r.roasCaptacao.motivo).toBe("SEM_INVESTIMENTO_DE_CAPTACAO");
    expect(r.roasTotalSemTmb.valor).toBeNull();
    expect(r.roasTotalSemTmb.motivo).toMatch(/DIVISAO_POR_ZERO/);
    expect(varrer(r)).toEqual([]);
    expect(varrer(rodar())).toEqual([]); // tudo vazio
  });

  it("memória = numerador ÷ denominador com os valores usados (pt-BR, sem NBSP)", () => {
    const r = rodar({
      config: configBase({ imposto: { valor: 0, origem: "stage" } }),
      vendas: vendas(),
      midia: [midia({ spendBruto: 200 })],
    });
    expect(r.roasCaptacao.memoria).toBe(
      "faturamento da captação (ingresso + combo + order bump) R$ 296,00 ÷ investimento de captação c/ imposto R$ 200,00 = 1,48",
    );
    expect(JSON.stringify(r)).not.toContain(String.fromCharCode(0xa0)); // NBSP do Intl
  });

  it("expõe todos os campos que a 49.5 valida", () => {
    const r = rodar({ vendas: vendas(), midia: [midia()] });
    const caminhos = [
      "midia.midiaDiariaPorEtapa",
      "compradoresCaptacao.porEmail",
      "compradoresCaptacao.porEmailOuTelefone",
      "dedup.camada1.antes",
      "dedup.camada2.removidas",
      "faturamentoTotal",
      "faturamentoPorEtapa.captacao",
      "faturamentoPorTipo.ingresso",
      "auditoriaDeVendas",
      "tmb.vendas",
      "tmb.valorExcluido",
      "tmb.sinalizado",
      "ingressosUnicos",
      "compradores",
      "diferencaDeFonte.codigo",
      "tabela1.canais",
      "tabela1.fechamento.closer.ingressos",
      "tabela1.fechamento.semCloser.vendas",
      "vendasPrincipal",
      "vendasPrincipalBrutas",
      "vendasExcluidas",
      "classificadorVersao",
      "tuplasClassificadas",
      "coorte.baseDeData",
      "coorte.maxD",
      "coorte.naCoorte",
      "coorte.basePreLancamento",
      "coorte.foraDaCoorte",
      "coorte.alemDaJanela",
      `midia.porEtapa.${CAP}.investimentoBruto`,
      `midia.porEtapa.${CAP}.investimentoComImposto`,
      `midia.porEtapa.${CAP}.linkClicks`,
      `midia.porEtapa.${CAP}.impressoes`,
      `midia.porEtapa.${CAP}.ctr`,
      `midia.porEtapa.${CAP}.cpc`,
      `midia.porEtapa.${CAP}.quenteFrio.INV_QUENTE`,
      `midia.porEtapa.${CAP}.quenteFrio.INV_FRIO`,
      `midia.porEtapa.${CAP}.quenteFrio.INV_INDEFINIDO`,
      "imposto.impostoPct",
      "imposto.impostoOrigem",
      "imposto.impostoAplicadoPor",
      "imposto.fatorImposto",
      "roasSoIngresso.numerador",
      "roasCaptacao.denominador",
      "roasTotalSemTmb.decomposicao.downsell",
      "teseOrderBump.veredito",
      "limiarPicoArtefato.limiarPicoArtefato",
      "limiarPicoArtefato.investimentoMedioDiarioCaptacao",
      "produtosNaoClassificados",
      "origemDoValor.captacao",
      "higiene.linhasConvertidas",
      "higiene.precoDistintoPorProduto",
      "pendencias",
      "lacunas",
      "roasDiarioCaptacao",
    ];
    for (const c of caminhos) {
      const v = c.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r);
      expect(v, c).not.toBeUndefined();
    }
  });

  it("criterioDeUnico é obrigatório (sem default)", () => {
    expect(() => rodar({ criterioDeUnico: undefined as unknown as "porEmail" })).toThrow(/criterioDeUnico/);
  });
});

// ---------------------------------------------------------------------------
// AC2
// ---------------------------------------------------------------------------

describe("AC2 — célula crua, parser único, negativo como anomalia", () => {
  it("'4.000' vira 4000 e '29.9' vira 29,90 (nunca 4 nem 299)", () => {
    const r = rodar({
      vendas: [principal({ valorBrutoCru: "4.000" }), venda("p-cap", { valorBrutoCru: "29.9" })],
    });
    expect(r.faturamentoPrincipal.valor).toBe(4000);
    expect(r.captacao.faturamentoIngresso.valor).toBe(29.9);
    expect(Object.values(r.origemDoValor).every((o) => o === "celula-crua")).toBe(true);
  });

  it("linha paga sem valor (fora do TMB) não é venda: sai da contagem e é contada em linhasSemValor", () => {
    const r = rodar({
      vendas: [
        venda("p-cap", { emailCru: "zero@x.com", valorBrutoCru: "0,00" }),
        venda("p-cap", { emailCru: "vazio@x.com", valorBrutoCru: "" }),
        venda("p-cap", { emailCru: "ok@x.com" }),
      ],
    });
    expect(r.higiene.linhasSemValor).toBe(2);
    expect(r.ingressosUnicos).toBe(1);
    expect(r.captacao.vendasPorTipo.ingresso).toBe(1);
  });

  it("linha com valor negativo não entra como positivo: vira anomalia listada", () => {
    const r = rodar({
      vendas: [principal({ valorBrutoCru: "1.000,00" }), principal({ valorBrutoCru: "-1.000,00", idDaVendaCru: "EST1" })],
    });
    expect(r.faturamentoPrincipal.valor).toBe(1000);
    expect(r.vendasPrincipal).toBe(1);
    expect(r.higiene.linhasComValorNegativo).toEqual([
      expect.objectContaining({ txId: "EST1", valor: -1000, produto: "Mentoria" }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// AC3
// ---------------------------------------------------------------------------

describe("AC3 — status e dedup em duas camadas (armadilha #1)", () => {
  it("só pago entra; recusada/reembolso/aguardando ficam fora e contados por bucket", () => {
    const r = rodar({
      vendas: [
        venda("p-cap", { statusCru: "paid" }),
        venda("p-cap", { statusCru: "refunded" }),
        venda("p-cap", { statusCru: "chargeback" }),
        venda("p-cap", { statusCru: "refused" }),
        venda("p-cap", { statusCru: "waiting_payment" }),
      ],
    });
    expect(r.ingressosUnicos).toBe(1);
    expect(r.higiene.excluidasPorStatus).toEqual({ refunded: 1, chargeback: 1, other: 2, pareadaComReembolso: 0 });
  });

  it("transação em dobro (PURCHASE_APPROVED + PURCHASE_COMPLETE): faturamento é a METADE e o ROAS de captação é o do conjunto limpo", () => {
    const limpas: VendaCruaInput[] = [];
    const dobradas: VendaCruaInput[] = [];
    for (let i = 0; i < 10; i++) {
      const email = `dup${i}@x.com`;
      const valorBrutoCru = i % 2 ? "39,90" : "99,00";
      limpas.push(venda("p-cap", { emailCru: email, valorBrutoCru, idDaVendaCru: `A${i}`, statusCru: "PURCHASE_APPROVED" }));
      // Formato do snapshot DG-PG01: ID diferente por evento, mesma compra.
      dobradas.push(venda("p-cap", { emailCru: email, valorBrutoCru, idDaVendaCru: `A${i}`, statusCru: "PURCHASE_APPROVED" }));
      dobradas.push(venda("p-cap", { emailCru: email, valorBrutoCru, idDaVendaCru: `C${i}`, statusCru: "PURCHASE_COMPLETE" }));
    }
    const m = [midia({ spendBruto: 300 })];
    const limpo = rodar({ vendas: limpas, midia: m });
    const sujo = rodar({ vendas: dobradas, midia: m });
    const somaCrua = dobradas.reduce((s, v) => s + Number(v.valorBrutoCru!.replace(",", ".")), 0);
    expect(sujo.captacao.faturamentoCaptacao.valor).toBeCloseTo(somaCrua / 2, 10);
    expect(sujo.captacao.faturamentoCaptacao.valor).toBe(limpo.captacao.faturamentoCaptacao.valor);
    expect(sujo.roasCaptacao.valor).toBe(limpo.roasCaptacao.valor);
    expect(sujo.dedup.camada2).toEqual({ antes: 20, depois: 10, removidas: 10 });
  });

  it("PG02 nomeado (R2-1): 25 × R$ 99 repetidas com o mesmo ID e Transaction vazia → −25 linhas / −R$ 2.475,00 na camada 1", () => {
    const headers = ["ID", "Transaction", "Email", "Produto", "Preço", "Data", "Status"];
    const rows: string[][] = [];
    for (let i = 0; i < 25; i++) {
      // Sobrevivente: 21/04 01:00 BRT. Duplicata 3 h antes: 20/04 22:00 BRT — se a
      // duplicata sobrevivesse, a venda mudaria de dia.
      rows.push([`K${i}`, `TR${i}`, `d${i}@x.com`, "Imersão", "99,00", "2026-04-21T04:00:00Z", "paid"]);
      rows.push([`K${i}`, "", `d${i}@x.com`, "Imersão", "99,00", "2026-04-21T01:00:00Z", "paid"]);
    }
    for (let i = 0; i < 5; i++) rows.push([`S${i}`, `TS${i}`, `s${i}@x.com`, "Imersão", "99,00", "2026-04-22T15:00:00Z", "paid"]);
    const mapping = (transactionId: string) => ({
      transactionId,
      email: "Email",
      productName: "Produto",
      valorBruto: "Preço",
      dataVenda: "Data",
      status: "Status",
    });
    const ler = (transactionId: string) =>
      lerPlanilhaDeVenda(
        { planilhaId: "n8n", stageId: CAP, stageType: "paid", nome: "n8n-kiwify-captação", plataforma: "capture", headers, rows, mapping: mapping(transactionId) },
        { "imersão": "ingresso" },
      );
    const comId = ler("ID");
    const r = rodar({ planilhas: [comId.planilha, PLANILHAS_PADRAO[1]!], vendas: comId.vendas, midia: [midia({ dia: "2026-04-21" })] });
    expect(r.dedup.camada1).toEqual({ antes: 55, depois: 30, removidas: 25 });
    expect(r.dedup.camada2.removidas).toBe(0);
    expect(r.captacao.faturamentoCaptacao.valor).toBe(30 * 99);
    expect(55 * 99 - r.captacao.faturamentoCaptacao.valor!).toBe(2475);
    expect(r.ingressosUnicos).toBe(30); // compradores únicos não mudam (mesmo e-mail)
    const dia = (d: string) => r.roasDiarioCaptacao.find((x) => x.dia === d)?.faturamento ?? 0;
    expect(dia("2026-04-21")).toBe(25 * 99); // ficou o dia da sobrevivente
    expect(dia("2026-04-20")).toBe(0);

    // Reversão: dedup só por `Transaction` (vazia nas duplicatas) não pega as 25 na camada 1.
    const soTransaction = ler("Transaction");
    const errado = rodar({ planilhas: [soTransaction.planilha, PLANILHAS_PADRAO[1]!], vendas: soTransaction.vendas });
    expect(errado.dedup.camada1.removidas).toBe(0);
  });

  it("planilha sem ID mapeado: camada 1 não roda, lacuna DEDUP_POR_ID_NAO_APLICADA, camada 2 segue", () => {
    const r = rodar({
      planilhas: [planilha("p-cap", CAP, { temColunaId: false, nome: "Captação" }), PLANILHAS_PADRAO[1]!],
      vendas: [
        venda("p-cap", { idDaVendaCru: "X", emailCru: "a@x.com" }),
        venda("p-cap", { idDaVendaCru: "X", emailCru: "a@x.com" }),
      ],
    });
    expect(r.dedup.camada1.removidas).toBe(0);
    expect(r.dedup.camada2.removidas).toBe(1);
    expect(r.lacunas.find((l) => l.codigo === "DEDUP_POR_ID_NAO_APLICADA")?.detalhe).toBe("Captação: falta transactionId");
    expect(r.higiene.dedupNaoAplicada).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC4
// ---------------------------------------------------------------------------

describe("AC4 — TMB conta a venda, exclui o valor, sinaliza", () => {
  const planilhasComTmb = [...PLANILHAS_PADRAO, planilha("p-tmb", PRIN, { plataforma: "tmb" })];

  it("conta em vendasPrincipal, fica fora de todo faturamento e a memória diz", () => {
    const r = rodar({
      planilhas: planilhasComTmb,
      vendas: [principal({ valorBrutoCru: "1.000,00" }), principal({ planilhaId: "p-tmb", valorBrutoCru: "497,00" })],
      midia: [midia({ stageId: PRIN, campaignId: "c-p", campaignName: "x--vendas-principal--hot" })],
    });
    expect(r.vendasPrincipal).toBe(2);
    expect(r.faturamentoPrincipal.valor).toBe(1000);
    expect(r.faturamentoTotal).toBe(1000);
    expect(r.tmb).toEqual({
      vendas: 1,
      valorExcluido: 497,
      vendasNoPrincipal: 1,
      sinalizado: true,
      texto: "2 vendas, 1 via TMB (valor não considerado)",
    });
    expect(r.faturamentoPrincipal.memoria).toContain("2 vendas, 1 via TMB (valor não considerado)");
    expect(r.roasTotalSemTmb.memoria).toContain("via TMB (valor não considerado)");
    expect(r.auditoriaDeVendas.find((a) => a.tmb)).toMatchObject({ valor: 497, valorConsiderado: 0 });
  });

  it("TMB sem valor na célula ainda conta a venda", () => {
    const r = rodar({ planilhas: planilhasComTmb, vendas: [principal({ planilhaId: "p-tmb", valorBrutoCru: null })] });
    expect(r.vendasPrincipal).toBe(1);
    expect(r.higiene.linhasSemValor).toBe(0);
  });

  it("sem TMB: zero, sem sinalização inventada", () => {
    const r = rodar({ vendas: [principal()] });
    expect(r.tmb).toEqual({ vendas: 0, valorExcluido: 0, vendasNoPrincipal: 0, sinalizado: false, texto: null });
    expect(JSON.stringify(r)).not.toMatch(/via TMB/);
  });
});

// ---------------------------------------------------------------------------
// AC5
// ---------------------------------------------------------------------------

describe("AC5 — moeda estrangeira e preços distintos", () => {
  it("linha em USD com mediana < 50% da BRL vira o preço modal BRL e gera a lacuna", () => {
    const r = rodar({
      vendas: [
        venda("p-cap", { valorBrutoCru: "99,00" }),
        venda("p-cap", { valorBrutoCru: "99,00" }),
        venda("p-cap", { valorBrutoCru: "99,00" }),
        venda("p-cap", { valorBrutoCru: "19,90", moeda: "USD" }),
      ],
    });
    expect(r.higiene.linhasConvertidas).toBe(1);
    expect(r.captacao.faturamentoIngresso.valor).toBe(4 * 99);
    expect(r.lacunas.map((l) => l.codigo)).toContain("PRECO_ORIGINAL_NAO_MAPEADO");
  });

  it("produto com mais de 15 preços distintos aparece como coluna contaminada", () => {
    const vendas = Array.from({ length: 16 }, (_, i) => venda("p-cap", { valorBrutoCru: `${100 + i},00` }));
    const r = rodar({ vendas });
    expect(r.higiene.precoDistintoPorProduto["Imersão"]).toBe(16);
    expect(r.higiene.produtosComPrecoContaminado).toEqual([{ produto: "Imersão", valoresDistintos: 16 }]);
  });
});

// ---------------------------------------------------------------------------
// AC6
// ---------------------------------------------------------------------------

describe("AC6 — mídia por etapa: link_click, imposto uma vez, Quente × Frio", () => {
  it("gross-up uma vez: 111.188,35 → 126.566,14 (conferência do Epic 41)", () => {
    const r = rodar({ midia: [midia({ spendBruto: 111188.35 })] });
    const cap = r.midia.porEtapa[CAP]!;
    expect(cap.investimentoBruto).toBe(111188.35);
    expect(cap.investimentoComImposto.toFixed(2)).toBe("126566.14");
    expect(r.imposto).toMatchObject({ impostoPct: 0.1215, impostoOrigem: "default", impostoAplicadoPor: "motor" });
    expect(r.imposto.fatorImposto).toBeCloseTo(1 / (1 - 0.1215), 12);
  });

  it("período que cruza 2026-01-01: imposto POR DIA (a razão global não é 1/(1−pct))", () => {
    const r = rodar({
      config: configBase({
        datasChave: { ...configBase().datasChave, inicioCaptacao: "2025-12-30" },
      }),
      midia: [midia({ dia: "2025-12-31", spendBruto: 1000 }), midia({ dia: "2026-01-01", spendBruto: 1000 })],
    });
    const cap = r.midia.porEtapa[CAP]!;
    expect(cap.investimentoComImposto).toBeCloseTo(1000 + 1000 / (1 - 0.1215), 9);
    // F12 da 49.5: recompor por dia a partir de midiaDiariaPorEtapa fecha.
    const recomposto = r.midia.midiaDiariaPorEtapa
      .filter((d) => d.stageId === CAP)
      .reduce((s, d) => s + aplicarImposto(d.bruto, d.dia, r.imposto.impostoPct), 0);
    expect(recomposto).toBeCloseTo(cap.investimentoComImposto, 9);
  });

  it("link_click null → CTR/CPC null com motivo (nunca 0, nunca cliques totais); 0 → CTR 0 e CPC null", () => {
    const semLink = rodar({ midia: [midia({ linkClicks: null })] }).midia.porEtapa[CAP]!;
    expect(semLink.linkClicks).toBeNull();
    expect(semLink.ctr).toMatchObject({ valor: null, motivo: "LINK_CLICK_AUSENTE" });
    expect(semLink.cpc).toMatchObject({ valor: null, motivo: "LINK_CLICK_AUSENTE" });
    expect(semLink.cpm.valor).not.toBeNull();

    const zero = rodar({ midia: [midia({ linkClicks: 0 })] }).midia.porEtapa[CAP]!;
    expect(zero.linkClicks).toBe(0);
    expect(zero.ctr.valor).toBe(0);
    expect(zero.cpc.valor).toBeNull();

    const ok = rodar({ midia: [midia({ linkClicks: 200, impressoes: 10000, spendBruto: 87.85 })] }).midia.porEtapa[CAP]!;
    expect(ok.ctr.valor).toBe(2);
    expect(ok.cpc.valor).toBeCloseTo(87.85 / (1 - 0.1215) / 200, 12);
  });

  it("Quente + Frio + Indefinido = INV, com share; campanha sem padrão vai para pendências", () => {
    const r = rodar({
      midia: [
        midia({ campaignId: "h", campaignName: "dg--vendas-captacao--hot", spendBruto: 300 }),
        midia({ campaignId: "c", campaignName: "dg—vendas-captacao—cold", spendBruto: 100 }),
        midia({ campaignId: "x", campaignName: "campanha qualquer", spendBruto: 100 }),
      ],
    });
    const qf = r.midia.porEtapa[CAP]!.quenteFrio;
    expect(qf.INV_QUENTE + qf.INV_FRIO + qf.INV_INDEFINIDO).toBeCloseTo(qf.INV, 9);
    expect(qf.INV).toBeCloseTo(r.midia.porEtapa[CAP]!.investimentoComImposto, 9);
    expect(qf.shareQuente).toBeCloseTo(60, 9);
    expect(qf.shareFrio).toBeCloseTo(20, 9);
    expect(r.pendencias.filter((p) => p.campaignId === "x").map((p) => p.codigo)).toEqual([
      "CAMPANHA_SEM_FASE",
      "CAMPANHA_SEM_PUBLICO",
    ]);
  });

  it("mídia de etapa fora da config não some em silêncio", () => {
    const r = rodar({ midia: [midia({ stageId: "outra" })] });
    expect(r.midia.investimentoTotal.valor).toBe(0);
    expect(r.pendencias.map((p) => p.codigo)).toContain("MIDIA_DE_ETAPA_FORA_DA_CONFIG");
  });
});

// ---------------------------------------------------------------------------
// AC7
// ---------------------------------------------------------------------------

describe("AC7 — captação: ingresso × combo × order bump (armadilha #3)", () => {
  const vendasCap = () => [
    venda("p-cap", { emailCru: "a@x.com" }),
    venda("p-cap", { emailCru: "a@x.com", produto: "Gravação", tipo: "order_bump", valorBrutoCru: "197,00" }),
    venda("p-cap", { emailCru: "b@x.com", produto: "Combo 3 em 1", tipo: "combo", valorBrutoCru: "296,00" }),
    venda("p-cap", { emailCru: "c@x.com", telefoneCru: "553175058180.0" }),
    venda("p-cap", { emailCru: "d@x.com", produto: "GPT", tipo: "order_bump", valorBrutoCru: "47,00" }),
    venda("p-cap", { emailCru: "e@x.com", produto: "Produto Novo", tipo: "ingresso", tipoClassificado: false }),
    venda("p-cap", { emailCru: "f@x.com", telefoneCru: "(31) 7505-8180" }),
  ];

  it("faturamento separado por tipo, comprador = ingresso OU combo (R2-1), avulso só no ticket", () => {
    const r = rodar({ vendas: vendasCap() });
    const c = r.captacao;
    expect(c.faturamentoIngresso.valor).toBe(4 * 99);
    expect(c.faturamentoCombo.valor).toBe(296);
    expect(c.faturamentoOrderBump.valor).toBe(197 + 47);
    expect(c.faturamentoCaptacao.valor).toBe(396 + 296 + 244);
    // B só comprou o Combo e é comprador; D só comprou o GPT e é avulso.
    // CONTRACT-001: `compradoresUnicos` é o comprador de captação da R2-1 (sem avulso).
    expect(c.compradoresUnicos).toEqual({ porEmail: 5, porEmailOuTelefone: 4 });
    expect(c.compradoresUnicos.porEmail).toBe(r.compradoresCaptacao.porEmail.length);
    expect(c.compradoresUnicos.porEmailOuTelefone).toBe(r.compradoresCaptacao.porEmailOuTelefone.length);
    expect(c.compradoresDaEtapaInclusiveAvulsos).toEqual({ porEmail: 6, porEmailOuTelefone: 5 });
    expect(c.compradoresUnicos.porEmail + c.avulsos.compradores).toBe(c.compradoresDaEtapaInclusiveAvulsos.porEmail);
    expect(r.ingressosUnicos).toBe(5);
    expect(c.avulsos).toEqual({ compradores: 1, faturamento: 47 });
    expect(c.ticketCaptacao.valor).toBeCloseTo(936 / 5, 12);
    // MNT-001: o denominador é contagem de pessoas, não dinheiro.
    expect(c.ticketCaptacao.memoria).toBe(
      "faturamento da captação R$ 936,00 ÷ compradores de captação 5 = R$ 187,20" +
        " — o numerador inclui R$ 47,00 de 1 comprador(es) só de order bump (avulsos), que não entram no denominador",
    );
    expect(c.comCombo).toBe(1);
    expect(c.comOrderBump).toBe(1);
    expect(c.comTierSuperior.valor).toBeCloseTo(2 / 5, 12);
  });

  it("produto da captação fora de product_types sai em produtosNaoClassificados", () => {
    const r = rodar({ vendas: vendasCap() });
    expect(r.produtosNaoClassificados).toEqual([{ produto: "Produto Novo", vendas: 1, faturamento: 99, tiposAssumidos: ["ingresso"] }]);
  });

  it("únicos em dois critérios; o telefone (com .0) une C e F só no porEmailOuTelefone", () => {
    const r = rodar({ vendas: vendasCap() });
    expect(r.compradoresCaptacao.porEmail).toHaveLength(5);
    expect(r.compradoresCaptacao.porEmailOuTelefone).toHaveLength(4);
    const ou = rodar({ vendas: vendasCap(), criterioDeUnico: "porEmailOuTelefone" });
    expect(ou.ingressosUnicos).toBe(4);
    expect(ou.criterioDeUnico).toBe("porEmailOuTelefone");
    expect(JSON.stringify(r.compradoresCaptacao)).not.toMatch(/@|75058180/);
  });

  it("captação gratuita: aplicável = false, métricas null com motivo (nunca 0)", () => {
    const r = rodar({
      config: configBase({
        etapas: [
          { stageId: "free", papel: "leads-captacao" },
          { stageId: PRIN, papel: "vendas-principal" },
        ],
      }),
      planilhas: [PLANILHAS_PADRAO[1]!],
      vendas: [principal()],
      midia: [midia({ stageId: "free", campaignName: "x--leads-captacao--hot" })],
    });
    expect(r.captacao.aplicavel).toBe(false);
    for (const m of [r.captacao.faturamentoIngresso, r.captacao.ticketCaptacao, r.roasSoIngresso, r.roasCaptacao, r.conversaoIngressoPrincipal]) {
      expect(m.valor).toBeNull();
      expect(m.motivo).toMatch(/CAPTACAO_GRATUITA/);
    }
    expect(r.teseOrderBump.veredito).toBe("indefinida");
    expect(r.midia.porGrupo.captacao.investimentoComImposto).toBeGreaterThan(0);
  });

  it("diferença de fonte declarada (LEADS_DO_PAINEL)", () => {
    const r = rodar({ vendas: vendasCap() });
    expect(r.diferencaDeFonte.codigo).toBe("LEADS_DO_PAINEL");
    expect(r.lacunas.map((l) => l.codigo)).toContain("LEADS_DO_PAINEL");
  });
});

// ---------------------------------------------------------------------------
// AC8
// ---------------------------------------------------------------------------

describe("AC8 — Tabela 1 em dois eixos (aquisição × fechamento), nunca somados", () => {
  const leads: LeadInput[] = [
    { emailCru: "a@x.com", telefoneCru: null, dataCriacaoCru: "17/04/2026", utm: { source: "facebook", term: "lp1|hot|ad" } },
  ];
  const vendas = () => [
    venda("p-cap", { emailCru: "a@x.com" }),
    venda("p-cap", { emailCru: "z@x.com", utm: { source: "ig" } }),
    principal({ emailCru: "a@x.com", utm: { source: "isabela", medium: "x1" } }), // lead Meta + venda x1
    principal({ emailCru: "g@x.com", utm: { source: "ig", medium: "bio" } }),
    principal({ emailCru: "h@x.com", utm: { medium: "x1" } }), // só UTM de closer
    principal({ emailCru: "i@x.com", sellerName: "Netão" }), // sem UTM, só sellerName
    principal({ emailCru: "j@x.com" }), // nada
  ];

  it("lead Meta + venda x1 = Pago Quente E Closer; cada eixo fecha sozinho", () => {
    const r = rodar({ vendas: vendas(), leads });
    const canal = (c: string) => r.tabela1.canais.find((x) => x.canal === c)!;
    expect(canal("Pago Quente")).toMatchObject({ ingressos: 1, vendas: 1 });
    expect(canal("Instagram orgânico")).toMatchObject({ ingressos: 1, vendas: 1 });
    expect(canal("Aquisição não rastreada (só closer)")).toMatchObject({ vendas: 1 });
    expect(canal("Sem track real")).toMatchObject({ vendas: 2 });
    expect(r.tabela1.canais.map((c) => c.canal)).not.toContain("Closer");
    expect(r.tabela1.fechamento.closer.vendas).toBe(3); // A (x1), H (x1), I (sellerName)
    expect(r.tabela1.fechamento.semCloser.vendas).toBe(2);
    expect(r.tabela1.somas).toEqual({
      ingressosPorCanal: 2,
      vendasPorCanal: 5,
      ingressosPorFechamento: 2,
      vendasPorFechamento: 5,
      referencia: { ingressosUnicos: 2, vendasPrincipal: 5 },
    });
    const a = r.auditoriaDeVendas.find((x) => x.utmVenda.medium === "x1" && x.utmLead);
    expect(a).toMatchObject({ canal: "Pago Quente", fechamento: "closer" });
  });

  it("Sem track real: conversão null com motivo; closer e sem-closer têm conversão", () => {
    const r = rodar({ vendas: vendas(), leads });
    expect(r.tabela1.canais.find((c) => c.canal === "Sem track real")!.conversao).toMatchObject({
      valor: null,
      motivo: "SEM_TRACK_SEM_CONVERSAO",
    });
    expect(r.tabela1.canais.find((c) => c.canal === "Pago Quente")!.conversao.valor).toBe(1);
  });

  it("classificadorVersao, tuplas com os dois rótulos, lacuna das listas e auditoria sem PII", () => {
    const r = rodar({ vendas: vendas(), leads });
    expect(r.classificadorVersao).toBe(CLASSIFICADOR_VERSAO);
    expect(r.tuplasClassificadas).toContainEqual(
      expect.objectContaining({ sellerName: "Netão", canal: "Sem track real", fechamento: "closer" }),
    );
    expect(r.lacunas).toContainEqual({ codigo: "LISTAS_FRONT_COMUNIDADE", motivo: "sem fonte no Loyola" });
    expect(JSON.stringify(r.auditoriaDeVendas)).not.toMatch(/@/);
    expect(JSON.stringify(r)).not.toMatch(/[a-z0-9]+@x\.com/);
  });

  it("o motor NÃO reimplementa a regra: segue o classificador injetado", () => {
    const fixo: ClassificadorInjetado = {
      versao: "teste",
      classificar: () => ({
        canal: "WhatsApp",
        fechamento: "sem-closer",
        fonteUtm: "nenhuma",
        regra: 5,
        regraDeFechamento: null,
        temperaturaDecididaPor: null,
      }),
    };
    const r = rodar({ vendas: vendas(), leads, classificador: fixo });
    expect(r.tabela1.canais.find((c) => c.canal === "WhatsApp")).toMatchObject({ ingressos: 2, vendas: 5 });
    expect(r.tabela1.fechamento.closer.vendas).toBe(0);
    expect(r.classificadorVersao).toBe("teste");
  });

  it("tupla com utm_campaign sem nome resolvido é contada", () => {
    const r = rodar({ vendas: [principal({ utm: { source: "fb", campaign: "120000" } })] });
    expect(r.tuplasSemNomeDeCampanha).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC9
// ---------------------------------------------------------------------------

describe("AC9 — coorte D+x pela data do LEAD (armadilhas #4 e #7)", () => {
  const leads: LeadInput[] = [
    { emailCru: "s1@x.com", telefoneCru: null, dataCriacaoCru: "20/04/2026", utm: { source: "ig" } },
    { emailCru: "s1@x.com", telefoneCru: null, dataCriacaoCru: "2026-04-17T15:00:00Z", utm: { source: "facebook" } }, // a mais antiga
    { emailCru: "outro@x.com", telefoneCru: "553175058180.0", dataCriacaoCru: "25/04/2026", utm: {} },
    { emailCru: "s5@x.com", telefoneCru: null, dataCriacaoCru: "26/05/2026", utm: {} },
    { emailCru: "s6@x.com", telefoneCru: null, dataCriacaoCru: "10/06/2026", utm: {} },
    { emailCru: "s7@x.com", telefoneCru: null, dataCriacaoCru: "10/04/2026", utm: {} },
  ];
  const vendas = () => [
    // Ingresso que cruza a meia-noite: 02:00 UTC de 18/04 = 23:00 BRT de 17/04 → D+0.
    venda("p-cap", { emailCru: "s3@x.com", dataVendaCru: "2026-04-18T02:00:00Z" }),
    venda("p-cap", { emailCru: "cap4@x.com", telefoneCru: "11 98888-7777", dataVendaCru: "19/04/2026" }),
    principal({ emailCru: "s1@x.com", idDaVendaCru: "s1" }),
    principal({ emailCru: "s2@x.com", telefoneCru: "553175058180", idDaVendaCru: "s2" }),
    principal({ emailCru: "s3@x.com", idDaVendaCru: "s3" }),
    principal({ emailCru: "s4@x.com", telefoneCru: "98888-7777", idDaVendaCru: "s4" }),
    principal({ emailCru: "s5@x.com", idDaVendaCru: "s5" }),
    principal({ emailCru: "s6@x.com", idDaVendaCru: "s6" }),
    principal({ emailCru: "s7@x.com", idDaVendaCru: "s7" }),
    principal({ emailCru: "s8@x.com", idDaVendaCru: "s8" }),
    principal({ emailCru: "s9@x.com", idDaVendaCru: "s9", dataVendaCru: "ontem" }),
    principal({ emailCru: "s10@x.com", idDaVendaCru: "s10", dataVendaCru: "05/05/2026", valorBrutoCru: "800,00" }),
    principal({ emailCru: "s11@x.com", idDaVendaCru: "s11", valorBrutoCru: "5,00" }), // R$ 5 depois da abertura
    principal({ emailCru: "s12@x.com", idDaVendaCru: "s12", dataVendaCru: "11/05/2026" }), // no dia da abertura
  ];
  const dMais = (r: DebriefingMoneyTime, tx: string) => r.auditoriaDeVendas.find((a) => a.txId === tx);

  it("D+x é a data do lead (nunca a da venda); recuperação e-mail → telefone → ingresso; a mais antiga vence", () => {
    const r = rodar({ vendas: vendas(), leads });
    expect(dMais(r, "s1")).toMatchObject({ origemDaData: "lead-email", dataDoLead: "2026-04-17", dMais: 0 });
    expect(dMais(r, "s2")).toMatchObject({ origemDaData: "lead-telefone", dMais: 8 });
    expect(dMais(r, "s3")).toMatchObject({ origemDaData: "ingresso-email", dataDoLead: "2026-04-17", dMais: 0 });
    expect(dMais(r, "s4")).toMatchObject({ origemDaData: "ingresso-telefone", dMais: 2 });
    expect(dMais(r, "s8")).toMatchObject({ origemDaData: "nenhuma", dMais: null });
    expect(r.coorte.baseDeData).toBe("lead");
    // A venda de s1 é de 12/05 (D+25 pela venda) e está em D+0 — base é o lead.
    expect(r.coorte.serie[0]!.vendas).toBe(2);
    expect(r.coorte.serie[25]!.vendas).toBe(0);
  });

  it("buckets exclusivos somam as vendas do principal; nada some", () => {
    const r = rodar({ vendas: vendas(), leads });
    const c = r.coorte;
    expect(c.maxD).toBe(MAXD_PADRAO);
    expect(c.naCoorte).toBe(5); // s1, s2, s3, s4, s5 (D+39)
    expect(c.basePreLancamento).toBe(1); // s7
    expect(c.alemDaJanela).toEqual([expect.objectContaining({ txId: "s6", dMais: 54 })]);
    expect(c.foraDaCoorte.map((f) => [f.txId, f.motivo])).toEqual([
      ["s8", "SEM_DATA_DO_LEAD"],
      ["s9", "DATA_DA_VENDA_ILEGIVEL"],
      ["s11", "SEM_DATA_DO_LEAD"],
      ["s12", "SEM_DATA_DO_LEAD"],
    ]);
    expect(c.soma).toBe(r.vendasPrincipal);
    expect(r.lacunas.find((l) => l.codigo === "VENDAS_SEM_DATA")?.detalhe).toBe("4 venda(s)");
    expect(JSON.stringify(c.foraDaCoorte)).not.toMatch(/@/);
  });

  it("MAXD 45 não corta a cauda; com 35, D+39 vai para alemDaJanela — e continua contada", () => {
    expect(rodar({ vendas: vendas(), leads }).coorte.serie[39]!.vendas).toBe(1);
    const curto = rodar({ vendas: vendas(), leads, maxD: 35 });
    expect(curto.coorte.alemDaJanela.map((a) => a.dMais)).toEqual([39, 54]);
    expect(curto.coorte.soma).toBe(curto.vendasPrincipal);
  });

  it("exclusão automática SÓ por data anterior à abertura (estrito <); venda de R$ 5 depois fica (R2-4)", () => {
    const r = rodar({ vendas: vendas(), leads });
    expect(r.vendasExcluidas).toEqual([
      { txId: "s10", produto: "Mentoria", valor: 800, dataBrt: "2026-05-05", fonte: "planilha", motivo: "ANTERIOR_A_ABERTURA" },
    ]);
    expect(r.vendasPrincipalBrutas).toBe(r.vendasPrincipal + r.vendasExcluidas.length);
    expect(r.auditoriaDeVendas.map((a) => a.txId)).not.toContain("s10");
    expect(r.auditoriaDeVendas.map((a) => a.txId)).toEqual(expect.arrayContaining(["s9", "s11", "s12"]));
    expect(r.faturamentoPrincipal.valor).toBe(9 * 1000 + 5 + 1000); // s1..s9 (9) + s11 (R$ 5) + s12
    expect(r.lacunas.find((l) => l.codigo === "VENDAS_EXCLUIDAS_AUTOMATICAMENTE")?.detalhe).toBe("1 venda(s), R$ 800,00");
    const codigo = readFileSync(join(AQUI, "..", "services", "debriefing-money-time-engine.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/VENDA_TESTE|\b5[.,]00?\b/);
  });

  it("coorte paga = só vendas cujo canal é Pago (classificador)", () => {
    const r = rodar({ vendas: vendas(), leads });
    const pagas = r.auditoriaDeVendas.filter((a) => a.canal.startsWith("Pago")).length;
    expect(pagas).toBe(1); // s1: lead mais antigo é facebook
    expect(r.coortePaga.soma).toBe(1);
    expect(r.coortePaga.serie[0]!.vendas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC10
// ---------------------------------------------------------------------------

describe("AC10 — taxas, ROAS em 3 níveis, tese do order bump", () => {
  it("fixture DG-PG02: 1.845 ÷ 35.882 = 5,14%; Captação→Principal 70 ÷ 1.845 = 3,79%", () => {
    const vendas: VendaCruaInput[] = [];
    for (let i = 0; i < 1845; i++) vendas.push(venda("p-cap", { emailCru: `dg${i}@x.com` }));
    for (let i = 0; i < 70; i++) vendas.push(principal({ emailCru: `dg${i}@x.com` }));
    const r = rodar({ vendas, midia: [midia({ linkClicks: 35882 })] });
    expect(r.captacao.pctCompradoresPorCliques.valor!.toFixed(2)).toBe("5.14");
    expect(r.captacao.pctCompradoresPorCliques.memoria).toBe(
      "compradores de captação 1.845 ÷ link_click da captação 35.882 × 100 = 5,14%",
    );
    expect(r.conversaoIngressoPrincipal.valor!.toFixed(4)).toBe("0.0379");
  });

  it("% compradores/cliques é null sem link_click", () => {
    const r = rodar({ vendas: [venda("p-cap")], midia: [midia({ linkClicks: null })] });
    expect(r.captacao.pctCompradoresPorCliques).toMatchObject({ valor: null, motivo: "LINK_CLICK_AUSENTE" });
  });

  const cenario = () =>
    rodar({
      config: configBase({
        datasChave: {
          inicioCaptacao: "2026-04-17",
          aberturaCarrinho: "2026-05-11",
          fimCarrinho: "2026-05-15",
          reabertura: { houve: true, abertura: "2026-05-20", fim: "2026-05-22" },
          downsell: { houve: true, abertura: "2026-05-16", fim: "2026-05-18" },
        },
        etapas: [
          { stageId: CAP, papel: "vendas-captacao" },
          { stageId: PRIN, papel: "vendas-principal" },
          { stageId: DOWN, papel: "vendas-downsell" },
          { stageId: REAB, papel: "reabertura" },
        ],
        imposto: { valor: 0, origem: "stage" },
      }),
      planilhas: [...PLANILHAS_PADRAO, planilha("p-down", DOWN), planilha("p-reab", REAB)],
      vendas: [
        venda("p-cap", { valorBrutoCru: "500,00" }),
        venda("p-cap", { produto: "Combo", tipo: "combo", valorBrutoCru: "300,00" }),
        venda("p-cap", { produto: "Gravação", tipo: "order_bump", valorBrutoCru: "200,00" }),
        principal({ valorBrutoCru: "2.000,00" }),
        venda("p-down", { produto: "Downsell", tipo: "principal", valorBrutoCru: "300,00", dataVendaCru: "17/05/2026" }),
        venda("p-reab", { produto: "Mentoria", tipo: "principal", valorBrutoCru: "1.000,00", dataVendaCru: "21/05/2026" }),
      ],
      midia: [
        midia({ spendBruto: 800 }),
        midia({ stageId: PRIN, campaignId: "p", campaignName: "x--vendas-principal--hot", spendBruto: 200 }),
        midia({ stageId: DOWN, campaignId: "d", campaignName: "x--vendas-downsell--hot", spendBruto: 100 }),
        midia({ stageId: REAB, campaignId: "r", campaignName: "x--vendas-principal-reab--hot", spendBruto: 50 }),
      ],
    });

  it("três níveis recomputáveis; total inclui o downsell (decisão 5); reabertura fora do headline", () => {
    const r = cenario();
    expect(r.roasSoIngresso).toMatchObject({ valor: 500 / 800, numerador: 500, denominador: 800 });
    expect(r.roasCaptacao).toMatchObject({ valor: 1000 / 800, numerador: 1000, denominador: 800 });
    expect(r.roasTotalSemTmb.decomposicao).toEqual({ captacao: 1000, principal: 2000, downsell: 300 });
    expect(r.roasTotalSemTmb.numerador).toBe(3300);
    expect(r.roasTotalSemTmb.denominador).toBe(1100);
    expect(r.roasTotalSemTmb.valor).toBe(3);
    expect(r.roasTotalSemTmb.semDownsell.valor).toBeCloseTo(3000 / 1100, 12);
    expect(r.teseOrderBump).toEqual({ roasSoIngresso: 0.625, roasCaptacao: 1.25, veredito: "confirmada" });
    expect(r.apendiceReabertura).toMatchObject({
      aplicavel: true,
      vendas: 1,
      faturamento: 1000,
      investimento: 50,
      nota: "reaproveita audiência já paga",
    });
    expect(r.apendiceReabertura.roasMarginal.valor).toBe(20);
    expect(r.referenciaCombinada.roas.valor).toBeCloseTo(4300 / 1150, 12);
    // F1: total = Σ por etapa = Σ por tipo.
    const somaEtapa = Object.values(r.faturamentoPorEtapa).reduce((s, v) => s + v, 0);
    const somaTipo = Object.values(r.faturamentoPorTipo).reduce((s, v) => s + v, 0);
    expect(r.faturamentoTotal).toBe(4300);
    expect(somaEtapa).toBe(4300);
    expect(somaTipo).toBe(4300);
  });

  it("tese não confirmada quando o ingresso sozinho já paga", () => {
    const r = rodar({
      config: configBase({ imposto: { valor: 0, origem: "stage" } }),
      vendas: [venda("p-cap", { valorBrutoCru: "900,00" })],
      midia: [midia({ spendBruto: 800 })],
    });
    expect(r.teseOrderBump.veredito).toBe("nao-confirmada");
  });
});

// ---------------------------------------------------------------------------
// AC11
// ---------------------------------------------------------------------------

describe("AC11 — ROAS diário da captação e pico-artefato (armadilha #10)", () => {
  const cenario = (gastoDoDia19: number) =>
    rodar({
      config: configBase({ imposto: { valor: 0, origem: "stage" } }),
      vendas: [
        venda("p-cap", { valorBrutoCru: "300,00", dataVendaCru: "18/04/2026" }),
        venda("p-cap", { valorBrutoCru: "4.000,00", dataVendaCru: "19/04/2026" }),
        venda("p-cap", { valorBrutoCru: "1.000,00", dataVendaCru: "20/04/2026" }),
      ],
      midia: [
        midia({ dia: "2026-04-17", spendBruto: 1000 }),
        midia({ dia: "2026-04-19", spendBruto: gastoDoDia19 }),
        midia({ dia: "2026-04-20", spendBruto: 950 }),
      ],
    });

  it("dia sem gasto → ROAS null e diaSemGasto (nunca Infinity); média conta os dias de calendário", () => {
    const r = cenario(50);
    const d18 = r.roasDiarioCaptacao.find((d) => d.dia === "2026-04-18")!;
    expect(d18).toMatchObject({ investimento: 0, faturamento: 300, roas: null, diaSemGasto: true, picoArtefato: false });
    expect(r.limiarPicoArtefato).toMatchObject({
      investimentoMedioDiarioCaptacao: 500, // 2.000 ÷ 4 dias (17..20, inclusive o 18 sem gasto)
      limiarPicoArtefato: 50,
      fracao: FRACAO_LIMIAR_PICO_ARTEFATO,
      diasDoDenominador: 4,
    });
    expect(r.roasDiarioCaptacao.map((d) => d.dMais)).toEqual([0, 1, 2, 3]);
  });

  it("fronteira: no limiar não é pico; abaixo é", () => {
    const noLimiar = cenario(50).roasDiarioCaptacao.find((d) => d.dia === "2026-04-19")!;
    expect(noLimiar).toMatchObject({ roas: 80, picoArtefato: false });
    const abaixo = cenario(49).roasDiarioCaptacao.find((d) => d.dia === "2026-04-19")!;
    expect(abaixo.picoArtefato).toBe(true);
    expect(abaixo.roas).toBeCloseTo(4000 / 49, 12);
  });

  it("a série traz investimento e faturamento por etapa (barras empilhadas)", () => {
    const d = cenario(50).roasDiarioCaptacao.find((x) => x.dia === "2026-04-20")!;
    expect(d.investimentoPorEtapa).toEqual({ [CAP]: 950 });
    expect(d.faturamentoPorEtapa).toEqual({ [CAP]: 1000 });
  });
});

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------

describe("corte de janela depois da dedup — nada some", () => {
  it("venda fora do período sai e é contada por grupo; venda sem dia fica e é contada", () => {
    const r = rodar({
      vendas: [
        venda("p-cap", { dataVendaCru: "10/04/2026" }),
        venda("p-cap", { dataVendaCru: "sem data" }),
        venda("p-cap"),
      ],
    });
    expect(r.higiene.foraDoPeriodo.captacao).toEqual({ vendas: 1, faturamento: 99 });
    expect(r.higiene.vendasSemDia).toBe(1);
    expect(r.ingressosUnicos).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// QA fix iteração 1 (gate 49.3): mutações sobreviventes Q17, Q21, Q22, Q23
// ---------------------------------------------------------------------------

describe("TEST-001 (Q21) — ROAS diário e pico-artefato usam o investimento COM imposto", () => {
  const PCT = 0.1215;
  const cenario = () =>
    rodar({
      config: configBase({ imposto: { valor: PCT, origem: "default" } }),
      vendas: [
        venda("p-cap", { valorBrutoCru: "300,00", dataVendaCru: "18/04/2026" }),
        venda("p-cap", { valorBrutoCru: "4.000,00", dataVendaCru: "19/04/2026" }),
        venda("p-cap", { valorBrutoCru: "1.000,00", dataVendaCru: "20/04/2026" }),
      ],
      midia: [
        midia({ dia: "2026-04-17", spendBruto: 1000 }),
        // Bruto 55 fica ABAIXO do limiar (57,06); com imposto (62,61) fica acima.
        midia({ dia: "2026-04-19", spendBruto: 55 }),
        midia({ dia: "2026-04-20", spendBruto: 950 }),
      ],
    });

  it("investimento do dia = bruto ÷ (1 − pct), e a série fecha com o investimento de captação", () => {
    const r = cenario();
    const d17 = r.roasDiarioCaptacao.find((d) => d.dia === "2026-04-17")!;
    expect(d17.investimento).toBeCloseTo(1000 / (1 - PCT), 9);
    expect(d17.investimentoPorEtapa[CAP]).toBeCloseTo(1000 / (1 - PCT), 9);
    const soma = r.roasDiarioCaptacao.reduce((s, d) => s + d.investimento, 0);
    expect(soma).toBeCloseTo(r.midia.porGrupo.captacao.investimentoComImposto, 9);
  });

  it("o limiar (com imposto) é comparado com o gasto do dia com imposto: 62,61 ≥ 57,06 não é pico", () => {
    const r = cenario();
    const limiar = (2005 / (1 - PCT) / 4) * FRACAO_LIMIAR_PICO_ARTEFATO;
    expect(r.limiarPicoArtefato.limiarPicoArtefato).toBeCloseTo(limiar, 9);
    const d19 = r.roasDiarioCaptacao.find((d) => d.dia === "2026-04-19")!;
    expect(d19.investimento).toBeCloseTo(55 / (1 - PCT), 9);
    expect(d19.investimento).toBeGreaterThan(limiar);
    expect(55).toBeLessThan(limiar); // o bruto seria pico — é a armadilha que o teste trava
    expect(d19.picoArtefato).toBe(false);
    expect(d19.roas).toBeCloseTo(4000 / (55 / (1 - PCT)), 9);
  });
});

describe("TEST-002 (Q17) — % compradores/cliques: avulso de order bump fora do numerador", () => {
  it("3 compradores de captação + 1 avulso ÷ 100 link_click = 3,00% (nunca 4%)", () => {
    const r = rodar({
      vendas: [
        venda("p-cap", { emailCru: "a@x.com" }),
        venda("p-cap", { emailCru: "b@x.com", produto: "Combo", tipo: "combo", valorBrutoCru: "296,00" }),
        venda("p-cap", { emailCru: "c@x.com" }),
        venda("p-cap", { emailCru: "avulso@x.com", produto: "GPT", tipo: "order_bump", valorBrutoCru: "47,00" }),
      ],
      midia: [midia({ linkClicks: 100 })],
    });
    expect(r.captacao.avulsos.compradores).toBe(1);
    expect(r.captacao.pctCompradoresPorCliques.valor).toBeCloseTo(3, 12);
    expect(r.captacao.pctCompradoresPorCliques.memoria).toBe(
      "compradores de captação 3 ÷ link_click da captação 100 × 100 = 3,00%",
    );
  });
});

describe("TEST-003 (Q22) — TMB na captação: conta o comprador, o valor fica fora do faturamento e do ticket", () => {
  it("planilha tmb na etapa de captação", () => {
    const r = rodar({
      planilhas: [...PLANILHAS_PADRAO, planilha("p-cap-tmb", CAP, { plataforma: "tmb" })],
      vendas: [
        venda("p-cap", { emailCru: "a@x.com" }),
        venda("p-cap-tmb", { emailCru: "t@x.com", valorBrutoCru: "497,00" }),
      ],
    });
    expect(r.ingressosUnicos).toBe(2);
    expect(r.captacao.faturamentoIngresso.valor).toBe(99);
    expect(r.captacao.faturamentoCaptacao.valor).toBe(99);
    expect(r.faturamentoTotal).toBe(99);
    expect(r.captacao.ticketCaptacao.valor).toBeCloseTo(99 / 2, 12);
    expect(r.captacao.ticketCaptacao.memoria).toContain("2 vendas, 1 via TMB (valor não considerado)");
    expect(r.captacao.faturamentoCaptacao.memoria).toContain("2 vendas, 1 via TMB (valor não considerado)");
    expect(r.tmb).toMatchObject({ vendas: 1, valorExcluido: 497, vendasNoPrincipal: 0, sinalizado: true });
  });
});

describe("TEST-004 (Q23) — UTM do lead: e-mail antes do telefone na classificação", () => {
  it("lead do e-mail (facebook, hot) vence o lead do telefone (ig) em registros diferentes", () => {
    const leads: LeadInput[] = [
      { emailCru: "a@x.com", telefoneCru: null, dataCriacaoCru: "17/04/2026", utm: { source: "facebook", term: "lp1|hot|ad" } },
      { emailCru: "outro@x.com", telefoneCru: "31 99999-1111", dataCriacaoCru: "20/04/2026", utm: { source: "ig" } },
    ];
    const r = rodar({ vendas: [principal({ emailCru: "a@x.com", telefoneCru: "(31) 99999-1111", idDaVendaCru: "Q23" })], leads });
    const a = r.auditoriaDeVendas.find((x) => x.txId === "Q23")!;
    expect(a.utmLead?.source).toBe("facebook");
    expect(a.canal).toBe("Pago Quente");
    expect(a).toMatchObject({ origemDaData: "lead-email", dataDoLead: "2026-04-17" });
  });
});

// ---------------------------------------------------------------------------
// Decisão 2A (dono, 2026-10-02) — janela = inicioCaptacao → maior fim
// ---------------------------------------------------------------------------

describe("decisão 2A — a janela sai da config e corta vendas E mídia", () => {
  const comExtras = (extras: Partial<Config["datasChave"]>) =>
    configBase({ datasChave: { ...configBase().datasChave, ...extras } });
  const dados = () => ({
    vendas: [
      principal({ idDaVendaCru: "D17", dataVendaCru: "17/05/2026" }),
      principal({ idDaVendaCru: "D19", dataVendaCru: "19/05/2026" }),
    ],
    midia: [
      midia({ stageId: PRIN, campaignId: "p", campaignName: "x--vendas-principal--hot", dia: "2026-05-17", spendBruto: 100 }),
      midia({ stageId: PRIN, campaignId: "p", campaignName: "x--vendas-principal--hot", dia: "2026-05-19", spendBruto: 100 }),
    ],
  });

  it("só carrinho: fim = fimCarrinho (15/05); 17/05 e 19/05 ficam fora, contados", () => {
    const r = rodar(dados());
    expect(r.janela).toEqual({ inicio: "2026-04-17", fim: "2026-05-15", fimPor: "fimCarrinho", regra: REGRA_DA_JANELA });
    expect(r.vendasPrincipal).toBe(0);
    expect(r.higiene.foraDoPeriodo.principal).toEqual({ vendas: 2, faturamento: 2000 });
    expect(r.midia.linhasForaDoPeriodo).toBe(2);
    expect(r.midia.porGrupo.principal.investimentoBruto).toBe(0);
  });

  it("downsell até 18/05 estica a janela: 17/05 entra (venda e mídia), 19/05 fica fora", () => {
    const r = rodar({ ...dados(), config: comExtras({ downsell: { houve: true, abertura: "2026-05-16", fim: "2026-05-18" } }) });
    expect(r.janela).toMatchObject({ fim: "2026-05-18", fimPor: "downsell.fim" });
    expect(r.auditoriaDeVendas.map((a) => a.txId)).toEqual(["D17"]);
    expect(r.higiene.foraDoPeriodo.principal.vendas).toBe(1);
    expect(r.midia.porGrupo.principal.investimentoBruto).toBe(100);
    expect(r.midia.linhasForaDoPeriodo).toBe(1);
  });

  it("reabertura depois do downsell: o maior fim vence", () => {
    const r = rodar({
      ...dados(),
      config: comExtras({
        downsell: { houve: true, abertura: "2026-05-16", fim: "2026-05-18" },
        reabertura: { houve: true, abertura: "2026-05-19", fim: "2026-05-22" },
      }),
    });
    expect(r.janela).toMatchObject({ fim: "2026-05-22", fimPor: "reabertura.fim" });
    expect(r.vendasPrincipal).toBe(2);
    expect(r.midia.linhasForaDoPeriodo).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Decisão 3A (dono, 2026-10-02) — vendas manuais entram, com a origem marcada
// ---------------------------------------------------------------------------

describe("decisão 3A — manual_sales no motor, fonte marcada, Closer por seller_name", () => {
  const planilhasComManual = [
    ...PLANILHAS_PADRAO,
    planilha("p-man", PRIN, { plataforma: "manual", nome: "Vendas manuais", temColunaStatus: false }),
  ];
  const vendaManual = (over: Partial<VendaCruaInput> = {}) =>
    venda("p-man", {
      produto: "Mentoria",
      tipo: "principal",
      valorBrutoCru: "2500,00",
      dataVendaCru: "2026-05-13T15:00:00.000Z",
      statusCru: null,
      emailCru: "m@x.com",
      sellerName: "Netão",
      idDaVendaCru: "MAN1",
      ...over,
    });

  it("a manual soma no principal e no faturamento; a auditoria marca fonte; o resumo declara", () => {
    const r = rodar({ planilhas: planilhasComManual, vendas: [principal({ idDaVendaCru: "PLA1" }), vendaManual()] });
    expect(r.vendasPrincipal).toBe(2);
    expect(r.faturamentoPrincipal.valor).toBe(1000 + 2500);
    expect(r.faturamentoPrincipal.memoria).toContain("(inclui 1 venda(s) manual(is), R$ 2.500,00)");
    expect(r.auditoriaDeVendas.map((a) => [a.txId, a.fonte])).toEqual([
      ["PLA1", "planilha"],
      ["MAN1", "manual"],
    ]);
    expect(r.vendasManuais).toEqual({
      linhasLidas: 1,
      porGrupo: {
        captacao: { vendas: 0, faturamento: 0 },
        principal: { vendas: 1, faturamento: 2500 },
        downsell: { vendas: 0, faturamento: 0 },
        reabertura: { vendas: 0, faturamento: 0 },
      },
      origemDoValor: "manual_sales.value",
    });
    expect(r.tmb.vendas).toBe(0); // manual não é TMB
  });

  it("Netão: sem UTM e com seller_name = Sem track real na aquisição e Closer no fechamento", () => {
    const r = rodar({ planilhas: planilhasComManual, vendas: [vendaManual()] });
    expect(r.auditoriaDeVendas[0]).toMatchObject({ fonte: "manual", canal: "Sem track real", fechamento: "closer" });
    expect(r.tabela1.fechamento.closer.vendas).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/m@x\.com/);
  });

  it("manual antes da abertura é excluída e listada com fonte manual (decisão 7 vale para ela)", () => {
    const r = rodar({ planilhas: planilhasComManual, vendas: [vendaManual({ dataVendaCru: "2026-05-05T15:00:00.000Z" })] });
    expect(r.vendasExcluidas).toEqual([
      { txId: "MAN1", produto: "Mentoria", valor: 2500, dataBrt: "2026-05-05", fonte: "manual", motivo: "ANTERIOR_A_ABERTURA" },
    ]);
    expect(r.vendasManuais.porGrupo.principal.vendas).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// QA fix iteração 2
// ---------------------------------------------------------------------------

describe("TEST-005 (QA-M9) — venda manual conta nas vendas do downsell, da reabertura e na nota de TMB", () => {
  const configComExtras = configBase({
    datasChave: {
      ...configBase().datasChave,
      downsell: { houve: true, abertura: "2026-05-16", fim: "2026-05-18" },
      reabertura: { houve: true, abertura: "2026-05-19", fim: "2026-05-22" },
    },
    etapas: [
      { stageId: CAP, papel: "vendas-captacao" },
      { stageId: PRIN, papel: "vendas-principal" },
      { stageId: DOWN, papel: "vendas-downsell" },
      { stageId: REAB, papel: "reabertura" },
    ],
  });
  const planilhas = [
    ...PLANILHAS_PADRAO,
    planilha("p-tmb", PRIN, { plataforma: "tmb" }),
    planilha("p-man-prin", PRIN, { plataforma: "manual", temColunaStatus: false }),
    planilha("p-down", DOWN),
    planilha("p-man-down", DOWN, { plataforma: "manual", temColunaStatus: false }),
    planilha("p-man-reab", REAB, { plataforma: "manual", temColunaStatus: false }),
  ];
  const manual = (planilhaId: string, over: Partial<VendaCruaInput> = {}) =>
    venda(planilhaId, { statusCru: null, sellerName: "Netão", produto: "Mentoria", tipo: "principal", valorBrutoCru: "500,00", ...over });

  it("downsell 1 planilha + 1 manual = 2 vendas; reabertura só manual = 1 venda; principal 'N vendas' inclui a manual", () => {
    const r = rodar({
      config: configComExtras,
      planilhas,
      vendas: [
        principal({ idDaVendaCru: "PLA" }),
        venda("p-tmb", { produto: "Mentoria", tipo: "principal", valorBrutoCru: "1.000,00", dataVendaCru: "12/05/2026", idDaVendaCru: "TMB" }),
        manual("p-man-prin", { idDaVendaCru: "MP", dataVendaCru: "2026-05-13T15:00:00.000Z" }),
        venda("p-down", { produto: "Downsell", valorBrutoCru: "200,00", dataVendaCru: "17/05/2026", idDaVendaCru: "DP" }),
        manual("p-man-down", { produto: "Downsell", valorBrutoCru: "300,00", idDaVendaCru: "DM", dataVendaCru: "2026-05-17T15:00:00.000Z" }),
        manual("p-man-reab", { idDaVendaCru: "RM", dataVendaCru: "2026-05-20T15:00:00.000Z" }),
      ],
    });
    expect(r.downsell).toEqual({ aplicavel: true, vendas: 2, faturamento: 500 });
    expect(r.apendiceReabertura).toMatchObject({ aplicavel: true, vendas: 1, faturamento: 500 });
    expect(r.vendasPrincipal).toBe(3);
    expect(r.faturamentoPrincipal.memoria).toContain("(3 vendas, 1 via TMB (valor não considerado))");
    expect(r.vendasManuais.porGrupo).toMatchObject({
      downsell: { vendas: 1, faturamento: 300 },
      reabertura: { vendas: 1, faturamento: 500 },
    });
  });
});

describe("regra 9 da skill — UTM em array desembrulhada antes do classificador (lead e venda)", () => {
  it("venda sem lead: source {\"facebook\",\"facebook\"} vira Pago N/D (cru seria Outros orgânicos)", () => {
    const r = rodar({
      vendas: [principal({ idDaVendaCru: "ARR", utm: { source: '{"facebook","facebook"}', medium: '{"cpc","cpc"}' } })],
    });
    const a = r.auditoriaDeVendas.find((x) => x.txId === "ARR")!;
    expect(a.utmVenda).toMatchObject({ source: "facebook", medium: "cpc" });
    expect(a.canal).toBe("Pago N/D");
    expect(r.higiene.utmsEmArray).toEqual({ vendas: 1, leads: 0, ambiguas: 0 });
  });

  it("lead: medium {\"x1\",\"x1\"} fecha como closer e term {\"lp|hot|ad\"} decide Pago Quente", () => {
    const leads: LeadInput[] = [
      { emailCru: "a@x.com", telefoneCru: null, dataCriacaoCru: "17/04/2026", utm: { source: '{"meta"}', medium: "{x1,x1}", term: '{"lp|hot|ad","lp|hot|ad"}' } },
    ];
    const r = rodar({ vendas: [principal({ emailCru: "a@x.com", idDaVendaCru: "LD" })], leads });
    const a = r.auditoriaDeVendas.find((x) => x.txId === "LD")!;
    expect(a.utmLead).toMatchObject({ source: "meta", medium: "x1", term: "lp|hot|ad" });
    expect(a).toMatchObject({ canal: "Pago Quente", fechamento: "closer" });
    expect(r.higiene.utmsEmArray).toEqual({ vendas: 0, leads: 1, ambiguas: 0 });
  });

  it("valores distintos ficam crus (Outros orgânicos) e são contados em ambiguas — nunca em silêncio", () => {
    const r = rodar({
      vendas: [principal({ idDaVendaCru: "AMB", utm: { source: '{"facebook","google"}', term: '{"backend","lote-3"}' } })],
    });
    const a = r.auditoriaDeVendas.find((x) => x.txId === "AMB")!;
    expect(a.utmVenda.source).toBe('{"facebook","google"}');
    expect(a.canal).toBe("Outros orgânicos");
    expect(r.higiene.utmsEmArray).toEqual({ vendas: 0, leads: 0, ambiguas: 1 });
  });
});

describe("REL-001 — aba em mais de uma etapa: declarada no payload, nunca em silêncio", () => {
  it("fontesDuplicadas do loader vira higiene.fontesDuplicadas + lacuna FONTE_EM_MAIS_DE_UMA_ETAPA", () => {
    const fonte = {
      aba: "n8n-kiwify-downsell",
      vinculos: [
        { stageId: DOWN, papel: "vendas-downsell" as const, planilhaId: "p-down", temColunaId: true, temColunaProduto: true },
        { stageId: "leads-ds", papel: "leads-downsell" as const, planilhaId: "p-leads-ds", temColunaId: false, temColunaProduto: false },
      ],
      vale: "p-down",
      stageIdQueVale: DOWN,
      criterio: "mapeamento-id-e-produto" as const,
      linhasNaoRelidas: 83,
    };
    const r = rodar({ fontesDuplicadas: [fonte] });
    expect(r.higiene.fontesDuplicadas).toEqual([fonte]);
    const l = r.lacunas.find((x) => x.codigo === "FONTE_EM_MAIS_DE_UMA_ETAPA")!;
    expect(l.detalhe).toBe(
      `n8n-kiwify-downsell: 2 vínculos (vendas-downsell, leads-downsell); vale o da etapa ${DOWN} (mapeamento-id-e-produto); 83 linha(s) não relidas`,
    );
    // sem duplicata: sem lacuna, lista vazia
    const limpo = rodar();
    expect(limpo.higiene.fontesDuplicadas).toEqual([]);
    expect(limpo.lacunas.some((x) => x.codigo === "FONTE_EM_MAIS_DE_UMA_ETAPA")).toBe(false);
  });
});
