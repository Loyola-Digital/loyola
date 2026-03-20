import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "../db/client.js";
import {
  googleSheetsConnections,
  googleSheetsTabMappings,
  qualificationProfiles,
} from "../db/schema.js";
import { getTabData } from "./google-sheets.js";

// ============================================================
// TYPES
// ============================================================

export interface QualificationRule {
  field: string;
  operator: "equals" | "not_equals" | "gte" | "lte" | "contains" | "in";
  value: string;
}

export interface QualificationResult {
  totalLeads: number;
  qualifiedLeads: number;
  qualificationRate: number;
}

export interface QualifiedLeadsByEntity {
  matched: Map<string, number>; // entityId → qualified count
  totalQualified: number;
}

// ============================================================
// CORE LOGIC
// ============================================================

export function isLeadQualified(
  surveyData: Record<string, string>,
  rules: QualificationRule[]
): boolean {
  if (rules.length === 0) return false;

  return rules.every((rule) => {
    const fieldValue = (surveyData[rule.field] ?? "").trim().toLowerCase();
    const ruleValue = rule.value.trim().toLowerCase();

    switch (rule.operator) {
      case "equals":
        return fieldValue === ruleValue;
      case "not_equals":
        return fieldValue !== ruleValue;
      case "gte":
        return parseFloat(fieldValue) >= parseFloat(ruleValue);
      case "lte":
        return parseFloat(fieldValue) <= parseFloat(ruleValue);
      case "contains":
        return fieldValue.includes(ruleValue);
      case "in":
        return ruleValue
          .split(",")
          .map((v) => v.trim())
          .includes(fieldValue);
      default:
        return false;
    }
  });
}

// ============================================================
// SURVEY DATA
// ============================================================

async function getSurveyForProject(
  db: Database,
  projectId: string
): Promise<Record<string, string>[] | null> {
  const [connection] = await db
    .select()
    .from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.projectId, projectId))
    .limit(1);

  if (!connection) return null;

  const surveyMappings = await db
    .select()
    .from(googleSheetsTabMappings)
    .where(eq(googleSheetsTabMappings.connectionId, connection.id))
    .then((rows) => rows.filter((r) => r.tabType === "survey"));

  if (surveyMappings.length === 0) return null;

  const mapping = surveyMappings[0];
  const tabData = await getTabData(
    connection.spreadsheetId,
    mapping.tabName,
    mapping.columnMapping as Record<string, string>
  );

  return tabData.rows;
}

// ============================================================
// CLASSIFICATION
// ============================================================

export async function classifyLeads(
  db: Database,
  projectId: string,
  rules: QualificationRule[]
): Promise<QualificationResult> {
  const surveyData = await getSurveyForProject(db, projectId);
  if (!surveyData) {
    return { totalLeads: 0, qualifiedLeads: 0, qualificationRate: 0 };
  }

  let qualified = 0;
  for (const row of surveyData) {
    if (isLeadQualified(row, rules)) {
      qualified++;
    }
  }

  return {
    totalLeads: surveyData.length,
    qualifiedLeads: qualified,
    qualificationRate:
      surveyData.length > 0 ? (qualified / surveyData.length) * 100 : 0,
  };
}

export async function getQualifiedLeadsByEntity(
  db: Database,
  projectId: string,
  leads: Record<string, string>[],
  utmField: string,
  entities: { id: string; name: string }[]
): Promise<QualifiedLeadsByEntity | null> {
  // Get qualification profile
  const [profile] = await db
    .select()
    .from(qualificationProfiles)
    .where(eq(qualificationProfiles.projectId, projectId))
    .limit(1);

  if (!profile) return null;

  const rules = profile.rules as QualificationRule[];

  // Get survey data
  const surveyData = await getSurveyForProject(db, projectId);
  if (!surveyData) return null;

  // Index survey by utmCampaign for fast lookup
  const surveyByUtm = new Map<string, Record<string, string>>();
  for (const row of surveyData) {
    const utmKey = (row.utmCampaign ?? "").trim().toLowerCase();
    if (utmKey) {
      surveyByUtm.set(utmKey, row);
    }
  }

  // For each lead, find survey data and check qualification
  const matched = new Map<string, number>();
  let totalQualified = 0;

  for (const lead of leads) {
    const utmValue = (lead[utmField] ?? "").trim().toLowerCase();
    if (!utmValue) continue;

    // Find matching survey response
    const survey = surveyByUtm.get(utmValue);
    if (!survey) continue;

    // Check if qualified
    if (!isLeadQualified(survey, rules)) continue;

    totalQualified++;

    // Attribute to entity
    for (const entity of entities) {
      const entityName = entity.name.trim().toLowerCase();
      const entityId = entity.id.trim().toLowerCase();
      if (utmValue === entityName || utmValue === entityId) {
        matched.set(entity.id, (matched.get(entity.id) ?? 0) + 1);
        break;
      }
    }
  }

  return { matched, totalQualified };
}

export async function getProfileForProject(
  db: Database,
  projectId: string
): Promise<QualificationRule[] | null> {
  const [profile] = await db
    .select()
    .from(qualificationProfiles)
    .where(eq(qualificationProfiles.projectId, projectId))
    .limit(1);

  if (!profile) return null;
  return profile.rules as QualificationRule[];
}

// ============================================================
// AI RULE GENERATION (Story 7.9)
// ============================================================

interface FieldSummary {
  isNumeric: boolean;
  uniqueValues: string[];
  min?: number;
  max?: number;
  examples?: string[];
}

