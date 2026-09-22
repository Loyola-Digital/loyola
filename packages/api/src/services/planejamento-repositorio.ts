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

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  campanhasDoLancamento,
  consolidarInvestimento,
  type GastoDaCampanha,
  type InvestimentoRealizado,
} from "../utils/planejamento-investimento.js";
import {
  funnelStages,
  funnels,
  metaCampaignInsightsDaily,
  planFinalScenarios,
  planOrganicBlocks,
  planOrganicCombinations,
  planPaidBlocks,
  planPaidCombinations,
  planSimulators,
  projectMembers,
  projects,
} from "../db/schema.js";
import {
  CAMPOS_DOS_INPUTS_FINANCEIROS,
  CAMPOS_DO_BLOCO_ORGANICO,
  CAMPOS_DO_BLOCO_PAGO,
  CANAIS_ORGANICOS,
  FONTES_PAGAS,
  INDICES_DAS_COMBINACOES,
  organicosVazios,
  pagosVazios,
  rotulosVazios,
  ehRotuloDoCenario,
  type CanalOrganico,
  type FontePaga,
  type InputsFinanceiros,
  type OrganicosDoSimulador,
  type PagosDoSimulador,
  type RotulosDoSimulador,
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

  // ---- Story 48.4 — blocos e combinações das fontes pagas ----
  /** Blocos e combinações pagas do simulador; `null` quando não há simulador nem linha-filha. */
  lerPagos(funnelId: string): Promise<PagosLidos | null>;
  /** Upsert dos 4 blocos e das 5 combinações, numa transação. Exige o simulador (`idDoSimulador`). */
  gravarPagos(simulatorId: string, dados: PagosDoSimulador): Promise<PagosLidos>;

  // ---- Story 48.5 — rótulos dos cinco cenários do Resumo Final ----
  /** Rótulos do simulador; `null` quando não há simulador nem linha. */
  lerRotulos(funnelId: string): Promise<RotulosLidos | null>;
  /** Upsert dos 5 cenários, numa transação. Exige o simulador (`idDoSimulador`). */
  gravarRotulos(simulatorId: string, dados: RotulosDoSimulador): Promise<RotulosLidos>;

  // ---- Story 48.9 — bases possíveis (lançamentos anteriores do projeto) ----
  /**
   * Todos os funis de LANÇAMENTO do projeto, com a data de criação e se já
   * têm simulador salvo. Quem filtra por tipo e por "anterior" é o módulo puro
   * do shared — aqui só sai o que o banco sabe.
   */
  funisDeLancamento(projectId: string): Promise<FunilDeLancamento[]>;

  // ---- Story 48.11 — o REALIZADO de um lançamento (camada B) ----
  /** Etapas do funil, para a tela achar a de vendas sem adivinhar por nome. */
  etapasDoFunil(funnelId: string): Promise<{ id: string; nome: string; stageType: string }[]>;
  /**
   * Quantas campanhas do GOOGLE o lançamento tem vinculadas.
   *
   * Hoje são zero nos 11 lançamentos reais (medido em 2026-09-22), e é isso que
   * torna verdadeiro o "100 % Meta" da tela. No dia em que alguém vincular uma,
   * esse 100 % vira mentira em silêncio — este contador é o que faz a tela
   * parar de afirmá-lo.
   */
  campanhasDeGoogleDoFunil(funnelId: string): Promise<number>;
  /**
   * Investimento Meta do lançamento, separado por temperatura.
   *
   * As campanhas de um funil vivem em `funnels.campaigns` E em
   * `funnel_stages.campaigns` — na maioria dos lançamentos o vínculo está no
   * STAGE (conferido em 2026-09-22: 9 dos 11 com `funnels.campaigns` vazio e
   * spend real pelo stage). Ler só o funil devolveria zero, calado.
   */
  investimentoMetaDoFunil(projectId: string, funnelId: string): Promise<InvestimentoRealizado>;
}

/** Story 48.9 — um funil de lançamento do projeto, como candidato a base. */
export interface FunilDeLancamento {
  id: string;
  nome: string;
  criadoEm: string;
  /** `true` quando existe linha em `plan_simulators` — só quem já preencheu serve de base. */
  temSimulador: boolean;
  /** ISO da última gravação dos Inputs Financeiros; `null` sem simulador. */
  simuladorAtualizadoEm: string | null;
}

/** Story 48.5 — o que a API devolve para a aba 4: só os rótulos + o carimbo mais recente. */
export interface RotulosLidos extends RotulosDoSimulador {
  updatedAt: string | null;
}

