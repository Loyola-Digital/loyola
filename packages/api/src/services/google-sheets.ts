import { google, sheets_v4 } from "googleapis";

// ============================================================
// CONSTANTS
// ============================================================

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// ============================================================
// RATE LIMITER
// ============================================================

let requestCount = 0;
let windowStart = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= RATE_LIMIT_MAX) {
    throw new Error(
      "Google Sheets API rate limit exceeded. Try again in a minute."
    );
  }
  requestCount++;
}

// ============================================================
// TYPES
// ============================================================

export interface SpreadsheetInfo {
  spreadsheetId: string;
  name: string;
  tabs: string[];
}

export interface TabPreview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface TabData {
  headers: string[];
  rows: Record<string, string>[];
}

// ============================================================
// CLIENT
// ============================================================

let cachedClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY env var is not set. Provide the Service Account JSON key as a stringified JSON."
    );
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(keyJson);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Ensure it is the stringified Service Account key file."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

// ============================================================
// HELPERS
// ============================================================

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export function getServiceAccountEmail(): string | null {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return null;
  try {
    const creds = JSON.parse(keyJson);
    return creds.client_email ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export async function validateSpreadsheetAccess(
  spreadsheetId: string
): Promise<SpreadsheetInfo> {
  checkRateLimit();
  const sheets = getSheetsClient();

  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId });

    const name = res.data.properties?.title ?? "Untitled";
    const tabs =
      res.data.sheets
        ?.map((s) => s.properties?.title)
        .filter((t): t is string => !!t) ?? [];

    return { spreadsheetId, name, tabs };
  } catch (err: unknown) {
    const status = (err as { code?: number }).code;
    if (status === 403 || status === 404) {
      const saEmail = getServiceAccountEmail();
      throw new Error(
        `Planilha nao acessivel. Compartilhe a planilha com o email: ${saEmail ?? "(Service Account nao configurada)"}`
      );
    }
    throw new Error(
      `Erro ao acessar planilha: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function getTabPreview(
  spreadsheetId: string,
  tabName: string
): Promise<TabPreview> {
  checkRateLimit();
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!1:10`,
  });

  const rows = res.data.values ?? [];
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);

  // Get total row count
  checkRateLimit();
  const fullRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!A:A`,
  });
  const totalRows = Math.max((fullRes.data.values?.length ?? 1) - 1, 0);

  return {
    headers: headers.map(String),
    rows: dataRows.map((r) => r.map(String)),
    totalRows,
  };
}

export async function getTabData(
  spreadsheetId: string,
  tabName: string,
  columnMapping?: Record<string, string>
): Promise<TabData> {
  checkRateLimit();
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'`,
  });

  const rawRows = res.data.values ?? [];
  if (rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rawRows[0].map(String);
  const dataRows = rawRows.slice(1);

  if (!columnMapping) {
    // Return raw data with header keys
    return {
      headers,
      rows: dataRows.map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] != null ? String(row[i]) : "";
        });
        return obj;
      }),
    };
  }

  // Apply column mapping: { utmCampaign: "Campaign Name", utmMedium: "Ad Set" }
  // Maps logical field names to column header names
  const mappedRows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    for (const [field, headerName] of Object.entries(columnMapping)) {
      const colIndex = headers.indexOf(headerName);
      const value = colIndex >= 0 && row[colIndex] != null ? String(row[colIndex]) : "";
      // Normalize UTM fields: trim + lowercase
      if (field.startsWith("utm")) {
        obj[field] = value.trim().toLowerCase();
      } else {
        obj[field] = value.trim();
      }
    }
    return obj;
  });

  return { headers, rows: mappedRows };
}
