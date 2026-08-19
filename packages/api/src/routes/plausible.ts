/**
 * Plausible Analytics (self-hosted) — alternativa ao GA4.
 *
 * A instância é UMA só para todos os experts, então a credencial mora aqui em
 * escopo global (singleton); o que muda por projeto é só QUAL site dela ler. Foi
 * o pedido literal do time, e casa com a realidade: um GA4 exige um OAuth por
 * cliente, um Plausible próprio não.
 *
 * Escolher um site para o projeto DESLIGA o GA4 dele. Não existe um "modo
 * analytics" separado de propósito — flag e configuração divergem com o tempo, e
 * aí a tela mostra um número que ninguém sabe de onde veio. A fonte é derivada
 * do que está configurado: tem site do Plausible, lê Plausible; não tem, GA4.
 *
 * SEGURANÇA: a chave da API nunca sai daqui. Nenhuma rota devolve
 * `apiKeyEncrypted` — só `configured`, a URL e um resumo mascarado.
 */

import { z } from "zod";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  metaAdInsightsDaily,
  plausibleConfig,
  plausibleProjectSites,
  projects,
  projectMembers,
} from "../db/schema.js";
import { decryptGa4Secret, encryptGa4Secret } from "../services/ga4.js";
import { invalidarAnalyticsDoProjeto } from "../services/analytics-cache.js";
import {
  listarSites,
  listarSitesPorSessao,
  montarDashboardCompleto,
  normalizarBaseUrl,
  testarSite,
  validarCredenciais,
  type PlausibleCreds,
  type PlausibleLogin,
  type PlausiblePeriodo,
} from "../services/plausible.js";

const projectParamsSchema = z.object({ projectId: z.string().uuid() });

const configSchema = z.object({
  baseUrl: z.string().trim().url("Informe a URL completa (https://…)"),
  /** Opcional no PUT: permite editar só a URL sem redigitar a chave. */
  apiKey: z.string().trim().min(10).optional(),
  /**
   * Login do painel — opcional, e usado SÓ para listar os sites. A Sites API
   * não existe no Community Edition, e `/api/sites` recusa API key.
   */
  loginEmail: z.string().trim().email().optional().or(z.literal("")),
  loginPassword: z.string().optional(),
});

/**
 * `site_id` do Plausible é o domínio cadastrado lá. Aceitamos URL colada
 * ("https://loja.com/planos") e extraímos o host — é o erro mais comum de quem
 * copia da barra do navegador, e recusar seria implicância.
 */
