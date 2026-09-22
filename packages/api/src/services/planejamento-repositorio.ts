/**
 * Story 48.1 — repositório do Painel de Planejamento (Inputs Financeiros).
 *
 * A única camada que LÊ e ESCREVE `plan_simulators`. Existe separada da rota
 * pelo mesmo motivo do módulo de nomenclatura: a rota fica testável com um
 * repositório em memória (`fastify.planejamentoRepo`), e o Drizzle fica em um
 * lugar só.
 *
 * Também carrega a cópia local de `getProjectAccess` (A4 do @architect): é o
 * padrão do repo — 28 arquivos de rota têm a própria cópia "pra não criar
 * dependência circular" — e é o caminho que não toca `funnel-stages.ts`.
 *
 * `numeric` do Postgres chega como STRING pelo `pg`; este módulo devolve
 * `number | null` e a rota nunca vê string.
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnels, planOrganicBlocks, planOrganicCombinations, planSimulators, projectMembers, projects } from "../db/schema.js";
import {
  CAMPOS_DOS_INPUTS_FINANCEIROS,
  CAMPOS_DO_BLOCO_ORGANICO,
  CANAIS_ORGANICOS,
  INDICES_DAS_COMBINACOES,
  organicosVazios,
  type CanalOrganico,
  type InputsFinanceiros,
  type OrganicosDoSimulador,
} from "@loyola-x/shared";

export type CampoDosInputs = (typeof CAMPOS_DOS_INPUTS_FINANCEIROS)[number];

/** As 26 entradas escalares, como `number | null` (nunca `undefined`, nunca string). */
export type InputsPersistidos = Record<CampoDosInputs, number | null>;

export interface InputsLidos {
  inputs: InputsPersistidos;
  /** ISO; `null` quando o funil nunca salvou (a linha não existe). */
  updatedAt: string | null;
}

export interface RepositorioDePlanejamento {
  /** `true` se o usuário enxerga o projeto (guest só quando é membro). */
  acessoAoProjeto(projectId: string, userId: string, userRole: string): Promise<boolean>;
  /** Funil DO projeto, com o tipo — `null` se não existe ou é de outro projeto. */
  resolverFunil(projectId: string, funnelId: string): Promise<{ id: string; type: string } | null>;
  /** `null` quando o funil nunca salvou — a rota devolve as 26 entradas `null`. */
  lerInputs(funnelId: string): Promise<InputsLidos | null>;
  /** Upsert por `funnel_id` (índice único, A1). Devolve o que ficou gravado. */
  gravarInputs(funnelId: string, inputs: InputsPersistidos, userId: string | null): Promise<InputsLidos>;

  // ---- Story 48.3 — blocos e combinações dos canais orgânicos ----
  /** `id` da linha de `plan_simulators` do funil, ou `null` se os Inputs Financeiros nunca foram salvos. */
  idDoSimulador(funnelId: string): Promise<string | null>;
  /** Blocos e combinações do simulador; `null` quando não há simulador nem linha-filha (a rota devolve a forma vazia). */
  lerOrganicos(funnelId: string): Promise<OrganicosLidos | null>;
  /** Upsert dos 6 blocos e das 5 combinações, numa transação. Exige o simulador (`idDoSimulador`). */
  gravarOrganicos(simulatorId: string, dados: OrganicosDoSimulador): Promise<OrganicosLidos>;
}

/** Story 48.3 — o que a API devolve para a aba 2: só entradas + o carimbo mais recente. */
export interface OrganicosLidos extends OrganicosDoSimulador {
  /** ISO do bloco/combinação gravado por último; `null` quando nada foi salvo. */
  updatedAt: string | null;
}

/** Todas as 26 chaves em `null` — o "formulário vazio". */
export function inputsVazios(): InputsPersistidos {
  const out = {} as InputsPersistidos;
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) out[k] = null;
  return out;
}

/** `numeric`/`integer` do Drizzle → `number | null`. String não numérica vira `null`, nunca `NaN`. */
function paraNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `number | null` → o que o Drizzle espera na coluna (`numeric` recebe string). */
function paraColuna(v: number | null): string | null {
  return v === null ? null : String(v);
}

const CAMPOS_INTEIROS: ReadonlySet<CampoDosInputs> = new Set<CampoDosInputs>([
  "baseWhatsapp",
  "baseEmail",
  "baseInstagram",
  "baseTelegram",
  "baseYoutube",
  "baseAreaMembros",
]);

