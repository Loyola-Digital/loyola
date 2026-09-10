/**
 * Story 47.1 — as consultas do dicionário, e a única camada que ESCREVE.
 *
 * Toda escrita (criar, atualizar, excluir, desativar, reativar) passa por aqui
 * e deixa a linha do changelog no mesmo lugar — regra 7 da spec. Os handlers
 * decidem; este arquivo executa.
 *
 * ## O que este arquivo garante que as consultas façam
 *
 * - **Unicidade e sugestão INCLUEM inativos.** Nenhuma consulta de código
 *   (`porCode`, `codigos`, `porSlug`, `porValor`) filtra `active`. Regra 4.
 * - **Listagem filtra `active` só quando `inativos = false`** — é o toggle
 *   "Mostrar inativos" da tela.
 * - **"Usado em N campanhas"** é `count` de `naming_campaigns` pela FK, ou pelo
 *   TEXTO no caso dos valores fixos (o nome guarda o texto, não a FK).
 */

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, max, min, sql, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  metaCampaignInsightsDaily,
  metaEntityNamesCache,
  namingCampaigns,
  namingDictionaryValues,
  namingExperts,
  namingFunnels,
  namingLandingPages,
  namingLegacyDecisions,
  namingOffers,
  namingProducts,
  namingVslVariables,
  namingVsls,
  projects,
} from "../../db/schema.js";
import { registrarNoChangelog, type AcaoDoChangelog } from "./changelog.js";
import type { Conexao } from "./conexao.js";
import type { Referencia } from "./regras.js";
import { REGEX_LEGADA_SQL, type DicionarioSnapshot, type VslSnapshot } from "@loyola-x/shared";

export type Expert = typeof namingExperts.$inferSelect;
export type Produto = typeof namingProducts.$inferSelect;
export type Funil = typeof namingFunnels.$inferSelect;
export type Oferta = typeof namingOffers.$inferSelect;
export type Lp = typeof namingLandingPages.$inferSelect;
export type ValorFixo = typeof namingDictionaryValues.$inferSelect;
export type TipoDeValor = ValorFixo["type"];
/** Story 47.9 */
export type VariavelDeVsl = typeof namingVslVariables.$inferSelect;
export type TipoDeVariavelDeVsl = VariavelDeVsl["type"];
export type Vsl = typeof namingVsls.$inferSelect;

export type Entidade = "experts" | "produtos" | "funis" | "ofertas" | "lps" | "dicionario" | "campanhas" | "decisoes" | "vslVariaveis" | "vsls";
export type Decisao = typeof namingLegacyDecisions.$inferSelect;
/** As que têm `active` (campanha não se desativa; publica ou duplica). */
export type EntidadeAtivavel = Exclude<Entidade, "campanhas" | "decisoes" | "vsls">;
export type Campanha = typeof namingCampaigns.$inferSelect;

/** Nome da tabela que vai no changelog. */
export const TABELA: Record<Entidade, string> = {
  experts: "naming_experts",
  produtos: "naming_products",
  funis: "naming_funnels",
  ofertas: "naming_offers",
  lps: "naming_landing_pages",
  dicionario: "naming_dictionary_values",
  campanhas: "naming_campaigns",
  decisoes: "naming_legacy_decisions",
  vslVariaveis: "naming_vsl_variables",
  vsls: "naming_vsls",
};

const TABELAS = {
  experts: namingExperts,
  produtos: namingProducts,
  funis: namingFunnels,
  ofertas: namingOffers,
  lps: namingLandingPages,
  dicionario: namingDictionaryValues,
  campanhas: namingCampaigns,
  decisoes: namingLegacyDecisions,
  vslVariaveis: namingVslVariables,
  vsls: namingVsls,
} as const;

type Linha<E extends Entidade> = (typeof TABELAS)[E]["$inferSelect"];
type Insercao<E extends Entidade> = (typeof TABELAS)[E]["$inferInsert"];

/**
 * Para as escritas genéricas o TypeScript não consegue unir as seis tabelas
 * num tipo só; todas têm `id`, `active`, `updatedAt`, então a forma de
 * `naming_experts` serve de molde para a chamada — o resultado volta tipado
 * pela entidade de verdade em `Linha<E>`. Mesmo recurso do `as never` que o
 * resto da API usa para o Drizzle.
 */
