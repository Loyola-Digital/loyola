/**
 * Story 29.36 — as 7 arquiteturas de funil do LOYOLA-X-CAC-PROTOCOL v1.
 *
 * A cadeia de conversão MUDA com a arquitetura. Um funil de WhatsApp tem 6
 * etapas, não 3; um quiz tem etapas que uma VSL não tem. Fixar uma cadeia só
 * produziria CAC subestimado em todo funil que tivesse etapa a mais — e o erro
 * é multiplicativo, então some rápido.
 *
 * Duas regras estruturais que o protocolo impõe e que este arquivo codifica:
 *
 *   CHAIN-01 — o denominador de cada etapa é EXATAMENTE o numerador da
 *   anterior. Duas taxas na mesma base contam a mesma perda duas vezes; um
 *   salto de base faz uma perda inteira desaparecer.
 *
 *   R2 — connect rate NUNCA sai da cadeia, em nenhuma arquitetura. É perda
 *   técnica de infraestrutura (o clique que não virou pageview), não conversão
 *   de formato.
 */

export type FunnelArchitecture =
  | "vsl_direct"
  | "presell_to_vsl"
  | "sales_page"
  | "quiz"
  | "whatsapp_consultivo"
  | "webinar"
  | "email_list";

/** Custo da entrada. EXATAMENTE UM por cadeia — ver ST-06. */
export type EntryCostKind = "CPM" | "CPC" | "CPL";

export interface ChainStage {
  /** Chave estável, usada para persistir o valor manual. */
  key: string;
  label: string;
  /** Semântica das bases — é o que `CHAIN-01` valida. */
  numerator: string;
  denominator: string;
  /**
   * Onde o número é medido. Etapas com `source: "manual"` não têm
   * instrumentação hoje e entram por digitação com proveniência (D9).
   */
  source: "meta" | "analytics" | "manual" | "checkout";
}

export interface FunnelTemplate {
  id: FunnelArchitecture;
  label: string;
  description: string;
  entryCosts: EntryCostKind[];
  stages: ChainStage[];
  /**
   * `BM-01` — só `vsl_direct` e o trecho VSL de `presell_to_vsl` têm benchmark
   * na fonte. Nas demais, teto sai por medição própria (`CEIL-01`): herdar
   * benchmark de VSL para quiz ou WhatsApp é inferência sem dado.
   */
  hasSourceBenchmarks: boolean;
  /**
   * Defeito declarado no próprio protocolo. Quando presente, a UI exige que o
   * gestor escolha uma leitura ANTES de calcular a cadeia — não dá para somar
   * uma etapa que talvez não exista.
   */
  chainDefect?: { description: string; readings: string[] };
}

const CONNECT: ChainStage = {
  key: "connect_rate",
  label: "Connect Rate",
  numerator: "pageviews",
  denominator: "cliques no link",
  source: "analytics",
};

const CHECKOUT: ChainStage = {
  key: "conv_checkout",
  label: "Conv. Checkout",
  numerator: "compras aprovadas",
  denominator: "checkouts iniciados",
  source: "checkout",
};

