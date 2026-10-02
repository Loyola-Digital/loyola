/**
 * Story 49.4 — Motor II do Debriefing (público), `computeDebriefingAudience`.
 *
 * Fixtures sintéticas, sem PII real. Cada regra crítica tem um teste que falha
 * se a correção for revertida (dedup, "mais recente", gate, % sobre o segmento,
 * segmentos exclusivos, proporção, comprador = ingresso ∪ combo, imposto uma
 * vez, link_click ausente ≠ 0).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLASSIFICADOR_VERSAO, classificarOrigem, type Utm } from "@loyola-x/shared";
import {
  computeDebriefingAudience,
  faixaDaCelula,
  linkDoAdsManager,
  tipoPelaCampanha,
  tipoPeloNome,
  type DebriefingAudienceInput,
  type PesquisaInput,
  type RespostaInput,
  type VendaHigienizadaInput,
} from "../services/debriefing-audience-engine.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const CAP = "stage-cap";
const PESQ = "pesq-1";
const AD1 = "120000000000000001";
const AD2 = "120000000000000002";
const AD3 = "120000000000000003";

const classificador = {
  versao: CLASSIFICADOR_VERSAO,
  classificar: (e: Parameters<typeof classificarOrigem>[0]) =>
    classificarOrigem(e, { closerMediums: ["x1"], closerNomes: ["isabela"], closerPorSellerName: true, ferramentasDeAtendimento: [] }),
};

const pesquisa: PesquisaInput = {
  pesquisaId: PESQ,
  stageId: CAP,
  rotulo: "Pesquisa / respostas",
  temColunaEmail: true,
  chavesDePergunta: ["faixa", "Sexo", "Profissão", "Religião"],
  cabecalhoDaChave: { faixa: "Faixa 1", Sexo: "Sexo", "Profissão": "Profissão", "Religião": "Religião" },
};

let linha = 0;
function resp(p: Partial<RespostaInput> & { email?: string | null; faixa?: string; sexo?: string }): RespostaInput {
  linha += 1;
  return {
    pesquisaId: PESQ,
    linha,
    linhaTemRespondente: p.linhaTemRespondente ?? true,
    emailCru: p.email === undefined ? null : p.email,
    telefoneCru: p.telefoneCru ?? null,
    dataRespostaCru: p.dataRespostaCru ?? null,
    utm: p.utm ?? {},
    utmContentCru: p.utmContentCru ?? null,
    respostas: p.respostas ?? { faixa: p.faixa ?? null, Sexo: p.sexo ?? null, "Profissão": null, "Religião": "Católica" },
  };
}

function venda(p: Partial<VendaHigienizadaInput> & { email?: string | null }): VendaHigienizadaInput {
  return {
    planilhaId: p.planilhaId ?? "cap:s1",
    linha: p.linha ?? 1,
    grupo: p.grupo ?? "captacao",
    emailCru: p.email === undefined ? null : p.email,
    telefoneCru: p.telefoneCru ?? null,
    utm: p.utm ?? {},
    utmContentCru: p.utmContentCru ?? null,
    sellerName: p.sellerName ?? null,
    comprouCaptacao: p.comprouCaptacao ?? false,
    comprouPrincipal: p.comprouPrincipal ?? false,
    comprouTierSuperior: p.comprouTierSuperior ?? false,
  };
}

const HOT: Utm = { source: "fb", term: "lp|hot|dg-pg02-ia-01" };
const COLD: Utm = { source: "fb", term: "lp|cold|dg-pg02-h-02" };

/** A entrada do motor é `readonly`; a fixture precisa de listas mutáveis para os cenários. */
type EntradaMutavel = Omit<DebriefingAudienceInput, "respondentes" | "compradores"> & {
  respondentes: RespostaInput[];
  compradores: VendaHigienizadaInput[];
};

