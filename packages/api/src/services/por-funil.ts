/**
 * Os números de um projeto QUEBRADOS POR FUNIL — investimento, connect rate e
 * faturamento no mesmo recorte.
 *
 * ## Por que isto não vem do BI
 *
 * O resto das notificações pergunta ao BI de propósito (ver
 * `alertas-de-funil.ts`), para que o alerta e o painel mostrem o mesmo número.
 * Só que o BI RECUSA investimento quebrado por funil, e com razão: a entidade
 * `trafego` não tem a dimensão. O catálogo é explícito — "só por dia, por
 * projeto ou no total: o tráfego não sabe de funil nem de etapa".
 *
 * A ponte existe fora do BI: cada etapa (e cada funil) guarda a lista de
 * campanhas da Meta que lhe pertencem, que é a mesma atribuição que o dashboard
 * de funil usa para mostrar mídia por etapa. Então o SQL daqui lê EXATAMENTE as
 * mesmas tabelas e colunas que as entidades `trafego` e `faturamento` —
 * `meta_ad_insights_daily` para a mídia, o cache `sales-daily` para a receita —
 * e só acrescenta o `JOIN` que o BI não sabe fazer. Por isso a soma dos funis
 * fecha com o número do projeto no painel; se um dia o BI aprender a dimensão,
 * este arquivo sai inteiro.
 *
 * ## As duas armadilhas
 *
 * 1. **Campanha que nenhuma etapa reivindica.** Sempre existe: campanha nova,
 *    teste, conta compartilhada. Ela não é descartada — vira o item de chave
 *    vazia ("sem funil"). Descartar faria a soma dos funis dar menos que o
 *    painel, e um número que não fecha é um número em que ninguém confia.
 *    Medido em 17/10/2026: 97,8% a 100% do gasto de 30 dias casa com algum
 *    funil, conforme o projeto.
 * 2. **Campanha atribuída a DOIS funis.** O `DISTINCT ON` abaixo a dá a um só.
 *    Contar nos dois faria a soma dos funis PASSAR do total do projeto — o erro
 *    mais caro dos dois, porque infla investimento e afunda ROAS sem avisar.
 *    Medido na mesma data: nenhum caso em produção.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export interface ItemDeFunil {
  /** O `funnel_id`, ou `""` para o gasto que nenhuma etapa reivindica. */
  chave: string;
  /** Nome do funil — ou "<projeto> (sem funil)" no item de chave vazia. */
  nome: string;
  gasto: number;
  /** Numerador e denominador do connect rate, somados como o BI soma. */
  lpViews: number;
  linkClicks: number;
  faturamento: number;
}

/** A soma da ação `tipo` no jsonb `actions`, no mesmo molde do BI. */
const somaDaAcao = (tipo: string) => sql`COALESCE(SUM((
  SELECT (a->>'value')::numeric
    FROM jsonb_array_elements(i.actions) a
   WHERE a->>'action_type' = ${tipo}
   LIMIT 1
)), 0)`;

/**
 * Investimento e faturamento do projeto, por funil, no intervalo `[de, ate]`
 * (datas aaaa-mm-dd, inclusivas).
 *
 * Devolve TODO item com algum número — inclusive os que só têm gasto, ou só
 * faturamento. Quem chama decide o que mostrar.
 */
export async function lerPorFunil(
  db: FastifyInstance["db"],
  projectId: string,
  de: string,
  ate: string,
  nomeDoProjeto: string,
): Promise<ItemDeFunil[]> {
  const r = await db.execute(sql`
    WITH mapa AS (
      -- A união dos dois níveis de atribuição: a da ETAPA (a que o dashboard
      -- de funil usa) e a do FUNIL, que algumas campanhas só têm lá.
      SELECT DISTINCT ON (campaign_id) campaign_id, funnel_id, nome
        FROM (
          SELECT (c->>'id') AS campaign_id, f.id AS funnel_id, f.name AS nome
            FROM funnel_stages st
            JOIN funnels f ON f.id = st.funnel_id
            CROSS JOIN LATERAL jsonb_array_elements(st.campaigns) c
           WHERE f.project_id = ${projectId}::uuid
             AND jsonb_typeof(st.campaigns) = 'array'
          UNION ALL
          SELECT (c->>'id'), f.id, f.name
            FROM funnels f
            CROSS JOIN LATERAL jsonb_array_elements(f.campaigns) c
           WHERE f.project_id = ${projectId}::uuid
             AND jsonb_typeof(f.campaigns) = 'array'
        ) t
       ORDER BY campaign_id, funnel_id
    ),
    midia AS (
      SELECT COALESCE(m.funnel_id::text, '') AS chave,
             MIN(m.nome)                     AS nome,
             COALESCE(SUM(i.spend), 0)       AS gasto,
             ${somaDaAcao("landing_page_view")} AS lp_views,
             ${somaDaAcao("link_click")}        AS link_clicks
        FROM meta_ad_insights_daily i
        LEFT JOIN mapa m ON m.campaign_id = i.campaign_id
       WHERE i.project_id = ${projectId}::uuid
         AND i.date_start BETWEEN ${de} AND ${ate}
       GROUP BY 1
    ),
    vendas AS (
      -- Mesma fonte da entidade "faturamento" do BI: o agregado diário que o
      -- sync das planilhas grava por ETAPA. A chave do cache é o stage_id.
      SELECT st.funnel_id::text AS chave,
             MIN(f.name)        AS nome,
             COALESCE(SUM((d->>'faturamentoBruto')::numeric), 0) AS faturamento
        FROM public_metrics_cache pmc
        JOIN funnel_stages st ON st.id::text = pmc.key
        JOIN funnels f ON f.id = st.funnel_id
        CROSS JOIN LATERAL jsonb_array_elements(pmc.payload->'byDay') d
       WHERE pmc.scope = 'sales-daily'
         AND pmc.project_id = ${projectId}::uuid
         AND jsonb_typeof(pmc.payload->'byDay') = 'array'
         AND (d->>'date') BETWEEN ${de} AND ${ate}
       GROUP BY 1
    )
    SELECT COALESCE(mi.chave, v.chave)         AS chave,
           COALESCE(mi.nome, v.nome)           AS nome,
           COALESCE(mi.gasto, 0)               AS gasto,
           COALESCE(mi.lp_views, 0)            AS lp_views,
           COALESCE(mi.link_clicks, 0)         AS link_clicks,
           COALESCE(v.faturamento, 0)          AS faturamento
      FROM midia mi
      FULL OUTER JOIN vendas v ON v.chave = mi.chave
  `);

  // Mesmo cast que `ultimoDiaComVenda` faz: o tipo do `execute` não expõe
  // `rows` de forma uniforme entre os drivers.
  const linhas = (r as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const num = (v: unknown) => (v == null ? 0 : Number(v));

  return linhas.map((l) => {
    const chave = String(l.chave ?? "");
    return {
      chave,
      nome: chave === "" ? `${nomeDoProjeto} (sem funil)` : String(l.nome ?? "Funil"),
      gasto: num(l.gasto),
      lpViews: num(l.lp_views),
      linkClicks: num(l.link_clicks),
      faturamento: num(l.faturamento),
    };
  });
}

/** Tem algum número que valha mostrar? Item zerado em tudo não é notícia. */
export const temMovimento = (i: ItemDeFunil) => i.gasto > 0 || i.faturamento > 0;
