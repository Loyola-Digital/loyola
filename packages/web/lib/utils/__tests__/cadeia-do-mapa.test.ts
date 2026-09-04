/**
 * A corrente que se move junto.
 *
 * O que estes testes protegem é o travamento: um mapa real tem volta — o
 * downsell aponta de novo para o checkout — e uma busca sem controle de
 * visitados entra em laço infinito DURANTE o arrasto, com o ponteiro
 * capturado. A aba trava e não há como soltar.
 */

import { describe, expect, it } from "vitest";
import { descendentes } from "../cadeia-do-mapa";

const l = (fromBox: string, toBox: string) => ({ fromBox, toBox });

describe("descendentes", () => {
  it("segue a corrente até o fim", () => {
    const r = descendentes("captura", [
      l("captura", "vsl"),
      l("vsl", "checkout"),
      l("checkout", "upsell"),
    ]);
    expect([...r].sort()).toEqual(["checkout", "upsell", "vsl"]);
  });

  it("não inclui o próprio bloco", () => {
    // Ele já é movido pelo arrasto; incluí-lo aqui aplicaria o delta duas vezes.
    const r = descendentes("a", [l("a", "b")]);
    expect(r.has("a")).toBe(false);
  });

  it("não anda para trás", () => {
    // "À frente" é o sentido da seta. Quem aponta PARA a origem fica parado.
    const r = descendentes("meio", [l("antes", "meio"), l("meio", "depois")]);
    expect([...r]).toEqual(["depois"]);
  });

  it("termina num ciclo direto", () => {
    const r = descendentes("a", [l("a", "b"), l("b", "a")]);
    expect([...r]).toEqual(["b"]);
  });

  it("termina num ciclo longo", () => {
    // checkout → upsell → downsell → checkout, a volta que existe de verdade.
    const r = descendentes("checkout", [
      l("checkout", "upsell"),
      l("upsell", "downsell"),
      l("downsell", "checkout"),
    ]);
    expect([...r].sort()).toEqual(["downsell", "upsell"]);
  });

  it("termina quando o bloco aponta para si mesmo", () => {
    expect([...descendentes("a", [l("a", "a")])]).toEqual([]);
  });

  it("pega os dois lados de uma ramificação", () => {
    const r = descendentes("checkout", [
      l("checkout", "upsell"),
      l("checkout", "downsell"),
      l("upsell", "obrigado"),
    ]);
    expect([...r].sort()).toEqual(["downsell", "obrigado", "upsell"]);
  });

  it("não repete o bloco alcançado por dois caminhos", () => {
    const r = descendentes("a", [l("a", "b"), l("a", "c"), l("b", "d"), l("c", "d")]);
    expect(r.size).toBe(3);
  });

  it("bloco sem saída não leva ninguém", () => {
    expect(descendentes("sozinho", [l("outro", "coisa")]).size).toBe(0);
  });

  it("sem ligação nenhuma, ninguém vem junto", () => {
    expect(descendentes("a", []).size).toBe(0);
  });
});
