/**
 * VTurb Analytics — conexão do projeto, vínculo de VSL na etapa e o dashboard.
 *
 * O endpoint `overview` faz UMA chamada e devolve tudo que a aba precisa
 * (números, série diária, curva de retenção, cliques no tempo). Motivo: o VTurb
 * tem rate limit por minuto (60 no plano Basic) e quatro chamadas paralelas do
 * browser, multiplicadas por gente do time abrindo a aba, queimariam a cota.
 * Aqui elas saem em paralelo NO SERVIDOR, uma vez, e o front recebe pronto.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages, vturbConnections, vturbPlayers } from "../db/schema.js";
import { decrypt, encrypt } from "../services/encryption.js";
import {
  VturbError, clicksTimed, listPlayers, quotaUsage, sessionStats, sessionStatsByDay,
  type VturbSessionStats, type VturbStatsByDay,
  userEngagement, validateToken,
} from "../services/vturb.js";
import { ProtocolViolation, derivarCadeia, fonteVturb } from "../services/vturb-chain.js";
import {
  condicaoDoFunilNoProjeto,
  condicaoDosVinculosDoFunil,
  lerTabelaDasVsls,
  pitchDoPainel,
  unirVideosDoFunil,
} from "../services/vturb-tabela.js"; // Story 29.78

const projectParam = z.object({ projectId: z.string().uuid() });
const stageParam = z.object({ projectId: z.string().uuid(), stageId: z.string().uuid() });
const funnelParam = z.object({ projectId: z.string().uuid(), funnelId: z.string().uuid() });

const connectBody = z.object({
  apiToken: z.string().trim().min(10).max(500),
  timezone: z.string().trim().max(60).optional(),
});

const linkBody = z.object({
  playerId: z.string().trim().min(1).max(64),
  playerName: z.string().trim().min(1).max(300),
  duration: z.coerce.number().int().min(0).optional(),
  pitchTime: z.coerce.number().int().min(0).optional(),
});

const rangeQuery = z.object({
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Erro do VTurb → status HTTP correspondente, com a mensagem já em português. */
function replyVturbError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof VturbError) {
    // 401 do VTurb vira 502 pra não confundir com "você não está logado no
    // Loyola X" — o problema é a credencial DELES, não a sessão do usuário.
    const status = err.status === 401 ? 502 : err.status === 429 ? 429 : 502;
    return reply.code(status).send({ error: err.message, code: "VTURB_ERROR" });
  }
  return reply.code(500).send({ error: "Falha ao consultar o VTurb" });
}

