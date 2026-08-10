// Câmbio USD -> BRL, pra unificar a moeda do dashboard mobile: a Meta reporta
// em BRL e o RevenueCat em USD. Convertendo tudo pra BRL dá pra ter ROAS real.
//
// Fonte ao vivo: AwesomeAPI (economia.awesomeapi.com.br) — brasileira, estável.
// Cache em memória (1h) pra não bater a cada request. Fallbacks: env
// USD_BRL_RATE (cotação manual) e, por fim, um default conservador.

const FX_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_FALLBACK_RATE = 5.4;

export interface UsdBrl {
  rate: number;
  /** live = cotação buscada; manual = env USD_BRL_RATE; fallback = default fixo. */
  source: "live" | "manual" | "fallback";
  asOf: string;
}

let cache: (UsdBrl & { at: number }) | null = null;

function manualRate(): number | null {
  const raw = process.env.USD_BRL_RATE;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getUsdToBrl(): Promise<UsdBrl> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { rate: cache.rate, source: cache.source, asOf: cache.asOf };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FX_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        USDBRL?: { bid?: string; create_date?: string };
      };
      const bid = Number(data.USDBRL?.bid);
      if (Number.isFinite(bid) && bid > 0) {
        const out: UsdBrl = {
          rate: bid,
          source: "live",
          asOf: data.USDBRL?.create_date ?? new Date().toISOString(),
        };
        cache = { ...out, at: Date.now() };
        return out;
      }
    }
  } catch {
    // rede/timeout/egress bloqueado — cai no fallback abaixo.
  } finally {
    clearTimeout(timer);
  }

  const manual = manualRate();
  const out: UsdBrl =
    manual != null
      ? { rate: manual, source: "manual", asOf: new Date().toISOString() }
      : { rate: DEFAULT_FALLBACK_RATE, source: "fallback", asOf: new Date().toISOString() };
  cache = { ...out, at: Date.now() };
  return out;
}
