/**
 * Envio de notificação push (Web Push / VAPID).
 *
 * O servidor não fala com o celular: fala com o serviço de push do navegador
 * (FCM do Google, Mozilla, Apple), que guarda a mensagem e entrega quando o
 * aparelho aparecer. Daí duas consequências que mandam no desenho daqui:
 *
 * 1. **O conteúdo vai criptografado** com as chaves do aparelho (`p256dh`,
 *    `auth`). O serviço de push repassa sem ler — por isso cada inscrição
 *    guarda as chaves dela.
 * 2. **Inscrição morre calada.** App desinstalado, permissão revogada,
 *    aparelho trocado: nada disso chega aqui. A gente só descobre no envio
 *    seguinte, quando o serviço responde 404/410 — e é ali que a linha sai.
 *    Sem isso a tabela vira um cemitério e todo envio fica mais lento.
 */

import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { pushSubscriptions } from "../db/schema.js";

export interface PushPayload {
  titulo: string;
  corpo: string;
  /** Para onde o clique leva (caminho dentro do app). */
  url?: string;
  /**
   * Notificação com a mesma `tag` SUBSTITUI a anterior na bandeja em vez de
   * empilhar. É o que impede o resumo de hoje de ficar ao lado do de ontem.
   */
  tag?: string;
}

export interface ResultadoDoEnvio {
  enviados: number;
  /** Inscrições que o serviço de push recusou como mortas e saíram da tabela. */
  removidos: number;
  falhas: number;
}

/** Sem o par de chaves a feature está desligada — não é erro, é configuração. */
export function pushConfigurado(config: FastifyInstance["config"]): boolean {
  return Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
}

let configurado = false;

function aplicarVapid(config: FastifyInstance["config"]): void {
  if (configurado) return;
  webpush.setVapidDetails(
    config.VAPID_SUBJECT ?? "mailto:contato@loyoladigital.com",
    config.VAPID_PUBLIC_KEY!,
    config.VAPID_PRIVATE_KEY!,
  );
  configurado = true;
}

/**
 * Manda `payload` para todos os aparelhos destes usuários.
 *
 * Nunca lança: um aparelho que falha não pode derrubar o envio dos outros nem
 * o ciclo do agendador que chamou.
 */
export async function enviarPush(
  fastify: FastifyInstance,
  userIds: string[],
  payload: PushPayload,
): Promise<ResultadoDoEnvio> {
  const vazio: ResultadoDoEnvio = { enviados: 0, removidos: 0, falhas: 0 };
  if (userIds.length === 0) return vazio;
  if (!pushConfigurado(fastify.config)) return vazio;
  aplicarVapid(fastify.config);

  const inscricoes = await fastify.db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (inscricoes.length === 0) return vazio;

  const corpo = JSON.stringify(payload);
  const mortas: string[] = [];
  let enviados = 0;
  let falhas = 0;

  const resultados = await Promise.allSettled(
    inscricoes.map((i) =>
      webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        corpo,
        { TTL: 12 * 60 * 60 },
      ),
    ),
  );

  resultados.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      enviados += 1;
      return;
    }
    const status = (r.reason as { statusCode?: number } | undefined)?.statusCode;
    if (status === 404 || status === 410) {
      mortas.push(inscricoes[idx].id);
      return;
    }
    falhas += 1;
    fastify.log.warn({ err: r.reason, endpoint: inscricoes[idx].endpoint }, "[push] envio falhou");
  });

  if (mortas.length > 0) {
    await fastify.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, mortas));
  }
  if (enviados > 0) {
    const vivos = inscricoes.filter((i) => !mortas.includes(i.id)).map((i) => i.id);
    await fastify.db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
      .where(inArray(pushSubscriptions.id, vivos));
  }

  return { enviados, removidos: mortas.length, falhas };
}

/** Apaga uma inscrição pelo endpoint (a pessoa desligou na própria tela). */
export async function removerInscricao(
  fastify: FastifyInstance,
  userId: string,
  endpoint: string,
): Promise<void> {
  await fastify.db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  fastify.log.info({ userId }, "[push] inscrição removida a pedido");
}
