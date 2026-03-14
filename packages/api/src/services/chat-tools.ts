import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { FastifyInstance } from "fastify";

/**
 * Tools available to minds during chat.
 * The AI navigates ClickUp autonomously: teams → spaces → folders → lists → tasks.
 */

export function getChatTools(fastify: FastifyInstance): Tool[] {
  const tools: Tool[] = [];

  if (fastify.clickupService.isConfigured()) {
    tools.push(
      {
        name: "clickup_get_workspaces",
        description:
          "Lista todos os workspaces (teams) do ClickUp que o usuário tem acesso. Use como ponto de partida para navegar a estrutura do ClickUp.",
        input_schema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "clickup_get_spaces",
        description:
          "Lista todos os spaces dentro de um workspace. Spaces organizam projetos/departamentos (ex: Marketing, Vendas, Produto).",
        input_schema: {
          type: "object" as const,
          properties: {
            team_id: {
              type: "string",
              description: "ID do workspace/team",
            },
          },
          required: ["team_id"],
        },
      },
      {
        name: "clickup_get_folders",
        description:
          "Lista as folders dentro de um space. Folders agrupam listas de tarefas (ex: Campanhas Q1, Projetos Ativos).",
        input_schema: {
          type: "object" as const,
          properties: {
            space_id: {
              type: "string",
              description: "ID do space",
            },
          },
          required: ["space_id"],
        },
      },
      {
        name: "clickup_get_lists",
        description:
          "Lista as listas de tarefas dentro de uma folder. Também pode buscar listas sem folder (folderless) passando o space_id.",
        input_schema: {
          type: "object" as const,
          properties: {
            folder_id: {
              type: "string",
              description: "ID da folder (para listas dentro de folder)",
            },
            space_id: {
              type: "string",
              description:
                "ID do space (para listas sem folder — folderless lists)",
            },
          },
          required: [],
        },
      },
      {
        name: "clickup_get_tasks",
        description:
          "Busca todas as tarefas de uma lista específica. Retorna nome, descrição, status, prioridade, responsáveis e tags.",
        input_schema: {
          type: "object" as const,
          properties: {
            list_id: {
              type: "string",
              description: "ID da lista",
            },
          },
          required: ["list_id"],
        },
      },
      {
        name: "clickup_get_task_details",
        description:
          "Busca detalhes completos de uma tarefa específica pelo ID. Use quando precisa ver descrição completa, comentários, subtarefas.",
        input_schema: {
          type: "object" as const,
          properties: {
            task_id: {
              type: "string",
              description: "ID da tarefa no ClickUp",
            },
          },
          required: ["task_id"],
        },
      },
      {
        name: "clickup_search",
        description:
          "Pesquisa tarefas no ClickUp por nome. Use quando o usuário menciona uma campanha, projeto ou tarefa pelo nome. Busca em todo o workspace.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description:
                "Texto para buscar (nome da campanha, projeto, tarefa)",
            },
            team_id: {
              type: "string",
              description:
                "ID do workspace para buscar (use clickup_get_workspaces primeiro se não souber)",
            },
          },
          required: ["query", "team_id"],
        },
      },
      {
        name: "clickup_create_task",
        description:
          "Cria uma nova tarefa no ClickUp. Use quando o usuário pede para criar uma tarefa, ação, ou item de trabalho.",
        input_schema: {
          type: "object" as const,
          properties: {
            list_id: {
              type: "string",
              description: "ID da lista onde criar a tarefa",
            },
            name: {
              type: "string",
              description: "Nome/título da tarefa",
            },
            description: {
              type: "string",
              description: "Descrição detalhada da tarefa",
            },
            priority: {
              type: "string",
              enum: ["urgent", "high", "normal", "low"],
              description: "Prioridade (padrão: normal)",
            },
          },
          required: ["list_id", "name"],
        },
      },
    );
  }

  // Past conversations — always available
  tools.push({
    name: "get_past_conversations",
    description:
      "Busca conversas anteriores do usuário. Use para obter contexto de discussões passadas, decisões tomadas, ou quando o usuário referencia algo discutido antes.",
    input_schema: {
      type: "object" as const,
      properties: {
        mind_id: {
          type: "string",
          description:
            "ID da mente para filtrar (opcional — busca com qualquer mente se omitido)",
        },
        limit: {
          type: "number",
          description:
            "Número máximo de conversas (padrão: 5, máximo: 10)",
        },
      },
      required: [],
    },
  });

  return tools;
}

/**
 * Execute a tool call and return the result as a string.
 */
