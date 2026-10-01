/**
 * Story 49.1 — gate do gerador de debriefing (AC6, AC7, AC11), validações puras
 * (AC2, AC4, AC5, AC10), reset de `validado` e a lista de combinações liberadas.
 *
 * O carregador roda contra um store em memória (sem banco): o que se prova é a
 * ORDEM dos portões e que nenhum caminho entrega config sem o gate.
 */

import { describe, it, expect } from "vitest";
import * as servico from "../services/debriefing-config.js";
import {
  DEBRIEFING_COMBINACOES_LIBERADAS,
  DEBRIEFING_PAPEIS,
  DIMENSOES_DE_CRIATIVO,
  DebriefingConfigError,
  assertDebriefingScope,
  camposFaltantesDebriefing,
  dataExiste,
  isCombinacaoLiberada,
  loadDebriefingConfig,
  loadDebriefingConfigRaw,
  montarConfigBruta,
  normalizarCloserMediums,
  premissaMudou,
  problemasDasDatasChave,
  problemasDasPerguntas,
  problemasDoCorpoLancamento,
  type DebriefingConfigRaw,
} from "../services/debriefing-config.js";
import { LAUNCH_REPORT_ETAPAS } from "../db/schema.js";
import { META_TAX_RATE } from "../utils/meta-tax.js";
import { IDS, contexto, linha, mundoPadrao, storeEmMemoria, valoresCompletos } from "./fixtures/debriefing-config-store.js";
import type { Database } from "../db/client.js";

const db = {} as Database; // nunca usado: o store em memória é injetado

/** Par (projeto, funil) que consta da lista liberada — dg-pg02 (decisão 2). */
const DG_PG02 = DEBRIEFING_COMBINACOES_LIBERADAS.find((c) => c.rotulo.includes("dg-pg02"))!;

async function erroDe(p: Promise<unknown>): Promise<DebriefingConfigError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof DebriefingConfigError) return err;
    throw err;
  }
  throw new Error("deveria ter lançado DebriefingConfigError");
}

function raw(over: Partial<DebriefingConfigRaw> = {}): DebriefingConfigRaw {
  return {
    ...contexto(),
    ...valoresCompletos(),
    validado: false,
    validadoEm: null,
    validadoPor: null,
    imposto: { valor: META_TAX_RATE, origem: "default" },
    etapasComPesquisa: [IDS.captacao],
    etapasForaDoFunil: [],
    ...over,
  };
}

// ------------------------------------------------------------------
// AC7 — os 6 cenários do carregador (a única porta)
// ------------------------------------------------------------------

