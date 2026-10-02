/**
 * Story 49.5 — guardas do Debriefing (Fase 12 como código).
 *
 * `payloadMinimo()` é o que os motores REAIS (49.3 e 49.4) geram sobre uma
 * entrada sintética sem PII; cada invariante tem 1 positivo e ao menos 1
 * negativo por mutação mínima dele. Cada alerta: dispara e some.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACOES_FASE12,
  CODIGOS_INVARIANTE_FASE12,
  DebriefingInvarianteVioladoError,
  assertDebriefing,
  validateDebriefing,
  type CodigoAlertaFase12,
  type CodigoInvarianteFase12,
} from "../services/debriefing-guards.js";
import { ConferenciaExternaError } from "../services/launch-report-guards.js";
import { DEBRIEFING_PAYLOAD_VERSAO, montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { CAP, GERADO_EM, PRIN, configSintetica, payloadMinimo } from "./fixtures/debriefing-payload-sintetico.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

const status = (p: DebriefingPayload, codigo: CodigoInvarianteFase12) =>
  validateDebriefing(p).invariantes.find((i) => i.codigo === codigo)!;
const alerta = (p: DebriefingPayload, codigo: CodigoAlertaFase12) =>
  validateDebriefing(p).alertas.find((a) => a.codigo === codigo);
const mutado = (f: (p: DebriefingPayload) => void): DebriefingPayload => {
  const p = payloadMinimo();
  f(p);
  return p;
};

// ---------------------------------------------------------------------------
// AC1 — contrato
// ---------------------------------------------------------------------------

describe("AC1 — payload único e validação pura", () => {
  it("montarPayloadDebriefing devolve o contrato com discriminador, versão e geradoEm injetado", () => {
    const p = payloadMinimo();
    expect(p.tipo).toBe("lancamento");
    expect(p.versao).toBe(DEBRIEFING_PAYLOAD_VERSAO);
    expect(p.geradoEm).toBe(GERADO_EM);
    expect(p.config.stageId).toBe(CAP);
    expect(p.textos).toBeUndefined();
    expect(p.dinheiroTempo.versao).toBe(1);
    expect(p.publico.versao).toBe(1);
  });

  it("lacunas = união deduplicada por código (LISTAS_FRONT_COMUNIDADE vem dos dois motores e aparece uma vez)", () => {
    const p = payloadMinimo();
    const listas = p.lacunas.filter((l) => l.codigo === "LISTAS_FRONT_COMUNIDADE");
    expect(listas).toHaveLength(1);
    expect(listas[0]!.origem).toEqual(["dinheiroTempo", "publico"]);
    const codigos = p.lacunas.map((l) => l.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("geradoEm é obrigatório e válido; Date é aceito e vira ISO", () => {
    const p = payloadMinimo();
    expect(() => montarPayloadDebriefing(p.dinheiroTempo, p.publico, configSintetica(), "ontem")).toThrow(RangeError);
    const iso = montarPayloadDebriefing(p.dinheiroTempo, p.publico, configSintetica(), new Date(GERADO_EM)).geradoEm;
    expect(iso).toBe(GERADO_EM);
  });

  it("composição e guardas não leem relógio nem fazem I/O (teste estático)", () => {
    for (const arq of ["debriefing-payload.ts", "debriefing-guards.ts", "debriefing-fixture-compare.ts"]) {
      const src = readFileSync(join(AQUI, "../services", arq), "utf8");
      expect(src, arq).not.toMatch(/Date\.now|new Date\(\)|Math\.random|from "(node:)?fs"|readSheetData|\bdb\./);
    }
  });

  it("o payload sintético passa nas 15 invariantes, sem bloquear", () => {
    const r = validateDebriefing(payloadMinimo());
    expect(r.invariantes.map((i) => i.codigo)).toEqual([...CODIGOS_INVARIANTE_FASE12]);
    expect(r.invariantes.filter((i) => i.status !== "passed")).toEqual([]);
    expect(r.bloqueado).toBe(false);
    expect(r.violacoes).toEqual([]);
    expect(() => assertDebriefing(payloadMinimo())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC2 — F1..F15: positivo + negativo(s)
// ---------------------------------------------------------------------------

type Caso = [string, CodigoInvarianteFase12, (p: DebriefingPayload) => void];

const NEGATIVOS: Caso[] = [
  ["dedup: antes − depois ≠ removidas", "F1", (p) => void (p.dinheiroTempo.dedup.camada1.removidas = 0)],
  ["faturamento dobrado em UM caminho de soma (por tipo)", "F1", (p) => void (p.dinheiroTempo.faturamentoPorTipo.ingresso += 99)],
  ["(txId, produto) repetido na auditoria", "F1", (p) => void p.dinheiroTempo.auditoriaDeVendas.push({ ...p.dinheiroTempo.auditoriaDeVendas[0]! })],
  [
    "venda excluída aparece na auditoria",
    "F1",
    (p) => void (p.dinheiroTempo.auditoriaDeVendas[0]!.txId = p.dinheiroTempo.vendasExcluidas[0]!.txId),
  ],
  ["TMB com valor dentro do faturamento", "F2", (p) => void (p.dinheiroTempo.auditoriaDeVendas.find((a) => a.tmb)!.valorConsiderado = 3500)],
  ["TMB sem sinalização", "F2", (p) => void (p.dinheiroTempo.tmb.sinalizado = false)],
  ["memória do principal sem o texto de TMB", "F2", (p) => void (p.dinheiroTempo.faturamentoPrincipal.memoria = "Σ vendas")],
  ["critério headline porEmailOuTelefone", "F3", (p) => void (p.dinheiroTempo.criterioDeUnico = "porEmailOuTelefone")],
  ["Σ ingressos por canal ≠ ingressosUnicos", "F3", (p) => void (p.dinheiroTempo.tabela1.canais[0]!.ingressos += 1)],
  ["closer + semCloser (ingressos) ≠ ingressosUnicos", "F3", (p) => void (p.dinheiroTempo.tabela1.fechamento.closer.ingressos += 1)],
  ["Motor II leu outro conjunto de compradores", "F3", (p) => void p.publico.compradoresCaptacao.porEmail.pop()],
  ["Σ vendas do principal por canal ≠ vendasPrincipal", "F4", (p) => void (p.dinheiroTempo.tabela1.canais[0]!.vendas += 1)],
  ["closer + semCloser (vendas) ≠ vendasPrincipal", "F4", (p) => void (p.dinheiroTempo.tabela1.fechamento.semCloser.vendas -= 1)],
  ["canal Front na Tabela 1", "F5", (p) => void (p.dinheiroTempo.tabela1.canais[1]!.canal = "Front" as never)],
  ["canal Closer na Tabela 1", "F5", (p) => void (p.dinheiroTempo.tabela1.canais[1]!.canal = "Closer" as never)],
  ["classificadorVersao diferente entre os motores", "F6", (p) => void (p.publico.classificadorVersao = "outra")],
  [
    "a mesma tupla com dois rótulos de fechamento",
    "F6",
    (p) => {
      const t = p.dinheiroTempo.tuplasClassificadas[0]!;
      p.publico.tuplasClassificadas.push({ ...t, fechamento: t.fechamento === "closer" ? "sem-closer" : "closer", segmento: "Sem track" });
    },
  ],
  ["coorte pela data da venda", "F7", (p) => void ((p.dinheiroTempo.coorte as { baseDeData: string }).baseDeData = "venda")],
  ["buckets da coorte não somam as vendas do principal", "F7", (p) => void (p.dinheiroTempo.coorte.naCoorte -= 1)],
  ["vendas brutas ≠ vendas + excluídas", "F7", (p) => void (p.dinheiroTempo.vendasPrincipalBrutas += 1)],
  ["roasCaptacao ≠ faturamento ÷ investimento", "F8", (p) => void (p.dinheiroTempo.roasCaptacao.valor = 1.74)],
  ["numerador do ROAS total sem o downsell", "F8", (p) => void (p.dinheiroTempo.roasTotalSemTmb.decomposicao.principal -= 1)],
  ["veredito da tese incoerente", "F8", (p) => void (p.dinheiroTempo.teseOrderBump.veredito = "confirmada")],
  ["respondentes ≠ linhas − vazias − repetidas", "F9", (p) => void (p.publico.pesquisa.respondentes += 1)],
  ["dimensão exibida sem pergunta confirmada", "F9", (p) => void (p.config.perguntasConfirmadas[CAP] = { faixa: "faixa" })],
  ["segmentos não exclusivos", "F9", (p) => void (p.publico.segmentos[0]!.n += 1)],
  ["datas fora de ordem", "F10", (p) => void (p.config.datasChave.aberturaCarrinho = "2026-04-01")],
  ["etapa de downsell sem downsell.houve", "F10", (p) => void p.config.etapas.push({ stageId: "s-down", papel: "vendas-downsell" })],
  ["reabertura sem resposta explícita", "F10", (p) => void ((p.config.datasChave as { reabertura: unknown }).reabertura = null)],
  ["lacuna VENDAS_SEM_DATA ausente", "F11", (p) => void (p.lacunas = p.lacunas.filter((l) => l.codigo !== "VENDAS_SEM_DATA"))],
  ["lacuna de dimensão não confirmada sem o campo", "F11", (p) => void (p.lacunas.find((l) => l.codigo === "DIMENSAO_NAO_CONFIRMADA")!.itens = ["idade"])],
  [
    "49.11: DESEMPATE_SEM_PESQUISA_DE_CAPTACAO ausente",
    "F11",
    (p) => {
      p.publico.pesquisa.porPesquisa.push({ pesquisaId: "pesq-2", stageId: CAP, rotulo: "outra", linhasLidas: 0, vazias: 0 });
      p.publico.pesquisa.duplicadasSemData = 1;
    },
  ],
  [
    "imposto aplicado duas vezes num dia",
    "F12",
    (p) => {
      const d = p.dinheiroTempo.midia.midiaDiariaPorEtapa[0]!;
      d.comImposto /= 1 - 0.1215;
    },
  ],
  ["investimento da etapa sem o imposto", "F12", (p) => void (p.dinheiroTempo.midia.porEtapa[CAP]!.investimentoComImposto = p.dinheiroTempo.midia.porEtapa[CAP]!.investimentoBruto)],
  ["quente + frio + indefinido ≠ INV", "F12", (p) => void (p.dinheiroTempo.midia.porGrupo.captacao.quenteFrio.INV_FRIO += 10)],
  ["CTR por cliques totais", "F13", (p) => void (p.dinheiroTempo.midia.porEtapa[CAP]!.ctr.valor = 3.1)],
  ["sem link_click e CPC 0", "F13", (p) => void (p.dinheiroTempo.midia.porEtapa[PRIN]!.cpc.valor = 0)],
  [
    "produto da captação que o default não resolve",
    "F14",
    (p) => void p.dinheiroTempo.produtosNaoClassificados.push({ produto: "Pacote", vendas: 2, faturamento: 594, tiposAssumidos: ["principal"] }),
  ],
  ["valor já parseado", "F15", (p) => void ((p.dinheiroTempo.origemDoValor as Record<string, string>).principal = "ja-parseado")],
];

describe("AC2 — invariantes F1–F15", () => {
  it.each(CODIGOS_INVARIANTE_FASE12.map((c) => [c]))("%s passa no payload dos motores reais", (codigo) => {
    expect(status(payloadMinimo(), codigo).status).toBe("passed");
  });

  it.each(NEGATIVOS)("%s → %s falha", (_nome, codigo, mutar) => {
    const r = validateDebriefing(mutado(mutar));
    const inv = r.invariantes.find((i) => i.codigo === codigo)!;
    expect(inv.status).toBe("failed");
    expect(inv.acao).toBe(ACOES_FASE12[codigo]);
    expect(r.bloqueado).toBe(true);
  });

  it("todo invariante tem ao menos um negativo", () => {
    const cobertos = new Set(NEGATIVOS.map(([, c]) => c));
    expect([...CODIGOS_INVARIANTE_FASE12].filter((c) => !cobertos.has(c))).toEqual([]);
    expect(NEGATIVOS.length + CODIGOS_INVARIANTE_FASE12.length).toBeGreaterThanOrEqual(30);
  });

  it("F14: produto fora do mapa que o default da etapa paga resolve como ingresso PASSA (regra do painel) e é listado", () => {
    const p = payloadMinimo();
    expect(p.dinheiroTempo.produtosNaoClassificados.map((x) => x.produto)).toEqual(["Produto Novo"]);
    const f14 = status(p, "F14");
    expect(f14.status).toBe("passed");
    expect(f14.detalhe).toContain("Produto Novo");
  });

  it("F12: a recomposição é por dia — dia anterior ao corte (2026-01-01) não leva gross-up", () => {
    const p = mutado((x) => {
      const d = x.dinheiroTempo.midia.midiaDiariaPorEtapa.find((m) => m.stageId === PRIN)!;
      d.dia = "2025-12-31";
      d.comImposto = d.bruto;
      const e = x.dinheiroTempo.midia.porEtapa[PRIN]!;
      const delta = e.investimentoComImposto - d.bruto;
      e.investimentoComImposto = d.bruto;
      e.quenteFrio.INV -= delta;
      e.quenteFrio.INV_QUENTE -= delta;
      for (const g of [x.dinheiroTempo.midia.porGrupo.principal]) {
        g.investimentoComImposto -= delta;
        g.quenteFrio.INV -= delta;
        g.quenteFrio.INV_QUENTE -= delta;
      }
      x.dinheiroTempo.midia.investimentoTotal.valor! -= delta;
    });
    expect(status(p, "F12").status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// AC1/T2.2 — skipped ≠ passed; AC3 — 422
// ---------------------------------------------------------------------------

describe("skipped nunca é passed (F8 sem captação paga)", () => {
  it("captação gratuita: F8 skipped, não bloqueia, não conta como passed", () => {
    const p = mutado((x) => {
      const m = x.dinheiroTempo;
      m.captacao.aplicavel = false;
      for (const r of [m.roasSoIngresso, m.roasCaptacao]) {
        r.valor = null;
        r.motivo = "CAPTACAO_GRATUITA: etapa de captação sem planilha de venda/ingresso";
      }
      m.teseOrderBump = { roasSoIngresso: null, roasCaptacao: null, veredito: "indefinida" };
    });
    const r = validateDebriefing(p);
    const f8 = r.invariantes.find((i) => i.codigo === "F8")!;
    expect(f8.status).toBe("skipped");
    expect(f8.status).not.toBe("passed");
    expect(r.bloqueado).toBe(false);
  });

  it("ROAS nulo SEM motivo falha (não vira skipped)", () => {
    const p = mutado((x) => {
      x.dinheiroTempo.roasSoIngresso.valor = null;
      delete x.dinheiroTempo.roasSoIngresso.motivo;
    });
    expect(status(p, "F8").status).toBe("failed");
  });
});

describe("AC3 — 422 acionável", () => {
  it("com mais de uma falha, codigo é o primeiro na ordem F1→F15 e violacoes traz todas", () => {
    const p = mutado((x) => {
      x.dinheiroTempo.midia.porGrupo.captacao.quenteFrio.INV_FRIO += 10; // F12
      x.dinheiroTempo.tabela1.fechamento.closer.ingressos += 1; // F3
    });
    let erro: unknown;
    try {
      assertDebriefing(p);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DebriefingInvarianteVioladoError);
    const corpo = (erro as DebriefingInvarianteVioladoError).toResponse();
    expect(corpo.erro).toBe("INVARIANTE_VIOLADO");
    expect(corpo.codigo).toBe("F3");
    expect(corpo.violacoes.map((v) => v.codigo)).toEqual(["F3", "F12"]);
    expect(corpo.acao).toBe(ACOES_FASE12.F3);
    expect(Object.keys(corpo).sort()).toEqual(["acao", "codigo", "detalhe", "erro", "violacoes"]);
  });

  it("o detalhe do F8 traz os dois lados da conta com os valores reais", () => {
    const f8 = status(mutado((x) => void (x.dinheiroTempo.roasCaptacao.valor = 1.74)), "F8");
    expect(f8.detalhe).toMatch(/roasCaptacao do payload \(1,740000\) ≠ faturamentoCaptacao ÷ investimentoCaptacao \(2,801585\)/);
  });

  it("as 15 ações são distintas, específicas e nunca 'verifique os dados'", () => {
    const acoes = Object.values(ACOES_FASE12);
    expect(acoes).toHaveLength(15);
    expect(new Set(acoes).size).toBe(15);
    for (const a of acoes) {
      expect(a.length).toBeGreaterThan(60);
      expect(a.toLowerCase()).not.toContain("verifique os dados");
    }
  });
});

// ---------------------------------------------------------------------------
// AC4 — alertas WF1..WF9: disparam e somem, nunca bloqueiam
// ---------------------------------------------------------------------------

describe("AC4 — alertas WF1–WF9", () => {
  const limpo = () =>
    mutado((p) => {
      const m = p.dinheiroTempo;
      m.midia.porEtapa[PRIN]!.linkClicks = 0; // some o WF5 (0 cliques ≠ ausente)
      m.midia.porEtapa[PRIN]!.cpc.valor = null;
      m.midia.porEtapa[PRIN]!.ctr.valor = 0;
      for (const d of m.roasDiarioCaptacao) d.picoArtefato = false;
      m.limiarPicoArtefato.limiarPicoArtefato = null;
      m.coorte.foraDaCoorte = [];
      m.vendasExcluidas = [];
      p.publico.dimensoesNaoConfirmadas = [];
      for (const l of p.publico.faixa.conversaoPorFaixa) l.amostraBaixa = false;
      for (const l of p.publico.conversaoPorSegmento) l.amostraBaixa = false;
      p.publico.tipoDeCriativo.adLevel = { aplicavel: true, linhas: 1 };
    });

  it("payload sem gatilho: nenhum alerta", () => {
    expect(validateDebriefing(limpo()).alertas).toEqual([]);
  });

  const DISPAROS: [CodigoAlertaFase12, (p: DebriefingPayload) => void, RegExp][] = [
    [
      "WF1",
      (p) =>
        void p.dinheiroTempo.pendencias.push({ codigo: "CAMPANHA_SEM_FASE", detalhe: "x", campaignId: "c9", campaignName: "campanha-solta", investimentoComImposto: 12.5 }),
      /1 campanha\(s\).*campanha-solta \(CAMPANHA_SEM_FASE, R\$ 12,50\)/,
    ],
    ["WF2", (p) => void (p.dinheiroTempo.higiene.precoDistintoPorProduto["Imersão"] = 16), /Imersão \(16\)/],
    [
      "WF3",
      (p) => {
        p.dinheiroTempo.higiene.linhasConvertidas = 3;
        p.dinheiroTempo.lacunas.push({ codigo: "PRECO_ORIGINAL_NAO_MAPEADO", motivo: "x", detalhe: "3 linha(s); produtos: Imersão" });
        p.lacunas.push({ codigo: "PRECO_ORIGINAL_NAO_MAPEADO", motivo: "x", origem: ["dinheiroTempo"] });
      },
      /3 linha\(s\).*produtos: Imersão/,
    ],
    ["WF4", (p) => void (p.publico.taxaDeResposta = { ...p.publico.taxaDeResposta, valor: 50, numerador: 2, denominador: 4 }), /50,00% \(2 de 4/],
    [
      "WF5",
      (p) => {
        p.dinheiroTempo.midia.porEtapa[PRIN]!.linkClicks = null;
        p.dinheiroTempo.midia.porEtapa[PRIN]!.ctr.valor = null;
      },
      /stage-prin \(vendas-principal/,
    ],
    ["WF6", (p) => void (p.dinheiroTempo.roasDiarioCaptacao[2]!.picoArtefato = true), /1 dia\(s\).*D\+5 \(2026-04-22/],
    [
      "WF7",
      (p) => void p.dinheiroTempo.coorte.alemDaJanela.push({ txId: "T99", produto: "Mentoria", valor: 4000, dataBrt: "2026-06-29", fonte: "planilha", dMais: 50 }),
      /além da janela 1 \(R\$ 4\.000,00\)/,
    ],
    ["WF8", (p) => void (p.publico.faixa.distribuicao.semFaixa = 2), /2 respondente\(s\) sem faixa/],
    [
      "WF9",
      (p) =>
        void p.publico.tipoDeCriativo.conflitosDeTipo.push({ adId: "1", adName: "ad-x", campaignName: null, pistaDoNome: "ia", pistaDaCampanha: "humano", motivo: "NOME_X_CAMPANHA" }),
      /1 criativo\(s\) com conflito de tipo: ad-x/,
    ],
  ];

  it.each(DISPAROS)("%s dispara com valores concretos e não bloqueia", (codigo, disparar, mensagem) => {
    const p = limpo();
    disparar(p);
    const r = validateDebriefing(p);
    const a = r.alertas.find((x) => x.codigo === codigo);
    expect(a?.mensagem).toMatch(mensagem);
    expect(a!.quantidade).toBeGreaterThan(0);
    expect(r.alertas.map((x) => x.codigo)).toEqual([codigo]);
    // O alerta não entra no bloqueio: as violações são as mesmas do payload sem o gatilho.
    const base = validateDebriefing(limpo());
    expect(r.violacoes.map((v) => v.codigo)).toEqual(base.violacoes.map((v) => v.codigo));
    expect(r.bloqueado).toBe(base.bloqueado);
  });

  it("o payload sintético dispara WF5, WF6, WF7, WF8 e WF9 sem bloquear", () => {
    const r = validateDebriefing(payloadMinimo());
    expect(r.alertas.map((a) => a.codigo)).toEqual(["WF5", "WF6", "WF7", "WF8", "WF9"]);
    expect(r.bloqueado).toBe(false);
  });

  it("WF8 não lista recorte vazio (n = 0) como amostra baixa", () => {
    expect(alerta(payloadMinimo(), "WF8")!.mensagem).not.toMatch(/\(n=0\)/);
  });

  it("WF7 aparece com SÓ vendas excluídas (sem além da janela nem fora da coorte) — decisão 7 (TEST-002 do QA, QA-M5)", () => {
    const p = mutado((q) => {
      const m = q.dinheiroTempo;
      m.coorte.alemDaJanela = [];
      m.coorte.foraDaCoorte = [];
      m.vendasExcluidas = m.vendasExcluidas.slice(0, 1);
    });
    expect(p.dinheiroTempo.vendasExcluidas).toHaveLength(1);
    const wf7 = alerta(p, "WF7");
    expect(wf7?.quantidade).toBe(1);
    expect(wf7?.mensagem).toMatch(/excluídas automaticamente antes da abertura 1 \(/);
  });
});

// ---------------------------------------------------------------------------
// AC5 — conferência externa
// ---------------------------------------------------------------------------

describe("AC5 — conferência externa (LIMIAR_CONFERENCIA)", () => {
  const inv = () => payloadMinimo().dinheiroTempo.midia.investimentoTotal.valor!;

  it("sem investimentoOficial: skipped, nunca derivado de outra fonte", () => {
    const r = validateDebriefing(payloadMinimo());
    expect(r.conferencia.status).toBe("skipped");
    expect(r.conferencia.investimentoOficial).toBeNull();
  });

  it("delta ≤ 0,05% passa; entre 0,05% e 0,5% alerta; acima de 0,5% bloqueia", () => {
    expect(validateDebriefing(payloadMinimo(), { investimentoOficial: inv() * 1.0004 }).conferencia.status).toBe("passed");
    const alertaR = validateDebriefing(payloadMinimo(), { investimentoOficial: inv() * 1.004 });
    expect(alertaR.conferencia.status).toBe("alerta");
    expect(alertaR.bloqueado).toBe(false);
    const falha = validateDebriefing(payloadMinimo(), { investimentoOficial: inv() * 1.006 });
    expect(falha.conferencia.status).toBe("failed");
    expect(falha.bloqueado).toBe(true);
    expect(() => assertDebriefing(payloadMinimo(), { investimentoOficial: inv() * 1.006 })).toThrow(ConferenciaExternaError);
  });
});
