/**
 * Mapa das perguntas da pesquisa Tally (Story 18.6).
 *
 * Cada entrada identifica uma pergunta do form por `matchers` — substrings
 * case-insensitive que precisam estar no header da coluna da planilha pra
 * ser reconhecida. Isso torna o mapeamento resiliente a variações de nomenclatura
 * (ex: "Profissão" vs "Profissão/Ocupação" vs "profissao").
 *
 * `showIn` indica onde a pergunta é exibida:
 * - `"qualification"`: seção "Resultados da Pesquisa" no fim do dash (3.a)
 * - `"top-creative"`: nos cards do Top Criativos (3.b)
 *
 * Abordagem **MVP hardcoded** (aprovada pelo Danilo) — configuração via UI
 * fica pra story futura. Pra adicionar/remover perguntas, editar este arquivo
 * e fazer deploy.
 */
export const SURVEY_QUESTION_MAP = {
  faturamento: {
    matchers: ["faturamento mensal", "faturamento"],
    label: "Faturamento mensal",
    showIn: ["qualification", "top-creative"] as const,
  },
  profissao: {
    matchers: ["profissão", "profissao", "ocupação", "ocupacao"],
    label: "Profissão",
    showIn: ["qualification", "top-creative"] as const,
  },
  funcionarios: {
    matchers: ["funcionários", "funcionarios", "colaboradores", "equipe"],
    label: "Nº de funcionários",
    showIn: ["qualification", "top-creative"] as const,
  },
  voce_e: {
    matchers: ["você é", "voce e", "você e"],
    label: "Você é",
    showIn: ["qualification", "top-creative"] as const,
  },
} as const;

export type SurveyQuestionKey = keyof typeof SURVEY_QUESTION_MAP;

/**
 * Threshold mínimo de respostas dentro do período pra NÃO cair em fallback.
 *
 * Se o `DayRangePicker` estiver em 7d e houver menos de 10 respostas nesse
 * período, o hook usa todas as respostas históricas (sem filtro de data)
 * e mostra badge amarelo. Evita exibir % baseadas em amostra minúscula.
 */
export const SURVEY_FALLBACK_THRESHOLD = 10;

/**
 * Matchers possíveis pra coluna de timestamp (data da resposta).
 * Tally geralmente usa "Submitted at", mas variações são aceitas.
 */
export const SURVEY_TIMESTAMP_MATCHERS = [
  "submitted at",
  "submitted",
  "timestamp",
  "data",
  "date",
  "created at",
];

/**
 * Matchers possíveis pra coluna de utm_content (ad_id do Meta Ads).
 */
export const SURVEY_UTM_CONTENT_MATCHERS = ["utm_content"];

/**
 * Matchers possíveis pra coluna de email (usada em match de leads — Story 18.8).
 */
export const SURVEY_EMAIL_MATCHERS = ["email", "e-mail"];

/**
 * Matchers possíveis pra coluna de phone (usada em match de leads — Story 18.8).
 */
export const SURVEY_PHONE_MATCHERS = ["telefone", "phone", "celular", "whatsapp"];
