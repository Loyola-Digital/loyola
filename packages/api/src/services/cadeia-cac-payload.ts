/**
 * Story 44.9 (AC1) — a composição do payload da cadeia de CAC, em UM lugar só.
 *
 * ## Por que isto saiu da rota
 *
 * A aba (Story 44.9) **não consegue chamar a rota pública**: o gate de
 * `/api/public/` exige `x-api-key` incondicionalmente (`api-key-auth.ts`, 401
 * antes de qualquer handler) e o web autentica com Clerk. A saída decidida pelo
 * @po foi uma rota interna — e duas rotas compondo o mesmo payload cada uma do
 * seu jeito é exatamente a semente da divergência que o Epic 44 existe para
 * impedir (o `connectRate`, 18 a 35 p.p. errados por mais de um ano).
 *
 * Então a composição mora aqui, e as duas rotas são invólucros finos:
 *
 *   `routes/public-cadeia-cac.ts`  → API key + escopo (agente Inácio)
 *   `routes/stage-cadeia-cac.ts`   → Clerk (a aba)
 *
 * É o mesmo movimento que a AC2 da Story 44.8 fez com o agrupamento por
 * (campanha, dia). Há um teste que prova que os dois caminhos devolvem o MESMO
 * payload — sem ele, a extração seria promessa.
 *
 * ## Este módulo não calcula nada
 *
 * Regra 7.6 da spec: o cálculo mora em `@loyola-x/shared`. Aqui se montam as
 * entradas e se serve o resultado. **Não existe uma divisão neste arquivo** —
 * se aparecer uma, ela está no lugar errado.
 */

import { and, eq } from "drizzle-orm";
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
import type { Database } from "../db/client.js";
import { funnels, funnelStages, publicMetricsCache } from "../db/schema.js";
import { carregarSerieDiariaPorCampanha } from "./meta-campaign-daily.js";
import { getFreshSalesDaily, type SalesDailyPayload } from "./sales-daily-sync.js";
import { LEAD_ORIGIN_SCOPE, resolveLeadSource, type LeadOriginPayload } from "./lead-origin-sync.js";
import { maxAgeFrom } from "../utils/cache-freshness.js";

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

/** A etapa, reduzida ao que a composição precisa. */
export interface EtapaDaCadeia {
  id: string;
  name: string;
  stageType: string | null;
  campaigns: unknown;
  /** Story 44.9 AC4 — `null` = não respondido, diferente de `false`. */
  lpTemVsl: boolean | null;
  /** Story 44.9 AC4 — `numeric` do Postgres chega como string. */
  ticketMedioManual: string | null;
}

/**
 * Resolve a etapa **provando o vínculo etapa↔funil↔projeto**.
 *
 * ⚠️ O `innerJoin` contra `funnels.projectId` não é otimização: sem ele a rota
 * é IDOR — qualquer chamador leria a etapa de qualquer projeto. É o buraco que
 * a Story 43.7 abriu, e as duas rotas dependem desta função para não repeti-lo.
 *
 * `null` = não existe OU não é deste projeto. O chamador devolve **404, nunca
 * 403**: 403 confirmaria que a etapa existe.
 */
export async function resolverEtapaDoProjeto(
  db: Database,
  projectId: string,
  stageId: string,
): Promise<EtapaDaCadeia | null> {
  const [stage] = await db
    .select({
      id: funnelStages.id,
      name: funnelStages.name,
      stageType: funnelStages.stageType,
      campaigns: funnelStages.campaigns,
      lpTemVsl: funnelStages.lpTemVsl,
      ticketMedioManual: funnelStages.ticketMedioManual,
    })
    .from(funnelStages)
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(and(eq(funnelStages.id, stageId), eq(funnels.projectId, projectId)))
    .limit(1);
  return stage ?? null;
}

export interface OpcoesDoPayload {
  projectId: string;
  stageId: string;
  from?: string;
  to?: string;
  /** `"1"` / `"true"` força o recompute das vendas. */
  fresh?: string;
}

