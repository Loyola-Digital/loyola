/**
 * Story 49.1 — gate do gerador de debriefing (AC6, AC7, AC11), validações puras
 * (AC2, AC4, AC5, AC10), reset de `validado` e a lista de combinações liberadas.
 *
 * O carregador roda contra um store em memória (sem banco): o que se prova é a
 * ORDEM dos portões e que nenhum caminho entrega config sem o gate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as servico from "../services/debriefing-config.js";
import {
  DEBRIEFING_COMBINACOES_LIBERADAS,
  DEBRIEFING_PAPEIS,
  DIMENSOES_DE_CRIATIVO,
  DebriefingConfigError,
  assertDebriefingScope,
  avisosDebriefing,
  camposFaltantesDebriefing,
  dataExiste,
  isCombinacaoLiberada,
  loadDebriefingConfig,
  loadDebriefingConfigRaw,
  normalizarCloserMediums,
  premissaEfetiva,
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
    comparacaoRemovida: false,
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
      lancamentosComparacao: [], // 49.11 AC6 (acréscimo)
      pesquisaDeCaptacaoPorEtapa: {}, // 49.11 AC6 (acréscimo)
      etapas: valoresCompletos().etapas,
      perguntasConfirmadas: { [IDS.captacao]: { faixa: "faixa", renda: "q_renda" } },
      closerMediums: ["x1", "comercial"],
      closerPorSellerName: false,
      ferramentasDeAtendimento: [],
      dimensaoDeCriativo: "ia-humano",
      imposto: { valor: 0.08, origem: "project" },
      validado: false,
      validadoEm: null,
      validadoPor: null,
      avisos: [],
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

  it("trocar SÓ o papel de uma etapa (mesmos stageIds) é premissa: reseta (QA M10)", () => {
    // O papel decide headline × apêndice na 49.3; a lista de ids não muda.
    const antes = valoresCompletos();
    const etapas = antes.etapas.map((e) =>
      e.stageId === IDS.vendasCaptacao ? { ...e, papel: "vendas-principal" as const } : e,
    );
    expect(etapas.map((e) => e.stageId)).toEqual(antes.etapas.map((e) => e.stageId));
    expect(premissaMudou(antes, valoresCompletos({ etapas }))).toBe(true);
  });

  it("fora da lista + sem validado + INCOMPLETA → COMBINACAO_NAO_VALIDADA, não CONFIG_INCOMPLETA (AC6, QA M6)", async () => {
    // AC6: CONFIG_INCOMPLETA só "quando a combinação está liberada". A combinação
    // é checada antes da completude.
    const incompleta = raw({ closerMediums: null, dimensaoDeCriativo: null });
    expect(camposFaltantesDebriefing(incompleta)).not.toEqual([]);
    let err: unknown;
    try {
      assertDebriefingScope(incompleta);
    } catch (e) {
      err = e;
    }
    expect((err as DebriefingConfigError).erro).toBe("COMBINACAO_NAO_VALIDADA");

    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ closerMediums: null, dimensaoDeCriativo: null })));
    expect((await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)))).erro).toBe(
      "COMBINACAO_NAO_VALIDADA",
    );
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

/**
 * Inventário COMPLETO das exportações de runtime do service, cada uma
 * classificada. Exportação nova quebra o teste até alguém classificá-la: se ela
 * devolve config, ou passa pelo gate, ou é a porta crua da UI (e aí o teste de
 * imports abaixo a prende na rota). Não filtra por nome (QA ARCH-001).
 */
