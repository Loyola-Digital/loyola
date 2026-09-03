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
      // O `type` continua `squeeze`: e ele que os mapas ja salvos guardam, e
      // trocar a chave por causa do rotulo apagaria o icone e a cor dos blocos
      // que existem. So o nome muda.
      { type: "squeeze", label: "Pesquisa", icon: "ClipboardList" },
      { type: "blog", label: "Blog Post", icon: "BookOpen" },
    ],
  },
  {
    name: "Conversão",
    color: "#10b981",
    items: [
      { type: "checkout", label: "Checkout", icon: "DollarSign" },
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
      // `pagamento` saiu da paleta: dois itens de nome parecido para a mesma
      // ideia faziam escolher no chute. O tipo continua valendo no
      // `metaDoTipo`, entao os blocos ja desenhados seguem intactos — ele so
      // nao e mais oferecido.
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

/**
 * Tipos que saíram da paleta mas continuam desenhados.
 *
 * Tirar um item da paleta impede que ele seja criado de novo — não apaga o que
 * já está nos mapas. Sem esta tabela, o bloco antigo cairia no genérico e
 * perderia ícone e cor de uma vez, o que parece corrupção do desenho para quem
 * abre o mapa.
 */
const APOSENTADOS: Record<string, { label: string; icon: string; cor: string }> = {
  // Virou `checkout`, que agora carrega o cifrão.
  pagamento: { label: "Pagamento", icon: "DollarSign", cor: "#06b6d4" },
};

/** Metadados de um tipo. Tipo desconhecido não quebra o mapa — vira genérico. */
export function metaDoTipo(type: string): { label: string; icon: string; cor: string } {
  const achado = PORTIPO.get(type);
  if (achado) return { label: achado.tipo.label, icon: achado.tipo.icon, cor: achado.cor };
  return APOSENTADOS[type] ?? { label: type, icon: "Square", cor: "#8b5cf6" };
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
/**
 * Bloco que desenha uma imagem — print de página, criativo, referência.
 *
 * Especial como nota e texto: sem selo de status e sem card de peça do funil.
 * O que ele mostra é a imagem, e uma moldura de bloco por cima disputaria com
 * ela justamente o que se quer ver.
 */
export const TIPO_IMAGEM = "imagem";
/**
 * Documento anexado ao mapa — briefing, contrato, playbook.
 *
 * Especial como a imagem: o que ele mostra é a capa do arquivo, e uma moldura
 * de bloco por cima disputaria com ela.
 */
export const TIPO_PDF = "pdf";

export function ehBlocoLivre(type: string): boolean {
  return (
    type === TIPO_NOTA ||
    type === TIPO_TEXTO ||
    type === TIPO_GENERICO ||
    type === TIPO_IMAGEM ||
    type === TIPO_PDF
  );
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
/**
 * Blocos livres, desenhados com ícone.
 *
 * Eram emoji. Emoji muda de desenho conforme o sistema operacional, não
 * acompanha o tema e destoa do resto da tela, que é toda de ícone de traço —
 * e some no PDF, onde a fonte não tem o glifo.
 *
 * Cada um já nasce com um nome de verdade ("Início", "Decisão"), porque o
 * genérico aqui é a FORMA, não o rótulo: um card escrito "genérico" não
 * informa nada a quem lê o mapa depois.
 */
export const ICONES_GENERICOS: { grupo: string; itens: { icone: string; rotulo: string }[] }[] = [
  {
    grupo: "Fluxo",
    itens: [
      { icone: "Play", rotulo: "Início" },
      { icone: "Pause", rotulo: "Pausa" },
      { icone: "Split", rotulo: "Decisão" },
      { icone: "RefreshCw", rotulo: "Repetição" },
      { icone: "Check", rotulo: "Concluído" },
      { icone: "X", rotulo: "Descartado" },
      { icone: "TriangleAlert", rotulo: "Atenção" },
      { icone: "Target", rotulo: "Objetivo" },
    ],
  },
  {
    grupo: "Canais",
    itens: [
      { icone: "Smartphone", rotulo: "App" },
      { icone: "MessageCircle", rotulo: "WhatsApp" },
      { icone: "Mail", rotulo: "E-mail" },
      { icone: "Phone", rotulo: "Ligação" },
      { icone: "Globe", rotulo: "Site" },
      { icone: "Tv", rotulo: "Anúncio" },
      { icone: "Video", rotulo: "Vídeo" },
      { icone: "Camera", rotulo: "Conteúdo" },
    ],
  },
  {
    grupo: "Pessoas",
    itens: [
      { icone: "User", rotulo: "Lead" },
      { icone: "Users", rotulo: "Público" },
      { icone: "Magnet", rotulo: "Captação" },
      { icone: "Handshake", rotulo: "Fechamento" },
      { icone: "Briefcase", rotulo: "Time" },
      { icone: "GraduationCap", rotulo: "Aluno" },
      { icone: "ShoppingCart", rotulo: "Carrinho" },
      { icone: "DollarSign", rotulo: "Receita" },
    ],
  },
  {
    grupo: "Marcos",
    itens: [
      { icone: "Rocket", rotulo: "Lançamento" },
      { icone: "Flame", rotulo: "Aquecimento" },
      { icone: "Star", rotulo: "Destaque" },
      { icone: "Pin", rotulo: "Marco" },
      { icone: "Brain", rotulo: "Estratégia" },
      { icone: "BarChart3", rotulo: "Métrica" },
      { icone: "Calendar", rotulo: "Data" },
      { icone: "Flag", rotulo: "Meta" },
    ],
  },
];

/** Tamanhos de fonte por hierarquia do bloco de texto. */
export const TAMANHO_DO_ESTILO: Record<string, number> = {
  h1: 32,
  h2: 24,
  h3: 18,
  corpo: 14,
};

/**
 * Tamanho inicial do bloco de imagem.
 *
 * Maior que os demais e em proporção de tela (22:15): o que entra aqui costuma
 * ser print de página, e no tamanho de um bloco comum não daria para ler nada.
 */
export const IMAGEM_LARGURA = 220;
export const IMAGEM_ALTURA = 150;

export const NOTA_LARGURA = 180;
export const NOTA_ALTURA = 140;
export const TEXTO_LARGURA = 260;
export const TEXTO_ALTURA = 60;
