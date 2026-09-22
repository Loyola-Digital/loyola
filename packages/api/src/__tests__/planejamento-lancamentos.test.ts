import { describe, expect, it } from "vitest";
import {
  TIPOS_DE_LANCAMENTO,
  identificarLancamento,
  lancamentosAnteriores,
  rotuloDoTipoDeLancamento,
  type FunilCandidato,
} from "@loyola-x/shared";

/**
 * Story 48.9 — a base de um lançamento é o anterior do MESMO expert e MESMO
 * tipo. Os nomes abaixo são os 11 funis de lançamento reais de produção
 * (conferidos em 2026-09-22), inclusive as irregularidades: `fz-m2-jul26` sem
 * hífen antes do mês, `dg-pg04` sem mês nenhum e `bbe-web-mai-26`, cujo
 * pedaço de tipo (`web`) não está no dicionário.
 */

const FUNIS: FunilCandidato[] = [
  { id: "bbe-pr1", nome: "bbe-pr1-mar-26", criadoEm: "2026-03-01" },
  { id: "dg-pg02", nome: "dg-pg02", criadoEm: "2026-03-10" },
  { id: "fz-m1", nome: "fz-m1-mai26", criadoEm: "2026-05-01" },
  { id: "dg-pg03", nome: "dg-pg03", criadoEm: "2026-05-05" },
  { id: "bbe-web", nome: "bbe-web-mai-26", criadoEm: "2026-05-10" },
  { id: "fz-l2", nome: "fz-l2-jun-26", criadoEm: "2026-06-01" },
  { id: "dg-pg04", nome: "dg-pg04", criadoEm: "2026-06-20" },
  { id: "fz-m2", nome: "fz-m2-jul26", criadoEm: "2026-07-01" },
  { id: "fz-l3", nome: "fz-l3-jul-26", criadoEm: "2026-07-15" },
  { id: "bbe-pr2", nome: "bbe-pr2-ago-26", criadoEm: "2026-08-01" },
  { id: "fz-m3", nome: "fz-m3-set-26", criadoEm: "2026-09-01" },
];

const doProjeto = (prefixo: string) => FUNIS.filter((f) => f.nome.startsWith(prefixo));
const alvo = (id: string) => FUNIS.find((f) => f.id === id)!;

describe("identificarLancamento", () => {
  it("lê expert, tipo e edição dos nomes reais, com e sem hífen antes do mês", () => {
    expect(identificarLancamento("fz-m3-set-26")).toEqual({ expert: "fz", tipo: "m", tipoCru: "m", edicao: 3 });
    expect(identificarLancamento("fz-m2-jul26")).toEqual({ expert: "fz", tipo: "m", tipoCru: "m", edicao: 2 });
    expect(identificarLancamento("dg-pg04")).toEqual({ expert: "dg", tipo: "pg", tipoCru: "pg", edicao: 4 });
    expect(identificarLancamento("bbe-pr2-ago-26")).toEqual({ expert: "bbe", tipo: "pr", tipoCru: "pr", edicao: 2 });
    expect(identificarLancamento("fz-l3-jul-26")).toEqual({ expert: "fz", tipo: "l", tipoCru: "l", edicao: 3 });
  });

  it("tipo fora do dicionário fica `null` — e o cru vem junto, para a tela poder explicar", () => {
    const r = identificarLancamento("bbe-web-mai-26");
    expect(r.tipo).toBeNull();
    expect(r.tipoCru).toBe("web");
    expect(r.expert).toBe("bbe");
    expect(rotuloDoTipoDeLancamento(r.tipo)).toBeNull();
  });

  it("nome que não segue o padrão não inventa expert nem tipo", () => {
    for (const nome of ["", "perpetuo", "2026-lancamento", "x"]) {
      expect(identificarLancamento(nome).tipo, nome).toBeNull();
    }
    // Sigla tem 2–4 letras seguidas de hífen: "PERPETUO-M1" tem oito, então
    // nem expert sai — o padrão não "chuta" os quatro primeiros.
    expect(identificarLancamento("PERPETUO-M1")).toEqual({ expert: null, tipo: null, tipoCru: null, edicao: null });
    // E com sigla válida mas tipo fora do dicionário, expert sai e tipo não:
    expect(identificarLancamento("abc-xyz9")).toEqual({ expert: "abc", tipo: null, tipoCru: "xyz", edicao: 9 });
  });

  it("os quatro tipos do dicionário do Epic 47", () => {
    expect(Object.keys(TIPOS_DE_LANCAMENTO).sort()).toEqual(["l", "m", "pg", "pr"]);
    expect(rotuloDoTipoDeLancamento("m")).toBe("meteórico");
    expect(rotuloDoTipoDeLancamento("pg")).toBe("lançamento pago");
  });
});

