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

export interface PlausibleLogin {
  email: string;
  senha: string;
}

/** De onde veio a lista — a tela explica ao admin por que ela está vazia. */
export type FonteDaLista = "sites-api" | "sessao" | "indisponivel";

/**
 * Sites da instância.
 *
 * Dois caminhos, nesta ordem:
 *
 * 1. `/api/v1/sites` — a Sites API documentada. **Não existe no Community
 *    Edition**: a rota devolve 404 em HTML (não 401), porque o Plausible a
 *    restringiu à Enterprise. Tentamos mesmo assim, porque quem roda EE tem.
 *
 * 2. `/api/sites` com sessão de login — é o endpoint que o próprio painel usa.
 *    Ele existe no CE, mas recusa API key em qualquer forma (testadas: Bearer,
 *    Token, X-API-KEY, query param e cookie — todas 401). Por isso o login é
 *    opcional na configuração: sem ele, o seletor de site vira digitação livre.
 */
export async function listarSites(
  creds: PlausibleCreds,
  login?: PlausibleLogin | null,
): Promise<{ sites: PlausibleSite[]; fonte: FonteDaLista }> {
  const r = await chamar<{ sites?: { domain: string }[] }>(creds, "/api/v1/sites?limit=100");
  if (r.ok) {
    return { sites: (r.data.sites ?? []).map((s) => ({ domain: s.domain })), fonte: "sites-api" };
  }

  if (login?.email && login.senha) {
    const porSessao = await listarSitesPorSessao(creds.baseUrl, login);
    if (porSessao) return { sites: porSessao, fonte: "sessao" };
  }
  return { sites: [], fonte: "indisponivel" };
}

