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

import { and, asc, count, eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  namingCampaigns,
  namingDictionaryValues,
  namingExperts,
  namingFunnels,
  namingLandingPages,
  namingOffers,
  namingProducts,
} from "../../db/schema.js";
import { registrarNoChangelog, type AcaoDoChangelog } from "./changelog.js";
import type { Conexao } from "./conexao.js";
import type { Referencia } from "./regras.js";

export type Expert = typeof namingExperts.$inferSelect;
export type Produto = typeof namingProducts.$inferSelect;
export type Funil = typeof namingFunnels.$inferSelect;
export type Oferta = typeof namingOffers.$inferSelect;
export type Lp = typeof namingLandingPages.$inferSelect;
export type ValorFixo = typeof namingDictionaryValues.$inferSelect;
export type TipoDeValor = ValorFixo["type"];

export type Entidade = "experts" | "produtos" | "funis" | "ofertas" | "lps" | "dicionario";

/** Nome da tabela que vai no changelog. */
export const TABELA: Record<Entidade, string> = {
  experts: "naming_experts",
  produtos: "naming_products",
  funis: "naming_funnels",
  ofertas: "naming_offers",
  lps: "naming_landing_pages",
  dicionario: "naming_dictionary_values",
};

const TABELAS = {
  experts: namingExperts,
  produtos: namingProducts,
  funis: namingFunnels,
  ofertas: namingOffers,
  lps: namingLandingPages,
  dicionario: namingDictionaryValues,
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
  async function alternarAtivo<E extends Entidade>(
    entidade: E,
    antes: Linha<E>,
    ativo: boolean,
    author: string | null,
  ) {
    return atualizar(entidade, antes, { active: ativo } as Partial<Insercao<E>>, author, ativo ? "reactivate" : "deactivate");
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
  async function referenciasDe(entidade: Entidade, linha: { id: string; type?: TipoDeValor; value?: string }): Promise<Referencia[]> {
    const id = linha.id;
    switch (entidade) {
      case "experts": {
        const [produtos, funis, ofertas, lps, campanhas] = await Promise.all([
          db.select({ id: namingProducts.id, r: namingProducts.slug }).from(namingProducts).where(eq(namingProducts.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          db.select({ id: namingFunnels.id, r: namingFunnels.code }).from(namingFunnels).where(eq(namingFunnels.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          db.select({ id: namingOffers.id, r: namingOffers.code }).from(namingOffers).where(eq(namingOffers.expertId, id)).limit(LIMITE_DE_REFERENCIAS),
          lpsComo("expertId", id),
          campanhasComo("expertId", id),
        ]);
        return [
          ...produtos.map((p) => ({ tipo: "produto" as const, id: p.id, rotulo: p.r })),
          ...funis.map((f) => ({ tipo: "funil" as const, id: f.id, rotulo: f.r })),
          ...ofertas.map((o) => ({ tipo: "oferta" as const, id: o.id, rotulo: o.r })),
          ...lps,
          ...campanhas,
        ];
      }
      case "produtos":
        return [...(await lpsComo("productId", id)), ...(await campanhasComo("productId", id))];
      case "funis":
        return [...(await lpsComo("funnelId", id)), ...(await campanhasComo("funnelId", id))];
      case "ofertas":
        return [...(await lpsComo("offerId", id)), ...(await campanhasComo("offerId", id))];
      case "lps":
        return campanhasComo("landingPageId", id);
      case "dicionario": {
        if (!linha.type || !linha.value) return [];
        const col = namingCampaigns[COLUNA_DO_TIPO[linha.type]];
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
    /** Filhos ATIVOS de um expert — o que a desativação em cascata vai tocar. */
    filhosAtivos: async (expertId: string) => {
      const [produtos, funis, ofertas, lps] = await Promise.all([
        db.select().from(namingProducts).where(and(eq(namingProducts.expertId, expertId), eq(namingProducts.active, true))),
        db.select().from(namingFunnels).where(and(eq(namingFunnels.expertId, expertId), eq(namingFunnels.active, true))),
        db.select().from(namingOffers).where(and(eq(namingOffers.expertId, expertId), eq(namingOffers.active, true))),
        db.select().from(namingLandingPages).where(and(eq(namingLandingPages.expertId, expertId), eq(namingLandingPages.active, true))),
      ]);
      return { produtos, funis, ofertas, lps };
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

  return {
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
