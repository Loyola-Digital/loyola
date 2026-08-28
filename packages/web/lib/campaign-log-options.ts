// Epic 38 / Story 38.1 — vocabulários do Log de Campanha.
// Espelham os dropdowns da planilha manual que o log substitui. São constantes
// do web de propósito (não vivem em @loyola-x/shared — ver memória
// web-shared-type-only): o banco grava texto livre, então adicionar/renomear
// opção aqui NÃO exige migration. "Outro" habilita texto livre na UI.

export const LOG_EVENTOS = [
  "Disparo de e-mail",
  "Disparo de mensagem de WhatsApp",
  "Disparo de SMS / ligação",
  "Publicação em rede-social",
  "Transmissão ao-vivo",
  "Atualização de perfil / conta",
  "Ação no gerenciador de anúncios",
  "Ação em automação",
  "Atualização de página",
  "Outro",
] as const;

export const LOG_APLICATIVOS = [
  "ActiveCampaign",
  "Letalk",
  "Z-API",
  "Devzapp",
  "Manychat",
  "Ligueleads",
  "Instagram",
  "YouTube",
  "Facebook",
  "TikTok",
  "Threads",
  "X",
  "LinkedIn",
  "Pinterest",
  "Make",
  "N8N",
  "Meta Ads",
  "Google Ads",
  "Tally",
  "Google Forms",
  "Calendly",
  "Zoom",
  "Google Meet",
  "StreamYard",
  "Hotmart",
  "Kiwify",
  "Wordpress",
  "Hospedagem",
  "Domínio",
  "Webflow",
  "Mautic",
  "Chatwoot",
  "SendFlow",
  "Outro",
] as const;

export const LOG_CATEGORIAS = [
  "Campanha",
  "Privado (X1)",
  "Grupo",
  "Canal (WPP)",
  "SMS",
  "Ligação",
  "Feed",
  "Carrossel",
  "Story",
  "Sequência",
  "Vídeo",
  "Reel",
  "Short",
  "Thread",
  "Live",
  "Edição de Bio",
  "Edição de Link da Bio",
  "Edição de Descrição",
  "Edição de Foto de Perfil",
  "Edição de Legenda",
  "Edição de Capa",
  "Edição de Thumbnail",
  "Campanha Ligada",
  "Campanha Desligada",
  "Ajuste de Budget",
  "Ajuste de Público",
  "Publicação de Criativos",
  "Automação Ligada",
  "Automação Desligada",
  "Automação Editada",
  "Edição de Web-Design",
  "Edição de Texto",
  "Edição de Infra",
  "Outro",
] as const;

/** Cor do badge por tipo de Evento (fallback: neutro). */
export function eventoBadgeClass(evento: string): string {
  if (evento.startsWith("Disparo de e-mail"))
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400";
  if (evento.startsWith("Disparo de mensagem"))
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (evento.startsWith("Disparo de SMS"))
    return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
  if (evento.startsWith("Publicação"))
    return "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400";
  if (evento.startsWith("Transmissão"))
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (evento.startsWith("Ação no gerenciador"))
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (evento.startsWith("Ação em automação"))
    return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
  return "bg-muted text-muted-foreground";
}

// ============================================================
// Segmentação — o que faz sentido para cada evento
// ============================================================
//
// As listas acima têm 34 aplicativos e 34 categorias. Escolhido o evento, quase
// tudo ali é ruído: quem registra uma "Ação no gerenciador de anúncios" não vai
// marcar categoria "Story" nem aplicativo "Calendly". Procurar cinco opções
// úteis no meio de trinta e quatro é o trabalho que estas tabelas eliminam.
//
// O agrupamento resolve o outro lado do mesmo problema: sem evento escolhido, a
// lista inteira continua disponível — mas em blocos com nome, não num paredão
// alfabético.

/** Blocos dos aplicativos. A ordem aqui é a ordem no menu. */
export const GRUPOS_DE_APLICATIVOS: { grupo: string; itens: string[] }[] = [
  { grupo: "Anúncios", itens: ["Meta Ads", "Google Ads"] },
  { grupo: "E-mail e CRM", itens: ["ActiveCampaign", "Mautic"] },
  {
    grupo: "WhatsApp e mensageria",
    itens: ["SendFlow", "Letalk", "Z-API", "Devzapp", "Manychat", "Ligueleads", "Chatwoot"],
  },
  {
    grupo: "Redes sociais",
    itens: ["Instagram", "YouTube", "Facebook", "TikTok", "Threads", "X", "LinkedIn", "Pinterest"],
  },
  { grupo: "Automação", itens: ["Make", "N8N"] },
  { grupo: "Formulários e agenda", itens: ["Tally", "Google Forms", "Calendly"] },
  { grupo: "Ao vivo", itens: ["Zoom", "Google Meet", "StreamYard"] },
  { grupo: "Checkout", itens: ["Hotmart", "Kiwify"] },
  { grupo: "Site e infra", itens: ["Wordpress", "Webflow", "Hospedagem", "Domínio"] },
];

