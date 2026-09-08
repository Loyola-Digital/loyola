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
 * ## Lote avisa UMA vez
 *
 * Cada referência salva pela tela manda sua mensagem, e é o certo para quem
 * sobe uma de cada vez. Mas subir uma pasta chama a mesma rota sessenta vezes,
 * e sessenta mensagens seguidas no canal não avisam nada: enterram o resto da
 * conversa e o time aprende a ignorar o canal. Quem sobe em lote marca
 * `emLote`, e o resumo sai no fim, em `avisarLoteNoClickUp`.
 *
 * É o mesmo motivo pelo qual a importação do ClickUp não avisa — lá o remédio
 * foi silêncio total, porque as mensagens voltariam como referências na
 * importação seguinte.
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
  assetKind: "image" | "video" | "pdf" | "link" | "html" | "doc";
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
  html: "🧾 Página",
  doc: "📝 Documento",
};

/**
 * Onde a mensagem cai.
 *
 * Vídeo tem canal próprio no ClickUp, e mandar vídeo para o canal geral seria
 * ignorar uma separação que o time já fez. Sem canal de vídeo configurado, tudo
 * vai para o padrão: um aviso no canal errado é melhor que aviso nenhum.
 */
export function canalDoAviso(
  kind: ReferenciaNova["assetKind"],
  cfg: ConfigDoAviso,
): string {
  return kind === "video" && cfg.videoChannelId
    ? cfg.videoChannelId
    : cfg.channelId;
}

/**
 * A mensagem.
 *
 * Traz o que decide se vale abrir: quem subiu, o que é, e a anotação — que é
 * onde mora o "por que salvamos isto". Campo vazio não vira linha: uma
 * mensagem com quatro "—" empurra o que interessa para fora da tela.
 */
export function montarMensagem(
  ref: ReferenciaNova,
  urlDaBiblioteca: string,
): string {
  const linhas: string[] = [];

  linhas.push(`**Nova referência no Swipe Files** — ${ROTULO[ref.assetKind]}`);
  linhas.push("");
  linhas.push(`**${ref.titulo}**`);

  if (ref.notas)
    linhas.push(`> ${ref.notas.replace(/\n+/g, " ").slice(0, 400)}`);

  // Os atributos em uma linha só: são etiquetas, não parágrafos.
  const atributos = [
    ref.marca && `marca: ${ref.marca}`,
    ref.nicho && `nicho: ${ref.nicho}`,
    ref.plataforma && `plataforma: ${ref.plataforma}`,
    ref.formato && `formato: ${ref.formato}`,
  ].filter(Boolean);
  if (atributos.length) linhas.push(`\`${atributos.join("` · `")}\``);

  if (ref.tags.length) linhas.push(ref.tags.map((t) => `#${t}`).join(" "));

  linhas.push("");
  linhas.push(`[Abrir na biblioteca](${urlDaBiblioteca})`);
  if (ref.origem) linhas.push(`[Ver o anúncio original](${ref.origem})`);
  if (ref.autor) linhas.push(`_por ${ref.autor}_`);

  return linhas.join("\n");
}

/** O que o resumo precisa saber. Uma linha por referência criada no lote. */
export interface ItemDoLote {
  titulo: string;
  assetKind: ReferenciaNova["assetKind"];
}

/**
 * Quantos títulos aparecem antes do "e mais N".
 *
 * A contagem por tipo diz o tamanho; os títulos dizem se vale abrir. Cinco
 * cabem sem empurrar o link para fora da tela — sessenta seriam a mesma
 * enxurrada que o lote existe para evitar.
 */
const TITULOS_NA_AMOSTRA = 5;

/**
 * O resumo de um lote.
 *
 * Responde o que alguém quer saber ao ver o canal: quantas entraram, de que
 * tipo, de onde vieram e quem subiu — com um punhado de títulos para dar
 * textura. O que decide se vale abrir é a biblioteca, e o link está aqui.
 */
