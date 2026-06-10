import { eq, count } from "drizzle-orm";
import type { Database } from "../client.js";
import { switchyChannelPresets } from "../schema.js";

// ============================================================
// Epic 33 — Switchy Link Generator: 7 presets default por projeto.
// Seed é lazy/por-projeto: inserido pela rota GET /switchy/presets quando o
// projeto ainda não tem nenhum preset. NÃO roda dentro da migration 0048.
// Base do modelo decodificado: pay.tmbeducacao.com.br/FernandaZapp/Y5B1006856G.
// ============================================================
export const DEFAULT_SWITCHY_PRESETS = [
  { label: "bio", utmMedium: "bio", utmSource: "ig", sortOrder: 0 },
  { label: "direct", utmMedium: "direct", utmSource: "ig", sortOrder: 1 },
  { label: "stories", utmMedium: "stories", utmSource: "ig", sortOrder: 2 },
  { label: "manychat", utmMedium: "automacao", utmSource: "manychat", sortOrder: 3 },
  { label: "chatwoot", utmMedium: "disparo", utmSource: "chatwoot", sortOrder: 4 },
  { label: "email", utmMedium: "email", utmSource: "mautic", sortOrder: 5 },
  { label: "grupo", utmMedium: "grupo", utmSource: "whatsapp", sortOrder: 6 },
] as const;

/**
 * Insere os 7 presets default para o projeto, mas SOMENTE quando o projeto
 * ainda não tem nenhum preset (count === 0). Idempotente: chamadas seguintes
 * (com presets já existentes) não inserem nada e retornam a lista atual.
 * Retorna a lista de presets do projeto ordenada por sortOrder asc.
 */
export async function seedSwitchyPresetsIfEmpty(
  db: Database,
  projectId: string,
) {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(switchyChannelPresets)
    .where(eq(switchyChannelPresets.projectId, projectId));

  if (existing === 0) {
    await db.insert(switchyChannelPresets).values(
      DEFAULT_SWITCHY_PRESETS.map((preset) => ({
        projectId,
        label: preset.label,
        utmMedium: preset.utmMedium,
        utmSource: preset.utmSource,
        sortOrder: preset.sortOrder,
      })),
    );
  }
}