function entradaBase(): EntradaMutavel {
  linha = 0;
  const respondentes: RespostaInput[] = [
    resp({ email: "a@x.com", faixa: "A", sexo: "Feminino", utm: HOT, utmContentCru: AD1, dataRespostaCru: "17/04/2026" }),
    resp({ email: "b@x.com", faixa: "B", sexo: "Masculino", utm: COLD, utmContentCru: AD2, dataRespostaCru: "17/04/2026" }),
    resp({ email: "c@x.com", faixa: "D", utm: { source: "facebook" }, utmContentCru: "org", dataRespostaCru: "18/04/2026" }),
    // d@ respondeu 2×: a de 20/04 (Orgânico, faixa A) vence a de 18/04 (hot, faixa C).
    resp({ email: "D@X.com ", faixa: "C", sexo: "Masculino", utm: HOT, utmContentCru: AD1, dataRespostaCru: "18/04/2026" }),
    resp({ email: "d@x.com", faixa: "A", sexo: "feminino", utm: { source: "ig" }, utmContentCru: "{{ad.id}}", dataRespostaCru: "20/04/2026" }),
    resp({ email: "e@x.com", faixa: "", telefoneCru: "(11) 98888-7777", dataRespostaCru: "19/04/2026" }),
    resp({ email: "f@x.com", faixa: "Faixa C", sexo: "Feminino", utmContentCru: AD3, dataRespostaCru: "19/04/2026" }),
    resp({ email: "g@x.com", faixa: "x", sexo: "Feminino", utm: { source: "ig" }, utmContentCru: "link_in_bio" }),
    resp({ email: null, linhaTemRespondente: false }),
    resp({ email: null, linhaTemRespondente: false }),
  ];
  const compradores: VendaHigienizadaInput[] = [
    venda({ email: "a@x.com", linha: 1, comprouCaptacao: true, utm: HOT, utmContentCru: AD1 }),
    venda({ email: "b@x.com", linha: 2, comprouCaptacao: true, comprouTierSuperior: true }), // só Combo (R2-1)
    venda({ email: "c@x.com", linha: 3, comprouTierSuperior: true }), // só order bump: avulso
    venda({ email: "e2@x.com", linha: 4, telefoneCru: "5511988887777.0", comprouCaptacao: true, utm: { medium: "x1" }, utmContentCru: AD2 }),
    venda({ email: "z@x.com", linha: 5, comprouCaptacao: true }),
    venda({ email: "a@x.com", planilhaId: "prin:s1", linha: 1, grupo: "principal", comprouPrincipal: true }),
  ];
  return {
    config: {
      perguntasConfirmadas: { [CAP]: { faixa: "faixa", sexo: "Sexo", idade: "Idade", profissao: "Profissão" } },
      dimensaoDeCriativo: "ia-humano",
      imposto: { valor: 0.1215, origem: "default" },
    },
    periodo: { inicio: "2026-04-17", fim: "2026-05-31" },
    pesquisas: [pesquisa],
    respondentes,
    compradores,
    criativos: {
      anuncios: [
        { adId: AD1, adName: "dg-pg02-ia-01", campaignId: "111", campaignName: "dg--vendas-captacao--hot", dia: "2026-04-20", spendBruto: 100, impressoes: 1000, linkClicks: 50 },
        { adId: AD2, adName: "dg-pg02-h-02", campaignId: "111", campaignName: "dg--vendas-captacao--hot", dia: "2026-04-20", spendBruto: 200, impressoes: 2000, linkClicks: null },
      ],
      nomesDeAnuncio: { [AD1]: "dg-pg02-ia-01", [AD3]: "dg-pg02-ia-01 - Cópia" },
      contaDeAnuncios: "3717530711643512",
    },
    baseAnterior: {
      funnelId: "funil-anterior",
      tipo: "leads+compradores",
      leads: [
        { emailCru: "a@x.com", telefoneCru: null },
        { emailCru: null, telefoneCru: "11 98888-7777" },
        { emailCru: "w@x.com", telefoneCru: null },
        { emailCru: "W@x.com", telefoneCru: null },
      ],
      compradores: [{ emailCru: "b@x.com", telefoneCru: null }],
      chavesDePerguntaComResposta: ["Sexo"],
    },
    classificador,
  };
}

const rodar = (mut?: (e: EntradaMutavel) => void) => {
  const e = entradaBase();
  mut?.(e);
  return computeDebriefingAudience(e);
};

/** Código do motor sem comentários (o cabeçalho cita `Math.random` e as listas de fonte paga para dizer que NÃO usa). */
function codigoDoMotor(): string {
  return readFileSync(fileURLToPath(new URL("../services/debriefing-audience-engine.ts", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function congelar<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as object)) congelar(v);
    Object.freeze(o);
  }
  return o;
}

// ---------------------------------------------------------------------------
// AC1
// ---------------------------------------------------------------------------