export const FUNNEL_TEMPLATES: Record<FunnelArchitecture, FunnelTemplate> = {
  vsl_direct: {
    id: "vsl_direct",
    label: "VSL direta",
    description: "Clique cai direto na página com a VSL. É a arquitetura de onde vieram os benchmarks da fonte.",
    entryCosts: ["CPM", "CPC"],
    hasSourceBenchmarks: true,
    stages: [
      CONNECT,
      { key: "play_rate", label: "Play Rate", numerator: "plays únicos", denominator: "pageviews", source: "manual" },
      { key: "pitch_rate", label: "Retenção ao Pitch", numerator: "únicos no pitch", denominator: "plays únicos", source: "manual" },
      { key: "conv_post_pitch", label: "Conv. Pós-Pitch", numerator: "checkouts iniciados", denominator: "únicos no pitch", source: "manual" },
      CHECKOUT,
    ],
  },

  presell_to_vsl: {
    id: "presell_to_vsl",
    label: "Presell → VSL",
    description: "Página intermediária antes da VSL. Vale quando o ganho de play rate supera a perda da etapa extra.",
    entryCosts: ["CPM", "CPC"],
    hasSourceBenchmarks: true,
    stages: [
      { key: "connect_rate", label: "Connect Rate (presell)", numerator: "pageviews da presell", denominator: "cliques no link", source: "analytics" },
      { key: "presell_conv", label: "Conv. Presell", numerator: "cliques para a VSL", denominator: "pageviews da presell", source: "analytics" },
      { key: "vsl_connect", label: "Connect Rate (VSL)", numerator: "pageviews da VSL", denominator: "cliques para a VSL", source: "analytics" },
      { key: "play_rate", label: "Play Rate", numerator: "plays únicos", denominator: "pageviews da VSL", source: "manual" },
      { key: "pitch_rate", label: "Retenção ao Pitch", numerator: "únicos no pitch", denominator: "plays únicos", source: "manual" },
      { key: "conv_post_pitch", label: "Conv. Pós-Pitch", numerator: "checkouts iniciados", denominator: "únicos no pitch", source: "manual" },
      CHECKOUT,
    ],
  },

  sales_page: {
    id: "sales_page",
    label: "Página de vendas (sem vídeo)",
    description: "Página longa de texto. Sem benchmark na fonte — teto por medição própria.",
    entryCosts: ["CPM", "CPC"],
    hasSourceBenchmarks: false,
    chainDefect: {
      description:
        "A cadeia da fonte pula de 'cliques no CTA' para 'compras ÷ checkouts iniciados' — falta a etapa " +
        "que liga uma coisa à outra. Ou o clique no CTA JÁ É o checkout iniciado (e as bases fecham), ou " +
        "há um termo faltando e o CAC sairia subestimado.",
      readings: [
        "O clique no CTA é o próprio checkout iniciado — as bases fecham",
        "São etapas distintas — preciso medir a conversão entre elas",
      ],
    },
    stages: [
      CONNECT,
      { key: "scroll_to_offer", label: "Scroll até a oferta", numerator: "scroll até a oferta", denominator: "pageviews", source: "manual" },
      { key: "cta_click", label: "Clique no CTA", numerator: "cliques no CTA", denominator: "scroll até a oferta", source: "manual" },
      CHECKOUT,
    ],
  },

  quiz: {
    id: "quiz",
    label: "Quiz / pré-qualificador",
    description: "Perguntas antes da oferta. Se cada pergunta é uma rota própria, dá para medir o drop pergunta a pergunta.",
    entryCosts: ["CPM", "CPC"],
    hasSourceBenchmarks: false,
    stages: [
      CONNECT,
      { key: "quiz_start", label: "Início do Quiz", numerator: "iniciaram o quiz", denominator: "pageviews", source: "manual" },
      { key: "quiz_complete", label: "Conclusão do Quiz", numerator: "concluíram o quiz", denominator: "iniciaram o quiz", source: "manual" },
      { key: "result_page_conv", label: "Conv. da Página de Resultado", numerator: "checkouts iniciados", denominator: "concluíram o quiz", source: "manual" },
      CHECKOUT,
    ],
  },

  whatsapp_consultivo: {
    id: "whatsapp_consultivo",
    label: "WhatsApp / consultivo",
    description: "Seis etapas, não três. É a arquitetura onde mais se omite etapa — e cada omissão subestima o CAC.",
    entryCosts: ["CPM", "CPC", "CPL"],
    hasSourceBenchmarks: false,
    stages: [
      CONNECT,
      { key: "conv_lead", label: "Conv. em Lead", numerator: "leads", denominator: "pageviews", source: "analytics" },
      { key: "response_rate", label: "Taxa de Resposta", numerator: "leads que responderam", denominator: "leads", source: "manual" },
      { key: "booking_rate", label: "Taxa de Agendamento", numerator: "agendamentos", denominator: "leads que responderam", source: "manual" },
      { key: "show_rate", label: "Comparecimento", numerator: "comparecimentos", denominator: "agendamentos", source: "manual" },
      { key: "call_conversion", label: "Conv. da Call", numerator: "vendas", denominator: "comparecimentos", source: "manual" },
    ],
  },

  webinar: {
    id: "webinar",
    label: "Webinar / aula ao vivo",
    description: "Inscrição, presença e retenção até o pitch são etapas distintas — tratá-las como uma esconde onde a perda acontece.",
    entryCosts: ["CPM", "CPC", "CPL"],
    hasSourceBenchmarks: false,
    stages: [
      CONNECT,
      { key: "registration", label: "Inscrição", numerator: "inscritos", denominator: "pageviews", source: "analytics" },
      { key: "attendance", label: "Presença", numerator: "presentes", denominator: "inscritos", source: "manual" },
      { key: "retention_to_pitch", label: "Retenção ao Pitch", numerator: "presentes no pitch", denominator: "presentes", source: "manual" },
      { key: "conv_pitch", label: "Conv. do Pitch", numerator: "checkouts iniciados", denominator: "presentes no pitch", source: "manual" },
      CHECKOUT,
    ],
  },

  email_list: {
    id: "email_list",
    label: "Lista / e-mail",
    description: "Atenção à taxa de abertura: é a métrica menos confiável da biblioteca.",
    entryCosts: ["CPM", "CPC", "CPL"],
    hasSourceBenchmarks: false,
    stages: [
      CONNECT,
      { key: "opt_in", label: "Opt-in", numerator: "opt-ins", denominator: "pageviews", source: "analytics" },
      { key: "open_rate", label: "Taxa de Abertura", numerator: "aberturas únicas", denominator: "opt-ins", source: "manual" },
      { key: "click_rate", label: "Taxa de Clique", numerator: "cliques únicos", denominator: "aberturas únicas", source: "manual" },
      { key: "page_conv", label: "Conv. da Página", numerator: "checkouts iniciados", denominator: "cliques únicos", source: "manual" },
      CHECKOUT,
    ],
  },
};

/**
 * Aviso de medição por etapa. Só onde a fonte registra risco conhecido — não
 * inventamos alerta para etapa que ninguém apontou.
 */
export const STAGE_MEASUREMENT_WARNINGS: Record<string, string> = {
  open_rate:
    "Apple Mail Privacy Protection e proxies de imagem inflam aberturas artificialmente. " +
    "Cadeia com abertura inflada produz CAC SUBESTIMADO — declare a política de medição ou trate como não medido.",
  connect_rate:
    "Numerador e denominador vêm de sistemas diferentes (analytics ÷ plataforma de anúncio). " +
    "Descasamento de janela ou fuso entre os dois contamina a taxa sem nenhum problema real de infraestrutura.",
  conv_post_pitch:
    "Numerador (checkout) e denominador (player de vídeo) vêm de sistemas diferentes — mesma ressalva do connect rate.",
};

export function getTemplate(id: FunnelArchitecture): FunnelTemplate {
  return FUNNEL_TEMPLATES[id];
}

/** Etapas que dependem de digitação — as que a instrumentação ainda não cobre. */
export function manualStages(id: FunnelArchitecture): ChainStage[] {
  return FUNNEL_TEMPLATES[id].stages.filter((s) => s.source === "manual");
}
