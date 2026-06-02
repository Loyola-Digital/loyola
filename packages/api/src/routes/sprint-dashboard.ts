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
  folderId: string | null;
  folderName: string | null;
  /** Story 31.7 iter — Task Type custom no ClickUp (Campanha, Bug, etc).
   * null = task padrão ("Task"). Usado pra detectar fases automaticamente. */
  customItemId: number | null;
  /** Story 31.8 — Nome do Task Type custom resolvido via cache. null = default. */
  customItemName: string | null;
};
type TasksCacheEntry = { tasks: ClickUpTaskSimple[]; expiresAt: number };
const tasksCache = new Map<string, TasksCacheEntry>();

function tasksCacheKey(listIds: string[]): string {
  return [...listIds].sort().join(",");
}

const groupBySchema = z.enum(["status", "tag", "assignee"]).nullable().optional();

const campaignPhaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  startDate: z.string().min(1).max(40),
  endDate: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const blockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color deve ser hex tipo #D4537E"),
  clickupListIds: z.array(z.string().min(1)).min(1, "selecione ao menos 1 lista"),
  filters: z.object({
    statuses: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    assigneeIds: z.array(z.string()).optional(),
  }),
  groupBy: groupBySchema,
  sortOrder: z.number().int().nonnegative(),
  campaignPhases: z.array(campaignPhaseSchema).optional(),
  /** Story 31.7 */
  manualContext: z.string().max(2000).nullable().optional(),
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

  // Story 31.7 iter: cacheia teamId pra não chamar getTeams a cada request
  let cachedTeamId: string | null = null;
  async function resolveTeamId(): Promise<string | null> {
    if (cachedTeamId) return cachedTeamId;
    try {
      const teams = await fastify.clickupService.getTeams();
      cachedTeamId = teams[0]?.id ?? null;
      return cachedTeamId;
    } catch {
      return null;
    }
  }

  async function fetchTasksFromLists(listIds: string[], bypassCache = false): Promise<ClickUpTaskSimple[]> {
    const key = tasksCacheKey(listIds);
    if (!bypassCache) {
      const cached = tasksCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.tasks;
      }
    }

    // Story 31.7 iter: precisa de 2 GETs por lista — um pras tasks default
    // ("Task") e outro pras tasks com Task Type custom (Campanha, etc).
    // ClickUp não retorna ambos numa só chamada — `custom_items[]=ID` exclui
    // tasks default. Falhas em qualquer um não derrubam o outro.
    const teamId = await resolveTeamId();
    const customItemsMap = teamId
      ? await fastify.clickupService.getCustomItemsMap(teamId)
      : new Map<number, string>();

    const results = await Promise.allSettled(
      listIds.flatMap((listId) => [
        fastify.clickupService.getTasks(listId).then((tasks) => ({ listId, tasks })),
        teamId
          ? fastify.clickupService
              .getCustomTypeTasks(listId, teamId)
              .then((tasks) => ({ listId, tasks }))
              .catch(() => ({ listId, tasks: [] }))
          : Promise.resolve({ listId, tasks: [] }),
      ]),
    );
    const allTasks: ClickUpTaskSimple[] = [];
    const seenIds = new Set<string>(); // dedupe entre default e custom (não deveria ter, mas segurança)
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const listId = listIds[Math.floor(i / 2)];
      if (r.status === "rejected") {
        fastify.log.error({ err: r.reason, listId }, "ClickUp getTasks failed");
        continue;
      }
      for (const t of r.value.tasks) {
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
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
          folderId: t.folder?.id ?? null,
          folderName: t.folder?.name ?? null,
          customItemId: t.custom_item_id ?? null,
          customItemName:
            t.custom_item_id != null ? customItemsMap.get(t.custom_item_id) ?? null : null,
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

  // ---- PUT /api/sprint-dashboard/task/:taskId ----
  // Update completo: status / nome / due date numa só chamada.
  const updateTaskBodySchema = z.object({
    status: z.string().min(1).optional(),
    name: z.string().min(1).max(500).optional(),
    /** Unix ms (number) — null remove a data, undefined não toca. */
    dueDate: z.union([z.number().int(), z.null()]).optional(),
  });

  fastify.put("/api/sprint-dashboard/task/:taskId", async (request, reply) => {
    const guestErr = denyGuest(request);
    if (guestErr) return reply.code(403).send(guestErr);
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(503).send({ error: "ClickUp não configurado" });
    }

    const params = updateStatusParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const body = updateTaskBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Body inválido", details: body.error.flatten() });
    }

    if (Object.keys(body.data).length === 0) {
      return reply.code(400).send({ error: "Nenhum campo pra atualizar" });
    }

    try {
      await fastify.clickupService.updateTask(params.data.taskId, {
        status: body.data.status,
        name: body.data.name,
        due_date: body.data.dueDate,
      });
      tasksCache.clear();
      return { ok: true, taskId: params.data.taskId };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao atualizar task no ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- PUT /api/sprint-dashboard/task/:taskId/status ---- (legacy, mantido por compat)
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

  // Agrega tasks por FOLDER (= lançamento no padrão Loyola). Cada folder
  // vira um card no header com contadores: total / overdue / in_progress / done.
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
      return { byFolder: [], activeProjectsCount: 0 };
    }

    try {
      const tasks = await fetchTasksFromLists(allListIds);
      const now = Date.now();
      const finalStatuses = new Set(["done", "closed", "cancelado", "concluído", "concluido", "complete", "completed"]);

      // Agrupa por folderId (fallback pra listId quando folder é null = folderless list)
      type FolderAgg = {
        folderId: string;
        folderName: string;
        total: number;
        done: number;
        overdue: number;
        inProgress: number;
        upcoming: number; // due dentro de 7 dias mas ainda não overdue
        nextDueDate: number | null; // unix ms da próxima task com due_date
        nextDueTaskName: string | null;
      };
      const map = new Map<string, FolderAgg>();

      for (const t of tasks) {
        // Quando task não tem folder (folderless list), usa listId+listName como pseudo-folder
        const fid = t.folderId ?? `list:${t.listId}`;
        const fname = t.folderName ?? t.listName;
        const agg = map.get(fid) ?? {
          folderId: fid,
          folderName: fname,
          total: 0,
          done: 0,
          overdue: 0,
          inProgress: 0,
          upcoming: 0,
          nextDueDate: null,
          nextDueTaskName: null,
        };
        agg.total += 1;
        const isDone = finalStatuses.has(t.status.toLowerCase());
        if (isDone) {
          agg.done += 1;
        } else {
          agg.inProgress += 1;
          if (t.dueDate) {
            const ms = Number(t.dueDate);
            if (Number.isFinite(ms)) {
              if (ms < now) {
                agg.overdue += 1;
              } else if (ms <= now + 7 * 24 * 60 * 60 * 1000) {
                agg.upcoming += 1;
              }
              // "Próxima" entrega = menor due_date NO FUTURO (>= now). Tasks
              // em atraso não contam aqui — já são reportadas no counter overdue.
              if (ms >= now && (agg.nextDueDate === null || ms < agg.nextDueDate)) {
                agg.nextDueDate = ms;
                agg.nextDueTaskName = t.name;
              }
            }
          }
        }
        map.set(fid, agg);
      }

      // Ordena: folders com overdue primeiro, depois upcoming, depois alfabético
      const byFolder = Array.from(map.values()).sort((a, b) => {
        if (a.overdue !== b.overdue) return b.overdue - a.overdue;
        if (a.upcoming !== b.upcoming) return b.upcoming - a.upcoming;
        return a.folderName.localeCompare(b.folderName);
      });

      // Projetos ativos = folders com >=1 task ainda aberta
      const activeProjectsCount = byFolder.filter((f) => f.inProgress > 0).length;

      return {
        byFolder,
        activeProjectsCount,
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
