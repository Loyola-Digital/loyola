import { describe, expect, it } from "vitest";
import {
  ESTADO_VAZIO_DO_ANUNCIO,
  aoEscolherNoAnuncio,
  camposDoAnuncio,
  corpoDoAnuncio,
  estadoDeAnuncio,
  mesAnoDe,
  mesCorrente,
  nnDe,
  previaDoAnuncio,
} from "../nomenclatura-anuncio";

const experts = [{ id: "e", code: "dg" }];
const cheio = { expertId: "e", creativeType: "adv", creativeSeq: "03", launchType: "pg", launchSeq: "02", date: "09-2026", description: "", notes: "" };

describe("estado do gerador (AC8)", () => {
  it("trocar o expert limpa os dois NN; trocar a sigla limpa o NN do lançamento; o resto fica", () => {
    expect(aoEscolherNoAnuncio(cheio, "expertId", "e2")).toMatchObject({ expertId: "e2", creativeSeq: "", launchSeq: "", creativeType: "adv", date: "09-2026" });
    expect(aoEscolherNoAnuncio(cheio, "launchType", "l")).toMatchObject({ launchType: "l", launchSeq: "", creativeSeq: "03" });
    expect(aoEscolherNoAnuncio(cheio, "creativeType", "ad")).toMatchObject({ creativeType: "ad", creativeSeq: "03" });
    expect(aoEscolherNoAnuncio(cheio, "expertId", "e")).toBe(cheio);
  });
  it("nnDe aceita 1–99 com um ou dois dígitos; vazio e 0/100 não", () => {
    expect(nnDe("3")).toBe(3);
    expect(nnDe("03")).toBe(3);
    expect(nnDe("")).toBeUndefined();
    expect(nnDe("0")).toBeUndefined();
    expect(nnDe("100")).toBeUndefined();
  });
});

describe("prévia = função do servidor (AC8)", () => {
  it("completa: estrutura até o -- e nome igual sem descrição; com descrição normalizada, nome completo", () => {
    const p = previaDoAnuncio(cheio, experts);
    expect(p.estrutura).toBe("adv03_dg_pg02_09-2026--");
    expect(p.nome).toBe("adv03_dg_pg02_09-2026--");
    expect(p.completo).toBe(true);
    const q = previaDoAnuncio({ ...cheio, description: "Gancho Demissão" }, experts);
    expect(q.nome).toBe("adv03_dg_pg02_09-2026--gancho-demissao");
    expect(q.estrutura).toBe("adv03_dg_pg02_09-2026--");
    expect(q.tamanho).toBe(q.nome!.length);
  });
  it("parcial: … no que falta, -- sempre desenhado, Salvar bloqueado", () => {
    const p = previaDoAnuncio({ ...cheio, launchSeq: "", date: "" }, experts);
    expect(p.completo).toBe(false);
    expect(p.nome).toBeNull();
    expect(p.texto).toBe("adv03_dg_…_…--");
    expect(p.pedacos.filter((x) => x.faltando).map((x) => x.campo)).toEqual(["launch", "date"]);
  });
  it("descrição com _ ou -- é rejeitada pela MESMA normalização do servidor e trava o nome", () => {
    const p = previaDoAnuncio({ ...cheio, description: "gancho_dor" }, experts);
    expect(p.erroDaDescricao).toMatch(/"_" separa os campos/);
    expect(p.nome).toBeNull();
    expect(camposDoAnuncio({ ...cheio, description: "gancho--dor" }, experts).description).toBeUndefined();
  });
});

describe("mm-aaaa e ida e volta com a API", () => {
  it("mesAnoDe/mesCorrente e estadoDeAnuncio: editar mantém o NN, duplicar limpa (o servidor sugere o próximo)", () => {
    expect(mesAnoDe("2026-09-01")).toBe("09-2026");
    expect(mesCorrente(new Date(2026, 0, 15))).toBe("01-2026");
    const gravado = { expertId: "e", creativeType: "adv", creativeSeq: 3, launchType: "pg", launchSeq: 2, adDate: "2026-09-01", description: "x", notes: null };
    expect(estadoDeAnuncio(gravado, "editar")).toEqual({ ...ESTADO_VAZIO_DO_ANUNCIO, expertId: "e", creativeType: "adv", creativeSeq: "03", launchType: "pg", launchSeq: "02", date: "09-2026", description: "x", notes: "" });
    expect(estadoDeAnuncio(gravado, "duplicar").creativeSeq).toBe("");
  });
  it("corpoDoAnuncio: NN vazio vira null (o servidor escolhe); descrição vazia vira null", () => {
    expect(corpoDoAnuncio({ ...cheio, creativeSeq: "", description: "  " })).toEqual({ expertId: "e", creativeType: "adv", creativeSeq: null, launchType: "pg", launchSeq: 2, date: "09-2026", description: null, notes: null });
    expect(corpoDoAnuncio(cheio).creativeSeq).toBe(3);
  });
});