export default fp(async function vturbRoutes(fastify) {
  /** Token descriptografado do projeto, ou null se não há conexão. */
  async function tokenFor(projectId: string): Promise<{ token: string; timezone: string } | null> {
    const [conn] = await fastify.db
      .select({
        enc: vturbConnections.apiTokenEncrypted,
        iv: vturbConnections.apiTokenIv,
        timezone: vturbConnections.timezone,
      })
      .from(vturbConnections)
      .where(eq(vturbConnections.projectId, projectId))
      .limit(1);
    if (!conn) return null;
    return { token: decrypt(conn.enc, conn.iv), timezone: conn.timezone };
  }

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  // ---- GET /connection — status da conexão (nunca devolve o token) ----
  fastify.get("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [conn] = await fastify.db
      .select({ timezone: vturbConnections.timezone, createdAt: vturbConnections.createdAt })
      .from(vturbConnections)
      .where(eq(vturbConnections.projectId, p.data.projectId))
      .limit(1);

    return { connected: !!conn, timezone: conn?.timezone ?? null, connectedAt: conn?.createdAt ?? null };
  });

  // ---- PUT /connection — salva/atualiza o token ----
  fastify.put("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    const body = connectBody.safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });

    // Valida ANTES de gravar: token errado salvo silenciosamente vira um
    // dashboard vazio sem explicação depois.
    const check = await validateToken(body.data.apiToken);
    if (!check.ok) return reply.code(400).send({ error: check.error, code: "INVALID_TOKEN" });

    const { encrypted, iv } = encrypt(body.data.apiToken);
    await fastify.db
      .insert(vturbConnections)
      .values({
        projectId: p.data.projectId,
        apiTokenEncrypted: encrypted,
        apiTokenIv: iv,
        timezone: body.data.timezone || "America/Sao_Paulo",
        createdBy: request.userId,
      })
      .onConflictDoUpdate({
        target: vturbConnections.projectId,
        set: {
          apiTokenEncrypted: encrypted,
          apiTokenIv: iv,
          timezone: body.data.timezone || "America/Sao_Paulo",
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  });

  // ---- DELETE /connection ----
  fastify.delete("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db.delete(vturbConnections).where(eq(vturbConnections.projectId, p.data.projectId));
    return { ok: true };
  });

  // ---- GET /players — lista as VSLs da conta (pro picker) ----
  fastify.get("/api/projects/:projectId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const conn = await tokenFor(p.data.projectId);
    if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

    const q = z.object({ name: z.string().trim().max(128).optional() }).safeParse(request.query);
    try {
      const players = await listPlayers(conn.token, {
        name: q.success ? q.data.name : undefined,
        timezone: conn.timezone,
      });
      return { players };
    } catch (err) {
      return replyVturbError(reply, err);
    }
  });

  // ---- GET /quota — quanto sobrou da cota ----
  fastify.get("/api/projects/:projectId/vturb/quota", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const conn = await tokenFor(p.data.projectId);
    if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });
    try {
      return await quotaUsage(conn.token);
    } catch (err) {
      return replyVturbError(reply, err);
    }
  });

  // ---- Vínculo VSL ↔ etapa ----
  fastify.get("/api/projects/:projectId/stages/:stageId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = stageParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const rows = await fastify.db
      .select()
      .from(vturbPlayers)
      .where(eq(vturbPlayers.stageId, p.data.stageId));
    return { players: rows };
  });

  fastify.post("/api/projects/:projectId/stages/:stageId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = stageParam.safeParse(request.params);
    const body = linkBody.safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.id, p.data.stageId))
      .limit(1);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [created] = await fastify.db
      .insert(vturbPlayers)
      .values({
        projectId: p.data.projectId,
        stageId: p.data.stageId,
        playerId: body.data.playerId,
        playerName: body.data.playerName,
        duration: body.data.duration ?? null,
        pitchTime: body.data.pitchTime ?? null,
        createdBy: request.userId,
      })
      .onConflictDoUpdate({
        target: [vturbPlayers.stageId, vturbPlayers.playerId],
        set: {
          playerName: body.data.playerName,
          duration: body.data.duration ?? null,
          pitchTime: body.data.pitchTime ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: vturbPlayers.id });

    return reply.code(201).send(created);
  });

  fastify.delete(
    "/api/projects/:projectId/stages/:stageId/vturb/players/:id",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.extend({ id: z.string().uuid() }).safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      await fastify.db
        .delete(vturbPlayers)
        .where(and(eq(vturbPlayers.id, p.data.id), eq(vturbPlayers.stageId, p.data.stageId)));
      return { ok: true };
    },
  );

  // ---- GET /overview — tudo do dashboard numa chamada ----
  fastify.get(
    "/api/projects/:projectId/stages/:stageId/vturb/players/:id/overview",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.extend({ id: z.string().uuid() }).safeParse(request.params);
      const q = rangeQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const conn = await tokenFor(p.data.projectId);
      if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

      const [link] = await fastify.db
        .select()
        .from(vturbPlayers)
        .where(and(eq(vturbPlayers.id, p.data.id), eq(vturbPlayers.stageId, p.data.stageId)))
        .limit(1);
      if (!link) return reply.code(404).send({ error: "VSL não vinculada a esta etapa" });

      const range = {
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: conn.timezone,
      };
      const base = { ...range, playerId: link.playerId };
      /** O corpo das chamadas que medem o pitch — sempre com o pitch ATUAL (AC12). */
      const comPitchAtual = (pitchTime: number | null) => ({ ...base, videoDuration: link.duration, pitchTime });

      try {
        // Story 29.78 (AC12) — o pitch é o ATUAL do VTurb, de uma `/players/list`
        // (a mesma fonte da tabela das VSLs, AC4), nunca a cópia gravada no
        // vínculo: ela só se regrava num novo vínculo e envelhece em silêncio.
        // Pitch 0 ou ausente → `null`, e o cartão "Chegaram no pitch" diz "—".
        // Falha da lista é falha do painel, como na tabela (AC8): sem o pitch
        // atual não há número honesto para o cartão.
        const pitchAtual = listPlayers(conn.token, { timezone: conn.timezone })
          .then((daConta) => pitchDoPainel(link, daConta).pitchTime);

        // Em paralelo no servidor, uma vez, em vez de uma leva por aba aberta.
        // Só as duas que levam o pitch esperam a lista; a curva e os cliques não
        // dependem dele. A curva de retenção só é pedida quando há duration —
        // sem ele a API não sabe normalizar o eixo e devolveria erro.
        const [pitchTime, stats, byDay, engagement, clicks] = await Promise.all([
          pitchAtual,
          pitchAtual.then((pitch) => sessionStats(conn.token, comPitchAtual(pitch))),
          pitchAtual.then((pitch) => sessionStatsByDay(conn.token, comPitchAtual(pitch))),
          link.duration
            ? userEngagement(conn.token, { ...base, videoDuration: link.duration })
            : Promise.resolve(null),
          clicksTimed(conn.token, base),
        ]);

        // A API do VTurb às vezes devolve o agregado ZERADO enquanto o diário do
        // mesmo período vem cheio — visto em produção com 30 dias: a tela
        // mostrava tudo em 0 e bastava trocar para 7 dias para os números
        // voltarem. Zero é indistinguível de "não houve tráfego", então o time
        // acredita e vai investigar uma queda que não existiu.
        //
        // Os contadores do diário somam EXATAMENTE o agregado quando os dois
        // vêm bons (conferido em 7, 30 e 90 dias), então dá para reconstruir a
        // partir dele em vez de servir o zero.
        /**
         * Os DOIS vazios, com a curva de retenção cheia.
         *
         * É o caso que faltava, e o relato o descreveu sem saber: "Tempo
         * assistido 0:46" ao lado de "Views 0". Os dois não podem ser verdade
         * ao mesmo tempo — se há gente na curva de retenção, houve tráfego.
         *
         * A curva vem de outro endpoint (`user_engagement`) e é a testemunha:
         * quando ela tem usuários e os contadores estão zerados, a resposta
         * está incompleta, não vazia. Sem esta checagem eu concluía "não houve
         * tráfego" e não tentava de novo — a janela de 30 dias ficava zerada
         * enquanto 7 e 90 funcionavam, que foi exatamente o sintoma.
         */
        const houveAudiencia = (engagement?.grouped_timed?.[0]?.total_users ?? 0) > 0;

        let agregado = stats;
        let diarioBruto = byDay;
        if (pareceVazio(agregado) && !temMovimento(diarioBruto) && houveAudiencia) {
          const [s2, d2] = await Promise.all([
            sessionStats(conn.token, comPitchAtual(pitchTime)).catch(() => stats),
            sessionStatsByDay(conn.token, comPitchAtual(pitchTime)).catch(() => byDay),
          ]);
          agregado = s2;
          diarioBruto = d2;
        }

        const statsFinal = pareceVazio(agregado) && temMovimento(diarioBruto)
          ? reconstruirStats(diarioBruto, agregado)
          : agregado;

        /**
         * O caso SIMÉTRICO: o diário vem vazio e o agregado vem cheio.
         *
         * Medido em 2026-09-01 na janela de 30 dias: a PRIMEIRA chamada voltou
         * `byDay: []` com `total_viewed: 7420`; as oito seguintes, todas
         * completas com 32 linhas. É o VTurb computando a janela sob demanda —
         * quem abre a tela numa faixa que ninguém pediu ainda paga a conta e
         * recebe a resposta incompleta.
         *
         * Na tela isso não parecia erro: os totais apareciam certos e TODOS os
         * gráficos ficavam chapados no zero. Trocar para 7 dias e voltar já
         * consertava, o que é a pior forma de bug — some quando se investiga.
         *
         * Uma segunda tentativa basta: na medição, a janela já estava computada
         * na chamada seguinte.
         */
        let diario = diarioBruto;
        let diarioIncompleto = false;
        if (!temMovimento(diario) && !pareceVazio(statsFinal)) {
          diario = await sessionStatsByDay(conn.token, comPitchAtual(pitchTime)).catch(() => diarioBruto);
          // Se nem na segunda veio, a tela precisa DIZER isso. Um gráfico
          // chapado no zero ao lado de um total de 7 mil views faz o time
          // investigar uma queda que não existiu.
          diarioIncompleto = !temMovimento(diario);
        }

        return {
          player: {
            id: link.id,
            playerId: link.playerId,
            name: link.playerName,
            duration: link.duration,
            // AC12 — o ATUAL: é ele que marca o pitch na curva e nos rótulos da
            // tela, e `null` faz o cartão "Chegaram no pitch" dizer "—".
            pitchTime,
          },
          range: { startDate: q.data.startDate, endDate: q.data.endDate, timezone: conn.timezone },
          stats: statsFinal,
          /**
           * Os totais vieram do diário porque o agregado chegou vazio. A tela
           * avisa: as taxas são derivadas dos contadores e podem diferir alguns
           * pontos das que o VTurb calcularia (ele usa bases próprias por
           * sessão/dispositivo).
           */
          // Compara com `agregado`, não com `stats`: a segunda tentativa pode
          // ter trocado o objeto sem que houvesse reconstrução nenhuma, e o
          // aviso diria "os totais foram somados dia a dia" para números que
          // vieram prontos do VTurb.
          statsReconstruidos: statsFinal !== agregado,
          /**
           * O diário veio vazio mesmo com o agregado cheio, nas duas
           * tentativas. Os totais valem; as séries por dia, não.
           */
          diarioIncompleto,
          byDay: diario,
          engagement,
          clicks,
        };
      } catch (err) {
        return replyVturbError(reply, err);
      }
    },
  );

  // ---- GET /funnels/:funnelId/vturb/chain ---- (Story 29.41, AC3/AC4/AC5)
  /**
   * A cadeia de conversão da VSL medida, para a aba Análise MVP do perpétuo.
   *
   * Por que uma rota por FUNIL e não por etapa: a aba MVP raciocina sobre o
   * funil inteiro. O vínculo do player continua sendo por `stage_id` — a
   * medição de 2026-08-06 confirmou que essa âncora já funciona com funil
   * perpétuo real, então não foi preciso tornar `stage_id` anulável nem criar
   * `funnel_id`, que era a alternativa prevista no AC1.
   *
   * UMA chamada ao VTurb por (player, janela). O rate limit é de 60/min no
   * plano Basic, e já derrubou a integração em 2026-07-16 — o cache do React
   * Query no cliente evita repetir a cada render.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/vturb/chain",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = funnelParam.safeParse(request.params);
      const q = rangeQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      // O funil tem que pertencer ao projeto — sem isso, um funnelId de outro
      // projeto leria dados que não são dele.
      const [funnel] = await fastify.db
        .select({ id: funnels.id })
        .from(funnels)
        .where(and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)))
        .limit(1);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado neste projeto" });

      const conn = await tokenFor(p.data.projectId);
      if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

      // Player vinculado a qualquer etapa deste funil. Um por funil (AC1).
      const [link] = await fastify.db
        .select({
          id: vturbPlayers.id,
          playerId: vturbPlayers.playerId,
          playerName: vturbPlayers.playerName,
          duration: vturbPlayers.duration,
          pitchTime: vturbPlayers.pitchTime,
        })
        .from(vturbPlayers)
        .innerJoin(funnelStages, eq(funnelStages.id, vturbPlayers.stageId))
        .where(eq(funnelStages.funnelId, p.data.funnelId))
        .limit(1);
      // 404 aqui não é erro: é o estado normal de um funil sem VSL vinculada.
      // O front usa isso para oferecer o seletor de player.
      if (!link) return reply.code(404).send({ error: "Nenhuma VSL vinculada a este funil", code: "NO_PLAYER" });

      try {
        const stats = await sessionStats(conn.token, {
          playerId: link.playerId,
          startDate: q.data.startDate,
          endDate: q.data.endDate,
          timezone: conn.timezone,
          videoDuration: link.duration,
          pitchTime: link.pitchTime,
        });

        const cadeia = derivarCadeia(stats, link.pitchTime);


        return {
          player: {
            id: link.id,
            playerId: link.playerId,
            name: link.playerName,
            duration: link.duration,
            pitchTime: link.pitchTime,
          },
          cadeia,
          // AC5: proveniência preenchida automaticamente. A janela devolvida é
          // a EFETIVAMENTE enviada à API — não a pedida — para que o AC6 possa
          // comparar com a janela do resto da aba sem depender de confiança.
          proveniencia: {
            source: fonteVturb(link.playerName, link.playerId),
            windowStart: q.data.startDate,
            windowEnd: q.data.endDate,
            timezone: conn.timezone,
          },
          // Brutos no response para o memorial poder mostrar a conta em vez de
          // só o resultado — é o que torna a taxa conferível contra o painel.
          brutos: {
            viewedUniq: stats.total_viewed_device_uniq,
            startedUniq: stats.total_started_device_uniq,
            overPitch: stats.total_over_pitch,
          },
        };
      } catch (err) {
        // Violação de protocolo é defeito de definição, não falha do VTurb —
        // 502 mandaria investigar o lado errado.
        if (err instanceof ProtocolViolation) {
          return reply.code(422).send({ error: err.message, code: "PROTOCOL_VIOLATION" });
        }
        return replyVturbError(reply, err);
      }
    },
  );

  // ---- GET /funnels/:funnelId/vturb/vsls ---- (Story 29.78)
  /**
   * A tabela das VSLs do funil perpétuo: TODOS os vídeos vinculados às etapas
   * do funil, com os brutos de Play Rate e Retenção ao pitch no período.
   *
   * Rota NOVA de propósito: a `/chain` da Análise MVP (29.41) segue igual,
   * com o `.limit(1)` dela (PO-05). Aqui:
   *   - funil sem vídeo → 200 com lista vazia, não 404 (PO-08): o 404 fica
   *     para "a rota não existe" (API antiga), que o front trata como "sem
   *     tabela" — os dois não podem se confundir;
   *   - pitch ATUAL, de uma `/players/list` por leitura (AC4/PO-04);
   *   - uma `sessions/stats` por vídeo, no máximo 3 ao mesmo tempo (AC7);
   *   - falha de um vídeo fica na linha dele; falha da lista de players é
   *     falha geral, com o status do VTurb (AC8).
   * As taxas e o Total nascem no web, dos brutos (`lib/utils/vturb-tabela.ts`).
   * Story 29.82: cada vídeo leva também a `duracao` enviada ao VTurb e os
   * brutos das colunas novas (contrato v37, aditivo).
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/vturb/vsls",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = funnelParam.safeParse(request.params);
      const q = rangeQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [funnel] = await fastify.db
        .select({ id: funnels.id })
        .from(funnels)
        .where(condicaoDoFunilNoProjeto(p.data.projectId, p.data.funnelId))
        .limit(1);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado neste projeto", code: "FUNNEL_NOT_FOUND" });

      const conn = await tokenFor(p.data.projectId);
      if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

      const vinculos = await fastify.db
        .select({ playerId: vturbPlayers.playerId, playerName: vturbPlayers.playerName })
        .from(vturbPlayers)
        .innerJoin(funnelStages, eq(funnelStages.id, vturbPlayers.stageId))
        .where(condicaoDosVinculosDoFunil(p.data.projectId, p.data.funnelId));

      const range = { startDate: q.data.startDate, endDate: q.data.endDate, timezone: conn.timezone };
      try {
        const videos = await lerTabelaDasVsls({
          videos: unirVideosDoFunil(vinculos),
          listarPlayers: () => listPlayers(conn.token, { timezone: conn.timezone }),
          lerStats: (v) =>
            sessionStats(conn.token, {
              playerId: v.playerId,
              startDate: range.startDate,
              endDate: range.endDate,
              timezone: range.timezone,
              videoDuration: v.videoDuration,
              pitchTime: v.pitchTime,
            }),
        });
        // A janela devolvida é a ENVIADA ao VTurb — a tela mostra esta, não a pedida.
        return { funnelId: p.data.funnelId, range, videos };
      } catch (err) {
        return replyVturbError(reply, err);
      }
    },
  );

});

/** O agregado veio sem nenhum sinal de vida? */
export function pareceVazio(s: VturbSessionStats): boolean {
  return (s.total_viewed ?? 0) === 0 && (s.total_started ?? 0) === 0 && (s.total_conversions ?? 0) === 0;
}