describe("loadDebriefingConfig — gate dentro do carregador (AC7)", () => {
  it("1. sem config → 422 COMBINACAO_NAO_VALIDADA apontando a ausência (nunca default)", async () => {
    const m = mundoPadrao(contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId }));
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.erro).toBe("COMBINACAO_NAO_VALIDADA");
    expect(err.detalhe).toContain("não tem configuração cadastrada");
  });

  it("2. combinação liberada mas config incompleta → CONFIG_INCOMPLETA listando os campos", async () => {
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ closerMediums: null, dimensaoDeCriativo: null, perguntasConfirmadas: {} })),
    );
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.erro).toBe("CONFIG_INCOMPLETA");
    expect(err.camposFaltantes).toEqual([
      `perguntasConfirmadas[${IDS.captacao}].faixa (chave da pergunta ou null = "sem faixa A→D")`,
      "closerMediums (lista vazia é resposta válida)",
      "dimensaoDeCriativo",
    ]);
    expect(err.detalhe).toContain("closerMediums");
    expect(Object.keys(err.toResponse())).toEqual(["erro", "detalhe", "acao"]);
  });

  it("3. combinação fora da lista e sem validado → COMBINACAO_NAO_VALIDADA com o corpo exato", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.toResponse()).toEqual({
      erro: "COMBINACAO_NAO_VALIDADA",
      detalhe:
        "expert=Expert Teste lancamento=xx-pg09 — o gerador de debriefing ainda não foi conferido para esta combinação",
      acao: "Conferir os números contra as fixtures do expert e marcar a combinação como validada antes de liberar este botão",
    });
  });

  it("4. combinação fora da lista COM validado → passa", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos(), { validado: true }));
    const cfg = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    expect(cfg.tipoDeFunil).toBe("launch");
    expect(cfg.validado).toBe(true);
  });

  it("5. combinação na lista (sem validado) → passa e devolve o contrato DebriefingConfig", async () => {
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    m.impostoPorProjeto.set(DG_PG02.projectId, "0.0800");
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const cfg = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    expect(cfg).toEqual({
      tipoDeFunil: "launch",
      stageId: IDS.debriefing,
      funnelId: DG_PG02.funnelId,
      projectId: DG_PG02.projectId,
      datasChave: {
        inicioCaptacao: "2026-04-17",
        aberturaCarrinho: "2026-05-12",
        fimCarrinho: "2026-05-16",
        reabertura: { houve: false },
        downsell: { houve: true, abertura: "2026-05-18", fim: "2026-05-20" },
      },
      lancamentoComparacaoFunnelId: null,
      etapas: valoresCompletos().etapas,
      perguntasConfirmadas: { [IDS.captacao]: { faixa: "faixa", renda: "q_renda" } },
      closerMediums: ["x1", "comercial"],
      closerPorSellerName: false,
      dimensaoDeCriativo: "ia-humano",
      imposto: { valor: 0.08, origem: "project" },
      validado: false,
      validadoEm: null,
      validadoPor: null,
    });
  });

  it("6. mudar premissa reseta validado (função usada pelo PUT)", () => {
    const antes = valoresCompletos();
    expect(premissaMudou(antes, valoresCompletos())).toBe(false);
    expect(premissaMudou(antes, valoresCompletos({ fimCarrinho: "2026-05-17" }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ etapas: antes.etapas.slice(1) }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ perguntasConfirmadas: { [IDS.captacao]: { faixa: null } } }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ closerMediums: ["x1"] }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ closerPorSellerName: true }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ dimensaoDeCriativo: "nenhuma" }))).toBe(true);
    expect(premissaMudou(antes, valoresCompletos({ reabertura: { houve: true, abertura: "2026-05-22", fim: "2026-05-23" } }))).toBe(true);
  });

  it("ordem das listas e das chaves não é premissa (não reseta à toa)", () => {
    const antes = valoresCompletos();
    const depois = valoresCompletos({
      etapas: [...antes.etapas].reverse(),
      closerMediums: ["comercial", "x1"],
      perguntasConfirmadas: { [IDS.captacao]: { renda: "q_renda", faixa: "faixa" } },
    });
    expect(premissaMudou(antes, depois)).toBe(false);
  });
});

// ------------------------------------------------------------------
// AC11 — tipo do funil antes de tudo
// ------------------------------------------------------------------

