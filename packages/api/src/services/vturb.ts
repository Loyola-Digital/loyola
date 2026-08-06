/**
 * Cliente da VTurb Analytics API.
 *
 * Contrato (docs oficiais):
 * - base `https://analytics.vturb.net`
 * - headers OBRIGATÓRIOS: `X-Api-Token` (token cru, sem "Bearer") e
 *   `X-Api-Version: v1`. Faltando qualquer um → 401.
 * - quase tudo é POST com corpo JSON; só `/players/list`, `/sessions/live_users`
 *   e `/quota/usage` são GET com query string.
 *
 * Pegadinha que define a arquitetura: a maioria dos endpoints de stats EXIGE
 * `video_duration` e `pitch_time` como parâmetro — a API não os deduz do player.
 * Por isso guardamos os dois no vínculo (`vturb_players`), colhidos de
 * `/players/list`. Sem eles não há como calcular engajamento nem retenção no
 * pitch.
 */

const BASE_URL = "https://analytics.vturb.net";
const TIMEOUT_MS = 25_000;

/** Rate limit por plano: Basic 60/min · Pro 120 · Scale 300 · Enterprise 800. */
const MAX_RETRIES = 3;

export class VturbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "VturbError";
  }
}

function mensagemDoErro(status: number, body: string): string {
  if (status === 401) {
    return "Token do VTurb inválido ou sem permissão. Confira em app.vturb.com → Configurações → Analytics API.";
  }
  if (status === 429) return "Limite de requisições do VTurb atingido.";
  if (status === 404) return "Recurso não encontrado no VTurb (player removido?).";
  const trecho = body.slice(0, 200);
  return `VTurb respondeu ${status}${trecho ? `: ${trecho}` : ""}`;
}

