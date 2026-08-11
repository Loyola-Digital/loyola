/**
 * Alimenta o Log de Campanha com o histórico de alterações da Meta.
 *
 * Antes, tudo que era mexido no Gerenciador (verba, liga/desliga, público,
 * criativo) só entrava no log se alguém anotasse à mão. Aqui o sync lê a edge
 * `act_<conta>/activities` e cria as entradas sozinho, com o mesmo vocabulário
 * dos dropdowns manuais.
 *
 * O ponto difícil é ATRIBUIR O FUNIL: o log é por funil, e a Meta devolve o
 * objeto tocado (campanha, conjunto ou anúncio). A resolução é, nesta ordem:
 *   1. o objeto é uma campanha vinculada a um funil/etapa → funil direto;
 *   2. a Meta mandou `campaign_id` no extra_data → funil da campanha;
 *   3. o objeto é um conjunto/anúncio conhecido do cache de insights → sobe pra
 *      campanha dele → funil.
 * Evento que não resolve funil é descartado (não existe "log sem funil").
 *
 * Idempotência: `sourceId` + índice único (funnel_id, source_id) — reprocessar a
 * mesma janela não duplica, então a janela pode se sobrepor com folga sem risco.
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  campaignLogEntries,
  funnelStages,
  funnels,
  metaAdInsightsDaily,
  metaAdsAccountProjects,
  metaAdsAccounts,
} from "../db/schema.js";
import { decrypt } from "./encryption.js";
import { fetchAccountActivities } from "./meta-ads.js";
import {
  APLICATIVO_META,
  EVENTO_META,
  mapearAtividade,
  type MetaLogDraft,
} from "./meta-activity-mapper.js";
import { recordSyncRun } from "./meta-sync-state.js";

export interface ActivitySyncSummary {
  accountsProcessed: number;
  activitiesFetched: number;
  entriesCreated: number;
  semFunil: number;
  errors: { accountId: string; error: string }[];
  /** Preenchido só em dryRun: o que seria gravado. */
  preview?: {
    funnelId: string;
    occurredAt: Date;
    categoria: string;
    notes: string;
    responsavel: string;
  }[];
}

