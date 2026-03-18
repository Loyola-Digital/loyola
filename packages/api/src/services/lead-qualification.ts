import { eq } from "drizzle-orm";
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
