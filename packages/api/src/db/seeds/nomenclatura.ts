/**
 * Story 47.1 — seed do dicionário da nomenclatura (spec § 9). IDEMPOTENTE.
 *
 * Roda quantas vezes for preciso sem duplicar: cada insert vai com
 * `onConflictDoNothing` sobre o UNIQUE natural da tabela (código por escopo),
 * e só o que entrou de fato deixa linha no changelog.
 *
 * ## TODO(P1) — os `[PREENCHER]` da spec NÃO foram inventados
 *
 * A spec entrega os códigos (`bbe`, `fz`, `pps`, `dg`, `churrasco`, `a01`,
 * `of01`, `of02`, `lpa`…) mas deixa em aberto nome de exibição dos experts,
 * dono de alguns produtos, descrição do funil e URL da LP. `name` e
 * `description` são NOT NULL de propósito (é o que a pessoa lê no select), então
 * uma entrada com esses campos em `null` é PULADA — com aviso no resultado — e
 * tudo que depende dela também. Preencher aqui quando o dono do produto mandar
 * os valores; não há outro lugar.
 *
 * ## Por que lê a tabela inteira em vez de `select … where`
 *
 * O dicionário tem dezenas de linhas, não milhares. Ler tudo e casar em memória
 * deixa o seed com uma leitura por tabela e o teste sem precisar interpretar
 * predicado — o que se quer provar é "rodou duas vezes, contagem igual".
 */

import { getTableName } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  namingDictionaryValues,
  namingExperts,
  namingFunnels,
  namingLandingPages,
  namingOffers,
  namingProducts,
} from "../schema.js";
import { registrarNoChangelog } from "../../services/nomenclatura/changelog.js";
import { montarSlugDeLp } from "@loyola-x/shared";

/** `null` = TODO(P1). A spec não deu o valor; ninguém aqui inventa. */
export const DADOS_DO_SEED = {
  experts: [
    { code: "bbe", name: null as string | null },
    { code: "fz", name: null as string | null },
    { code: "pps", name: null as string | null },
    { code: "dg", name: null as string | null },
  ],
  produtos: [
    { expert: "bbe" as string | null, slug: "churrasco", name: null as string | null },
    { expert: null as string | null, slug: "hamburguer", name: null as string | null },
    { expert: null as string | null, slug: "english-kids-club", name: null as string | null },
    { expert: null as string | null, slug: "claude-negocios", name: null as string | null },
    { expert: null as string | null, slug: "fundamentos-clinico", name: null as string | null },
  ],
  funis: [{ expert: "bbe", code: "a01", description: null as string | null }],
  ofertas: [
    { expert: "bbe", code: "of01", description: "oferta com ticket médio de R$ 347" as string | null },
    { expert: "bbe", code: "of02", description: "oferta com ticket médio de R$ 297" as string | null },
  ],
  lps: [{ expert: "bbe", produto: "churrasco", funil: "a01", oferta: "of01", code: "lpa", url: null as string | null }],
  /** Spec § 9.6, nesta ordem. `mix` em temperatura e `carrossel` em formato NÃO entram. */
  valores: {
    /** 2025 entrou na 47.5: campanhas legadas rodaram em 2025 e o ano é o em que rodou. */
    year: ["2025", "2026", "2027"],
    temperature: ["hot", "cold"],
    auction: ["abo", "cbo"],
    format: ["videos", "estaticos", "mix"],
  } as Record<"year" | "temperature" | "auction" | "format", string[]>,
  /** Story 47.10 (AC1): tipo de criativo e sigla de lançamento, nesta ordem e com estas descrições — exatamente como o pedido do dono. */
  valoresDeAnuncio: {
    creative_type: [
      { value: "ad", description: "estático" },
      { value: "adv", description: "vídeo" },
      { value: "carr", description: "carrossel" },
    ],
    launch_type: [
      { value: "pg", description: "lançamento pago" },
      { value: "l", description: "lançamento gratuito" },
      { value: "m", description: "meteórico" },
      { value: "pr", description: "evento presencial" },
    ],
  } as Record<"creative_type" | "launch_type", { value: string; description: string }[]>,
} as const;

export interface ResultadoDoSeed {
  inseridos: Record<string, number>;
  /** O que ficou de fora e por quê — sempre por TODO(P1) ou dependência pulada. */
  pulados: string[];
}

