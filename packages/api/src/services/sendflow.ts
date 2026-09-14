/**
 * Cliente do SendFlow — a operação de WhatsApp (grupos de campanha).
 *
 * ## Por que falamos MCP e não REST
 *
 * O SendFlow não publica API REST: `/docs`, `/api`, `/openapi.json` e afins
 * respondem 404, e a página de documentação é uma SPA sem conteúdo. O que
 * existe é um servidor MCP em `https://cf1.sendflow.pro/mcp`. MCP sobre HTTP é
 * JSON-RPC puro, então o backend fala direto — sem SDK no meio.
 *
 * ## Por que guardamos refresh_token e não uma API key
 *
 * Os metadados OAuth do servidor listam `grant_types_supported:
 * ["authorization_code", "refresh_token"]`. NÃO há `client_credentials`, que é
 * o modo máquina-a-máquina. Ou seja: nenhum backend consegue token sozinho.
 * O caminho é alguém autorizar UMA vez no navegador (scope `offline_access`) e
 * o backend renovar com o refresh_token daí em diante.
 *
 * ## O que dá e o que não dá pra ler
 *
 * Dá: grupos da campanha com `participantsAmount`, analytics diário de
 * entradas/saídas/cliques, e o histórico de disparos (`list-actions`).
 * NÃO dá: o TEXTO da mensagem enviada — a action guarda só metadados
 * (tipo, horários, sucesso), com `refId` nulo e sem link para o template.
 */

const BASE = "https://cf1.sendflow.pro";
const MCP = `${BASE}/mcp`;
const TIMEOUT_MS = 25_000;

export class SendflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SendflowError";
  }
}

export interface SendflowTokens {
  accessToken: string;
  /** Epoch ms em que o access_token expira. */
  expiresAt: number;
  /** O servidor pode rotacionar o refresh a cada uso — quem chama deve regravar. */
  refreshToken: string;
}

/**
 * Troca o refresh_token por um access_token novo.
 *
 * Devolve também o refresh porque o servidor ROTACIONA: ignorar o novo valor
 * deixa a conexão morrer silenciosamente na próxima renovação.
 *
 * ## Aconteceu, e o aviso acima não impediu
 *
 * 12/09/2026: um script de diagnóstico chamou esta função para inspecionar
 * campanhas e descartou o retorno. O refresh guardado virou o antigo. O access
 * ainda valia por uma hora, então nada quebrou na hora — a conexão caiu quando
 * ele expirou, dois dias depois, e a tela passou a dizer "autorização expirada
 * ou revogada". Não houve como recuperar: o único caminho foi refazer o OAuth.
 *
 * Por isso a regra não é "grave o refresh", é mais dura:
 *
 * **Script de diagnóstico NÃO chama esta função.** Para ler dados, use o
 * `access_token` guardado em `sendflow_connections` enquanto ele valer. Se
 * expirou, abra a tela — quem renova é a aplicação, que grava.
 *
 * Quem PODE chamar: a rota de conexão (`routes/sendflow.ts`), que grava os dois
 * tokens no mesmo fluxo.
 */
export async function renovarToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<SendflowTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    resource: MCP,
  });
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await res.text();
  if (!res.ok) {
    // 400 `invalid_grant` = refresh revogado ou expirado: reconectar é a única
    // saída, e insistir só gera ruído no log.
    const expirado = res.status === 400 && txt.includes("invalid_grant");
    throw new SendflowError(
      expirado
        ? "A autorização do SendFlow expirou ou foi revogada. Reconecte a conta."
        : `SendFlow recusou a renovação (${res.status}): ${txt.slice(0, 160)}`,
      res.status,
      res.status >= 500,
    );
  }
  const t = JSON.parse(txt) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  return {
    accessToken: t.access_token,
    // Um minuto de folga: renovar exatamente no vencimento perde a corrida
    // quando a chamada leva alguns segundos.
    expiresAt: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000,
    refreshToken: t.refresh_token ?? refreshToken,
  };
}

