import { describe, expect, it } from "vitest";
import {
  TETO_POR_PROJETO_POR_DIA,
  chaveDaVenda,
  repartir,
  textoDaVenda,
  textoDoExcedente,
  type VendaDaPlanilha,
} from "../services/vendas-novas.js";

const HOJE = "2026-11-23";

const venda = (chave: string, valorBruto = 100, dataVenda = HOJE): VendaDaPlanilha => ({
  chave,
  produto: "Curso",
  valorBruto,
  dataVenda,
});

describe("chaveDaVenda", () => {
  it("usa transação + produto, a mesma chave do dedup do dashboard", () => {
    expect(
      chaveDaVenda({ txId: "TX1", email: "a@b.com", produto: "Curso", dataVenda: null, valorBruto: 0 }),
    ).toBe("TX1|Curso");
  });

  // Um pedido com dois produtos são duas vendas — se a chave fosse só o txId,
  // a segunda seria engolida como repetida.
  it("separa dois produtos do mesmo pedido", () => {
    const a = chaveDaVenda({ txId: "TX1", email: null, produto: "Curso", dataVenda: null, valorBruto: 0 });
    const b = chaveDaVenda({ txId: "TX1", email: null, produto: "Upsell", dataVenda: null, valorBruto: 0 });
    expect(a).not.toBe(b);
  });

  it("recua para e-mail+data+valor quando a planilha não tem transação", () => {
    expect(
      chaveDaVenda({ txId: null, email: " A@B.com ", produto: "Curso", dataVenda: "2026-11-23", valorBruto: 297 }),
    ).toBe("e:a@b.com|2026-11-23|297");
  });

  it("linha sem identificador nenhum fica fora", () => {
    expect(
      chaveDaVenda({ txId: null, email: null, produto: "Curso", dataVenda: "2026-11-23", valorBruto: 297 }),
    ).toBeNull();
  });
});

describe("repartir", () => {
  it("avisa só o que ainda não foi visto", () => {
    const r = repartir([venda("a"), venda("b"), venda("c")], new Set(["a", "b"]), 0, false, HOJE);
    expect(r.avisar.map((v) => v.chave)).toEqual(["c"]);
    expect(r.excedentes).toEqual([]);
  });

  // A trava que impede o primeiro ciclo de mandar o histórico inteiro — mas sem
  // engolir o dia, que foi o erro da estreia de 23/11 (8 das 11 vendas da Black
  // já estavam na planilha e nunca viraram aviso).
  it("estreia avisa as vendas de hoje e cala o histórico", () => {
    const r = repartir(
      [venda("hoje-1"), venda("velha", 100, "2026-11-20"), venda("hoje-2")],
      new Set(),
      0,
      true,
      HOJE,
    );
    expect(r.avisar.map((v) => v.chave)).toEqual(["hoje-1", "hoje-2"]);
    expect(r.excedentes.map((v) => v.chave)).toEqual(["velha"]);
  });

  it("estreia sem venda de hoje não avisa nada", () => {
    const r = repartir(
      [venda("a", 100, "2026-11-01"), venda("b", 100, "2026-11-20")],
      new Set(),
      0,
      true,
      HOJE,
    );
    expect(r.avisar).toEqual([]);
    expect(r.excedentes).toHaveLength(2);
  });

  // Sem data reconhecida não há como saber se é do dia; na dúvida, silêncio.
  it("estreia cala venda sem data", () => {
    const r = repartir([{ ...venda("sem-data"), dataVenda: null }], new Set(), 0, true, HOJE);
    expect(r.avisar).toEqual([]);
    expect(r.excedentes.map((v) => v.chave)).toEqual(["sem-data"]);
  });

  it("na estreia o teto também vale", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => venda(`v${i}`));
    const r = repartir(muitas, new Set(), 0, true, HOJE);
    expect(r.avisar).toHaveLength(TETO_POR_PROJETO_POR_DIA);
    expect(r.excedentes).toHaveLength(40 - TETO_POR_PROJETO_POR_DIA);
  });

  it("corta no teto do dia e joga o resto no excedente", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => venda(`v${i}`));
    const r = repartir(muitas, new Set(), 0, false, HOJE);
    expect(r.avisar).toHaveLength(TETO_POR_PROJETO_POR_DIA);
    expect(r.excedentes).toHaveLength(40 - TETO_POR_PROJETO_POR_DIA);
  });

  it("desconta o que já saiu hoje naquele projeto", () => {
    const r = repartir([venda("a"), venda("b"), venda("c")], new Set(), TETO_POR_PROJETO_POR_DIA - 1, false, HOJE);
    expect(r.avisar.map((v) => v.chave)).toEqual(["a"]);
    expect(r.excedentes.map((v) => v.chave)).toEqual(["b", "c"]);
  });

  it("teto já estourado não avisa mais nada no dia", () => {
    const r = repartir([venda("a")], new Set(), TETO_POR_PROJETO_POR_DIA + 5, false, HOJE);
    expect(r.avisar).toEqual([]);
    expect(r.excedentes.map((v) => v.chave)).toEqual(["a"]);
  });
});

describe("texto", () => {
  // `Intl` separa "R$" do número com espaço INQUEBRÁVEL (U+00A0): escrever
  // espaço comum aqui faz o teste falhar mostrando duas strings idênticas.
  it("traz funil, expert e valor", () => {
    const t = textoDaVenda(venda("a", 297), "dg-pg05-out-26", "DG & CPDF");
    expect(t.titulo).toBe("Venda · dg-pg05-out-26");
    expect(t.corpo).toBe("DG & CPDF · R$ 297,00 · Curso");
  });

  it("sem produto mapeado, o corpo não fica com separador solto", () => {
    const t = textoDaVenda({ ...venda("a", 1250.5), produto: null }, "bbe-pr2-out-26", "BBE");
    expect(t.corpo).toBe("BBE · R$ 1.250,50");
  });

  it("o resumo do excedente soma o que não virou push", () => {
    expect(textoDoExcedente(51, 15147, "DG & CPDF").titulo).toBe("+51 vendas · DG & CPDF");
    expect(textoDoExcedente(1, 297, "BBE").titulo).toBe("+1 venda · BBE");
  });
});
