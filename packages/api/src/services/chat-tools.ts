import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import type { FastifyInstance } from "fastify";

/**
 * Tools available to minds during chat.
 * The AI navigates ClickUp autonomously: teams → spaces → folders → lists → tasks.
 */

export function getChatTools(fastify: FastifyInstance, userRole = "admin"): Tool[] {
  const tools: Tool[] = [];

  if (fastify.clickupService.isConfigured() && userRole !== "guest") {
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

  // Instagram metrics — always available (handles "no accounts" gracefully)
  tools.push({
    name: "instagram_metrics",
    description:
      "Busca métricas e dados de uma conta de Instagram cadastrada na plataforma. Use quando o usuário perguntar sobre performance, engagement, followers, alcance, posts, audiência ou dados de Instagram de um cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_name_or_username: {
          type: "string",
          description:
            "Nome da conta ou @username do Instagram (busca parcial, case-insensitive)",
        },
        metric_type: {
          type: "string",
          enum: ["overview", "posts", "demographics", "full"],
          description:
            "Tipo de métricas: overview (resumo geral), posts (últimos posts), demographics (audiência), full (tudo). Padrão: overview",
        },
        period: {
          type: "string",
          description:
            "Período para métricas: 7d, 14d, 30d, 90d. Padrão: 30d",
        },
      },
      required: ["account_name_or_username"],
    },
  });

  // Consult another Mind — always available (cross-mind consultation)
  tools.push({
    name: "consult_mind",
    description:
      "Consulta outro Mind/especialista para obter perspectiva. O debate inteiro acontece dentro de uma reunião fechada. Use consult_mind MÚLTIPLAS VEZES para conduzir a reunião: passe previous_exchange para continuar o debate. Quando o debate chegar a um consenso, pare de chamar a tool e apresente APENAS o resultado final consolidado no chat. O chat principal só deve receber o output final — nunca o debate intermediário.",
    input_schema: {
      type: "object" as const,
      properties: {
        mind_name: {
          type: "string",
          description:
            "Nome do Mind a consultar (case-insensitive, busca parcial). Ex: 'hormozi', 'brunson', 'cardone'",
        },
        question: {
          type: "string",
          description: "Pergunta ou tópico para consultar ao Mind. Em follow-ups, pode ser um refinamento ou feedback sobre a resposta anterior.",
        },
        context: {
          type: "string",
          description: "Contexto da conversa atual para o Mind consultado entender o cenário (opcional)",
        },
      },
      required: ["mind_name", "question"],
    },
  });

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
  onDebateTurn?: (data: { speaker: string; mindName: string; message: string; type: string }) => void,
  signal?: AbortSignal,
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

    case "instagram_metrics": {
      const { or, ilike } = await import("drizzle-orm");
      const { instagramAccounts } = await import("../db/schema.js");

      const searchTerm = input.account_name_or_username as string;
      const metricType = (input.metric_type as string) ?? "overview";
      const period = (input.period as string) ?? "30d";
      const days = parseInt(period) || 30;

      // Search account by friendly name or username (partial, case-insensitive)
      const cleanSearch = searchTerm.replace(/^@/, "");
      const accounts = await fastify.db
        .select({
          id: instagramAccounts.id,
          accountName: instagramAccounts.accountName,
          instagramUsername: instagramAccounts.instagramUsername,
          tokenExpiresAt: instagramAccounts.tokenExpiresAt,
        })
        .from(instagramAccounts)
        .where(
          or(
            ilike(instagramAccounts.accountName, `%${cleanSearch}%`),
            ilike(instagramAccounts.instagramUsername, `%${cleanSearch}%`),
          ),
        )
        .limit(5);

      if (accounts.length === 0) {
        const allAccounts = await fastify.db
          .select({
            accountName: instagramAccounts.accountName,
            instagramUsername: instagramAccounts.instagramUsername,
          })
          .from(instagramAccounts)
          .limit(20);

        if (allAccounts.length === 0) {
          return "Nenhuma conta de Instagram cadastrada na plataforma. Adicione em Settings > Instagram.";
        }
        const list = allAccounts
          .map(
            (a) =>
              `- ${a.accountName}${a.instagramUsername ? ` (@${a.instagramUsername})` : ""}`,
          )
          .join("\n");
        return `Conta "${searchTerm}" não encontrada. Contas disponíveis:\n${list}`;
      }

      const account = accounts[0];

      if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
        return `⚠️ O token da conta **${account.accountName}** expirou em ${account.tokenExpiresAt.toLocaleDateString("pt-BR")}. Renove em Settings > Instagram.`;
      }

      const until = Math.floor(Date.now() / 1000);
      const since = until - days * 86400;
      const usernameDisplay = account.instagramUsername
        ? `@${account.instagramUsername}`
        : account.accountName;

      const parts: string[] = [
        `## Instagram: ${usernameDisplay} (${account.accountName})\n`,
      ];

      try {
        // OVERVIEW
        if (metricType === "overview" || metricType === "full") {
          const [profileResult, insightsResult] = await Promise.allSettled([
            fastify.instagramService.getProfile(account.id),
            fastify.instagramService.getAccountInsights(
              account.id,
              "day",
              since,
              until,
            ),
          ]);

          parts.push(`### Overview (últimos ${days} dias)`);

          if (profileResult.status === "fulfilled") {
            const p = profileResult.value;
            parts.push(
              `- **Followers:** ${p.followers_count.toLocaleString("pt-BR")}`,
            );
            parts.push(
              `- **Seguindo:** ${p.follows_count.toLocaleString("pt-BR")}`,
            );
            parts.push(
              `- **Total de Posts:** ${p.media_count.toLocaleString("pt-BR")}`,
            );
          }

          if (insightsResult.status === "fulfilled") {
            const data = insightsResult.value;
            const reachEntry = data.find((e) => e.name === "reach");
            const engagedEntry = data.find(
              (e) => e.name === "accounts_engaged",
            );

            const sumValues = (
              entry: (typeof data)[number] | undefined,
            ): number => {
              if (!entry) return 0;
              return entry.values.reduce(
                (acc, v) =>
                  acc + (typeof v.value === "number" ? v.value : 0),
                0,
              );
            };

            const totalReach = sumValues(reachEntry);
            const totalEngaged = sumValues(engagedEntry);

            if (totalReach > 0)
              parts.push(
                `- **Alcance Total:** ${totalReach.toLocaleString("pt-BR")}`,
              );
            if (totalEngaged > 0)
              parts.push(
                `- **Contas Engajadas:** ${totalEngaged.toLocaleString("pt-BR")}`,
              );

            if (
              profileResult.status === "fulfilled" &&
              totalEngaged > 0 &&
              profileResult.value.followers_count > 0
            ) {
              const rate = (
                (totalEngaged / profileResult.value.followers_count) *
                100
              ).toFixed(2);
              parts.push(`- **Taxa de Engajamento:** ${rate}%`);
            }
          }
          parts.push("");
        }

        // POSTS
        if (metricType === "posts" || metricType === "full") {
          const media = await fastify.instagramService.getMediaList(
            account.id,
            10,
          );
          parts.push("### Últimos Posts");

          if (media.data.length === 0) {
            parts.push("Nenhum post encontrado.");
          } else {
            parts.push("| Post | Tipo | Likes | Comentários | Data |");
            parts.push("|------|------|-------|-------------|------|");
            for (const post of media.data) {
              const caption = (post.caption ?? "Sem legenda")
                .substring(0, 40)
                .replace(/\n/g, " ");
              const date = new Date(post.timestamp).toLocaleDateString("pt-BR");
              const likes =
                post.like_count?.toLocaleString("pt-BR") ?? "—";
              const comments =
                post.comments_count?.toLocaleString("pt-BR") ?? "—";
              parts.push(
                `| ${caption}... | ${post.media_type} | ${likes} | ${comments} | ${date} |`,
              );
            }
          }
          parts.push("");
        }

        // DEMOGRAPHICS
        if (metricType === "demographics" || metricType === "full") {
          const demographics =
            await fastify.instagramService.getAudienceDemographics(
              account.id,
            );
          parts.push("### Audiência");

          const cityEntry = demographics.find(
            (e) => e.name === "audience_city",
          );
          const countryEntry = demographics.find(
            (e) => e.name === "audience_country",
          );
          const genderAgeEntry = demographics.find(
            (e) => e.name === "audience_gender_age",
          );

          const formatBreakdown = (
            entry: (typeof demographics)[number] | undefined,
            label: string,
            topN: number,
          ) => {
            if (!entry?.values?.[0]?.value) return;
            const val = entry.values[0].value;
            if (typeof val !== "object" || val === null) return;
            const sorted = Object.entries(val as Record<string, number>)
              .sort((a, b) => b[1] - a[1])
              .slice(0, topN);
            parts.push(`**${label}:**`);
            for (const [key, n] of sorted) {
              parts.push(`- ${key}: ${n.toLocaleString("pt-BR")}`);
            }
          };

          formatBreakdown(genderAgeEntry, "Faixa Etária / Gênero", 5);
          formatBreakdown(countryEntry, "Top Países", 3);
          formatBreakdown(cityEntry, "Top Cidades", 3);

          if (!genderAgeEntry && !countryEntry && !cityEntry) {
            parts.push("Dados de audiência não disponíveis.");
          }
          parts.push("");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        if (
          msg.toLowerCase().includes("expirad") ||
          msg.toLowerCase().includes("token")
        ) {
          return `⚠️ Token expirado ou inválido para **${account.accountName}**. Renove em Settings > Instagram.`;
        }
        return `Erro ao buscar métricas de ${account.accountName}: ${msg}`;
      }

      return parts.join("\n");
    }

    case "consult_mind": {
      const mindName = input.mind_name as string;
      const question = input.question as string;
      const context = (input.context as string) ?? "";
      const previousExchange = (input.previous_exchange as string) ?? "";

      if (!mindName || !question) return "Erro: mind_name e question são obrigatórios";

      // Find mind by name or ID (case-insensitive, partial match, hyphens = spaces = underscores)
      const squads = fastify.mindRegistry.getAll();
      const allMinds = squads.flatMap((s) => s.minds.map((m) => ({ ...m, squad: s.displayName })));
      const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, " ").trim();
      const normalizedQuery = normalize(mindName);
      const foundMind = allMinds.find((m) => {
        const normalizedName = normalize(m.name);
        const normalizedId = normalize(m.id);
        return normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)
          || normalizedId.includes(normalizedQuery) || normalizedQuery.includes(normalizedId);
      });

      if (!foundMind) {
        return `Mind "${mindName}" não encontrado. Minds disponíveis: ${allMinds.slice(0, 10).map((m) => m.name).join(", ")}`;
      }

      // AUTONOMOUS MULTI-TURN DEBATE
      // The tool runs the entire debate internally and returns only the final result
      const consultedPrompt = await fastify.mindEngine.buildPrompt(foundMind.id, 2);
      const MAX_ROUNDS = 3; // 3 rounds = ~5 turnos (briefing + 3 respostas + follow-ups)

      try {
        onDebateTurn?.({ speaker: "current", mindName: "Expert", message: question, type: "question" });

        const debateMessages: { role: "user" | "assistant"; content: string }[] = [];
        const briefing = context ? `Contexto:\n${context}\n\n${question}` : question;
        debateMessages.push({ role: "user", content: `${briefing}\n\nResponda com sua expertise de forma CONCISA e direta. Use frameworks e dados. Máximo 500 palavras.` });

        let lastResponse = "";
        const followUps = [
          "Bom. Agora: quais as 3 maiores objeções e como resolver cada uma? Seja direto.",
          "Último ponto: consolide tudo num plano de ação final com os passos concretos. Seja breve e definitivo.",
        ];

        for (let round = 0; round < MAX_ROUNDS; round++) {
          // Check if client disconnected before starting a new round
          if (signal?.aborted) {
            onDebateTurn?.({ speaker: "current", mindName: "Expert", message: "⏹️ Reunião interrompida pelo usuário.", type: "question" });
            return `🧠 Reunião com **${foundMind.name}** interrompida.\n\n**Último resultado parcial:**\n\n${lastResponse || "(nenhum)"}`;
          }

          const stream = fastify.claude.stream({
            systemPrompt: consultedPrompt,
            messages: debateMessages,
            maxTokens: 1500,
          });
          const msg = await stream.finalMessage();
          lastResponse = msg.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { type: string; text?: string }) => b.text ?? "")
            .join("");

          debateMessages.push({ role: "assistant", content: lastResponse });
          onDebateTurn?.({ speaker: "consulted", mindName: foundMind.name, message: lastResponse, type: "response" });

          if (round < MAX_ROUNDS - 1 && followUps[round]) {
            debateMessages.push({ role: "user", content: followUps[round] });
            onDebateTurn?.({ speaker: "current", mindName: "Expert", message: followUps[round], type: "question" });
          }
        }

        onDebateTurn?.({ speaker: "current", mindName: "Expert", message: "✅ Reunião encerrada.", type: "question" });

        return `🧠 Reunião com **${foundMind.name}** concluída.\n\n**Resultado:**\n\n${lastResponse}`;
      } catch (err) {
        return `Erro na reunião com ${foundMind.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Ferramenta desconhecida: ${toolName}`;
  }
}