/** O diário tem movimento de verdade? */
export function temMovimento(byDay: VturbStatsByDay): boolean {
  return byDay.some((d) => (d.total_viewed ?? 0) > 0);
}

/**
 * Refaz os totais somando o diário.
 *
 * Contadores somam direto — foi conferido que batem número a número com o
 * agregado quando os dois vêm bons. As TAXAS não: o VTurb calcula play rate
 * sobre uma base própria (sessões/dispositivos únicos), e derivar de
 * `plays ÷ views` dá alguns pontos a menos. Ainda assim é o certo aqui: um
 * número coerente com os contadores exibidos vale mais que um zero que mente,
 * e a tela sinaliza que foi reconstruído.
 */
export function reconstruirStats(
  byDay: VturbStatsByDay,
  molde: VturbSessionStats,
): VturbSessionStats {
  const soma = (chave: keyof VturbSessionStats): number =>
    byDay.reduce((acc, d) => acc + (Number(d[chave]) || 0), 0);

  const total_viewed = soma("total_viewed");
  const total_started = soma("total_started");
  const total_over_pitch = soma("total_over_pitch");
  const total_under_pitch = soma("total_under_pitch");
  const total_conversions = soma("total_conversions");

  const taxa = (parte: number, todo: number) => (todo > 0 ? Number(((parte / todo) * 100).toFixed(2)) : 0);

  return {
    ...molde,
    total_viewed,
    total_viewed_device_uniq: soma("total_viewed_device_uniq"),
    total_viewed_session_uniq: soma("total_viewed_session_uniq"),
    total_started,
    total_started_device_uniq: soma("total_started_device_uniq"),
    total_started_session_uniq: soma("total_started_session_uniq"),
    total_finished: soma("total_finished"),
    total_finished_device_uniq: soma("total_finished_device_uniq"),
    total_finished_session_uniq: soma("total_finished_session_uniq"),
    total_clicked: soma("total_clicked"),
    total_clicked_device_uniq: soma("total_clicked_device_uniq"),
    total_clicked_session_uniq: soma("total_clicked_session_uniq"),
    total_over_pitch,
    total_under_pitch,
    total_conversions,
    total_amount_brl: soma("total_amount_brl"),
    total_amount_usd: soma("total_amount_usd"),
    total_amount_eur: soma("total_amount_eur"),
    play_rate: taxa(total_started, total_viewed),
    over_pitch_rate: taxa(total_over_pitch, total_over_pitch + total_under_pitch),
    overall_conversion_rate: taxa(total_conversions, total_viewed),
    // Engajamento é média de tempo, não contagem: a média dos dias com
    // audiência é a aproximação honesta — somar daria número sem significado.
    engagement_rate: (() => {
      const comDados = byDay.filter((d) => (Number(d.total_viewed) || 0) > 0);
      if (comDados.length === 0) return 0;
      const pesoTotal = comDados.reduce((a, d) => a + (Number(d.total_viewed) || 0), 0);
      const ponderada = comDados.reduce(
        (a, d) => a + (Number(d.engagement_rate) || 0) * (Number(d.total_viewed) || 0),
        0,
      );
      return Number((ponderada / pesoTotal).toFixed(2));
    })(),
  };
}
