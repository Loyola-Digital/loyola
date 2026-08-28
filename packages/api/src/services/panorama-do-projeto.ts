/**
 * Story 44.20 — o panorama de UM projeto: as etapas no ar, o que gastaram, o
 * que renderam e onde está o furo da cadeia. Uma chamada no lugar de seis a dez.
 *
 * ## Este módulo NÃO calcula cadeia
 *
 * Ele **compõe**. Toda métrica de cadeia — CPM, CTR, CPC, Connect Rate, Conv.
 * LP, tetos, ranking, benchmarks — vem de `montarPayloadCadeiaCac`, uma chamada
 * por etapa, e viaja daqui para fora **sem reescrita**. Se aparecer uma divisão
 * de taxa neste arquivo, ela está no lugar errado: é a regra 7.6 da spec do
 * Epic 44, a mesma que tirou a composição de dentro das rotas na 44.9.
 *
 * O motivo é o de sempre neste epic: `connectRate` ficou 18 a 35 p.p. errado por
 * mais de um ano porque existiam duas réguas. Um panorama que recalculasse
 * seria a terceira.
 *
 * ## O spend já vem tributado, e o imposto é gross-up
 *
 * `accumulate` (`utils/meta-insight-agg.ts:61`) aplica `applyMetaTax` por linha,
 * antes de qualquer soma. Toda leitura daqui passa por ele, inclusive a das
 * órfãs. **Não reaplicar** — é o bug da 29.24, corrigido na 29.27.
 *
 * ⚠️ E o fator não é a alíquota: `applyMetaTax` (`utils/meta-tax.ts:23`) faz
 * `spend ÷ (1 − 0,1215)` = **×1,1382**, não ×1,1215. Quem conferir com ×1,1215
 * acha ~1,5% de discrepância e procura bug onde não há.
 *
 * ## Uma leitura de mídia para o projeto inteiro
 *
 * A alternativa óbvia — chamar `carregarSerieDiariaPorCampanha` por etapa —
 * multiplicaria a leitura pelo número de etapas e ainda assim não veria as
 * campanhas **órfãs**, que por definição não pertencem a etapa nenhuma. Aqui a
 * série de mídia é UMA query por projeto, na janela longa, e as duas janelas
 * saem por filtro em memória. A cadeia continua sendo uma chamada por etapa —
 * essa não dá para colapsar, e a AC7 manda medir o custo em vez de escondê-lo
 * atrás de cache.
 */

import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  funnels,
  funnelStages,
  metaAdInsightsDaily,
  metaEntityNamesCache,
  projects,
} from "../db/schema.js";
import { round } from "../utils/meta-metrics.js";
import { accumulate, emptyAgg, type InsightRow, type MetricAgg } from "../utils/meta-insight-agg.js";
import { montarPayloadCadeiaCac, type EtapaDaCadeia } from "./cadeia-cac-payload.js";

// ─────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────

export interface JanelaDoPanorama {
  from: string;
  to: string;
  dias: number;
}

export interface CampanhaDoPanorama {
  campaignId: string;
  campaignName: string | null;
  spendCurta: number;
  spendLonga: number;
  /**
   * Story 18.61 · AC3 desta story — `null` significa "o backfill de nomes ainda
   * não resolveu esta entidade", **não** "pausada". Quem renderiza decide o
   * texto (o painel mostra `—`); aqui o `null` viaja intacto.
   */
  effectiveStatus: string | null;
  ultimoDiaComSpend: string | null;
}

export interface GargaloDoPanorama {
  metrica: string;
  atual: number | null;
  teto: number | null;
  queda: number | null;
}

export interface EtapaDoPanorama {
  funnelId: string;
  funnelName: string;
  funnelType: string;
  stageId: string;
  stageName: string;
  stageType: string | null;
  familia: "paga" | "gratuita" | null;
  /** Medido por GASTO na janela curta, nunca por `effectiveStatus`. Ver AC2. */
  noAr: boolean;
  spendCurta: number;
  spendLonga: number;
  /** Repassado do payload da cadeia, com `motivo`/`message` intactos. */
  principal: Record<string, unknown> | null;
  gargalo: GargaloDoPanorama | null;
  campanhas: CampanhaDoPanorama[];
}

/**
 * ⚠️ `origem` não é enfeite (AC5): `"cadeia"` é repasse LITERAL do payload —
 * apurado no backend, citável como fato. `"panorama"` é conclusão desta story,
 * derivada por comparação. Sem o campo, o consumidor citaria um derivado como
 * se fosse fato do backend.
 */
