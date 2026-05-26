import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { sprintDashboardConfig } from "../db/schema.js";

// ============================================================
// Epic 31 — Sprint Dashboard (Stories 31.1, 31.2, 31.3, 31.6)
// 31.1: config CRUD singleton
// 31.2: GET /tasks (pull on-demand + cache 5min)
// 31.3: PUT /task/:id/status (write-through)
// 31.6: GET /metrics (eventos próximos + projetos ativos)
// ============================================================

// In-memory cache de tasks ClickUp — 5min TTL. Shared entre requests do
// processo Node. Key = sorted listIds + filters hash.
const TASKS_CACHE_TTL_MS = 5 * 60 * 1000;
type ClickUpTaskSimple = {
  id: string;
  name: string;
  status: string;
  statusColor: string | null;
  tags: string[];
  url: string;
  dueDate: string | null;
  startDate: string | null;
  assignees: Array<{ id: number | null; name: string; avatar: string | null }>;
  listId: string;
  listName: string;
};
type TasksCacheEntry = { tasks: ClickUpTaskSimple[]; expiresAt: number };
const tasksCache = new Map<string, TasksCacheEntry>();

function tasksCacheKey(listIds: string[]): string {
  return [...listIds].sort().join(",");
}

const groupBySchema = z.enum(["status", "tag", "assignee"]).nullable().optional();

const blockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color deve ser hex tipo #D4537E"),
  clickupListIds: z.array(z.string().min(1)).min(1, "selecione ao menos 1 lista"),
  filters: z.object({
    statuses: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    assigneeIds: z.array(z.string()).optional(),
  }),
  groupBy: groupBySchema,
  sortOrder: z.number().int().nonnegative(),
});

const putBodySchema = z.object({
  blocks: z.array(blockSchema),
});

