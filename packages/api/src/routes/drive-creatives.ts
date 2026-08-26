/**
 * Criativos do Drive para a galeria de anúncios.
 *
 * A resolução é 100% por convenção — nada de configurar pasta por campanha. O
 * que muda entre um funil e outro sai do próprio nome do funil e do tipo da
 * etapa.
 *
 * A rota de diagnóstico existe porque a árvore tem seis níveis: quando não acha
 * o criativo, a diferença entre "a conta não tem acesso ao drive", "a pasta da
 * campanha tem outro nome" e "o anúncio não foi subido" é tudo — e sem isso
 * alguém perde a tarde adivinhando qual dos três é.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelStages, funnels, projects } from "../db/schema.js";
import {
  acharCriativo,
  criativosDaPasta,
  drivesCompartilhados,
  emailDaContaDeServico,
  resolverPastaDeCriativos,
  type EtapaDoCriativo,
  type TipoDeCriativo,
} from "../services/drive-creatives.js";

const stageParam = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

/**
 * Drive do expert a partir do nome do projeto.
 *
 * O padrão dos drives é "{SIGLA} | GERAL" (DG, BBE, PP, MFB) — menos Loyola,
 * que é só "Loyola". Casamos pela sigla, e o resolvedor faz o resto por
 * prefixo, então "DG" acha "DG | GERAL" sem precisar da grafia exata.
 */
function driveDoProjeto(nomeDoProjeto: string, nomeDoFunil: string): string {
  const doFunil = nomeDoFunil.trim().split("-")[0];
  if (doFunil && doFunil.length <= 4) return doFunil.toUpperCase();
  return nomeDoProjeto.trim().split(/[\s|]/)[0].toUpperCase();
}

/** Prefixo da pasta da campanha: "dg-pg04-jul-26" → "DG-PG04". */
function prefixoDaCampanha(nomeDoFunil: string): string {
  const segs = nomeDoFunil.trim().split("-").filter(Boolean);
  return (segs.length >= 2 ? `${segs[0]}-${segs[1]}` : nomeDoFunil).toUpperCase();
}

/** A etapa vira VENDAS ou CAPTACAO — é como as pastas estão organizadas. */
function etapaDaPasta(stageType: string): EtapaDoCriativo {
  return stageType === "sales" ? "vendas" : "captacao";
}

export default fp(async function driveCreativesRoutes(fastify) {
  /**
   * Cache das pastas resolvidas.
   *
   * Descer seis níveis são seis chamadas ao Drive; sem cache, abrir a galeria
   * com 30 anúncios faria isso 30 vezes. A pasta de uma campanha não muda de
   * lugar, então 30 min é conservador.
   */
  const pastas = new Map<string, { id: string | null; expira: number }>();
  const TTL_MS = 30 * 60 * 1000;

  async function contexto(p: z.infer<typeof stageParam>) {
    const [ctx] = await fastify.db
      .select({
        projeto: projects.name,
        funil: funnels.name,
        stageType: funnelStages.stageType,
      })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .innerJoin(projects, eq(projects.id, funnels.projectId))
      .where(
        and(
          eq(funnelStages.id, p.stageId),
          eq(funnelStages.funnelId, p.funnelId),
          eq(funnels.projectId, p.projectId),
        ),
      )
      .limit(1);
    return ctx ?? null;
  }

  async function pastaDe(
    ctx: { projeto: string; funil: string; stageType: string },
    tipo: TipoDeCriativo,
  ): Promise<string | null> {
    const chave = `${ctx.funil}|${tipo}|${ctx.stageType}`;
    const guardado = pastas.get(chave);
    if (guardado && guardado.expira > Date.now()) return guardado.id;

    const r = await resolverPastaDeCriativos({
      drive: driveDoProjeto(ctx.projeto, ctx.funil),
      campanha: prefixoDaCampanha(ctx.funil),
      tipo,
      etapa: etapaDaPasta(ctx.stageType),
    });
    // Cacheia o negativo também: sem isso, funil sem pasta refaz seis chamadas
    // ao Drive a cada anúncio da galeria.
    pastas.set(chave, { id: r.pastaId, expira: Date.now() + TTL_MS });
    return r.pastaId;
  }

  /**
   * Criativos de uma etapa, indexados pelo nome do anúncio.
   *
   * Devolve o mapa inteiro de uma vez em vez de um endpoint por anúncio: a
   * galeria mostra dezenas, e uma chamada por card viraria dezenas de idas ao
   * Drive por render.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/drive-creatives",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const ctx = await contexto(p.data);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      try {
        const porNome: Record<string, { url: string; view: string | null; tipo: TipoDeCriativo }> = {};
        for (const tipo of ["video", "estatico"] as TipoDeCriativo[]) {
          const pastaId = await pastaDe(ctx, tipo);
          if (!pastaId) continue;
          for (const f of await criativosDaPasta(pastaId)) {
            // `thumbnailLink` expira, então isto é resposta de request — nunca
            // vai pro banco.
            if (!f.thumbnailLink) continue;
            porNome[f.name] = { url: f.thumbnailLink, view: f.webViewLink ?? null, tipo };
          }
        }
        return { criativos: porNome, total: Object.keys(porNome).length };
      } catch (err) {
        fastify.log.warn({ err }, "[drive-creatives] falhou");
        // 200 com lista vazia, não erro: a galeria cai no preview da Meta e a
        // pessoa continua vendo alguma coisa.
        return { criativos: {}, total: 0, indisponivel: true };
      }
    },
  );

  /** Onde a resolução parou — a tela de diagnóstico consome isto. */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/drive-creatives/diagnostico",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const ctx = await contexto(p.data);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const drive = driveDoProjeto(ctx.projeto, ctx.funil);
      const campanha = prefixoDaCampanha(ctx.funil);
      const etapa = etapaDaPasta(ctx.stageType);

      let visiveis: string[] = [];
      try {
        visiveis = (await drivesCompartilhados()).map((d) => d.name);
      } catch {
        visiveis = [];
      }

      const [video, estatico] = await Promise.all([
        resolverPastaDeCriativos({ drive, campanha, tipo: "video", etapa }),
        resolverPastaDeCriativos({ drive, campanha, tipo: "estatico", etapa }),
      ]);

      const arquivos: { tipo: string; nomes: string[] }[] = [];
      for (const [tipo, r] of [["video", video], ["estatico", estatico]] as const) {
        if (!r.pastaId) continue;
        try {
          arquivos.push({ tipo, nomes: (await criativosDaPasta(r.pastaId)).map((f) => f.name).slice(0, 40) });
        } catch {
          /* pasta some entre a resolução e a listagem: ignora */
        }
      }

      return {
        procurando: { drive, campanha, etapa },
        contaDeServico: emailDaContaDeServico(),
        drivesVisiveis: visiveis,
        video,
        estatico,
        arquivos,
      };
    },
  );

  /** Testa o casamento de um nome de anúncio — útil quando a nomenclatura diverge. */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/drive-creatives/casar",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.safeParse(request.params);
      const q = z.object({ ad: z.string().trim().min(1).max(300) }).safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const ctx = await contexto(p.data);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      for (const tipo of ["video", "estatico"] as TipoDeCriativo[]) {
        const pastaId = await pastaDe(ctx, tipo);
        if (!pastaId) continue;
        const achado = acharCriativo(await criativosDaPasta(pastaId), q.data.ad);
        if (achado) {
          return {
            casou: true,
            tipo,
            arquivo: achado.name,
            url: achado.thumbnailLink ?? null,
            view: achado.webViewLink ?? null,
          };
        }
      }
      return { casou: false };
    },
  );
});