/** Junta os cookies de um Set-Cookie em um header `Cookie`. */
function juntarCookies(...respostas: Response[]): string {
  const pares = new Map<string, string>();
  for (const res of respostas) {
    for (const bruto of res.headers.getSetCookie?.() ?? []) {
      const [par] = bruto.split(";");
      const idx = par.indexOf("=");
      if (idx > 0) pares.set(par.slice(0, idx).trim(), par.slice(idx + 1));
    }
  }
  return [...pares].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Faz login no painel e lê `/api/sites`. `null` = não conseguiu (credencial
 * errada, instância diferente, layout de login mudado).
 *
 * Só é chamado para montar a lista do seletor. Nenhuma métrica passa por aqui:
 * estatística continua saindo da API key, que é a credencial certa para isso.
 */
export async function listarSitesPorSessao(
  baseUrl: string,
  login: PlausibleLogin,
): Promise<PlausibleSite[] | null> {
  const base = normalizarBaseUrl(baseUrl);
  try {
    const paginaLogin = await fetch(`${base}/login`, { signal: AbortSignal.timeout(20_000) });
    if (!paginaLogin.ok) return null;
    const html = await paginaLogin.text();
    // O Phoenix exige o token do formulário; sem ele o POST é rejeitado antes
    // de sequer olhar a senha.
    const csrf = html.match(/name="_csrf_token"[^>]*value="([^"]+)"/)?.[1];
    if (!csrf) return null;

    const resposta = await fetch(`${base}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: juntarCookies(paginaLogin),
      },
      body: new URLSearchParams({ _csrf_token: csrf, email: login.email, password: login.senha }),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });

    // Login OK redireciona; credencial errada devolve 200 com o formulário de
    // volta ("Wrong email or password"). É assim que se distingue os dois.
    const cookieSessao = juntarCookies(paginaLogin, resposta);
    if (!cookieSessao) return null;

    const sites = await fetch(`${base}/api/sites?limit=300`, {
      headers: { Cookie: cookieSessao, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!sites.ok) return null;
    const dados = (await sites.json()) as { data?: Array<{ domain?: string }>; sites?: Array<{ domain?: string }> };
    const lista = dados.data ?? dados.sites ?? [];
    const dominios = lista.map((s) => s.domain).filter((d): d is string => Boolean(d));
    return dominios.length > 0 ? dominios.map((domain) => ({ domain })) : null;
  } catch {
    return null;
  }
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
  // 404 = a rota não existe (instância antiga): vale tentar a v1.
  //
  // 400 é ambíguo e a distinção importa: quando vem com um corpo JSON de erro,
  // a v2 EXISTE e recusou a consulta (ex.: "Metric `views_per_visit` cannot be
  // queried with a filter on `event:page`"). Tratar isso como "sem v2" trocava
  // uma mensagem que diz o que consertar por outra que culpa a instância.
  if (!r.ok) {
    if (r.status === 404) return { tipo: "sem-v2" };
    if (r.status === 400 && !temErroJson(r.erro)) return { tipo: "sem-v2" };
    return { tipo: "erro", detalhe: mensagemDoPlausible(r.erro, r.status) };
  }
  return { tipo: "ok", linhas: r.data.results ?? [] };
}

/** O corpo é um erro estruturado do Plausible (e não uma página 404 qualquer)? */
function temErroJson(corpo: string): boolean {
  try {
    return typeof (JSON.parse(corpo) as { error?: unknown }).error === "string";
  } catch {
    return false;
  }
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

// ============================================================
// Dashboard completo — o mesmo recorte que a tela do Plausible mostra
// ============================================================

/**
 * Períodos aceitos. São os mesmos nomes da API v2, e o rótulo de cada um mora
 * na tela — repetir a tradução aqui daria dois lugares para desencontrar.
 */
export type PlausiblePeriodo = "day" | "7d" | "30d" | "month" | "6mo" | "12mo";

/**
 * Converte o período em um intervalo EXPLÍCITO de datas.
 *
 * Os períodos nomeados da v2 terminam ONTEM, não hoje: `"30d"` responde
 * 19/07→17/08 e `"12mo"` para no mês passado. Num site que começou a receber
 * tráfego hoje, isso devolve zero em toda janela maior que "day" — o número da
 * tela ficaria em branco justamente quando há movimento. O painel do Plausible
 * inclui o dia corrente, e é esse recorte que a gente reproduz.
 *
 * As datas saem no fuso de São Paulo porque o servidor roda em UTC: perto da
 * meia-noite, "hoje" em UTC já é amanhã aqui, e o dia atual sumiria da conta.
 */
export function intervaloDoPeriodo(periodo: PlausiblePeriodo, agora = new Date()): [string, string] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hojeIso = fmt.format(agora); // aaaa-mm-dd
  const [ano, mes, dia] = hojeIso.split("-").map(Number);
  // Meio-dia UTC evita que somar/subtrair dias cruze fuso por acidente.
  const base = new Date(Date.UTC(ano, mes - 1, dia, 12));

  const menosDias = (n: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const inicioDeMesAtras = (n: number) => {
    const d = new Date(Date.UTC(ano, mes - 1 - n, 1, 12));
    return d.toISOString().slice(0, 10);
  };

  switch (periodo) {
    case "day": return [hojeIso, hojeIso];
    case "7d": return [menosDias(6), hojeIso];
    case "30d": return [menosDias(29), hojeIso];
    case "month": return [inicioDeMesAtras(0), hojeIso];
    case "6mo": return [inicioDeMesAtras(5), hojeIso];
    case "12mo": return [inicioDeMesAtras(11), hojeIso];
  }
}

/** Granularidade do gráfico: um dia inteiro se lê por hora; o resto, por dia. */
function granularidade(periodo: PlausiblePeriodo): "time:hour" | "time:day" | "time:month" {
  if (periodo === "day") return "time:hour";
  if (periodo === "12mo" || periodo === "6mo") return "time:month";
  return "time:day";
}

export interface LinhaBreakdown {
  nome: string;
  visitors: number;
  /** Fração do total do bloco (0..1) — é a barra de proporção da tela. */
  share: number;
}

export interface BlocoBreakdown {
  /** Chave da aba (ex.: "channels", "sources"). */
  chave: string;
  rows: LinhaBreakdown[];
}

export interface PlausibleDashboardCompleto {
  siteId: string;
  periodo: PlausiblePeriodo;
  pageFilter: string | null;
  /** Visitantes nos últimos 5 minutos — o "current visitors" do Plausible. */
  agora: number;
  totals: {
    visitors: number;
    visits: number;
    pageviews: number;
    viewsPerVisit: number;
    /** 0..1 */
    bounceRate: number;
    /** Segundos. */
    visitDuration: number;
  };
  /** Série do gráfico. `label` já vem pronto para o eixo. */
  serie: Array<{ label: string; visitors: number; pageviews: number }>;
  /** Grupos de abas, na mesma divisão da tela do Plausible. */
  fontes: BlocoBreakdown[];
  paginas: BlocoBreakdown[];
  locais: BlocoBreakdown[];
  dispositivos: BlocoBreakdown[];
}

/** Converte linhas cruas em `LinhaBreakdown` com a proporção já calculada. */
function comShare(
  linhas: Array<{ metrics: number[]; dimensions: string[] }>,
  vazio: string,
  limite = 9,
): LinhaBreakdown[] {
  const total = linhas.reduce((soma, r) => soma + n(r.metrics[0]), 0);
  return linhas.slice(0, limite).map((r) => {
    const visitors = n(r.metrics[0]);
    return {
      nome: r.dimensions[0]?.trim() || vazio,
      visitors,
      // Proporção sobre o total do BLOCO, como o Plausible faz — não sobre o
      // total do site, senão a soma das linhas visíveis nunca fecha em 100%.
      share: total > 0 ? visitors / total : 0,
    };
  });
}

/** Visitantes nos últimos 5 minutos. Falha vira 0: é um indicador, não um dado duro. */
export async function visitantesAgora(creds: PlausibleCreds, siteId: string): Promise<number> {
  const r = await chamar<V2Resposta>(creds, "/api/v2/query", {
    method: "POST",
    body: { site_id: siteId, metrics: ["visitors"], date_range: "realtime" },
  });
  if (!r.ok) return 0;
  return n(r.data.results?.[0]?.metrics?.[0] ?? 0);
}

/**
 * Uma consulta por dimensão, todas em paralelo.
 *
 * O Plausible não devolve vários breakdowns numa chamada só — cada aba da tela
 * é uma query. Rodar em paralelo é o que mantém o dashboard em um round-trip de
 * latência em vez de doze.
 */
async function breakdowns(
  creds: PlausibleCreds,
  siteId: string,
  periodo: PlausiblePeriodo,
  filtro: string | null,
  defs: Array<{ chave: string; dimensao: string; vazio: string }>,
): Promise<BlocoBreakdown[]> {
  const resultados = await Promise.all(
    defs.map(async (d) => {
      const r = await consultarV2Periodo(creds, siteId, periodo, ["visitors"], [d.dimensao], filtro);
      return { chave: d.chave, rows: comShare(linhasOuVazio(r), d.vazio) };
    }),
  );
  return resultados;
}

/** Igual a `consultarV2`, mas recebendo o período já resolvido em datas. */
async function consultarV2Periodo(
  creds: PlausibleCreds,
  siteId: string,
  periodo: PlausiblePeriodo,
  metrics: string[],
  dimensions: string[],
  pageFilter?: string | null,
): Promise<RespostaV2> {
  const [inicio, fim] = intervaloDoPeriodo(periodo);
  const r = await chamar<V2Resposta>(creds, "/api/v2/query", {
    method: "POST",
    body: {
      site_id: siteId,
      metrics,
      date_range: [inicio, fim],
      dimensions,
      ...(pageFilter ? { filters: [["contains", "event:page", [pageFilter]]] } : {}),
    },
  });
  if (!r.ok) {
    if (r.status === 404 || r.status === 400) return { tipo: "sem-v2" };
    return { tipo: "erro", detalhe: mensagemDoPlausible(r.erro, r.status) };
  }
  return { tipo: "ok", linhas: r.data.results ?? [] };
}

/**
 * O dashboard inteiro do site, no mesmo recorte da tela do Plausible.
 *
 * Exige a v2: as abas de entrada/saída, região/cidade e canal não existem na v1,
 * e montar meia tela em silêncio seria pior que dizer que a instância é antiga.
 */
export async function montarDashboardCompleto(
  creds: PlausibleCreds,
  siteId: string,
  periodo: PlausiblePeriodo,
  pageFilter?: string | null,
): Promise<PlausibleDashboardCompleto> {
  const filtro = pageFilter?.trim() || null;
  // `views_per_visit` é a ÚNICA métrica que o Plausible recusa junto de um
  // filtro em `event:page` — a consulta inteira volta 400. Com filtro, ela sai
  // da lista e é derivada de pageviews/visits, que é a própria definição dela.
  const METRICAS = filtro
    ? ["visitors", "visits", "pageviews", "bounce_rate", "visit_duration"]
    : ["visitors", "visits", "pageviews", "views_per_visit", "bounce_rate", "visit_duration"];

  const [agregado, serie, agora, fontes, paginas, locais, dispositivos] = await Promise.all([
    consultarV2Periodo(creds, siteId, periodo, METRICAS, [], filtro),
    consultarV2Periodo(creds, siteId, periodo, ["visitors", "pageviews"], [granularidade(periodo)], filtro),
    visitantesAgora(creds, siteId),
    breakdowns(creds, siteId, periodo, filtro, [
      { chave: "channels", dimensao: "visit:channel", vazio: "Direto" },
      { chave: "sources", dimensao: "visit:source", vazio: "Direto" },
      { chave: "campaigns", dimensao: "visit:utm_campaign", vazio: "(sem campanha)" },
    ]),
    breakdowns(creds, siteId, periodo, filtro, [
      { chave: "pages", dimensao: "event:page", vazio: "/" },
      { chave: "entry", dimensao: "visit:entry_page", vazio: "/" },
      { chave: "exit", dimensao: "visit:exit_page", vazio: "/" },
    ]),
    breakdowns(creds, siteId, periodo, filtro, [
      { chave: "countries", dimensao: "visit:country_name", vazio: "(desconhecido)" },
      { chave: "regions", dimensao: "visit:region_name", vazio: "(desconhecido)" },
      { chave: "cities", dimensao: "visit:city_name", vazio: "(desconhecido)" },
    ]),
    breakdowns(creds, siteId, periodo, filtro, [
      { chave: "browsers", dimensao: "visit:browser", vazio: "(desconhecido)" },
      { chave: "os", dimensao: "visit:os", vazio: "(desconhecido)" },
      { chave: "devices", dimensao: "visit:device", vazio: "(desconhecido)" },
    ]),
  ]);

  if (agregado.tipo === "erro") throw new PlausibleErro(agregado.detalhe);
  if (agregado.tipo === "sem-v2") {
    throw new PlausibleErro(
      "Esta instância do Plausible não expõe a API v2 — o dashboard completo depende dela.",
    );
  }

  const m = agregado.linhas[0]?.metrics ?? [];
  const [visitors, visits, pageviews] = [0, 1, 2].map((i) => n(m[i] ?? 0));
  const viewsPerVisit = filtro
    ? visits > 0
      ? Math.round((pageviews / visits) * 100) / 100
      : 0
    : n(m[3] ?? 0);
  // Com filtro a lista tem uma métrica a menos, então as duas últimas andam
  // uma posição para trás.
  const desloc = filtro ? 0 : 1;
  const bounce = n(m[3 + desloc] ?? 0);
  const duracao = n(m[4 + desloc] ?? 0);

  return {
    siteId,
    periodo,
    pageFilter: filtro,
    agora,
    totals: {
      visitors,
      visits,
      pageviews,
      viewsPerVisit,
      // O Plausible devolve 0..100; a tela formata como porcentagem.
      bounceRate: bounce / 100,
      visitDuration: duracao,
    },
    serie: linhasOuVazio(serie).map((r) => ({
      label: r.dimensions[0] ?? "",
      visitors: n(r.metrics[0]),
      pageviews: n(r.metrics[1]),
    })),
    fontes,
    paginas,
    locais,
    dispositivos,
  };
}
