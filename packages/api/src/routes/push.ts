/**
 * Inscrição de aparelhos para notificação push.
 *
 * O navegador é quem cria a inscrição (ele fala com o serviço de push e devolve
 * endpoint + chaves); aqui só guardamos para poder enviar depois. A chave
 * pública VAPID sai por rota, e não por variável `NEXT_PUBLIC_*`, para existir
 * uma fonte só: web e API são deployados em lugares diferentes, e chave
 * divergente dá inscrição que o serviço de push recusa sem explicar.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { pushSubscriptions } from "../db/schema.js";
import { configurarVapid, enviarPush, pushConfigurado, removerInscricao } from "../services/push.js";

const inscricaoSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export default fp(async function pushRoutes(fastify) {
  /**
   * A chave pública que o navegador precisa para criar a inscrição.
   *
   * Vem com o diagnóstico junto: chave mal colada no painel de deploy fazia a
   * tela só dizer "erro interno" na hora de testar, longe da causa.
   */
  fastify.get("/api/push/chave-publica", async () => {
    if (!pushConfigurado(fastify.config)) return { chave: null, configuracao: "ausente" };
    const vapid = configurarVapid(fastify.config);
    return vapid.ok
      ? { chave: (fastify.config.VAPID_PUBLIC_KEY ?? "").trim().replace(/^["']|["']$/g, ""), configuracao: "ok" }
      : { chave: null, configuracao: "invalida", detalhe: vapid.motivo };
  });

  /** Os aparelhos já inscritos deste usuário. */
  fastify.get("/api/push/inscricoes", async (request) => {
    const linhas = await fastify.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, request.userId));
    return {
      inscricoes: linhas.map((l) => ({
        id: l.id,
        endpoint: l.endpoint,
        userAgent: l.userAgent,
        lastSuccessAt: l.lastSuccessAt,
        createdAt: l.createdAt,
      })),
    };
  });

  fastify.post("/api/push/inscricoes", async (request, reply) => {
    if (!pushConfigurado(fastify.config)) {
      return reply
        .code(503)
        .send({ codigo: "PUSH_NAO_CONFIGURADO", error: "O servidor está sem as chaves VAPID." });
    }
    const parsed = inscricaoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INSCRICAO_INVALIDA" });
    const { endpoint, keys } = parsed.data;

    // O endpoint pode já existir em OUTRO usuário: aparelho compartilhado, ou
    // a mesma pessoa em duas contas. Quem inscreveu por último fica com ele —
    // é esse que está logado no aparelho agora.
    await fastify.db
      .insert(pushSubscriptions)
      .values({
        userId: request.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: (request.headers["user-agent"] ?? "").slice(0, 500) || null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: request.userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: (request.headers["user-agent"] ?? "").slice(0, 500) || null,
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  });

  fastify.delete("/api/push/inscricoes", async (request, reply) => {
    const parsed = z.object({ endpoint: z.string().url().max(2000) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "ENDPOINT_INVALIDO" });
    await removerInscricao(fastify, request.userId, parsed.data.endpoint);
    return { ok: true };
  });

  /**
   * Manda uma notificação para a própria pessoa — é como se confere o cano.
   *
   * Cada jeito de falhar tem resposta própria de propósito: aqui é onde se
   * descobre que a configuração está errada, e "Erro interno do servidor" não
   * diz se o problema é a chave, o aparelho ou a rede.
   */
  fastify.post("/api/push/teste", async (request, reply) => {
    if (!pushConfigurado(fastify.config)) {
      return reply.code(503).send({
        codigo: "PUSH_NAO_CONFIGURADO",
        error: "O servidor está sem as chaves VAPID.",
      });
    }
    const resultado = await enviarPush(fastify, [request.userId], {
      titulo: "Loyola X",
      corpo: "Funcionou. É assim que os alertas vão chegar.",
      url: "/settings/notificacoes",
      tag: "teste",
    });
    if (resultado.erroDeConfiguracao) {
      return reply.code(503).send({
        codigo: "VAPID_INVALIDO",
        error: `As chaves VAPID do servidor não são válidas: ${resultado.erroDeConfiguracao}`,
      });
    }
    if (resultado.chavesNaoBatem) {
      return reply.code(503).send({
        codigo: "VAPID_NAO_BATE",
        error:
          "O serviço de push recusou a assinatura: a pública e a privada precisam ser do MESMO par, e trocar o par invalida as inscrições já feitas.",
      });
    }
    if (resultado.enviados === 0) {
      return reply.code(409).send({
        codigo: "NENHUM_APARELHO",
        error: "Nenhum aparelho inscrito nesta conta — ative a notificação neste aparelho primeiro.",
        ...resultado,
      });
    }
    return resultado;
  });
});