/**
 * Sessão MCP. O servidor devolve `Mcp-Session-Id` no `initialize` e exige o
 * cabeçalho nas chamadas seguintes — sem ele responde "A valid MCP session is
 * required".
 */
export class SendflowSession {
  private sessionId: string | null = null;
  /**
   * Fila de serialização.
   *
   * A sessão MCP do SendFlow NÃO tolera chamadas concorrentes: medido contra o
   * servidor real, três `tools/call` em paralelo devolvem 400 "A valid MCP
   * session is required" em duas das três — as mesmas três em sequência passam.
   * Serializar aqui dentro deixa `Promise.all` seguro pra quem chama, em vez de
   * exigir que cada caller lembre da restrição.
   */
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly accessToken: string) {}

  private enfileirar<T>(fn: () => Promise<T>): Promise<T> {
    const proximo = this.fila.then(fn, fn);
    // A fila não pode morrer por causa de uma falha: sem o catch, um erro
    // deixaria toda chamada seguinte rejeitada.
    this.fila = proximo.catch(() => undefined);
    return proximo;
  }

  private async post(body: unknown): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // O transporte Streamable HTTP pode responder em SSE; aceitamos os dois.
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.accessToken}`,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const res = await fetch(MCP, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const txt = await res.text();
    if (res.status === 401) {
      throw new SendflowError("Token do SendFlow recusado.", 401, false);
    }
    if (!res.ok && res.status !== 202) {
      // O corpo carrega o motivo (ex.: sessão inválida); sem ele o 400 é mudo.
      throw new SendflowError(
        `SendFlow respondeu ${res.status}: ${txt.slice(0, 160)}`,
        res.status,
        res.status >= 500,
      );
    }
    if (!txt.trim()) return {};
    // Em SSE o payload vem numa linha `data:`.
    const linha = txt.split("\n").find((l) => l.startsWith("data:"));
    const cru = linha ? linha.slice(5).trim() : txt;
    try {
      return JSON.parse(cru) as Record<string, unknown>;
    } catch {
      throw new SendflowError("Resposta ilegível do SendFlow.", 502, false);
    }
  }

  async conectar(): Promise<void> {
    await this.post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "loyola-x", version: "1.0" },
      },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  /** Chama uma tool e devolve o JSON já desembrulhado do envelope MCP. */
  async chamar<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.enfileirar(() => this.chamarAgora<T>(name, args));
  }

  /**
   * O servidor DERRUBA a sessão sozinho — reproduzido: uma sequência de
   * chamadas passa, e a seguinte volta 400 "A valid MCP session is required"
   * sem nada ter mudado do nosso lado. Não é transitório, e não dá pra prever
   * quando. Então, ao perder a sessão, refazemos o handshake e repetimos UMA
   * vez, em silêncio: quem chama não deveria precisar saber disso.
   */
  private async chamarAgora<T>(name: string, args: Record<string, unknown>): Promise<T> {
    try {
      return await this.tentar<T>(name, args);
    } catch (err) {
      const perdeuSessao =
        err instanceof SendflowError &&
        err.status === 400 &&
        /valid MCP session/i.test(err.message);
      if (!perdeuSessao) throw err;
      this.sessionId = null;
      await this.conectar();
      return this.tentar<T>(name, args);
    }
  }

  private async tentar<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const r = (await this.post({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e6),
      method: "tools/call",
      params: { name, arguments: args },
    })) as {
      error?: { message?: string };
      result?: { content?: { text?: string }[] };
    };
    if (r.error) throw new SendflowError(r.error.message ?? "Erro no SendFlow", 502, false);
    const texto = r.result?.content?.[0]?.text;
    if (texto === undefined) return (r.result ?? {}) as T;
    try {
      return JSON.parse(texto) as T;
    } catch {
      return texto as unknown as T;
    }
  }
}

// ============================================================
// Formatos das respostas (nomes exatos do SendFlow)
// ============================================================

export interface SendflowRelease {
  id: string;
  name: string;
  archived?: boolean;
  slug?: string | null;
  type?: string | null;
}

export interface SendflowGroup {
  id: string;
  name: string;
  /** JID do WhatsApp, ex. "1203634...@g.us". */
  gid: string;
  inviteCode?: string | null;
  full?: boolean;
  /** Quantas pessoas estão no grupo. É ESTE o número de membros. */
  participantsAmount?: number;
  /** Posição do grupo na campanha (#1, #2). NÃO é contagem de gente. */
  count?: number;
  admins?: { name: string; number: string }[];
}

/** Séries diárias com chave no formato DDMMYYYY. */
export interface SendflowAnalytics {
  add?: { total?: number; dates?: Record<string, number> };
  remove?: { total?: number; dates?: Record<string, number> };
  clicks?: { total?: number; dates?: Record<string, number> };
}

export interface SendflowAction {
  id: string;
  type: string;
  releaseId?: string;
  scheduled?: boolean;
  scheduledTo?: string | null;
  processed?: boolean;
  processing?: boolean;
  success?: boolean | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
}

/** Lista pode vir crua ou embrulhada — normaliza num ponto só. */
function comoLista<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const o = (r ?? {}) as Record<string, unknown>;
  for (const k of ["releases", "groups", "actions", "data", "items"]) {
    if (Array.isArray(o[k])) return o[k] as T[];
  }
  return [];
}

export async function listarCampanhas(s: SendflowSession): Promise<SendflowRelease[]> {
  return comoLista<SendflowRelease>(await s.chamar("list-releases", {}));
}

export async function gruposDaCampanha(s: SendflowSession, releaseId: string): Promise<SendflowGroup[]> {
  return comoLista<SendflowGroup>(await s.chamar("get-release-groups", { releaseId }));
}

export async function analyticsDaCampanha(s: SendflowSession, releaseId: string): Promise<SendflowAnalytics> {
  return (await s.chamar<SendflowAnalytics>("get-analytics", { releaseId })) ?? {};
}

/**
 * Histórico de ações da campanha, PAGINADO.
 *
 * `list-actions` tem teto de 100 por página. Pedir 100 e parar truncaria o
 * histórico em silêncio — o log ficaria sem os disparos mais antigos e ninguém
 * saberia. Aqui seguimos o `nextCursor` até acabar, com um teto de páginas como
 * proteção contra laço infinito se o servidor devolver cursor repetido.
 */
export async function disparosDaCampanha(
  s: SendflowSession,
  releaseId: string,
  maxPaginas = 10,
): Promise<{ acoes: SendflowAction[]; truncado: boolean }> {
  const acoes: SendflowAction[] = [];
  let cursor: string | null = null;
  let paginas = 0;

  do {
    const args: Record<string, unknown> = {
      releaseId,
      // `rootOnly` esconde subações; hoje não há nenhuma, mas se passar a haver
      // o log não deve virar uma linha por pedaço do mesmo disparo.
      rootOnly: true,
      limit: 100,
    };
    if (cursor) args.cursor = cursor;
    const r = (await s.chamar("list-actions", args)) as { nextCursor?: string | null };
    acoes.push(...comoLista<SendflowAction>(r));
    const proximo = r?.nextCursor ?? null;
    // Cursor repetido = servidor em laço; parar é melhor que girar pra sempre.
    cursor = proximo && proximo !== cursor ? proximo : null;
    paginas++;
  } while (cursor && paginas < maxPaginas);

  return { acoes, truncado: !!cursor };
}

/** "15072026" → "2026-07-15". Chave das séries diárias é DDMMYYYY. */
export function dataDaChave(chave: string): string | null {
  const m = chave.match(/^(\d{2})(\d{2})(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Soma de participantes da campanha — é o "quantas pessoas tem no grupo". */
export function totalDeParticipantes(grupos: SendflowGroup[]): number {
  return grupos.reduce((s, g) => s + (g.participantsAmount ?? 0), 0);
}
