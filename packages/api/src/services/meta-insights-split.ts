/**
 * A Meta zera a ENTREGA quando se pede AÇÃO no mesmo insight diário.
 *
 * ## O que foi medido (2026-10-21, conta 3717530711643512, uma campanha, 01–02/10)
 *
 * A verdade é R$ 480,45. Três rodadas idênticas, determinístico:
 *
 * ```
 *   time_increment=1  +  actions   →  R$   0,00  (level=campaign)
 *   time_increment=1  +  actions   →  R$   0,64  (level=ad)
 *   time_increment=1  sem actions  →  R$ 480,45  ✔
 *   actions, sem time_increment    →  R$ 480,45  ✔
 * ```
 *
 * A resposta vem com `actions` e `action_values` CHEIOS e `spend`,
 * `impressions`, `reach` e `clicks` em `"0"`. Não é truncamento, não é
 * throttle (`x-fb-ads-insights-throttle` acusava 0,01% de uso) e não é erro
 * HTTP — é 200 com o número errado, que o upsert gravava em cima do dado bom.
 *
 * Estrago em produção antes do conserto: 215 das 236 linhas de outubro de
 * `meta_campaign_insights_daily` zeradas (em julho eram 19 de 238), e a série
 * de anúncio do DG & CPDF decaindo de trás para frente a cada sync — 16/10
 * R$ 2.492 → 17/10 R$ 1.263 → 18/10 R$ 763 → 19/10 R$ 369 → 20/10 R$ 62.
 *
 * ## A regra
 *
 * Vale para QUALQUER campo de breakdown por ação, não só `actions`: medido
 * também com `video_p25_watched_actions` e companhia, que zeram igual. Daí
 * `CAMPOS_DE_ACAO` ser a lista fechada deste módulo — quem adicionar um campo
 * de ação ao `fields` da entrega reintroduz o bug.
 *
 * ## Por que duas chamadas, e não uma sem `time_increment`
 *
 * O grão diário é o produto: toda a série do app é por dia. Tirar
 * `time_increment=1` devolve o período agregado, que é outro dado.
 *
 * Módulo folha (sem I/O) porque é a parte que precisa de teste: `meta-ads.ts`
 * não roda sem a Graph API.
 */

/**
 * Os campos de breakdown por ação. Pedir qualquer um deles junto com
 * `time_increment=1` zera a entrega, então eles viajam na SEGUNDA chamada.
 */
export const CAMPOS_DE_ACAO = [
  "actions",
  "action_values",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_thruplay_watched_actions",
  "video_play_actions",
] as const;

/** `true` quando o campo é de ação — e portanto envenena a entrega. */
export function ehCampoDeAcao(campo: string): boolean {
  return (CAMPOS_DE_ACAO as readonly string[]).includes(campo);
}

/**
 * Junta a resposta de ENTREGA com a de AÇÃO pela chave (entidade + dia).
 *
 * Só os campos de `CAMPOS_DE_ACAO` atravessam: o resto da linha de ação são os
 * zeros do bug, e copiá-los desfaria o conserto.
 *
 * Linha de ação SEM entrega correspondente entra como linha própria. Acontece
 * de verdade — conversão atribuída num dia em que o anúncio não gastou — e
 * descartá-la perderia a conversão. Ela nasce sem campo de entrega, e não com
 * zero, para a proteção do upsert saber a diferença.
 *
 * Pura: a decisão de quem casa com quem é testável sem subir a Meta.
 */
export function mesclarEntregaComAcoes<T extends Record<string, unknown>>(
  entrega: T[],
  acoes: T[],
  chave: (linha: T) => string,
): T[] {
  const porChave = new Map<string, T>();
  for (const linha of entrega) porChave.set(chave(linha), { ...linha });

  for (const linha of acoes) {
    const k = chave(linha);
    const destino = porChave.get(k);
    const soAcoes = apenasCamposDeAcao(linha);
    if (destino) {
      Object.assign(destino, soAcoes);
    } else {
      // Sem entrega: preserva os identificadores da linha (ids, nomes, data) e
      // as ações, sem inventar `spend: 0`.
      porChave.set(k, { ...semCamposDeEntrega(linha), ...soAcoes } as T);
    }
  }
  return [...porChave.values()];
}

/** Os campos de entrega que a resposta de ação devolve zerados. */
const CAMPOS_DE_ENTREGA = ["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm"];

function apenasCamposDeAcao<T extends Record<string, unknown>>(linha: T): Partial<T> {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_DE_ACAO) {
    if (linha[campo] !== undefined) saida[campo] = linha[campo];
  }
  return saida as Partial<T>;
}

function semCamposDeEntrega<T extends Record<string, unknown>>(linha: T): Partial<T> {
  const saida: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(linha)) {
    if (!CAMPOS_DE_ENTREGA.includes(campo) && !ehCampoDeAcao(campo)) saida[campo] = valor;
  }
  return saida as Partial<T>;
}
