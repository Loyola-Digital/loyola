/**
 * Grupos do funil direto do SendFlow, sem a planilha no meio.
 *
 * A tabela `funnel_group_snapshots` (Epic 26) já tinha exatamente as colunas
 * que o SendFlow devolve — não por coincidência: a planilha que a alimentava
 * era uma EXPORTAÇÃO do SendFlow, colada à mão (os typos "Camapaign" e "Outpu"
 * no cabeçalho denunciam a origem). Aqui a gente lê da fonte e grava na mesma
 * tabela, então o dashboard de Grupos continua funcionando sem tocar em nada.
 *
 * Mapeamento:
 *   campaignId          <- release.id
 *   campaignName        <- release.name
 *   participantsAmount  <- soma de group.participantsAmount
 *   groupTotal/Full/Open<- contagem dos grupos (full = lotado)
 *   inputAmount         <- analytics.add.total
 *   outputAmount        <- analytics.remove.total
 *   clicksTotal         <- analytics.clicks.total
 *
 * `snapshotAt` é a hora da coleta. A agregação diária do dashboard já pega o
 * ÚLTIMO snapshot de cada dia, então rodar várias vezes ao dia é inofensivo.
 */

import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnelGroupSnapshots, funnels, sendflowConnections } from "../db/schema.js";
import { decrypt, encrypt } from "./encryption.js";
import {
  SendflowSession,
  analyticsDaCampanha,
  gruposDaCampanha,
  listarCampanhas,
  renovarToken,
  totalDeParticipantes,
} from "./sendflow.js";

export interface SendflowGroupsSyncResult {
  /** false = projeto sem conexão; quem chama cai na planilha. */
  connected: boolean;
  /** Nome da campanha que casou, ou null. */
  campanha: string | null;
  participantes: number;
  grupos: number;
  inseridos: number;
}

/** Mesmo token do Mautic/Log: "dg-pg04-jul" → "dg-pg04". */
function tokenDoFunil(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome.trim();
}

/**
 * Renova o access_token e devolve uma sessão pronta.
 *
 * Regrava o refresh porque o SendFlow o ROTACIONA a cada uso — não persistir o
 * novo mataria a conexão na renovação seguinte.
 */
async function abrirSessao(db: Database, projectId: string): Promise<SendflowSession | null> {
  const [conn] = await db
    .select()
    .from(sendflowConnections)
    .where(eq(sendflowConnections.projectId, projectId))
    .limit(1);
  if (!conn) return null;

  const t = await renovarToken(
    conn.clientId,
    decrypt(conn.clientSecretEncrypted, conn.clientSecretIv),
    decrypt(conn.refreshTokenEncrypted, conn.refreshTokenIv),
  );
  const ref = encrypt(t.refreshToken);
  const acc = encrypt(t.accessToken);
  await db
    .update(sendflowConnections)
    .set({
      refreshTokenEncrypted: ref.encrypted,
      refreshTokenIv: ref.iv,
      accessTokenEncrypted: acc.encrypted,
      accessTokenIv: acc.iv,
      accessTokenExpiresAt: new Date(t.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(sendflowConnections.projectId, projectId));

  const s = new SendflowSession(t.accessToken);
  await s.conectar();
  return s;
}

export async function sincronizarGruposDoSendflow(
  db: Database,
  projectId: string,
  funnelId: string,
): Promise<SendflowGroupsSyncResult> {
  const vazio: SendflowGroupsSyncResult = {
    connected: false,
    campanha: null,
    participantes: 0,
    grupos: 0,
    inseridos: 0,
  };

  const [funil] = await db
    .select({ name: funnels.name, matchCode: funnels.matchCode })
    .from(funnels)
    .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
    .limit(1);
  if (!funil) return vazio;

  const s = await abrirSessao(db, projectId);
  if (!s) return vazio;

  const alvo = (funil.matchCode ?? tokenDoFunil(funil.name)).toLowerCase();
  const campanha = (await listarCampanhas(s))
    .filter((c) => !c.archived)
    .find((c) => (c.name ?? "").toLowerCase().includes(alvo));
  // Sem campanha não é erro: a maioria dos funis é de outro cliente e não tem
  // operação de WhatsApp.
  if (!campanha) return { ...vazio, connected: true };

  const [grupos, analytics] = await Promise.all([
    gruposDaCampanha(s, campanha.id),
    analyticsDaCampanha(s, campanha.id),
  ]);

  const lotados = grupos.filter((g) => g.full).length;
  const linha = {
    funnelId,
    campaignId: campanha.id,
    campaignName: campanha.name.slice(0, 500),
    snapshotAt: new Date(),
    clicksTotal: analytics.clicks?.total ?? 0,
    groupFull: lotados,
    groupOpen: grupos.length - lotados,
    groupTotal: grupos.length,
    inputAmount: analytics.add?.total ?? 0,
    outputAmount: analytics.remove?.total ?? 0,
    participantsAmount: totalDeParticipantes(grupos),
  };

  await db
    .insert(funnelGroupSnapshots)
    .values(linha)
    .onConflictDoUpdate({
      target: [
        funnelGroupSnapshots.funnelId,
        funnelGroupSnapshots.campaignId,
        funnelGroupSnapshots.snapshotAt,
      ],
      set: {
        campaignName: sql`excluded.campaign_name`,
        clicksTotal: sql`excluded.clicks_total`,
        groupFull: sql`excluded.group_full`,
        groupOpen: sql`excluded.group_open`,
        groupTotal: sql`excluded.group_total`,
        inputAmount: sql`excluded.input_amount`,
        outputAmount: sql`excluded.output_amount`,
        participantsAmount: sql`excluded.participants_amount`,
      },
    });

  return {
    connected: true,
    campanha: campanha.name,
    participantes: linha.participantsAmount,
    grupos: grupos.length,
    inseridos: 1,
  };
}