export async function seedNomenclatura(db: Database): Promise<ResultadoDoSeed> {
  const inseridos: Record<string, number> = {};
  const pulados: string[] = [];

  async function inserir<T extends typeof namingExperts | typeof namingProducts | typeof namingFunnels | typeof namingOffers | typeof namingLandingPages | typeof namingDictionaryValues>(
    tabela: T,
    linhas: T["$inferInsert"][],
  ) {
    const nome = getTableName(tabela);
    if (linhas.length === 0) return;
    const novos = (await db
      .insert(tabela)
      .values(linhas as never)
      .onConflictDoNothing()
      .returning()) as { id: string }[];
    inseridos[nome] = (inseridos[nome] ?? 0) + novos.length;
    for (const n of novos) {
      await registrarNoChangelog(db, { entity: nome, entityId: n.id, action: "create", before: null, after: n as Record<string, unknown>, author: null });
    }
  }

  // valores fixos — não dependem de nada
  await inserir(namingDictionaryValues, [
    ...(Object.keys(DADOS_DO_SEED.valores) as (keyof typeof DADOS_DO_SEED.valores)[]).flatMap((type) =>
      DADOS_DO_SEED.valores[type].map((value, sortOrder) => ({ type, value, sortOrder })),
    ),
    // Story 47.10: os dois tipos do nome de anúncio, com descrição.
    ...(Object.keys(DADOS_DO_SEED.valoresDeAnuncio) as (keyof typeof DADOS_DO_SEED.valoresDeAnuncio)[]).flatMap((type) =>
      DADOS_DO_SEED.valoresDeAnuncio[type].map((v, sortOrder) => ({ type, value: v.value, description: v.description, sortOrder })),
    ),
  ]);

  // experts
  const expertsProntos = DADOS_DO_SEED.experts.filter((e) => {
    if (!e.name) pulados.push(`expert ${e.code}: name em TODO(P1)`);
    return Boolean(e.name);
  });
  await inserir(namingExperts, expertsProntos.map((e) => ({ code: e.code, name: e.name! })));
  const experts = await db.select().from(namingExperts);
  const expertPorCode = new Map(experts.map((e) => [e.code, e]));

  // produtos
  const produtosProntos = DADOS_DO_SEED.produtos.filter((p) => {
    if (!p.expert) { pulados.push(`produto ${p.slug}: expert em TODO(P1)`); return false; }
    if (!p.name) { pulados.push(`produto ${p.slug}: name em TODO(P1)`); return false; }
    if (!expertPorCode.has(p.expert)) { pulados.push(`produto ${p.slug}: expert ${p.expert} não seedado`); return false; }
    return true;
  });
  await inserir(namingProducts, produtosProntos.map((p) => ({ expertId: expertPorCode.get(p.expert!)!.id, slug: p.slug, name: p.name! })));

  // funis
  const funisProntos = DADOS_DO_SEED.funis.filter((f) => {
    if (!f.description) { pulados.push(`funil ${f.expert}/${f.code}: description em TODO(P1)`); return false; }
    if (!expertPorCode.has(f.expert)) { pulados.push(`funil ${f.expert}/${f.code}: expert não seedado`); return false; }
    return true;
  });
  await inserir(namingFunnels, funisProntos.map((f) => ({ expertId: expertPorCode.get(f.expert)!.id, code: f.code, description: f.description! })));

  // ofertas
  const ofertasProntas = DADOS_DO_SEED.ofertas.filter((o) => {
    if (!o.description) { pulados.push(`oferta ${o.expert}/${o.code}: description em TODO(P1)`); return false; }
    if (!expertPorCode.has(o.expert)) { pulados.push(`oferta ${o.expert}/${o.code}: expert não seedado`); return false; }
    return true;
  });
  await inserir(namingOffers, ofertasProntas.map((o) => ({ expertId: expertPorCode.get(o.expert)!.id, code: o.code, description: o.description! })));

  // lps — precisam dos quatro pais
  const [produtos, funis, ofertas] = await Promise.all([
    db.select().from(namingProducts),
    db.select().from(namingFunnels),
    db.select().from(namingOffers),
  ]);
  const lpsProntas: (typeof namingLandingPages.$inferInsert)[] = [];
  for (const l of DADOS_DO_SEED.lps) {
    const expert = expertPorCode.get(l.expert);
    const produto = produtos.find((p) => p.expertId === expert?.id && p.slug === l.produto);
    const funil = funis.find((f) => f.expertId === expert?.id && f.code === l.funil);
    const oferta = ofertas.find((o) => o.expertId === expert?.id && o.code === l.oferta);
    const slug = montarSlugDeLp({ expert: l.expert, produto: l.produto, funil: l.funil, oferta: l.oferta, lp: l.code });
    if (!expert || !produto || !funil || !oferta) {
      pulados.push(`lp ${slug}: combinação incompleta (expert/produto/funil/oferta não seedados)`);
      continue;
    }
    lpsProntas.push({ expertId: expert.id, productId: produto.id, funnelId: funil.id, offerId: oferta.id, code: l.code, slug, url: l.url });
  }
  await inserir(namingLandingPages, lpsProntas);

  return { inseridos, pulados };
}
