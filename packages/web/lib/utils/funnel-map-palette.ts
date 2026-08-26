/**
 * Paleta do mapa de funil: o que pode virar bloco e com que cara.
 *
 * As categorias seguem como o time descreve um lançamento — tráfego, páginas,
 * conversão, comunicação, comercial, entrega, conteúdo, remarketing, analytics.
 * A cor é da CATEGORIA, não do bloco: quem olha o mapa de longe precisa
 * distinguir "isto é mídia" de "isto é checkout" sem ler rótulo.
 */

export type StatusBloco = "ativo" | "construcao" | "otimizar" | "pausado";

export interface TipoDeBloco {
  type: string;
  label: string;
  /** Nome do ícone no lucide-react. */
  icon: string;
}

export interface CategoriaDeBloco {
  name: string;
  color: string;
  items: TipoDeBloco[];
}

export const CATEGORIAS: CategoriaDeBloco[] = [
  {
    name: "Tráfego",
    color: "#6366f1",
    items: [
      { type: "meta_ads", label: "Meta Ads", icon: "Facebook" },
      { type: "google_ads", label: "Google Ads", icon: "Search" },
      { type: "tiktok_ads", label: "TikTok Ads", icon: "Video" },
      { type: "youtube_ads", label: "YouTube Ads", icon: "Youtube" },
      { type: "organico", label: "Orgânico", icon: "Leaf" },
    ],
  },
  {
    name: "Páginas",
    color: "#8b5cf6",
    items: [
      { type: "landing_page", label: "Landing Page", icon: "Layout" },
      { type: "captura", label: "Página de Captura", icon: "UserPlus" },
      { type: "vsl", label: "VSL", icon: "Play" },
      { type: "squeeze", label: "Squeeze Page", icon: "Minimize2" },
      { type: "blog", label: "Blog Post", icon: "BookOpen" },
    ],
  },
  {
    name: "Conversão",
    color: "#10b981",
    items: [
      { type: "checkout", label: "Checkout", icon: "CreditCard" },
      { type: "upsell", label: "Upsell", icon: "TrendingUp" },
      { type: "downsell", label: "Downsell", icon: "TrendingDown" },
      { type: "order_bump", label: "Order Bump", icon: "Plus" },
      { type: "obrigado", label: "Página de Obrigado", icon: "CheckCircle" },
    ],
  },
  {
    name: "Comunicação",
    color: "#f59e0b",
    items: [
      { type: "email", label: "E-mail", icon: "Mail" },
      { type: "whatsapp", label: "WhatsApp", icon: "MessageCircle" },
      { type: "sms", label: "SMS", icon: "Smartphone" },
      { type: "automacao", label: "Automação", icon: "Zap" },
      { type: "sequencia", label: "Sequência", icon: "ListOrdered" },
    ],
  },
  {
    name: "Comercial",
    color: "#ef4444",
    items: [
      { type: "sdr", label: "SDR", icon: "Phone" },
      { type: "closer", label: "Closer", icon: "Target" },
      { type: "reuniao", label: "Reunião", icon: "Calendar" },
      { type: "proposta", label: "Proposta", icon: "FileText" },
      { type: "ligacao", label: "Ligação", icon: "PhoneCall" },
    ],
  },
  {
    name: "Conteúdo",
    color: "#ec4899",
    items: [
      { type: "webinar", label: "Webinar / CPL", icon: "Monitor" },
      { type: "live", label: "Live", icon: "Radio" },
      { type: "conteudo", label: "Conteúdo", icon: "PenTool" },
      { type: "comunidade", label: "Comunidade", icon: "Users" },
    ],
  },
  {
    name: "Entrega",
    color: "#06b6d4",
    items: [
      { type: "pagamento", label: "Pagamento", icon: "DollarSign" },
      { type: "entrega", label: "Entrega", icon: "Package" },
      { type: "membros", label: "Área de Membros", icon: "Lock" },
    ],
  },
  {
    name: "Remarketing",
    color: "#f97316",
    items: [
      { type: "remarketing", label: "Remarketing", icon: "RefreshCw" },
      { type: "retargeting", label: "Retargeting", icon: "Crosshair" },
    ],
  },
  {
    name: "Analytics",
    color: "#64748b",
    items: [
      { type: "analytics", label: "Analytics", icon: "BarChart3" },
      { type: "pixel", label: "Pixel", icon: "Code" },
      { type: "dashboard_bi", label: "Dashboard BI", icon: "PieChart" },
    ],
  },
];

