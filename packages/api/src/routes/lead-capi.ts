/**
 * A volta da faixa para o Meta: configuração e envio.
 *
 * O cálculo de quem é de cada faixa é o mesmo que a tela mostra
 * (`classificarLeads`, em `lead-scoring.ts`) — um caminho só, para a tela e o
 * Meta nunca discordarem sobre quem é lead A.
 *
 * Ver `services/meta-capi.ts` para o que sai daqui (hash, nunca PII em claro) e
 * por que o `event_id` é determinístico.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnelSurveys,
  funnels,
  metaAdsAccounts,
  projectMembers,
  projects,
  stageLeadCapi,
  stageLeadCapiEnviados,
  stageLeadScoringSchemas,
  tallyConnections,
} from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import { readSheetData } from "../services/google-sheets.js";
import { respostasDoFormulario } from "../services/tally.js";
import {
  acharColunaDeEmail,
  acharColunaDeNome,
  acharColunaDeTelefone,
} from "../services/colunas-da-pesquisa.js";
import {
  MetaCapiError,
  MAX_POR_LOTE,
  enviarEventos,
  montarLote,
  type LeadParaOMeta,
} from "../services/meta-capi.js";
import {
  classificarLeads,
  resolvePrecomputedBandColumn,
  type LeadScoringSchema,
} from "./lead-scoring.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const configSchema = z.object({
  datasetId: z.string().trim().min(5).max(50),
  metaAccountId: z.string().uuid().nullable().optional(),
  eventName: z.string().trim().min(1).max(60).default("LeadQualificado"),
  bands: z.array(z.string().trim().min(1).max(10)).max(10).default([]),
  testEventCode: z.string().trim().max(40).nullable().optional(),
  ativo: z.boolean().default(false),
});

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export default fp(async function leadCapiRoutes(fastify) {
  async function temAcesso(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") return false;
    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projeto) return false;
    if (userRole === "admin") return true;
    const [membro] = await fastify.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(membro);
  }

  async function etapaExiste(stageId: string, funnelId: string, projectId: string) {
    const [linha] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return Boolean(linha);
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-capi";

  // ---- Configuração --------------------------------------------------------

  fastify.get(base, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [config] = await fastify.db
      .select()
      .from(stageLeadCapi)
      .where(eq(stageLeadCapi.stageId, p.data.stageId))
      .limit(1);

    // As contas de anúncio vão junto: a tela precisa saber de onde pode sair o
    // token, e pedir isso numa segunda chamada só atrasaria a mesma tela.
    const contas = await fastify.db
      .select({ id: metaAdsAccounts.id, nome: metaAdsAccounts.accountName })
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.isActive, true));

    return { config: config ?? null, contas };
  });

  fastify.put(base, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const corpo = configSchema.safeParse(request.body);
    if (!p.success || !corpo.success) {
      return reply.code(400).send({ error: "Dados inválidos", detalhes: corpo.error?.issues });
    }
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    if (!(await etapaExiste(p.data.stageId, p.data.funnelId, p.data.projectId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const valores = {
      datasetId: corpo.data.datasetId,
      metaAccountId: corpo.data.metaAccountId ?? null,
      eventName: corpo.data.eventName,
      bands: corpo.data.bands.map((b) => b.toUpperCase()),
      testEventCode: corpo.data.testEventCode || null,
      ativo: corpo.data.ativo,
      updatedAt: new Date(),
    };

    const [linha] = await fastify.db
      .insert(stageLeadCapi)
      .values({ stageId: p.data.stageId, ...valores })
      .onConflictDoUpdate({ target: stageLeadCapi.stageId, set: valores })
      .returning();

    return linha;
  });

  // ---- Envio ---------------------------------------------------------------

  /**
   * As respostas da etapa, da planilha ou do Tally — a mesma fonte que a tela
   * de scoring usa.
   */
  async function respostas(
    scoring: { tallyFormId: string | null; surveyId: string | null },
    projectId: string,
  ): Promise<{ headers: string[]; rows: string[][] } | null> {
    if (scoring.tallyFormId) {
      const [conexao] = await fastify.db
        .select({ enc: tallyConnections.tokenEncrypted, iv: tallyConnections.tokenIv })
        .from(tallyConnections)
        .where(eq(tallyConnections.projectId, projectId))
        .limit(1);
      if (conexao) {
        const r = await respostasDoFormulario(decrypt(conexao.enc, conexao.iv), scoring.tallyFormId);
        return { headers: r.headers, rows: r.rows };
      }
    }
    if (!scoring.surveyId) return null;
    const [survey] = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(eq(funnelSurveys.id, scoring.surveyId))
      .limit(1);
    if (!survey) return null;
    return readSheetData(survey.spreadsheetId, survey.sheetName);
  }

  /**
   * Manda para o Meta os leads das faixas configuradas que ainda não foram.
   *
   * `simular` devolve a conta sem enviar nada: é como se confere o que vai sair
   * antes de ensinar qualquer coisa ao algoritmo — e o custo de conferir
   * precisa ser zero, senão ninguém confere.
   */
  fastify.post(`${base}/enviar`, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const q = z.object({ simular: z.coerce.boolean().default(false) }).safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [config] = await fastify.db
      .select()
      .from(stageLeadCapi)
      .where(eq(stageLeadCapi.stageId, p.data.stageId))
      .limit(1);
    if (!config) return reply.code(409).send({ error: "Envio ao Meta não configurado nesta etapa." });
    if (config.bands.length === 0) {
      return reply.code(409).send({ error: "Nenhuma faixa escolhida — nada a enviar." });
    }
    if (!config.ativo && !q.data.simular) {
      return reply.code(409).send({ error: "O envio está desligado nesta etapa." });
    }

    const [scoring] = await fastify.db
      .select()
      .from(stageLeadScoringSchemas)
      .where(eq(stageLeadScoringSchemas.stageId, p.data.stageId))
      .limit(1);
    if (!scoring) return reply.code(409).send({ error: "Esta etapa não tem modelo de scoring." });

    const sheet = await respostas(scoring, p.data.projectId);
    if (!sheet) return reply.code(409).send({ error: "Nenhuma fonte de respostas configurada." });

    const schema = scoring.schemaJson as LeadScoringSchema;
    const [survey] = scoring.surveyId
      ? await fastify.db
          .select({ mapping: funnelSurveys.columnMapping })
          .from(funnelSurveys)
          .where(eq(funnelSurveys.id, scoring.surveyId))
          .limit(1)
      : [undefined];

    const classificados = classificarLeads(
      schema,
      sheet,
      resolvePrecomputedBandColumn(schema, survey?.mapping),
    );

    // O identificador sai do cabeçalho, como no resto do app: e-mail, senão
    // telefone. Sem nenhum dos dois o lead não tem como ser casado no Meta, e
    // o relatório conta quantos ficaram de fora.
    const mapeamento = (survey?.mapping ?? {}) as { email?: string; telefone?: string; name?: string };
    const iEmail = acharColunaDeEmail(sheet.headers, mapeamento.email);
    const iTel = acharColunaDeTelefone(sheet.headers, mapeamento.telefone);
    const iNome = acharColunaDeNome(sheet.headers, mapeamento.name);
    const iData = sheet.headers.findIndex((h) => /submitted at|carimbo|timestamp|data/i.test(h));

    const celula = (linha: string[], idx: number) => (idx >= 0 ? (linha[idx] ?? "").trim() : "");

    const leads: LeadParaOMeta[] = [];
    for (const c of classificados) {
      if (!c.faixa) continue;
      const linha = sheet.rows[c.linha] ?? [];
      const email = celula(linha, iEmail);
      const telefone = celula(linha, iTel);
      const chave = email.toLowerCase() || telefone.replace(/\D/g, "") || celula(linha, iNome);
      if (!chave) continue;
      leads.push({
        chave,
        email,
        telefone,
        faixa: c.faixa,
        score: c.score,
        quando: celula(linha, iData) || null,
      });
    }

    const jaForam = await fastify.db
      .select({ h: stageLeadCapiEnviados.leadHash })
      .from(stageLeadCapiEnviados)
      .where(eq(stageLeadCapiEnviados.stageId, p.data.stageId));
    const hashesEnviados = new Set(jaForam.map((x) => x.h));

    const { eventos, chaves, semIdentificador, jaEstavam } = montarLote(leads, {
      stageId: p.data.stageId,
      eventName: config.eventName,
      faixas: config.bands,
      jaEnviados: new Set(
        leads.filter((l) => hashesEnviados.has(hash(l.chave))).map((l) => l.chave),
      ),
    });

    const resumo = {
      candidatos: leads.filter((l) => config.bands.includes(l.faixa.toUpperCase())).length,
      aEnviar: eventos.length,
      jaEnviados: jaEstavam,
      semIdentificador,
      faixas: config.bands,
      evento: config.eventName,
      teste: Boolean(config.testEventCode),
    };

    if (q.data.simular) return { simulado: true, ...resumo };
    if (eventos.length === 0) return { enviado: 0, ...resumo };

    const [conta] = config.metaAccountId
      ? await fastify.db
          .select({ enc: metaAdsAccounts.accessTokenEncrypted, iv: metaAdsAccounts.accessTokenIv })
          .from(metaAdsAccounts)
          .where(eq(metaAdsAccounts.id, config.metaAccountId))
          .limit(1)
      : [undefined];
    if (!conta) {
      return reply.code(409).send({ error: "Escolha a conta de anúncio de onde sai o token." });
    }

    const token = decrypt(conta.enc, conta.iv);
    let enviados = 0;
    let recebidos = 0;
    try {
      // Em lotes: o Meta recusa acima de mil por chamada, e um lançamento
      // grande passa disso com folga.
      for (let i = 0; i < eventos.length; i += MAX_POR_LOTE) {
        const lote = eventos.slice(i, i + MAX_POR_LOTE);
        const r = await enviarEventos(config.datasetId, token, lote, config.testEventCode);
        enviados += r.enviados;
        recebidos += r.recebidos;
      }
    } catch (erro) {
      const msg = erro instanceof MetaCapiError ? erro.message : "Falha ao enviar ao Meta.";
      fastify.log.error({ erro }, "falha no envio ao Meta");
      return reply.code(502).send({ error: msg, ...resumo });
    }

    // Só registra depois que o Meta aceitou — marcar antes faria um lote
    // recusado sumir para sempre, sem ninguém notar que aqueles leads nunca
    // chegaram. As chaves vêm do próprio lote, na ordem dos eventos.
    const porChave = new Map(leads.map((l) => [l.chave, l.faixa.toUpperCase()]));
    if (chaves.length > 0) {
      await fastify.db
        .insert(stageLeadCapiEnviados)
        .values(
          chaves.map((chave) => ({
            stageId: p.data.stageId,
            leadHash: hash(chave),
            faixa: porChave.get(chave) ?? "",
          })),
        )
        .onConflictDoNothing();
    }

    const resultado = { ...resumo, enviados, recebidos };
    await fastify.db
      .update(stageLeadCapi)
      .set({ ultimoEnvioEm: new Date(), ultimoResultado: resultado, updatedAt: new Date() })
      .where(eq(stageLeadCapi.stageId, p.data.stageId));

    return resultado;
  });

  /** Quantos leads já foram, por faixa — o histórico que a tela mostra. */
  fastify.get(`${base}/enviados`, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const linhas = await fastify.db
      .select({ faixa: stageLeadCapiEnviados.faixa })
      .from(stageLeadCapiEnviados)
      .where(eq(stageLeadCapiEnviados.stageId, p.data.stageId));
    const porFaixa = new Map<string, number>();
    for (const l of linhas) porFaixa.set(l.faixa, (porFaixa.get(l.faixa) ?? 0) + 1);
    return {
      total: linhas.length,
      porFaixa: [...porFaixa.entries()].map(([faixa, total]) => ({ faixa, total })),
    };
  });
});