type TabelaGenerica = typeof namingExperts;
function tabelaDe(entidade: Entidade): TabelaGenerica {
  return TABELAS[entidade] as unknown as TabelaGenerica;
}

function ativoSe(inativos: boolean, coluna: AnyPgColumn) {
  return inativos ? undefined : eq(coluna, true);
}

function onde(...conds: (ReturnType<typeof eq> | undefined)[]) {
  const c = conds.filter(Boolean) as ReturnType<typeof eq>[];
  return c.length === 0 ? undefined : c.length === 1 ? c[0] : and(...c);
}

export interface FiltrosDeCampanha {
  expertId?: string;
  productId?: string;
  funnelId?: string;
  offerId?: string;
  year?: string;
  q?: string;
  publicada?: boolean;
  limit: number;
  offset: number;
}

export function criarRepositorio(db: Conexao) {
  // ── escrita genérica, sempre com changelog ────────────────────────────
  async function inserir<E extends Entidade>(
    entidade: E,
    valores: Insercao<E>,
    author: string | null,
  ): Promise<Linha<E>> {
    const tabela = tabelaDe(entidade);
    const [linha] = (await db
      .insert(tabela)
      .values(valores as never)
      .returning()) as unknown as Linha<E>[];
    await registrarNoChangelog(db, {
      entity: TABELA[entidade],
      entityId: linha.id,
      action: "create",
      before: null,
      after: linha as Record<string, unknown>,
      author,
    });
    return linha;
  }

  async function atualizar<E extends Entidade>(
    entidade: E,
    antes: Linha<E>,
    patch: Partial<Insercao<E>>,
    author: string | null,
    action: AcaoDoChangelog = "update",
  ): Promise<Linha<E>> {
    const tabela = tabelaDe(entidade);
    const [linha] = (await db
      .update(tabela)
      .set({ ...(patch as object), updatedAt: new Date() } as never)
      .where(eq(tabela.id, antes.id))
      .returning()) as unknown as Linha<E>[];
    await registrarNoChangelog(db, {
      entity: TABELA[entidade],
      entityId: antes.id,
      action,
      before: antes as Record<string, unknown>,
      after: linha as Record<string, unknown>,
      author,
    });
    return linha;
  }

  async function excluir<E extends Entidade>(entidade: E, antes: Linha<E>, author: string | null) {
    const tabela = tabelaDe(entidade);
    await db.delete(tabela).where(eq(tabela.id, antes.id));
    await registrarNoChangelog(db, {
      entity: TABELA[entidade],
      entityId: antes.id,
      action: "delete",
      before: antes as Record<string, unknown>,
      after: null,
      author,
    });
  }

  async function porId<E extends Entidade>(entidade: E, id: string): Promise<Linha<E> | undefined> {
    const tabela = tabelaDe(entidade);
    const [linha] = (await db.select().from(tabela).where(eq(tabela.id, id)).limit(1)) as unknown as Linha<E>[];
    return linha;
  }

  /** `active` ↔ `deactivate`/`reactivate`, com a ação certa no changelog. */
  async function alternarAtivo<E extends EntidadeAtivavel>(
    entidade: E,
    antes: Linha<E>,
    ativo: boolean,
    author: string | null,
  ) {
    return atualizar(entidade, antes, { active: ativo } as unknown as Partial<Insercao<E>>, author, ativo ? "reactivate" : "deactivate");
  }

  // ── uso em campanhas ──────────────────────────────────────────────────
  type ColunaDeFk = "expertId" | "productId" | "funnelId" | "offerId" | "landingPageId";
  type ColunaDeTexto = "year" | "temperature" | "auction" | "format";
  const COLUNA_DO_TIPO: Record<TipoDeValor, ColunaDeTexto> = {
    year: "year",
    temperature: "temperature",
    auction: "auction",
    format: "format",
  };

  async function usoPorFk(coluna: ColunaDeFk): Promise<Map<string, number>> {
    const col = namingCampaigns[coluna];
    const linhas = await db.select({ id: col, n: count() }).from(namingCampaigns).groupBy(col);
    return new Map(linhas.filter((l) => l.id).map((l) => [l.id as string, Number(l.n)]));
  }

  async function usoPorValor(type: TipoDeValor): Promise<Map<string, number>> {
    const col = namingCampaigns[COLUNA_DO_TIPO[type]];
    const linhas = await db.select({ valor: col, n: count() }).from(namingCampaigns).groupBy(col);
    return new Map(linhas.map((l) => [l.valor, Number(l.n)]));
  }

  async function campanhasQueUsam(coluna: ColunaDeFk, id: string): Promise<number> {
    const [{ n }] = await db
      .select({ n: count() })
      .from(namingCampaigns)
      .where(eq(namingCampaigns[coluna], id));
    return Number(n);
  }

  async function campanhasComValor(type: TipoDeValor, valor: string): Promise<number> {
    const [{ n }] = await db
      .select({ n: count() })
      .from(namingCampaigns)
      .where(eq(namingCampaigns[COLUNA_DO_TIPO[type]], valor));
    return Number(n);
  }

  const LIMITE_DE_REFERENCIAS = 20;

  async function campanhasComo(coluna: ColunaDeFk, id: string): Promise<Referencia[]> {
    const linhas = await db
      .select({ id: namingCampaigns.id, name: namingCampaigns.name })
      .from(namingCampaigns)
      .where(eq(namingCampaigns[coluna], id))
      .limit(LIMITE_DE_REFERENCIAS);
    return linhas.map((c) => ({ tipo: "campanha", id: c.id, rotulo: c.name }));
  }

  // ── Story 47.9: uso em VSLs ───────────────────────────────────────────
  type ColunaDeVsl = "expertId" | "productId" | "leadId" | "problemId" | "solutionId" | "offerId";
  /** Uma variável pode estar em lead_id, problem_id ou solution_id — o tipo dela diz qual. */
  const COLUNA_DA_VARIAVEL: Record<TipoDeVariavelDeVsl, ColunaDeVsl> = { lead: "leadId", problem: "problemId", solution: "solutionId" };

  async function usoEmVsls(coluna: ColunaDeVsl): Promise<Map<string, number>> {
    const col = namingVsls[coluna];
    const linhas = await db.select({ id: col, n: count() }).from(namingVsls).groupBy(col);
    return new Map(linhas.filter((l) => l.id).map((l) => [l.id as string, Number(l.n)]));
  }

  async function vslsQueUsam(coluna: ColunaDeVsl, id: string): Promise<number> {
    const [{ n }] = await db.select({ n: count() }).from(namingVsls).where(eq(namingVsls[coluna], id));
    return Number(n);
  }

  async function vslsComo(coluna: ColunaDeVsl, id: string): Promise<Referencia[]> {
    const linhas = await db.select({ id: namingVsls.id, name: namingVsls.name }).from(namingVsls).where(eq(namingVsls[coluna], id)).limit(LIMITE_DE_REFERENCIAS);
    return linhas.map((v) => ({ tipo: "vsl", id: v.id, rotulo: v.name }));
  }

  async function lpsComo(coluna: "expertId" | "productId" | "funnelId" | "offerId", id: string): Promise<Referencia[]> {
    const linhas = await db
      .select({ id: namingLandingPages.id, slug: namingLandingPages.slug })
      .from(namingLandingPages)
      .where(eq(namingLandingPages[coluna], id))
      .limit(LIMITE_DE_REFERENCIAS);
    return linhas.map((l) => ({ tipo: "lp", id: l.id, rotulo: l.slug }));
  }

  /**
   * Tudo que impede o hard delete (spec § 5): produto → LPs; funil → LPs;
   * oferta → LPs; expert → tudo; qualquer um → campanhas.
   */
  async function referenciasDe(entidade: Entidade, linha: { id: string; type?: TipoDeValor | TipoDeVariavelDeVsl; value?: string }): Promise<Referencia[]> {
    const id = linha.id;
    switch (entidade) {
      case "experts": {
        const [produtos, funis, ofertas, lps, campanhas, variaveis, vsls] = await Promise.all([
          db.select({ id: namingProducts.id, r: namingProducts.slug }).from(namingProducts).where(eq(namingProducts.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          db.select({ id: namingFunnels.id, r: namingFunnels.code }).from(namingFunnels).where(eq(namingFunnels.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          db.select({ id: namingOffers.id, r: namingOffers.code }).from(namingOffers).where(eq(namingOffers.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          lpsComo("expertId", id),
          campanhasComo("expertId", id),
          db.select({ id: namingVslVariables.id, r: namingVslVariables.code }).from(namingVslVariables).where(eq(namingVslVariables.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          vslsComo("expertId", id),
        ]);
        return [
          ...produtos.map((p) => ({ tipo: "produto" as const, id: p.id, rotulo: p.r })),
          ...funis.map((f) => ({ tipo: "funil" as const, id: f.id, rotulo: f.r })),
          ...ofertas.map((o) => ({ tipo: "oferta" as const, id: o.id, rotulo: o.r })),
          ...lps,
          ...campanhas,
          ...variaveis.map((v) => ({ tipo: "variavel" as const, id: v.id, rotulo: v.r })),
          ...vsls,
        ];
      }
      case "produtos":
        return [...(await lpsComo("productId", id)), ...(await campanhasComo("productId", id)), ...(await vslsComo("productId", id))];
      case "funis":
        return [...(await lpsComo("funnelId", id)), ...(await campanhasComo("funnelId", id))];
      case "ofertas":
        // Story 47.9 (AC3): a oferta é o pitch da VSL — VSL também segura a oferta.
        return [...(await lpsComo("offerId", id)), ...(await campanhasComo("offerId", id)), ...(await vslsComo("offerId", id))];
      case "vslVariaveis": {
        const tipo = linha.type as TipoDeVariavelDeVsl | undefined;
        return tipo ? vslsComo(COLUNA_DA_VARIAVEL[tipo], id) : [];
      }
      case "vsls":
        return [];
      case "lps":
        return campanhasComo("landingPageId", id);
      case "campanhas":
        // Nada referencia uma campanha ainda (conjuntos e anúncios são fase 2).
        return [];
      case "decisoes":
        return [];
      case "dicionario": {
        if (!linha.type || !linha.value) return [];
        const col = namingCampaigns[COLUNA_DO_TIPO[linha.type as TipoDeValor]];
        const linhas = await db
          .select({ id: namingCampaigns.id, name: namingCampaigns.name })
          .from(namingCampaigns)
          .where(eq(col, linha.value))
          .limit(LIMITE_DE_REFERENCIAS);
        return linhas.map((c) => ({ tipo: "campanha", id: c.id, rotulo: c.name }));
      }
    }
  }

  // ── leituras por entidade (nenhuma de código filtra `active`) ─────────
  const experts = {
    listar: (inativos: boolean) =>
      db.select().from(namingExperts).where(ativoSe(inativos, namingExperts.active)).orderBy(asc(namingExperts.code)),
    porCode: async (code: string) =>
      (await db.select().from(namingExperts).where(eq(namingExperts.code, code)).limit(1))[0],
    /** Story 47.5: o expert de um projeto (único por projeto). */
    porProjeto: async (projectId: string) =>
      (await db.select().from(namingExperts).where(eq(namingExperts.projectId, projectId)).limit(1))[0],
    /** Contagem de filhos por expert, para as colunas da listagem (spec § 6). */
    contagens: async () => {
      const [p, f, o, l] = await Promise.all([
        db.select({ id: namingProducts.expertId, n: count() }).from(namingProducts).groupBy(namingProducts.expertId),
        db.select({ id: namingFunnels.expertId, n: count() }).from(namingFunnels).groupBy(namingFunnels.expertId),
        db.select({ id: namingOffers.expertId, n: count() }).from(namingOffers).groupBy(namingOffers.expertId),
        db.select({ id: namingLandingPages.expertId, n: count() }).from(namingLandingPages).groupBy(namingLandingPages.expertId),
      ]);
      const mapa = (xs: { id: string; n: number }[]) => new Map(xs.map((x) => [x.id, Number(x.n)]));
      return { produtos: mapa(p), funis: mapa(f), ofertas: mapa(o), lps: mapa(l) };
    },
    /**
     * Filhos ATIVOS de um expert — o que a desativação em cascata vai tocar.
     *
     * SEQUENCIAL de propósito (gate do @qa, QA-472-01): esta função roda dentro
     * da transação da cascata, e uma transação é UMA conexão. `Promise.all`
     * aqui enfileirava quatro queries no mesmo client — o `pg` avisa que é
     * deprecado e o pg@9 vai recusar. Quatro leituras pequenas em série custam
     * nada; um deadlock silencioso no deploy futuro custaria a cascata inteira.
     */
    filhosAtivos: async (expertId: string) => {
      const produtos = await db.select().from(namingProducts).where(and(eq(namingProducts.expertId, expertId), eq(namingProducts.active, true)));
      const funis = await db.select().from(namingFunnels).where(and(eq(namingFunnels.expertId, expertId), eq(namingFunnels.active, true)));
      const ofertas = await db.select().from(namingOffers).where(and(eq(namingOffers.expertId, expertId), eq(namingOffers.active, true)));
      const lps = await db.select().from(namingLandingPages).where(and(eq(namingLandingPages.expertId, expertId), eq(namingLandingPages.active, true)));
      // Story 47.9: as variáveis de VSL do expert vão junto na cascata.
      const variaveisDeVsl = await db.select().from(namingVslVariables).where(and(eq(namingVslVariables.expertId, expertId), eq(namingVslVariables.active, true)));
      return { produtos, funis, ofertas, lps, variaveisDeVsl };
    },
  };

  const produtos = {
    listar: (expertId: string | undefined, inativos: boolean) =>
      db
        .select()
        .from(namingProducts)
        .where(onde(expertId ? eq(namingProducts.expertId, expertId) : undefined, ativoSe(inativos, namingProducts.active)))
        .orderBy(asc(namingProducts.slug)),
    porSlug: async (expertId: string, slug: string) =>
      (await db.select().from(namingProducts).where(and(eq(namingProducts.expertId, expertId), eq(namingProducts.slug, slug))).limit(1))[0],
  };

  const funis = {
    listar: (expertId: string | undefined, inativos: boolean) =>
      db
        .select()
        .from(namingFunnels)
        .where(onde(expertId ? eq(namingFunnels.expertId, expertId) : undefined, ativoSe(inativos, namingFunnels.active)))
        .orderBy(asc(namingFunnels.code)),
    porCode: async (expertId: string, code: string) =>
      (await db.select().from(namingFunnels).where(and(eq(namingFunnels.expertId, expertId), eq(namingFunnels.code, code))).limit(1))[0],
    /** Todos os códigos do expert, inativos inclusos — é a base da sugestão. */
    codigos: async (expertId: string) =>
      (await db.select({ code: namingFunnels.code }).from(namingFunnels).where(eq(namingFunnels.expertId, expertId))).map((x) => x.code),
  };

  const ofertas = {
    listar: (expertId: string | undefined, inativos: boolean) =>
      db
        .select()
        .from(namingOffers)
        .where(onde(expertId ? eq(namingOffers.expertId, expertId) : undefined, ativoSe(inativos, namingOffers.active)))
        .orderBy(asc(namingOffers.code)),
    porCode: async (expertId: string, code: string) =>
      (await db.select().from(namingOffers).where(and(eq(namingOffers.expertId, expertId), eq(namingOffers.code, code))).limit(1))[0],
    codigos: async (expertId: string) =>
      (await db.select({ code: namingOffers.code }).from(namingOffers).where(eq(namingOffers.expertId, expertId))).map((x) => x.code),
  };

  type Combinacao = { expertId: string; productId: string; funnelId: string; offerId: string };
  const lps = {
    listar: (f: Partial<Combinacao>, inativos: boolean) =>
      db
        .select()
        .from(namingLandingPages)
        .where(
          onde(
            f.expertId ? eq(namingLandingPages.expertId, f.expertId) : undefined,
            f.productId ? eq(namingLandingPages.productId, f.productId) : undefined,
            f.funnelId ? eq(namingLandingPages.funnelId, f.funnelId) : undefined,
            f.offerId ? eq(namingLandingPages.offerId, f.offerId) : undefined,
            ativoSe(inativos, namingLandingPages.active),
          ),
        )
        .orderBy(asc(namingLandingPages.slug)),
    porCode: async (c: Combinacao, code: string) =>
      (
        await db
          .select()
          .from(namingLandingPages)
          .where(
            and(
              eq(namingLandingPages.expertId, c.expertId),
              eq(namingLandingPages.productId, c.productId),
              eq(namingLandingPages.funnelId, c.funnelId),
              eq(namingLandingPages.offerId, c.offerId),
              eq(namingLandingPages.code, code),
            ),
          )
          .limit(1)
      )[0],
    codigos: async (c: Combinacao) =>
      (
        await db
          .select({ code: namingLandingPages.code })
          .from(namingLandingPages)
          .where(
            and(
              eq(namingLandingPages.expertId, c.expertId),
              eq(namingLandingPages.productId, c.productId),
              eq(namingLandingPages.funnelId, c.funnelId),
              eq(namingLandingPages.offerId, c.offerId),
            ),
          )
      ).map((x) => x.code),
  };

  const dicionario = {
    listar: (type: TipoDeValor | undefined, inativos: boolean) =>
      db
        .select()
        .from(namingDictionaryValues)
        .where(onde(type ? eq(namingDictionaryValues.type, type) : undefined, ativoSe(inativos, namingDictionaryValues.active)))
        .orderBy(asc(namingDictionaryValues.type), asc(namingDictionaryValues.sortOrder), asc(namingDictionaryValues.value)),
    porValor: async (type: TipoDeValor, value: string) =>
      (await db.select().from(namingDictionaryValues).where(and(eq(namingDictionaryValues.type, type), eq(namingDictionaryValues.value, value))).limit(1))[0],
  };

  // ── Story 47.9: variáveis de VSL e VSLs ───────────────────────────────
  const vslVariaveis = {
    listar: (f: { expertId?: string; type?: TipoDeVariavelDeVsl }, inativos: boolean) =>
      db
        .select()
        .from(namingVslVariables)
        .where(
          onde(
            f.expertId ? eq(namingVslVariables.expertId, f.expertId) : undefined,
            f.type ? eq(namingVslVariables.type, f.type) : undefined,
            ativoSe(inativos, namingVslVariables.active),
          ),
        )
        .orderBy(asc(namingVslVariables.type), asc(namingVslVariables.code)),
    /** Unicidade por (expert, tipo), inativos inclusos (regra 4). */
    porCode: async (expertId: string, type: TipoDeVariavelDeVsl, code: string) =>
      (await db.select().from(namingVslVariables).where(and(eq(namingVslVariables.expertId, expertId), eq(namingVslVariables.type, type), eq(namingVslVariables.code, code))).limit(1))[0],
  };

  const vsls = {
    listar: async (f: { expertId?: string; productId?: string; offerId?: string; q?: string; limit: number; offset: number }) => {
      const cond = onde(
        f.expertId ? eq(namingVsls.expertId, f.expertId) : undefined,
        f.productId ? eq(namingVsls.productId, f.productId) : undefined,
        f.offerId ? eq(namingVsls.offerId, f.offerId) : undefined,
        f.q ? (ilike(namingVsls.name, `%${f.q}%`) as unknown as ReturnType<typeof eq>) : undefined,
      );
      const [itens, [{ n }]] = await Promise.all([
        db.select().from(namingVsls).where(cond).orderBy(desc(namingVsls.createdAt)).limit(f.limit).offset(f.offset),
        db.select({ n: count() }).from(namingVsls).where(cond),
      ]);
      return { itens, total: Number(n) };
    },
    porNome: async (name: string) => (await db.select().from(namingVsls).where(eq(namingVsls.name, name)).limit(1))[0],
  };

  /** O que `parseVslName` lê: experts, produtos, ofertas e as variáveis, por código. */
  async function snapshotDeVsl(inativos: boolean): Promise<VslSnapshot> {
    const [ex, pr, of, va] = await Promise.all([experts.listar(true), produtos.listar(undefined, true), ofertas.listar(undefined, true), vslVariaveis.listar({}, true)]);
    const filtra = <T extends { active: boolean }>(xs: T[]) => (inativos ? xs : xs.filter((x) => x.active));
    const codeDoExpert = new Map(ex.map((e) => [e.id, e.code]));
    return {
      experts: filtra(ex).map((e) => ({ code: e.code, active: e.active })),
      produtos: filtra(pr).map((p) => ({ expert: codeDoExpert.get(p.expertId) ?? "?", slug: p.slug, active: p.active })),
      ofertas: filtra(of).map((o) => ({ expert: codeDoExpert.get(o.expertId) ?? "?", code: o.code, active: o.active })),
      variaveis: filtra(va).map((v) => ({ expert: codeDoExpert.get(v.expertId) ?? "?", type: v.type, code: v.code, active: v.active })),
    };
  }

  // ── snapshot do dicionário (Story 47.3) ───────────────────────────────
  /**
   * O dicionário inteiro, por CÓDIGO (não por id): é o que `parseCampaignName`
   * lê e o que a prévia do gerador tem em mãos. `inativos=false` é o snapshot
   * de GRAVAR (só o vigente); `true` é o de VALIDAR nome antigo.
   */
  async function snapshot(inativos: boolean): Promise<DicionarioSnapshot> {
    const [ex, pr, fu, of, lp, va] = await Promise.all([
      experts.listar(true),
      produtos.listar(undefined, true),
      funis.listar(undefined, true),
      ofertas.listar(undefined, true),
      lps.listar({}, true),
      dicionario.listar(undefined, true),
    ]);
    const filtra = <T extends { active: boolean }>(xs: T[]) => (inativos ? xs : xs.filter((x) => x.active));
    const codeDoExpert = new Map(ex.map((e) => [e.id, e.code]));
    const slugDoProduto = new Map(pr.map((p) => [p.id, p.slug]));
    const codeDoFunil = new Map(fu.map((f) => [f.id, f.code]));
    const codeDaOferta = new Map(of.map((o) => [o.id, o.code]));
    return {
      experts: filtra(ex).map((e) => ({ code: e.code, active: e.active })),
      produtos: filtra(pr).map((p) => ({ expert: codeDoExpert.get(p.expertId) ?? "?", slug: p.slug, active: p.active })),
      funis: filtra(fu).map((f) => ({ expert: codeDoExpert.get(f.expertId) ?? "?", code: f.code, active: f.active })),
      ofertas: filtra(of).map((o) => ({ expert: codeDoExpert.get(o.expertId) ?? "?", code: o.code, active: o.active })),
      lps: filtra(lp).map((l) => ({
        expert: codeDoExpert.get(l.expertId) ?? "?",
        product: slugDoProduto.get(l.productId) ?? "?",
        funnel: codeDoFunil.get(l.funnelId) ?? "?",
        offer: codeDaOferta.get(l.offerId) ?? "?",
        code: l.code,
        active: l.active,
      })),
      valores: filtra(va).map((v) => ({ type: v.type, value: v.value, active: v.active })),
    };
  }

  // ── campanhas (Story 47.3) ────────────────────────────────────────────
  const campanhas = {
    listar: async (f: FiltrosDeCampanha) => {
      const cond = onde(
        f.expertId ? eq(namingCampaigns.expertId, f.expertId) : undefined,
        f.productId ? eq(namingCampaigns.productId, f.productId) : undefined,
        f.funnelId ? eq(namingCampaigns.funnelId, f.funnelId) : undefined,
        f.offerId ? eq(namingCampaigns.offerId, f.offerId) : undefined,
        f.year ? eq(namingCampaigns.year, f.year) : undefined,
        f.q ? (ilike(namingCampaigns.name, `%${f.q}%`) as unknown as ReturnType<typeof eq>) : undefined,
        f.publicada === true ? (isNotNull(namingCampaigns.publishedAt) as unknown as ReturnType<typeof eq>) : undefined,
        f.publicada === false ? (isNull(namingCampaigns.publishedAt) as unknown as ReturnType<typeof eq>) : undefined,
      );
      const [itens, [{ n }]] = await Promise.all([
        db.select().from(namingCampaigns).where(cond).orderBy(desc(namingCampaigns.createdAt)).limit(f.limit).offset(f.offset),
        db.select({ n: count() }).from(namingCampaigns).where(cond),
      ]);
      return { itens, total: Number(n) };
    },
    /**
     * Story 47.8 (AC6): ids da Meta colados em campanhas DO GERADOR. A fila de
     * legadas tira esses da frente — o nome v2 contém `perpetuo`, que é
     * exatamente o token do filtro de legadas. Só origem `gerador`: a legada
     * classificada também tem `meta_campaign_id`, mas ela É legada e vive na
     * fila "classificadas" pela decisão (47.5).
     */
    metaIdsDoGerador: async (): Promise<Set<string>> => {
      const linhas = await db
        .select({ metaCampaignId: namingCampaigns.metaCampaignId })
        .from(namingCampaigns)
        .where(and(isNotNull(namingCampaigns.metaCampaignId), eq(namingCampaigns.origin, "gerador")));
      return new Set(linhas.map((l) => l.metaCampaignId as string));
    },
    /** Story 47.8 (T5): as que ainda podem mudar de nome (regra 6). */
    naoPublicadas: async () => db.select().from(namingCampaigns).where(isNull(namingCampaigns.publishedAt)),
  };

  // ── legadas (Story 47.5) ──────────────────────────────────────────────
  /**
   * Campanhas do Meta que casam com o filtro de perpétuo, com gasto, decisão e
   * o expert do projeto. Três leituras (nomes, gasto, decisões) casadas em
   * memória: são dezenas de linhas, e a regex é a MESMA do `shared`
   * (`REGEX_LEGADA_SQL`) — uma regra, dois lados.
   */
  const legadas = {
    listar: async (f: { projectId?: string; q?: string }) => {
      const nomes = await db
        .select({
          projectId: metaEntityNamesCache.projectId,
          projeto: projects.name,
          campaignId: metaEntityNamesCache.entityId,
          nome: metaEntityNamesCache.entityName,
          statusMeta: metaEntityNamesCache.effectiveStatus,
        })
        .from(metaEntityNamesCache)
        .innerJoin(projects, eq(projects.id, metaEntityNamesCache.projectId))
        .where(
          and(
            eq(metaEntityNamesCache.entityType, "campaign"),
            sql`${metaEntityNamesCache.entityName} ~* ${REGEX_LEGADA_SQL}`,
            f.projectId ? eq(metaEntityNamesCache.projectId, f.projectId) : undefined,
            f.q ? ilike(metaEntityNamesCache.entityName, `%${f.q}%`) : undefined,
          ),
        );
      const ids = nomes.map((n) => n.campaignId);
      if (ids.length === 0) return { nomes, gasto: new Map<string, { spend: number; de: string | null; ate: string | null }>(), decisoes: new Map<string, Decisao>() };
      const [gastos, decisoes] = await Promise.all([
        db
          .select({ campaignId: metaCampaignInsightsDaily.campaignId, spend: sum(metaCampaignInsightsDaily.spend), de: min(metaCampaignInsightsDaily.dateStart), ate: max(metaCampaignInsightsDaily.dateStart) })
          .from(metaCampaignInsightsDaily)
          .where(inArray(metaCampaignInsightsDaily.campaignId, ids))
          .groupBy(metaCampaignInsightsDaily.campaignId),
        db.select().from(namingLegacyDecisions).where(inArray(namingLegacyDecisions.campaignId, ids)),
      ]);
      return {
        nomes,
        gasto: new Map(gastos.map((g) => [g.campaignId, { spend: Number(g.spend ?? 0), de: g.de ?? null, ate: g.ate ?? null }])),
        decisoes: new Map(decisoes.map((d) => [`${d.projectId}:${d.campaignId}`, d])),
      };
    },
    /** Nome e primeiro dia de gasto de UMA campanha — o que a classificação grava. */
    detalhe: async (projectId: string, campaignId: string) => {
      const [nome] = await db
        .select({ nome: metaEntityNamesCache.entityName })
        .from(metaEntityNamesCache)
        .where(and(eq(metaEntityNamesCache.projectId, projectId), eq(metaEntityNamesCache.entityType, "campaign"), eq(metaEntityNamesCache.entityId, campaignId)))
        .limit(1);
      const [g] = await db
        .select({ de: min(metaCampaignInsightsDaily.dateStart) })
        .from(metaCampaignInsightsDaily)
        .where(and(eq(metaCampaignInsightsDaily.projectId, projectId), eq(metaCampaignInsightsDaily.campaignId, campaignId)));
      return nome ? { nome: nome.nome, primeiroGasto: g?.de ?? null } : undefined;
    },
    decisao: async (projectId: string, campaignId: string) =>
      (await db.select().from(namingLegacyDecisions).where(and(eq(namingLegacyDecisions.projectId, projectId), eq(namingLegacyDecisions.campaignId, campaignId))).limit(1))[0],
    /** Legada já classificada com este nome antigo (validador). */
    porNomeAntigo: async (nome: string) =>
      (await db.select().from(namingCampaigns).where(and(eq(namingCampaigns.origin, "legado"), eq(namingCampaigns.metaCampaignName, nome))).limit(1))[0],
  };

  return {
    snapshot,
    snapshotDeVsl,
    vslVariaveis,
    vsls,
    usoEmVsls,
    vslsQueUsam,
    campanhas,
    legadas,
    inserir,
    atualizar,
    excluir,
    porId,
    alternarAtivo,
    usoPorFk,
    usoPorValor,
    campanhasQueUsam,
    campanhasComValor,
    referenciasDe,
    experts,
    produtos,
    funis,
    ofertas,
    lps,
    dicionario,
  };
}

export type Repositorio = ReturnType<typeof criarRepositorio>;