export interface PendenciaDoPanorama {
  stageId: string;
  codigo: string;
  mensagem: string;
  origem: "cadeia" | "panorama";
}

export interface PanoramaDoProjeto {
  projectId: string;
  projectName: string;
  clientName: string;
  janelas: { curta: JanelaDoPanorama; longa: JanelaDoPanorama };
  spendIncludesMetaTax: true;
  unidadeDasTaxas: "decimal";
  etapas: EtapaDoPanorama[];
  campanhasOrfas: { campaignId: string; campaignName: string | null; spendCurta: number }[];
  pendencias: PendenciaDoPanorama[];
  totais: {
    /** Só das ETAPAS. As órfãs estão em `spendOrfas`. */
    spendCurta: number;
    spendLonga: number;
    /**
     * QA-4420-02 — o gasto das órfãs, separado e explícito.
     *
     * Ele existe para que ninguém precise somar `campanhasOrfas` por fora: essa
     * soma é derivação, e derivação na tela faz a tela divergir do que o agente
     * reporta pela REST. `spendCurta + spendOrfas` = o gasto do PROJETO na
     * janela curta.
     */
    spendOrfas: number;
    etapasNoAr: number;
    campanhasComGasto: number;
  };
}

export interface OpcoesDoPanorama {
  /** Último dia das duas janelas. Default: hoje. */
  to?: string;
  /** Default 7. */
  janelaCurtaDias?: number;
  /** Default 30. */
  janelaLongaDias?: number;
}

/**
 * ⚠️ **Não existe `fresh` aqui, e a ausência é decisão medida** (QA-4420-01).
 *
 * A primeira versão repassava `?fresh=1` às N chamadas de
 * `montarPayloadCadeiaCac`, e em cada etapa paga isso zera o `maxAge` do
 * `getFreshSalesDaily`, forçando recompute ao vivo. O panorama multiplicava por
 * N a operação mais cara da cadeia — e N é o que cresce no projeto grande.
 *
 * Medido em 27/08 contra produção, DG & CPDF (12 etapas):
 *
 *     sem fresh      676 ms
 *     com fresh=1  15.137 ms      ← 3× o teto de 5 s da AC7
 *
 * Projetos de UMA etapa não mudavam (Lyrio 106→97 ms), o que confirma que o
 * custo é o N, não um pico.
 *
 * O panorama é a **varredura**: ele diz quais etapas merecem leitura profunda.
 * Quem quer dado de venda recomputado abre a etapa escolhida em
 * `/stages/{stageId}/cadeia-cac?fresh=1`, e paga o custo de UMA etapa.
 */

export const JANELA_CURTA_PADRAO = 7;
export const JANELA_LONGA_PADRAO = 30;

// ─────────────────────────────────────────────────────────────
// Janelas
// ─────────────────────────────────────────────────────────────

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function janela(to: string, dias: number): JanelaDoPanorama {
  const fim = new Date(`${to}T00:00:00Z`);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));
  return { from: ymd(inicio), to, dias };
}

// ─────────────────────────────────────────────────────────────
// Leitura de mídia do PROJETO (uma query, as duas janelas)
// ─────────────────────────────────────────────────────────────

interface MidiaDaCampanha {
  campaignId: string;
  campaignName: string | null;
  spendCurta: number;
  spendLonga: number;
  ultimoDiaComSpend: string | null;
}

/**
 * Lê `meta_ad_insights_daily` do projeto na janela longa e devolve, por
 * campanha, o gasto nas duas janelas.
 *
 * ⚠️ O agrupamento é por **(campanha, dia)** antes de somar, e o `round` por dia
 * é o mesmo de `carregarSerieDiariaPorCampanha` (`meta-campaign-daily.ts:147`).
 * Não é cosmético: é o que faz `spendLonga` desta função bater **ao centavo**
 * com o `agregado.spend` do payload da cadeia da mesma etapa e janela. Somar os
 * brutos e arredondar no fim daria outro número, e a divergência seria lida
 * como imposto aplicado duas vezes.
 */