const siteSchema = z.object({
  siteId: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .transform((v) => {
      const semProtocolo = v.replace(/^https?:\/\//i, "");
      return semProtocolo.split("/")[0].replace(/\.$/, "").toLowerCase();
    }),
});

export default fp(async function plausibleRoutes(fastify) {
  function ehAdmin(role: string | undefined): boolean {
    return role === "admin";
  }

  /** Credenciais em claro para uso interno. `null` = Plausible não configurado. */
  async function lerCreds(): Promise<PlausibleCreds | null> {
    const [row] = await fastify.db.select().from(plausibleConfig).limit(1);
    if (!row) return null;
    return {
      baseUrl: row.baseUrl,
      apiKey: decryptGa4Secret(row.apiKeyEncrypted, row.apiKeyIv),
    };
  }

  /** Login do painel, se cadastrado. Só serve para listar sites. */
  async function lerLogin(): Promise<PlausibleLogin | null> {
    const [row] = await fastify.db.select().from(plausibleConfig).limit(1);
    if (!row?.loginEmail || !row.loginPasswordEncrypted || !row.loginPasswordIv) return null;
    return {
      email: row.loginEmail,
      senha: decryptGa4Secret(row.loginPasswordEncrypted, row.loginPasswordIv),
    };
  }

  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  // ============================================================
  // Configuração global
  // ============================================================

  /**
   * Status da config. Qualquer pessoa autenticada lê, porque a tela do projeto
   * precisa saber se pode oferecer o Plausible — mas só o status, nunca a chave.
   */
  fastify.get("/api/plausible/config", async (request) => {
    const [row] = await fastify.db
      .select({
        baseUrl: plausibleConfig.baseUrl,
        updatedAt: plausibleConfig.updatedAt,
        loginEmail: plausibleConfig.loginEmail,
      })
      .from(plausibleConfig)
      .limit(1);
    if (!row) {
      return { configured: false, baseUrl: null, updatedAt: null, loginEmail: null, podeEditar: ehAdmin(request.userRole) };
    }
    return {
      configured: true,
      baseUrl: row.baseUrl,
      updatedAt: row.updatedAt.toISOString(),
      // O e-mail volta (é identificador, não segredo); a senha nunca.
      loginEmail: row.loginEmail,
      podeEditar: ehAdmin(request.userRole),
    };
  });

  /** Salva/atualiza a config global. Admin only — a chave vale por todos. */
  fastify.put("/api/plausible/config", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });
    const body = configSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    const [atual] = await fastify.db.select().from(plausibleConfig).limit(1);
    if (!body.data.apiKey && !atual) {
      return reply.code(400).send({ error: "Informe a chave da API" });
    }

    const baseUrl = normalizarBaseUrl(body.data.baseUrl);
    const apiKey = body.data.apiKey ?? decryptGa4Secret(atual!.apiKeyEncrypted, atual!.apiKeyIv);

    // Valida ANTES de gravar: config quebrada salva em silêncio só aparece
    // depois, na tela de outra pessoa, como "analytics vazio".
    const teste = await validarCredenciais({ baseUrl, apiKey });
    if (!teste.ok) return reply.code(400).send({ error: teste.detalhe });

    const enc = encryptGa4Secret(apiKey);
    const now = new Date();

    // Login: e-mail vazio apaga o cadastro; senha em branco mantém a guardada.
    const emailInformado = body.data.loginEmail?.trim() ?? undefined;
    const senhaInformada = body.data.loginPassword?.trim() || undefined;
    const senhaEnc = senhaInformada ? encryptGa4Secret(senhaInformada) : null;
    const camposLogin =
      emailInformado === undefined
        ? {}
        : emailInformado === ""
          ? { loginEmail: null, loginPasswordEncrypted: null, loginPasswordIv: null }
          : {
              loginEmail: emailInformado,
              ...(senhaEnc
                ? { loginPasswordEncrypted: senhaEnc.encrypted, loginPasswordIv: senhaEnc.iv }
                : {}),
            };

    if (atual) {
      await fastify.db
        .update(plausibleConfig)
        .set({ baseUrl, apiKeyEncrypted: enc.encrypted, apiKeyIv: enc.iv, updatedAt: now, ...camposLogin })
        .where(eq(plausibleConfig.id, atual.id));
    } else {
      await fastify.db.insert(plausibleConfig).values({
        baseUrl,
        apiKeyEncrypted: enc.encrypted,
        apiKeyIv: enc.iv,
        createdBy: request.userId,
        updatedAt: now,
        ...camposLogin,
      });
    }

    // Diz de cara se o login serve para listar — descobrir isso só na tela do
    // projeto, com o seletor vazio, é o que gerou a reclamação de "tive de
    // colar a URL na mão".
    let sitesEncontrados: number | null = null;
    if (emailInformado) {
      const login = await lerLogin();
      if (login) {
        const lista = await listarSitesPorSessao(baseUrl, login);
        sitesEncontrados = lista?.length ?? 0;
      }
    }

    return {
      configured: true,
      baseUrl,
      aviso: teste.inconclusivo ? teste.detalhe : null,
      sitesEncontrados,
    };
  });

  /**
   * Remove a config global. Os vínculos por projeto ficam: apagá-los junto
   * perderia a escolha de domínio de cada expert por causa de uma troca de
   * chave. Sem config, a rota de analytics volta sozinha pro GA4.
   */
  fastify.delete("/api/plausible/config", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });
    await fastify.db.delete(plausibleConfig);
    return { configured: false };
  });

  /** Testa credenciais — as enviadas na tela, ou as já salvas. Admin only. */
  fastify.post("/api/plausible/test", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });
    const body = z
      .object({ baseUrl: z.string().trim().url().optional(), apiKey: z.string().trim().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    let creds: PlausibleCreds | null = null;
    if (body.data.baseUrl && body.data.apiKey) {
      creds = { baseUrl: normalizarBaseUrl(body.data.baseUrl), apiKey: body.data.apiKey };
    } else {
      creds = await lerCreds();
      if (creds && body.data.baseUrl) creds.baseUrl = normalizarBaseUrl(body.data.baseUrl);
    }
    if (!creds) return reply.code(400).send({ error: "Plausible ainda não configurado" });

    try {
      return await validarCredenciais(creds);
    } catch (err) {
      return {
        ok: false,
        detalhe: `Não foi possível alcançar a instância: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  /**
   * Sites da instância. Vem vazio quando a Sites API não está habilitada — a
   * tela então deixa digitar o domínio à mão, e `disponivel: false` é o que a
   * diferencia de "a instância não tem nenhum site".
   */
  fastify.get("/api/plausible/sites", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const creds = await lerCreds();
    if (!creds) return { disponivel: false, sites: [], fonte: "indisponivel" as const };
    try {
      const { sites, fonte } = await listarSites(creds, await lerLogin());
      return { disponivel: sites.length > 0, sites, fonte };
    } catch {
      return { disponivel: false, sites: [], fonte: "indisponivel" as const };
    }
  });

  // ============================================================
  // Site por projeto
  // ============================================================

  /** Qual site este projeto lê. `siteId: null` = projeto segue no GA4. */
  fastify.get("/api/projects/:projectId/plausible/site", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [row] = await fastify.db
      .select({ siteId: plausibleProjectSites.siteId, updatedAt: plausibleProjectSites.updatedAt })
      .from(plausibleProjectSites)
      .where(eq(plausibleProjectSites.projectId, params.data.projectId))
      .limit(1);
    const [cfg] = await fastify.db.select({ baseUrl: plausibleConfig.baseUrl }).from(plausibleConfig).limit(1);

    return {
      siteId: row?.siteId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      /** Sem config global não adianta a tela oferecer a troca de fonte. */
      configGlobal: cfg ? { configured: true, baseUrl: cfg.baseUrl } : { configured: false, baseUrl: null },
    };
  });

  /** Escolhe o site — e com isso troca a fonte de analytics do projeto. */
  fastify.put("/api/projects/:projectId/plausible/site", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = siteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Informe o domínio do site no Plausible" });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await lerCreds();
    if (!creds) {
      return reply.code(409).send({ error: "Plausible não configurado — peça a um admin em Configurações" });
    }

    // Só grava domínio que a instância de fato lê. Um domínio errado aqui não
    // dá erro na tela do dashboard: dá ZERO, que se confunde com "não teve
    // tráfego" e leva o time a debater um número que nunca existiu.
    const teste = await testarSite(creds, body.data.siteId);
    if (!teste.ok) return reply.code(400).send({ error: teste.detalhe });

    const now = new Date();
    await fastify.db
      .insert(plausibleProjectSites)
      .values({
        projectId: params.data.projectId,
        siteId: body.data.siteId,
        createdBy: request.userId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: plausibleProjectSites.projectId,
        set: { siteId: body.data.siteId, updatedAt: now },
      });

    // A tela precisa ver o número da fonte nova imediatamente — é assim que a
    // pessoa confere se acertou o domínio.
    invalidarAnalyticsDoProjeto(params.data.projectId);
    return { siteId: body.data.siteId, detalhe: teste.detalhe };
  });

  /** Desfaz a escolha — o projeto volta a ler o GA4. */
  fastify.delete("/api/projects/:projectId/plausible/site", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(plausibleProjectSites)
      .where(eq(plausibleProjectSites.projectId, params.data.projectId));
    invalidarAnalyticsDoProjeto(params.data.projectId);
    return { siteId: null };
  });

  // ============================================================
  // Dashboard completo do site (o mesmo recorte da tela do Plausible)
  // ============================================================

  /** Id de objeto da Meta: só dígitos e comprido. Nome de campanha nunca é assim. */
  function pareceIdDaMeta(valor: string): boolean {
    return /^\d{10,}$/.test(valor.trim());
  }

  /**
   * Troca ids de campanha por nomes, usando o que a sincronização da Meta já
   * guardou.
   *
   * Quem monta o anúncio nem sempre põe o nome na UTM — o Meta preenche
   * `utm_campaign` com o id. No painel isso vira uma lista de números que não
   * dizem nada, e a pessoa tem de abrir o Gerenciador para saber o que é cada
   * um. Aqui a gente já tem o mapa: `meta_ad_insights_daily` guarda id e nome.
   *
   * Uma consulta só para o painel inteiro, e o id fica preservado em
   * `idOriginal` — trocar o número por um nome sem deixar rastro tiraria de
   * quem confere a única chave que casa com o Gerenciador.
   */
  async function resolverNomesDeCampanha(
    projectId: string,
    blocos: Array<{ rows: Array<{ nome: string; idOriginal?: string }> }>,
  ): Promise<void> {
    const ids = [
      ...new Set(
        blocos.flatMap((b) => b.rows.map((r) => r.nome).filter((nome) => pareceIdDaMeta(nome))),
      ),
    ];
    if (ids.length === 0) return;

    const linhas = await fastify.db
      .selectDistinct({ id: metaAdInsightsDaily.campaignId, nome: metaAdInsightsDaily.campaignName })
      .from(metaAdInsightsDaily)
      .where(
        and(
          eq(metaAdInsightsDaily.projectId, projectId),
          inArray(metaAdInsightsDaily.campaignId, ids),
          isNotNull(metaAdInsightsDaily.campaignName),
        ),
      );

    const mapa = new Map(linhas.filter((l) => l.id && l.nome).map((l) => [l.id!, l.nome!]));
    if (mapa.size === 0) return;

    for (const bloco of blocos) {
      for (const linha of bloco.rows) {
        const nome = mapa.get(linha.nome);
        // Sem nome cadastrado o id continua aparecendo: é melhor um número que
        // dá para procurar do que um "(sem nome)" que não leva a lugar nenhum.
        if (nome) {
          linha.idOriginal = linha.nome;
          linha.nome = nome;
        }
      }
    }
  }

  /**
   * Tudo que a tela do Plausible mostra, em uma chamada.
   *
   * São ~14 consultas ao Plausible (uma por aba, porque a API não devolve vários
   * breakdowns juntos), disparadas em paralelo. Deixar o navegador fazer as 14
   * multiplicaria a latência e exporia a chave — que nunca sai do servidor.
   *
   * O filtro de página é opcional: passado, recorta o site no pedaço de uma
   * etapa; ausente, mostra o site inteiro como o painel do Plausible mostra.
   */
  fastify.get("/api/projects/:projectId/plausible/dashboard", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = z
      .object({
        periodo: z.enum(["day", "7d", "30d", "month", "6mo", "12mo"]).default("30d"),
        pageFilter: z.string().trim().max(255).optional(),
      })
      .safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [site] = await fastify.db
      .select({ siteId: plausibleProjectSites.siteId })
      .from(plausibleProjectSites)
      .where(eq(plausibleProjectSites.projectId, params.data.projectId))
      .limit(1);
    if (!site) return reply.code(409).send({ error: "Este projeto não usa Plausible" });

    const creds = await lerCreds();
    if (!creds) return reply.code(409).send({ error: "Plausible não configurado" });

    try {
      const dash = await montarDashboardCompleto(
        creds,
        site.siteId,
        query.data.periodo as PlausiblePeriodo,
        query.data.pageFilter,
      );
      // Campanha é onde o id aparece, mas origem também traz número às vezes —
      // resolver os dois sai na mesma consulta.
      await resolverNomesDeCampanha(params.data.projectId, [...dash.fontes]);
      return dash;
    } catch (err) {
      request.log.error({ err }, "[plausible] dashboard falhou");
      return reply.code(502).send({
        error: err instanceof Error ? err.message : "Erro ao consultar o Plausible",
      });
    }
  });
});
