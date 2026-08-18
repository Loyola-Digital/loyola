/**
 * Cliente do Plausible self-hosted.
 *
 * Fala com DUAS versões da API porque instância self-hosted é versionada pelo
 * dono, não por nós: as novas expõem `POST /api/v2/query` (uma chamada resolve
 * agregado + breakdowns), as antigas só `GET /api/v1/stats/*`. Tentamos v2 e
 * caímos pra v1 no primeiro sinal de que ela não existe (404/400). Sem isso, a
 * integração dependeria de adivinhar a versão do servidor de alguém.
 *
 * A saída é moldada no formato do dashboard GA4 de propósito: a tela da etapa já
 * sabe desenhar aquilo, e o pedido é justamente "trocar a fonte", não trocar a
 * leitura. Métrica que o Plausible não tem vem zerada em vez de inventada.
 */

import type { Ga4PageRow, Ga4StageDashboard } from "./ga4.js";

export interface PlausibleCreds {
  baseUrl: string;
  apiKey: string;
}

/** Sem barra no fim — a montagem de URL abaixo assume isso. */
export function normalizarBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function chamar<T>(
  creds: PlausibleCreds,
  caminho: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: true; data: T } | { ok: false; status: number; erro: string }> {
  const res = await fetch(`${normalizarBaseUrl(creds.baseUrl)}${caminho}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Instância de terceiro pode estar fora do ar; sem timeout a rota do
    // dashboard ficaria pendurada até o proxy derrubar.
    signal: AbortSignal.timeout(20_000),
  });

  const texto = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, erro: texto.slice(0, 300) };
  }
  try {
    return { ok: true, data: JSON.parse(texto) as T };
  } catch {
    return { ok: false, status: res.status, erro: "Resposta não é JSON — a URL aponta pro Plausible?" };
  }
}

export interface ResultadoTeste {
  ok: boolean;
  detalhe: string;
  /** true = a instância respondeu, mas a chave não pôde ser verificada aqui. */
  inconclusivo?: boolean;
}

/**
 * Testa a config GLOBAL (URL + chave).
 *
 * A Sites API é o único endpoint que valida a chave sozinha — todo o resto do
 * Plausible exige um `site_id` junto. Onde ela não está habilitada (comum em
 * self-hosted), o resultado é INCONCLUSIVO de propósito: o 401 de `/query` diz
 * literalmente "invalid API key OR site ID", então tratá-lo como "chave errada"
 * mandaria o admin trocar uma credencial que talvez esteja certa. Quem fecha o
 * diagnóstico é `testarSite`, na hora de escolher o domínio do projeto.
 */
export async function validarCredenciais(creds: PlausibleCreds): Promise<ResultadoTeste> {
  const r = await chamar<unknown>(creds, "/api/v1/sites?limit=1");
  if (r.ok) return { ok: true, detalhe: "Conexão ok — chave válida (Sites API respondeu)." };

  if (r.status === 401 || r.status === 403) {
    return { ok: false, detalhe: "A instância respondeu, mas recusou a chave (401/403). Gere uma nova em Settings → API Keys." };
  }
  if (r.status === 404) {
    // 404 na Sites API tanto acontece em instância Plausible sem ela habilitada
    // quanto em QUALQUER site do mundo. Sem esta segunda checagem, salvar
    // "https://exemplo.com" passava como configuração válida. `/api/health` é a
    // assinatura do Plausible: responde o status de postgres e clickhouse.
    const saude = await chamar<Record<string, string>>(creds, "/api/health");
    const pareceePlausible = saude.ok && ("clickhouse" in saude.data || "postgres" in saude.data);
    if (!pareceePlausible) {
      return { ok: false, detalhe: "Essa URL não parece ser uma instância Plausible (nem /api/v1/sites nem /api/health responderam)." };
    }
    return {
      ok: true,
      inconclusivo: true,
      detalhe:
        "Instância encontrada, mas sem Sites API — os domínios terão de ser digitados à mão, " +
        "e a chave só pode ser confirmada ao escolher o site de um projeto.",
    };
  }
  return { ok: false, detalhe: `A URL não respondeu como uma instância Plausible (HTTP ${r.status}).` };
}

/**
 * Testa chave + domínio juntos — o teste que de fato conclui.
 *
 * Um 401 aqui já não é ambíguo em UM sentido: se a chave funcionou em outro
 * site, o problema é o domínio; se falha em todos, é a chave. A mensagem diz as
 * duas hipóteses porque o Plausible não distingue, mas o teste é o real.
 */
export async function testarSite(creds: PlausibleCreds, siteId: string): Promise<ResultadoTeste> {
  const r = await chamar<V2Resposta>(creds, "/api/v2/query", {
    method: "POST",
    body: { site_id: siteId, metrics: ["visitors"], date_range: "7d" },
  });
  if (r.ok) {
    const visitantes = r.data.results?.[0]?.metrics?.[0] ?? 0;
    return { ok: true, detalhe: `Site lido com sucesso — ${visitantes} visitantes nos últimos 7 dias.` };
  }
  if (r.status === 401 || r.status === 403) {
    return { ok: false, detalhe: `O Plausible recusou "${siteId}": chave sem acesso a esse site, ou domínio inexistente na instância.` };
  }
  // Instância antiga (sem v2) — tenta a v1 antes de dar erro.
  if (r.status === 404 || r.status === 400) {
    const v1 = await consultarV1Agregado(creds, siteId, ymd(-7), ymd(0));
    if (v1) return { ok: true, detalhe: `Site lido pela API v1 — ${v1.visitors?.value ?? 0} visitantes nos últimos 7 dias.` };
    return { ok: false, detalhe: `Não foi possível ler "${siteId}" em nenhuma versão da API.` };
  }
  return { ok: false, detalhe: `Erro ao consultar o site (HTTP ${r.status}).` };
}

export interface PlausibleSite {
  domain: string;
}

/**
 * Sites da instância. A Sites API não existe em toda instalação self-hosted —
 * quando falta, devolvemos lista vazia e a UI deixa digitar o domínio à mão, em
 * vez de travar a configuração.
 */
export async function listarSites(creds: PlausibleCreds): Promise<PlausibleSite[]> {
  const r = await chamar<{ sites?: { domain: string }[] }>(creds, "/api/v1/sites?limit=100");
  if (!r.ok) return [];
  return (r.data.sites ?? []).map((s) => ({ domain: s.domain }));
}

// ============================================================
// Estatísticas
// ============================================================

interface V2Resposta {
  results?: Array<{ metrics: number[]; dimensions: string[] }>;
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** aaaa-mm-dd de N dias atrás (N negativo = passado). */
export function ymd(offsetDias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

/** `2026-08-01,2026-08-17` — o formato de intervalo aceito pelas duas versões. */
function intervalo(inicio: string, fim: string): string {
  return `${inicio},${fim}`;
}

/**
 * Erro que a rota converte em 502 com a mensagem do Plausible.
 *
 * Existe porque o modo de falha silencioso é pior aqui do que em quase todo o
 * resto: chave errada devolvendo "0 visitantes" é indistinguível de uma semana
 * sem tráfego, e o time discutiria uma queda que nunca houve.
 */
export class PlausibleErro extends Error {}

type RespostaV2 =
  | { tipo: "ok"; linhas: Array<{ metrics: number[]; dimensions: string[] }> }
  /** Instância antiga: a v2 não existe, vale tentar a v1. */
  | { tipo: "sem-v2" }
  | { tipo: "erro"; detalhe: string };

async function consultarV2(
  creds: PlausibleCreds,
  siteId: string,
  inicio: string,
  fim: string,
  metrics: string[],
  dimensions: string[],
  pageFilter?: string | null,
): Promise<RespostaV2> {
  const r = await chamar<V2Resposta>(creds, "/api/v2/query", {
    method: "POST",
    body: {
      site_id: siteId,
      metrics,
      date_range: [inicio, fim],
      dimensions,
      // Mesmo papel do `ga4_page_filter` da etapa: recortar a instância inteira
      // no pedaço que é daquela etapa. Sem isso, toda etapa do projeto mostraria
      // o número do site todo.
      ...(pageFilter ? { filters: [["contains", "event:page", [pageFilter]]] } : {}),
    },
  });
  // 404 aqui = instância antiga sem v2; vale tentar a v1. Um 400 pode ser
  // ambos, então também cai pra v1 antes de desistir. Os demais (401/403/5xx)
  // são problema real e viram erro visível.
  if (!r.ok) {
    if (r.status === 404 || r.status === 400) return { tipo: "sem-v2" };
    return { tipo: "erro", detalhe: mensagemDoPlausible(r.erro, r.status) };
  }
  return { tipo: "ok", linhas: r.data.results ?? [] };
}

/** Extrai o `error` do corpo do Plausible; cai pro HTTP quando não há corpo JSON. */
function mensagemDoPlausible(corpo: string, status: number): string {
  try {
    const j = JSON.parse(corpo) as { error?: string };
    if (j.error) return j.error;
  } catch { /* corpo não-JSON */ }
  return `HTTP ${status}`;
}

/** Só as linhas — para as quebras, onde uma falha não deve derrubar o resto. */
function linhasOuVazio(r: RespostaV2): Array<{ metrics: number[]; dimensions: string[] }> {
  return r.tipo === "ok" ? r.linhas : [];
}

/**
 * Na v1 o filtro não tem operador `contains` — usa glob. `*trecho*` é o
 * equivalente mais próximo do CONTAINS que a etapa configurou.
 */
function filtroV1(pageFilter?: string | null): string {
  return pageFilter ? `&filters=${encodeURIComponent(`event:page==*${pageFilter}*`)}` : "";
}

async function consultarV1Agregado(
  creds: PlausibleCreds,
  siteId: string,
  inicio: string,
  fim: string,
  pageFilter?: string | null,
): Promise<Record<string, { value: number }> | null> {
  const metricas = "visitors,visits,pageviews,bounce_rate,visit_duration,events";
  const r = await chamar<{ results?: Record<string, { value: number }> }>(
    creds,
    `/api/v1/stats/aggregate?site_id=${encodeURIComponent(siteId)}&period=custom&date=${intervalo(inicio, fim)}&metrics=${metricas}${filtroV1(pageFilter)}`,
  );
  if (!r.ok) return null;
  return r.data.results ?? {};
}

async function consultarV1Breakdown(
  creds: PlausibleCreds,
  siteId: string,
  inicio: string,
  fim: string,
  propriedade: string,
  pageFilter?: string | null,
  limite = 12,
): Promise<Array<Record<string, unknown>>> {
  const r = await chamar<{ results?: Array<Record<string, unknown>> }>(
    creds,
    `/api/v1/stats/breakdown?site_id=${encodeURIComponent(siteId)}&period=custom&date=${intervalo(inicio, fim)}` +
      `&property=${encodeURIComponent(propriedade)}&metrics=visitors,visits,events&limit=${limite}` +
      filtroV1(pageFilter),
  );
  return r.ok ? (r.data.results ?? []) : [];
}

export interface PlausibleDashboard extends Ga4StageDashboard {
  /** Fonte real do dado — a tela mostra de onde veio em vez de deixar implícito. */
  fonte: "plausible";
  /** Versão da API que respondeu, pra diagnosticar instância antiga. */
  apiVersion: "v2" | "v1";
  /** Mesmas chaves do GA4 — a tela desenha a tabela de páginas sem saber a fonte. */
  byPage: Ga4PageRow[];
  pageFilter: string | null;
  configured: boolean;
  /** Domínio lido no Plausible, pro rodapé de auditoria da tela. */
  siteId: string;
}

/**
 * Dashboard da etapa a partir do Plausible, no formato que a tela já desenha.
 *
 * Equivalências (e o que NÃO existe):
 *  - visitors → users/activeUsers;  visits → sessions;  pageviews → pageViews
 *  - events (goals) → conversions
 *  - engagementRate = 1 − bounce_rate, que é o mais próximo honesto
 *  - newUsers e revenue ficam ZERADOS: o Plausible CE não expõe os dois, e
 *    preencher com estimativa criaria número que ninguém consegue auditar.
 */
export async function montarDashboard(
  creds: PlausibleCreds,
  siteId: string,
  inicio: string,
  fim: string,
  pageFilter?: string | null,
): Promise<PlausibleDashboard> {
  const filtro = pageFilter?.trim() || null;
  const vazio: PlausibleDashboard = {
    fonte: "plausible",
    apiVersion: "v2",
    byPage: [],
    pageFilter: filtro,
    configured: Boolean(filtro),
    siteId,
    totals: {
      sessions: 0, users: 0, activeUsers: 0, newUsers: 0, engagedSessions: 0,
      engagementRate: 0, conversions: 0, pageViews: 0, revenue: 0,
    },
    byChannel: [],
    topSources: [],
    topCampaigns: [],
  };

  const METRICAS_V2 = ["visitors", "visits", "pageviews", "events", "bounce_rate"];
  const agregadoV2 = await consultarV2(creds, siteId, inicio, fim, METRICAS_V2, [], filtro);
  if (agregadoV2.tipo === "erro") throw new PlausibleErro(agregadoV2.detalhe);

  if (agregadoV2.tipo === "ok") {
    // Linha ausente = período sem tráfego. Os `?? 0` são o que impede o
    // destructuring de um array vazio virar `undefined` e, na conta de
    // engajamento, NaN — que serializa como `null` e quebra a tela.
    const m = agregadoV2.linhas[0]?.metrics ?? [];
    const [visitors, visits, pageviews, events, bounce] = [0, 1, 2, 3, 4].map((i) => n(m[i] ?? 0));

    const [canais, origens, campanhas, paginas] = await Promise.all([
      consultarV2(creds, siteId, inicio, fim, ["visits", "events"], ["visit:channel"], filtro),
      consultarV2(creds, siteId, inicio, fim, ["visits", "events"], ["visit:source"], filtro),
      consultarV2(creds, siteId, inicio, fim, ["visits", "events"], ["visit:utm_campaign"], filtro),
      consultarV2(creds, siteId, inicio, fim, ["visits", "visitors"], ["event:page"], filtro),
    ]);

    const engajadas = Math.round(visits * (1 - bounce / 100));
    return {
      ...vazio,
      apiVersion: "v2",
      totals: {
        sessions: visits,
        users: visitors,
        activeUsers: visitors,
        newUsers: 0,
        engagedSessions: engajadas,
        engagementRate: visits > 0 ? engajadas / visits : 0,
        conversions: events,
        pageViews: pageviews,
        revenue: 0,
      },
      byChannel: linhasOuVazio(canais).map((r) => ({
        channel: r.dimensions[0] || "(sem canal)",
        sessions: n(r.metrics[0]),
        conversions: n(r.metrics[1]),
      })),
      topSources: linhasOuVazio(origens).slice(0, 8).map((r) => ({
        sourceMedium: r.dimensions[0] || "(direto)",
        sessions: n(r.metrics[0]),
        conversions: n(r.metrics[1]),
      })),
      topCampaigns: linhasOuVazio(campanhas).slice(0, 8).map((r) => ({
        campaign: r.dimensions[0] || "(sem campanha)",
        sessions: n(r.metrics[0]),
        conversions: n(r.metrics[1]),
        revenue: 0,
      })),
      byPage: linhasOuVazio(paginas)
        .map((r) => ({
          page: r.dimensions[0] || "/",
          sessions: n(r.metrics[0]),
          activeUsers: n(r.metrics[1]),
          // O Plausible CE não separa visitante novo de recorrente; deixar 0 é
          // mais honesto que repetir `visitors` e sugerir que todos são novos.
          newUsers: 0,
        }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 100),
    };
  }

  // --- v1 (instância antiga) ---
  const agregado = await consultarV1Agregado(creds, siteId, inicio, fim, filtro);
  if (!agregado) {
    throw new PlausibleErro(
      `Nem a API v2 nem a v1 responderam para "${siteId}" — confira o domínio e o acesso da chave a ele.`,
    );
  }

  const visitors = n(agregado.visitors?.value);
  const visits = n(agregado.visits?.value) || visitors;
  const pageviews = n(agregado.pageviews?.value);
  const events = n(agregado.events?.value);
  const bounce = n(agregado.bounce_rate?.value);
  const engajadas = Math.round(visits * (1 - bounce / 100));

  const [origens, campanhas, paginasV1] = await Promise.all([
    consultarV1Breakdown(creds, siteId, inicio, fim, "visit:source", filtro),
    consultarV1Breakdown(creds, siteId, inicio, fim, "visit:utm_campaign", filtro),
    consultarV1Breakdown(creds, siteId, inicio, fim, "event:page", filtro, 100),
  ]);

  const linhaBreakdown = (r: Record<string, unknown>, chave: string) => ({
    nome: String(r[chave] ?? "") || "(direto)",
    sessions: n(r.visits) || n(r.visitors),
    conversions: n(r.events),
  });

  return {
    ...vazio,
    apiVersion: "v1",
    totals: {
      sessions: visits,
      users: visitors,
      activeUsers: visitors,
      newUsers: 0,
      engagedSessions: engajadas,
      engagementRate: visits > 0 ? engajadas / visits : 0,
      conversions: events,
      pageViews: pageviews,
      revenue: 0,
    },
    // v1 não tem a dimensão `visit:channel`; a origem é o mais próximo, e
    // repetir a mesma lista nos dois lugares seria fingir uma quebra que não há.
    byChannel: [],
    topSources: origens.slice(0, 8).map((r) => {
      const x = linhaBreakdown(r, "source");
      return { sourceMedium: x.nome, sessions: x.sessions, conversions: x.conversions };
    }),
    topCampaigns: campanhas.slice(0, 8).map((r) => {
      const x = linhaBreakdown(r, "utm_campaign");
      return { campaign: x.nome, sessions: x.sessions, conversions: x.conversions, revenue: 0 };
    }),
    byPage: paginasV1.map((r) => ({
      page: String(r.page ?? "") || "/",
      sessions: n(r.visits) || n(r.visitors),
      activeUsers: n(r.visitors),
      newUsers: 0,
    })),
  };
}
