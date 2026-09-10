import { describe, expect, it } from "vitest";
import {
  ESTADO_VAZIO_DA_VSL,
  ROTULO_DA_VARIAVEL,
  TIPOS_DE_VARIAVEL,
  aoEscolherNaVsl,
  camposDaVsl,
  corpoDaVsl,
  estadoDeVsl,
  previaDaVsl,
} from "../nomenclatura-vsl";

const cheio = { expertId: "e", productId: "p", leadId: "l", problemId: "pr", solutionId: "s", offerId: "o", notes: "" };
const t = {
  experts: [{ id: "e", code: "dg" }],
  produtos: [{ id: "p", slug: "claude-negocios" }],
  variaveis: [
    { id: "l", type: "lead" as const, code: "demissao" },
    { id: "pr", type: "problem" as const, code: "falta-de-metodo" },
    { id: "s", type: "solution" as const, code: "agente-pronto" },
  ],
  ofertas: [{ id: "o", code: "of01" }],
};

describe("cascata da VSL (AC8)", () => {
  it("trocar o expert limpa produto, variáveis e oferta; os outros campos não limpam nada", () => {
    const depois = aoEscolherNaVsl(cheio, "expertId", "e2");
    expect(depois).toMatchObject({ expertId: "e2", productId: "", leadId: "", problemId: "", solutionId: "", offerId: "" });
    expect(aoEscolherNaVsl(cheio, "productId", "p2")).toMatchObject({ productId: "p2", leadId: "l", offerId: "o" });
    expect(aoEscolherNaVsl(cheio, "leadId", "l2")).toMatchObject({ leadId: "l2", problemId: "pr" });
    expect(aoEscolherNaVsl(cheio, "expertId", "e")).toBe(cheio);
  });
  it("três variáveis, com rótulo pt-BR", () => {
    expect(TIPOS_DE_VARIAVEL).toEqual(["lead", "problem", "solution"]);
    expect(ROTULO_DA_VARIAVEL.solution).toBe("Mecanismo da solução");
  });
});

describe("prévia com a MESMA função do servidor (AC8)", () => {
  it("completo: vsl_dg_claude-negocios_demissao_falta-de-metodo_agente-pronto_of01", () => {
    const p = previaDaVsl(camposDaVsl(cheio, t));
    expect(p.nome).toBe("vsl_dg_claude-negocios_demissao_falta-de-metodo_agente-pronto_of01");
    expect(p.tamanho).toBe(p.nome!.length);
    expect(p.completo).toBe(true);
  });
  it("parcial: `…` no lugar do que falta, prefixo sempre presente, Salvar bloqueado", () => {
    const p = previaDaVsl(camposDaVsl({ ...cheio, problemId: "", offerId: "" }, t));
    expect(p.nome).toBeNull();
    expect(p.completo).toBe(false);
    expect(p.texto).toBe("vsl_dg_claude-negocios_demissao_…_agente-pronto_…");
    expect(p.pedacos.filter((x) => x.faltando).map((x) => x.campo)).toEqual(["problem", "offer"]);
  });
  it("uma variável escolhida no TIPO errado não entra no nome (a tela nunca deixa, o servidor recusa)", () => {
    // leadId apontando para uma variável de tipo problem: camposDaVsl não a reconhece como lead
    expect(camposDaVsl({ ...cheio, leadId: "pr" }, t).lead).toBeUndefined();
  });
});

describe("ida e volta com a API", () => {
  it("corpoDaVsl manda os seis ids e as notas (null quando vazias)", () => {
    expect(corpoDaVsl({ ...cheio, notes: "  " })).toEqual({ expertId: "e", productId: "p", leadId: "l", problemId: "pr", solutionId: "s", offerId: "o", notes: null });
  });
  it("estadoDeVsl devolve o estado do gerador a partir de uma VSL gravada", () => {
    expect(estadoDeVsl({ ...cheio, notes: null })).toEqual({ ...ESTADO_VAZIO_DA_VSL, ...cheio, notes: "" });
  });
});
