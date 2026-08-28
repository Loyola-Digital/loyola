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

/**
 * Prefixo da pasta da campanha: "dg-pg04-jul-26" → "DG-PG04".
 *
 * O `matchCode` do funil, quando existe, MANDA. Ele é o identificador que o
 * time já declarou para aquele funil — e a regra automática, de dois
 * segmentos, colide no perpétuo: `bbe-fc1-a2-ago-26` e `bbe-fc1-mai-26` viram
 * os dois "BBE-FC1", disputando a mesma pasta.
 *
 * Pior que disputar: a busca no Drive é por CONTÉM e desempata pelo nome mais
 * curto, então "BBE-FC1" acha "BBE-FC1-A1" e "BBE-FC1-A2" e escolhe uma delas
 * sem critério nenhum ligado ao funil que perguntou. A galeria mostraria os
 * criativos do funil errado — com cara de estar certa.
 */
function prefixoDaCampanha(nomeDoFunil: string, matchCode?: string | null): string {
  const declarado = matchCode?.trim();
  if (declarado) return declarado.toUpperCase();
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
  const pastas = new Map<string, { lista: { id: string; nome: string; editada: boolean }[]; expira: number }>();
  const TTL_MS = 30 * 60 * 1000;

  async function contexto(p: z.infer<typeof stageParam>) {
    const [ctx] = await fastify.db
      .select({
        projeto: projects.name,
        funil: funnels.name,
        matchCode: funnels.matchCode,
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

  async function pastasDe(
    ctx: { projeto: string; funil: string; matchCode: string | null; stageType: string },
    tipo: TipoDeCriativo,
  ): Promise<{ id: string; nome: string; editada: boolean }[]> {
    // O matchCode entra na chave: mudá-lo muda a pasta procurada, e o cache
    // continuaria servindo a antiga por até 30 min.
    const chave = `${ctx.funil}|${ctx.matchCode ?? ""}|${tipo}|${ctx.stageType}`;
    const guardado = pastas.get(chave);
    if (guardado && guardado.expira > Date.now()) return guardado.lista;

    const r = await resolverPastaDeCriativos({
      drive: driveDoProjeto(ctx.projeto, ctx.funil),
      campanha: prefixoDaCampanha(ctx.funil, ctx.matchCode),
      // Se o matchCode não nomear a pasta da campanha, cai no prefixo do nome.
      alternativos: [prefixoDaCampanha(ctx.funil)],
      tipo,
      etapa: etapaDaPasta(ctx.stageType),
    });
    // Cacheia o negativo também: sem isso, funil sem pasta refaz seis chamadas
    // ao Drive a cada anúncio da galeria.
    pastas.set(chave, { lista: r.pastas, expira: Date.now() + TTL_MS });
    return r.pastas;
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
        const porNome: Record<
          string,
          { url: string; view: string | null; tipo: TipoDeCriativo; pasta: string; editada: boolean }
        > = {};
        for (const tipo of ["video", "estatico"] as TipoDeCriativo[]) {
          const daEtapa = await pastasDe(ctx, tipo);
          // Em paralelo: a varredura passou a devolver a subárvore inteira da
          // etapa (uma dúzia de pastas, não meia), e em série isso somaria a
          // latência do Drive uma vez por pasta a cada abertura da galeria.
          const conteudos = await Promise.all(
            daEtapa.map((p) => criativosDaPasta(p.id).catch(() => [])),
          );
          for (const [i, p] of daEtapa.entries()) {
          for (const f of conteudos[i]) {
            // `thumbnailLink` expira, então isto é resposta de request — nunca
            // vai pro banco.
            if (!f.thumbnailLink) continue;
            // Mesmo nome em duas pastas: a EDITADA não pode ser sobrescrita.
            const jaTem = porNome[f.name];
            if (jaTem?.editada && !p.editada) continue;
            // `pasta` sai na resposta pra tela poder dizer DE ONDE veio o
            // arquivo — sem isso, "carregou o errado" vira investigação longa.
            porNome[f.name] = {
              url: f.thumbnailLink,
              view: f.webViewLink ?? null,
              tipo,
              pasta: p.nome,
              editada: p.editada,
            };
          }
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
      const campanha = prefixoDaCampanha(ctx.funil, ctx.matchCode);
      const alternativos = [prefixoDaCampanha(ctx.funil)];
      const etapa = etapaDaPasta(ctx.stageType);

      let visiveis: string[] = [];
      try {
        visiveis = (await drivesCompartilhados()).map((d) => d.name);
      } catch {
        visiveis = [];
      }

      const [video, estatico] = await Promise.all([
        resolverPastaDeCriativos({ drive, campanha, alternativos, tipo: "video", etapa }),
        resolverPastaDeCriativos({ drive, campanha, alternativos, tipo: "estatico", etapa }),
      ]);

      const arquivos: { tipo: string; nomes: string[] }[] = [];
      for (const [tipo, r] of [["video", video], ["estatico", estatico]] as const) {
        const nomes: string[] = [];
        for (const p of r.pastas) {
          try {
            nomes.push(...(await criativosDaPasta(p.id)).map((f) => `${p.nome} / ${f.name}`));
          } catch {
            /* pasta some entre a resolução e a listagem: ignora */
          }
        }
        if (nomes.length) arquivos.push({ tipo, nomes: nomes.slice(0, 40) });
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
        for (const p of await pastasDe(ctx, tipo)) {
        const achado = acharCriativo(await criativosDaPasta(p.id), q.data.ad);
        if (achado) {
          return {
            casou: true,
            tipo,
            pasta: p.nome,
            editada: p.editada,
            arquivo: achado.name,
            url: achado.thumbnailLink ?? null,
            view: achado.webViewLink ?? null,
          };
        }
        }
      }
      return { casou: false };
    },
  );
});