async function lerMidiaDoProjeto(
  db: Database,
  projectId: string,
  curta: JanelaDoPanorama,
  longa: JanelaDoPanorama,
): Promise<Map<string, MidiaDaCampanha>> {
  const inicio = curta.from < longa.from ? curta.from : longa.from;
  const fim = curta.to > longa.to ? curta.to : longa.to;

  const rows = await db
    .select({
      campaignId: metaAdInsightsDaily.campaignId,
      campaignName: metaAdInsightsDaily.campaignName,
      dateStart: metaAdInsightsDaily.dateStart,
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      reach: metaAdInsightsDaily.reach,
      clicks: metaAdInsightsDaily.clicks,
      actions: metaAdInsightsDaily.actions,
      actionValues: metaAdInsightsDaily.actionValues,
      /** Não é usado aqui — `InsightRow` o exige, e omiti-lo forçaria um cast por `unknown`. */
      lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
    })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.projectId, projectId),
        gte(metaAdInsightsDaily.dateStart, inicio),
        lte(metaAdInsightsDaily.dateStart, fim),
      ),
    );

  const porCampanha = new Map<string, { nome: string | null; dias: Map<string, MetricAgg> }>();
  for (const row of rows) {
    if (!row.campaignId) continue;
    let c = porCampanha.get(row.campaignId);
    if (!c) {
      c = { nome: row.campaignName ?? null, dias: new Map() };
      porCampanha.set(row.campaignId, c);
    }
    if (!c.nome && row.campaignName) c.nome = row.campaignName;
    let agg = c.dias.get(row.dateStart);
    if (!agg) {
      agg = emptyAgg();
      c.dias.set(row.dateStart, agg);
    }
    accumulate(agg, row as InsightRow);
  }

  const saida = new Map<string, MidiaDaCampanha>();
  for (const [campaignId, c] of porCampanha) {
    let spendCurta = 0;
    let spendLonga = 0;
    let ultimoDiaComSpend: string | null = null;
    for (const [date, agg] of c.dias) {
      const spend = round(agg.spend) ?? 0;
      if (date >= curta.from && date <= curta.to) spendCurta += spend;
      if (date >= longa.from && date <= longa.to) spendLonga += spend;
      if (spend > 0 && (ultimoDiaComSpend === null || date > ultimoDiaComSpend)) {
        ultimoDiaComSpend = date;
      }
    }
    saida.set(campaignId, {
      campaignId,
      campaignName: c.nome,
      spendCurta: round(spendCurta) ?? 0,
      spendLonga: round(spendLonga) ?? 0,
      ultimoDiaComSpend,
    });
  }
  return saida;
}

// ─────────────────────────────────────────────────────────────
// Leitura do payload da cadeia, sem confiar na forma
// ─────────────────────────────────────────────────────────────

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function numeroOuNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function textoOuNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * `ranking[0]` é o gargalo — o elo com a MAIOR queda contra o próprio teto.
 *
 * ⚠️ `posicao` fica de fora de propósito: no payload ela é a posição do elo NA
 * CADEIA (1=cpc, 2=connectRate, 3=convLP), não a prioridade. Repassá-la aqui,
 * dentro de um objeto chamado `gargalo`, convidaria a lê-la como ranking.
 */
function extrairGargalo(payload: Record<string, unknown>): GargaloDoPanorama | null {
  const ranking = payload.ranking;
  if (!Array.isArray(ranking) || ranking.length === 0) return null;
  const primeiro = objeto(ranking[0]);
  if (!primeiro) return null;
  const metrica = textoOuNull(primeiro.metrica);
  if (!metrica) return null;
  return {
    metrica,
    atual: numeroOuNull(primeiro.atual),
    teto: numeroOuNull(primeiro.teto),
    queda: numeroOuNull(primeiro.queda),
  };
}

/**
 * As pendências REPASSADAS (AC5a): `codigo` e `mensagem` saem literais do
 * payload.
 *
 * ⚠️ Reescrever aqui recriaria a ambiguidade que a Story 36.9 AC5 removeu —
 * "sync pendente" e "sem fonte" pedem ações opostas (esperar × configurar), e
 * foi juntá-las numa frase só que fez o chamado de 2026-08-14 pedir "rodar o
 * sync" para um problema que rodar o sync não resolvia.
 */