type LinhaDoBanco = typeof planSimulators.$inferSelect;

function linhaParaInputs(linha: LinhaDoBanco): InputsPersistidos {
  const out = inputsVazios();
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) out[k] = paraNumero(linha[k]);
  return out;
}

function inputsParaLinha(inputs: InputsPersistidos): Partial<typeof planSimulators.$inferInsert> {
  const out: Record<string, string | number | null> = {};
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) {
    out[k] = CAMPOS_INTEIROS.has(k) ? inputs[k] : paraColuna(inputs[k]);
  }
  return out as Partial<typeof planSimulators.$inferInsert>;
}

// ---- Story 48.3 — conversões das tabelas-filhas ----

/** Canal canônico (48.2) → coluna `sel_*` de `plan_organic_combinations`. */
const COLUNA_DA_SELECAO = {
  whatsapp: "selWhatsapp",
  email: "selEmail",
  instagram: "selInstagram",
  telegram: "selTelegram",
  youtube: "selYoutube",
  area_membros: "selAreaMembros",
} as const satisfies Record<CanalOrganico, keyof typeof planOrganicCombinations.$inferSelect>;

type LinhaDeBloco = typeof planOrganicBlocks.$inferSelect;
type LinhaDeCombinacao = typeof planOrganicCombinations.$inferSelect;

function ehCanal(v: string): v is CanalOrganico {
  return (CANAIS_ORGANICOS as readonly string[]).includes(v);
}

/** Linhas do banco → a forma fixa (6 canais, 5 combinações); o que não existe fica `null`. */
function linhasParaOrganicos(blocos: LinhaDeBloco[], combinacoes: LinhaDeCombinacao[]): OrganicosLidos {
  const out: OrganicosLidos = { ...organicosVazios(), updatedAt: null };
  let ultimo: Date | null = null;
  const marcar = (d: Date) => {
    if (ultimo === null || d > ultimo) ultimo = d;
  };
  for (const linha of blocos) {
    if (!ehCanal(linha.canal)) continue; // CHECK impede; cinto
    const b = out.blocos[linha.canal];
    for (const k of CAMPOS_DO_BLOCO_ORGANICO) b[k] = paraNumero(linha[k]);
    marcar(linha.updatedAt);
  }
  for (const linha of combinacoes) {
    const alvo = out.combinacoes.find((c) => c.indice === linha.indice);
    if (!alvo) continue; // CHECK impede; cinto
    for (const canal of CANAIS_ORGANICOS) alvo.selecoes[canal] = paraNumero(linha[COLUNA_DA_SELECAO[canal]]);
    marcar(linha.updatedAt);
  }
  out.updatedAt = ultimo === null ? null : (ultimo as Date).toISOString();
  return out;
}

