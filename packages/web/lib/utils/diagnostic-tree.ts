/**
 * Story 29.37 — sintoma → ação, do `diagnostic_tree` do protocolo.
 *
 * Regra de uso, literal na fonte: "aplicar APÓS o ranking, à variável
 * priorizada — não como varredura". Mostrar ação para as sete variáveis ao
 * mesmo tempo devolve o problema ao gestor em vez de resolvê-lo; o valor está
 * em dizer POR ONDE COMEÇAR.
 *
 * No perpétuo isso vale semanas: otimizar uma VSL de 20–30 min exige gravação
 * e edição, não é trocar um criativo. Uma semana de otimização perdida é 25%
 * da meta do mês.
 */

export interface DiagnosticAction {
  /** O que fazer. Toda ação mapeia para um termo da equação. */
  action: string;
  /** Por que essa é a ação, quando o motivo não é óbvio. */
  rationale?: string;
  /** Ganho medido/derivado, quando a fonte fornece. */
  evidence?: string;
}

export const DIAGNOSTIC_TREE: Record<string, DiagnosticAction> = {
  CTR: {
    action:
      "Quebrar o criativo em hook play rate, hook conversion e body retention para achar onde o furo está.",
    rationale:
      "As três são diagnóstico do MESMO criativo, não uma cadeia — hook conversion e body retention " +
      "compartilham a base (reproduções de 3s). Multiplicá-las não significa nada, e inseri-las no " +
      "denominador do CAC duplicaria o que o CTR já captura.",
  },

  connect_rate: {
    action:
      "Subir as páginas em Cloudflare Workers E ativar regras de cache que ignorem a query string e a string de dispositivo.",
    rationale:
      "A segunda metade é a que costuma ser esquecida e sem ela a primeira não entrega nada: todo " +
      "clique de anúncio chega com fbclid e UTMs únicos, então se o cache considera a URL inteira na " +
      "chave, CADA visitante é um cache miss e a página é gerada do zero.",
    evidence:
      "Vita: 93–97% depois da mudança, com custo de hospedagem indo a zero. Loyola hoje em 70–75% — " +
      "queda de CAC entre 19,35% e 27,84% (faixa, nunca ponto médio).",
  },

  play_rate: {
    action: "Trocar a headline da página, ou inserir um pré-qualificador (presell ou quiz) antes da VSL.",
    rationale:
      "Inserir etapa só vale se o ganho de play rate superar a perda que a própria etapa introduz — " +
      "é conta, não intuição: play_novo × presell_conv × vsl_connect > play_antigo.",
  },

  pitch_rate: {
    action:
      "Gargalo na lead → trocar a lead. Ponto específico da curva → trocar aquele trecho. Curva ruim inteira → refazer a VSL.",
  },

  conv_post_pitch: {
    action: "A oferta está fraca. Refazer o fechamento.",
    rationale: "Não é a página nem o botão — é o que está sendo oferecido e como.",
  },

  conv_checkout: {
    action: "Faltou clareza ou urgência NO PITCH — mexer no pitch, não no checkout.",
    rationale:
      "É a exceção mais importante ao critério de posição: conv_checkout é a última etapa da cadeia, " +
      "mas a causa raiz está na anterior. Se a conversão do checkout está baixa, dificilmente é o " +
      "banner ou o formulário — é problema de OFERTA.",
  },

  CPM: {
    action: "Ampliar público, testar criativos novos no topo, ou revisar a estrutura de campanha.",
    rationale: "CPM alto costuma ser sintoma de leilão apertado ou público estreito demais.",
  },
};

export function actionFor(key: string): DiagnosticAction | null {
  return DIAGNOSTIC_TREE[key] ?? null;
}