/** Blocos das categorias. */
export const GRUPOS_DE_CATEGORIAS: { grupo: string; itens: string[] }[] = [
  {
    grupo: "Anúncios",
    itens: [
      "Campanha Ligada",
      "Campanha Desligada",
      "Ajuste de Budget",
      "Ajuste de Público",
      "Publicação de Criativos",
    ],
  },
  {
    grupo: "Disparos",
    itens: ["Campanha", "Sequência", "Privado (X1)", "Grupo", "Canal (WPP)", "SMS", "Ligação"],
  },
  {
    grupo: "Conteúdo",
    itens: ["Feed", "Carrossel", "Story", "Vídeo", "Reel", "Short", "Thread", "Live"],
  },
  {
    grupo: "Perfil",
    itens: [
      "Edição de Bio",
      "Edição de Link da Bio",
      "Edição de Descrição",
      "Edição de Foto de Perfil",
      "Edição de Legenda",
      "Edição de Capa",
      "Edição de Thumbnail",
    ],
  },
  { grupo: "Automação", itens: ["Automação Ligada", "Automação Desligada", "Automação Editada"] },
  { grupo: "Página", itens: ["Edição de Web-Design", "Edição de Texto", "Edição de Infra"] },
];

/**
 * Quais blocos sobrevivem a cada evento.
 *
 * Guardado por NOME DE GRUPO, e não por item: quando alguém acrescentar um app
 * de WhatsApp novo à lista, ele já entra segmentado sem ninguém lembrar de
 * mexer aqui — que é o tipo de manutenção esquecida que faz um filtro voltar a
 * mostrar tudo com o tempo.
 */
const POR_EVENTO: Record<string, { apps: string[]; categorias: string[] }> = {
  "Ação no gerenciador de anúncios": { apps: ["Anúncios"], categorias: ["Anúncios"] },
  "Disparo de e-mail": { apps: ["E-mail e CRM"], categorias: ["Disparos"] },
  "Disparo de mensagem de WhatsApp": {
    apps: ["WhatsApp e mensageria"],
    categorias: ["Disparos"],
  },
  "Disparo de SMS / ligação": { apps: ["WhatsApp e mensageria"], categorias: ["Disparos"] },
  "Publicação em rede-social": { apps: ["Redes sociais"], categorias: ["Conteúdo"] },
  "Transmissão ao-vivo": { apps: ["Ao vivo", "Redes sociais"], categorias: ["Conteúdo"] },
  "Atualização de perfil / conta": { apps: ["Redes sociais"], categorias: ["Perfil"] },
  "Ação em automação": {
    apps: ["Automação", "E-mail e CRM", "WhatsApp e mensageria"],
    categorias: ["Automação"],
  },
  "Atualização de página": { apps: ["Site e infra"], categorias: ["Página"] },
};

type Bloco = { grupo: string; itens: string[] };

/**
 * Os blocos que valem para o evento. Sem evento (ou evento fora do mapa), volta
 * tudo — filtro que esconde opção sem a pessoa ter pedido nada é pior que
 * filtro nenhum.
 */
function filtrar(todos: Bloco[], permitidos: string[] | undefined): Bloco[] {
  if (!permitidos) return todos;
  const set = new Set(permitidos);
  return todos.filter((b) => set.has(b.grupo));
}

export function aplicativosParaEvento(evento: string): Bloco[] {
  return filtrar(GRUPOS_DE_APLICATIVOS, POR_EVENTO[evento]?.apps);
}

export function categoriasParaEvento(evento: string): Bloco[] {
  return filtrar(GRUPOS_DE_CATEGORIAS, POR_EVENTO[evento]?.categorias);
}

/** O valor escolhido ainda aparece na lista? Usado para limpar seleção órfã. */
export function valorVisivel(blocos: Bloco[], valor: string): boolean {
  if (!valor) return true;
  return blocos.some((b) => b.itens.includes(valor));
}
