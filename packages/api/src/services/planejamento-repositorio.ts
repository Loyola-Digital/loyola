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
import { funnels, planSimulators, projectMembers, projects } from "../db/schema.js";
import { CAMPOS_DOS_INPUTS_FINANCEIROS, type InputsFinanceiros } from "@loyola-x/shared";

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
  };
}

/** Só para teste e para a rota: um repositório em memória com a mesma interface. */
export function criarRepositorioEmMemoria(seed: {
  projetos: { id: string; membros?: string[] }[];
  funis: { id: string; projectId: string; type: string }[];
}): RepositorioDePlanejamento & { linhas: Map<string, InputsLidos> } {
  const linhas = new Map<string, InputsLidos>();
  return {
    linhas,
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
  };
}

export type { InputsFinanceiros };
