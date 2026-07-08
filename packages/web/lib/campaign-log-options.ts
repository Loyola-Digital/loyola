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