/** Story 48.4 — o que a API devolve para a aba 3: só entradas + o carimbo mais recente. */
export interface PagosLidos extends PagosDoSimulador {
  updatedAt: string | null;
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
  "baseManychat",
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
  manychat: "selManychat",
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

// ---- Story 48.4 — conversões das tabelas-filhas pagas ----

/** Fonte canônica (48.2) → coluna `sel_*` de `plan_paid_combinations`. */
const COLUNA_DA_SELECAO_PAGA = {
  meta_quente: "selMetaQuente",
  meta_frio: "selMetaFrio",
  google_quente: "selGoogleQuente",
  google_frio: "selGoogleFrio",
} as const satisfies Record<FontePaga, keyof typeof planPaidCombinations.$inferSelect>;

type LinhaDeBlocoPago = typeof planPaidBlocks.$inferSelect;
type LinhaDeCombinacaoPaga = typeof planPaidCombinations.$inferSelect;

function ehFonte(v: string): v is FontePaga {
  return (FONTES_PAGAS as readonly string[]).includes(v);
}

function linhasParaPagos(blocos: LinhaDeBlocoPago[], combinacoes: LinhaDeCombinacaoPaga[]): PagosLidos {
  const out: PagosLidos = { ...pagosVazios(), updatedAt: null };
  let ultimo: Date | null = null;
  const marcar = (d: Date) => {
    if (ultimo === null || d > ultimo) ultimo = d;
  };
  for (const linha of blocos) {
    if (!ehFonte(linha.fonte)) continue; // CHECK impede; cinto
    const b = out.blocos[linha.fonte];
    for (const k of CAMPOS_DO_BLOCO_PAGO) b[k] = paraNumero(linha[k]);
    marcar(linha.updatedAt);
  }
  for (const linha of combinacoes) {
    const alvo = out.combinacoes.find((c) => c.indice === linha.indice);
    if (!alvo) continue;
    for (const fonte of FONTES_PAGAS) alvo.selecoes[fonte] = paraNumero(linha[COLUNA_DA_SELECAO_PAGA[fonte]]);
    marcar(linha.updatedAt);
  }
  out.updatedAt = ultimo === null ? null : (ultimo as Date).toISOString();
  return out;
}

// ---- Story 48.5 — conversão da tabela de rótulos ----

type LinhaDeCenario = typeof planFinalScenarios.$inferSelect;

function linhasParaRotulos(linhas: LinhaDeCenario[]): RotulosLidos {
  const out: RotulosLidos = { ...rotulosVazios(), updatedAt: null };
  let ultimo: Date | null = null;
  for (const linha of linhas) {
    const alvo = out.cenarios.find((c) => c.indice === linha.indice);
    if (!alvo) continue; // CHECK impede; cinto
    alvo.rotulo = ehRotuloDoCenario(linha.rotulo) ? linha.rotulo : null;
    if (ultimo === null || linha.updatedAt > ultimo) ultimo = linha.updatedAt;
  }
  out.updatedAt = ultimo === null ? null : (ultimo as Date).toISOString();
  return out;
}

/**
 * Story 48.11 — o filtro do gasto, isolado para poder ser INSPECIONADO.
 *
 * `projectId` não é decorativo: é a primeira coluna da PK de
 * `meta_campaign_insights_daily`. Sem ele, o gasto de uma campanha que outro
 * projeto também vinculou entraria no total deste lançamento — e um teste com
 * banco mockado não pegaria, porque o recorte estaria na fila, não no
 * predicado. Por isso o teste serializa ESTA expressão.
 */
export function condicaoDoGasto(projectId: string, campaignIds: string[]) {
  return and(
    eq(metaCampaignInsightsDaily.projectId, projectId),
    inArray(metaCampaignInsightsDaily.campaignId, campaignIds),
  );
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
            selManychat: sel?.manychat ?? null,
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

    // ---- Story 48.4 ----
    async lerPagos(funnelId) {
      const [sim] = await db.select({ id: planSimulators.id }).from(planSimulators).where(eq(planSimulators.funnelId, funnelId)).limit(1);
      if (!sim) return null;
      const blocos = await db.select().from(planPaidBlocks).where(eq(planPaidBlocks.simulatorId, sim.id));
      const combinacoes = await db.select().from(planPaidCombinations).where(eq(planPaidCombinations.simulatorId, sim.id));
      if (blocos.length === 0 && combinacoes.length === 0) return null;
      return linhasParaPagos(blocos, combinacoes);
    },

    async gravarPagos(simulatorId, dados) {
      const agora = new Date();
      return db.transaction(async (tx) => {
        const blocos: LinhaDeBlocoPago[] = [];
        for (const fonte of FONTES_PAGAS) {
          const b = dados.blocos[fonte];
          const valores = {
            pctCaptacao: paraColuna(b.pctCaptacao),
            conversaoMedia: paraColuna(b.conversaoMedia),
            variacaoConversao: paraColuna(b.variacaoConversao),
            variacaoReceita: paraColuna(b.variacaoReceita),
            cplMedioHistorico: paraColuna(b.cplMedioHistorico),
            faixaVariacao: paraColuna(b.faixaVariacao),
            fracaoCenario1: paraColuna(b.fracaoCenario1),
            nivelAssumido: b.nivelAssumido,
            updatedAt: agora,
          };
          const [linha] = await tx
            .insert(planPaidBlocks)
            .values({ ...valores, simulatorId, fonte })
            .onConflictDoUpdate({ target: [planPaidBlocks.simulatorId, planPaidBlocks.fonte], set: valores })
            .returning();
          blocos.push(linha);
        }
        const combinacoes: LinhaDeCombinacaoPaga[] = [];
        for (const indice of INDICES_DAS_COMBINACOES) {
          const sel = dados.combinacoes.find((c) => c.indice === indice)?.selecoes;
          const valores = {
            selMetaQuente: sel?.meta_quente ?? null,
            selMetaFrio: sel?.meta_frio ?? null,
            selGoogleQuente: sel?.google_quente ?? null,
            selGoogleFrio: sel?.google_frio ?? null,
            updatedAt: agora,
          };
          const [linha] = await tx
            .insert(planPaidCombinations)
            .values({ ...valores, simulatorId, indice })
            .onConflictDoUpdate({ target: [planPaidCombinations.simulatorId, planPaidCombinations.indice], set: valores })
            .returning();
          combinacoes.push(linha);
        }
        return linhasParaPagos(blocos, combinacoes);
      });
    },

    // ---- Story 48.5 ----
    async lerRotulos(funnelId) {
      const [sim] = await db.select({ id: planSimulators.id }).from(planSimulators).where(eq(planSimulators.funnelId, funnelId)).limit(1);
      if (!sim) return null;
      const linhas = await db.select().from(planFinalScenarios).where(eq(planFinalScenarios.simulatorId, sim.id));
      if (linhas.length === 0) return null;
      return linhasParaRotulos(linhas);
    },

    async gravarRotulos(simulatorId, dados) {
      const agora = new Date();
      return db.transaction(async (tx) => {
        const linhas: LinhaDeCenario[] = [];
        for (const indice of INDICES_DAS_COMBINACOES) {
          const rotulo = dados.cenarios.find((c) => c.indice === indice)?.rotulo ?? null;
          const valores = { rotulo, updatedAt: agora };
          const [linha] = await tx
            .insert(planFinalScenarios)
            .values({ ...valores, simulatorId, indice })
            .onConflictDoUpdate({ target: [planFinalScenarios.simulatorId, planFinalScenarios.indice], set: valores })
            .returning();
          linhas.push(linha);
        }
        return linhasParaRotulos(linhas);
      });
    },

    // ---- Story 48.9 ----
    async funisDeLancamento(projectId) {
      const linhas = await db
        .select({
          id: funnels.id,
          nome: funnels.name,
          criadoEm: funnels.createdAt,
          simuladorAtualizadoEm: planSimulators.updatedAt,
        })
        .from(funnels)
        .leftJoin(planSimulators, eq(planSimulators.funnelId, funnels.id))
        .where(and(eq(funnels.projectId, projectId), eq(funnels.type, "launch")));
      return linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        criadoEm: l.criadoEm.toISOString(),
        temSimulador: l.simuladorAtualizadoEm !== null,
        simuladorAtualizadoEm: l.simuladorAtualizadoEm?.toISOString() ?? null,
      }));
    },

    // ---- Story 48.11 ----
    async etapasDoFunil(funnelId) {
      const linhas = await db
        .select({ id: funnelStages.id, nome: funnelStages.name, stageType: funnelStages.stageType })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId));
      return linhas.map((l) => ({ id: l.id, nome: l.nome, stageType: String(l.stageType) }));
    },

    async campanhasDeGoogleDoFunil(funnelId) {
      const [funil] = await db.select({ google: funnels.googleAdsCampaigns }).from(funnels).where(eq(funnels.id, funnelId)).limit(1);
      const etapas = await db
        .select({ google: funnelStages.googleAdsCampaigns })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId));
      const ids = new Set<string>();
      for (const c of funil?.google ?? []) ids.add(c.id);
      for (const e of etapas) for (const c of e.google ?? []) ids.add(c.id);
      return ids.size;
    },

    async investimentoMetaDoFunil(projectId, funnelId) {
      const [funil] = await db.select({ campaigns: funnels.campaigns }).from(funnels).where(eq(funnels.id, funnelId)).limit(1);
      const etapas = await db.select({ campaigns: funnelStages.campaigns }).from(funnelStages).where(eq(funnelStages.funnelId, funnelId));

      const campanhas = campanhasDoLancamento(
        funil?.campaigns,
        etapas.map((e) => e.campaigns),
      );
      if (campanhas.size === 0) return consolidarInvestimento(campanhas, []);

      const gasto = await db
        .select({
          campaignId: metaCampaignInsightsDaily.campaignId,
          spend: sql<string>`sum(${metaCampaignInsightsDaily.spend})`,
          de: sql<string>`min(${metaCampaignInsightsDaily.dateStart})`,
          ate: sql<string>`max(${metaCampaignInsightsDaily.dateStart})`,
        })
        .from(metaCampaignInsightsDaily)
        .where(condicaoDoGasto(projectId, [...campanhas.keys()]))
        .groupBy(metaCampaignInsightsDaily.campaignId);

      return consolidarInvestimento(campanhas, gasto);
    },
  };
}

