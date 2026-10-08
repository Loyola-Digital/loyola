/**
 * Story 49.11 — Motor II do Debriefing (público): série histórica com a LISTA
 * de lançamentos de comparação (AC8) e o desempate sem data pela pesquisa de
 * captação marcada (AC10 d, decisão do dono R6-7).
 *
 * Fixtures sintéticas, sem PII real (`fixtures/debriefing-audience-serie.ts`).
 * Cada regra tem um teste que cai se ela for revertida: série por "todos"
 * (não "qualquer"), `lancamentosAusentes` nomeando o certo, n = 1 idêntico ao
 * payload de antes (golden gravado com o motor da `main`), cross-launch só com
 * a principal, desempate pela pesquisa marcada em qualquer ordem de leitura e
 * a lacuna quando a etapa tem 2+ pesquisas sem marca.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeDebriefingAudience,
  desempatarResposta,
  qualificarSerie,
  type DebriefingAudience,
  type SerieDeComparacaoInput,
} from "../services/debriefing-audience-engine.js";
import {
  CAP,
  PESQ,
  PESQ_ALUNOS,
  entradaDeSerie,
  pesquisaPrincipal,
  resp,
  type EntradaDeSerie,
} from "./fixtures/debriefing-audience-serie.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const GOLDEN_N1 = join(AQUI, "fixtures", "debriefing-audience-n1.golden.json");

const F1 = "funil-pg01";
const F2 = "funil-pg02";
const F3 = "funil-pg03";

const rodar = (mut?: (e: EntradaDeSerie) => void): DebriefingAudience => {
  const e = entradaDeSerie();
  mut?.(e);
  return computeDebriefingAudience(e);
};

/** Payload sem os campos que a 49.11 ACRESCENTA (os de antes ficam byte a byte). */
function semAcrescimos49_11(r: DebriefingAudience): unknown {
  const resto: Partial<DebriefingAudience> = { ...r };
  delete resto.serieHistorica;
  // 49.18 acrescenta a mídia por anúncio (aditiva); o resto segue byte a byte.
  delete resto.midiaPorAnuncio;
  // 49.20 acrescenta ao cross-launch as chaves (hash) da recompra; o resto do cross-launch segue byte a byte.
  if (r.crossLaunch.compradoresNaBaseAnterior) {
    const cl: Partial<DebriefingAudience["crossLaunch"]> = { ...r.crossLaunch };
    delete cl.compradoresNaBaseAnterior;
    resto.crossLaunch = cl as DebriefingAudience["crossLaunch"];
  }
  // 49.19 acrescenta o teste de LP (aditivo).
  delete resto.testeDeLp;
  const pesquisa: Partial<DebriefingAudience["pesquisa"]> = { ...r.pesquisa };
  delete pesquisa.duplicadasSemData;
  delete pesquisa.duplicadasDecididasPelaPesquisaDeCaptacao;
  // 49.6 R7-9 acrescenta `linkDoPost` a cada criativo; o resto do criativo segue byte a byte.
  const criativoXFaixa = {
    ...r.criativoXFaixa,
    criativos: r.criativoXFaixa.criativos.map((c) => {
      const semPost: Partial<typeof c> = { ...c };
      delete semPost.linkDoPost;
      return semPost;
    }),
  };
  return { ...resto, pesquisa, criativoXFaixa };
}

const dim = (r: DebriefingAudience, campo: string) => r.dimensoes.find((d) => d.campo === campo)!;

/** Três lançamentos de comparação, na ordem F1 (principal), F2, F3. */
function tres(f2: SerieDeComparacaoInput["chavesDePerguntaComResposta"], f3: SerieDeComparacaoInput["chavesDePerguntaComResposta"]) {
  return (e: EntradaDeSerie) => {
    e.seriesDeComparacao = [
      { funnelId: F1, nome: "dg-pg01", chavesDePerguntaComResposta: e.baseAnterior!.chavesDePerguntaComResposta },
      { funnelId: F2, nome: "dg-pg02", chavesDePerguntaComResposta: f2 },
      { funnelId: F3, nome: "dg-pg03", chavesDePerguntaComResposta: f3 },
    ];
    e.baseAnterior = { ...e.baseAnterior!, funnelId: F1 };
  };
}

// ---------------------------------------------------------------------------
// AC8 (g) / AC11 (e) — n = 1 é o payload de antes
// ---------------------------------------------------------------------------

