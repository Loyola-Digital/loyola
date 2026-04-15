/**
 * Shared types for the "Planilhas Genéricas no Funil" feature (EPIC-17).
 * Mirrors the backend schema in packages/api/src/db/schema.ts (funnelSpreadsheets).
 */

export type FunnelSpreadsheetType = "leads" | "sales" | "custom";

export interface ColumnMapping {
  name?: string;
  email?: string;
  phone?: string;
  date?: string;
  status?: string;
  value?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface FunnelSpreadsheet {
  id: string;
  funnelId: string;
  label: string;
  type: FunnelSpreadsheetType;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: ColumnMapping;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelSpreadsheetRow {
  values: string[];
  named: Partial<Record<keyof ColumnMapping, string>>;
}

export interface FunnelSpreadsheetData {
  headers: string[];
  rows: FunnelSpreadsheetRow[];
  mapping: ColumnMapping;
  totalRows: number;
}
