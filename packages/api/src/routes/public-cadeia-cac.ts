/**
 * Story 44.8 — `GET .../stages/:stageId/cadeia-cac`.
 *
 * O payload da aba "Inácio": o número principal, a cadeia de decomposição, os
 * tetos, o ranking e os benchmarks de referência de UMA etapa.
 *
 * ## Esta rota não calcula nada
 *
 * Regra 7.6 da spec: *"o cálculo mora em `@loyola-x/shared` como função pura; a
 * aba consome, a API expõe o mesmo resultado."* Este arquivo **monta as
 * entradas**, chama o `shared` e serve o resultado.
 *
 * O teste disso é mecânico: **não existe uma divisão neste arquivo.** Se
 * aparecer uma, ela está no lugar errado. Foi assim que o `connectRate` ficou
 * 18 a 35 pontos percentuais errado por mais de um ano (Story 44.2) — não por
 * bug, por duas implementações da mesma conta.
 *
 * ## Unidade de saída: DECIMAL (@po, 2026-08-19)
 *
 * Toda taxa sai entre 0 e 1, e o payload declara `unidadeDasTaxas: "decimal"`.
 * As rotas irmãs de `public-meta.ts` servem cinco campos × 100 — mas esta rota
 * é nova e não compartilha NOME com elas: o `lpRate` de lá é o Connect Rate, e
 * o `convLP` daqui não existe naquele payload. Servir × 100 obrigaria o
 * consumidor a converter na entrada e a aba a converter de volta, e a §2.5 diz
 * que trocar `2` por `0,02` é a fonte nº 1 de erro da spec.
 *
 * ⚠️ A declaração cobre TAXAS. Dinheiro segue real absoluto e o CPM segue na
 * escala ÷ 1.000 (a única exceção da §2.5).
 *
 * ## Imposto Meta: já aplicado, não reaplicar
 *
 * `spend` vem de `services/meta-campaign-daily.ts`, cujo `accumulate` já fez o
 * gross-up de 12,15%. `spendIncludesMetaTax: true` declara isso. Reaplicar dá
 * imposto ao quadrado — bug da 29.24, corrigido na 29.27.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  agregar,
  cacReal,
  calcularMetricas,
  calcularTetos,
  classificarFamilia,
  compostoNoTeto,
  cplReal,
  custoDaCadeia,
  decomporCPC,
  metricasDoTeto,
  montarRanking,
  referenciasDoGrupo,
  type DiaBruto,
  type SerieDeCampanha,
} from "@loyola-x/shared";
import { funnels, funnelStages, publicMetricsCache } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { carregarSerieDiariaPorCampanha } from "../services/meta-campaign-daily.js";
import { getFreshSalesDaily, type SalesDailyPayload } from "../services/sales-daily-sync.js";
import {
  LEAD_ORIGIN_SCOPE,
  resolveLeadSource,
  type LeadOriginPayload,
} from "../services/lead-origin-sync.js";
import { maxAgeFrom } from "../utils/cache-freshness.js";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  from: z.string().regex(YMD).optional(),
  to: z.string().regex(YMD).optional(),
  /** QA-448-03: `?fresh=1` força o recompute, como na rota irmã de vendas. */
  fresh: z.string().optional(),
});

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Range default: últimos 30 dias, igual às rotas irmãs. */
function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const toStr = to ?? ymd(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: from ?? ymd(fromDate), to: toStr };
}

/**
 * Vendas reais da etapa no período, e o que ficou de fora.
 *
 * ⚠️ **`SalesDailyPayload.byDay` não tem campo `vendas`** (@po, 2026-08-19). A
 * contagem por dia é `ingressos.total` (`pago + org + semTrack`, montado em
 * `sales-daily-sync.ts:364`).
 *
 * ⚠️ E o `byDay` **descarta silenciosamente venda sem data parseável**
 * (`sales-daily-sync.ts:338`), enquanto `totalVendas` a mantém
 * (`sales.size`, `:354`). Logo `Σ byDay ≤ totalVendas`. Sem o aviso, um período
 * com range devolveria um denominador subcontado e o CAC sairia **alto**, sem
 * nada na tela avisando — a mesma classe do imposto ao quadrado, na direção em
 * que ninguém desconfia.
 *
 * Por isso `vendasSemDataNoTotal` viaja no payload (regra 7.4: ausência é
 * declarada, nunca corrigida em silêncio).
 *
 * ⚠️ **O nome carrega `NoTotal` de propósito** (QA-448-04). O diagnóstico é do
 * total da etapa e NÃO é escopável a range — venda sem data não pertence a
 * janela nenhuma, por definição. Com `?from`/`?to`, ele viaja ao lado de um
 * `vendasReais` filtrado, e sem o sufixo o consumidor leria "N vendas faltando
 * NESTE range", que é outra afirmação.
 */