export function montarMensagemDeLote(
  itens: ItemDoLote[],
  urlDaBiblioteca: string,
  contexto: { autor: string | null; destino: string | null },
): string {
  const linhas: string[] = [];
  const n = itens.length;

  linhas.push(
    `**${n} ${n === 1 ? "referência nova" : "referências novas"} no Swipe Files**`,
  );
  linhas.push("");

  // Contagem por tipo, na ordem em que os tipos apareceram — assim o que o
  // lote mais tem tende a vir primeiro, sem precisar ordenar por frequência.
  const porTipo = new Map<ReferenciaNova["assetKind"], number>();
  for (const i of itens)
    porTipo.set(i.assetKind, (porTipo.get(i.assetKind) ?? 0) + 1);
  linhas.push(
    [...porTipo]
      .map(([kind, quantos]) => `${ROTULO[kind]} ${quantos}`)
      .join(" · "),
  );

  if (contexto.destino) linhas.push(`Em **${contexto.destino}**`);

  const amostra = itens.slice(0, TITULOS_NA_AMOSTRA);
  if (amostra.length) {
    linhas.push("");
    for (const i of amostra) linhas.push(`• ${i.titulo}`);
    const resto = n - amostra.length;
    if (resto > 0) linhas.push(`_e mais ${resto}_`);
  }

  linhas.push("");
  linhas.push(`[Abrir na biblioteca](${urlDaBiblioteca})`);
  if (contexto.autor) linhas.push(`_por ${contexto.autor}_`);

  return linhas.join("\n");
}

/**
 * Onde o resumo cai.
 *
 * Lote só de vídeo respeita o canal de vídeo, porque a separação que o time fez
 * continua valendo. Lote misto vai para o canal geral: dividir em duas
 * mensagens seria justamente o "avisa item a item" de novo, só que menor.
 */
export function canalDoLote(itens: ItemDoLote[], cfg: ConfigDoAviso): string {
  const soVideo =
    itens.length > 0 && itens.every((i) => i.assetKind === "video");
  return soVideo && cfg.videoChannelId ? cfg.videoChannelId : cfg.channelId;
}

type Db = {
  select: (f?: unknown) => {
    from: (t: unknown) => {
      where: (c: unknown) => { limit: (n: number) => Promise<unknown[]> };
    };
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
  log: {
    warn: (o: unknown, m: string) => void;
    info: (o: unknown, m: string) => void;
  };
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
    const base = (fastify.config.CORS_ORIGIN ?? "")
      .split(",")[0]!
      .trim()
      .replace(/\/+$/, "");
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

    fastify.log.info(
      { swipeFileId: ref.id },
      "aviso de referencia enviado ao ClickUp",
    );
    return { enviado: true };
  } catch (erro) {
    // A referência já está salva. Um aviso perdido é irritante; uma referência
    // perdida é trabalho jogado fora.
    fastify.log.warn(
      { erro, swipeFileId: ref.id },
      "falhou o aviso de referencia no ClickUp",
    );
    return { enviado: false, motivo: "falha-no-envio" };
  }
}

/**
 * Envia o resumo do lote. Nunca lança, pelo mesmo motivo do aviso individual.
 *
 * Lote vazio não vira mensagem: uma pasta em que tudo falhou não é notícia de
 * biblioteca, é erro — e quem subiu já viu a lista de falhas na tela.
 */
export async function avisarLoteNoClickUp(
  fastify: Fastify,
  itens: ItemDoLote[],
  contexto: { autor: string | null; destino: string | null },
): Promise<{ enviado: boolean; motivo?: string }> {
  try {
    if (itens.length === 0) return { enviado: false, motivo: "lote-vazio" };
    if (!fastify.clickupService.isConfigured()) {
      return { enviado: false, motivo: "clickup-nao-configurado" };
    }

    const cfg = await configDoAviso(fastify.db);
    if (!cfg) return { enviado: false, motivo: "aviso-desligado" };

    const base = (fastify.config.CORS_ORIGIN ?? "")
      .split(",")[0]!
      .trim()
      .replace(/\/+$/, "");
    const url = `${base}/swipe-files`;

    await fastify.clickupService.sendChatMessage(
      canalDoLote(itens, cfg),
      montarMensagemDeLote(itens, url, contexto),
      {
        assignee: cfg.mentionUsers[0]?.id,
        followers: cfg.mentionUsers.map((u) => u.id),
      },
    );

    fastify.log.info(
      { quantos: itens.length },
      "aviso de lote enviado ao ClickUp",
    );
    return { enviado: true };
  } catch (erro) {
    fastify.log.warn(
      { erro, quantos: itens.length },
      "falhou o aviso de lote no ClickUp",
    );
    return { enviado: false, motivo: "falha-no-envio" };
  }
}