describe("lancamentosAnteriores — mesmo expert (projeto) + mesmo tipo + anterior", () => {
  it("fz-m3-set-26 → fz-m2-jul26, fz-m1-mai26 (meteóricos), do mais recente para o mais antigo", () => {
    const r = lancamentosAnteriores(alvo("fz-m3"), doProjeto("fz"));
    expect(r.map((x) => x.nome)).toEqual(["fz-m2-jul26", "fz-m1-mai26"]);
    expect(r[0].rotuloDoTipo).toBe("meteórico");
    expect(r[0].edicao).toBe(2);
  });

  it("NÃO mistura tipos: o meteórico não vê os gratuitos do mesmo expert", () => {
    const r = lancamentosAnteriores(alvo("fz-m3"), doProjeto("fz"));
    expect(r.map((x) => x.nome)).not.toContain("fz-l3-jul-26");
    expect(r.map((x) => x.nome)).not.toContain("fz-l2-jun-26");
  });

  it("dg-pg04 → dg-pg03, dg-pg02; fz-l3 → fz-l2; bbe-pr2 → bbe-pr1", () => {
    expect(lancamentosAnteriores(alvo("dg-pg04"), doProjeto("dg")).map((x) => x.nome)).toEqual(["dg-pg03", "dg-pg02"]);
    expect(lancamentosAnteriores(alvo("fz-l3"), doProjeto("fz")).map((x) => x.nome)).toEqual(["fz-l2-jun-26"]);
    expect(lancamentosAnteriores(alvo("bbe-pr2"), doProjeto("bbe")).map((x) => x.nome)).toEqual(["bbe-pr1-mar-26"]);
  });

  it("primeiro do tipo → sem histórico anterior (fz-m1, dg-pg02, bbe-pr1, fz-l2)", () => {
    for (const id of ["fz-m1", "dg-pg02", "bbe-pr1", "fz-l2"]) {
      expect(lancamentosAnteriores(alvo(id), FUNIS).map((x) => x.nome), id).toEqual([]);
    }
  });

  it("alvo sem tipo identificado (bbe-web-mai-26) → sem histórico, mesmo com irmãos no projeto", () => {
    expect(lancamentosAnteriores(alvo("bbe-web"), doProjeto("bbe"))).toEqual([]);
  });

  it("candidato sem tipo identificado nunca vira base de ninguém", () => {
    const r = lancamentosAnteriores(alvo("bbe-pr2"), doProjeto("bbe"));
    expect(r.map((x) => x.nome)).not.toContain("bbe-web-mai-26");
  });

  it("nunca devolve o próprio funil, nem um posterior", () => {
    const r = lancamentosAnteriores(alvo("fz-m2"), doProjeto("fz"));
    expect(r.map((x) => x.nome)).toEqual(["fz-m1-mai26"]);
    expect(r.map((x) => x.id)).not.toContain("fz-m2");
    expect(r.map((x) => x.nome)).not.toContain("fz-m3-set-26");
  });

  it("aceita Date além de string na data de criação", () => {
    const comData: FunilCandidato[] = FUNIS.map((f) => ({ ...f, criadoEm: new Date(f.criadoEm as string) }));
    const a = { ...alvo("fz-m3"), criadoEm: new Date("2026-09-01") };
    expect(lancamentosAnteriores(a, comData.filter((f) => f.nome.startsWith("fz"))).map((x) => x.nome)).toEqual([
      "fz-m2-jul26",
      "fz-m1-mai26",
    ]);
  });
});