describe("AC11 — tipo de funil", () => {
  it("perpétuo → 422 TIPO_DE_FUNIL_NAO_SUPORTADO com o corpo exato, sem ler a config", async () => {
    // Mesmo com a combinação liberada e validada, o perpétuo não passa até a 49.10.
    const dgA1 = DEBRIEFING_COMBINACOES_LIBERADAS.find((c) => c.rotulo.includes("dg-a1"))!;
    const m = mundoPadrao(contexto({ funnelType: "perpetual", projectId: dgA1.projectId, funnelId: dgA1.funnelId }));
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, servico.VALORES_VAZIOS, { validado: true }));
    const store = storeEmMemoria(m);
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, store));
    expect(err.toResponse()).toEqual({
      erro: "TIPO_DE_FUNIL_NAO_SUPORTADO",
      detalhe:
        "o gerador de debriefing de funil perpétuo ainda não está disponível — a geração de lançamento não se aplica a funil perpétuo",
      acao: "Aguardar a entrega do debriefing de perpétuo (Story 49.10); para o perpétuo, hoje use o relatório do botão 3 (Resumão perpétuo)",
    });
    expect(store.contextoDaEtapa).toHaveBeenCalledTimes(1);
    expect(store.linhaDaConfig).not.toHaveBeenCalled();
    expect(store.etapasDoFunil).not.toHaveBeenCalled();
    expect(store.etapasComPesquisa).not.toHaveBeenCalled();
    expect(store.perguntasDaEtapa).not.toHaveBeenCalled();
    expect(store.impostoDoProjeto).not.toHaveBeenCalled();
  });

  it("perpétuo SEM config também dá TIPO (o tipo vem antes da ausência de config)", async () => {
    const m = mundoPadrao(contexto({ funnelType: "perpetual" }));
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.erro).toBe("TIPO_DE_FUNIL_NAO_SUPORTADO");
  });

  it("mobile → TIPO_DE_FUNIL_NAO_SUPORTADO dizendo o tipo, sem ler a config", async () => {
    const m = mundoPadrao(contexto({ funnelType: "mobile" }));
    const store = storeEmMemoria(m);
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, store));
    expect(err.erro).toBe("TIPO_DE_FUNIL_NAO_SUPORTADO");
    expect(err.detalhe).toContain('"mobile"');
    expect(store.linhaDaConfig).not.toHaveBeenCalled();
  });

  it("launch → comportamento do gate inalterado (cenário 5 acima passa)", async () => {
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    await expect(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m))).resolves.toMatchObject({
      tipoDeFunil: "launch",
    });
  });

  it("o MECANISMO aceita perpétuo: nada é exigido e a lista vale para ele (49.10 consome)", () => {
    const dgA1 = DEBRIEFING_COMBINACOES_LIBERADAS.find((c) => c.rotulo.includes("dg-a1"))!;
    const perp = raw({
      ...servico.VALORES_VAZIOS,
      funnelType: "perpetual",
      projectId: dgA1.projectId,
      funnelId: dgA1.funnelId,
      etapasComPesquisa: [],
    });
    expect(camposFaltantesDebriefing(perp)).toEqual([]);
    expect(() => assertDebriefingScope(perp)).not.toThrow();
    // Fora da lista e sem validado, o perpétuo bloqueia como qualquer outro.
    expect(() => assertDebriefingScope({ ...perp, funnelId: IDS.funil })).toThrow(DebriefingConfigError);
  });

  it("etapa inexistente ou que não é Debriefing → bloqueia (nunca assume default)", async () => {
    const m = mundoPadrao();
    expect((await erroDe(loadDebriefingConfig(db, IDS.reabertura, storeEmMemoria(m)))).erro).toBe(
      "COMBINACAO_NAO_VALIDADA",
    );
    const err = await erroDe(loadDebriefingConfig(db, IDS.etapaNaoDebriefing, storeEmMemoria(m)));
    expect(err.detalhe).toContain('"application"');
  });
});

// ------------------------------------------------------------------
// R1 — não há porta dos fundos
// ------------------------------------------------------------------

describe("R1 — superfície exportada do service", () => {
  it("só loadDebriefingConfig (com gate) e loadDebriefingConfigRaw (UI) carregam config", () => {
    const carregadores = Object.keys(servico).filter((k) => /^load/.test(k)).sort();
    expect(carregadores).toEqual(["loadDebriefingConfig", "loadDebriefingConfigRaw"]);
    // O conversor raw → contrato não é exportado: só o gate o chama.
    expect(Object.keys(servico)).not.toContain("montarDebriefingConfig");
  });

  it("a variante crua devolve a config sem aplicar o gate (para a UI exibir o bloqueio)", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ closerMediums: null })));
    const r = await loadDebriefingConfigRaw(db, IDS.debriefing, storeEmMemoria(m));
    expect(r?.config?.closerMediums).toBeNull();
    expect(r?.config?.validado).toBe(false);
  });
});

// ------------------------------------------------------------------
// AC6 — lista de combinações liberadas (decisão 2)
// ------------------------------------------------------------------

