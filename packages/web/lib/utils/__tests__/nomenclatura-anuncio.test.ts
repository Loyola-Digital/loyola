import { describe, expect, it } from "vitest";
import {
  ESTADO_VAZIO_DO_ANUNCIO,
  aoEscolherNoAnuncio,
  camposDoAnuncio,
  corpoDoAnuncio,
  ehVideoDoPadraoAntigo,
  estadoDeAnuncio,
  mesAnoDe,
  mesCorrente,
  nnDe,
  previaDoAnuncio,
} from "../nomenclatura-anuncio";

const experts = [{ id: "e", code: "dg" }];
// Story 47.13: `adv` passou a ser vídeo v2 (7 campos) — a amostra genérica dos testes da 47.10 vira `ad`.
const cheio = { expertId: "e", creativeType: "ad", creativeSeq: "03", launchType: "pg", launchSeq: "02", date: "09-2026", description: "", notes: "", origin: "", hookId: "", bodyId: "" };
/** O exemplo do pedido (15/09/2026), no estado do gerador: adv01_h_dg_pg04_h01_b01_09-2026-- */
const video = { expertId: "e", creativeType: "adv", creativeSeq: "01", launchType: "pg", launchSeq: "04", date: "09-2026", description: "", notes: "", origin: "h", hookId: "H1", bodyId: "B1" };
const partes = [{ id: "H1", code: "h01" }, { id: "B1", code: "b01" }, { id: "H2", code: "h02" }];

describe("estado do gerador (AC8)", () => {
  it("trocar o expert limpa os dois NN; trocar a sigla limpa o NN do lançamento; o resto fica", () => {
    expect(aoEscolherNoAnuncio(cheio, "expertId", "e2")).toMatchObject({ expertId: "e2", creativeSeq: "", launchSeq: "", creativeType: "ad", date: "09-2026" });
    expect(aoEscolherNoAnuncio(cheio, "launchType", "l")).toMatchObject({ launchType: "l", launchSeq: "", creativeSeq: "03" });
    expect(aoEscolherNoAnuncio(cheio, "creativeType", "carr")).toMatchObject({ creativeType: "carr", creativeSeq: "03" });
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
    expect(p.estrutura).toBe("ad03_dg_pg02_09-2026--");
    expect(p.nome).toBe("ad03_dg_pg02_09-2026--");
    expect(p.completo).toBe(true);
    const q = previaDoAnuncio({ ...cheio, description: "Gancho Demissão" }, experts);
    expect(q.nome).toBe("ad03_dg_pg02_09-2026--gancho-demissao");
    expect(q.estrutura).toBe("ad03_dg_pg02_09-2026--");
    expect(q.tamanho).toBe(q.nome!.length);
  });
  it("parcial: … no que falta, -- sempre desenhado, Salvar bloqueado", () => {
    const p = previaDoAnuncio({ ...cheio, launchSeq: "", date: "" }, experts);
    expect(p.completo).toBe(false);
    expect(p.nome).toBeNull();
    expect(p.texto).toBe("ad03_dg_…_…--");
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
    expect(corpoDoAnuncio({ ...cheio, creativeSeq: "", description: "  " })).toEqual({ expertId: "e", creativeType: "ad", creativeSeq: null, launchType: "pg", launchSeq: 2, date: "09-2026", description: null, notes: null, origin: null, hookId: null, bodyId: null });
    expect(corpoDoAnuncio(cheio).creativeSeq).toBe(3);
  });
});

describe("Story 47.13 — vídeo v2 no gerador", () => {
  it("AC9: trocar o tipo para algo que não é vídeo LIMPA origem, hook e body; trocar o expert limpa hook e body (são do expert) e mantém a origem", () => {
    expect(aoEscolherNoAnuncio(video, "creativeType", "ad")).toMatchObject({ creativeType: "ad", origin: "", hookId: "", bodyId: "", creativeSeq: "01" });
    expect(aoEscolherNoAnuncio(video, "creativeType", "adv")).toBe(video);
    expect(aoEscolherNoAnuncio(video, "expertId", "e2")).toMatchObject({ expertId: "e2", hookId: "", bodyId: "", origin: "h", creativeSeq: "", launchSeq: "" });
    // ad → adv não inventa nada: os três continuam vazios até a pessoa escolher
    expect(aoEscolherNoAnuncio(cheio, "creativeType", "adv")).toMatchObject({ creativeType: "adv", origin: "", hookId: "", bodyId: "" });
  });
  it("AC3/AC9: prévia do vídeo tem 7 pedaços na ordem do pedido, com os códigos (não os ids) do hook e body; sem hook escolhido, Salvar fica bloqueado", () => {
    const p = previaDoAnuncio(video, experts, partes);
    expect(p.pedacos.map((x) => x.campo)).toEqual(["creative", "origin", "expert", "launch", "hook", "body", "date", "description"]);
    expect(p.estrutura).toBe("adv01_h_dg_pg04_h01_b01_09-2026--");
    expect(p.completo).toBe(true);
    const semHook = previaDoAnuncio({ ...video, hookId: "" }, experts, partes);
    expect(semHook.completo).toBe(false);
    expect(semHook.texto).toBe("adv01_h_dg_pg04_…_b01_09-2026--");
    // hook de id desconhecido (outro expert) não vira código: fica faltando
    expect(previaDoAnuncio({ ...video, hookId: "X" }, experts, partes).completo).toBe(false);
  });
  it("AC1 na prévia: ad continua com 4 pedaços e nunca leva origem/hook/body mesmo que o estado os tenha", () => {
    const p = previaDoAnuncio({ ...cheio, origin: "h", hookId: "H1", bodyId: "B1" }, experts, partes);
    expect(p.pedacos.map((x) => x.campo)).toEqual(["creative", "expert", "launch", "date", "description"]);
    expect(p.estrutura).toBe("ad03_dg_pg02_09-2026--");
  });
  it("corpoDoAnuncio: em vídeo manda origem/hookId/bodyId; fora dele manda null nos três (a API recusa valor)", () => {
    expect(corpoDoAnuncio(video)).toMatchObject({ creativeType: "adv", origin: "h", hookId: "H1", bodyId: "B1" });
    expect(corpoDoAnuncio({ ...cheio, origin: "h", hookId: "H1", bodyId: "B1" })).toMatchObject({ creativeType: "ad", origin: null, hookId: null, bodyId: null });
  });
  it("AC7/AC10: estadoDeAnuncio traz os três; vídeo do padrão antigo é reconhecido e, duplicado, nasce com os três vazios", () => {
    const gravado = { expertId: "e", creativeType: "adv", creativeSeq: 1, launchType: "pg", launchSeq: 4, adDate: "2026-09-01", description: null, notes: null, origin: "h", hookId: "H1", bodyId: "B1" };
    expect(estadoDeAnuncio(gravado, "editar")).toMatchObject({ origin: "h", hookId: "H1", bodyId: "B1", creativeSeq: "01" });
    const antigo = { ...gravado, origin: null, hookId: null, bodyId: null };
    expect(ehVideoDoPadraoAntigo(antigo)).toBe(true);
    expect(ehVideoDoPadraoAntigo(gravado)).toBe(false);
    expect(ehVideoDoPadraoAntigo({ creativeType: "ad", origin: null })).toBe(false);
    expect(estadoDeAnuncio(antigo, "duplicar")).toMatchObject({ creativeType: "adv", creativeSeq: "", origin: "", hookId: "", bodyId: "" });
    expect(previaDoAnuncio(estadoDeAnuncio(antigo, "duplicar"), experts, partes).completo).toBe(false);
  });
});