function vendasDoPeriodo(
  p: SalesDailyPayload,
  range: { from: string; to: string } | null,
): { vendas: number; vendasSemDataNoTotal: number } {
  const somaDoByDay = p.byDay.reduce((s, d) => s + d.ingressos.total, 0);
  const vendasSemDataNoTotal = Math.max(0, p.totalVendas - somaDoByDay);
  if (!range) return { vendas: p.totalVendas, vendasSemDataNoTotal };
  const vendas = p.byDay
    .filter((d) => d.date >= range.from && d.date <= range.to)
    .reduce((s, d) => s + d.ingressos.total, 0);
  return { vendas, vendasSemDataNoTotal };
}

export default fp(async function publicCadeiaCacRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/public/meta/v1/projects/:projectId/stages/:stageId/cadeia-cac",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const query = querySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }

      const { projectId, stageId } = params.data;

      // ⚠️ O `innerJoin` prova `funnels.projectId = :projectId` ANTES de
      // devolver qualquer coisa. Sem ele a rota é IDOR: qualquer chave de API
      // leria a etapa de qualquer projeto — o buraco que a 43.7 abriu, porque o
      // guest-guard global não cobre rota project-scoped.
      //
      // Etapa de outro projeto devolve 404, nunca 403: 403 confirmaria que ela
      // existe.
      const [stage] = await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          stageType: funnelStages.stageType,
          campaigns: funnelStages.campaigns,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(and(eq(funnelStages.id, stageId), eq(funnels.projectId, projectId)))
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });

      const explicitRange = Boolean(query.data.from || query.data.to);
      const { from, to } = resolveRange(query.data.from, query.data.to);
      const range = explicitRange ? { from, to } : null;

      const base = {
        projectId,
        stageId,
        stageName: stage.name,
        stageType: stage.stageType,
        fonte: "ad-level" as const,
        spendIncludesMetaTax: true,
        unidadeDasTaxas: "decimal" as const,
        range: explicitRange ? { from, to } : { from: null, to: null },
      };

      // Família `null` = a etapa está FORA da aba (`lyrio`, `comercial`,
      // `debriefing`, ou um tipo novo). 200 com o motivo — fora da aba é
      // resultado, não erro (spec §1).
      const familia = classificarFamilia(stage.stageType);
      if (familia === null) {
        return {
          ...base,
          familia: null,
          semDados: true,
          motivo: "foraDaAba" as const,
          message: `A etapa é do tipo "${stage.stageType}", que não pertence a nenhuma das duas famílias da aba (paga: paid/sales/event_capture/event; gratuita: free/cpl).`,
        };
      }

      const campaignIds = ((stage.campaigns ?? []) as { id: string }[]).map((c) => c.id);

      // Etapa sem campanha vinculada não é erro — é etapa orgânica. Devolve o
      // motivo, jamais `campanhas: []` sem explicação.
      if (campaignIds.length === 0) {
        return {
          ...base,
          familia,
          semDados: true,
          motivo: "semDados" as const,
          message: "A etapa não tem nenhuma campanha vinculada (funnel_stages.campaigns vazio).",
          campanhas: [],
        };
      }

      // ⚠️ Uma linha por (campanha, dia), garantida pelo `Map` do serviço. Série
      // ad-level crua infla a base do piso de confiança, e nem o `ultimoDaData`
      // de `janelasDe7Dias` alcança isso (QA-447-01: teto de CPC 0,20 em vez de
      // 0,92, 4,6× inflado, vindo de um anúncio isolado).
      const campanhas = await carregarSerieDiariaPorCampanha(fastify.db, {
        projectId,
        campaignIds,
        from,
        to,
        explicitRange,
      });

      /**
       * ⚠️ `leadsAtribuidos` fica AUSENTE de propósito, não zerado.
       *
       * A atribuição de lead por campanha existe como função pura
       * (`services/campaign-attribution.ts`, Story 44.3) mas **ainda não tem
       * produtor ligado a uma etapa** — a planilha de vendas do
       * `sales-daily-sync` sequer mapeia `utm_content`. Zerar transformaria "a
       * planilha não está ligada" em "zero leads", e essa distinção não se
       * recupera depois (QA-446-01: `Conv. LP = 0` contra um teto qualquer dá
       * queda de 100%, e a etapa sem dado nenhum lideraria o ranking).
       *
       * Com o campo ausente, `agregar` devolve `leadsAtribuidos: null` e
       * `calcularMetricas` devolve `convLP: null` na família gratuita — que é a
       * resposta correta, e vai declarada em `atribuicao` abaixo.
       */
      const series: SerieDeCampanha[] = campanhas
        .filter((c) => c.days !== null && c.days.length > 0)
        .map((c) => ({
          campaignId: c.campaignId,
          fonte: "ad-level" as const,
          dias: c.days!.map(
            (d): DiaBruto => ({
              date: d.date,
              spend: d.spend,
              impressions: d.impressions,
              linkClicks: d.linkClicks,
              landingPageViews: d.landingPageViews,
              checkouts: d.checkouts,
            }),
          ),
        }));

      const todosOsDias = series.flatMap((s) => s.dias);
      const agregado = agregar(todosOsDias);
      const atuais = calcularMetricas(agregado, familia);

      // ⚠️ AC5 (@po, 2026-08-19): NENHUM produtor de `CoberturaDiaria` existe
      // hoje — as únicas ocorrências no repo são fixtures de teste. A guarda de
      // rastreio (`coberturaAtipica`) portanto NÃO roda, e o payload diz isso.
      // Silêncio aqui faria o consumidor ler um teto de gratuita como se fosse
      // tão confiável quanto o de paga (regra 7.4). Story 44.12 abre o produtor.
      const tetos = calcularTetos(series, familia);
      const guardaDeCobertura =
        familia === "gratuita"
          ? {
              estado: "indisponivel" as const,
              motivo: "naoAtribuivel" as const,
              message:
                "A guarda de cobertura de rastreio (coberturaAtipica) NÃO rodou: não existe produtor de cobertura de lead por dia. O teto de convLP desta família não está protegido contra janela escolhida por rastreio melhor, e não por conversão melhor. Ver Story 44.12.",
            }
          : { estado: "naoSeAplica" as const, motivo: null, message: null };

      const ranking = montarRanking(tetos, atuais);
      const noTeto = metricasDoTeto(tetos);

      // Decomposição do CPC quando ele LIDERA o ranking (spec §3): quanto do gap
      // fecha levando só o CTR ao teto, quanto só o CPM, quanto os dois.
      const lidera = ranking[0]?.metrica === "cpc";
      const decomposicaoCPC =
        lidera && atuais.cpm !== null && noTeto.cpm !== null && atuais.ctr !== null && noTeto.ctr !== null
          ? decomporCPC(atuais.cpm, noTeto.cpm, atuais.ctr, noTeto.ctr)
          : null;

      // O número principal (spec §2.1). Venda e lead SEMPRE do Loyola X — o
      // `purchasesProxyPixel` é pixel e subconta (R$20k viraram ~R$6–7k
      // reportados, deck §7.1).
      let principal: Record<string, unknown>;
      let vendasSemDataNoTotal = 0;

      if (familia === "paga") {
        // ⚠️ QA-448-01: erro de LEITURA e ausência de FONTE são causas
        // diferentes, com ações opostas — "cheque a permissão / tente de novo"
        // contra "conecte uma planilha". O `.catch(() => null)` anterior fundia
        // as duas e afirmava a segunda, mandando o operador configurar algo que
        // já estava configurado.
        //
        // É o chamado de 2026-08-14 que a Story 36.9 AC5 resolveu em
        // `public-leads.ts:47-68`. Aqui não dá para copiar o 502 da rota irmã
        // (`public-funnel-sales.ts:141-148`): lá a venda é o payload inteiro,
        // aqui é UM campo, e derrubar a resposta jogaria fora o teto, o ranking
        // e os benchmarks, que estão calculados e corretos.
        let fresh: Awaited<ReturnType<typeof getFreshSalesDaily>> | null = null;
        let erroDeLeitura: string | null = null;
        try {
          fresh = await getFreshSalesDaily(fastify.db, projectId, stageId, {
            maxAgeMs: maxAgeFrom(query.data.fresh, fastify.config.SALES_PUBLIC_MAX_AGE_SEC),
          });
        } catch (err) {
          erroDeLeitura = err instanceof Error ? err.message : "Falha ao calcular vendas";
        }

        if (erroDeLeitura !== null) {
          principal = {
            metrica: "cacReal",
            valor: null,
            motivo: "leituraFalhou",
            message: `Não foi possível LER a fonte de vendas desta etapa (a fonte existe; a leitura falhou): ${erroDeLeitura}`,
            spend: agregado.spend,
          };
        } else if (!fresh?.payload) {
          principal = {
            metrica: "cacReal",
            valor: null,
            motivo: "semDados",
            message: "A etapa não tem nenhuma fonte de vendas conectada (nem planilha, nem venda manual).",
            spend: agregado.spend,
          };
        } else {
          const v = vendasDoPeriodo(fresh.payload, range);
          vendasSemDataNoTotal = v.vendasSemDataNoTotal;
          // ⚠️ `cacReal` sai mesmo com cobertura de atribuição 0% — ele depende
          // do TOTAL da etapa, não da atribuição por campanha. É a propriedade
          // que motivou a v1.1 inteira. `null` aqui só quando não há venda.
          principal = {
            metrica: "cacReal",
            valor: cacReal(agregado.spend, v.vendas),
            spend: agregado.spend,
            vendasReais: v.vendas,
            ...(v.vendas === 0 ? { motivo: "semDados" as const } : {}),
            dataSource: fresh.source,
            computedAt: fresh.computedAt,
          };
        }
      } else {
        const [row] = await fastify.db
          .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
          .from(publicMetricsCache)
          .where(
            and(
              eq(publicMetricsCache.projectId, projectId),
              eq(publicMetricsCache.scope, LEAD_ORIGIN_SCOPE),
              eq(publicMetricsCache.key, stageId),
            ),
          )
          .limit(1);
        const lead = row?.payload as LeadOriginPayload | undefined;
        if (lead) {
          principal = {
            metrica: "cplReal",
            valor: cplReal(agregado.spend, lead.uniqueLeads),
            spend: agregado.spend,
            leadsUnicos: lead.uniqueLeads,
            fonteDeLead: lead.fonte,
            ...(lead.uniqueLeads === 0 ? { motivo: "semDados" as const } : {}),
            computedAt: row?.computedAt ?? null,
          };
        } else {
          // ⚠️ QA-448-02: "o sync ainda não rodou" (espere) e "a etapa não tem
          // fonte" (configure) são ações OPOSTAS. Foi essa exata ambiguidade que
          // a Story 36.9 AC5 removeu de `public-leads.ts:47-68`, e a mensagem
          // que as juntava fez o chamado de 2026-08-14 pedir "rodar o sync" para
          // um problema que rodar o sync não resolvia.
          //
          // `resolveLeadSource` é o mesmo desempate que a 36.9 usa. Uma query, e
          // só no ramo de ausência.
          const fonte = await resolveLeadSource(fastify.db, stageId).catch(() => null);
          principal = fonte
            ? {
                metrica: "cplReal",
                valor: null,
                motivo: "syncPendente",
                message:
                  "A etapa TEM fonte de leads conectada, mas o cache ainda não foi computado. O sync roda diariamente; para antecipar, use scripts/backfill-lead-origin.ts.",
                spend: agregado.spend,
              }
            : {
                metrica: "cplReal",
                valor: null,
                motivo: "semDados",
                message:
                  "A etapa não tem planilha de leads nem pesquisa conectada. Rodar o sync não muda isso — é preciso conectar uma fonte à etapa.",
                spend: agregado.spend,
              };
        }
      }

      return {
        ...base,
        familia,
        campanhas: campanhas.map((c) => ({
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          dias: c.days?.length ?? null,
          motivo: c.motivo,
          lastSyncedAt: c.lastSyncedAt,
        })),
        agregado,
        atuais,
        principal,
        /**
         * ⚠️ Cobertura de atribuição por campanha: **diagnóstico exibido, nunca
         * multiplicador** (spec §2.7). Hoje é indisponível — `atribuirPorCampanha`
         * (Story 44.3) é função pura sem produtor ligado à etapa, e a planilha
         * do `sales-daily-sync` não mapeia `utm_content`.
         */
        atribuicao: {
          coberturaVendas: null,
          coberturaLeads: null,
          motivo: "naoAtribuivel" as const,
          message:
            "A atribuição de venda/lead por campanha (Story 44.3) ainda não tem produtor ligado a uma etapa. Isto NÃO afeta cacReal/cplReal, que dependem do total da etapa.",
        },
        vendasSemDataNoTotal,
        tetos,
        guardaDeCobertura,
        ranking,
        composto: {
          /** ⚠️ CENÁRIO TEÓRICO: os tetos vêm de campanhas diferentes, e multiplicar taxas assume independência entre os elos, que eles não têm (spec §3). */
          rotulo: "cenario-teorico" as const,
          queda: compostoNoTeto(atuais, noTeto),
          custoAtual: custoDaCadeia(atuais),
          custoNoTeto: custoDaCadeia(noTeto),
          metricasDoTeto: noTeto,
        },
        decomposicaoCPC,
        /**
         * Spec §5. CTR (≥2%) e Connect Rate (>85%) são CONSTANTES e ficam na
         * apresentação (Story 44.9). CPM e CPC não têm benchmark de mercado —
         * o alvo é a mediana das campanhas elegíveis do grupo, e ela é cálculo.
         */
        benchmarks: {
          rotulo: "mediana-historica" as const,
          ...referenciasDoGrupo(series, familia),
        },
      };
    },
  );
});