function pendenciasRepassadas(
  stageId: string,
  payload: Record<string, unknown>,
): PendenciaDoPanorama[] {
  const saida: PendenciaDoPanorama[] = [];

  // Etapa fora da aba, ou dentro dela e sem campanha vinculada: os dois cortes
  // que devolvem 200 truncado, com o motivo no TOPO do payload.
  const motivoDeTopo = textoOuNull(payload.motivo);
  if (payload.semDados === true && motivoDeTopo) {
    saida.push({
      stageId,
      codigo: motivoDeTopo,
      mensagem: textoOuNull(payload.message) ?? "",
      origem: "cadeia",
    });
    return saida;
  }

  const principal = objeto(payload.principal);
  const motivo = principal ? textoOuNull(principal.motivo) : null;
  const mensagem = principal ? textoOuNull(principal.message) : null;

  /**
   * ⚠️ **`semDados` sai em DOIS ramos do payload, com ações opostas** — achado
   * QA-4414-02 do gate da Story 44.14.
   *
   * Sem fonte conectada, `principal` vem `{valor: null, motivo: "semDados",
   * message, spend}`. Mas o ramo de SUCESSO com denominador zero
   * (`cadeia-cac-payload.ts:585` e `:600`) acrescenta o MESMO `motivo` ao lado
   * de `vendasReais: 0`/`leadsUnicos: 0`, `dataSource` e `computedAt` — e **sem
   * `message`**.
   *
   * São coisas diferentes: a primeira é lacuna de configuração, que é o que
   * `pendencias` lista; a segunda é uma etapa configurada que não vendeu na
   * janela — fato de negócio, não de setup, e já visível em
   * `principal.vendasReais`. Repassar as duas como pendência mandaria o
   * operador conectar uma fonte que já está conectada, que é exatamente o
   * chamado de 2026-08-14 que a Story 36.9 AC5 fechou.
   *
   * O desempate é a **presença de `message`**: os quatro motivos de configuração
   * (`semDados`, `syncPendente`, `leituraFalhou`, `indeterminado`) sempre a
   * trazem; o ramo de denominador zero, nunca. Uma pendência sem mensagem
   * também seria inútil para quem a lê.
   */
  if (motivo && mensagem) {
    saida.push({ stageId, codigo: motivo, mensagem, origem: "cadeia" });
  }
  return saida;
}

/**
 * As pendências DERIVADAS (AC5b): não existem no payload, são conclusão desta
 * story — por isso `origem: "panorama"` e mensagem escrita aqui.
 */
function pendenciasDerivadas(
  stageId: string,
  payload: Record<string, unknown>,
): PendenciaDoPanorama[] {
  const saida: PendenciaDoPanorama[] = [];

  const tetos = objeto(payload.tetos);
  if (tetos) {
    /**
     * ⚠️ Só entram os tetos que EXISTEM (`valor !== null`). Um teto ausente vem
     * com `motivo: "baseInsuficiente"`/`"semDados"` e não tem `confianca` —
     * contá-lo como "baixa" transformaria "não deu para calcular" em "calculei e
     * é frágil", que são coisas diferentes e a 44.5 separou de propósito.
     */
    const presentes = Object.values(tetos)
      .map(objeto)
      .filter((t): t is Record<string, unknown> => t !== null && numeroOuNull(t.valor) !== null);
    if (presentes.length > 0 && presentes.every((t) => t.confianca === "baixa")) {
      saida.push({
        stageId,
        codigo: "semTetoConfiavel",
        mensagem:
          "Todos os tetos desta etapa têm confiança BAIXA — a base de cada janela vencedora ficou abaixo do piso da Story 44.5. Servem como indicação, não como meta.",
        origem: "panorama",
      });
    }
  }

  const guarda = objeto(payload.guardaDeCobertura);
  if (guarda && guarda.estado === "indisponivel") {
    saida.push({
      stageId,
      codigo: "coberturaIndisponivel",
      mensagem:
        "A guarda de cobertura de rastreio não pôde rodar nesta etapa: o cache de leads não tem a série diária de cobertura. O teto de Conv. LP pode ter saído da semana em que o rastreio funcionou melhor.",
      origem: "panorama",
    });
  }

  return saida;
}

// ─────────────────────────────────────────────────────────────
// A composição
// ─────────────────────────────────────────────────────────────

interface EtapaComFunil extends EtapaDaCadeia {
  funnelId: string;
  funnelName: string;
  funnelType: string;
}

/**
 * Monta o panorama de UM projeto.
 *
 * `null` = o projeto não existe. O chamador devolve 404 — a mesma regra de
 * `resolverEtapaDoProjeto`: 403 confirmaria a existência.
 *
 * ⚠️ **IDOR.** Toda etapa sai do `innerJoin` contra `funnels.projectId`. Nenhum
 * id vindo de fora entra numa query sem essa prova de vínculo — é o buraco que a
 * Story 43.7 abriu e que a 44.8 fechou para a rota da cadeia.
 */