describe("AC6 — DEBRIEFING_COMBINACOES_LIBERADAS (decisão 2: DG + FZ + Netão)", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("17 funis launch/perpetual dos 3 projetos, por id, sem repetição", () => {
    expect(DEBRIEFING_COMBINACOES_LIBERADAS).toHaveLength(17);
    const funis = DEBRIEFING_COMBINACOES_LIBERADAS.map((c) => c.funnelId);
    expect(new Set(funis).size).toBe(funis.length);
    for (const c of DEBRIEFING_COMBINACOES_LIBERADAS) {
      expect(c.projectId).toMatch(UUID);
      expect(c.funnelId).toMatch(UUID);
      expect(c.rotulo).toMatch(/\((launch|perpetual)\)$/);
    }
    const projetos = new Set(DEBRIEFING_COMBINACOES_LIBERADAS.map((c) => c.projectId));
    expect([...projetos].sort()).toEqual(
      [
        "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", // FZ & MFB
        "738cda16-c5be-4268-9c98-92e46c359569", // DG & CPDF
        "e25369be-1d04-4153-8178-14a3b617e70e", // BBE (Netão)
      ].sort(),
    );
  });

  it("não libera Lyrio (mobile) nem PP", () => {
    expect(isCombinacaoLiberada({ projectId: "9bd898eb-531a-45a6-801f-61d50e76f794", funnelId: "8d31f920-1abc-46fa-915c-d51d25ab6cc6" })).toBe(false);
    expect(isCombinacaoLiberada({ projectId: "1b89245d-60a4-48a5-a691-c730bd6f48ca", funnelId: "c7b90503-7c2b-426e-b717-4af9279d793c" })).toBe(false);
  });

  it("a chave é o PAR: funil liberado sob outro projeto não passa", () => {
    expect(isCombinacaoLiberada({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId })).toBe(true);
    expect(isCombinacaoLiberada({ projectId: IDS.projeto, funnelId: DG_PG02.funnelId })).toBe(false);
  });

  it("lista vazia bloqueia tudo (comportamento seguro do mecanismo)", () => {
    const cfg = raw({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    expect(() => assertDebriefingScope(cfg, [])).toThrow(DebriefingConfigError);
    expect(() => assertDebriefingScope(cfg)).not.toThrow();
  });
});

// ------------------------------------------------------------------
// Vocabulário
// ------------------------------------------------------------------

describe("vocabulário", () => {
  it("DEBRIEFING_PAPEIS = LAUNCH_REPORT_ETAPAS + reabertura, sem alterar a do Resumão", () => {
    expect(DEBRIEFING_PAPEIS).toEqual([...LAUNCH_REPORT_ETAPAS, "reabertura"]);
    expect(LAUNCH_REPORT_ETAPAS).toHaveLength(5);
    expect(LAUNCH_REPORT_ETAPAS).not.toContain("reabertura");
  });

  it("DIMENSOES_DE_CRIATIVO tem a resposta explícita 'nenhuma'", () => {
    expect(DIMENSOES_DE_CRIATIVO).toEqual(["ia-humano", "video-estatico", "nenhuma"]);
  });
});

// ------------------------------------------------------------------
// AC2 — datas-chave
// ------------------------------------------------------------------

describe("AC2 — datas-chave", () => {
  it("data inexistente é recusada", () => {
    expect(dataExiste("2026-02-30")).toBe(false);
    expect(dataExiste("2026-13-01")).toBe(false);
    expect(dataExiste("2028-02-29")).toBe(true);
    expect(dataExiste("2026-2-1")).toBe(false);
  });

  it("completas e em ordem → sem problema", () => {
    expect(problemasDasDatasChave(valoresCompletos())).toEqual([]);
  });

  it("reabertura/downsell ausentes ≠ 'não houve': exigem resposta explícita", () => {
    const p = problemasDasDatasChave(valoresCompletos({ reabertura: null, downsell: null }));
    expect(p).toHaveLength(2);
    expect(p[0]).toContain("datasChave.reabertura exige resposta explícita");
    expect(p[1]).toContain("datasChave.downsell exige resposta explícita");
  });

  it("houve: true sem datas aponta o campo", () => {
    const p = problemasDasDatasChave(
      valoresCompletos({ reabertura: { houve: true, abertura: "", fim: "" } }),
    );
    expect(p).toEqual([
      "datasChave.reabertura.abertura é obrigatória quando houve reabertura",
      "datasChave.reabertura.fim é obrigatória quando houve reabertura",
    ]);
  });

  it("ordem incoerente → mensagem com o par de campos", () => {
    expect(problemasDasDatasChave(valoresCompletos({ aberturaCarrinho: "2026-05-20" }))).toEqual([
      "datasChave.aberturaCarrinho (2026-05-20) é posterior a datasChave.fimCarrinho (2026-05-16)",
    ]);
    expect(problemasDasDatasChave(valoresCompletos({ inicioCaptacao: "2026-05-13" }))).toEqual([
      "datasChave.inicioCaptacao (2026-05-13) é posterior a datasChave.aberturaCarrinho (2026-05-12)",
    ]);
    expect(
      problemasDasDatasChave(valoresCompletos({ downsell: { houve: true, abertura: "2026-05-21", fim: "2026-05-20" } })),
    ).toEqual(["datasChave.downsell.abertura (2026-05-21) é posterior a datasChave.downsell.fim (2026-05-20)"]);
  });

  it("mesmo dia é coerente (≤, não <)", () => {
    expect(
      problemasDasDatasChave(valoresCompletos({ aberturaCarrinho: "2026-05-16", inicioCaptacao: "2026-05-16" })),
    ).toEqual([]);
  });
});

// ------------------------------------------------------------------
// AC3/AC4 — comparação e etapas
// ------------------------------------------------------------------

describe("AC3/AC4 — regras cruzadas do PUT", () => {
  const ctxVal = {
    stageId: IDS.debriefing,
    funnelId: IDS.funil,
    etapasDoFunil: [IDS.captacao, IDS.vendasCaptacao, IDS.principal, IDS.downsell, IDS.reabertura, IDS.debriefing],
    funisDoProjeto: [IDS.funil, IDS.funilComparacao],
  };

  it("config completa e coerente → sem problema", () => {
    expect(problemasDoCorpoLancamento(valoresCompletos(), ctxVal)).toEqual([]);
  });

  it("comparação: mesmo projeto ok; outro projeto e o próprio funil → problema", () => {
    expect(problemasDoCorpoLancamento(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao }), ctxVal)).toEqual([]);
    expect(problemasDoCorpoLancamento(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilDeOutroProjeto }), ctxVal)).toEqual([
      `lancamentoComparacaoFunnelId (${IDS.funilDeOutroProjeto}) não é um funil do mesmo projeto`,
    ]);
    expect(problemasDoCorpoLancamento(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funil }), ctxVal)).toEqual([
      "lancamentoComparacaoFunnelId não pode ser o próprio funil da etapa",
    ]);
  });

  it("etapa de outro funil, repetida, a própria etapa e lista vazia → item ofensor nomeado", () => {
    const etapas = [
      { stageId: IDS.captacao, papel: "leads-captacao" as const },
      { stageId: IDS.captacao, papel: "vendas-captacao" as const },
      { stageId: IDS.etapaDeOutroFunil, papel: "vendas-principal" as const },
      { stageId: IDS.debriefing, papel: "vendas-principal" as const },
    ];
    expect(problemasDoCorpoLancamento(valoresCompletos({ etapas, perguntasConfirmadas: {} }), ctxVal)).toEqual([
      `etapas[${IDS.captacao}] repetida`,
      `etapas[${IDS.etapaDeOutroFunil}] não pertence ao funil da etapa`,
      `etapas[${IDS.debriefing}] é a própria etapa de debriefing`,
    ]);
    expect(problemasDoCorpoLancamento(valoresCompletos({ etapas: [], perguntasConfirmadas: {} }), ctxVal)).toEqual([
      "etapas precisa ter ao menos 1 item",
    ]);
  });

  it("papel reabertura exige reabertura.houve; papel de downsell exige downsell.houve", () => {
    const etapas = [
      { stageId: IDS.captacao, papel: "leads-captacao" as const },
      { stageId: IDS.reabertura, papel: "reabertura" as const },
      { stageId: IDS.downsell, papel: "leads-downsell" as const },
    ];
    expect(
      problemasDoCorpoLancamento(valoresCompletos({ etapas, downsell: { houve: false } }), ctxVal),
    ).toEqual([
      `etapas[${IDS.reabertura}].papel=reabertura exige datasChave.reabertura.houve = true`,
      `etapas[${IDS.downsell}].papel=leads-downsell exige datasChave.downsell.houve = true`,
    ]);
  });

  it("perguntasConfirmadas só para etapas da lista", () => {
    const v = valoresCompletos({ perguntasConfirmadas: { [IDS.reabertura]: { faixa: null } } });
    expect(problemasDoCorpoLancamento(v, ctxVal)).toEqual([
      `perguntasConfirmadas[${IDS.reabertura}] não é uma das etapas do lançamento`,
    ]);
  });
});

