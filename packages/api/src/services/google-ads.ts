import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================
// HELPERS
// ============================================================

/**
 * Strip hyphens from customer ID for API calls (123-456-7890 → 1234567890)
 */
export function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "");
}

/**
 * Format customer ID for display (1234567890 → 123-456-7890)
 */
export function formatCustomerId(customerId: string): string {
  const clean = normalizeCustomerId(customerId);
  if (clean.length !== 10) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

// ============================================================
// OAUTH TOKEN REFRESH
// ============================================================

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Simple in-memory token cache (per customer)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  refreshToken: string,
  customerId: string
): Promise<string> {
  const cached = tokenCache.get(customerId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  // Google OAuth2 client credentials for token refresh
  // These should come from env in production
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET devem estar configurados no .env");
  }

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

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Falha ao obter access token do Google: ${error}`);
  }

  const data = (await res.json()) as TokenResponse;
  tokenCache.set(customerId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

// ============================================================
// GOOGLE ADS API FETCH
// ============================================================

interface GoogleAdsSearchResponse {
  results?: Record<string, unknown>[];
  fieldMask?: string;
}

async function queryGoogleAds(
  customerId: string,
  developerToken: string,
  accessToken: string,
  query: string
): Promise<Record<string, unknown>[]> {
  const cid = normalizeCustomerId(customerId);
  const url = `${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${error}`);
  }

  // searchStream returns array of batches
  const batches = (await res.json()) as { results?: Record<string, unknown>[] }[];
  const results: Record<string, unknown>[] = [];
  for (const batch of batches) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

// ============================================================
// VALIDATION
// ============================================================

export async function validateGoogleAdsAccount(
  customerId: string,
  developerToken: string,
  refreshToken: string
): Promise<string> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const cid = normalizeCustomerId(customerId);

  const results = await queryGoogleAds(
    cid,
    developerToken,
    accessToken,
    `SELECT customer.descriptive_name, customer.id FROM customer LIMIT 1`
  );

  if (!results || results.length === 0) {
    throw new Error("Conta não encontrada ou sem acesso.");
  }

  const customer = results[0].customer as { descriptiveName?: string; id?: string } | undefined;
  return customer?.descriptiveName ?? `Conta ${formatCustomerId(customerId)}`;
}

// ============================================================
// DECRYPT HELPER
// ============================================================

export function decryptToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
