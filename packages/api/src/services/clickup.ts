import fp from "fastify-plugin";

const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

const BASE_URL = "https://api.clickup.com/api/v2";

interface ClickUpService {
  isConfigured(): boolean;
  fetchApi<T>(path: string, options?: RequestInit): Promise<T>;
  getTeams(): Promise<ClickUpTeam[]>;
  getSpaces(teamId: string): Promise<ClickUpSpace[]>;
  getFolders(spaceId: string): Promise<ClickUpFolder[]>;
  getLists(folderId: string): Promise<ClickUpList[]>;
  getFolderlessLists(spaceId: string): Promise<ClickUpList[]>;
  getTasks(listId: string): Promise<ClickUpTask[]>;
  /** Story 31.7 iter: tasks com Task Type custom (Campanha, etc). */
  getCustomTypeTasks(listId: string, teamId: string): Promise<ClickUpTask[]>;
  /** Story 31.8 — Lookup id→name dos Task Types custom do team. Cacheado. */
  getCustomItemsMap(teamId: string): Promise<Map<number, string>>;
  getTask(taskId: string): Promise<ClickUpTask | null>;
  searchTasks(teamId: string, query: string): Promise<ClickUpTask[]>;
  createTask(params: CreateTaskParams): Promise<{ id: string; url: string }>;
  /** Epic 31: atualiza apenas o status de uma task (write-through). */
  updateTaskStatus(taskId: string, status: string): Promise<void>;
  /** Epic 31 v2: atualiza campos arbitrários (status, name, due_date) numa só call. */
  updateTask(taskId: string, partial: UpdateTaskPartial): Promise<void>;
  /** Epic 31: status disponíveis pra uma lista (pra UI do builder). */
  getListStatuses(listId: string): Promise<Array<{ status: string; color: string; orderindex: number; type: string }>>;
  // ---- Story 38.3: chat (API v3) + membros — alerta de pagamentos ----
  /** Canais de chat do workspace (só type CHANNEL). */
  getChatChannels(): Promise<Array<{ id: string; name: string }>>;
  /** Envia mensagem markdown num canal; followers são notificados. */
  sendChatMessage(channelId: string, content: string, followers?: string[]): Promise<void>;
  /** Membros do workspace (pra escolher quem mencionar). */
  getWorkspaceMembers(): Promise<Array<{ id: string; username: string; email: string | null }>>;
}

interface UpdateTaskPartial {
  status?: string;
  name?: string;
  /** Unix ms (number). Pode ser null pra remover a data. */
  due_date?: number | null;
}

interface ClickUpTeam {
  id: string;
  name: string;
}

interface ClickUpSpace {
  id: string;
  name: string;
}

interface ClickUpFolder {
  id: string;
  name: string;
  lists: ClickUpList[];
}

interface ClickUpList {
  id: string;
  name: string;
  task_count?: number;
}

interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  // Story 31.9: `type` do status ClickUp — "open" (não iniciado), "custom"
  // (em progresso), "done"/"closed" (concluído). Usado pra separar não-iniciado
  // de em-progresso na aba Saúde.
  status: { status: string; color?: string; type?: string };
  priority: { id: string; priority: string } | null;
  tags: Array<{ name: string }>;
  url: string;
  date_created: string;
  date_updated: string;
  /** Unix ms (string) — pode ser null pra tasks sem due date. */
  due_date?: string | null;
  /** Unix ms (string) — pode ser null. */
  start_date?: string | null;
  assignees: Array<{ id?: number; username: string; email?: string; profilePicture?: string | null }>;
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  space?: { id: string };
  /** ID do Task Type custom no ClickUp (ex: "Campanha", "Bug"). Tasks
   * default ("Task") têm null/undefined. */
  custom_item_id?: number | null;
}

interface CreateTaskParams {
  name: string;
  description?: string;
  listId?: string;
  priority?: string;
  tags?: string[];
}

declare module "fastify" {
  interface FastifyInstance {
    clickupService: ClickUpService;
  }
}

