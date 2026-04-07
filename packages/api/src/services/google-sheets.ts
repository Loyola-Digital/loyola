const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================
// TOKEN REFRESH (reuses Google credentials from env)
// ============================================================

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getSheetsAccessToken(refreshToken: string, cacheKey: string): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth nao configurado");

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

// ============================================================
// LIST SPREADSHEETS (via Drive API)
// ============================================================

export interface SpreadsheetInfo {
  id: string;
  name: string;
}

export async function listSpreadsheets(accessToken: string): Promise<SpreadsheetInfo[]> {
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

export async function getSpreadsheetSheets(accessToken: string, spreadsheetId: string): Promise<{ name: string; sheets: SheetInfo[] }> {
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

export async function readSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<SheetData> {
  const cacheKey = `${spreadsheetId}:${sheetName}`;
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DATA_CACHE_TTL) return cached.data;

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