const SUPERFICIE = {
  // Portas que devolvem config
  loadDebriefingConfig: "gate", // a ÚNICA porta dos geradores
  aplicarGateDebriefing: "gate", // raw já lido → contrato, aplicando o gate inteiro
  loadDebriefingConfigRaw: "crua-so-rota", // a ÚNICA porta crua — só routes/debriefing-config.ts
  criarDebriefingConfigStore: "crua-so-rota", // o store lê a linha crua — só a rota o instancia
  // Estado do gate / erros
  avaliarBloqueioDebriefing: "gate",
  assertDebriefingScope: "puro",
  avisosDebriefing: "puro", // R4-14 — avisos que não bloqueiam
  assertEtapaDeDebriefing: "puro",
  assertTipoDeFunilSuportado: "puro",
  DebriefingConfigError: "puro",
  erroSemConfig: "puro",
  erroTipoDeFunilNaoSuportado: "puro",
  // Validações e helpers puros (não leem nada)
  camposFaltantesDebriefing: "puro",
  dataExiste: "puro",
  etapasComChaveConfirmada: "puro",
  isCombinacaoLiberada: "puro",
  normalizarCloserMediums: "puro",
  premissaEfetiva: "puro", // R4-14 — comparação órfã vale como "sem comparação"
  premissaMudou: "puro",
  problemasDasDatasChave: "puro",
  problemasDasPerguntas: "puro",
  problemasDoCorpoLancamento: "puro",
  problemasPapelXDatas: "puro",
  tipoAceitaConfig: "puro",
  valoresDaLinha: "puro", // converte uma linha; a linha só sai do store
  // Story 49.11 (acréscimo) — lista de comparação e pesquisa de captação
  comparacaoDoCorpo: "puro", // corpo do PUT: campo antigo, lista ou os dois coerentes
  comparacoesDe: "puro", // a lista de uns valores (forma da 49.1 = [antiga])
  comparacoesRemovidasDe: "puro", // R4-14 por item
  listaDeComparacaoDaLinha: "puro", // a coluna antiga manda na divergência
  problemasDaPesquisaDeCaptacao: "puro", // R6-7 — a pesquisa marcada é da etapa
  MAX_LANCAMENTOS_COMPARACAO: "constante",
  // Constantes
  DEBRIEFING_COMBINACOES_LIBERADAS: "constante",
  DEBRIEFING_PAPEIS: "constante",
  DIMENSOES_DE_CRIATIVO: "constante",
  VALORES_VAZIOS: "constante",
} as const satisfies Record<string, "gate" | "crua-so-rota" | "puro" | "constante">;

const RESTRITAS = Object.entries(SUPERFICIE)
  .filter(([, c]) => c === "crua-so-rota")
  .map(([k]) => k);

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROTA = ["routes", "debriefing-config.ts"].join(sep);
const SERVICO = ["services", "debriefing-config.ts"].join(sep);
const SCHEMA = ["db", "schema.ts"].join(sep);

function arquivosDeSrc(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === "__tests__" ? [] : arquivosDeSrc(p);
    return /\.(m|c)?tsx?$/.test(d.name) && !d.name.endsWith(".d.ts") ? [p] : [];
  });
}

/** O especificador (relativo ao arquivo) aponta para o service? Pacote externo nunca. */
function apontaParaOServico(arquivo: string, modulo: string): boolean {
  if (!modulo.startsWith(".")) return false;
  const alvo = normalize(join(dirname(arquivo), modulo)).replace(/\.(js|ts|mjs|cjs)$/, "");
  return alvo === SERVICO.replace(/\.ts$/, "");
}

/** Violações de UM arquivo: porta crua/store importados, import em namespace, re-export, tabela crua. */
function violacoes(arquivo: string, codigo: string): string[] {
  const v: string[] = [];
  const doServico = { test: (modulo: string) => apontaParaOServico(arquivo, modulo) };
  const declaracoes = /(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of codigo.matchAll(declaracoes)) {
    const [, tipo, soTipo, clausula, modulo] = m;
    if (!doServico.test(modulo)) continue;
    if (tipo === "export") v.push(`${arquivo}: re-exporta ${modulo} (abre outra porta)`);
    if (soTipo) continue;
    if (/\*\s+as\s+/.test(clausula)) v.push(`${arquivo}: import * de ${modulo} (enxerga a porta crua)`);
    const nomes = (clausula.match(/\{([\s\S]*)\}/)?.[1] ?? "")
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
      .filter(Boolean);
    for (const n of nomes) if (RESTRITAS.includes(n)) v.push(`${arquivo}: importa ${n}`);
  }
  for (const m of codigo.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    if (doServico.test(m[1])) v.push(`${arquivo}: import() dinâmico de ${m[1]}`);
  }
  if (arquivo !== SERVICO && arquivo !== SCHEMA && /\bdebriefingConfigs\b|\bdebriefing_configs\b/.test(codigo)) {
    v.push(`${arquivo}: lê a tabela debriefing_configs sem passar pelo service`);
  }
  return v;
}