// ------------------------------------------------------------------
// AC5 — perguntas da pesquisa
// ------------------------------------------------------------------

describe("AC5 — perguntas confirmadas", () => {
  const reais = new Map([
    [IDS.captacao, [{ key: "faixa", label: "Faixa" }, { key: "q_renda", label: "Renda" }]],
    [IDS.principal, null],
  ]);

  it("chave que não existe nas perguntas reais → problema nomeando etapa e campo", () => {
    expect(problemasDasPerguntas({ [IDS.captacao]: { faixa: "faixa", religiao: "q_religiao" } }, reais)).toEqual([
      `perguntasConfirmadas[${IDS.captacao}].religiao = "q_religiao" não existe nas perguntas da pesquisa`,
    ]);
  });

  it("etapa sem pesquisa não entra", () => {
    expect(problemasDasPerguntas({ [IDS.principal]: { faixa: null } }, reais)).toEqual([
      `perguntasConfirmadas[${IDS.principal}]: a etapa não tem pesquisa — etapa sem pesquisa não entra`,
    ]);
  });

  it("faixa: null é resposta explícita (Netão) e completa a config", () => {
    expect(problemasDasPerguntas({ [IDS.captacao]: { faixa: null } }, reais)).toEqual([]);
    const cfg = raw({ perguntasConfirmadas: { [IDS.captacao]: { faixa: null } } });
    expect(camposFaltantesDebriefing(cfg)).toEqual([]);
  });

  it("faixa ausente numa etapa com pesquisa → incompleta (não 400)", () => {
    const cfg = raw({ perguntasConfirmadas: { [IDS.captacao]: { renda: "q_renda" } } });
    expect(camposFaltantesDebriefing(cfg)).toEqual([
      `perguntasConfirmadas[${IDS.captacao}].faixa (chave da pergunta ou null = "sem faixa A→D")`,
    ]);
  });

  it("o contrato só leva etapas com pesquisa (entrada órfã é descartada, faixa sempre presente)", async () => {
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    // A etapa principal perdeu a pesquisa depois de salvar.
    m.linhas.set(
      IDS.debriefing,
      linha(
        IDS.debriefing,
        valoresCompletos({
          perguntasConfirmadas: { [IDS.captacao]: { faixa: null, renda: "q_renda" }, [IDS.principal]: { idade: "q" } },
        }),
      ),
    );
    const cfg = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    if (cfg.tipoDeFunil !== "launch") throw new Error("esperava launch");
    expect(cfg.perguntasConfirmadas).toEqual({ [IDS.captacao]: { faixa: null, renda: "q_renda" } });
  });
});