describe("AC1 — contrato puro e determinístico", () => {
  it("mesma entrada ⇒ JSON idêntico; entrada congelada não é mutada", () => {
    const a = computeDebriefingAudience(congelar(entradaBase()));
    const b = computeDebriefingAudience(entradaBase());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("sem relógio, sem Math.random, sem I/O no código do motor", () => {
    const fonte = codigoDoMotor();
    expect(fonte).not.toMatch(/Date\.now|new Date\(\)|Math\.random/);
    expect(fonte).not.toMatch(/from "\.\/google-sheets|from "\.\.\/db\/client|drizzle-orm/);
  });

  it("divisão por zero ⇒ valor null com motivo, nunca 0/NaN/Infinity", () => {
    const r = rodar((e) => {
      e.respondentes = [];
      e.compradores = [];
    });
    expect(r.taxaDeResposta).toMatchObject({ valor: null, numerador: 0, denominador: 0 });
    expect(r.taxaDeResposta.motivo).toMatch(/^DIVISAO_POR_ZERO/);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });

  it("toda métrica traz a memória com os dois números", () => {
    const r = rodar();
    expect(r.taxaDeResposta.memoria).toBe(
      "compradores de captação que responderam 3 ÷ compradores de captação 4 × 100 = 75,00%",
    );
    expect(r.faixa.pctAB.memoria).toBe("respondentes A+B 3 ÷ respondentes (pesquisa inteira deduplicada) 7 × 100 = 42,86%");
  });

  it("sem PII: nenhum e-mail ou telefone no payload", () => {
    expect(JSON.stringify(rodar())).not.toMatch(/@x\.com|88887777|98888/i);
  });
});

// ---------------------------------------------------------------------------
// AC2
// ---------------------------------------------------------------------------

describe("AC2 — higiene da pesquisa (armadilha #6)", () => {
  it("vazia cai, e-mail repetido colapsa (trim + minúsculas) e a identidade fecha", () => {
    const { pesquisa: p } = rodar();
    expect(p).toMatchObject({ linhasLidas: 10, vazias: 2, duplicadasRemovidas: 1, respondentes: 7 });
    expect(p.linhasLidas - p.vazias - p.duplicadasRemovidas).toBe(p.respondentes);
    expect(p.porPesquisa).toEqual([{ pesquisaId: PESQ, stageId: CAP, rotulo: "Pesquisa / respostas", linhasLidas: 10, vazias: 2 }]);
  });

  it("vale a resposta MAIS RECENTE (decisão 8): maior dia, mesmo se vier antes na planilha", () => {
    const r = rodar((e) => {
      // inverte a posição: a de 20/04 vem ANTES na planilha e ainda vence
      const [, , , velha, nova] = e.respondentes;
      e.respondentes.splice(3, 2, { ...nova!, linha: 4 }, { ...velha!, linha: 5 });
    });
    const sexo = r.dimensoes.find((d) => d.campo === "sexo")!;
    // d@ fica com a resposta de 20/04: Orgânico, faixa A, "feminino"
    expect(r.segmentos.find((s) => s.segmento === "Orgânico")!.n).toBe(2);
    expect(r.faixa.distribuicao.C).toBe(1);
    expect(sexo.total.valores.find((v) => v.rotulo === "Feminino")!.n).toBe(4);
  });

  it("empate de dia ou sem data → a linha de posição posterior vence", () => {
    for (const datas of [["20/04/2026", "20/04/2026"], [null, null], ["20/04/2026", null]] as const) {
      const r = rodar((e) => {
        e.respondentes[3] = { ...e.respondentes[3]!, dataRespostaCru: datas[0] };
        e.respondentes[4] = { ...e.respondentes[4]!, dataRespostaCru: datas[1] };
      });
      expect(r.faixa.distribuicao.A).toBe(2); // a posterior (faixa A) venceu
      expect(r.faixa.distribuicao.C).toBe(1); // só o f@ ("Faixa C")
    }
  });

  it("caso da skill: milhares de linhas, dezenas de respondentes — n de tabela só depois da dedup", () => {
    const r = rodar((e) => {
      const extra: RespostaInput[] = [];
      for (let i = 0; i < 1500; i++) extra.push({ ...e.respondentes[0]!, linha: 100 + i, dataRespostaCru: "16/04/2026" });
      for (let i = 0; i < 400; i++) extra.push({ ...e.respondentes[8]!, linha: 2000 + i });
      for (let i = 0; i < 30; i++) extra.push({ ...e.respondentes[0]!, emailCru: `n${i}@x.com`, linha: 3000 + i });
      e.respondentes.push(...extra);
    });
    expect(r.pesquisa).toMatchObject({ linhasLidas: 1940, vazias: 402, duplicadasRemovidas: 1501, respondentes: 37 });
    for (const d of r.dimensoes) expect(d.total.n).toBe(37);
    expect(r.somas.segmentos).toBe(37);
  });

  it("pesquisa sem coluna de e-mail: cada linha preenchida é um respondente, com lacuna declarada", () => {
    const r = rodar((e) => {
      e.pesquisas = [{ ...pesquisa, temColunaEmail: false }];
      e.respondentes = e.respondentes.map((x) => ({ ...x, emailCru: null }));
    });
    expect(r.pesquisa).toMatchObject({ duplicadasRemovidas: 0, respondentes: 8 });
    expect(r.lacunas.map((l) => l.codigo)).toContain("PESQUISA_SEM_COLUNA_DE_EMAIL");
  });
});

// ---------------------------------------------------------------------------
// AC3
// ---------------------------------------------------------------------------

describe("AC3 — gate de perguntas: só dimensão confirmada e presente", () => {
  it("Religião no DG: a planilha até tem a coluna, mas sem confirmação não entra — e nunca como tabela vazia", () => {
    const r = rodar();
    expect(r.dimensoes.map((d) => d.campo)).not.toContain("religiao");
    expect(r.dimensoesNaoConfirmadas.find((d) => d.campo === "religiao")).toEqual({
      campo: "religiao",
      motivo: "nao-confirmada",
      perguntas: [{ stageId: CAP, chave: null }],
    });
  });

  it("confirmada mas ausente na planilha → ausente-na-pesquisa; coluna 100% vazia → motivo próprio", () => {
    const r = rodar();
    expect(r.dimensoesNaoConfirmadas.find((d) => d.campo === "idade")!.motivo).toBe("ausente-na-pesquisa");
    expect(r.dimensoesNaoConfirmadas.find((d) => d.campo === "profissao")!.motivo).toBe("coluna-100pct-vazia");
  });

  it("Faixa primeiro, depois a ordem de SURVEY_CANONICAL_FIELDS", () => {
    const r = rodar((e) => {
      e.config.perguntasConfirmadas[CAP] = { sexo: "Sexo", faixa: "faixa", religiao: "Religião" };
    });
    expect(r.dimensoes.map((d) => d.campo)).toEqual(["faixa", "sexo", "religiao"]);
    expect(r.dimensoes[0]!.perguntas).toEqual([{ stageId: CAP, chave: "faixa" }]);
  });

  it("série histórica: só a dimensão com resposta no lançamento de comparação", () => {
    const r = rodar();
    expect(r.dimensoes.find((d) => d.campo === "sexo")).toMatchObject({ serieHistorica: true });
    expect(r.dimensoes.find((d) => d.campo === "faixa")).toMatchObject({
      serieHistorica: false,
      serieHistoricaMotivo: "AUSENTE_NO_LANCAMENTO_DE_COMPARACAO",
    });
    // Modo legado do mapeamento: a chave aqui é apelido, mas o cabeçalho é a mesma pergunta do anterior.
    const peloCabecalho = rodar((e) => {
      e.baseAnterior = { ...e.baseAnterior!, chavesDePerguntaComResposta: ["faixa 1", "Sexo"] };
    });
    expect(peloCabecalho.dimensoes.find((d) => d.campo === "faixa")!.serieHistorica).toBe(true);
    const semBase = rodar((e) => {
      e.baseAnterior = null;
    });
    expect(semBase.dimensoes.every((d) => !d.serieHistorica && d.serieHistoricaMotivo === "SEM_LANCAMENTO_DE_COMPARACAO")).toBe(true);
  });

  it("faixa = null explícito (sem A→D, ex.: Netão) ⇒ faixa.aplicavel = false — nunca 'não confirmada'", () => {
    const r = rodar((e) => {
      e.config.perguntasConfirmadas[CAP] = { faixa: null, sexo: "Sexo" };
    });
    expect(r.faixa.aplicavel).toBe(false);
    expect(r.faixa.motivo).toMatch(/^SEM_FAIXA_A_D/);
    expect(r.dimensoesNaoConfirmadas.map((d) => d.campo)).not.toContain("faixa");
    expect(r.criativoXFaixa).toMatchObject({ aplicavel: false, criativos: [] });
    expect(r.faixa.pctAB.valor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC4
// ---------------------------------------------------------------------------

describe("AC4 — segmentação pelo classificador único, dois eixos", () => {
  it("segmentos de aquisição exclusivos, com o balde só-closer próprio: Σ = respondentes", () => {
    const r = rodar();
    expect(r.segmentos).toEqual([
      { segmento: "Pago Quente", n: 1 },
      { segmento: "Pago Frio", n: 1 },
      { segmento: "Pago N/D", n: 1 },
      { segmento: "Orgânico", n: 2 },
      { segmento: "Aquisição não rastreada (só closer)", n: 1 },
      { segmento: "Sem track", n: 1 },
    ]);
    expect(r.somas).toEqual({ segmentos: 7, fechamento: 7, respondentes: 7 });
  });

  it("fechamento é tabela à parte (closer + sem-closer = respondentes) e Closer não é segmento", () => {
    const r = rodar();
    expect(r.fechamento).toEqual({ closer: { n: 1 }, semCloser: { n: 6 } });
    expect(r.segmentos.map((s) => s.segmento)).not.toContain("Closer");
    for (const d of r.dimensoes) {
      expect(d.porFechamento.closer.n + d.porFechamento["sem-closer"].n).toBe(7);
      expect(Object.values(d.porSegmento).reduce((s, t) => s + t.n, 0)).toBe(7);
    }
  });

  it("casamento e-mail → telefone (8 dígitos, .0 de float): a UTM da venda casada classifica", () => {
    const r = rodar();
    expect(r.casamento).toEqual({ porEmail: 3, porTelefone: 1, semMatch: 3 });
    const t = r.tuplasClassificadas.find((x) => x.venda?.medium === "x1")!;
    expect(t).toMatchObject({ lead: { source: null, medium: null }, canal: "Aquisição não rastreada (só closer)", fechamento: "closer" });
  });

  it("% sobre o SEGMENTO INTEIRO (decisão 9): valores + semResposta = 100%", () => {
    const r = rodar();
    const sexo = r.dimensoes.find((d) => d.campo === "sexo")!;
    expect(sexo.total.n).toBe(7);
    expect(sexo.total.valores.map((v) => [v.rotulo, v.n])).toEqual([
      ["Feminino", 4],
      ["Masculino", 1],
    ]);
    expect(sexo.total.semResposta.n).toBe(2);
    expect(sexo.total.valores[0]!.pct.valor).toBeCloseTo((4 / 7) * 100, 10);
    for (const tab of [sexo.total, ...Object.values(sexo.porSegmento), ...Object.values(sexo.porFechamento)]) {
      if (tab.n === 0) continue;
      const soma = tab.valores.reduce((s, v) => s + v.pct.valor!, 0) + tab.semResposta.pct.valor!;
      expect(soma).toBeCloseTo(100, 9);
    }
    // Orgânico: d@ ("feminino") e g@ ("Feminino") — grafias diferentes, um valor só; no empate de
    // grafia vale a que chegou primeiro (`mostCommonRaw` do Resumão).
    expect(sexo.porSegmento["Orgânico"].valores).toMatchObject([{ rotulo: "feminino", n: 2 }]);
  });

  it("classificadorVersao, tuplas com canal + fechamento, lacuna das listas e nenhum segmento Comunidade/Front", () => {
    const r = rodar();
    expect(r.classificadorVersao).toBe(CLASSIFICADOR_VERSAO);
    expect(r.tuplasClassificadas.every((t) => t.canal && t.fechamento && t.segmento)).toBe(true);
    expect(r.lacunas.find((l) => l.codigo === "LISTAS_FRONT_COMUNIDADE")).toMatchObject({ motivo: "sem fonte no Loyola" });
    expect(JSON.stringify(r.segmentos)).not.toMatch(/Comunidade|Front/);
  });

  it("guarda de regressão: o motor não tem lista própria de fonte paga (R-49-2)", () => {
    const fonte = codigoDoMotor();
    expect(fonte).not.toMatch(/PAID_SOURCES|PAID_SOURCES_TERM|PAID_UTM_SOURCES|lead-origin|classifyOrigem|classifyCanal/);
    expect(fonte).not.toMatch(/"(facebook|meta-ads|google-ads|instagram)"/);
  });
});

// ---------------------------------------------------------------------------
// AC5, AC6, AC7
// ---------------------------------------------------------------------------

describe("AC5/AC6 — faixa, cobertura e taxa de resposta", () => {
  it("distribuição sobre a pesquisa inteira deduplicada; semFaixa não é descartado", () => {
    const { faixa } = rodar();
    expect(faixa.distribuicao).toEqual({ A: 2, B: 1, C: 1, D: 1, semFaixa: 1, foraDoPadrao: 1 });
    expect(Object.values(faixa.distribuicao).reduce((s, n) => s + n, 0)).toBe(7);
    expect(faixa).toMatchObject({ volumeAB: 3, volumeD: 1 });
    expect(faixa.pctAB.valor).toBeCloseTo((3 / 7) * 100, 10);
  });

  it("cobertura = compradores de captação com faixa ÷ compradores de captação (as chaves da 49.3)", () => {
    const r = rodar();
    expect(r.compradoresCaptacao.porEmail).toHaveLength(4);
    expect(r.faixa.coberturaDeFaixa).toMatchObject({ numerador: 2, denominador: 4, valor: 50 });
    expect(r.compradoresCaptacao.porEmail.every((k) => /^e:[0-9a-f]{64}$/.test(k))).toBe(true);
  });

  it("taxa de resposta com a memória dos dois números (telefone conta como resposta)", () => {
    expect(rodar().taxaDeResposta).toMatchObject({ numerador: 3, denominador: 4, valor: 75 });
  });

  it("letra da faixa: a planilha decide, o motor não recalcula", () => {
    expect([" a ", "B", "Faixa C", "faixa d", "", "E", "60", null].map(faixaDaCelula)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "semFaixa",
      "foraDoPadrao",
      "foraDoPadrao",
      "semFaixa",
    ]);
  });
});

describe("AC7 — conversão por faixa e por público (denominador = ingresso ∪ combo, R2-1)", () => {
  it("por faixa: Ingresso→Principal e Ingresso→Bump sobre os compradores de captação do recorte", () => {
    const r = rodar();
    const A = r.faixa.conversaoPorFaixa.find((x) => x.faixa === "A")!;
    const B = r.faixa.conversaoPorFaixa.find((x) => x.faixa === "B")!;
    expect(A).toMatchObject({ n: 1, comprouPrincipal: 1, comTierSuperior: 0, amostraBaixa: true });
    expect(A.ingressoPrincipal.valor).toBe(1);
    expect(B).toMatchObject({ n: 1, comprouPrincipal: 0, comTierSuperior: 1 });
    expect(B.ingressoBump.valor).toBe(1);
    expect(r.faixa.conversaoPorFaixa.reduce((s, x) => s + x.n, 0)).toBe(3);
  });

  it("o comprador só de Combo É comprador de captação; o só de order bump NÃO é", () => {
    const r = rodar();
    expect(r.conversaoPorSegmento.find((x) => x.segmento === "Pago Frio")!.n).toBe(1); // b@ (só Combo)
    expect(r.conversaoPorSegmento.find((x) => x.segmento === "Pago N/D")!.n).toBe(0); // c@ (só bump)
  });

  it("amostra abaixo do piso (10) marcada como tendência", () => {
    const r = rodar((e) => {
      for (let i = 0; i < 10; i++) {
        e.respondentes.push({ ...e.respondentes[0]!, emailCru: `q${i}@x.com`, linha: 50 + i });
        e.compradores.push(venda({ email: `q${i}@x.com`, linha: 50 + i, comprouCaptacao: true }));
      }
    });
    const A = r.faixa.conversaoPorFaixa.find((x) => x.faixa === "A")!;
    expect(A).toMatchObject({ n: 11, amostraBaixa: false });
    expect(r.faixa.conversaoPorFaixa.find((x) => x.faixa === "B")!.amostraBaixa).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC8
// ---------------------------------------------------------------------------

describe("AC8 — criativo × faixa em PROPORÇÃO", () => {
  it("só Ad ID numérico longo é criativo; rótulo, macro e vazio ficam em semCriativo — nada some", () => {
    const { criativoXFaixa: c } = rodar();
    expect(c.semCriativo).toEqual({ n: 4, vazio: 1, naoEhAdId: 3 });
    expect(c.somas).toEqual({ criativos: 3, semCriativo: 4, respondentes: 7 });
  });

  it("nome: cache do banco > utm_term > o próprio Ad ID; cópia agrupa com o original", () => {
    const { criativoXFaixa: c } = rodar();
    expect(c.criativos.map((x) => [x.nome, x.origemDoNome, x.adIds, x.n])).toEqual([
      ["dg-pg02-ia-01", "cache", [AD1, AD3], 2],
      ["dg-pg02-h-02", "utm_term", [AD2], 1],
    ]);
    const semNome = rodar((e) => {
      e.criativos.nomesDeAnuncio = {};
      e.respondentes[1] = { ...e.respondentes[1]!, utm: { source: "fb", term: "cold" } };
    });
    expect(semNome.criativoXFaixa.criativos.find((x) => x.adIds.includes(AD2))).toMatchObject({
      nome: AD2,
      nomeNaoResolvido: true,
      origemDoNome: "ad_id",
    });
  });

  it("proporção, não contribuição absoluta: o criativo pequeno e qualificado não some atrás do grande", () => {
    const r = rodar((e) => {
      const grande = Array.from({ length: 40 }, (_, i) => ({
        ...e.respondentes[0]!,
        emailCru: `g${i}@x.com`,
        linha: 100 + i,
        utmContentCru: AD1,
        respostas: { faixa: i < 8 ? "A" : "D", Sexo: null, "Profissão": null, "Religião": null },
      }));
      e.respondentes.push(...grande);
    });
    const [ia, h] = r.criativoXFaixa.criativos;
    expect(ia!.n).toBe(42); // ordem por n, não por "melhor"
    expect(ia!.pctAB.valor).toBeCloseTo((9 / 42) * 100, 10);
    expect(h!.pctAB.valor).toBe(100);
    for (const x of r.criativoXFaixa.criativos) {
      expect(x.pctAB.valor! + x.pctCD.valor! + x.pctSemFaixa.valor!).toBeCloseTo(100, 9);
    }
  });

  it("link do Ads Manager com o Ad ID de maior volume; sem conta → null", () => {
    const r = rodar();
    expect(r.criativoXFaixa.criativos[0]!.linkAdsManager).toBe(
      `https://adsmanager.facebook.com/adsmanager/manage/ads?act=3717530711643512&selected_ad_ids=${AD1}`,
    );
    expect(linkDoAdsManager("act_123", "120237479668260208")).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/ads?act=123&selected_ad_ids=120237479668260208",
    );
    expect(linkDoAdsManager(null, AD1)).toBeNull();
    expect(linkDoAdsManager("123", "org")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC9
// ---------------------------------------------------------------------------

describe("AC9 — tipo de criativo pela convenção do expert", () => {
  it("ia-humano (DG): -ia- / -h- / demais = card; as duas marcas = conflito", () => {
    expect(["dg-pg02-ia-01", "dg-pg02-h-02", "card-oferta", "dg-ia-h-03"].map((n) => tipoPeloNome(n, "ia-humano"))).toEqual([
      "ia",
      "humano",
      "card-estatico",
      "ambiguo",
    ]);
  });

  it("video-estatico (FZ): v## = vídeo, demais = estático; pista da campanha (--videos/--estaticos)", () => {
    expect(["V01 - hook", "c03", "ad12", "depoimento"].map((n) => tipoPeloNome(n, "video-estatico"))).toEqual([
      "video",
      "estatico",
      "estatico",
      "estatico",
    ]);
    expect(tipoPelaCampanha("fz-l2--vendas-captacao--2026-06-01--hot--cbo--videos", "video-estatico")).toBe("video");
    expect(tipoPelaCampanha("fz-l1--leads--hot--lpa--cbo--estáticos", "video-estatico")).toBe("estatico");
    expect(tipoPelaCampanha("fz-l1--leads--hot", "video-estatico")).toBeNull();
  });

  it("divergência nome × campanha vai para conflitosDeTipo, não é resolvida em silêncio", () => {
    const r = rodar((e) => {
      e.config.dimensaoDeCriativo = "video-estatico";
      e.criativos.nomesDeAnuncio = { [AD1]: "v01-hook", [AD3]: "v01-hook - Cópia" };
      e.criativos.anuncios = [{ ...e.criativos.anuncios[0]!, adName: "v01-hook", campaignName: "fz--vendas-captacao--cbo--estaticos" }];
    });
    expect(r.tipoDeCriativo.conflitosDeTipo).toEqual([
      {
        adId: AD1,
        adName: "v01-hook",
        campaignName: "fz--vendas-captacao--cbo--estaticos",
        pistaDoNome: "video",
        pistaDaCampanha: "estatico",
        motivo: "NOME_X_CAMPANHA",
      },
    ]);
    expect(r.criativoXFaixa.criativos.find((c) => c.adIds.includes(AD1))!.tipo).toBe("conflito");
    expect(r.tipoDeCriativo.ressalvas).toEqual([]);
  });

  it("por tipo: faixa sempre; CTR/CPC por link_click e custo com imposto UMA vez (nunca o fator fixo da skill)", () => {
    const { tipoDeCriativo: t } = rodar();
    const ia = t.tipos.find((x) => x.tipo === "ia")!;
    const inv = 100 / (1 - 0.1215);
    expect(ia).toMatchObject({ criativos: 1, respondentes: 2, linkClicks: 50, impressoes: 1000 });
    expect(ia.pctAB.valor).toBe(50);
    expect(ia.investimentoComImposto.valor).toBeCloseTo(inv, 9);
    expect(ia.investimentoComImposto.valor).not.toBeCloseTo(113, 0);
    expect(ia.ctr.valor).toBeCloseTo(5, 10);
    expect(ia.cpc.valor).toBeCloseTo(inv / 50, 9);
    expect(ia.ingressos.valor).toBe(1);
    expect(ia.conversaoCliqueIngresso.valor).toBeCloseTo(2, 10);
    expect(ia.custoPorIngresso.valor).toBeCloseTo(inv, 9);
    expect(t.ressalvas).toEqual(["COPY_NAO_PAREADA"]);
  });

  it("link_click ausente é null, não 0", () => {
    const humano = rodar().tipoDeCriativo.tipos.find((x) => x.tipo === "humano")!;
    expect(humano.linkClicks).toBeNull();
    expect(humano.ctr).toMatchObject({ valor: null, motivo: "LINK_CLICK_AUSENTE" });
    expect(humano.conversaoCliqueIngresso).toMatchObject({ valor: null, motivo: "LINK_CLICK_AUSENTE" });
  });

  it("sem ad-level (PG02): campos de mídia null com SEM_AD_LEVEL; a faixa por tipo segue", () => {
    const r = rodar((e) => {
      e.criativos.anuncios = [];
    });
    const ia = r.tipoDeCriativo.tipos.find((x) => x.tipo === "ia")!;
    expect(ia.ctr).toMatchObject({ valor: null, motivo: "SEM_AD_LEVEL" });
    expect(ia.investimentoComImposto.motivo).toBe("SEM_AD_LEVEL");
    expect(ia.pctAB.valor).toBe(50);
    expect(r.lacunas.map((l) => l.codigo)).toContain("SEM_AD_LEVEL");
  });

  it("dimensão 'nenhuma' ⇒ aplicavel = false e nenhum tipo exibido", () => {
    const r = rodar((e) => {
      e.config.dimensaoDeCriativo = "nenhuma";
    });
    expect(r.tipoDeCriativo).toMatchObject({ aplicavel: false, tipos: [], ressalvas: [] });
    expect(r.criativoXFaixa.criativos.every((c) => c.tipo === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC10
// ---------------------------------------------------------------------------

describe("AC10 — cross-launch (e-mail ∪ telefone)", () => {
  it("retorno da base: leads do anterior que compraram agora ÷ leads do anterior (únicos)", () => {
    const { crossLaunch: c } = rodar();
    expect(c).toMatchObject({ aplicavel: true, tipoDaBase: "leads+compradores", leadsAnteriores: 3, compradoresAnteriores: 1 });
    expect(c.retornoDaBase).toMatchObject({ numerador: 2, denominador: 3 }); // a@ (e-mail) e o telefone do e2@
    expect(c.retornoDaBasePrincipal).toMatchObject({ numerador: 1, denominador: 3 });
  });

  it("já em base anterior: compradores do destino presentes na base, para captação e principal", () => {
    const { crossLaunch: c } = rodar();
    expect(c.jaEmBaseAnterior.captacao).toMatchObject({ numerador: 3, denominador: 4, valor: 75 });
    expect(c.jaEmBaseAnterior.principal).toMatchObject({ numerador: 1, denominador: 1, valor: 100 });
  });

  it("base só de compradores: retorno não medido, lacuna BASE_ANTERIOR_SEM_LEADS declarada", () => {
    const r = rodar((e) => {
      e.baseAnterior = { ...e.baseAnterior!, tipo: "compradores", leads: [] };
    });
    expect(r.crossLaunch.retornoDaBase).toMatchObject({ valor: null, motivo: "BASE_ANTERIOR_SEM_LEADS" });
    expect(r.crossLaunch.jaEmBaseAnterior.captacao).toMatchObject({ numerador: 1, denominador: 4 }); // só b@
    expect(r.lacunas.map((l) => l.codigo)).toContain("BASE_ANTERIOR_SEM_LEADS");
  });

  it("sem lançamento de comparação ⇒ aplicavel = false, sem zeros inventados", () => {
    const r = rodar((e) => {
      e.baseAnterior = null;
    });
    expect(r.crossLaunch).toMatchObject({ aplicavel: false, leadsAnteriores: null, compradoresAnteriores: null });
    expect(r.crossLaunch.retornoDaBase.valor).toBeNull();
  });
});