function summarizeFieldValues(values: string[]): FieldSummary {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) {
    return { isNumeric: false, uniqueValues: [] };
  }

  // Check if mostly numeric
  const numericValues = nonEmpty
    .map((v) => parseFloat(v.replace(/[^\d.,-]/g, "").replace(",", ".")))
    .filter((n) => !isNaN(n));

  const isNumeric = numericValues.length >= nonEmpty.length * 0.7;

  if (isNumeric && numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(sorted.length / 5));
    const examples = [0, step, step * 2, step * 3, sorted.length - 1]
      .map((i) => Math.min(i, sorted.length - 1))
      .map((i) => String(sorted[i]));
    const uniqueExamples = [...new Set(examples)].slice(0, 5);

    return {
      isNumeric: true,
      uniqueValues: [],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      examples: uniqueExamples,
    };
  }

  const unique = [...new Set(nonEmpty.map((v) => v.trim()))];
  return { isNumeric: false, uniqueValues: unique.slice(0, 20) };
}

export async function generateRulesFromDescription(
  db: Database,
  claudeClient: Anthropic,
  projectId: string,
  description: string
): Promise<QualificationRule[]> {
  // 1. Get survey connection + mapping
  const [connection] = await db
    .select()
    .from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.projectId, projectId))
    .limit(1);

  if (!connection) {
    throw new Error("Nenhuma planilha conectada a este projeto.");
  }

  const surveyMappings = await db
    .select()
    .from(googleSheetsTabMappings)
    .where(eq(googleSheetsTabMappings.connectionId, connection.id))
    .then((rows) => rows.filter((r) => r.tabType === "survey"));

  if (surveyMappings.length === 0) {
    throw new Error(
      "Nenhuma aba de pesquisa (survey) mapeada. Configure a aba de pesquisa no Google Sheets primeiro."
    );
  }

  // 2. Read survey data — use columnMapping if available so AI generates
  //    rules with the same field names that classifyLeads() expects
  const mapping = surveyMappings[0];
  const columnMapping = mapping.columnMapping as Record<string, string> | null;
  const hasMappedFields = columnMapping && Object.keys(columnMapping).length > 0;

  const tabData = hasMappedFields
    ? await getTabData(connection.spreadsheetId, mapping.tabName, columnMapping)
    : await getTabData(connection.spreadsheetId, mapping.tabName);

  if (tabData.headers.length === 0 && (!hasMappedFields || tabData.rows.length === 0)) {
    throw new Error("Aba de pesquisa vazia — sem headers encontrados.");
  }

  // 3. Build field summaries using the keys that classifyLeads will use
  const fieldSummaries: Record<string, FieldSummary> = {};
  const fieldNames = hasMappedFields
    ? Object.keys(columnMapping).filter((k) => !k.startsWith("utm"))
    : tabData.headers;

  for (const field of fieldNames) {
    const values = tabData.rows.slice(0, 50).map((row) => row[field] ?? "");
    fieldSummaries[field] = summarizeFieldValues(values);
  }

  // 4. Build prompt
  const fieldDescriptions = Object.entries(fieldSummaries)
    .map(([field, summary]) => {
      if (summary.isNumeric) {
        return `- ${field} (numerico): min=${summary.min}, max=${summary.max}, exemplos: ${summary.examples?.join(", ")}`;
      }
      if (summary.uniqueValues.length === 0) return `- ${field}: (sem dados)`;
      return `- ${field}: ${summary.uniqueValues.join(", ")}`;
    })
    .join("\n");

  const prompt = `Voce e um assistente que gera regras de qualificacao de leads.

O usuario descreveu o publico ideal como:
"${description}"

A planilha de pesquisa tem os seguintes campos:
${fieldNames.join(", ")}

Valores encontrados por campo:
${fieldDescriptions}

Gere regras de qualificacao no formato JSON:
[
  { "field": "nome_exato_do_header", "operator": "equals|not_equals|gte|lte|contains|in", "value": "valor_exato_da_planilha" }
]

REGRAS:
- Use EXATAMENTE os nomes dos headers da planilha no campo "field"
- Use EXATAMENTE os valores encontrados na planilha no campo "value" (para texto)
- Operadores disponiveis: equals, not_equals, gte (>=), lte (<=), contains, in
- Para numeros use gte/lte. Para texto exato use equals. Para lista de opcoes use in (valores separados por virgula).
- Retorne APENAS o array JSON, sem explicacao, sem markdown, sem code fences.`;

  // 5. Call Claude (non-streaming)
  const message = await claudeClient.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  // 6. Parse response
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      "A IA nao conseguiu gerar regras. Tente reformular a descricao do publico."
    );
  }

  let rules: QualificationRule[];
  try {
    // Strip possible markdown code fences
    const cleaned = textBlock.text
      .replace(/```json?\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    rules = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "A IA retornou um formato invalido. Tente reformular a descricao do publico."
    );
  }

  // 7. Validate rules shape
  const validOperators = new Set([
    "equals",
    "not_equals",
    "gte",
    "lte",
    "contains",
    "in",
  ]);
  const validatedRules = rules.filter(
    (r) =>
      typeof r.field === "string" &&
      typeof r.operator === "string" &&
      typeof r.value === "string" &&
      validOperators.has(r.operator)
  );

  if (validatedRules.length === 0) {
    throw new Error(
      "Nenhuma regra valida gerada. Tente descrever o publico com mais detalhes."
    );
  }

  return validatedRules;
}
