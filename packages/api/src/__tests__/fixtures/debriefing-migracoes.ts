/**
 * Story 49.12 — as migrations do Debriefing GERADO (0165 + 0168) para os testes
 * em PGlite. A 0168 mexe em `debriefing_configs` E em `debriefing_payloads`
 * (a parcial por etapa), e o GET da config lê a parcial da etapa — então os
 * testes da config também precisam da tabela irmã. `debriefings` mínima (as
 * colunas de `schema.ts`) só se o teste ainda não a criou.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";

export const MIGRACOES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");
export const MIGRACAO_0168 = join(MIGRACOES, "0168_debriefing_em_andamento.sql");

const DDL_DEBRIEFINGS = `
CREATE TABLE IF NOT EXISTS debriefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  stage_id uuid REFERENCES funnel_stages(id) ON DELETE SET NULL,
  html text NOT NULL,
  file_name text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

/** `debriefings` (se faltar) + 0165 + 0168. Exige `users`, `funnel_stages` e — para a 0168 — `debriefing_configs`. */
export async function aplicarMigracoesDaGeracao(pg: PGlite): Promise<void> {
  await pg.exec(DDL_DEBRIEFINGS);
  await pg.exec(readFileSync(join(MIGRACOES, "0165_debriefing_payloads.sql"), "utf8"));
  await pg.exec(readFileSync(MIGRACAO_0168, "utf8"));
}