/**
 * Monta o payload completo da aba para UMA etapa já resolvida.
 *
 * A etapa vem pronta de propósito: quem resolve é a rota, porque cada uma prova
 * o acesso de um jeito (API key com escopo · Clerk com o guard de convidado).
 */
export async function montarPayloadCadeiaCac(
  db: Database,
  config: { SALES_PUBLIC_MAX_AGE_SEC?: number },
  stage: EtapaDaCadeia,
  opts: OpcoesDoPayload,
): Promise<Record<string, unknown>> {
  const explicitRange = Boolean(opts.from || opts.to);
  const { from, to } = resolveRange(opts.from, opts.to);
  const range = explicitRange ? { from, to } : null;

  const base = {
    projectId: opts.projectId,
    stageId: opts.stageId,
    stageName: stage.name,
    stageType: stage.stageType,
    fonte: "ad-level" as const,
    spendIncludesMetaTax: true,
    unidadeDasTaxas: "decimal" as const,
    range: explicitRange ? { from, to } : { from: null, to: null },
    /**
     * Story 44.9 AC4/AC5 — os dois campos CRUS que decidem o benchmark de
     * Conv. LP (spec §5: 4% se ticket > R$147, 7,5% se abaixo, **somente com
     * VSL**).
     *
     * ⚠️ Vão crus de propósito. O benchmark de Conv. LP é CONSTANTE, e
     * constante é apresentação (decisão @po da 44.8 AC11) — quem escolhe entre
     * 4% e 7,5% é o consumidor. O que não pode é o consumidor adivinhar os
     * campos: sem eles na resposta, a aba teria que fazer uma segunda chamada
     * só para saber se o benchmark se aplica.
     *
     * `lpTemVsl: null` significa **não respondido**, não "não tem VSL". Nos
     * dois casos o benchmark não se aplica, mas o motivo a exibir é diferente.
     */
    lpTemVsl: stage.lpTemVsl,
    ticketMedioManual:
      stage.ticketMedioManual === null ? null : Number(stage.ticketMedioManual),
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
  const campanhas = await carregarSerieDiariaPorCampanha(db, {
    projectId: opts.projectId,
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
  /**
   * ⚠️ Story 44.12 (AC4): o cache de lead é lido AQUI, antes de `calcularTetos`,
   * e reusado lá embaixo no `cplReal`. Uma leitura, dois usos — a versão
   * anterior lia depois dos tetos, e ligar a guarda sem reordenar duplicaria a
   * query.
   *
   * Story 44.10: subiu mais uma posição, para ANTES da montagem da série — o
   * `leadsPorCampanhaDia` que alimenta `DiaBruto.leadsAtribuidos` sai daqui.
   * Continua sendo UMA leitura; só mudou de lugar.
   */
  let lead: LeadOriginPayload | undefined;
  let leadComputedAt: Date | null = null;
  if (familia === "gratuita") {
    const [row] = await db
      .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
      .from(publicMetricsCache)
      .where(
        and(
          eq(publicMetricsCache.projectId, opts.projectId),
          eq(publicMetricsCache.scope, LEAD_ORIGIN_SCOPE),
          eq(publicMetricsCache.key, opts.stageId),
        ),
      )
      .limit(1);
    lead = row?.payload as LeadOriginPayload | undefined;
    leadComputedAt = row?.computedAt ?? null;
  }

  /**
   * Story 44.10 — o numerador da `convLP` gratuita, indexado por campanha+dia.
   *
   * ⚠️ `undefined` aqui NÃO é o mesmo que `0`. O mapa só existe quando há cache
   * de lead COM o campo da 44.10; sem ele o campo fica ausente em `DiaBruto` e
   * `convLP` continua `null`, que é a resposta correta para "não medido".
   * Registro anterior à 44.10 (ou etapa sem fonte) cai neste caso.
   */
  const leadsPorCampanhaDia = lead?.leadsPorCampanhaDia
    ? new Map(lead.leadsPorCampanhaDia.map((x) => [`${x.campaignId}\u0000${x.date}`, x.leads]))
    : null;

  const series: SerieDeCampanha[] = campanhas
    .filter((c) => c.days !== null && c.days.length > 0)
    .map((c) => ({
      campaignId: c.campaignId,
      fonte: "ad-level" as const,
      dias: c.days!.map((d): DiaBruto => {
        const base: DiaBruto = {
          date: d.date,
          spend: d.spend,
          impressions: d.impressions,
          linkClicks: d.linkClicks,
          landingPageViews: d.landingPageViews,
          checkouts: d.checkouts,
        };
        // Com o mapa presente, a AUSÊNCIA da chave é zero legítimo: a campanha
        // rodou nesse dia e não trouxe lead atribuído. Sem o mapa, o campo não
        // entra — e é `agregar` que devolve `null`, não `0`.
        if (leadsPorCampanhaDia === null) return base;
        return { ...base, leadsAtribuidos: leadsPorCampanhaDia.get(`${c.campaignId}\u0000${d.date}`) ?? 0 };
      }),
    }));

  const todosOsDias = series.flatMap((s) => s.dias);
  const agregado = agregar(todosOsDias);
  const atuais = calcularMetricas(agregado, familia);

  /**
   * A guarda de rastreio (`coberturaAtipica`, spec §4) impede que a "melhor
   * janela" de `convLP` seja a semana em que o RASTREIO funcionou melhor, e não
   * a de melhor conversão. Medido na 44.6: uma etapa que passou de 52% para 95%
   * de cobertura exibiria um salto de 1,8× sem nada mudar na página.
   *
   * ⚠️ `coberturaDiaria` pode faltar mesmo com cache presente: registro gravado
   * ANTES da Story 44.12 não tem o campo. Aí a guarda fica `indisponivel` até o
   * sync reprocessar a etapa — e o payload diz isso, em vez de fingir que rodou.
   */
  const coberturaDaEtapa = lead?.coberturaDiaria;
  const tetos = calcularTetos(series, familia, coberturaDaEtapa ? { coberturaDaEtapa } : {});

  const guardaDeCobertura = (() => {
    if (familia !== "gratuita") {
      return { estado: "naoSeAplica" as const, motivo: null, message: null, dias: null, janelasBarradas: null, tetoExiste: false };
    }
    if (!coberturaDaEtapa) {
      return {
        estado: "indisponivel" as const,
        motivo: "naoAtribuivel" as const,
        message:
          "A guarda de cobertura de rastreio não rodou: esta etapa ainda não tem cobertura de lead por dia computada. O teto de convLP não está protegido contra janela escolhida por rastreio melhor, e não por conversão melhor. O sync diário popula o campo; para antecipar, use scripts/backfill-lead-origin.ts.",
        dias: null,
        janelasBarradas: null,
        tetoExiste: false,
      };
    }
    // Há série, mas nenhum dia com lead: a guarda não teve como julgar. É
    // afirmação DIFERENTE de "não rodou" — aqui o dado existe e está vazio.
    const comLead = coberturaDaEtapa.filter((c) => c.leadsTotais > 0).length;
    if (comLead === 0) {
      /**
       * Story 44.12 (Sessão 2) — série vazia tem DUAS causas, e dizer a errada
       * manda a pessoa procurar no lugar errado.
       *
       * Medido em produção: `bbe-pr1-mar-26` tem 214 leads e série vazia porque
       * a coluna de data da planilha não é legível (cabeçalho em branco), não
       * porque ninguém se cadastrou. Anunciar "nenhum dia tem lead" ali seria
       * verdade sobre a série e mentira sobre a etapa — e a ação corretiva
       * (apontar a coluna de data no mapeamento da pesquisa) ficaria invisível.
       */
      const semData = lead?.leadsSemData ?? 0;
      /**
       * QA-4412-04 — a série vazia tem TRÊS causas, não duas, e a terceira é a
       * que a mensagem genérica descrevia errado.
       *
       * No produtor, uma linha só entra em `linhasDeCobertura` se tiver `key`
       * (`lead-origin-sync.ts:537`), e `leadsSemData` só incrementa quando
       * `key && !date` (`:538`). Logo, num payload recém-produzido:
       *
       *   série vazia + `leadsSemData === 0` + `totalLeads > 0`
       *     ⟺ NENHUMA linha tem identificador (e-mail nem telefone)
       *
       * Medido: `fz-l2-jun-26 / Captação Paga` tem 128 leads, série vazia e
       * `leadsSemData = 0` — as colunas `email`/`telefone` estão 0 de 128
       * preenchidas. Dizer ali "nenhum dia tem lead" manda procurar cadastro
       * que existe, quando a ação é mapear a coluna do identificador.
       *
       * Mesma classe de defeito que o `09583f69` corrigiu no ramo vizinho.
       * Os dois ramos não colidem: `semData > 0` exige `key`, e `key` exige
       * identificador — se um dispara, o outro não pode disparar.
       */
      const identificadores = (lead?.identifiersFilled?.email ?? 0) + (lead?.identifiersFilled?.phone ?? 0);
      const linhas = lead?.totalLeads ?? 0;
      const semIdentificador = identificadores === 0 && linhas > 0;
      return {
        estado: "semLeadNoPeriodo" as const,
        motivo: "semDados" as const,
        message: semIdentificador
          ? `A cobertura de rastreio foi computada, mas nenhuma das ${linhas} linha(s) desta etapa tem e-mail ou telefone preenchido — sem identificador não há como contar lead por dia, e a guarda não teve como julgar as janelas. Aponte a coluna de e-mail ou de telefone no mapeamento da pesquisa.`
          : semData > 0
            ? `A cobertura de rastreio foi computada, mas ${semData} lead(s) ficaram fora da série porque a data não foi legível na planilha — a guarda não teve como julgar as janelas. Aponte a coluna de data no mapeamento da pesquisa.`
            : "A cobertura de rastreio foi computada, mas nenhum dia do período tem lead — a guarda não teve como julgar as janelas.",
        dias: coberturaDaEtapa.length,
        janelasBarradas: null,
        tetoExiste: false,
      };
    }
    /**
     * Story 44.10 (AC4/AC5) — fecha o QA-4412-11.
     *
     * A frase antiga nomeava "o teto de Conv. LP" mesmo quando ele não existia,
     * e a tabela na mesma tela dizia `sem alvo`. Agora o payload entrega os
     * dois fatos separados — dias medidos e janelas barradas — e quem renderiza
     * decide o texto sabendo se há teto.
     */
    const t = tetos.convLP as { valor: number | null; janelasBarradas?: number };
    return {
      estado: "aplicada" as const,
      motivo: null,
      message: null,
      dias: comLead,
      // `null` quando a guarda não reportou (não rodou), `0` quando rodou e não
      // barrou nada. A tela precisa dizer coisas diferentes nos dois casos.
      janelasBarradas: t.janelasBarradas ?? null,
      tetoExiste: t.valor !== null,
    };
  })();

  /**
   * Story 44.10 (AC6) — cobertura de LEAD por rastreio, somando a série que a
   * 44.12 já produz. Não é um terceiro caminho de contagem: `coberturaDiaria`
   * carrega os dois lados por dia, e somar é a razão de somas — nunca média de
   * razões, que daria outro número (regra §2.6).
   */
  const atribuicaoDaEtapa = (() => {
    const semProdutor = {
      coberturaVendas: null,
      coberturaLeads: null,
      motivo: "naoAtribuivel" as const,
      message:
        "A atribuição de venda/lead por campanha (Story 44.3) ainda não tem produtor ligado a uma etapa. Isto NÃO afeta cacReal/cplReal, que dependem do total da etapa.",
    };
    const serie = lead?.coberturaDiaria;
    if (familia !== "gratuita" || !serie || serie.length === 0) return semProdutor;

    const atribuidos = serie.reduce((acc, d) => acc + d.leadsAtribuidos, 0);
    const totais = serie.reduce((acc, d) => acc + d.leadsTotais, 0);
    if (totais === 0) return semProdutor;

    return {
      // `coberturaVendas` fica `null` — sem `utm_content` no sync de vendas não
      // há numerador, e zerar afirmaria "nenhuma venda rastreada".
      coberturaVendas: null,
      coberturaLeads: atribuidos / totais,
      motivo: null,
      message:
        "Cobertura de VENDA por campanha continua indisponível: a planilha do sync de vendas não mapeia `utm_content`. A cobertura de lead abaixo é diagnóstico de rastreio — não corrige nenhum número.",
    };
  })();

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
  // ⚠️ QA-448-07: `null`, não `0`. Fora do ramo de sucesso nada foi lido, e
  // `0` afirmaria "nenhuma venda sem data" sobre dado inexistente. Na
  // família gratuita ele fica `null` sempre — não há venda para diagnosticar.
  let vendasSemDataNoTotal: number | null = null;

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
      fresh = await getFreshSalesDaily(db, opts.projectId, opts.stageId, {
        maxAgeMs: maxAgeFrom(opts.fresh, config.SALES_PUBLIC_MAX_AGE_SEC),
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
    // Story 44.12 (AC4): `lead` já foi lido lá em cima, para a guarda. Reusar.
    if (lead) {
      principal = {
        metrica: "cplReal",
        valor: cplReal(agregado.spend, lead.uniqueLeads),
        spend: agregado.spend,
        leadsUnicos: lead.uniqueLeads,
        fonteDeLead: lead.fonte,
        ...(lead.uniqueLeads === 0 ? { motivo: "semDados" as const } : {}),
        computedAt: leadComputedAt,
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
      //
      // ⚠️ QA-448-06: aqui NÃO cabe `.catch(() => null)`. Era exatamente o
      // padrão que o QA-448-01 corrigiu, e ele reapareceu no código escrito
      // para consertá-lo: engolir o erro faria a rota afirmar "não tem fonte
      // conectada" sobre um fato que ela falhou em estabelecer. Três casos,
      // três motivos.
      let fonte: Awaited<ReturnType<typeof resolveLeadSource>> = null;
      let erroDaFonte: string | null = null;
      try {
        fonte = await resolveLeadSource(db, opts.stageId);
      } catch (err) {
        erroDaFonte = err instanceof Error ? err.message : "Falha ao resolver a fonte de leads";
      }

      principal =
        erroDaFonte !== null
          ? {
              metrica: "cplReal",
              valor: null,
              motivo: "indeterminado",
              message: `Não foi possível determinar se esta etapa tem fonte de leads conectada — a checagem falhou: ${erroDaFonte}`,
              spend: agregado.spend,
            }
          : fonte
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
    /**
     * Story 44.10 — o lado do LEAD ganhou produtor; o da VENDA não.
     *
     * ⚠️ Continua sendo **diagnóstico exibido, nunca multiplicador** (spec
     * §2.7). O número diz quanto do rastreio funciona, e não corrige nada.
     *
     * `coberturaVendas` segue `null` de propósito: `sales-daily-sync` não
     * mapeia `utm_content`, então não há de onde tirar. Declarar as duas juntas
     * num `naoAtribuivel` só faria a que passou a existir parecer ausente.
     */
    atribuicao: atribuicaoDaEtapa,
    vendasSemDataNoTotal,
    /**
     * QA-4412-03 — leads cuja data não foi legível, no TOPO do payload.
     *
     * O irmão `vendasSemDataNoTotal` já é campo de topo pelo mesmo motivo, e a
     * AC2 desta story cita esse padrão explicitamente. Só na mensagem da guarda
     * não bastava: o caso MISTO — dias com lead E linhas sem data ao mesmo
     * tempo — cai em `aplicada`, onde `message` é `null`, e a série saía
     * truncada sem ninguém declarar quanto ficou de fora.
     *
     * `null` = a etapa não tem cache de lead; `0` = tem, e nada ficou de fora.
     * A distinção importa: colapsar os dois em `0` afirmaria "nada ficou de
     * fora" para etapa que não foi nem medida.
     */
    leadsSemData: lead?.leadsSemData ?? null,
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
}