describe("R1 — superfície exportada do service (não há porta dos fundos)", () => {
  it("TODA exportação de runtime está classificada (nova exportação quebra até ser classificada)", () => {
    expect(Object.keys(servico).sort()).toEqual(Object.keys(SUPERFICIE).sort());
    // O conversor raw → contrato e o montador da forma crua não são exportados.
    expect(Object.keys(servico)).not.toContain("montarDebriefingConfig");
    expect(Object.keys(servico)).not.toContain("montarConfigBruta");
    expect(RESTRITAS.sort()).toEqual(["criarDebriefingConfigStore", "loadDebriefingConfigRaw"]);
  });

  it("nenhum arquivo de src/ fora da rota importa a porta crua ou o store, nem lê a tabela", () => {
    const todas = arquivosDeSrc().flatMap((p) => {
      const rel = relative(SRC, p);
      return rel === ROTA ? [] : violacoes(rel, readFileSync(p, "utf8"));
    });
    expect(todas).toEqual([]);
  });

  it("a rota usa a porta crua oficial (o scanner enxerga o import — controle positivo)", () => {
    const rota = readFileSync(join(SRC, ROTA), "utf8");
    expect(violacoes(ROTA, rota)).toEqual([
      `${ROTA}: importa criarDebriefingConfigStore`,
      `${ROTA}: importa loadDebriefingConfigRaw`,
    ]);
    expect(rota).not.toMatch(/montarConfigBruta/);
  });

  it("o scanner pega cada forma de porta dos fundos", () => {
    const f = ["services", "gerador-49-3.ts"].join(sep);
    expect(violacoes(f, `import { loadDebriefingConfig } from "./debriefing-config.js";`)).toEqual([]);
    expect(violacoes(f, `import type { DebriefingConfigStore } from "./debriefing-config.js";`)).toEqual([]);
    expect(violacoes(f, `import {\n  premissaMudou,\n  loadDebriefingConfigRaw as cru,\n} from "../services/debriefing-config.js";`)).toEqual([
      `${f}: importa loadDebriefingConfigRaw`,
    ]);
    expect(violacoes(f, `import { criarDebriefingConfigStore } from "./debriefing-config";`)).toHaveLength(1);
    expect(violacoes(f, `import * as svc from "./debriefing-config.js";`)).toHaveLength(1);
    expect(violacoes(f, `export { loadDebriefingConfig } from "./debriefing-config.js";`)).toHaveLength(1);
    expect(violacoes(f, `const m = await import("./debriefing-config.js");`)).toHaveLength(1);
    expect(violacoes(f, `db.select().from(debriefingConfigs)`)).toHaveLength(1);
    expect(violacoes(f, "sql`select * from debriefing_configs`")).toHaveLength(1);
    // O caminho é resolvido a partir do arquivo: outro módulo homônimo não conta…
    expect(violacoes(f, `import x from "../routes/debriefing-config.js";`)).toEqual([]);
    // …e o service visto de outra pasta conta.
    const r = ["routes", "debriefing-49-6.ts"].join(sep);
    expect(violacoes(r, `import { loadDebriefingConfigRaw } from "../services/debriefing-config.js";`)).toHaveLength(1);
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

describe("R4-12 (pedido da 49.2) — ferramentasDeAtendimento, mesmo comportamento de closerMediums", () => {
  it("ausente → CONFIG_INCOMPLETA nomeando o campo", async () => {
    expect(camposFaltantesDebriefing(raw({ ferramentasDeAtendimento: null }))).toEqual([
      "ferramentasDeAtendimento (lista vazia é resposta válida)",
    ]);
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ ferramentasDeAtendimento: null })));
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.erro).toBe("CONFIG_INCOMPLETA");
    expect(err.camposFaltantes).toEqual(["ferramentasDeAtendimento (lista vazia é resposta válida)"]);
  });

  it("[] é resposta válida (completa a config)", () => {
    expect(camposFaltantesDebriefing(raw({ ferramentasDeAtendimento: [] }))).toEqual([]);
  });

  it("mudança zera validado (premissa); a ordem não é premissa; null → [] também é mudança", () => {
    const antes = valoresCompletos({ ferramentasDeAtendimento: ["letalk", "chatwoot"] });
    expect(premissaMudou(antes, valoresCompletos({ ferramentasDeAtendimento: ["chatwoot", "letalk"] }))).toBe(false);
    expect(premissaMudou(antes, valoresCompletos({ ferramentasDeAtendimento: ["letalk"] }))).toBe(true);
    expect(premissaMudou(valoresCompletos(), antes)).toBe(true);
    expect(premissaMudou(valoresCompletos({ ferramentasDeAtendimento: null }), valoresCompletos())).toBe(true);
  });

  it("o contrato entrega a lista gravada; jsonb que não é lista lê como sem resposta", async () => {
    const m = mundoPadrao();
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ ferramentasDeAtendimento: ["letalk", "chatwoot"] }), { validado: true }),
    );
    expect(await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m))).toMatchObject({
      ferramentasDeAtendimento: ["letalk", "chatwoot"],
    });
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos(), { validado: true, ferramentasDeAtendimento: { x: 1 } as unknown as string[] }),
    );
    expect((await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)))).camposFaltantes).toEqual([
      "ferramentasDeAtendimento (lista vazia é resposta válida)",
    ]);
  });
});

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