// ------------------------------------------------------------------
// AC10 — classificador e criativo
// ------------------------------------------------------------------

describe("AC10 — closerMediums / closerPorSellerName / dimensaoDeCriativo", () => {
  it("closerMediums normalizados (trim + minúsculas, sem repetição)", () => {
    expect(normalizarCloserMediums([" X1 ", "Comercial", "x1"])).toEqual(["x1", "comercial"]);
  });

  it("lista vazia é resposta explícita; ausente é incompleta", () => {
    expect(camposFaltantesDebriefing(raw({ closerMediums: [] }))).toEqual([]);
    expect(camposFaltantesDebriefing(raw({ closerMediums: null }))).toEqual(["closerMediums (lista vazia é resposta válida)"]);
  });

  it("closerPorSellerName e dimensaoDeCriativo obrigatórios; 'nenhuma' é resposta", () => {
    expect(camposFaltantesDebriefing(raw({ closerPorSellerName: null, dimensaoDeCriativo: null }))).toEqual([
      "closerPorSellerName",
      "dimensaoDeCriativo",
    ]);
    expect(camposFaltantesDebriefing(raw({ dimensaoDeCriativo: "nenhuma" }))).toEqual([]);
  });

  it("valor desconhecido gravado no banco aparece como problema, não some", () => {
    const cfg = raw({ dimensaoDeCriativo: "carrossel" as never });
    expect(camposFaltantesDebriefing(cfg)).toEqual([
      'dimensaoDeCriativo ("carrossel") fora de ia-humano | video-estatico | nenhuma',
    ]);
  });
});

// ------------------------------------------------------------------
// Forma crua: etapas que saíram do funil depois de salvar
// ------------------------------------------------------------------

describe("montarConfigBruta", () => {
  it("etapa da lista que não pertence mais ao funil vira campo faltante", async () => {
    const m = mundoPadrao();
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ etapas: [...valoresCompletos().etapas, { stageId: IDS.etapaDeOutroFunil, papel: "vendas-principal" }] })),
    );
    const cfg = await montarConfigBruta(storeEmMemoria(m), contexto());
    expect(cfg?.etapasForaDoFunil).toEqual([IDS.etapaDeOutroFunil]);
    expect(camposFaltantesDebriefing(cfg!)).toEqual([`etapas[${IDS.etapaDeOutroFunil}] não pertence mais ao funil`]);
  });

  it("imposto: sem override do projeto cai no default, com procedência", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const cfg = await montarConfigBruta(storeEmMemoria(m), contexto());
    expect(cfg?.imposto).toEqual({ valor: META_TAX_RATE, origem: "default" });
  });
});