/** Cor e rótulo de cada status. Verde/âmbar/vermelho/cinza é leitura de relance. */
export const STATUS: Record<StatusBloco, { label: string; color: string }> = {
  ativo: { label: "Ativo", color: "#10b981" },
  construcao: { label: "Em construção", color: "#f59e0b" },
  otimizar: { label: "Otimizar", color: "#ef4444" },
  pausado: { label: "Pausado", color: "#6b7280" },
};

const PORTIPO = new Map<string, { tipo: TipoDeBloco; cor: string }>(
  CATEGORIAS.flatMap((c) => c.items.map((i) => [i.type, { tipo: i, cor: c.color }] as const)),
);

/** Metadados de um tipo. Tipo desconhecido não quebra o mapa — vira genérico. */
export function metaDoTipo(type: string): { label: string; icon: string; cor: string } {
  const achado = PORTIPO.get(type);
  if (!achado) return { label: type, icon: "Square", cor: "#8b5cf6" };
  return { label: achado.tipo.label, icon: achado.tipo.icon, cor: achado.cor };
}

export const LARGURA_PADRAO = 160;
export const ALTURA_PADRAO = 80;

// ============================================================
// Blocos livres — nota, texto e genéricos
// ============================================================

/**
 * Tipos que não representam peça do funil: servem pra anotar e organizar.
 *
 * Ficam fora de CATEGORIAS de propósito. `metaDoTipo` cai no genérico pra eles,
 * e o canvas os renderiza com desenho próprio — sem selo de status, sem porta
 * de conexão no caso do texto.
 */
export const TIPO_NOTA = "nota";
export const TIPO_TEXTO = "texto";
export const TIPO_GENERICO = "generico";

export function ehBlocoLivre(type: string): boolean {
  return type === TIPO_NOTA || type === TIPO_TEXTO || type === TIPO_GENERICO;
}

/** Cores das notas adesivas — as mesmas de bloco de papel. */
export const CORES_NOTA = [
  { nome: "Amarelo", cor: "#fde68a" },
  { nome: "Verde", cor: "#bbf7d0" },
  { nome: "Azul", cor: "#bfdbfe" },
  { nome: "Rosa", cor: "#fbcfe8" },
  { nome: "Laranja", cor: "#fed7aa" },
  { nome: "Roxo", cor: "#e9d5ff" },
] as const;

/** Cores para as caixas de elemento (item 8 do feedback). */
export const CORES_BLOCO = [
  { nome: "Índigo", cor: "#6366f1" },
  { nome: "Violeta", cor: "#8b5cf6" },
  { nome: "Verde", cor: "#10b981" },
  { nome: "Âmbar", cor: "#f59e0b" },
  { nome: "Vermelho", cor: "#ef4444" },
  { nome: "Rosa", cor: "#ec4899" },
  { nome: "Ciano", cor: "#06b6d4" },
  { nome: "Cinza", cor: "#6b7280" },
] as const;

/** Emojis dos blocos genéricos, agrupados pelo que o time desenha. */
export const EMOJIS_GENERICOS: { grupo: string; itens: string[] }[] = [
  { grupo: "Fluxo", itens: ["▶️", "⏸️", "🔀", "🔁", "✅", "❌", "⚠️", "🎯"] },
  { grupo: "Canais", itens: ["📱", "💬", "📧", "📞", "🌐", "📺", "🎥", "📸"] },
  { grupo: "Pessoas", itens: ["👤", "👥", "🧲", "🤝", "💼", "🎓", "🛒", "💰"] },
  { grupo: "Marcos", itens: ["🚀", "🔥", "⭐", "📌", "🧠", "📊", "🗓️", "🏁"] },
];

/** Tamanhos de fonte por hierarquia do bloco de texto. */
export const TAMANHO_DO_ESTILO: Record<string, number> = {
  h1: 32,
  h2: 24,
  h3: 18,
  corpo: 14,
};

export const NOTA_LARGURA = 180;
export const NOTA_ALTURA = 140;
export const TEXTO_LARGURA = 260;
export const TEXTO_ALTURA = 60;