describe("AC8 (g) — lista de 1 item: o payload é o de antes (golden do motor da main)", () => {
  const golden = readFileSync(GOLDEN_N1, "utf8");

  it("só com `baseAnterior` (entrada da 49.4): byte a byte o golden, fora os dois contadores novos do desempate", () => {
    const r = rodar();
    expect(JSON.stringify(semAcrescimos49_11(r), null, 2) + "\n").toBe(golden);
    expect(r.serieHistorica).toBeUndefined(); // composição só com 2+
    expect(r.pesquisa).toMatchObject({ duplicadasSemData: 0, duplicadasDecididasPelaPesquisaDeCaptacao: 0 });
  });

  it("com `seriesDeComparacao` de 1 item (o que o loader da 49.11 entrega): o MESMO payload", () => {
    const legado = rodar();
    const novo = rodar((e) => {
      e.seriesDeComparacao = [
        { funnelId: e.baseAnterior!.funnelId, nome: "dg-pg01", chavesDePerguntaComResposta: e.baseAnterior!.chavesDePerguntaComResposta },
      ];
    });
    expect(JSON.stringify(novo)).toBe(JSON.stringify(legado));
    expect(novo.dimensoes.map((d) => [d.campo, d.serieHistorica, d.serieHistoricaMotivo])).toEqual([
      ["faixa", true, "PRESENTE_NOS_DOIS_LANCAMENTOS"],
      ["sexo", false, "AUSENTE_NO_LANCAMENTO_DE_COMPARACAO"],
      ["renda", true, "PRESENTE_NOS_DOIS_LANCAMENTOS"], // casou pelo CABEÇALHO
    ]);
    expect(novo.dimensoes.some((d) => "lancamentosAusentes" in d || "lancamentosSemPesquisa" in d)).toBe(false);
  });

  it("lista vazia: SEM_LANCAMENTO_DE_COMPARACAO e cross-launch não se aplica (como antes)", () => {
    const r = rodar((e) => {
      e.baseAnterior = null;
      e.seriesDeComparacao = [];
    });
    expect(r.dimensoes.every((d) => !d.serieHistorica && d.serieHistoricaMotivo === "SEM_LANCAMENTO_DE_COMPARACAO")).toBe(true);
    expect(r.crossLaunch).toMatchObject({ aplicavel: false, motivo: "SEM_LANCAMENTO_DE_COMPARACAO" });
    expect(r.serieHistorica).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC8 — série = existe em TODOS os lançamentos da lista
// ---------------------------------------------------------------------------

describe("AC8 — série histórica com 3 lançamentos", () => {
  it("pergunta com resposta em TODOS ⇒ série, PRESENTE_EM_TODOS_OS_LANCAMENTOS", () => {
    const r = rodar(tres(["faixa", "renda_mensal"], ["FAIXA", "Qual a sua renda mensal?"]));
    expect(dim(r, "faixa")).toMatchObject({ serieHistorica: true, serieHistoricaMotivo: "PRESENTE_EM_TODOS_OS_LANCAMENTOS" });
    expect(dim(r, "faixa").lancamentosAusentes).toBeUndefined();
  });

  it("ausente em UM ⇒ não é série, e `lancamentosAusentes` nomeia QUAL (não 'algum')", () => {
    // renda: F1 pelo cabeçalho, F2 pela chave; F3 não tem
    const r = rodar(tres(["faixa", "renda_mensal"], ["faixa"]));
    expect(dim(r, "renda")).toMatchObject({
      serieHistorica: false,
      serieHistoricaMotivo: "AUSENTE_EM_LANCAMENTO_DA_LISTA",
      lancamentosAusentes: [F3],
    });
    // a faixa está nos três
    expect(dim(r, "faixa").serieHistorica).toBe(true);
    // sexo não está em nenhum dos três (F1 é a principal e também falta)
    expect(dim(r, "sexo")).toMatchObject({ serieHistoricaMotivo: "AUSENTE_EM_LANCAMENTO_DA_LISTA", lancamentosAusentes: [F1, F2, F3] });
  });

  it("lançamento da lista SEM pesquisa ⇒ COMPARACAO_SEM_PESQUISA com o funil, e nenhuma dimensão é série", () => {
    const r = rodar(tres(null, ["faixa", "renda_mensal"]));
    for (const d of r.dimensoes) {
      expect(d.serieHistorica).toBe(false);
      expect(d.serieHistoricaMotivo).toBe("COMPARACAO_SEM_PESQUISA");
      expect(d.lancamentosSemPesquisa).toEqual([F2]);
    }
  });

  it("a mesma pergunta casa pelo CABEÇALHO quando a chave difere entre os lançamentos", () => {
    // nenhum lançamento tem a chave `renda_mensal`; todos têm o cabeçalho
    const r = rodar(tres(["faixa", "Qual a sua renda mensal?"], ["faixa", "  qual a SUA renda mensal? "]));
    expect(dim(r, "renda")).toMatchObject({ serieHistorica: true, serieHistoricaMotivo: "PRESENTE_EM_TODOS_OS_LANCAMENTOS" });
  });

  it("o payload declara a composição: nome, posição e a principal (só com 2+)", () => {
    const r = rodar(tres(["faixa"], ["faixa"]));
    expect(r.serieHistorica).toEqual({
      lancamentos: [
        { funnelId: F1, nome: "dg-pg01", posicao: 1, principal: true },
        { funnelId: F2, nome: "dg-pg02", posicao: 2, principal: false },
        { funnelId: F3, nome: "dg-pg03", posicao: 3, principal: false },
      ],
    });
  });

  it("(e) cross-launch continua SÓ com a principal: idêntico ao de n = 1, nada somado entre lançamentos", () => {
    const n1 = rodar((e) => {
      e.baseAnterior = { ...e.baseAnterior!, funnelId: F1 };
    });
    const n3 = rodar(tres(["faixa"], ["faixa"]));
    expect(n3.crossLaunch).toEqual(n1.crossLaunch);
    expect(n3.crossLaunch.funnelIdAnterior).toBe(F1);
  });

  it("(h) só a qualificação: nenhuma tabela por lançamento da série (sem % por lançamento — R6-6)", () => {
    const n1 = rodar(tres(["faixa"], ["faixa"]));
    const faixa = dim(n1, "faixa");
    expect(Object.keys(faixa).sort()).toEqual(
      ["campo", "perguntas", "porFechamento", "porSegmento", "serieHistorica", "serieHistoricaMotivo", "total"].sort(),
    );
  });

  it("qualificarSerie: 'todos', não 'qualquer' — um único lançamento com a pergunta não basta", () => {
    const tem = new Set(["x"]);
    const nao = new Set(["y"]);
    const r = qualificarSerie(
      [
        { funnelId: F1, chaves: tem },
        { funnelId: F2, chaves: nao },
      ],
      (c) => c.has("x"),
    );
    expect(r).toEqual({ serieHistorica: false, serieHistoricaMotivo: "AUSENTE_EM_LANCAMENTO_DA_LISTA", lancamentosAusentes: [F2] });
  });
});

// ---------------------------------------------------------------------------
// AC10 (d) — desempate sem data pela pesquisa de captação (R6-7)
// ---------------------------------------------------------------------------

/**
 * Etapa com DUAS pesquisas (a de captação e a dos alunos), o mesmo e-mail nas
 * duas. A da captação diz faixa A; a dos alunos, faixa D.
 */
function duasPesquisas(opts: {
  marcada: boolean;
  captacaoPrimeiro: boolean;
  datas?: [string | null, string | null]; // [captação, alunos]
}) {
  return (e: EntradaDeSerie) => {
    const [dCap, dAlu] = opts.datas ?? [null, null];
    e.pesquisas = [
      { ...pesquisaPrincipal, ...(opts.marcada ? { pesquisaDeCaptacao: true } : {}) },
      { ...pesquisaPrincipal, pesquisaId: PESQ_ALUNOS, rotulo: "Painel / Pesquisa-Captação - Alunos" },
    ];
    const daCaptacao = resp({ pesquisaId: PESQ, email: "dup@x.com", faixa: "A", dataRespostaCru: dCap, linha: 50 });
    const dosAlunos = resp({ pesquisaId: PESQ_ALUNOS, email: " DUP@x.com", faixa: "D", dataRespostaCru: dAlu, linha: 1 });
    // ordem de leitura: a do teste decide quem vem antes
    e.respondentes.push(...(opts.captacaoPrimeiro ? [daCaptacao, dosAlunos] : [dosAlunos, daCaptacao]));
  };
}

describe("AC10 (d) — R6-7: sem data, vence a pesquisa de captação marcada", () => {
  it("as duas sem data, a marcada LIDA ANTES vence (pela posição venceria a dos alunos)", () => {
    const r = rodar(duasPesquisas({ marcada: true, captacaoPrimeiro: true }));
    expect(r.faixa.distribuicao.A).toBe(2); // a@ + dup@ (captação)
    expect(r.faixa.distribuicao.D).toBe(0); // c@ ficou com C (19/04 > 18/04); a dos alunos perdeu
    expect(r.pesquisa).toMatchObject({ duplicadasRemovidas: 2, duplicadasSemData: 1, duplicadasDecididasPelaPesquisaDeCaptacao: 1 });
    expect(r.pesquisa.linhasLidas - r.pesquisa.vazias - r.pesquisa.duplicadasRemovidas).toBe(r.pesquisa.respondentes);
    expect(r.pesquisa.memoria).toContain("a da pesquisa de captação marcada na config (1)");
    expect(r.lacunas.map((l) => l.codigo)).not.toContain("DESEMPATE_SEM_PESQUISA_DE_CAPTACAO");
  });

  it("a marcada vence em QUALQUER ordem de leitura", () => {
    const r = rodar(duasPesquisas({ marcada: true, captacaoPrimeiro: false }));
    expect([r.faixa.distribuicao.A, r.faixa.distribuicao.D]).toEqual([2, 0]);
  });

  it("mesmo dia também é empate: vence a marcada", () => {
    const r = rodar(duasPesquisas({ marcada: true, captacaoPrimeiro: true, datas: ["20/04/2026", "20/04/2026"] }));
    expect([r.faixa.distribuicao.A, r.faixa.distribuicao.D]).toEqual([2, 0]);
    expect(r.pesquisa.duplicadasDecididasPelaPesquisaDeCaptacao).toBe(1);
  });

  it("datas legíveis e diferentes: a MAIS RECENTE vence, mesmo sendo a dos alunos (decisão 8 inalterada)", () => {
    const r = rodar(duasPesquisas({ marcada: true, captacaoPrimeiro: false, datas: ["17/04/2026", "21/04/2026"] }));
    expect([r.faixa.distribuicao.A, r.faixa.distribuicao.D]).toEqual([1, 1]);
    expect(r.pesquisa).toMatchObject({ duplicadasSemData: 0, duplicadasDecididasPelaPesquisaDeCaptacao: 0 });
  });

  it("etapa com 2 pesquisas SEM marca: posição (a posterior) + lacuna DESEMPATE_SEM_PESQUISA_DE_CAPTACAO com a contagem", () => {
    const r = rodar(duasPesquisas({ marcada: false, captacaoPrimeiro: true }));
    expect([r.faixa.distribuicao.A, r.faixa.distribuicao.D]).toEqual([1, 1]); // a dos alunos, lida depois, venceu
    expect(r.pesquisa).toMatchObject({ duplicadasSemData: 1, duplicadasDecididasPelaPesquisaDeCaptacao: 0 });
    const lacuna = r.lacunas.find((l) => l.codigo === "DESEMPATE_SEM_PESQUISA_DE_CAPTACAO");
    expect(lacuna?.detalhe).toBe(
      `etapa ${CAP}: Painel / Pesquisa-Captação; Painel / Pesquisa-Captação - Alunos — respostas repetidas decididas sem data: 1 de 2 removidas`,
    );
    expect(r.pesquisa.memoria).toContain("empate ou sem data → linha posterior)");
  });

  it("desempatarResposta: a marca só decide entre pesquisas DIFERENTES da MESMA etapa", () => {
    const marcada = { pesquisaId: "p1", stageId: "s1", pesquisaDeCaptacao: true };
    const outraEtapa = { pesquisaId: "p2", stageId: "s2" };
    const mesmaEtapa = { pesquisaId: "p3", stageId: "s1" };
    const a = { dia: null, ordem: 1, pesquisa: marcada };
    expect(desempatarResposta(a, { dia: null, ordem: 2, pesquisa: outraEtapa })).toMatchObject({ decididaPor: "posicao" });
    expect(desempatarResposta(a, { dia: null, ordem: 2, pesquisa: mesmaEtapa })).toMatchObject({ vencedora: a, decididaPor: "pesquisaDeCaptacao" });
    expect(desempatarResposta(a, { dia: null, ordem: 0, pesquisa: marcada })).toMatchObject({ vencedora: a, decididaPor: "posicao" });
  });
});

// ---------------------------------------------------------------------------
// AC10 (a) — a pesquisa dos alunos ENTRA: ninguém preenche `pesquisasExcluidas`
// ---------------------------------------------------------------------------

describe("AC10 (a) — R5-2: nenhum chamador de produção passa `pesquisasExcluidas`", () => {
  const SRC = join(AQUI, "..");
  const LOADER = ["services", "debriefing-audience-loader.ts"].join(sep);
  function arquivos(dir = SRC): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = join(dir, d.name);
      if (d.isDirectory()) return d.name === "__tests__" ? [] : arquivos(p);
      return /\.(m|c)?tsx?$/.test(d.name) && !d.name.endsWith(".d.ts") ? [p] : [];
    });
  }

  it("o parâmetro só existe no próprio loader (a 49.5/49.6 herdam esta guarda)", () => {
    const fora = arquivos()
      .filter((p) => relative(SRC, p) !== LOADER)
      .filter((p) => /pesquisasExcluidas/.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p));
    expect(fora).toEqual([]);
  });
});
