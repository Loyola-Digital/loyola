import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, funnelStages, vturbConnections, vturbPlayers } from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { sessionStats, quotaUsage } from "../services/vturb.js";
import { derivarCadeia, ProtocolViolation } from "../services/vturb-chain.js";
import {
  montarEtapa,
  pitchTimeUtil,
  consultasRestantes,
  quotaComporta,
  type EtapaVsl,
} from "../services/vsl-funnel.js";

/**
 * Story 43.5 — funil de VSL por etapa, no feed público.
 *
 *   GET /api/public/meta/v1/projects/:projectId/vsl-funnel?since=&until=
 *
 * O Slide 20 pede três métricas por etapa: Play rate, Pitch rate e Conversão
 * pós-pitch. **Duas são entregáveis; a terceira não é** — e isso está declarado
 * na resposta em vez de estimado.
 *
 * A cadeia de cálculo não é reimplementada aqui: `derivarCadeia()`
 * (`services/vturb-chain.ts`, Story 29.41) já está pronta e testada. Este
 * arquivo é o caminho dela até o consumidor.
 *
 * Três armadilhas que a 29.41 documentou e que este endpoint respeita:
 *
 *   • as taxas prontas da API do VTurb DIVERGEM dos brutos (8,58 vs 8,639) —
 *     por isso tudo é derivado dos números crus, e eles vão na resposta
 *   • janela por `days=N` ≠ janela por datas explícitas — aqui são datas
 *   • `pitch_time = 0` produz Pitch rate de 100% falso — tratado como ausente
 */

const projectParam = z.object({ projectId: z.string().uuid() });

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const rangeSchema = z.object({
  since: z.string().regex(YMD),
  until: z.string().regex(YMD),
});

export default fp(async function publicVslRoutes(fastify) {
  fastify.get<{ Params: z.infer<typeof projectParam>; Querystring: z.infer<typeof rangeSchema> }>(
    "/api/public/meta/v1/projects/:projectId/vsl-funnel",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = projectParam.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "projectId inválido", code: "BAD_REQUEST" });
      }
      const query = rangeSchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "since e until são obrigatórios (YYYY-MM-DD)",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });
      }

      const { projectId } = params.data;
      const { since, until } = query.data;

      const [projeto] = await fastify.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!projeto) {
        return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });
      }

      // AC4b — projeto SEM conexão e projeto conectado SEM players devolvem a
      // mesma lista vazia e significam coisas opostas: uma pede configurar a
      // integração, a outra pede vincular player. Sem o `conectado`, quem
      // consome não distingue. Não é 404: o projeto existe, falta a integração.
      const [conn] = await fastify.db
        .select({
          enc: vturbConnections.apiTokenEncrypted,
          iv: vturbConnections.apiTokenIv,
          timezone: vturbConnections.timezone,
        })
        .from(vturbConnections)
        .where(eq(vturbConnections.projectId, projectId))
        .limit(1);

      if (!conn) {
        return { projectId, range: { since, until }, conectado: false, etapas: [] };
      }

      const players = await fastify.db
        .select({
          stageId: vturbPlayers.stageId,
          stageName: funnelStages.name,
          playerId: vturbPlayers.playerId,
          playerName: vturbPlayers.playerName,
          duration: vturbPlayers.duration,
          pitchTime: vturbPlayers.pitchTime,
        })
        .from(vturbPlayers)
        .innerJoin(funnelStages, eq(funnelStages.id, vturbPlayers.stageId))
        .where(eq(vturbPlayers.projectId, projectId));

      // AC4 — etapa sem player não vira linha zerada; ela simplesmente não
      // existe aqui. Zero em Play rate se lê como "o vídeo não engaja";
      // ausência se lê como "não há vídeo nesta etapa", que é o fato.
      if (players.length === 0) {
        return { projectId, range: { since, until }, conectado: true, etapas: [] };
      }

      const token = decrypt(conn.enc, conn.iv);
      const etapas: EtapaVsl[] = [];
      const avisos: { stageId: string; motivo: string }[] = [];

      // QA-33 — uma consulta de quota antes do lote. Sem isto, um projeto perto
      // do limite gastaria o saldo restante para colher N falhas opacas ("não
      // foi possível consultar"), sem ninguém saber que a causa era quota.
      try {
        const restantes = consultasRestantes(await quotaUsage(token));
        if (!quotaComporta(restantes, players.length)) {
          fastify.log.warn(
            { projectId, restantes, players: players.length },
            "[43.5] quota do VTurb insuficiente para o funil",
          );
          return {
            projectId,
            range: { since, until },
            conectado: true,
            etapas: [],
            avisos: [
              {
                stageId: "*",
                motivo: `quota do VTurb insuficiente: ${restantes} consultas restantes para ${players.length} etapas`,
              },
            ],
          };
        }
      } catch (err) {
        // Falhar ao LER a quota não pode impedir o funil — seguir e deixar que
        // os erros por etapa apareçam, se houver.
        fastify.log.warn({ err, projectId }, "[43.5] não foi possível ler a quota do VTurb");
      }

      for (const p of players) {
        try {
          const stats = await sessionStats(token, {
            playerId: p.playerId,
            // AC6 — datas explícitas. `days=N` produz janela diferente, e a
            // 29.41 mediu essa divergência.
            startDate: since,
            endDate: until,
            timezone: conn.timezone,
            videoDuration: p.duration,
            pitchTime: p.pitchTime,
          });

          // AC5 — `pitch_time` ausente OU zero: `derivarCadeia` já devolve
          // `pitchRate` com `valor: null` e o motivo, preservando o `playRate`.
          // Zero aqui produziria 100% falso (medido na 29.41).
          const cadeia = derivarCadeia(stats, pitchTimeUtil(p.pitchTime));

          // A montagem — inclusive a decisão de `convPostPitch: null` — vive em
          // `services/vsl-funnel.ts`, para que o teste exercite a MESMA função
          // que roda aqui. Ver QA-32.
          etapas.push(
            montarEtapa(
              {
                stageId: p.stageId,
                stageName: p.stageName,
                playerId: p.playerId,
                playerName: p.playerName,
              },
              cadeia,
            ),
          );
        } catch (err) {
          // `derivarCadeia` ABORTA em taxa fora de [0,1] em vez de degradar
          // (vturb-chain.ts:61-65) — uma etapa com dado inconsistente não pode
          // derrubar a resposta inteira. A etapa sai da lista e o motivo fica
          // visível em `avisos`.
          const motivo =
            err instanceof ProtocolViolation
              ? `dado inconsistente do VTurb: ${err.message}`
              : "não foi possível consultar o VTurb para esta etapa";
          fastify.log.warn({ err, stageId: p.stageId, playerId: p.playerId }, "[43.5] etapa fora do funil de VSL");
          avisos.push({ stageId: p.stageId, motivo });
        }
      }

      return {
        projectId,
        range: { since, until },
        conectado: true,
        etapas,
        ...(avisos.length ? { avisos } : {}),
      };
    },
  );
});
