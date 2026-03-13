import fp from "fastify-plugin";

const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

interface CreateTaskParams {
  name: string;
  description?: string;
  listId?: string;
  priority?: string;
  tags?: string[];
}

interface ClickUpService {
  createTask(params: CreateTaskParams): Promise<{ id: string; url: string }>;
}

declare module "fastify" {
  interface FastifyInstance {
    clickupService: ClickUpService;
  }
}

export default fp(async function clickupService(fastify) {
  async function createTask(
    params: CreateTaskParams,
  ): Promise<{ id: string; url: string }> {
    const token = fastify.config.CLICKUP_API_TOKEN;
    const listId = params.listId ?? fastify.config.CLICKUP_LIST_ID;

    if (!token || !listId) {
      throw new Error(
        "ClickUp not configured: CLICKUP_API_TOKEN and CLICKUP_LIST_ID are required",
      );
    }

    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: params.name,
          description: params.description ?? "",
          priority: PRIORITY_MAP[params.priority ?? "normal"] ?? 3,
          tags: params.tags ?? [],
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { id: string; url: string };
    return { id: data.id, url: data.url };
  }

  if (!fastify.config.CLICKUP_API_TOKEN) {
    fastify.log.warn("CLICKUP_API_TOKEN not set — ClickUp integration disabled");
  }

  fastify.decorate("clickupService", { createTask });
});
