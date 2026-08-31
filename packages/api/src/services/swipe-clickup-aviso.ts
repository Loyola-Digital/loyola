/**
 * Avisa no ClickUp quando entra referência nova no Swipe Files.
 *
 * ## Por que o aviso existe
 *
 * A biblioteca só cresce se o time souber que ela cresceu. Uma referência boa
 * salva em silêncio é a mesma coisa que uma referência não salva: quem
 * precisava dela não vai lá procurar sem motivo. O canal de referências do
 * ClickUp já é onde o time joga link — o aviso encontra as pessoas onde elas
 * já estão, em vez de pedir que passem a visitar uma tela nova.
 *
 * ## O aviso nunca derruba o cadastro
 *
 * A referência é o que importa; o aviso é consequência. Se o ClickUp estiver
 * fora, a referência entra do mesmo jeito e a falha vira log — trocar uma
 * referência perdida por um aviso entregue seria péssimo negócio.
 */

import { eq } from "drizzle-orm";
import { swipeClickupAlerts } from "../db/schema.js";

/** O que o aviso precisa saber sobre a referência recém-criada. */
export interface ReferenciaNova {
  id: string;
  titulo: string;
  assetKind: "image" | "video" | "pdf" | "link";
  /** Quem subiu — o aviso sem autor não deixa ninguém perguntar nada. */
  autor: string | null;
  notas: string | null;
  marca: string | null;
  nicho: string | null;
  plataforma: string | null;
  formato: string | null;
  tags: string[];
  /** Link do anúncio original, quando houver. */
  origem: string | null;
}

export interface ConfigDoAviso {
  enabled: boolean;
  channelId: string;
  videoChannelId: string | null;
  mentionUsers: { id: string; username: string }[];
}

const ROTULO: Record<ReferenciaNova["assetKind"], string> = {
  image: "🖼️ Imagem",
  video: "🎬 Vídeo",
  pdf: "📄 PDF",
  link: "🔗 Link",
};

/**
 * Onde a mensagem cai.
 *
 * Vídeo tem canal próprio no ClickUp, e mandar vídeo para o canal geral seria
 * ignorar uma separação que o time já fez. Sem canal de vídeo configurado, tudo
 * vai para o padrão: um aviso no canal errado é melhor que aviso nenhum.
 */
export function canalDoAviso(kind: ReferenciaNova["assetKind"], cfg: ConfigDoAviso): string {
  return kind === "video" && cfg.videoChannelId ? cfg.videoChannelId : cfg.channelId;
}

/**
 * A mensagem.
 *
 * Traz o que decide se vale abrir: quem subiu, o que é, e a anotação — que é
 * onde mora o "por que salvamos isto". Campo vazio não vira linha: uma
 * mensagem com quatro "—" empurra o que interessa para fora da tela.
 */
export function montarMensagem(ref: ReferenciaNova, urlDaBiblioteca: string): string {
  const linhas: string[] = [];

  linhas.push(`**Nova referência no Swipe Files** — ${ROTULO[ref.assetKind]}`);
  linhas.push("");
  linhas.push(`**${ref.titulo}**`);

  if (ref.notas) linhas.push(`> ${ref.notas.replace(/\n+/g, " ").slice(0, 400)}`);

  // Os atributos em uma linha só: são etiquetas, não parágrafos.
  const atributos = [
    ref.marca && `marca: ${ref.marca}`,
    ref.nicho && `nicho: ${ref.nicho}`,
    ref.plataforma && `plataforma: ${ref.plataforma}`,
    ref.formato && `formato: ${ref.formato}`,
  ].filter(Boolean);
  if (atributos.length) linhas.push(`\`${atributos.join("\` · \`")}\``);

  if (ref.tags.length) linhas.push(ref.tags.map((t) => `#${t}`).join(" "));

  linhas.push("");
  linhas.push(`[Abrir na biblioteca](${urlDaBiblioteca})`);
  if (ref.origem) linhas.push(`[Ver o anúncio original](${ref.origem})`);
  if (ref.autor) linhas.push(`_por ${ref.autor}_`);

  return linhas.join("\n");
}

type Db = {
  select: (f?: unknown) => {
    from: (t: unknown) => { where: (c: unknown) => { limit: (n: number) => Promise<unknown[]> } };
  };
};

type Fastify = {
  db: Db;
  clickupService: {
    isConfigured(): boolean;
    sendChatMessage(
      channelId: string,
      content: string,
      options?: { followers?: string[]; assignee?: string },
    ): Promise<void>;
  };
  log: { warn: (o: unknown, m: string) => void; info: (o: unknown, m: string) => void };
  config: { CORS_ORIGIN?: string };
};

/** A config salva, ou `null` quando ninguém configurou ainda. */
export async function configDoAviso(db: Db): Promise<ConfigDoAviso | null> {
  const [linha] = (await db
    .select({
      enabled: swipeClickupAlerts.enabled,
      channelId: swipeClickupAlerts.channelId,
      videoChannelId: swipeClickupAlerts.videoChannelId,
      mentionUsers: swipeClickupAlerts.mentionUsers,
    })
    .from(swipeClickupAlerts)
    .where(eq(swipeClickupAlerts.enabled, true))
    .limit(1)) as ConfigDoAviso[];
  return linha ?? null;
}

/**
 * Envia o aviso. Nunca lança.
 *
 * Chamada depois de a referência já estar gravada, e de propósito: o cadastro
 * não espera pelo ClickUp, e a falha do ClickUp não desfaz o cadastro.
 */
export async function avisarNoClickUp(
  fastify: Fastify,
  ref: ReferenciaNova,
): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    if (!fastify.clickupService.isConfigured()) {
      return { enviado: false, motivo: "clickup-nao-configurado" };
    }

    const cfg = await configDoAviso(fastify.db);
    if (!cfg) return { enviado: false, motivo: "aviso-desligado" };

    // `CORS_ORIGIN` é a origem do web — a mesma que o navegador usa. Não há
    // variável dedicada para a URL do app, e inventar uma agora significaria
    // um valor a mais para alguém esquecer de preencher no deploy.
    const base = (fastify.config.CORS_ORIGIN ?? "").split(",")[0]!.trim().replace(/\/+$/, "");
    const url = `${base}/swipe-files`;

    await fastify.clickupService.sendChatMessage(
      canalDoAviso(ref.assetKind, cfg),
      montarMensagem(ref, url),
      {
        // Mensagem ATRIBUÍDA ao primeiro (é o que gera notificação de verdade);
        // os demais entram como followers. A API de chat não faz menção inline.
        assignee: cfg.mentionUsers[0]?.id,
        followers: cfg.mentionUsers.map((u) => u.id),
      },
    );

    fastify.log.info({ swipeFileId: ref.id }, "aviso de referencia enviado ao ClickUp");
    return { enviado: true };
  } catch (erro) {
    // A referência já está salva. Um aviso perdido é irritante; uma referência
    // perdida é trabalho jogado fora.
    fastify.log.warn({ erro, swipeFileId: ref.id }, "falhou o aviso de referencia no ClickUp");
    return { enviado: false, motivo: "falha-no-envio" };
  }
}
