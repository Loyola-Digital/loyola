// ============================================================
// Story 42.10 — o ponto diário da série do RevenueCat.
//
// A API devolve o estado de AGORA. Cada dia sem gravar é um ponto perdido para
// sempre — não existe endpoint que devolva o MRR de uma data passada. Daí a
// prioridade assimétrica: o valor aparece em meses, o custo de adiar é
// permanente.
// ============================================================

import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  revenuecatConnections,
  revenuecatStageConfig,
  revenuecatMetricSnapshots,
} from "../db/schema.js";
import { decryptRevenuecatKey, getRevenuecatOverview } from "./revenuecat.js";

/** O dia local em YYYY-MM-DD. Recebe a data para poder ser testado. */
export function diaDaColeta(agora: Date): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface MetricaGravada {
  value: number;
  unit: string | null;
}

/**
 * Converte a lista da API no objeto que vai para o JSONB.
 *
 * Guarda `unit` junto: `mrr` e `revenue` vêm em dólar, e uma série sem unidade
 * seria lida como real por quem a consumir daqui a meses.
 */
export function paraObjetoDeMetricas(
  metrics: Array<{ id: string; value: number; unit: string | null }>,
): Record<string, MetricaGravada> {
  const out: Record<string, MetricaGravada> = {};
  for (const m of metrics) out[m.id] = { value: m.value, unit: m.unit };
  return out;
}

export interface ResumoDaColeta {
  etapasProcessadas: number;
  etapasComFalha: number;
  dia: string;
}

/**
 * Grava um ponto por etapa configurada.
 *
 * ## AC4 — falha NÃO vira zero
 *
 * Se a API falhar para uma etapa, nenhuma linha é gravada para ela naquele dia.
 * A ausência do dia é distinguível de um dia com zero real — e num dado
 * histórico essa distinção é irreversível: um zero gravado hoje é
 * indistinguível de um zero verdadeiro daqui a seis meses.
 *
 * É a lição do #608, onde uma falha de leitura chegou à tela como "dados
 * zerados". Ali o estrago durou até alguém reclamar; aqui duraria para sempre.
 */
export async function gravarSnapshotDiario(
  db: Database,
  agora: Date,
  log?: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void },
): Promise<ResumoDaColeta> {
  const dia = diaDaColeta(agora);
  let etapasProcessadas = 0;
  let etapasComFalha = 0;

  const configs = await db
    .select({
      stageId: revenuecatStageConfig.stageId,
      rcProjectId: revenuecatStageConfig.rcProjectId,
      projectId: revenuecatStageConfig.projectId,
    })
    .from(revenuecatStageConfig);

  for (const cfg of configs) {
    if (!cfg.rcProjectId) continue;
    try {
      const [conn] = await db
        .select({
          apiKeyEncrypted: revenuecatConnections.apiKeyEncrypted,
          apiKeyIv: revenuecatConnections.apiKeyIv,
        })
        .from(revenuecatConnections)
        .where(eq(revenuecatConnections.projectId, cfg.projectId))
        .limit(1);
      if (!conn) continue;

      const apiKey = decryptRevenuecatKey(conn.apiKeyEncrypted, conn.apiKeyIv);
      const metrics = await getRevenuecatOverview(apiKey, cfg.rcProjectId);

      // Resposta vazia é falha de leitura disfarçada, não um dia sem dado.
      if (!metrics.length) {
        etapasComFalha++;
        log?.error({ stageId: cfg.stageId }, "[rc-snapshot] overview vazio — nada gravado");
        continue;
      }

      await db
        .insert(revenuecatMetricSnapshots)
        .values({
          stageId: cfg.stageId,
          rcProjectId: cfg.rcProjectId,
          snapshotDate: dia,
          metrics: paraObjetoDeMetricas(metrics),
          collectedAt: agora,
        })
        // AC3: idempotente por (etapa, dia).
        .onConflictDoUpdate({
          target: [revenuecatMetricSnapshots.stageId, revenuecatMetricSnapshots.snapshotDate],
          set: { metrics: paraObjetoDeMetricas(metrics), collectedAt: agora },
        });

      etapasProcessadas++;
    } catch (err) {
      etapasComFalha++;
      log?.error({ err, stageId: cfg.stageId }, "[rc-snapshot] falhou — nada gravado para este dia");
    }
  }

  return { etapasProcessadas, etapasComFalha, dia };
}
