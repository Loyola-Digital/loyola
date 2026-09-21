/**
 * O lote de células da esteira anual pela API pública (spec da Ágatha, set/2026).
 *
 * O que protege:
 * 1. Upsert PARCIAL: campo omitido não muda; `null` limpa.
 * 2. Esteira pelo NOME, na faixa pelo rótulo da tela ("TRÁFEGO", "CAMPANHA").
 * 3. Valor fora do vocabulário é ERRO com as opções — a tela descarta calada,
 *    e o modelo acharia que gravou.
 * 4. O caso de teste da spec (FZ & MFB 2027, "Renovação MFB") não muda nada
 *    quando reaplicado sobre o que já está na tela.
 */

import { describe, expect, it } from "vitest";
import {
  aplicarPatch,
  gruposDoProjeto,
  planejarLote,
  resolverFaixa,
  validarPatch,
  type CelulaDoAnual,
} from "../services/planner-anual.js";

const grupos = gruposDoProjeto([{ grupo: "trafego", rotulo: "CAMPANHA", cor: null }]);
const vazia: CelulaDoAnual = { frequencia: null, produto: null, categoria: null, funil: null };
const esteiras = [
  { id: "e1", grupo: "trafego", nome: "Renovação MFB", sortOrder: 0 },
  { id: "e2", grupo: "organico", nome: "Lançamento", sortOrder: 1 },
];

describe("resolverFaixa", () => {
  it("aceita id, rótulo padrão e o rótulo que a empresa deu", () => {
    expect(resolverFaixa("trafego", grupos)).toBe("trafego");
    expect(resolverFaixa("TRÁFEGO", grupos)).toBe("trafego");
    expect(resolverFaixa("Campanha", grupos)).toBe("trafego");
    expect(resolverFaixa("ascensão", grupos)).toBe("ascensao");
  });

  it("faixa que não existe é null", () => {
    expect(resolverFaixa("vendas", grupos)).toBeNull();
  });
});

describe("validarPatch", () => {
  it("corrige a grafia para a do vocabulário", () => {
    const { patch, erros } = validarPatch({ categoria: "back-end", funil: "lancamento" });
    expect(erros).toEqual([]);
    expect(patch).toMatchObject({ categoria: "Back-End", funil: "Lançamento" });
  });

  it("valor inventado vira erro com as opções", () => {
    const { erros } = validarPatch({ funil: "Webinar" });
    expect(erros[0]).toContain('funil "Webinar" não existe');
    expect(erros[0]).toContain("Webinar diário");
  });

  it("null é limpar, não erro", () => {
    expect(validarPatch({ funil: null }).erros).toEqual([]);
  });
});

describe("aplicarPatch", () => {
  const atual: CelulaDoAnual = { frequencia: "REN1", produto: "Renovação MFB", categoria: "Back-End", funil: "Lançamento" };

  it("campo omitido fica como estava", () => {
    expect(aplicarPatch(atual, { produto: "Outro" })).toEqual({ ...atual, produto: "Outro" });
  });

  it("null limpa só aquele campo", () => {
    expect(aplicarPatch(atual, { nota: null })).toEqual({ ...atual, frequencia: null });
  });

  it("`nota` da API é a `frequencia` do banco", () => {
    expect(aplicarPatch(vazia, { nota: "semana 22–25/02" }).frequencia).toBe("semana 22–25/02");
  });
});

describe("planejarLote", () => {
  it("acha a esteira pelo nome, sem caixa nem acento, na faixa pelo rótulo", () => {
    const plano = planejarLote(
      [{ esteira: { faixa: "Campanha", nome: "renovacao mfb" }, mes: 2, produto: "Renovação MFB" }],
      esteiras,
      grupos,
      new Map(),
    );
    expect(plano.erros).toEqual([]);
    expect(plano.mudancas[0]).toMatchObject({ esteiraId: "e1", esteira: "Renovação MFB", mes: 2 });
  });

  it("esteira que não existe é erro — a menos que peça para criar", () => {
    const item = { esteira: { faixa: "trafego", nome: "Perpétuo Funil de Lucro" }, mes: 3, produto: "X" };
    const semCriar = planejarLote([item], esteiras, grupos, new Map());
    expect(semCriar.erros[0]!.erro).toContain("não existe na faixa trafego");
    expect(semCriar.erros[0]!.erro).toContain('"Renovação MFB"');

    const criando = planejarLote(
      [{ ...item, esteira: { ...item.esteira, criarSeNaoExistir: true } }],
      esteiras,
      grupos,
      new Map(),
    );
    expect(criando.erros).toEqual([]);
    expect(criando.novas).toEqual([{ faixa: "trafego", nome: "Perpétuo Funil de Lucro" }]);
    expect(criando.mudancas[0]!.esteiraId).toBeNull();
  });

  it("vários meses da mesma esteira nova criam UMA esteira", () => {
    const esteira = { faixa: "trafego", nome: "Nova", criarSeNaoExistir: true };
    const plano = planejarLote(
      [3, 4, 5].map((mes) => ({ esteira, mes, produto: "P" })),
      esteiras,
      grupos,
      new Map(),
    );
    expect(plano.novas).toHaveLength(1);
    expect(plano.mudancas).toHaveLength(3);
  });

  it("dois itens para a mesma célula se somam, e o 'antes' é o do banco", () => {
    const banco = new Map([["e1:1", { ...vazia, produto: "Velho" }]]);
    const plano = planejarLote(
      [
        { esteira: { id: "e1" }, mes: 1, produto: "Novo" },
        { esteira: { id: "e1" }, mes: 1, categoria: "Back-End" },
      ],
      esteiras,
      grupos,
      banco,
    );
    expect(plano.mudancas).toHaveLength(1);
    expect(plano.mudancas[0]!.antes.produto).toBe("Velho");
    expect(plano.mudancas[0]!.depois).toMatchObject({ produto: "Novo", categoria: "Back-End" });
  });

  it("id de esteira de outra empresa é erro", () => {
    const plano = planejarLote([{ esteira: { id: "de-outra" }, mes: 1 }], esteiras, grupos, new Map());
    expect(plano.erros[0]!.erro).toContain("não existe nesta empresa");
  });

  // Seção 4 da spec: reaplicar o que já está na tela não muda nada.
  it("caso de teste da spec: FZ & MFB 2027 reaplicado não gera mudança", () => {
    const linhas = [
      [1, "REN1 · prod./captação"],
      [2, "REN1 · semana 22–25/02"],
      [4, "REN2 · prod./captação"],
      [5, "REN2 · semana 03–06/05"],
      [6, "REN3 · prod./captação"],
    ] as const;
    const banco = new Map(
      linhas.map(([mes, nota]) => [
        `e1:${mes}`,
        { frequencia: nota, produto: "Renovação MFB", categoria: "Back-End", funil: "Lançamento" },
      ]),
    );
    const plano = planejarLote(
      linhas.map(([mes, nota]) => ({
        esteira: { faixa: "TRÁFEGO", nome: "Renovação MFB" },
        mes,
        nota,
        produto: "Renovação MFB",
        categoria: "Back-End",
        funil: "Lançamento",
      })),
      esteiras,
      gruposDoProjeto([]),
      banco,
    );
    expect(plano.erros).toEqual([]);
    expect(plano.mudancas.every((m) => JSON.stringify(m.antes) === JSON.stringify(m.depois))).toBe(true);
  });
});
