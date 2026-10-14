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
  /** Chaves mal coladas — nada foi enviado e tentar de novo não resolve. */
  erroDeConfiguracao?: string;
  /**
   * O serviço de push recusou a assinatura (403). Quase sempre é a pública de
   * um par com a privada de outro, ou chave trocada depois das inscrições.
   */
  chavesNaoBatem?: boolean;
}

/** Sem o par de chaves a feature está desligada — não é erro, é configuração. */
export function pushConfigurado(config: FastifyInstance["config"]): boolean {
  return Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
}

/**
 * Limpa o que o copiar-e-colar costuma trazer junto.
 *
 * Espaço em volta e aspas são o erro mais comum ao colar variável de ambiente
 * em painel, e a biblioteca rejeita os dois com "must be a URL safe Base 64" —
 * mensagem que não aponta para a causa.
 */
function limpar(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * O `subject` precisa ser uma URL ou um `mailto:`, e um e-mail cru faz a
 * biblioteca LANÇAR. Como a intenção de quem escreve só o e-mail é
 * inequívoca, o prefixo entra aqui em vez de virar erro de servidor.
 */
function assunto(v: string | undefined): string {
  const limpo = limpar(v);
  if (!limpo) return "mailto:contato@loyoladigital.com";
  if (/^(mailto:|https?:\/\/)/i.test(limpo)) return limpo;
  return limpo.includes("@") ? `mailto:${limpo}` : limpo;
}

/**
 * O que já foi aplicado. Guardar o VALOR, e não um booleano, importa: com a
 * flag, uma configuração boa grudava no processo e uma troca de chave nunca
 * era reavaliada — inclusive uma troca para chave quebrada.
 */
let aplicada: string | null = null;

/**
 * Aplica as chaves. Devolve o motivo em vez de lançar: chave mal colada é erro
 * de CONFIGURAÇÃO, e virava 500 "Erro interno do servidor" na cara de quem só
 * queria testar a notificação.
 *
 * Atenção ao que isto NÃO pega: chave com um caractere trocado, ou a pública
 * de um par com a privada de outro, passam aqui sem reclamar — nos dois casos
 * o formato continua válido e quem recusa é o serviço de push, no envio, com
 * 403.
 */
export function configurarVapid(
  config: FastifyInstance["config"],
): { ok: true } | { ok: false; motivo: string } {
  const subject = assunto(config.VAPID_SUBJECT);
  const pub = limpar(config.VAPID_PUBLIC_KEY);
  const priv = limpar(config.VAPID_PRIVATE_KEY);
  const assinatura = `${subject}|${pub}|${priv}`;
  if (aplicada === assinatura) return { ok: true };
  try {
    webpush.setVapidDetails(subject, pub, priv);
    aplicada = assinatura;
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
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
  const vapid = configurarVapid(fastify.config);
  if (!vapid.ok) {
    fastify.log.error({ motivo: vapid.motivo }, "[push] chaves VAPID inválidas");
    return { ...vazio, erroDeConfiguracao: vapid.motivo };
  }

  const inscricoes = await fastify.db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (inscricoes.length === 0) return vazio;

  const corpo = JSON.stringify(payload);
  const mortas: string[] = [];
  let enviados = 0;
  let falhas = 0;
  let naoBatem = false;

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
    if (status === 403) naoBatem = true;
    falhas += 1;
    fastify.log.warn(
      { err: r.reason, status, endpoint: inscricoes[idx].endpoint },
      "[push] envio falhou",
    );
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

  return { enviados, removidos: mortas.length, falhas, ...(naoBatem ? { chavesNaoBatem: true } : {}) };
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
