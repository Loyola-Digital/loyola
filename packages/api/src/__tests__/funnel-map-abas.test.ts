/**
 * O mapa que nunca abria.
 *
 * O canvas espera `abas[abaAtiva]` e fica no esqueleto de carregamento
 * enquanto essa aba não existe. Um mapa com zero abas trava para sempre, sem
 * erro nenhum — foi o que aconteceu com os mapas avulsos recém-criados.
 */

import { describe, expect, it } from "vitest";
import { abaEmBranco, comAoMenosUmaAba } from "../services/funnel-map-abas.js";

describe("comAoMenosUmaAba", () => {
  it("põe uma aba quando o mapa está vazio", () => {
    // O caso do bug: mapa avulso nasce com `tabs: []`, e `abas[0]` fica
    // `undefined` — o canvas nunca sai do esqueleto.
    const r = comAoMenosUmaAba([]);
    expect(r).toHaveLength(1);
    expect(r[0]!.name).toBe("Principal");
  });

  it("também cobre null e undefined", () => {
    expect(comAoMenosUmaAba(null)).toHaveLength(1);
    expect(comAoMenosUmaAba(undefined)).toHaveLength(1);
  });

  it("não toca no mapa que já tem abas", () => {
    const abas = [
      { id: "t1", name: "Captação", boxes: [], connectors: [] },
      { id: "t2", name: "Vendas", boxes: [], connectors: [] },
    ];
    expect(comAoMenosUmaAba(abas)).toBe(abas);
  });

  it("a aba em branco tem as listas que o canvas percorre", () => {
    // `boxes.map` e `connectors.map` rodam sem checagem no canvas: faltando
    // qualquer uma das duas, a tela quebra em vez de abrir vazia.
    const a = abaEmBranco();
    expect(Array.isArray(a.boxes)).toBe(true);
    expect(Array.isArray(a.connectors)).toBe(true);
    expect(a.id).toBeTruthy();
  });
});
