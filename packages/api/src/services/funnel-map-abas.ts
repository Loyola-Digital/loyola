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

/**
 * As mesmas abas com ids NOVOS em tudo — abas, blocos e conectores.
 *
 * Serve à duplicação. Copiar o JSONB como está funcionaria, porque cada mapa
 * tem o seu; o problema aparece depois, quando alguém copia um bloco da cópia
 * e cola no original: o id colado já existe lá, e a ligação passa a apontar
 * para o bloco errado sem erro nenhum.
 *
 * As referências dos conectores (`fromBox`/`toBox`) são reescritas pelo mesmo
 * mapa de tradução — um conector que sobrasse apontando para o id antigo
 * viraria uma seta solta no meio do desenho.
 *
 * Campo que não seja id é copiado como está: posição, cor, texto, imagem. É
 * uma cópia do desenho, não uma reinterpretação dele.
 */
export function reidentificarAbas<
  T extends {
    id: string;
    boxes: { id: string }[];
    connectors: { id: string; fromBox: string; toBox: string }[];
  },
>(abas: T[], sufixo = "c"): T[] {
  let n = 0;
  const novoId = (prefixo: string) => `${prefixo}${sufixo}${(n += 1)}`;

  return abas.map((aba, i) => {
    const traducao = new Map<string, string>();
    for (const b of aba.boxes ?? []) traducao.set(b.id, novoId("b"));

    return {
      ...aba,
      id: `tab${sufixo}${i + 1}`,
      boxes: (aba.boxes ?? []).map((b) => ({ ...b, id: traducao.get(b.id) ?? b.id })),
      connectors: (aba.connectors ?? [])
        // Conector cujo bloco não veio junto é DESCARTADO: apontar para um id
        // que não existe desenha uma seta saindo do nada.
        .filter((c) => traducao.has(c.fromBox) && traducao.has(c.toBox))
        .map((c) => ({
          ...c,
          id: novoId("l"),
          fromBox: traducao.get(c.fromBox) as string,
          toBox: traducao.get(c.toBox) as string,
        })),
    } as T;
  });
}
