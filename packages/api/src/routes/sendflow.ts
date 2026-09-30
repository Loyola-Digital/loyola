/**
 * SendFlow — grupos de WhatsApp da campanha dentro do Loyola X.
 *
 * Responde as duas perguntas do time: quantas pessoas estão nos grupos da
 * campanha, e quando saíram disparos (que viram linha no Log de Campanha).
 *
 * O casamento campanha↔funil normaliza os dois lados (ver `sendflow-casamento.ts`):
 * o funil `fz-m3-set-26` casa com o grupo `FZM3` do SendFlow, que antes não
 * era encontrado por causa do hífen. Reusa o `matchCode`/token do funil, o mesmo que o
 * Mautic já usa — validado em produção: `dg-pg02` e `dg-pg04` casam com as
 * campanhas homônimas do SendFlow.
 */

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, sendflowConnections } from "../db/schema.js";
import { alvoDoFunil, casarCampanha } from "../services/sendflow-casamento.js";
import { conexaoPara } from "../services/sendflow-groups-sync.js";
import {
  cruzarOrigem,
  participantesDaCampanha,
} from "../services/sendflow-origem.js";
import {
  cruzarGrupoComLeads,
  leadsDoFunil,
} from "../services/grupo-x-leads.js";
import {
  montarUrlDeAutorizacao,
  trocarCodigo,
} from "../services/sendflow-oauth.js";
import { encrypt, decrypt } from "../services/encryption.js";
import {
  SendflowError,
  SendflowSession,
  analyticsDaCampanha,
  dataDaChave,
  disparosDaCampanha,
  gruposDaCampanha,
  listarCampanhas,
  renovarToken,
  totalDeParticipantes,
  type SendflowRelease,
} from "../services/sendflow.js";

const projetoParam = z.object({ projectId: z.string().uuid() });
const funilParam = projetoParam.extend({ funnelId: z.string().uuid() });

/** Mesmo token do Mautic: "dg-pg04-jul" → "dg-pg04". */

