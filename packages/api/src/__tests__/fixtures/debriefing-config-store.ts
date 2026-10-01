/**
 * Story 49.1 — store em memória para os testes da config do debriefing.
 *
 * Fixture (não termina em `.test.ts`, então o vitest não o coleta).
 * Implementa `DebriefingConfigStore` sobre mapas, com cada método embrulhado em
 * `vi.fn` para os testes conferirem O QUE foi gravado (corpo enviado ao banco)
 * e QUAIS leituras aconteceram (o gate de tipo não pode tocar loader nenhum).
 */

import { vi } from "vitest";
import type {
  ContextoDaEtapa,
  DebriefingConfigRow,
  DebriefingConfigStore,
  PerguntaDaPesquisa,
  ValoresDaConfig,
} from "../../services/debriefing-config.js";

// UUIDs v4 válidos (o zod 4 confere versão e variante).
export const IDS = {
  projeto: "10000000-0000-4000-8000-000000000001",
  outroProjeto: "10000000-0000-4000-8000-000000000002",
  funil: "20000000-0000-4000-8000-000000000001",
  funilComparacao: "20000000-0000-4000-8000-000000000002",
  funilDeOutroProjeto: "20000000-0000-4000-8000-000000000003",
  debriefing: "30000000-0000-4000-8000-000000000001",
  captacao: "30000000-0000-4000-8000-000000000002",
  vendasCaptacao: "30000000-0000-4000-8000-000000000003",
  principal: "30000000-0000-4000-8000-000000000004",
  downsell: "30000000-0000-4000-8000-000000000005",
  reabertura: "30000000-0000-4000-8000-000000000006",
  etapaDeOutroFunil: "30000000-0000-4000-8000-000000000007",
  etapaNaoDebriefing: "30000000-0000-4000-8000-000000000008",
  usuario: "40000000-0000-4000-8000-000000000001",
} as const;

export function contexto(over: Partial<ContextoDaEtapa> = {}): ContextoDaEtapa {
  return {
    stageId: IDS.debriefing,
    stageName: "Debriefing",
    stageType: "debriefing",
    funnelId: IDS.funil,
    funnelName: "xx-pg09",
    funnelType: "launch",
    projectId: IDS.projeto,
    projectName: "Expert Teste",
    ...over,
  };
}

/** Valores COMPLETOS de um lançamento — cada teste estraga só o que quer provar. */
export function valoresCompletos(over: Partial<ValoresDaConfig> = {}): ValoresDaConfig {
  return {
    inicioCaptacao: "2026-04-17",
    aberturaCarrinho: "2026-05-12",
    fimCarrinho: "2026-05-16",
    reabertura: { houve: false },
    downsell: { houve: true, abertura: "2026-05-18", fim: "2026-05-20" },
    lancamentoComparacaoFunnelId: null,
    etapas: [
      { stageId: IDS.captacao, papel: "leads-captacao" },
      { stageId: IDS.vendasCaptacao, papel: "vendas-captacao" },
      { stageId: IDS.principal, papel: "vendas-principal" },
      { stageId: IDS.downsell, papel: "vendas-downsell" },
    ],
    perguntasConfirmadas: { [IDS.captacao]: { faixa: "faixa", renda: "q_renda" } },
    closerMediums: ["x1", "comercial"],
    closerPorSellerName: false,
    dimensaoDeCriativo: "ia-humano",
    ...over,
  };
}

export function linha(
  stageId: string,
  valores: ValoresDaConfig,
  over: Partial<DebriefingConfigRow> = {},
): DebriefingConfigRow {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    stageId,
    ...valores,
    validado: false,
    validadoEm: null,
    validadoPor: null,
    createdAt: new Date("2026-09-30T12:00:00Z"),
    updatedAt: new Date("2026-09-30T12:00:00Z"),
    ...over,
  };
}