export async function executeChatTool(
  fastify: FastifyInstance,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  const svc = fastify.clickupService;

  switch (toolName) {
    case "clickup_get_workspaces": {
      const teams = await svc.getTeams();
      if (teams.length === 0) return "Nenhum workspace encontrado.";
      return teams
        .map((t) => `- ${t.name} (ID: ${t.id})`)
        .join("\n");
    }

    case "clickup_get_spaces": {
      const teamId = input.team_id as string;
      const spaces = await svc.getSpaces(teamId);
      if (spaces.length === 0) return "Nenhum space encontrado.";
      return spaces
        .map((s) => `- ${s.name} (ID: ${s.id})`)
        .join("\n");
    }

    case "clickup_get_folders": {
      const spaceId = input.space_id as string;
      const folders = await svc.getFolders(spaceId);
      if (folders.length === 0)
        return "Nenhuma folder encontrada neste space.";
      return folders
        .map((f) => {
          const lists = f.lists?.length
            ? `\n  Listas: ${f.lists.map((l) => `${l.name} (ID: ${l.id})`).join(", ")}`
            : "";
          return `- ${f.name} (ID: ${f.id})${lists}`;
        })
        .join("\n");
    }

    case "clickup_get_lists": {
      const folderId = input.folder_id as string;
      const spaceId = input.space_id as string;

      let lists;
      if (folderId) {
        lists = await svc.getLists(folderId);
      } else if (spaceId) {
        lists = await svc.getFolderlessLists(spaceId);
      } else {
        return "Erro: informe folder_id ou space_id";
      }

      if (lists.length === 0) return "Nenhuma lista encontrada.";
      return lists
        .map(
          (l) =>
            `- ${l.name} (ID: ${l.id})${l.task_count ? ` — ${l.task_count} tarefas` : ""}`,
        )
        .join("\n");
    }

    case "clickup_get_tasks": {
      const listId = input.list_id as string;
      if (!listId) return "Erro: list_id é obrigatório";
      const tasks = await svc.getTasks(listId);
      if (tasks.length === 0) return "Nenhuma tarefa encontrada na lista.";

      return tasks
        .map((t) => {
          const status = t.status?.status ?? "?";
          const priority = t.priority?.priority ?? "normal";
          const tags = t.tags?.map((tag) => tag.name).join(", ");
          const desc = t.description?.substring(0, 300);
          const assignees = t.assignees?.map((a) => a.username).join(", ");
          return [
            `- [${status.toUpperCase()}] (${priority}) ${t.name}`,
            desc ? `  Descrição: ${desc}` : null,
            tags ? `  Tags: ${tags}` : null,
            assignees ? `  Responsáveis: ${assignees}` : null,
            `  ID: ${t.id} | URL: ${t.url}`,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");
    }

    case "clickup_get_task_details": {
      const taskId = input.task_id as string;
      if (!taskId) return "Erro: task_id é obrigatório";
      const task = await svc.getTask(taskId);
      if (!task) return `Tarefa ${taskId} não encontrada.`;

      return JSON.stringify(
        {
          name: task.name,
          description: task.description,
          status: task.status?.status,
          priority: task.priority?.priority,
          tags: task.tags?.map((t) => t.name),
          assignees: task.assignees?.map((a) => a.username),
          list: task.list?.name,
          folder: task.folder?.name,
          url: task.url,
          created: task.date_created,
          updated: task.date_updated,
        },
        null,
        2,
      );
    }

    case "clickup_search": {
      const query = input.query as string;
      const teamId = input.team_id as string;
      if (!query || !teamId) return "Erro: query e team_id são obrigatórios";
      const tasks = await svc.searchTasks(teamId, query);
      if (tasks.length === 0)
        return `Nenhuma tarefa encontrada para "${query}".`;

      return tasks
        .map((t) => {
          const status = t.status?.status ?? "?";
          const priority = t.priority?.priority ?? "normal";
          const list = t.list?.name ?? "";
          const folder = t.folder?.name ?? "";
          const desc = t.description?.substring(0, 200);
          return [
            `- [${status.toUpperCase()}] (${priority}) ${t.name}`,
            folder || list
              ? `  Local: ${[folder, list].filter(Boolean).join(" > ")}`
              : null,
            desc ? `  Descrição: ${desc}` : null,
            `  ID: ${t.id} | URL: ${t.url}`,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");
    }

    case "clickup_create_task": {
      const listId = input.list_id as string;
      const name = input.name as string;
      if (!listId || !name) return "Erro: list_id e name são obrigatórios";

      const result = await svc.createTask({
        listId,
        name,
        description: (input.description as string) ?? "",
        priority: (input.priority as string) ?? "normal",
      });
      return `Tarefa criada com sucesso!\nID: ${result.id}\nURL: ${result.url}`;
    }

    case "get_past_conversations": {
      const { eq, desc, and, isNull } = await import("drizzle-orm");
      const { conversations, messages } = await import("../db/schema.js");

      const mindId = (input.mind_id as string) || undefined;
      const limit = Math.min((input.limit as number) || 5, 10);

      const conditions = [
        eq(conversations.userId, userId),
        isNull(conversations.deletedAt),
      ];
      if (mindId) {
        conditions.push(eq(conversations.mindId, mindId));
      }

      const convs = await fastify.db
        .select({
          id: conversations.id,
          mindName: conversations.mindName,
          title: conversations.title,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit);

      if (convs.length === 0) return "Nenhuma conversa anterior encontrada.";

      const parts: string[] = [];
      for (const conv of convs) {
        const convMsgs = await fastify.db
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(8);

        convMsgs.reverse();

        parts.push(
          `### ${conv.title ?? conv.mindName} (${conv.createdAt.toLocaleDateString("pt-BR")})`,
        );
        for (const m of convMsgs) {
          const prefix = m.role === "user" ? "Usuário" : conv.mindName;
          parts.push(`**${prefix}:** ${m.content.substring(0, 500)}`);
        }
        parts.push("");
      }

      return parts.join("\n");
    }

    default:
      return `Ferramenta desconhecida: ${toolName}`;
  }
}