describe("forma crua (loadDebriefingConfigRaw)", () => {
  async function cru(m: ReturnType<typeof mundoPadrao>) {
    return (await loadDebriefingConfigRaw(db, IDS.debriefing, storeEmMemoria(m)))?.config ?? null;
  }

  it("etapa da lista que não pertence mais ao funil vira campo faltante", async () => {
    const m = mundoPadrao();
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ etapas: [...valoresCompletos().etapas, { stageId: IDS.etapaDeOutroFunil, papel: "vendas-principal" }] })),
    );
    const cfg = await cru(m);
    expect(cfg?.etapasForaDoFunil).toEqual([IDS.etapaDeOutroFunil]);
    expect(camposFaltantesDebriefing(cfg!)).toEqual([`etapas[${IDS.etapaDeOutroFunil}] não pertence mais ao funil`]);
  });

  it("imposto: sem override do projeto cai no default, com procedência", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const cfg = await cru(m);
    expect(cfg?.imposto).toEqual({ valor: META_TAX_RATE, origem: "default" });
  });

  it("R4-14 — comparação apagada depois de validar: validado mantido, NÃO é campo faltante, contrato em edição única com COMPARACAO_REMOVIDA", async () => {
    const m = mundoPadrao();
    m.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao }), { validado: true }),
    );
    // Com o funil de comparação no projeto: comparação no contrato, sem aviso.
    let cfg = await cru(m);
    expect(cfg?.comparacaoRemovida).toBe(false);
    const comComparacao = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    expect(comComparacao).toMatchObject({ lancamentoComparacaoFunnelId: IDS.funilComparacao, avisos: [] });

    // Funil de comparação apagado (ou movido para outro projeto).
    m.funisPorProjeto.set(IDS.projeto, [IDS.funil]);
    cfg = await cru(m);
    expect(cfg?.comparacaoRemovida).toBe(true);
    expect(cfg?.validado).toBe(true); // a conferência continua valendo (decisão do dono)
    expect(cfg?.lancamentoComparacaoFunnelId).toBe(IDS.funilComparacao); // rastro do id gravado
    expect(camposFaltantesDebriefing(cfg!)).toEqual([]);

    const contrato = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    if (contrato.tipoDeFunil !== "launch") throw new Error("esperava launch");
    expect(contrato.lancamentoComparacaoFunnelId).toBeNull(); // 49.6: null ⇒ edição única
    expect(contrato.validado).toBe(true);
    expect(contrato.avisos).toEqual([
      {
        codigo: "COMPARACAO_REMOVIDA",
        detalhe:
          `o funil de comparação (${IDS.funilComparacao}) foi apagado ou não é mais do projeto Expert Teste — ` +
          "o debriefing será gerado como edição única, sem comparação",
        acao: "Escolher outra comparação na configuração do debriefing, ou remover a comparação para tirar este aviso",
      },
    ]);
  });

  it("R4-14 — combinação LIBERADA com a comparação apagada gera (edição única), não CONFIG_INCOMPLETA", async () => {
    const ctx = contexto({ projectId: DG_PG02.projectId, funnelId: DG_PG02.funnelId });
    const m = mundoPadrao(ctx);
    m.funisPorProjeto.set(DG_PG02.projectId, [DG_PG02.funnelId]);
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao })));
    const cfg = await loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m));
    expect(cfg).toMatchObject({ tipoDeFunil: "launch", lancamentoComparacaoFunnelId: null, validado: false });
    if (cfg.tipoDeFunil !== "launch") throw new Error("esperava launch");
    expect(cfg.avisos.map((a) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);
  });

  it("R4-14 — fora da lista e SEM validado, a comparação apagada não muda o motivo do bloqueio", async () => {
    const m = mundoPadrao();
    m.funisPorProjeto.set(IDS.projeto, [IDS.funil]);
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao })));
    const err = await erroDe(loadDebriefingConfig(db, IDS.debriefing, storeEmMemoria(m)));
    expect(err.erro).toBe("COMBINACAO_NAO_VALIDADA");
    expect(err.detalhe).not.toContain("lancamentoComparacaoFunnelId");
  });

  it("avisosDebriefing — sem comparação removida não há aviso", () => {
    expect(avisosDebriefing(raw())).toEqual([]);
    expect(avisosDebriefing(raw({ lancamentoComparacaoFunnelId: IDS.funilComparacao }))).toEqual([]);
    expect(
      avisosDebriefing(raw({ lancamentoComparacaoFunnelId: IDS.funilComparacao, comparacaoRemovida: true })).map((a) => a.codigo),
    ).toEqual(["COMPARACAO_REMOVIDA"]);
  });

  it("premissaEfetiva — comparação órfã vale como null; válida e nula ficam como estão", () => {
    const funis = [IDS.funil, IDS.funilComparacao];
    const valida = valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao });
    expect(premissaEfetiva(valida, funis)).toBe(valida);
    const nula = valoresCompletos();
    expect(premissaEfetiva(nula, funis)).toBe(nula);
    const orfa = valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilDeOutroProjeto });
    expect(premissaEfetiva(orfa, funis)).toEqual(valoresCompletos());
    expect(orfa.lancamentoComparacaoFunnelId).toBe(IDS.funilDeOutroProjeto); // não muta a entrada
  });

  it("sem comparação gravada: não consulta os funis do projeto e nada muda (AC3)", async () => {
    const m = mundoPadrao();
    m.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos(), { validado: true }));
    const store = storeEmMemoria(m);
    const r = await loadDebriefingConfigRaw(db, IDS.debriefing, store);
    expect(r?.config?.comparacaoRemovida).toBe(false);
    expect(r?.config?.validado).toBe(true);
    expect(store.funisDoProjeto).not.toHaveBeenCalled();
  });
});
