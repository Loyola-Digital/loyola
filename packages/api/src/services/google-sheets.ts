import { createSign } from "node:crypto";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly";

// ============================================================
// SERVICE ACCOUNT AUTH (JWT → access token)
// ============================================================

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY nao configurado no .env");
  return JSON.parse(raw) as ServiceAccountKey;
}

function createJwt(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: SCOPES,
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const signInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(key.private_key, "base64url");

  return `${signInput}.${signature}`;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const key = getServiceAccountKey();
  const jwt = createJwt(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`Service account token error: ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// ============================================================
// LIST SPREADSHEETS (via Drive API)
// ============================================================

export interface SpreadsheetInfo {
  id: string;
  name: string;
}

export async function listSpreadsheets(): Promise<SpreadsheetInfo[]> {
  const accessToken = await getAccessToken();
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'");
  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=50&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Drive API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

// ============================================================
// GET SPREADSHEET SHEETS (abas)
// ============================================================

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
}

export async function getSpreadsheetSheets(spreadsheetId: string): Promise<{ name: string; sheets: SheetInfo[] }> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Sheets API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number } } }[];
  };

  return {
    name: data.properties?.title ?? spreadsheetId,
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? "",
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    })),
  };
}

// ============================================================
// READ SHEET DATA
// ============================================================

export interface SheetData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

const dataCache = new Map<string, { data: SheetData; timestamp: number }>();
const DATA_CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function readSheetData(spreadsheetId: string, sheetName: string): Promise<SheetData> {
  const cacheKey = `${spreadsheetId}:${sheetName}`;
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DATA_CACHE_TTL) return cached.data;

  const accessToken = await getAccessToken();
  const encodedSheet = encodeURIComponent(sheetName);
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodedSheet}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Sheets data error (${res.status}): ${err}`);
  }

  const raw = (await res.json()) as { values?: string[][] };
  const values = raw.values ?? [];
  const headers = values[0] ?? [];
  const rows = values.slice(1);

  const result: SheetData = { headers, rows, totalRows: rows.length };
  dataCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export function clearSheetDataCache(spreadsheetId: string, sheetName: string): void {
  dataCache.delete(`${spreadsheetId}:${sheetName}`);
}
