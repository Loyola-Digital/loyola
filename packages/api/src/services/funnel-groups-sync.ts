import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnelGroupsSpreadsheets, funnelGroupSnapshots } from "../db/schema.js";
import { readSheetData, type SheetData } from "./google-sheets.js";

export interface SyncResult {
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  errors: string[];
}

interface ColumnMap {
  campaignId: number;
  campaignName: number;
  clicksTotal: number;
  snapshotAt: number;
  groupFull: number;
  groupOpen: number;
  groupTotal: number;
  inputAmount: number;
  outputAmount: number;
  participantsAmount: number;
}

/**
 * Normaliza header (lowercase + remove acentos + remove não-alfanuméricos)
 * para tolerar variações tipo "Criação"/"Criacao"/"criação".
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Mapeia headers da planilha para índices das colunas que precisamos.
 * A planilha de origem tem typos conhecidos ("Camapaign", "Outpu") — o
 * matching tolera porque comparamos prefixos normalizados.
 */
function buildColumnMap(headers: string[]): ColumnMap | { error: string } {
  const norm = headers.map(normalize);

  // Cada entrada: campo do schema → lista de aliases possíveis (já normalizados)
  // O matching é "começa com" pra tolerar typos no fim do header da planilha.
  const aliases: Record<keyof ColumnMap, string[]> = {
    campaignId: ["campaignid", "camapaignid"],
    campaignName: ["campaignname", "camapaignname"],
    clicksTotal: ["clickstotalcount", "clickstotal", "clicks"],
    snapshotAt: ["criacao", "snapshotat", "data", "datahora", "createdat"],
    groupFull: ["groupfullamount", "groupfull"],
    groupOpen: ["groupopenamount", "groupopen"],
    groupTotal: ["grouptotalamount", "grouptotal"],
    inputAmount: ["inputamount", "input"],
    outputAmount: ["outputamount", "outpuamount", "output"],
    participantsAmount: ["participantsamount", "participants"],
  };

  const map: Partial<ColumnMap> = {};
  for (const [field, candidates] of Object.entries(aliases) as [keyof ColumnMap, string[]][]) {
    const idx = norm.findIndex((h) => candidates.some((c) => h === c || h.startsWith(c)));
    if (idx === -1) {
      return { error: `Coluna obrigatória não encontrada: ${field} (headers: ${headers.join(", ")})` };
    }
    map[field] = idx;
  }
  return map as ColumnMap;
}

function parseInteger(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[^\d-]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseTimestamp(val: string | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lê a planilha vinculada ao funil e ingere/atualiza snapshots no banco.
 * Idempotente via UNIQUE(funnel_id, campaign_id, snapshot_at).
 */
export async function syncGroupsFromSheet(
  db: Database,
  funnelId: string
): Promise<SyncResult> {
  const result: SyncResult = { rowsProcessed: 0, rowsInserted: 0, rowsUpdated: 0, errors: [] };

  const [link] = await db
    .select()
    .from(funnelGroupsSpreadsheets)
    .where(sql`${funnelGroupsSpreadsheets.funnelId} = ${funnelId}`)
    .limit(1);

  if (!link) {
    result.errors.push("Nenhuma planilha vinculada a este funil");
    return result;
  }

  let sheet: SheetData;
  try {
    sheet = await readSheetData(link.spreadsheetId, link.sheetName);
  } catch (err) {
    result.errors.push(
      `Erro ao ler planilha: ${err instanceof Error ? err.message : String(err)}`
    );
    return result;
  }

  if (sheet.rows.length === 0) {
    result.errors.push("Planilha vazia");
    return result;
  }

  const colMap = buildColumnMap(sheet.headers);
  if ("error" in colMap) {
    result.errors.push(colMap.error);
    return result;
  }

  // Coletar linhas válidas e fazer upsert em lote
  const valuesToInsert: Array<typeof funnelGroupSnapshots.$inferInsert> = [];
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    result.rowsProcessed++;

    const campaignId = (row[colMap.campaignId] ?? "").trim();
    const campaignName = (row[colMap.campaignName] ?? "").trim();
    const snapshotAt = parseTimestamp(row[colMap.snapshotAt]);

    if (!campaignId || !campaignName || !snapshotAt) {
      result.errors.push(
        `Linha ${i + 2}: campaign_id/name/snapshot_at inválido (campaign_id="${campaignId}", snapshot_at="${row[colMap.snapshotAt]}")`
      );
      continue;
    }

    valuesToInsert.push({
      funnelId,
      campaignId,
      campaignName: campaignName.slice(0, 500),
      snapshotAt,
      clicksTotal: parseInteger(row[colMap.clicksTotal]),
      groupFull: parseInteger(row[colMap.groupFull]),
      groupOpen: parseInteger(row[colMap.groupOpen]),
      groupTotal: parseInteger(row[colMap.groupTotal]),
      inputAmount: parseInteger(row[colMap.inputAmount]),
      outputAmount: parseInteger(row[colMap.outputAmount]),
      participantsAmount: parseInteger(row[colMap.participantsAmount]),
    });
  }

  if (valuesToInsert.length === 0) {
    return result;
  }

  // Upsert em chunks de 500 pra não estourar limite de parâmetros do pg.
  const CHUNK = 500;
  for (let i = 0; i < valuesToInsert.length; i += CHUNK) {
    const chunk = valuesToInsert.slice(i, i + CHUNK);
    const inserted = await db
      .insert(funnelGroupSnapshots)
      .values(chunk)
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
      })
      .returning({ id: funnelGroupSnapshots.id, createdAt: funnelGroupSnapshots.createdAt });

    // Heurística simples pra contar inseridos vs atualizados: linhas cuja
    // created_at está dentro dos últimos 5s são novas. Não é exato (pode dar
    // falso-positivo numa segunda sync rápida), mas é suficiente pro feedback
    // visual ao usuário.
    const now = Date.now();
    for (const r of inserted) {
      if (now - new Date(r.createdAt).getTime() < 5000) {
        result.rowsInserted++;
      } else {
        result.rowsUpdated++;
      }
    }
  }

  await db
    .update(funnelGroupsSpreadsheets)
    .set({ lastSyncedAt: new Date() })
    .where(sql`${funnelGroupsSpreadsheets.funnelId} = ${funnelId}`);

  return result;
}
