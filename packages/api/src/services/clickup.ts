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
  getTask(taskId: string): Promise<ClickUpTask | null>;
  searchTasks(teamId: string, query: string): Promise<ClickUpTask[]>;
  createTask(params: CreateTaskParams): Promise<{ id: string; url: string }>;
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
  status: { status: string };
  priority: { id: string; priority: string } | null;
  tags: Array<{ name: string }>;
  url: string;
  date_created: string;
  date_updated: string;
  assignees: Array<{ username: string }>;
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  space?: { id: string };
}

interface CreateTaskParams {
  name: string;
  description?: string;
  listId: string;
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
    const data = await fetchApi<{ tasks: ClickUpTask[] }>(
      `/list/${listId}/task?include_closed=true&subtasks=true`,
    );
    return data.tasks;
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
    const data = await fetchApi<{ id: string; url: string }>(
      `/list/${params.listId}/task`,
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
    getTask,
    searchTasks,
    createTask,
  });
});
