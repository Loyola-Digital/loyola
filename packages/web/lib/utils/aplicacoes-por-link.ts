/**
 * Story 18.84 — os textos da etapa de Vendas quando a página da aplicação é o
 * LINK DO ANÚNCIO de origem (página de vendas).
 *
 * PO-03 (lição 18.58): o texto da tela é a documentação da fórmula. O gráfico
 * e a lista falavam do `utm_term` ("atribuídas pela LP do utm_term", "Extraída
 * de: {utm_term}") — com a página vindo do `utm_content → anúncio → link`,
 * esses textos ficariam falsos. Vivem aqui, e não no JSX, para o teste provar o
 * que a tela diz (componentes de `components/funnels` não são coletados pelo
 * vitest do web).
 */

export interface SemLinkDaAplicacao {
  semAnuncio: number;
  foraDoCache: number;
  cacheDesatualizado: number;
  semLinkNaMeta: number;
}

export type CausaDaAplicacao = "sem_anuncio" | "fora_do_cache" | "cache_desatualizado" | "sem_link_na_meta";

/**
 * Tooltip da série "Sem link resolvido": cada causa (PO-02). DOC-001 (gate
 * 18.84): esta tela não dispara a auto-cura do cache de criativos (fora do
 * escopo, PO-07), então o texto diz o que tira a aplicação daqui sem prometer
 * que a tela — ou uma aba que não roda nas etapas de Vendas — faz isso.
 */
export function descreverSemLinkDaAplicacao(s: SemLinkDaAplicacao): string {
  const partes = [
    s.semAnuncio > 0
      ? `${s.semAnuncio} aplicação(ões) sem anúncio de origem (orgânica, link na bio ou sem utm_content)`
      : null,
    s.cacheDesatualizado > 0
      ? `${s.cacheDesatualizado} de anúncio com cache desatualizado — sai daqui quando o cache do anúncio for atualizado (esta tela não o atualiza)`
      : null,
    s.foraDoCache > 0
      ? `${s.foraDoCache} de anúncio fora do cache de criativos — sai daqui quando o anúncio entrar no cache (esta tela não sincroniza)`
      : null,
    s.semLinkNaMeta > 0 ? `${s.semLinkNaMeta} de anúncio sem link na Meta` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "sem página identificada";
}

/** Tooltip da coluna de página na lista de aplicações (AC3). */
export function tooltipDaPaginaDaAplicacao(l: {
  lp: string | null;
  lpCausa?: CausaDaAplicacao | null;
  adId?: string;
}): string {
  const anuncio = l.adId ? `anúncio ${l.adId}` : "anúncio";
  if (l.lp) return `Link do anúncio de origem (utm_content → ${anuncio} → página)`;
  switch (l.lpCausa) {
    case "fora_do_cache":
      return `Sem link resolvido — ${anuncio} fora do cache de criativos`;
    case "cache_desatualizado":
      return `Sem link resolvido — ${anuncio} com cache desatualizado`;
    case "sem_link_na_meta":
      return `Sem link resolvido — ${anuncio} sem link na Meta`;
    default:
      return "Sem link resolvido — aplicação sem anúncio de origem (orgânica, link na bio ou sem utm_content)";
  }
}

/** A explicação acima do gráfico: por que os números por página mudaram. */
export const TEXTO_PAGINAS_PELO_LINK =
  "Cada linha é a página de destino do anúncio de onde a aplicação veio (utm_content → anúncio → link). " +
  "Aplicação sem anúncio de origem — orgânica, link na bio — ou de anúncio sem link no cache de criativos " +
  "fica em \"Sem link resolvido\". O nome da aba deixou de decidir a página.";

/** Aviso quando há aplicação sem página e nenhuma página órfã. */
export function textoAplicacoesSemLink(n: number): string {
  return `${n} ${n === 1 ? "aplicação está" : "aplicações estão"} em "Sem link resolvido" — sem anúncio de origem ou com anúncio sem link no cache de criativos.`;
}

/** Aviso de página órfã (AC4): páginas de venda com gasto e sem aplicação. */
export function textoPaginasOrfas(paginas: string[], semLink: number): string {
  const um = paginas.length === 1;
  const base = `${paginas.join(", ")} ${um ? "tem" : "têm"} gasto nas campanhas desta etapa e ${um ? "nenhuma aplicação atribuída" : "nenhuma aplicação atribuída a elas"}.`;
  if (semLink <= 0) return base;
  return `${base} Há ${semLink} ${semLink === 1 ? "aplicação" : "aplicações"} em "Sem link resolvido" — ${semLink === 1 ? "ela pode ser" : "algumas podem ser"} destas páginas.`;
}
