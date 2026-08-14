import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, funnelStages, vturbConnections, vturbPlayers } from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { sessionStats } from "../services/vturb.js";
import { derivarCadeia, ProtocolViolation, type TaxaMedida } from "../services/vturb-chain.js";

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

/** O que a resposta expõe por taxa. Nunca só o valor — ver AC2. */
interface TaxaPublica {
  /** Fração em [0,1]. `null` quando não há medição. */
  valor: number | null;
  /** Preenchido só quando `valor` é `null`. */
  motivo?: string;
  /** Os brutos que produziram a taxa. Sem eles, ninguém confere. */
  numerador: number;
  denominador: number;
}

function taxaPublica(t: TaxaMedida): TaxaPublica {
  return {
    valor: t.valor,
    ...(t.motivo ? { motivo: t.motivo } : {}),
    numerador: t.numerador,
    denominador: t.denominador,
  };
}

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
      const etapas: unknown[] = [];
      const avisos: { stageId: string; motivo: string }[] = [];

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
          const cadeia = derivarCadeia(stats, p.pitchTime && p.pitchTime > 0 ? p.pitchTime : null);

          etapas.push({
            stageId: p.stageId,
            stageName: p.stageName,
            playerId: p.playerId,
            playerName: p.playerName,
            playRate: taxaPublica(cadeia.playRate),
            pitchRate: taxaPublica(cadeia.pitchRate),
            // AC3 — SEMPRE null. O numerador (checkouts iniciados) vem de outro
            // sistema e é manual. `total_clicked_device_uniq` NÃO serve de
            // proxy: clicar no CTA e iniciar checkout diferem por tudo que
            // acontece entre os dois. Número plausível e errado é pior que
            // ausência declarada.
            convPostPitch: null,
            convPostPitchDenominador: cadeia.convPostPitchDenominador,
            convPostPitchNota:
              "numerador (checkouts iniciados) vem de outro sistema e não é automatizado",
          });
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