export interface ActivitySyncOptions {
  /** Janela em dias (default 7). Sobreposição é segura — o sourceId deduplica. */
  days?: number;
  projectIds?: string[];
  log?: (msg: string) => void;
  /**
   * Não grava nada: resolve tudo e devolve em `preview` o que SERIA criado.
   * Serve pra conferir volume e atribuição de funil antes de soltar o job.
   */
  dryRun?: boolean;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * campanha → funil, a partir do que está vinculado no funil E nas etapas. Os
 * dois lugares importam: o vínculo de campanha vive na etapa (`funnel_stages`)
 * na maioria dos funis, mas o funil também carrega a sua lista.
 */
async function indiceCampanhaPorFunil(
  db: Database,
  projectId: string,
): Promise<Map<string, string>> {
  const indice = new Map<string, string>();

  const listaFunis = await db
    .select({ id: funnels.id, campaigns: funnels.campaigns })
    .from(funnels)
    .where(eq(funnels.projectId, projectId));

  for (const f of listaFunis) {
    for (const c of f.campaigns ?? []) {
      if (c?.id) indice.set(String(c.id), f.id);
    }
  }

  const etapas = await db
    .select({ funnelId: funnelStages.funnelId, campaigns: funnelStages.campaigns })
    .from(funnelStages)
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .where(eq(funnels.projectId, projectId));

  for (const s of etapas) {
    for (const c of s.campaigns ?? []) {
      // Primeiro vínculo vence: a mesma campanha em duas etapas do mesmo funil é
      // comum e não muda o destino; em funis diferentes, o primeiro é tão bom
      // quanto o segundo e evitar o flip mantém o log estável entre execuções.
      if (c?.id && !indice.has(String(c.id))) indice.set(String(c.id), s.funnelId);
    }
  }

  return indice;
}

/**
 * conjunto/anúncio → campanha, lido do cache de insights (que já guarda a
 * hierarquia). Evita ter que perguntar o pai de cada objeto pra Meta.
 */
async function indiceFilhoParaCampanha(
  db: Database,
  projectId: string,
): Promise<Map<string, string>> {
  const linhas = await db
    .selectDistinct({
      adId: metaAdInsightsDaily.adId,
      adsetId: metaAdInsightsDaily.adsetId,
      campaignId: metaAdInsightsDaily.campaignId,
    })
    .from(metaAdInsightsDaily)
    .where(eq(metaAdInsightsDaily.projectId, projectId));

  const indice = new Map<string, string>();
  for (const l of linhas) {
    if (!l.campaignId) continue;
    if (l.adId) indice.set(l.adId, l.campaignId);
    if (l.adsetId) indice.set(l.adsetId, l.campaignId);
  }
  return indice;
}

/**
 * funil → match_code (o mesmo critério do auto-popular de campanhas: o nome da
 * campanha CONTÉM o código; sem código explícito, o próprio nome do funil).
 */
async function codigosDeMatch(
  db: Database,
  projectId: string,
): Promise<{ funnelId: string; code: string }[]> {
  const listaFunis = await db
    .select({ id: funnels.id, name: funnels.name, matchCode: funnels.matchCode })
    .from(funnels)
    .where(eq(funnels.projectId, projectId));

  return listaFunis
    .map((f) => ({
      funnelId: f.id,
      code: (f.matchCode ?? f.name ?? "").trim().toLowerCase(),
    }))
    .filter((f) => f.code.length > 0);
}

/**
 * Funil pelo NOME do objeto, quando o id não resolveu. Cobre a campanha criada
 * seguindo a convenção de nome mas ainda não vinculada a uma etapa — que é
 * justamente quando o log automático mais ajuda.
 *
 * Vence o código mais longo (mais específico): "fz-l3-jul26" ganha de "fz-a1"
 * num nome que contenha os dois. Empate entre funis diferentes descarta, porque
 * atribuir ao funil errado é pior do que não registrar.
 */
function funilPeloNome(
  objectName: string | null,
  codigos: { funnelId: string; code: string }[],
): string | null {
  if (!objectName) return null;
  const nome = objectName.toLowerCase();
  const casam = codigos.filter((c) => nome.includes(c.code));
  if (casam.length === 0) return null;

  const maior = Math.max(...casam.map((c) => c.code.length));
  const finalistas = casam.filter((c) => c.code.length === maior);
  const funisDistintos = new Set(finalistas.map((f) => f.funnelId));
  return funisDistintos.size === 1 ? finalistas[0].funnelId : null;
}

/** Funil de um rascunho, ou null quando não dá pra atribuir com segurança. */
function resolverFunil(
  draft: MetaLogDraft,
  campanhaParaFunil: Map<string, string>,
  filhoParaCampanha: Map<string, string>,
  codigos: { funnelId: string; code: string }[],
): string | null {
  if (draft.objectId) {
    const direto = campanhaParaFunil.get(draft.objectId);
    if (direto) return direto;
  }
  if (draft.campaignIdHint) {
    const viaHint = campanhaParaFunil.get(draft.campaignIdHint);
    if (viaHint) return viaHint;
  }
  if (draft.objectId) {
    const campanhaPai = filhoParaCampanha.get(draft.objectId);
    if (campanhaPai) {
      const viaPai = campanhaParaFunil.get(campanhaPai);
      if (viaPai) return viaPai;
    }
  }
  return funilPeloNome(draft.objectName, codigos);
}

export async function syncMetaActivityLog(
  db: Database,
  opts: ActivitySyncOptions = {},
): Promise<ActivitySyncSummary> {
  const dias = opts.days ?? 7;
  const log = opts.log ?? (() => {});
  const resumo: ActivitySyncSummary = {
    accountsProcessed: 0,
    activitiesFetched: 0,
    entriesCreated: 0,
    semFunil: 0,
    errors: [],
    preview: opts.dryRun ? [] : undefined,
  };

  const until = ymd(new Date());
  const since = ymd(new Date(Date.now() - dias * 864e5));

  // Contas Meta × projetos. Uma conta pode servir vários projetos, e cada
  // projeto tem seus próprios funis — por isso o laço é por (conta, projeto).
  const vinculos = await db
    .select({
      accountRowId: metaAdsAccounts.id,
      accountName: metaAdsAccounts.accountName,
      metaAccountId: metaAdsAccounts.metaAccountId,
      tokenEncrypted: metaAdsAccounts.accessTokenEncrypted,
      tokenIv: metaAdsAccounts.accessTokenIv,
      createdBy: metaAdsAccounts.createdBy,
      projectId: metaAdsAccountProjects.projectId,
    })
    .from(metaAdsAccountProjects)
    .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, metaAdsAccountProjects.accountId))
    .where(eq(metaAdsAccounts.isActive, true));

  const alvo = opts.projectIds?.length
    ? vinculos.filter((v) => opts.projectIds!.includes(v.projectId))
    : vinculos;

  // Uma chamada por CONTA (não por vínculo): a mesma conta em dois projetos não
  // precisa bater duas vezes na Meta.
  const porConta = new Map<string, typeof alvo>();
  for (const v of alvo) {
    const atual = porConta.get(v.metaAccountId) ?? [];
    atual.push(v);
    porConta.set(v.metaAccountId, atual);
  }

  for (const [metaAccountId, projetos] of porConta) {
    const inicio = Date.now();
    const primeiro = projetos[0];
    try {
      const token = decrypt(primeiro.tokenEncrypted, primeiro.tokenIv);
      const atividades = await fetchAccountActivities(metaAccountId, token, since, until);
      resumo.accountsProcessed++;
      resumo.activitiesFetched += atividades.length;
      log(`[meta-activities] ${primeiro.accountName}: ${atividades.length} eventos`);

      const rascunhos = atividades
        .map(mapearAtividade)
        .filter((d): d is MetaLogDraft => d !== null);

      for (const projeto of projetos) {
        const campanhaParaFunil = await indiceCampanhaPorFunil(db, projeto.projectId);
        const codigos = await codigosDeMatch(db, projeto.projectId);
        // Projeto sem funil nenhum não tem onde pendurar o log.
        if (campanhaParaFunil.size === 0 && codigos.length === 0) continue;
        const filhoParaCampanha = await indiceFilhoParaCampanha(db, projeto.projectId);

        let criadas = 0;
        for (const draft of rascunhos) {
          const funnelId = resolverFunil(draft, campanhaParaFunil, filhoParaCampanha, codigos);
          if (!funnelId) {
            resumo.semFunil++;
            continue;
          }
          if (opts.dryRun) {
            resumo.preview!.push({
              funnelId,
              occurredAt: draft.occurredAt,
              categoria: draft.categoria,
              notes: draft.notes,
              responsavel: draft.responsavel,
            });
            criadas++;
            continue;
          }
          const inserido = await db
            .insert(campaignLogEntries)
            .values({
              funnelId,
              occurredAt: draft.occurredAt,
              evento: EVENTO_META,
              aplicativo: APLICATIVO_META,
              categoria: draft.categoria,
              notes: draft.notes,
              responsavel: draft.responsavel,
              source: "meta",
              sourceId: draft.sourceId,
              // Sync automático não tem usuário na requisição; a autoria fica com
              // quem cadastrou a conta Meta. Quem de fato mexeu está em
              // `responsavel` (nome do ator na Meta).
              createdBy: projeto.createdBy,
            })
            .onConflictDoNothing()
            .returning({ id: campaignLogEntries.id });
          if (inserido.length > 0) criadas++;
        }

        resumo.entriesCreated += criadas;
        if (opts.dryRun) continue;
        await recordSyncRun(db, projeto.projectId, metaAccountId, "activities", {
          success: true,
          rowsUpserted: criadas,
          durationMs: Date.now() - inicio,
        });
      }
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      resumo.errors.push({ accountId: metaAccountId, error: mensagem });
      log(`[meta-activities] ERRO em ${metaAccountId}: ${mensagem}`);
      for (const projeto of projetos) {
        await recordSyncRun(db, projeto.projectId, metaAccountId, "activities", {
          success: false,
          error: mensagem,
          durationMs: Date.now() - inicio,
        });
      }
    }
  }

  return resumo;
}