export async function montarPanoramaDoProjeto(
  db: Database,
  config: { SALES_PUBLIC_MAX_AGE_SEC?: number },
  projectId: string,
  opts: OpcoesDoPanorama = {},
): Promise<PanoramaDoProjeto | null> {
  const [projeto] = await db
    .select({ id: projects.id, name: projects.name, clientName: projects.clientName })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!projeto) return null;

  const to = opts.to ?? ymd(new Date());
  const curta = janela(to, opts.janelaCurtaDias ?? JANELA_CURTA_PADRAO);
  const longa = janela(to, opts.janelaLongaDias ?? JANELA_LONGA_PADRAO);

  /**
   * Funil arquivado sai (`archivedAt IS NULL`, soft archive da Story 10.9). A
   * pergunta do panorama é "o que está no ar HOJE"; um funil arquivado com gasto
   * residual na janela aparece como campanha órfã, que é a leitura honesta —
   * dinheiro sem etapa viva por trás.
   */
  const etapas: EtapaComFunil[] = await db
    .select({
      id: funnelStages.id,
      name: funnelStages.name,
      stageType: funnelStages.stageType,
      campaigns: funnelStages.campaigns,
      lpTemVsl: funnelStages.lpTemVsl,
      ticketMedioManual: funnelStages.ticketMedioManual,
      funnelId: funnels.id,
      funnelName: funnels.name,
      funnelType: funnels.type,
    })
    .from(funnelStages)
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(and(eq(funnels.projectId, projectId), isNull(funnels.archivedAt)));

  const midia = await lerMidiaDoProjeto(db, projectId, curta, longa);

  /**
   * ⚠️ A união importa: campanha vinculada SEM gasto na janela não aparece em
   * `midia`, e ainda assim precisa do status — é justamente ela que o operador
   * quer ver marcada como pausada. Consultar só as chaves de `midia` devolveria
   * `null` para toda campanha parada, e `null` aqui significa outra coisa (AC3).
   */
  const vinculadas = new Set<string>();
  for (const etapa of etapas) {
    for (const c of (etapa.campaigns ?? []) as { id: string }[]) vinculadas.add(c.id);
  }
  const status = await lerEffectiveStatus(db, projectId, [
    ...new Set([...midia.keys(), ...vinculadas]),
  ]);

  const etapasDoPanorama: EtapaDoPanorama[] = [];
  const pendencias: PendenciaDoPanorama[] = [];

  for (const etapa of etapas) {
    const campaignIds = ((etapa.campaigns ?? []) as { id: string }[]).map((c) => c.id);

    /**
     * ⚠️ Range SEMPRE explícito (AC7). Sem `from`/`to` o payload da cadeia lê o
     * histórico INTEIRO da etapa (`meta-campaign-daily.ts:110`) — num panorama
     * de N etapas isso seria N leituras sem filtro de data, e o número que sai
     * não seria o da janela declarada.
     */
    const payload = await montarPayloadCadeiaCac(db, config, etapa, {
      projectId,
      stageId: etapa.id,
      from: longa.from,
      to: longa.to,
      // Sem `fresh` de propósito — ver a nota em `OpcoesDoPanorama`.
    });

    const campanhas: CampanhaDoPanorama[] = campaignIds.map((campaignId) => {
      const m = midia.get(campaignId);
      return {
        campaignId,
        campaignName: m?.campaignName ?? null,
        spendCurta: m?.spendCurta ?? 0,
        spendLonga: m?.spendLonga ?? 0,
        effectiveStatus: status.get(campaignId) ?? null,
        ultimoDiaComSpend: m?.ultimoDiaComSpend ?? null,
      };
    });

    const spendCurta = round(campanhas.reduce((s, c) => s + c.spendCurta, 0)) ?? 0;
    const spendLonga = round(campanhas.reduce((s, c) => s + c.spendLonga, 0)) ?? 0;

    const familiaBruta = payload.familia;
    const familia =
      familiaBruta === "paga" || familiaBruta === "gratuita" ? familiaBruta : null;

    etapasDoPanorama.push({
      funnelId: etapa.funnelId,
      funnelName: etapa.funnelName,
      funnelType: etapa.funnelType,
      stageId: etapa.id,
      stageName: etapa.name,
      stageType: etapa.stageType,
      familia,
      /**
       * ⚠️ MEDIDO, não declarado (AC2). Em 27/08, das 13 campanhas do BBE com
       * gasto na janela curta, 5 estavam `PAUSED` — pausadas no meio da janela.
       * Filtrar por `effectiveStatus === "ACTIVE"` perderia 6 das 13 e diria que
       * a etapa não está no ar no dia em que ela gastou.
       */
      noAr: spendCurta > 0,
      spendCurta,
      spendLonga,
      principal: objeto(payload.principal),
      gargalo: extrairGargalo(payload),
      campanhas,
    });

    pendencias.push(...pendenciasRepassadas(etapa.id, payload));
    pendencias.push(...pendenciasDerivadas(etapa.id, payload));
  }

  /**
   * Órfã = gastou na janela curta e não está em `funnel_stages.campaigns` de
   * NENHUMA etapa do projeto (AC4).
   *
   * ⚠️ Nunca dentro de uma etapa. Em 27/08 a órfã do BBE era R$ 0,67 — valor
   * irrelevante, sinal relevante: é dinheiro fora de todo CAC e ROAS do painel.
   * Encostá-la numa etapa por proximidade de nome seria inventar atribuição.
   */
  const campanhasOrfas = [...midia.values()]
    .filter((m) => m.spendCurta > 0 && !vinculadas.has(m.campaignId))
    .map((m) => ({
      campaignId: m.campaignId,
      campaignName: m.campaignName,
      spendCurta: m.spendCurta,
    }))
    .sort((a, b) => b.spendCurta - a.spendCurta);

  return {
    projectId,
    projectName: projeto.name,
    clientName: projeto.clientName,
    janelas: { curta, longa },
    spendIncludesMetaTax: true,
    unidadeDasTaxas: "decimal",
    etapas: etapasDoPanorama,
    campanhasOrfas,
    pendencias,
    /**
     * ⚠️ QA-4420-02: `spendCurta`/`spendLonga` são das ETAPAS. As órfãs ficam de
     * fora — elas não pertencem a etapa nenhuma, e somá-las junto contradiria a
     * separação da AC4. Mas ficam ao lado, em `spendOrfas`: em silêncio o
     * consumidor subnotificaria (no BBE, ~R$ 13 em 5 campanhas — valor
     * irrelevante, sinal relevante), e sem o campo pronto a tela teria que
     * derivar, que é o que a AC8 da 44.21 proíbe.
     *
     * ⚠️ QA-4420-03: a soma é POR ETAPA, sem deduplicar `campaignId`. Campanha
     * vinculada a duas etapas entraria duas vezes. Medido em 27/08: 0 casos nos
     * 5 projetos — defeito latente, não ativo. O vínculo é `jsonb` sem
     * constraint de unicidade entre etapas, então nada no banco o impede.
     */
    totais: {
      spendCurta: round(etapasDoPanorama.reduce((s, e) => s + e.spendCurta, 0)) ?? 0,
      spendLonga: round(etapasDoPanorama.reduce((s, e) => s + e.spendLonga, 0)) ?? 0,
      /**
       * ⚠️ Etapa `familia: null` (lyrio/comercial/debriefing) NÃO conta aqui,
       * mesmo gastando: ela está fora da aba, e somá-la diria que há uma cadeia a
       * ler onde não há. Ela continua na lista `etapas` e no `spend` — some da
       * conta, não do panorama.
       */
      spendOrfas: round(campanhasOrfas.reduce((s, o) => s + o.spendCurta, 0)) ?? 0,
      etapasNoAr: etapasDoPanorama.filter((e) => e.noAr && e.familia !== null).length,
      /** Campanhas VINCULADAS com gasto na janela curta. As órfãs têm lista própria. */
      campanhasComGasto: etapasDoPanorama.reduce(
        (s, e) => s + e.campanhas.filter((c) => c.spendCurta > 0).length,
        0,
      ),
    },
  };
}

/**
 * `effective_status` por campanha (AC3), de `meta_entity_names_cache`.
 *
 * ⚠️ Ausência sai `null` e **permanece `null`** o caminho todo. `null` quer
 * dizer "o backfill de nomes ainda não resolveu esta entidade", não "pausada" —
 * a distinção que a Story 18.61 fixou, e a razão de o painel mostrar `—`.
 */
async function lerEffectiveStatus(
  db: Database,
  projectId: string,
  campaignIds: string[],
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  if (campaignIds.length === 0) return mapa;
  const rows = await db
    .select({
      entityId: metaEntityNamesCache.entityId,
      effectiveStatus: metaEntityNamesCache.effectiveStatus,
    })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "campaign"),
        inArray(metaEntityNamesCache.entityId, campaignIds),
      ),
    );
  for (const row of rows) mapa.set(row.entityId, row.effectiveStatus ?? null);
  return mapa;
}