export default fp(async function clickupService(fastify) {
  const token = fastify.config.CLICKUP_API_TOKEN;

  function isConfigured(): boolean {
    return Boolean(token);
  }

  async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    if (!token) throw new Error("ClickUp not configured");
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${text}`);
    }
    return response.json() as Promise<T>;
  }

  async function getTeams(): Promise<ClickUpTeam[]> {
    const data = await fetchApi<{ teams: ClickUpTeam[] }>("/team");
    return data.teams;
  }

  async function getSpaces(teamId: string): Promise<ClickUpSpace[]> {
    const data = await fetchApi<{ spaces: ClickUpSpace[] }>(
      `/team/${teamId}/space`,
    );
    return data.spaces;
  }

  async function getFolders(spaceId: string): Promise<ClickUpFolder[]> {
    const data = await fetchApi<{ folders: ClickUpFolder[] }>(
      `/space/${spaceId}/folder`,
    );
    return data.folders;
  }

  async function getLists(folderId: string): Promise<ClickUpList[]> {
    const data = await fetchApi<{ lists: ClickUpList[] }>(
      `/folder/${folderId}/list`,
    );
    return data.lists;
  }

  async function getFolderlessLists(spaceId: string): Promise<ClickUpList[]> {
    const data = await fetchApi<{ lists: ClickUpList[] }>(
      `/space/${spaceId}/list`,
    );
    return data.lists;
  }

  async function getTasks(listId: string): Promise<ClickUpTask[]> {
    // Story 31.9: ClickUp retorna no máx. 100 tasks/página e exige `&page=N`.
    // Sem paginação, listas com +100 tasks perdiam o resto ("faltam tasks").
    // Loop até `last_page` (ou página vazia, por segurança).
    const all: ClickUpTask[] = [];
    for (let page = 0; page < 100; page++) {
      const data = await fetchApi<{ tasks: ClickUpTask[]; last_page?: boolean }>(
        `/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`,
      );
      const tasks = data.tasks ?? [];
      all.push(...tasks);
      if (data.last_page || tasks.length === 0) break;
    }
    return all;
  }

  /**
   * Story 31.7 iter — Tasks com Task Types custom (Campanha, etc) só vêm
   * quando o param `custom_items[]=ID` é passado. Esse helper:
   *   1. Lista os custom item types do team (`/team/{id}/custom_items`)
   *   2. Faz GET das tasks da lista com `&custom_items[]=ID` pra cada tipo
   *   3. Retorna só essas custom (não merge com tasks default)
   */
  // Story 31.8 — cache do mapping id→name dos custom item types (Campanha,
  // Marco, etc). Custom types raramente mudam → 10min TTL é generoso.
  let customItemsCache: { teamId: string; map: Map<number, string>; expiresAt: number } | null =
    null;
  const CUSTOM_ITEMS_TTL_MS = 10 * 60 * 1000;

  async function getCustomItemsMap(teamId: string): Promise<Map<number, string>> {
    if (
      customItemsCache &&
      customItemsCache.teamId === teamId &&
      customItemsCache.expiresAt > Date.now()
    ) {
      return customItemsCache.map;
    }
    // Story 31.8: tenta o endpoint plural (atual), singular (variante mais antiga
    // da API) e v3 — o ClickUp moveu/renomeou esse path entre versões. Aceita o
    // primeiro que retornar com pelo menos 1 item.
    const endpoints = [
      `/team/${teamId}/custom_items`,
      `/team/${teamId}/custom_item`,
    ];
    type CustomItemResp = { custom_items?: Array<{ id: number; name: string }>; customItems?: Array<{ id: number; name: string }> };

    for (const endpoint of endpoints) {
      try {
        const itemsResp = await fetchApi<CustomItemResp>(endpoint);
        const arr = itemsResp.custom_items ?? itemsResp.customItems ?? [];
        if (arr.length === 0) {
          fastify.log.warn({ teamId, endpoint }, "[clickup] custom_items endpoint vazio");
          continue;
        }
        const map = new Map<number, string>();
        for (const it of arr) {
          map.set(it.id, it.name);
        }
        fastify.log.info(
          { teamId, endpoint, count: map.size, items: Array.from(map.entries()) },
          "[clickup] getCustomItemsMap resolved",
        );
        customItemsCache = { teamId, map, expiresAt: Date.now() + CUSTOM_ITEMS_TTL_MS };
        return map;
      } catch (err) {
        fastify.log.warn(
          { err: err instanceof Error ? err.message : err, teamId, endpoint },
          "[clickup] custom_items endpoint failed",
        );
      }
    }

    fastify.log.error(
      { teamId, endpoints },
      "[clickup] getCustomItemsMap: NENHUM endpoint funcionou. customItemName vai ficar null.",
    );
    return new Map();
  }

  // Story 31.8 fix — fallback brute-force: testa IDs 1..MAX quando o lookup
  // do mapping falha. ClickUp aceita custom_items[] desconhecidos sem erro
  // (apenas ignora), então sobrar IDs no array é seguro.
  const FALLBACK_MAX_CUSTOM_ID = 30;

  async function getCustomTypeTasks(listId: string, teamId: string): Promise<ClickUpTask[]> {
    let ids = Array.from((await getCustomItemsMap(teamId)).keys());
    if (ids.length === 0) {
      ids = Array.from({ length: FALLBACK_MAX_CUSTOM_ID }, (_, i) => i + 1);
      fastify.log.info(
        { listId, fallbackIds: ids.length },
        "[clickup] getCustomTypeTasks: usando IDs fallback 1..30",
      );
    }
    const qs = ids.map((id) => `custom_items%5B%5D=${id}`).join("&");
    // Story 31.9: pagina igual a getTasks.
    const all: ClickUpTask[] = [];
    for (let page = 0; page < 100; page++) {
      const data = await fetchApi<{ tasks: ClickUpTask[]; last_page?: boolean }>(
        `/list/${listId}/task?include_closed=true&subtasks=true&page=${page}&${qs}`,
      );
      const tasks = data.tasks ?? [];
      all.push(...tasks);
      if (data.last_page || tasks.length === 0) break;
    }
    fastify.log.info(
      { listId, tasksReturned: all.length },
      "[clickup] getCustomTypeTasks result",
    );
    return all;
  }

  async function getTask(taskId: string): Promise<ClickUpTask | null> {
    try {
      return await fetchApi<ClickUpTask>(`/task/${taskId}`);
    } catch {
      return null;
    }
  }

  async function searchTasks(
    teamId: string,
    query: string,
  ): Promise<ClickUpTask[]> {
    const data = await fetchApi<{ tasks: ClickUpTask[] }>(
      `/team/${teamId}/task?name=${encodeURIComponent(query)}&include_closed=true`,
    );
    return data.tasks;
  }

  async function createTask(
    params: CreateTaskParams,
  ): Promise<{ id: string; url: string }> {
    const listId = params.listId ?? process.env.CLICKUP_DEFAULT_LIST_ID;
    if (!listId) {
      throw new Error("listId is required — set CLICKUP_DEFAULT_LIST_ID or pass listId");
    }
    const data = await fetchApi<{ id: string; url: string }>(
      `/list/${listId}/task`,
      {
        method: "POST",
        body: JSON.stringify({
          name: params.name,
          description: params.description ?? "",
          priority: PRIORITY_MAP[params.priority ?? "normal"] ?? 3,
          tags: params.tags ?? [],
        }),
      },
    );
    return { id: data.id, url: data.url };
  }

  // Epic 31 Story 31.3 — write-through de status pra ClickUp
  async function updateTaskStatus(taskId: string, status: string): Promise<void> {
    await fetchApi(`/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  // Epic 31 v2 — edit completo (status + nome + due_date). ClickUp aceita
  // múltiplos campos no mesmo PUT.
  async function updateTask(taskId: string, partial: UpdateTaskPartial): Promise<void> {
    const body: Record<string, unknown> = {};
    if (partial.status !== undefined) body.status = partial.status;
    if (partial.name !== undefined) body.name = partial.name;
    if (partial.due_date !== undefined) {
      body.due_date = partial.due_date; // null = remove; number = unix ms
      // due_date_time=true diz pro ClickUp respeitar o horário; sem isso
      // ele zera pra meia-noite UTC.
      body.due_date_time = partial.due_date !== null;
    }
    if (Object.keys(body).length === 0) return;
    await fetchApi(`/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  // Epic 31 — statuses disponíveis de uma lista (pra builder)
  async function getListStatuses(
    listId: string,
  ): Promise<Array<{ status: string; color: string; orderindex: number; type: string }>> {
    const data = await fetchApi<{ statuses: Array<{ status: string; color: string; orderindex: number; type: string }> }>(
      `/list/${listId}`,
    );
    return data.statuses ?? [];
  }

  // ---- Story 38.3: chat (API v3) + membros ----------------------------------
  // O chat vive na API v3 (workspaces/{id}/chat/...), diferente do resto (v2).
  let cachedTeamId: string | null = null;
  async function resolveTeamId(): Promise<string> {
    if (cachedTeamId) return cachedTeamId;
    const teams = await getTeams();
    if (teams.length === 0) throw new Error("Nenhum workspace ClickUp acessível com este token");
    cachedTeamId = teams[0].id;
    return cachedTeamId;
  }

  async function fetchApiV3<T>(path: string, options?: RequestInit): Promise<T> {
    if (!token) throw new Error("ClickUp not configured");
    const response = await fetch(`https://api.clickup.com/api/v3${path}`, {
      ...options,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClickUp API v3 error (${response.status}): ${text}`);
    }
    return response.json() as Promise<T>;
  }

  async function getChatChannels(): Promise<Array<{ id: string; name: string }>> {
    const teamId = await resolveTeamId();
    const out: Array<{ id: string; name: string }> = [];
    let cursor: string | undefined;
    // Paginação defensiva (máx. 5 páginas de 100 — canais de verdade são poucos).
    for (let page = 0; page < 5; page++) {
      const qs = cursor ? `?limit=100&next_cursor=${encodeURIComponent(cursor)}` : "?limit=100";
      const data = await fetchApiV3<{
        data?: Array<{ id: string; name?: string; type?: string }>;
        next_cursor?: string | null;
      }>(`/workspaces/${teamId}/chat/channels${qs}`);
      for (const ch of data.data ?? []) {
        if (ch.type === "CHANNEL" && ch.name) out.push({ id: ch.id, name: ch.name });
      }
      if (!data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  async function sendChatMessage(
    channelId: string,
    content: string,
    followers?: string[],
  ): Promise<void> {
    const teamId = await resolveTeamId();
    const body: Record<string, unknown> = {
      type: "message",
      content_format: "text/md",
      content,
    };
    if (followers && followers.length > 0) body.followers = followers;
    await fetchApiV3(`/workspaces/${teamId}/chat/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async function getWorkspaceMembers(): Promise<
    Array<{ id: string; username: string; email: string | null }>
  > {
    // v2 /team retorna os members de cada workspace.
    const data = await fetchApi<{
      teams: Array<{ id: string; members?: Array<{ user: { id: number; username: string; email?: string } }> }>;
    }>("/team");
    const team = data.teams[0];
    return (team?.members ?? [])
      .map((m) => ({
        id: String(m.user.id),
        username: m.user.username,
        email: m.user.email ?? null,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, "pt-BR"));
  }

  if (!token) {
    fastify.log.warn(
      "CLICKUP_API_TOKEN not set — ClickUp integration disabled",
    );
  }

  fastify.decorate("clickupService", {
    isConfigured,
    fetchApi,
    getTeams,
    getSpaces,
    getFolders,
    getLists,
    getFolderlessLists,
    getTasks,
    getCustomTypeTasks,
    getCustomItemsMap,
    getTask,
    searchTasks,
    createTask,
    updateTaskStatus,
    updateTask,
    getListStatuses,
    getChatChannels,
    sendChatMessage,
    getWorkspaceMembers,
  });
});