export function criarRepositorioDePlanejamento(db: Database): RepositorioDePlanejamento {
  return {
    async acessoAoProjeto(projectId, userId, userRole) {
      if (userRole === "guest") {
        const [member] = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .limit(1);
        if (!member) return false;
      }
      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
      return project != null;
    },

    async resolverFunil(projectId, funnelId) {
      const [funnel] = await db
        .select({ id: funnels.id, type: funnels.type })
        .from(funnels)
        .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
        .limit(1);
      return funnel ?? null;
    },

    async lerInputs(funnelId) {
      const [linha] = await db.select().from(planSimulators).where(eq(planSimulators.funnelId, funnelId)).limit(1);
      if (!linha) return null;
      return { inputs: linhaParaInputs(linha), updatedAt: linha.updatedAt.toISOString() };
    },

    async gravarInputs(funnelId, inputs, userId) {
      const valores = { ...inputsParaLinha(inputs), updatedBy: userId, updatedAt: new Date() };
      const [linha] = await db
        .insert(planSimulators)
        .values({ ...valores, funnelId })
        .onConflictDoUpdate({ target: planSimulators.funnelId, set: valores })
        .returning();
      return { inputs: linhaParaInputs(linha), updatedAt: linha.updatedAt.toISOString() };
    },

    // ---- Story 48.3 ----
    async idDoSimulador(funnelId) {
      const [linha] = await db.select({ id: planSimulators.id }).from(planSimulators).where(eq(planSimulators.funnelId, funnelId)).limit(1);
      return linha?.id ?? null;
    },

    async lerOrganicos(funnelId) {
      const [sim] = await db.select({ id: planSimulators.id }).from(planSimulators).where(eq(planSimulators.funnelId, funnelId)).limit(1);
      if (!sim) return null;
      const blocos = await db.select().from(planOrganicBlocks).where(eq(planOrganicBlocks.simulatorId, sim.id));
      const combinacoes = await db.select().from(planOrganicCombinations).where(eq(planOrganicCombinations.simulatorId, sim.id));
      if (blocos.length === 0 && combinacoes.length === 0) return null;
      return linhasParaOrganicos(blocos, combinacoes);
    },

    async gravarOrganicos(simulatorId, dados) {
      const agora = new Date();
      return db.transaction(async (tx) => {
        const blocos: LinhaDeBloco[] = [];
        for (const canal of CANAIS_ORGANICOS) {
          const b = dados.blocos[canal];
          const valores = {
            conversaoMedia: paraColuna(b.conversaoMedia),
            variacaoConversao: paraColuna(b.variacaoConversao),
            variacaoReceita: paraColuna(b.variacaoReceita),
            taxaCaptacao: paraColuna(b.taxaCaptacao),
            faixaVariacao: paraColuna(b.faixaVariacao),
            fracaoCenario1: paraColuna(b.fracaoCenario1),
            nivelAssumido: b.nivelAssumido,
            updatedAt: agora,
          };
          const [linha] = await tx
            .insert(planOrganicBlocks)
            .values({ ...valores, simulatorId, canal })
            .onConflictDoUpdate({ target: [planOrganicBlocks.simulatorId, planOrganicBlocks.canal], set: valores })
            .returning();
          blocos.push(linha);
        }
        const combinacoes: LinhaDeCombinacao[] = [];
        for (const indice of INDICES_DAS_COMBINACOES) {
          const sel = dados.combinacoes.find((c) => c.indice === indice)?.selecoes;
          const valores = {
            selWhatsapp: sel?.whatsapp ?? null,
            selEmail: sel?.email ?? null,
            selInstagram: sel?.instagram ?? null,
            selTelegram: sel?.telegram ?? null,
            selYoutube: sel?.youtube ?? null,
            selAreaMembros: sel?.area_membros ?? null,
            updatedAt: agora,
          };
          const [linha] = await tx
            .insert(planOrganicCombinations)
            .values({ ...valores, simulatorId, indice })
            .onConflictDoUpdate({ target: [planOrganicCombinations.simulatorId, planOrganicCombinations.indice], set: valores })
            .returning();
          combinacoes.push(linha);
        }
        return linhasParaOrganicos(blocos, combinacoes);
      });
    },
  };
}

/** Só para teste e para a rota: um repositório em memória com a mesma interface. */
export function criarRepositorioEmMemoria(seed: {
  projetos: { id: string; membros?: string[] }[];
  funis: { id: string; projectId: string; type: string }[];
}): RepositorioDePlanejamento & { linhas: Map<string, InputsLidos>; organicos: Map<string, OrganicosLidos> } {
  const linhas = new Map<string, InputsLidos>();
  /** Story 48.3 — por funil (o simulador em memória usa o `funnelId` como `id`). */
  const organicos = new Map<string, OrganicosLidos>();
  return {
    linhas,
    organicos,
    async acessoAoProjeto(projectId, userId, userRole) {
      const p = seed.projetos.find((x) => x.id === projectId);
      if (!p) return false;
      return userRole !== "guest" || (p.membros ?? []).includes(userId);
    },
    async resolverFunil(projectId, funnelId) {
      const f = seed.funis.find((x) => x.id === funnelId && x.projectId === projectId);
      return f ? { id: f.id, type: f.type } : null;
    },
    async lerInputs(funnelId) {
      return linhas.get(funnelId) ?? null;
    },
    async gravarInputs(funnelId, inputs) {
      const gravado = { inputs: { ...inputs }, updatedAt: new Date().toISOString() };
      linhas.set(funnelId, gravado);
      return gravado;
    },
    async idDoSimulador(funnelId) {
      return linhas.has(funnelId) ? funnelId : null;
    },
    async lerOrganicos(funnelId) {
      return organicos.get(funnelId) ?? null;
    },
    async gravarOrganicos(simulatorId, dados) {
      const gravado: OrganicosLidos = {
        blocos: structuredClone(dados.blocos),
        combinacoes: structuredClone(dados.combinacoes),
        updatedAt: new Date().toISOString(),
      };
      organicos.set(simulatorId, gravado);
      return gravado;
    },
  };
}

export type { InputsFinanceiros };
