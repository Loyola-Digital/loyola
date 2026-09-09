/**
 * Faz a prévia arrastada acompanhar o CURSOR, e não o canto do card.
 *
 * ## O problema
 *
 * O `DragOverlay` do dnd-kit nasce ancorado no elemento que se pegou: ele
 * aparece sobre o canto superior esquerdo do card original e daí em diante
 * segue o deslocamento do ponteiro. Enquanto a prévia tem o tamanho do card,
 * ninguém nota — ela cobre exatamente onde estava.
 *
 * Quando a prévia é menor que o card (aqui é só o nome da coleção), a conta
 * deixa de fechar: pegar o card pela direita põe a etiqueta a meia largura de
 * distância do cursor. Para encaixar numa pasta, a pessoa precisa mirar com um
 * ponto que não é o que ela está vendo — e o alvo acende sob o cursor, não sob
 * a etiqueta.
 *
 * ## A correção
 *
 * Descontar onde dentro do card o clique aconteceu e recentrar a prévia no
 * ponteiro. É o que o `snapCenterToCursor` do `@dnd-kit/modifiers` faz —
 * escrito aqui porque esse pacote não está no projeto, e são doze linhas
 * contra uma dependência a mais.
 */

import type { Modifier } from "@dnd-kit/core";

/**
 * Onde o ponteiro estava quando o arrasto começou.
 *
 * O `getEventCoordinates` do `@dnd-kit/utilities` faria isto, mas ele chama
 * `getWindow` para distinguir toque de mouse — e os testes deste pacote rodam
 * em `environment: node`, sem DOM. Ler os campos direto mantém a função pura,
 * que é o que permite testar a conta sem montar um navegador.
 *
 * Toque primeiro: um `TouchEvent` também tem `clientX`, mas em `0`.
 */
function coordenadasDo(evento: Event): { x: number; y: number } | null {
  const toque = (evento as TouchEvent).touches?.[0];
  if (toque) return { x: toque.clientX, y: toque.clientY };
  const m = evento as MouseEvent;
  return typeof m.clientX === "number" ? { x: m.clientX, y: m.clientY } : null;
}

export const centralizarNoCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  // Sem o retângulo ou sem o evento que iniciou o arrasto não há o que
  // descontar — devolver o transform intacto mantém o comportamento padrão em
  // vez de jogar a prévia para um canto.
  if (!draggingNodeRect || !activatorEvent) return transform;

  const ponteiro = coordenadasDo(activatorEvent);
  if (!ponteiro) return transform;

  // Onde, dentro do card, o clique caiu.
  const dentroX = ponteiro.x - draggingNodeRect.left;
  const dentroY = ponteiro.y - draggingNodeRect.top;

  return {
    ...transform,
    x: transform.x + dentroX - draggingNodeRect.width / 2,
    y: transform.y + dentroY - draggingNodeRect.height / 2,
  };
};
