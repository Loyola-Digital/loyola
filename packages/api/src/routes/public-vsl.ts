import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, funnelStages, vturbConnections, vturbPlayers } from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { sessionStats, quotaUsage, listPlayers, VturbError } from "../services/vturb.js";
import {
  lerEtapasDoFeed,
  consultasRestantes,
  quotaComporta,
  PITCH_RATE_BASE,
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
 *
 * Story 29.81 (AC8) — o `pitchRate` passou a ser a Retenção ao pitch "igual o
 * VTurb" (over ÷ (over + under), truncada, pitch ATUAL de `/players/list`), e a
 * resposta declara a base em `pitchRateBase`. O `playRate`, o `convPostPitch*`
 * e UMA linha por vínculo seguem como eram. `derivarCadeia` não mudou: a linha
 * sai de `montarEtapaDoFeed` (`services/vsl-funnel.ts`), que a usa para o resto
 * e troca só o `pitchRate`.
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
        return { projectId, range: { since, until }, conectado: false, pitchRateBase: PITCH_RATE_BASE, etapas: [] };
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
        return { projectId, range: { since, until }, conectado: true, pitchRateBase: PITCH_RATE_BASE, etapas: [] };
      }

      const token = decrypt(conn.enc, conn.iv);

      // QA-33 — uma consulta de quota antes do lote. Sem isto, um projeto perto
      // do limite gastaria o saldo restante para colher N falhas opacas ("não
      // foi possível consultar"), sem ninguém saber que a causa era quota.
      try {
        const restantes = consultasRestantes(await quotaUsage(token));
        // 29.81 (PO-10): + 1 — a `/players/list` do pitch atual também é consulta.
        if (!quotaComporta(restantes, players.length + 1)) {
          fastify.log.warn(
            { projectId, restantes, players: players.length },
            "[43.5] quota do VTurb insuficiente para o funil",
          );
          return {
            projectId,
            range: { since, until },
            conectado: true,
            pitchRateBase: PITCH_RATE_BASE,
            etapas: [],
            avisos: [
              {
                stageId: "*",
                motivo: `quota do VTurb insuficiente: ${restantes} consultas restantes para ${players.length} etapas + a lista de players`,
              },
            ],
          };
        }
      } catch (err) {
        // Falhar ao LER a quota não pode impedir o funil — seguir e deixar que
        // os erros por etapa apareçam, se houver.
        fastify.log.warn({ err, projectId }, "[43.5] não foi possível ler a quota do VTurb");
      }

      // Story 29.81 (AC8, AC3) — o pitch ATUAL de cada vídeo, de UMA
      // `/players/list` (dentro de `lerEtapasDoFeed`). A cópia gravada no
      // vínculo (`vturb_players.pitch_time`) não se atualiza e não vale: é o
      // pitch ENVIADO ao `sessions/stats` que define over e under. Se a lista
      // falhar, a resposta inteira falha com o status do VTurb — nunca a cópia
      // no lugar, nem um feed calado.
      //
      // A montagem — `convPostPitch: null` e, desde a 29.81, o `pitchRate` na
      // base do VTurb — vive em `services/vsl-funnel.ts`, para que o teste
      // exercite a MESMA função que roda aqui (QA-32). Uma linha por vínculo.
      let lidas: Awaited<ReturnType<typeof lerEtapasDoFeed>>;
      try {
        lidas = await lerEtapasDoFeed({
          vinculos: players,
          listarPlayers: () => listPlayers(token, { timezone: conn.timezone }),
          lerStats: (v) =>
            sessionStats(token, {
              playerId: v.playerId,
              // AC6 — datas explícitas. `days=N` produz janela diferente, e a
              // 29.41 mediu essa divergência.
              startDate: since,
              endDate: until,
              timezone: conn.timezone,
              videoDuration: v.videoDuration,
              pitchTime: v.pitchTime,
            }),
        });
      } catch (err) {
        fastify.log.warn({ err, projectId }, "[43.5] falha ao ler o pitch atual (/players/list) do VTurb");
        const status = err instanceof VturbError && err.status === 429 ? 429 : 502;
        return reply.code(status).send({
          error: `não foi possível ler o pitch atual dos vídeos no VTurb: ${err instanceof Error ? err.message : "erro desconhecido"}`,
          code: "VTURB_ERROR",
        });
      }

      const { etapas } = lidas;
      const avisos: { stageId: string; motivo: string }[] = [];
      for (const f of lidas.falhas) {
        fastify.log.warn({ err: f.err, stageId: f.stageId, playerId: f.playerId }, "[43.5] etapa fora do funil de VSL");
        avisos.push({ stageId: f.stageId, motivo: f.motivo });
      }

      return {
        projectId,
        range: { since, until },
        conectado: true,
        pitchRateBase: PITCH_RATE_BASE,
        etapas,
        ...(avisos.length ? { avisos } : {}),
      };
    },
  );
});