async function request<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (method === "GET" && payload) {
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  let ultimaFalha: VturbError | null = null;

  for (let tentativa = 0; tentativa <= MAX_RETRIES; tentativa++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "X-Api-Token": token,
          "X-Api-Version": "v1",
          "Content-Type": "application/json",
        },
        body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
      });

      if (res.ok) return (await res.json()) as T;

      const body = await res.text().catch(() => "");
      // 429 e 5xx valem retry; 401/400/404 não — insistir só queima cota.
      const retryable = res.status === 429 || res.status >= 500;
      ultimaFalha = new VturbError(mensagemDoErro(res.status, body), res.status, retryable);
      if (!retryable || tentativa === MAX_RETRIES) throw ultimaFalha;

      // Respeita o Retry-After quando vem; senão, backoff exponencial.
      const retryAfter = Number(res.headers.get("retry-after"));
      const esperaMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2 ** tentativa * 1000, 8000);
      await new Promise((r) => setTimeout(r, esperaMs));
    } catch (err) {
      if (err instanceof VturbError) {
        if (!err.retryable || tentativa === MAX_RETRIES) throw err;
        continue;
      }
      if (err instanceof Error && err.name === "AbortError") {
        ultimaFalha = new VturbError("O VTurb demorou demais pra responder.", 504, true);
        if (tentativa === MAX_RETRIES) throw ultimaFalha;
        continue;
      }
      throw new VturbError(
        err instanceof Error ? err.message : "Falha de rede ao falar com o VTurb.",
        0,
        false,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw ultimaFalha ?? new VturbError("Falha desconhecida no VTurb.", 0, false);
}

// ============================================================
// Tipos da resposta (nomes exatos da API)
// ============================================================

export interface VturbPlayer {
  id: string;
  name: string;
  pitch_time: number | null;
  duration: number | null;
  created_at: string;
}

/** `/sessions/stats` — o bloco de números do topo do dashboard. */
export interface VturbSessionStats {
  total_viewed: number;
  total_viewed_device_uniq: number;
  total_viewed_session_uniq: number;
  total_started: number;
  total_started_session_uniq: number;
  total_started_device_uniq: number;
  total_finished: number;
  total_finished_session_uniq: number;
  total_finished_device_uniq: number;
  engagement_rate: number;
  total_clicked: number;
  total_clicked_device_uniq: number;
  total_clicked_session_uniq: number;
  total_over_pitch: number;
  total_under_pitch: number;
  over_pitch_rate: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_amount_usd: number;
  total_amount_brl: number;
  total_amount_eur: number;
  play_rate: number;
}

export type VturbStatsByDay = (VturbSessionStats & { date_key: string })[];

/** `/times/user_engagement` — a curva de retenção. `timed` é o segundo do vídeo. */
export interface VturbEngagement {
  average_watched_time: number;
  engagement_rate: number;
  grouped_timed: { timed: number; total_users: number }[];
}

/** `/clicks/total_by_company_timed` — onde no vídeo as pessoas clicam. */
export type VturbClicksTimed = { timed: number; total_users: number }[];

export interface VturbQuota {
  quotas: {
    interval_seconds: number;
    interval_starts_at: string;
    interval_ends_at: string;
    queries: { used: number; limit: number; remaining: number; note?: string };
    read_bytes: { used: number; limit: number; remaining: number };
  }[];
}

// ============================================================
// Endpoints
// ============================================================

export interface VturbRange {
  /** YYYY-MM-DD. A conversão para o formato que a API exige é feita aqui. */
  startDate: string;
  endDate: string;
  timezone?: string;
}

/**
 * A API exige datetime com hora/minuto/segundo e aceita UM formato só:
 * "YYYY-MM-DD HH:MM:SS" (espaço, sem zona). Testado contra a API real:
 *
 *   "2026-07-01"                      -> 400
 *   "2026-07-01T00:00:00"             -> 400
 *   "2026-07-01T00:00:00.000+00:00"   -> 400   <- a doc lista como exemplo válido
 *   "2026-07-01 00:00:00"             -> 200
 *   "2026-07-01 00:00:00 UTC"         -> 200
 *
 * Ficamos sem o sufixo UTC de propósito: mandamos `timezone` no corpo, e é ele
 * que deve interpretar o horário — fixar UTC deslocaria o dia do cliente.
 */
function inicioDoDia(data: string): string {
  return `${data} 00:00:00`;
}

/** Fim inclusivo: quem escolhe "até 05/08" espera o dia 05 inteiro. */
function fimDoDia(data: string): string {
  return `${data} 23:59:59`;
}

/**
 * A API mistura tipos no MESMO objeto: as taxas vêm como string
 * (`play_rate: "51.3"`, `engagement_rate: "16.1"`, `over_pitch_rate: "8.56"`)
 * e os contadores como número (`total_viewed: 4760`). Quem consumir direto
 * quebra ao formatar — `"51.3".toFixed()` não existe.
 *
 * Normalizamos aqui, na fronteira, para o resto do sistema ver só `number`,
 * como os tipos declaram. Campo ausente vira 0 em vez de `undefined`: a UI
 * formata esses valores sem guarda, e um buraco no meio do objeto derrubava a
 * página inteira.
 */
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Lista explícita: garante que todo campo exista mesmo se a API omitir. */
const CAMPOS_STATS = [
  "total_viewed", "total_viewed_device_uniq", "total_viewed_session_uniq",
  "total_started", "total_started_device_uniq", "total_started_session_uniq",
  "total_finished", "total_finished_device_uniq", "total_finished_session_uniq",
  "engagement_rate", "total_clicked", "total_clicked_device_uniq",
  "total_clicked_session_uniq", "total_over_pitch", "total_under_pitch",
  "over_pitch_rate", "total_conversions", "overall_conversion_rate",
  "total_amount_usd", "total_amount_brl", "total_amount_eur", "play_rate",
] as const;

function normalizarStats(raw: Record<string, unknown> | null | undefined): VturbSessionStats {
  const out = {} as Record<string, number>;
  for (const k of CAMPOS_STATS) out[k] = num(raw?.[k]);
  return out as unknown as VturbSessionStats;
}

export async function listPlayers(
  token: string,
  opts: { name?: string; timezone?: string } = {},
): Promise<VturbPlayer[]> {
  const query: Record<string, unknown> = {};
  if (opts.name && opts.name.length >= 3) {
    query.name = opts.name;
    query.name_match = "contains";
  }
  if (opts.timezone) query.timezone = opts.timezone;
  return request<VturbPlayer[]>(token, "GET", "/players/list", query);
}

export async function sessionStats(
  token: string,
  input: VturbRange & { playerId: string; videoDuration?: number | null; pitchTime?: number | null },
): Promise<VturbSessionStats> {
  const raw = await request<Record<string, unknown>>(token, "POST", "/sessions/stats", {
    player_id: input.playerId,
    start_date: inicioDoDia(input.startDate),
    end_date: fimDoDia(input.endDate),
    timezone: input.timezone,
    // Sem video_duration a API não calcula engagement_rate; sem pitch_time não
    // calcula over_pitch_rate. Ambos vêm do vínculo.
    video_duration: input.videoDuration ?? undefined,
    pitch_time: input.pitchTime ?? undefined,
  });
  return normalizarStats(raw);
}

export async function sessionStatsByDay(
  token: string,
  input: VturbRange & { playerId: string; videoDuration?: number | null; pitchTime?: number | null },
): Promise<VturbStatsByDay> {
  const raw = await request<Record<string, unknown>[]>(token, "POST", "/sessions/stats_by_day", {
    player_id: input.playerId,
    start_date: inicioDoDia(input.startDate),
    end_date: fimDoDia(input.endDate),
    timezone: input.timezone,
    video_duration: input.videoDuration ?? undefined,
    pitch_time: input.pitchTime ?? undefined,
  });
  // date_key é o único campo não-numérico da linha; preservado como veio.
  return (Array.isArray(raw) ? raw : []).map((linha) => ({
    ...normalizarStats(linha),
    date_key: String(linha?.date_key ?? ""),
  }));
}

export async function userEngagement(
  token: string,
  input: VturbRange & { playerId: string; videoDuration: number },
): Promise<VturbEngagement> {
  const raw = await request<Record<string, unknown>>(token, "POST", "/times/user_engagement", {
    player_id: input.playerId,
    video_duration: input.videoDuration,
    start_date: inicioDoDia(input.startDate),
    end_date: fimDoDia(input.endDate),
    timezone: input.timezone,
  });
  const pontos = Array.isArray(raw?.grouped_timed) ? (raw.grouped_timed as Record<string, unknown>[]) : [];
  return {
    average_watched_time: num(raw?.average_watched_time),
    engagement_rate: num(raw?.engagement_rate),
    grouped_timed: pontos.map((p) => ({ timed: num(p?.timed), total_users: num(p?.total_users) })),
  };
}

export async function clicksTimed(
  token: string,
  input: VturbRange & { playerId: string },
): Promise<VturbClicksTimed> {
  const raw = await request<Record<string, unknown>[]>(token, "POST", "/clicks/total_by_company_timed", {
    player_id: input.playerId,
    start_date: inicioDoDia(input.startDate),
    end_date: fimDoDia(input.endDate),
    timezone: input.timezone,
  });
  return (Array.isArray(raw) ? raw : []).map((p) => ({
    timed: num(p?.timed),
    total_users: num(p?.total_users),
  }));
}

export async function quotaUsage(token: string): Promise<VturbQuota> {
  return request<VturbQuota>(token, "GET", "/quota/usage");
}

/** Valida o token com a chamada mais barata que existe. */
export async function validateToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await quotaUsage(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Token inválido" };
  }
}