export interface Mundo {
  contextos: Map<string, ContextoDaEtapa>;
  linhas: Map<string, DebriefingConfigRow>;
  etapasPorFunil: Map<string, { id: string; name: string; stageType: string }[]>;
  funisPorProjeto: Map<string, string[]>;
  comPesquisa: Set<string>;
  perguntas: Map<string, PerguntaDaPesquisa[] | Error>;
  impostoPorProjeto: Map<string, string | null>;
  usuarios: Map<string, string>;
}

/** Funil de lançamento padrão: 6 etapas + a de debriefing; captação tem pesquisa. */
export function mundoPadrao(ctx: ContextoDaEtapa = contexto()): Mundo {
  const etapas = [
    { id: IDS.captacao, name: "Captação", stageType: "free" },
    { id: IDS.vendasCaptacao, name: "Captação Paga", stageType: "sales" },
    { id: IDS.principal, name: "Principal", stageType: "sales" },
    { id: IDS.downsell, name: "Downsell", stageType: "sales" },
    { id: IDS.reabertura, name: "Reabertura", stageType: "sales" },
    { id: IDS.etapaNaoDebriefing, name: "Aplicação", stageType: "application" },
    { id: ctx.stageId, name: "Debriefing", stageType: "debriefing" },
  ];
  return {
    contextos: new Map([
      [ctx.stageId, ctx],
      [
        IDS.etapaNaoDebriefing,
        { ...ctx, stageId: IDS.etapaNaoDebriefing, stageName: "Aplicação", stageType: "application" },
      ],
    ]),
    linhas: new Map(),
    etapasPorFunil: new Map([[ctx.funnelId, etapas]]),
    funisPorProjeto: new Map([[ctx.projectId, [ctx.funnelId, IDS.funilComparacao]]]),
    comPesquisa: new Set([IDS.captacao]),
    perguntas: new Map([
      [
        IDS.captacao,
        [
          { key: "faixa", label: "Faixa" },
          { key: "q_renda", label: "Qual sua renda?" },
          { key: "q_idade", label: "Qual sua idade?" },
        ],
      ],
    ]),
    impostoPorProjeto: new Map(),
    usuarios: new Map([[IDS.usuario, "Fulano do Time"]]),
  };
}

export function storeEmMemoria(m: Mundo) {
  const store = {
    contextoDaEtapa: vi.fn(async (stageId: string) => m.contextos.get(stageId) ?? null),
    linhaDaConfig: vi.fn(async (stageId: string) => m.linhas.get(stageId) ?? null),
    etapasDoFunil: vi.fn(async (funnelId: string) => m.etapasPorFunil.get(funnelId) ?? []),
    funisDoProjeto: vi.fn(async (projectId: string) => m.funisPorProjeto.get(projectId) ?? []),
    etapasComPesquisa: vi.fn(async (ids: string[]) => ids.filter((id) => m.comPesquisa.has(id))),
    impostoDoProjeto: vi.fn(async (projectId: string) => m.impostoPorProjeto.get(projectId) ?? null),
    perguntasDaEtapa: vi.fn(async (stageId: string) => {
      const p = m.perguntas.get(stageId);
      if (p instanceof Error) throw p;
      return p ?? null;
    }),
    gravar: vi.fn(
      async (stageId: string, valores: ValoresDaConfig, opcoes: { resetarValidado: boolean }) => {
        // Upsert, como o store real (ON CONFLICT (stage_id)).
        const atual = m.linhas.get(stageId);
        if (!atual) {
          m.linhas.set(stageId, linha(stageId, valores));
          return;
        }
        m.linhas.set(stageId, {
          ...atual,
          ...valores,
          ...(opcoes.resetarValidado ? { validado: false, validadoEm: null, validadoPor: null } : {}),
        });
      },
    ),
    marcarValidado: vi.fn(async (stageId: string, userId: string) => {
      const atual = m.linhas.get(stageId);
      if (!atual) return null;
      const em = new Date("2026-10-01T10:00:00Z");
      m.linhas.set(stageId, { ...atual, validado: true, validadoEm: em, validadoPor: userId });
      return em;
    }),
    nomeDoUsuario: vi.fn(async (userId: string) => m.usuarios.get(userId) ?? null),
  } satisfies DebriefingConfigStore;
  return store;
}