export default fp(async function sendflowRoutes(fastify) {
  /**
   * Uma renovação por projeto de cada vez.
   *
   * Sem isto, três abas abrindo juntas disparam três refresh simultâneos — e
   * como o servidor pode ROTACIONAR o refresh_token, o segundo a chegar
   * invalidaria o primeiro e derrubaria a conexão.
   */
  const renovando = new Map<string, Promise<string>>();

  async function tokenPara(projectId: string): Promise<string | null> {
    const conn = await conexaoPara(fastify.db, projectId);
    if (!conn) return null;

    const agora = Date.now();
    if (
      conn.accessTokenEncrypted &&
      conn.accessTokenIv &&
      conn.accessTokenExpiresAt &&
      conn.accessTokenExpiresAt.getTime() > agora
    ) {
      return decrypt(conn.accessTokenEncrypted, conn.accessTokenIv);
    }

    const emCurso = renovando.get(projectId);
    if (emCurso) return emCurso;

    const p = (async () => {
      const t = await renovarToken(
        conn.clientId,
        decrypt(conn.clientSecretEncrypted, conn.clientSecretIv),
        decrypt(conn.refreshTokenEncrypted, conn.refreshTokenIv),
      );
      const acc = encrypt(t.accessToken);
      const ref = encrypt(t.refreshToken);
      await fastify.db
        .update(sendflowConnections)
        .set({
          accessTokenEncrypted: acc.encrypted,
          accessTokenIv: acc.iv,
          accessTokenExpiresAt: new Date(t.expiresAt),
          // Regrava o refresh: o servidor pode ter rotacionado.
          refreshTokenEncrypted: ref.encrypted,
          refreshTokenIv: ref.iv,
          updatedAt: new Date(),
        })
        .where(eq(sendflowConnections.id, conn.id));
      return t.accessToken;
    })().finally(() => renovando.delete(projectId));

    renovando.set(projectId, p);
    return p;
  }

  /** Sessão MCP pronta pra uso, ou null se o projeto não conectou. */
  async function sessao(projectId: string): Promise<SendflowSession | null> {
    const token = await tokenPara(projectId);
    if (!token) return null;
    const s = new SendflowSession(token);
    await s.conectar();
    return s;
  }

  // Mesmo shape estrutural que o helper do VTurb usa — evita amarrar o tipo
  // do FastifyReply, que muda com generics de rota.
  function erro(
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    err: unknown,
  ) {
    if (err instanceof SendflowError) {
      // 401/400 do SendFlow viram 502 aqui: não é o usuário do Loyola X que
      // está sem sessão, é a integração — confundir os dois manda a pessoa
      // relogar no app à toa.
      return reply
        .code(err.status === 401 || err.status === 400 ? 502 : 502)
        .send({
          error: err.message,
          code: "SENDFLOW_ERROR",
        });
    }
    fastify.log.error({ err }, "sendflow: falha inesperada");
    return reply
      .code(502)
      .send({ error: "Falha ao falar com o SendFlow", code: "SENDFLOW_ERROR" });
  }

  const negarGuest = (request: { userRole?: string }) =>
    request.userRole === "guest";

  // ---- Conexão -----------------------------------------------------------

  fastify.get(
    "/api/projects/:projectId/sendflow/connection",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = projetoParam.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      const conn = await conexaoPara(fastify.db, p.data.projectId);
      // Nunca devolve segredo — só o suficiente pra tela dizer "conectado".
      return {
        connected: !!conn,
        clientId: conn?.clientId ?? null,
        updatedAt: conn?.updatedAt ?? null,
        /** true = veio da conexão global (o normal), não de uma do projeto. */
        global: conn ? conn.projectId === null : false,
      };
    },
  );

  const corpoConexao = z.object({
    clientId: z.string().trim().min(8).max(255),
    clientSecret: z.string().trim().min(8).max(500),
    refreshToken: z.string().trim().min(8).max(2000),
  });

  fastify.put(
    "/api/projects/:projectId/sendflow/connection",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = projetoParam.safeParse(request.params);
      const body = corpoConexao.safeParse(request.body);
      if (!p.success || !body.success)
        return reply.code(400).send({ error: "Dados inválidos" });
      if (!request.userId)
        return reply.code(401).send({ error: "Unauthorized" });

      // Valida ANTES de gravar: credencial errada guardada em silêncio só
      // apareceria como erro na primeira consulta, longe daqui.
      let tokens;
      try {
        tokens = await renovarToken(
          body.data.clientId,
          body.data.clientSecret,
          body.data.refreshToken,
        );
      } catch (err) {
        return erro(reply, err);
      }

      const seg = encrypt(body.data.clientSecret);
      const ref = encrypt(tokens.refreshToken);
      const acc = encrypt(tokens.accessToken);
      await fastify.db
        .insert(sendflowConnections)
        .values({
          projectId: p.data.projectId,
          clientId: body.data.clientId,
          clientSecretEncrypted: seg.encrypted,
          clientSecretIv: seg.iv,
          refreshTokenEncrypted: ref.encrypted,
          refreshTokenIv: ref.iv,
          accessTokenEncrypted: acc.encrypted,
          accessTokenIv: acc.iv,
          accessTokenExpiresAt: new Date(tokens.expiresAt),
          createdBy: request.userId,
        })
        .onConflictDoUpdate({
          target: sendflowConnections.projectId,
          set: {
            clientId: body.data.clientId,
            clientSecretEncrypted: seg.encrypted,
            clientSecretIv: seg.iv,
            refreshTokenEncrypted: ref.encrypted,
            refreshTokenIv: ref.iv,
            accessTokenEncrypted: acc.encrypted,
            accessTokenIv: acc.iv,
            accessTokenExpiresAt: new Date(tokens.expiresAt),
            updatedAt: new Date(),
          },
        });
      return { connected: true };
    },
  );

  fastify.delete(
    "/api/projects/:projectId/sendflow/connection",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = projetoParam.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      await fastify.db
        .delete(sendflowConnections)
        .where(eq(sendflowConnections.projectId, p.data.projectId));
      return { connected: false };
    },
  );

  // ---- Conexão GLOBAL ----------------------------------------------------
  // O SendFlow é uma conta só para todos os experts, então a configuração vive
  // aqui e não por projeto. `project_id NULL` marca a linha global; um índice
  // parcial garante que só exista uma.

  fastify.get("/api/settings/sendflow/connection", async (request, reply) => {
    if (negarGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const [conn] = await fastify.db
      .select({
        clientId: sendflowConnections.clientId,
        updatedAt: sendflowConnections.updatedAt,
      })
      .from(sendflowConnections)
      .where(isNull(sendflowConnections.projectId))
      .limit(1);
    return {
      connected: !!conn,
      clientId: conn?.clientId ?? null,
      updatedAt: conn?.updatedAt ?? null,
    };
  });

  fastify.put("/api/settings/sendflow/connection", async (request, reply) => {
    if (negarGuest(request))
      return reply.code(403).send({ error: "Acesso negado" });
    const body = corpoConexao.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: "Dados inválidos" });
    if (!request.userId) return reply.code(401).send({ error: "Unauthorized" });

    // Valida ANTES de gravar: credencial errada guardada em silêncio só
    // apareceria como erro na primeira consulta, longe daqui.
    let tokens;
    try {
      tokens = await renovarToken(
        body.data.clientId,
        body.data.clientSecret,
        body.data.refreshToken,
      );
    } catch (err) {
      return erro(reply, err);
    }
    const seg = encrypt(body.data.clientSecret);
    const ref = encrypt(tokens.refreshToken);
    const acc = encrypt(tokens.accessToken);
    const valores = {
      clientId: body.data.clientId,
      clientSecretEncrypted: seg.encrypted,
      clientSecretIv: seg.iv,
      refreshTokenEncrypted: ref.encrypted,
      refreshTokenIv: ref.iv,
      accessTokenEncrypted: acc.encrypted,
      accessTokenIv: acc.iv,
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      updatedAt: new Date(),
    };
    const [existente] = await fastify.db
      .select({ id: sendflowConnections.id })
      .from(sendflowConnections)
      .where(isNull(sendflowConnections.projectId))
      .limit(1);
    if (existente) {
      await fastify.db
        .update(sendflowConnections)
        .set(valores)
        .where(eq(sendflowConnections.id, existente.id));
    } else {
      await fastify.db
        .insert(sendflowConnections)
        .values({ ...valores, projectId: null, createdBy: request.userId });
    }
    return { connected: true };
  });

  fastify.delete(
    "/api/settings/sendflow/connection",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      await fastify.db
        .delete(sendflowConnections)
        .where(isNull(sendflowConnections.projectId));
      return { connected: false };
    },
  );

  // ---- OAuth: conectar sem colar token na mão ----------------------------

  /** Callback público desta API. Fixado no registro do cliente OAuth. */
  function urlDeCallback(request: {
    protocol: string;
    hostname: string;
  }): string {
    const base =
      fastify.config.API_PUBLIC_URL?.replace(/\/$/, "") ??
      `${request.protocol}://${request.hostname}`;
    return `${base}/api/oauth/sendflow/callback`;
  }

  /**
   * Devolve a URL de autorização pra tela redirecionar.
   *
   * É POST autenticado (e não um redirect direto) porque o navegador não manda
   * a sessão do Loyola X numa navegação pra outro domínio — a tela pega a URL
   * por fetch e só então navega.
   */
  fastify.post(
    "/api/settings/sendflow/authorize-url",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      if (!request.userId)
        return reply.code(401).send({ error: "Unauthorized" });
      try {
        const redirectUri = urlDeCallback(request);
        // Reusa o cliente já registrado, se houver: registrar um novo a cada
        // clique encheria a conta do SendFlow de clientes órfãos.
        const [conn] = await fastify.db
          .select({
            clientId: sendflowConnections.clientId,
            secret: sendflowConnections.clientSecretEncrypted,
            iv: sendflowConnections.clientSecretIv,
            redirectUri: sendflowConnections.redirectUri,
          })
          .from(sendflowConnections)
          .where(isNull(sendflowConnections.projectId))
          .limit(1);

        /*
         * Só reusa o cliente se ele foi registrado com ESTA `redirect_uri`.
         *
         * O SendFlow amarra a URI ao cliente no registro. Mandar outra devolve
         * `redirect_uri not registered` — e o erro só aparece no navegador,
         * depois do redirect, enquanto a tela continua dizendo "Conectado"
         * porque a linha no banco segue lá. Foi exatamente o que aconteceu
         * quando a URL pública da API mudou depois do registro.
         *
         * `null` é conexão anterior a esta coluna: não dá para saber com que
         * URI foi registrada, então vale a regra antiga (reusa). Se falhar, o
         * Desconectar + Conectar registra um cliente novo e grava a URI.
         */
        const podeReusar =
          conn &&
          (conn.redirectUri === null || conn.redirectUri === redirectUri);
        if (conn && !podeReusar) {
          request.log.info(
            { registrada: conn.redirectUri, atual: redirectUri },
            "[sendflow] redirect_uri mudou — registrando cliente novo",
          );
        }

        const { url } = await montarUrlDeAutorizacao(
          redirectUri,
          request.userId,
          podeReusar
            ? {
                clientId: conn.clientId,
                clientSecret: decrypt(conn.secret, conn.iv),
              }
            : undefined,
        );
        return { url };
      } catch (err) {
        return reply.code(502).send({
          error:
            err instanceof Error ? err.message : "Falha ao iniciar a conexão",
        });
      }
    },
  );

  /** Retorno do SendFlow. Chega sem sessão — quem autoriza é o `state`. */
  fastify.get("/api/oauth/sendflow/callback", async (request, reply) => {
    const q = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
      })
      .safeParse(request.query);
    const destino = `${fastify.config.CORS_ORIGIN.replace(/\/$/, "")}/settings/whatsapp`;

    if (!q.success || q.data.error || !q.data.code || !q.data.state) {
      const motivo =
        q.success && q.data.error ? q.data.error : "autorizacao_cancelada";
      return reply.redirect(
        `${destino}?sendflow=erro&motivo=${encodeURIComponent(motivo)}`,
      );
    }

    try {
      const t = await trocarCodigo(q.data.state, q.data.code);
      const seg = encrypt(t.clientSecret);
      const ref = encrypt(t.refreshToken);
      const acc = encrypt(t.accessToken);
      const valores = {
        clientId: t.clientId,
        clientSecretEncrypted: seg.encrypted,
        clientSecretIv: seg.iv,
        refreshTokenEncrypted: ref.encrypted,
        refreshTokenIv: ref.iv,
        accessTokenEncrypted: acc.encrypted,
        accessTokenIv: acc.iv,
        accessTokenExpiresAt: new Date(t.expiresAt),
        // A URI que ESTE cliente aceita, para a próxima conexão saber se pode
        // reusá-lo.
        redirectUri: t.redirectUri,
        updatedAt: new Date(),
      };
      const [existente] = await fastify.db
        .select({ id: sendflowConnections.id })
        .from(sendflowConnections)
        .where(isNull(sendflowConnections.projectId))
        .limit(1);
      if (existente) {
        await fastify.db
          .update(sendflowConnections)
          .set(valores)
          .where(eq(sendflowConnections.id, existente.id));
      } else {
        await fastify.db
          .insert(sendflowConnections)
          .values({ ...valores, projectId: null, createdBy: t.userId });
      }
      return reply.redirect(`${destino}?sendflow=ok`);
    } catch (err) {
      fastify.log.warn({ err }, "[sendflow] callback falhou");
      const motivo = err instanceof Error ? err.message : "falha";
      return reply.redirect(
        `${destino}?sendflow=erro&motivo=${encodeURIComponent(motivo.slice(0, 160))}`,
      );
    }
  });

  // ---- Campanhas ---------------------------------------------------------

  fastify.get(
    "/api/projects/:projectId/sendflow/releases",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = projetoParam.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      try {
        const s = await sessao(p.data.projectId);
        if (!s)
          return reply
            .code(409)
            .send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });
        const todas = await listarCampanhas(s);
        // `?todas=1` inclui as arquivadas: o grupo antigo que se quer comparar
        // costuma ser de um lançamento que já acabou.
        const incluirArquivadas =
          (request.query as { todas?: string }).todas === "1";
        return {
          releases: incluirArquivadas ? todas : todas.filter((r) => !r.archived),
        };
      } catch (err) {
        return erro(reply, err);
      }
    },
  );

  /** O funil e a campanha do SendFlow que casou com ele. */
  async function campanhaDoFunil(
    s: SendflowSession,
    projectId: string,
    funnelId: string,
  ) {
    const [funil] = await fastify.db
      .select({ name: funnels.name, matchCode: funnels.matchCode })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    if (!funil) return null;
    const campanhas = (await listarCampanhas(s)).filter((c) => !c.archived);
    return {
      funil,
      campanhas,
      campanha: casarCampanha(campanhas, funil.name, funil.matchCode),
    };
  }

  // ---- Resumo por funil --------------------------------------------------

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sendflow/summary",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = funilParam.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      try {
        const s = await sessao(p.data.projectId);
        if (!s)
          return reply
            .code(409)
            .send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });

        const achado = await campanhaDoFunil(
          s,
          p.data.projectId,
          p.data.funnelId,
        );
        if (!achado)
          return reply.code(404).send({ error: "Funil não encontrado" });
        const { funil, campanhas, campanha } = achado;
        if (!campanha) {
          // Não é erro: a maioria dos funis do projeto é de outros clientes e
          // não tem operação de WhatsApp. A tela diz isso em vez de "falhou".
          return {
            semCampanha: true,
            // O alvo normalizado, que é o que de fato se procura. Mostrar o
            // token cru fazia a tela dizer "procurei fz-m3" enquanto a busca
            // comparava outra coisa.
            tokenBuscado: alvoDoFunil(funil.name, funil.matchCode),
            campanhasDisponiveis: campanhas.map((c) => ({
              id: c.id,
              name: c.name,
            })),
          };
        }

        const [grupos, analytics, historico] = await Promise.all([
          gruposDaCampanha(s, campanha.id),
          analyticsDaCampanha(s, campanha.id),
          disparosDaCampanha(s, campanha.id),
        ]);
        const disparos = historico.acoes;

        const serie = (d?: Record<string, number>) =>
          Object.entries(d ?? {})
            .map(([k, v]) => ({ date: dataDaChave(k), valor: v }))
            .filter(
              (x): x is { date: string; valor: number } => x.date !== null,
            )
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
          semCampanha: false,
          campanha: { id: campanha.id, name: campanha.name },
          grupos: grupos.map((g) => ({
            id: g.id,
            name: g.name,
            gid: g.gid,
            // `participantsAmount` é a contagem de gente. `count` é a posição do
            // grupo na campanha (#1, #2) — confundir os dois dá número errado.
            participantes: g.participantsAmount ?? 0,
            cheio: g.full ?? false,
            inviteCode: g.inviteCode ?? null,
          })),
          totalParticipantes: totalDeParticipantes(grupos),
          entradas: {
            total: analytics.add?.total ?? 0,
            porDia: serie(analytics.add?.dates),
          },
          saidas: {
            total: analytics.remove?.total ?? 0,
            porDia: serie(analytics.remove?.dates),
          },
          cliques: {
            total: analytics.clicks?.total ?? 0,
            porDia: serie(analytics.clicks?.dates),
          },
          disparos: disparos.map((a) => ({
            id: a.id,
            tipo: a.type,
            quando: a.scheduledTo ?? a.startedAt ?? a.createdAt ?? null,
            sucesso: a.success ?? null,
            erro: a.error ?? null,
          })),
        };
      } catch (err) {
        return erro(reply, err);
      }
    },
  );
  // ---- Origem dos participantes -------------------------------------------

  const origemQuery = z.object({
    comparar: z.string().regex(/^[A-Za-z0-9]{8,64}$/),
  });

  /**
   * Quem da campanha do funil já estava num grupo antigo, e quem é novo.
   * Devolve os números: é para o time poder agir sobre eles (ver
   * `sendflow-origem.ts`). Convidado não chega aqui.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sendflow/origem",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = funilParam.safeParse(request.params);
      const q = origemQuery.safeParse(request.query);
      if (!p.success || !q.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      try {
        const s = await sessao(p.data.projectId);
        if (!s)
          return reply
            .code(409)
            .send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });

        const achado = await campanhaDoFunil(
          s,
          p.data.projectId,
          p.data.funnelId,
        );
        if (!achado)
          return reply.code(404).send({ error: "Funil não encontrado" });
        if (!achado.campanha)
          return reply.code(404).send({
            error: "Nenhuma campanha do SendFlow casou com este funil",
          });
        if (achado.campanha.id === q.data.comparar)
          return reply
            .code(400)
            .send({ error: "Escolha uma campanha diferente da do funil" });

        // Em sequência de propósito: a sessão serializa as chamadas de qualquer
        // jeito, e assim a primeira fica em cache mesmo se a segunda falhar.
        const atual = await participantesDaCampanha(s, achado.campanha.id);
        const antiga = await participantesDaCampanha(s, q.data.comparar);
        return {
          campanha: { id: achado.campanha.id, name: achado.campanha.name },
          ...cruzarOrigem(atual, antiga),
        };
      } catch (err) {
        return erro(reply, err);
      }
    },
  );

  // ---- Canal de quem entrou no grupo --------------------------------------

  /**
   * De que canal veio cada pessoa que entrou no grupo (ver `grupo-x-leads.ts`).
   *
   * Junta o que o SendFlow sabe (quem está no grupo, pelo número) com o que a
   * planilha de captação sabe (as UTMs de cada lead). Medido em produção:
   * 79,1% de cobertura no dg-pg04 e 65,0% no dg-pg02. Devolve os números, como
   * a rota de origem — é dado para agir, e convidado não chega aqui.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sendflow/canais",
    async (request, reply) => {
      if (negarGuest(request))
        return reply.code(403).send({ error: "Acesso negado" });
      const p = funilParam.safeParse(request.params);
      if (!p.success)
        return reply.code(400).send({ error: "Parâmetros inválidos" });

      try {
        const s = await sessao(p.data.projectId);
        if (!s)
          return reply
            .code(409)
            .send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });

        const achado = await campanhaDoFunil(
          s,
          p.data.projectId,
          p.data.funnelId,
        );
        if (!achado)
          return reply.code(404).send({ error: "Funil não encontrado" });
        if (!achado.campanha)
          return reply.code(404).send({
            error: "Nenhuma campanha do SendFlow casou com este funil",
          });

        // Em paralelo: um lado é o MCP do SendFlow, o outro é o Google Sheets.
        const [grupo, leads] = await Promise.all([
          participantesDaCampanha(s, achado.campanha.id),
          leadsDoFunil(fastify.db, p.data.funnelId),
        ]);
        return {
          campanha: { id: achado.campanha.id, name: achado.campanha.name },
          leadsCaptados: leads.size,
          ...cruzarGrupoComLeads(grupo, leads),
        };
      } catch (err) {
        return erro(reply, err);
      }
    },
  );
});
