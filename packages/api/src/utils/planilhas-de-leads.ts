/**
 * Story 18.100 (AC7) — TODAS as planilhas de leads de uma etapa, no layout comum.
 *
 * ## O defeito
 *
 * O leads por criativo (`stage-creative-performance.ts`, ponto 6) e a receita
 * por criativo no caminho legado (`creative-revenue.ts`, ponto 7) liam
 * `funnel_spreadsheets` com `.limit(1)` e sem `ORDER BY`: numa etapa com duas
 * planilhas `leads` (a do formulário da LP e a do Lead Form da Meta), uma delas
 * ficava de fora — e qual, o banco decidia.
 *
 * ## O que este util faz
 *
 * 1. Busca as planilhas `leads` da etapa em `ORDER BY created_at, id` (a mesma
 *    ordem da união do web, AC2).
 * 2. Lê cada uma por `readSheetData` (fontes `webhook:` incluídas, #1044).
 * 3. Remapeia cada uma pelo SEU `column_mapping` para o layout comum
 *    (`remapearParaLayoutComum`, AC4d): a aba do Lead Form guarda o anúncio em
 *    `ad_id`, a do formulário em `content`, e as rotas leem por índice.
 * 4. Tira o prefixo de id do Lead Form (`c:`, `as:`, `ag:`, AC4a).
 * 5. Concatena, com índice único na lista unida (AC3). Não deduplica: os
 *    contadores das rotas seguem deduplicando como já faziam.
 *
 * O resultado tem a forma de `readSheetData` (`headers` + `rows`) e um
 * `columnMapping` que aponta cada campo para o cabeçalho canônico, então as
 * rotas seguem achando as colunas pelo mesmo `findCol` de sempre.
 *
 * Importa o shared SÓ por `@loyola-x/shared` (Story 19.14): o caminho de
 * arquivo passa no `tsc` e no `vitest`, mas derruba o boot pelo `dist`.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  remapearParaLayoutComum,
  semPrefixoDeId,
  type CampoDoLayoutComum,
} from "@loyola-x/shared";
import type { Database } from "../db/client.js";
import { funnelSpreadsheets } from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

/** Os campos que as rotas leem da planilha de leads — todos só pelo mapeamento. */
export const CAMPOS_DE_LEADS_DA_API: readonly CampoDoLayoutComum[] = [
  { campo: "email" },
  { campo: "date" },
  { campo: "utm_source" },
  { campo: "utm_medium" },
  { campo: "utm_campaign" },
  { campo: "utm_content" },
  { campo: "utm_term" },
];

/** As colunas em que a integração do Lead Form põe prefixo no id (AC4a). */
const COLUNAS_COM_PREFIXO_DE_ID = ["utm_campaign", "utm_medium", "utm_content"] as const;

export type PlanilhaDeLeads = typeof funnelSpreadsheets.$inferSelect;

/** A consulta (sem executar) das planilhas `leads` da etapa, na ordem da união (AC2). */
export function consultaDasPlanilhasDeLeads(db: Database, stageId: string) {
  return db
    .select()
    .from(funnelSpreadsheets)
    .where(and(eq(funnelSpreadsheets.stageId, stageId), eq(funnelSpreadsheets.type, "leads")))
    .orderBy(asc(funnelSpreadsheets.createdAt), asc(funnelSpreadsheets.id));
}

/** As planilhas `leads` da etapa, na ordem da união (AC2). Vazia = nenhuma. */
export async function buscarPlanilhasDeLeads(
  db: Database,
  stageId: string,
): Promise<PlanilhaDeLeads[]> {
  return consultaDasPlanilhasDeLeads(db, stageId);
}

/** As planilhas unidas, na forma de `readSheetData` mais o mapeamento canônico. */
export interface PlanilhasDeLeadsUnidas {
  headers: string[];
  rows: string[][];
  totalRows: number;
  /** Cada campo presente → o seu cabeçalho canônico (o próprio nome do campo). */
  columnMapping: Partial<Record<string, string>>;
  /** De onde veio cada linha, para log e diagnóstico. */
  fontes: { id: string; label: string; linhas: number }[];
}

/** Uma planilha já lida. */
export interface PlanilhaDeLeadsLida {
  planilha: Pick<PlanilhaDeLeads, "id" | "label" | "columnMapping">;
  dados: { headers: string[]; rows: string[][] };
}

/** A união das planilhas já lidas, no layout comum, sem prefixo de id. Pura. */
export function unirPlanilhasDeLeadsLidas(
  lidas: readonly PlanilhaDeLeadsLida[],
): PlanilhasDeLeadsUnidas {
  const unida = remapearParaLayoutComum(
    lidas.map(({ planilha, dados }) => ({
      headers: dados.headers ?? [],
      rows: dados.rows ?? [],
      mapeamento: (planilha.columnMapping ?? null) as Record<string, string | undefined> | null,
    })),
    CAMPOS_DE_LEADS_DA_API,
  );
  const prefixadas = COLUNAS_COM_PREFIXO_DE_ID.map((c) => [c, unida.headers.indexOf(c)] as const).filter(
    ([, i]) => i >= 0,
  );
  const rows =
    prefixadas.length === 0
      ? unida.rows
      : unida.rows.map((row) => {
          const nova = [...row];
          for (const [coluna, i] of prefixadas) nova[i] = semPrefixoDeId(coluna, nova[i] ?? "");
          return nova;
        });
  const columnMapping: Partial<Record<string, string>> = {};
  for (const h of unida.headers) columnMapping[h] = h;
  return {
    headers: unida.headers,
    rows,
    totalRows: rows.length,
    columnMapping,
    fontes: lidas.map(({ planilha, dados }) => ({
      id: planilha.id,
      label: planilha.label,
      linhas: dados.rows?.length ?? 0,
    })),
  };
}

/**
 * Lê as planilhas (na ordem recebida) e devolve a união. Uma leitura que falha
 * derruba a união inteira — o mesmo que acontecia com a planilha única: número
 * parcial sem aviso seria pior.
 */
export async function lerPlanilhasDeLeads(
  planilhas: readonly PlanilhaDeLeads[],
  ler: (spreadsheetId: string, sheetName: string) => Promise<{ headers: string[]; rows: string[][] }> = readSheetData,
): Promise<PlanilhasDeLeadsUnidas> {
  const dados = await Promise.all(planilhas.map((p) => ler(p.spreadsheetId, p.sheetName)));
  return unirPlanilhasDeLeadsLidas(planilhas.map((planilha, i) => ({ planilha, dados: dados[i] })));
}