/** Só para teste e para a rota: um repositório em memória com a mesma interface. */
export function criarRepositorioEmMemoria(seed: {
  projetos: { id: string; membros?: string[] }[];
  funis: {
    id: string;
    projectId: string;
    type: string;
    nome?: string;
    criadoEm?: string;
    /** Story 48.11 — etapas e campanhas do funil, para as rotas que as leem. */
    etapas?: { id: string; nome: string; stageType: string }[];
    campanhas?: { id: string; name: string }[];
    /** Gasto por campanha, como sai do `group by` (o cálculo é da função pura). */
    gasto?: GastoDaCampanha[];
    /** Story 48.11 — quantas campanhas do Google estão vinculadas. */
    campanhasDeGoogle?: number;
  }[];
}): RepositorioDePlanejamento & {
  linhas: Map<string, InputsLidos>;
  organicos: Map<string, OrganicosLidos>;
  pagos: Map<string, PagosLidos>;
  rotulos: Map<string, RotulosLidos>;
} {
  const linhas = new Map<string, InputsLidos>();
  /** Story 48.3 — por funil (o simulador em memória usa o `funnelId` como `id`). */
  const organicos = new Map<string, OrganicosLidos>();
  /** Story 48.4 — idem. */
  const pagos = new Map<string, PagosLidos>();
  /** Story 48.5 — idem. */
  const rotulos = new Map<string, RotulosLidos>();
  return {
    linhas,
    organicos,
    pagos,
    rotulos,
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
    async lerPagos(funnelId) {
      return pagos.get(funnelId) ?? null;
    },
    async gravarPagos(simulatorId, dados) {
      const gravado: PagosLidos = {
        blocos: structuredClone(dados.blocos),
        combinacoes: structuredClone(dados.combinacoes),
        updatedAt: new Date().toISOString(),
      };
      pagos.set(simulatorId, gravado);
      return gravado;
    },
    async lerRotulos(funnelId) {
      return rotulos.get(funnelId) ?? null;
    },
    async gravarRotulos(simulatorId, dados) {
      const gravado: RotulosLidos = { cenarios: structuredClone(dados.cenarios), updatedAt: new Date().toISOString() };
      rotulos.set(simulatorId, gravado);
      return gravado;
    },
    async etapasDoFunil(funnelId) {
      return seed.funis.find((f) => f.id === funnelId)?.etapas ?? [];
    },
    async campanhasDeGoogleDoFunil(funnelId) {
      return seed.funis.find((f) => f.id === funnelId)?.campanhasDeGoogle ?? 0;
    },
    async investimentoMetaDoFunil(_projectId, funnelId) {
      const f = seed.funis.find((x) => x.id === funnelId);
      // A MESMA consolidação do repositório real — o duplo troca a consulta,
      // nunca a conta.
      return consolidarInvestimento(campanhasDoLancamento(f?.campanhas, []), f?.gasto ?? []);
    },
    async funisDeLancamento(projectId) {
      return seed.funis
        .filter((f) => f.projectId === projectId && f.type === "launch")
        .map((f) => ({
          id: f.id,
          nome: f.nome ?? f.id,
          criadoEm: f.criadoEm ?? "2026-01-01T00:00:00.000Z",
          temSimulador: linhas.has(f.id),
          simuladorAtualizadoEm: linhas.get(f.id)?.updatedAt ?? null,
        }));
    },
  };
}

export type { InputsFinanceiros };