function shapeRow(row: typeof sprintDashboardConfig.$inferSelect) {
  return {
    id: row.id,
    blocks: row.blocks ?? [],
    updatedBy: row.updatedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default fp(async function sprintDashboardRoutes(fastify) {
  // Bloqueia guests — Sprint Dashboard é interno do time Loyola
  function denyGuest(request: { userRole: string }): { error: string } | null {
    return request.userRole === "guest" ? { error: "Acesso negado" } : null;
  }

  async function loadOrCreateConfig() {
    const [existing] = await fastify.db
      .select()
      .from(sprintDashboardConfig)
      .limit(1);
    if (existing) return existing;

    // Auto-cria singleton com blocks vazios na 1ª chamada
    const [created] = await fastify.db
      .insert(sprintDashboardConfig)
      .values({ singleton: true, blocks: [] })
      .returning();
    return created;
  }

  // ---- GET /api/sprint-dashboard/config ----
  fastify.get("/api/sprint-dashboard/config", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);

    const config = await loadOrCreateConfig();
    return shapeRow(config);
  });

  // ---- PUT /api/sprint-dashboard/config ----
  fastify.put("/api/sprint-dashboard/config", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);

    const bodyResult = putBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply
        .code(400)
        .send({ error: "Dados inválidos", details: bodyResult.error.flatten() });
    }

    // Garante singleton existe
    const existing = await loadOrCreateConfig();

    const [updated] = await fastify.db
      .update(sprintDashboardConfig)
      .set({
        blocks: bodyResult.data.blocks,
        updatedBy: request.userId,
        updatedAt: new Date(),
      })
      .where(eq(sprintDashboardConfig.id, existing.id))
      .returning();

    return shapeRow(updated);
  });

  // ============================================================
  // Story 31.2 — Pull on-demand de tasks com cache 5min
  // ============================================================

  const tasksQuerySchema = z.object({
    listIds: z.string().min(1), // CSV
    bypassCache: z.coerce.boolean().optional(),
  });

  async function fetchTasksFromLists(listIds: string[], bypassCache = false): Promise<ClickUpTaskSimple[]> {
    const key = tasksCacheKey(listIds);
    if (!bypassCache) {
      const cached = tasksCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.tasks;
      }
    }

    // Paralelo: 1 chamada por lista. Erros de uma lista não derrubam o resto.
    const results = await Promise.allSettled(
      listIds.map((listId) => fastify.clickupService.getTasks(listId)),
    );
    const allTasks: ClickUpTaskSimple[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const listId = listIds[i];
      if (r.status === "rejected") {
        fastify.log.error({ err: r.reason, listId }, "ClickUp getTasks failed");
        continue;
      }
      for (const t of r.value) {
        allTasks.push({
          id: t.id,
          name: t.name,
          status: t.status?.status ?? "—",
          statusColor: t.status?.color ?? null,
          tags: (t.tags ?? []).map((tag) => tag.name),
          url: t.url,
          dueDate: t.due_date ?? null,
          startDate: t.start_date ?? null,
          assignees: (t.assignees ?? []).map((a) => ({
            id: a.id ?? null,
            name: a.username,
            avatar: a.profilePicture ?? null,
          })),
          listId,
          listName: t.list?.name ?? "",
        });
      }
    }

    tasksCache.set(key, {
      tasks: allTasks,
      expiresAt: Date.now() + TASKS_CACHE_TTL_MS,
    });
    return allTasks;
  }

  // ---- GET /api/sprint-dashboard/tasks?listIds=a,b,c ----
  fastify.get("/api/sprint-dashboard/tasks", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);

    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado (CLICKUP_API_TOKEN ausente)" });
    }

    const queryResult = tasksQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Query inválida", details: queryResult.error.flatten() });
    }

    const listIds = queryResult.data.listIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (listIds.length === 0) {
      return { tasks: [] as ClickUpTaskSimple[] };
    }

    try {
      const tasks = await fetchTasksFromLists(listIds, queryResult.data.bypassCache);
      return { tasks };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar tasks ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ============================================================
  // Story 31.3 — Write-through: atualiza status no ClickUp
  // ============================================================

  const updateStatusBodySchema = z.object({
    status: z.string().min(1),
  });
  const updateStatusParamsSchema = z.object({
    taskId: z.string().min(1),
  });

  // ---- PUT /api/sprint-dashboard/task/:taskId/status ----
  fastify.put("/api/sprint-dashboard/task/:taskId/status", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);

    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado" });
    }

    const params = updateStatusParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const body = updateStatusBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Body inválido", details: body.error.flatten() });
    }

    try {
      await fastify.clickupService.updateTaskStatus(params.data.taskId, body.data.status);
      // Invalida cache: status mudou, próxima leitura deve refletir
      tasksCache.clear();
      return { ok: true, taskId: params.data.taskId, status: body.data.status };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao atualizar status no ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ============================================================
  // Story 31.6 — Metrics-resumo do header (eventos próximos)
  // ============================================================

  // Reusa o cache de tasks. Retorna tasks com due_date nos próximos 14d,
  // ordenadas crescente. Caller usa pra render do header.
  fastify.get("/api/sprint-dashboard/metrics", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);

    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado" });
    }

    const config = await loadOrCreateConfig();
    const allListIds = Array.from(
      new Set(
        (config.blocks ?? []).flatMap((b) => b.clickupListIds ?? []),
      ),
    );
    if (allListIds.length === 0) {
      return { upcomingEvents: [], activeProjectsCount: 0 };
    }

    try {
      const tasks = await fetchTasksFromLists(allListIds);
      const now = Date.now();
      const horizonMs = 14 * 24 * 60 * 60 * 1000;
      const upcomingEvents = tasks
        .filter((t) => t.dueDate)
        .map((t) => ({
          taskId: t.id,
          name: t.name,
          dueDate: t.dueDate!,
          status: t.status,
          listName: t.listName,
          url: t.url,
        }))
        .filter((e) => {
          const ms = Number(e.dueDate);
          return Number.isFinite(ms) && ms >= now - horizonMs && ms <= now + horizonMs;
        })
        .sort((a, b) => Number(a.dueDate) - Number(b.dueDate))
        .slice(0, 10);

      // Projetos ativos = blocks distintos com >=1 task no estado não final
      const finalStatuses = new Set(["done", "closed", "cancelado", "concluído", "concluido"]);
      const activeBlockIds = new Set<string>();
      for (const block of config.blocks ?? []) {
        const listSet = new Set(block.clickupListIds);
        const hasActive = tasks.some(
          (t) => listSet.has(t.listId) && !finalStatuses.has(t.status.toLowerCase()),
        );
        if (hasActive) activeBlockIds.add(block.id);
      }

      return {
        upcomingEvents,
        activeProjectsCount: activeBlockIds.size,
      };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao calcular metrics",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ============================================================
  // Story 31.5 helper — list statuses pra builder UI
  // ============================================================

  fastify.get("/api/sprint-dashboard/list/:listId/statuses", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado" });
    }

    const params = z.object({ listId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    try {
      const statuses = await fastify.clickupService.getListStatuses(params.data.listId);
      return { statuses };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar statuses",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ============================================================
  // Story 31.5 helper — workspace hierarchy pra builder UI list-picker
  // ============================================================

  fastify.get("/api/sprint-dashboard/hierarchy", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado" });
    }

    try {
      const teams = await fastify.clickupService.getTeams();
      if (teams.length === 0) return { spaces: [] };
      const teamId = teams[0].id; // primeira (única) team
      const spaces = await fastify.clickupService.getSpaces(teamId);

      const result: Array<{
        id: string;
        name: string;
        folders: Array<{
          id: string;
          name: string;
          lists: Array<{ id: string; name: string }>;
        }>;
        folderlessLists: Array<{ id: string; name: string }>;
      }> = [];

      // Paralelo: cada space busca folders + folderless lists em paralelo
      const spaceData = await Promise.all(
        spaces.map(async (space) => {
          const [folders, folderlessLists] = await Promise.all([
            fastify.clickupService.getFolders(space.id),
            fastify.clickupService.getFolderlessLists(space.id),
          ]);
          return {
            id: space.id,
            name: space.name,
            folders: folders.map((f) => ({
              id: f.id,
              name: f.name,
              lists: (f.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
            })),
            folderlessLists: folderlessLists.map((l) => ({ id: l.id, name: l.name })),
          };
        }),
      );
      result.push(...spaceData);

      return { spaces: result };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar hierarchy ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
