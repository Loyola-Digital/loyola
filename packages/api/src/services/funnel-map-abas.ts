/**
 * A garantia de que todo mapa tem pelo menos uma aba.
 *
 * ## O que quebrou
 *
 * O canvas monta a tela a partir de `abas[abaAtiva]` e mostra o esqueleto de
 * carregamento enquanto essa aba não existe:
 *
 *     if (isLoading || !abas || !aba) return <Skeleton />
 *
 * Um mapa com `tabs: []` passa nas duas primeiras condições e falha na
 * terceira para sempre — a tela fica carregando e nunca abre, sem erro em
 * lugar nenhum.
 *
 * A rota do mapa dentro do funil nunca esbarrou nisso porque, quando não há
 * desenho, ela devolve um rascunho montado a partir das etapas — que sempre
 * tem uma aba. O mapa avulso nasceu sem funil de onde tirar rascunho, e sem
 * aba nenhuma.
 *
 * ## Por que aqui e não só na criação
 *
 * Corrigir apenas a criação deixaria travados os mapas que já foram criados
 * vazios. Normalizar na leitura conserta os dois casos e não depende de
 * migração de dados.
 */

/**
 * A forma mínima de uma aba.
 *
 * Genérico no conteúdo porque quem chama já tem o tipo exato de bloco e
 * conector: fixar `unknown[]` aqui obrigaria um `as` em cada uso, e é
 * justamente o `as` que deixaria passar a próxima incompatibilidade de forma.
 */
export interface AbaDoMapa<B = never, C = never> {
  id: string;
  name: string;
  boxes: B[];
  connectors: C[];
}

/** Uma aba em branco, no mesmo formato que o rascunho das etapas produz. */
export function abaEmBranco<B = never, C = never>(): AbaDoMapa<B, C> {
  return { id: "tab1", name: "Principal", boxes: [], connectors: [] };
}

/**
 * As abas do mapa, com uma em branco quando não há nenhuma.
 *
 * Preserva o que existe: só entra em ação no vazio.
 */
export function comAoMenosUmaAba<B, C, T extends AbaDoMapa<B, C>>(
  tabs: T[] | null | undefined,
): (T | AbaDoMapa<B, C>)[] {
  return tabs && tabs.length > 0 ? tabs : [abaEmBranco<B, C>()];
}
