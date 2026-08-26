/**
 * SendFlow — grupos de WhatsApp da campanha dentro do Loyola X.
 *
 * Responde as duas perguntas do time: quantas pessoas estão nos grupos da
 * campanha, e quando saíram disparos (que viram linha no Log de Campanha).
 *
 * O casamento campanha↔funil reusa o `matchCode`/token do funil, o mesmo que o
 * Mautic já usa — validado em produção: `dg-pg02` e `dg-pg04` casam com as
 * campanhas homônimas do SendFlow.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, sendflowConnections } from "../db/schema.js";
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
function tokenDoFunil(nome: string): string {
  const segs = nome.trim().split("-").filter(Boolean);
  return segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nome.trim();
}

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
    const [conn] = await fastify.db
      .select()
      .from(sendflowConnections)
      .where(eq(sendflowConnections.projectId, projectId))
      .limit(1);
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
        .where(eq(sendflowConnections.projectId, projectId));
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
  function erro(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
    if (err instanceof SendflowError) {
      // 401/400 do SendFlow viram 502 aqui: não é o usuário do Loyola X que
      // está sem sessão, é a integração — confundir os dois manda a pessoa
      // relogar no app à toa.
      return reply.code(err.status === 401 || err.status === 400 ? 502 : 502).send({
        error: err.message,
        code: "SENDFLOW_ERROR",
      });
    }
    fastify.log.error({ err }, "sendflow: falha inesperada");
    return reply.code(502).send({ error: "Falha ao falar com o SendFlow", code: "SENDFLOW_ERROR" });
  }

  const negarGuest = (request: { userRole?: string }) => request.userRole === "guest";

  // ---- Conexão -----------------------------------------------------------

  fastify.get("/api/projects/:projectId/sendflow/connection", async (request, reply) => {
    if (negarGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [conn] = await fastify.db
      .select({
        clientId: sendflowConnections.clientId,
        updatedAt: sendflowConnections.updatedAt,
      })
      .from(sendflowConnections)
      .where(eq(sendflowConnections.projectId, p.data.projectId))
      .limit(1);
    // Nunca devolve segredo — só o suficiente pra tela dizer "conectado".
    return { connected: !!conn, clientId: conn?.clientId ?? null, updatedAt: conn?.updatedAt ?? null };
  });

  const corpoConexao = z.object({
    clientId: z.string().trim().min(8).max(255),
    clientSecret: z.string().trim().min(8).max(500),
    refreshToken: z.string().trim().min(8).max(2000),
  });

  fastify.put("/api/projects/:projectId/sendflow/connection", async (request, reply) => {
    if (negarGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projetoParam.safeParse(request.params);
    const body = corpoConexao.safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });
    if (!request.userId) return reply.code(401).send({ error: "Unauthorized" });

    // Valida ANTES de gravar: credencial errada guardada em silêncio só
    // apareceria como erro na primeira consulta, longe daqui.
    let tokens;
    try {
      tokens = await renovarToken(body.data.clientId, body.data.clientSecret, body.data.refreshToken);
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
  });

  fastify.delete("/api/projects/:projectId/sendflow/connection", async (request, reply) => {
    if (negarGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db
      .delete(sendflowConnections)
      .where(eq(sendflowConnections.projectId, p.data.projectId));
    return { connected: false };
  });

  // ---- Campanhas ---------------------------------------------------------

  fastify.get("/api/projects/:projectId/sendflow/releases", async (request, reply) => {
    if (negarGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    try {
      const s = await sessao(p.data.projectId);
      if (!s) return reply.code(409).send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });
      const todas = await listarCampanhas(s);
      return { releases: todas.filter((r) => !r.archived) };
    } catch (err) {
      return erro(reply, err);
    }
  });

  // ---- Resumo por funil --------------------------------------------------

  /** Campanha que casa com o funil, pelo mesmo token do Mautic. */
  function casarCampanha(
    campanhas: SendflowRelease[],
    funnelName: string,
    matchCode: string | null,
  ): SendflowRelease | null {
    const alvo = (matchCode ?? tokenDoFunil(funnelName)).toLowerCase();
    if (!alvo) return null;
    return campanhas.find((c) => (c.name ?? "").toLowerCase().includes(alvo)) ?? null;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sendflow/summary",
    async (request, reply) => {
      if (negarGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = funilParam.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [funil] = await fastify.db
        .select({ name: funnels.name, matchCode: funnels.matchCode })
        .from(funnels)
        .where(and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)))
        .limit(1);
      if (!funil) return reply.code(404).send({ error: "Funil não encontrado" });

      try {
        const s = await sessao(p.data.projectId);
        if (!s) return reply.code(409).send({ error: "SendFlow não conectado", code: "NOT_CONNECTED" });

        const campanhas = (await listarCampanhas(s)).filter((c) => !c.archived);
        const campanha = casarCampanha(campanhas, funil.name, funil.matchCode);
        if (!campanha) {
          // Não é erro: a maioria dos funis do projeto é de outros clientes e
          // não tem operação de WhatsApp. A tela diz isso em vez de "falhou".
          return {
            semCampanha: true,
            tokenBuscado: (funil.matchCode ?? tokenDoFunil(funil.name)).toLowerCase(),
            campanhasDisponiveis: campanhas.map((c) => ({ id: c.id, name: c.name })),
          };
        }

        const [grupos, analytics, disparos] = await Promise.all([
          gruposDaCampanha(s, campanha.id),
          analyticsDaCampanha(s, campanha.id),
          disparosDaCampanha(s, campanha.id, 30),
        ]);

        const serie = (d?: Record<string, number>) =>
          Object.entries(d ?? {})
            .map(([k, v]) => ({ date: dataDaChave(k), valor: v }))
            .filter((x): x is { date: string; valor: number } => x.date !== null)
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
          entradas: { total: analytics.add?.total ?? 0, porDia: serie(analytics.add?.dates) },
          saidas: { total: analytics.remove?.total ?? 0, porDia: serie(analytics.remove?.dates) },
          cliques: { total: analytics.clicks?.total ?? 0, porDia: serie(analytics.clicks?.dates) },
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
});
