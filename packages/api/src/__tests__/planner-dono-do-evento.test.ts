/**
 * De quem é cada evento do Google — e de quem é o vínculo.
 *
 * O caso real de 21/09/2026: campanha com hífen no nome ("DGL3 - BLACK CPDF")
 * grava eventos "DGL3 - BLACK CPDF - Prod. Captação". A importação cortava no
 * PRIMEIRO hífen e criava a campanha fantasma "DGL3" com os mesmos eventos. O
 * time via o card em dobro, excluía o "duplicado" — e a exclusão apagava os
 * eventos da campanha verdadeira no Google.
 */

import { describe, expect, it } from "vitest";
import { donoDoEvento, faseNoTitulo, mesmasFases, semEventosRepetidos } from "../services/planner-sync.js";
import { vinculosDoServidor } from "../services/planner.js";

const AGENDA = "dg@group.calendar.google.com";
const fase = (id: string, name: string, googleEventId?: string) => ({
  id,
  name,
  start: "2026-10-05",
  end: "2026-10-14",
  ...(googleEventId ? { googleEventId } : {}),
});
const campanha = (id: string, name: string, phases: ReturnType<typeof fase>[], cal = AGENDA) => ({
  id,
  name,
  googleCalendarId: cal,
  phases,
});

describe("faseNoTitulo", () => {
  it("tira o nome INTEIRO da campanha, mesmo com hífen dentro", () => {
    expect(faseNoTitulo("DGL3 - BLACK CPDF - Prod. Captação", "DGL3 - BLACK CPDF")).toBe("Prod. Captação");
  });

  it("aceita o formato com colchete", () => {
    expect(faseNoTitulo("[BBEPR2] Prod. captação — Margem 3X", "BBEPR2")).toBe("Prod. captação — Margem 3X");
  });

  it("não confunde campanha que é começo de outra", () => {
    // "PP" não é dono de "PPX - Fase": o nome precisa terminar num separador.
    expect(faseNoTitulo("PPX - Fase", "PP")).toBeNull();
  });

  it("ignora caixa", () => {
    expect(faseNoTitulo("fzl4 - black mfb - Definições", "FZL4 - BLACK MFB")).toBe("Definições");
  });
});

describe("donoDoEvento", () => {
  it("campanha com hífen no nome é a dona — não vira fantasma pelo primeiro hífen", () => {
    const real = campanha("1", "DGL3 - BLACK CPDF", [fase("a", "Prod. Captação")]);
    const e = { id: "ev-novo", titulo: "DGL3 - BLACK CPDF - Exec. CPL" };
    expect(donoDoEvento(e, [real], AGENDA)?.id).toBe("1");
  });

  it("o nome mais LONGO ganha: 'PP - Perpétuo Ansiedade' e não 'PP'", () => {
    const curta = campanha("1", "PP", []);
    const longa = campanha("2", "PP - Perpétuo Ansiedade", []);
    const e = { id: "x", titulo: "PP - Perpétuo Ansiedade - Prod. Carrinho" };
    expect(donoDoEvento(e, [curta, longa], AGENDA)?.id).toBe("2");
  });

  it("o vínculo manda mais que o título", () => {
    // Evento renomeado à mão no Google continua da campanha que o tem.
    const dona = campanha("1", "FZL4 - BLACK MFB", [fase("a", "Definições", "ev1")]);
    const e = { id: "ev1", titulo: "Renomeado no Google" };
    expect(donoDoEvento(e, [dona], AGENDA)?.id).toBe("1");
  });

  it("entre duas com o mesmo id (cópia), fica a que o título aponta", () => {
    const original = campanha("1", "DG REN1 - Renovação CPDF", [fase("a", "Prod. Captação", "ev1")]);
    const copia = campanha("2", "DG REN2 - Renovação CPDF", [fase("b", "Prod. Captação", "ev1")]);
    const e = { id: "ev1", titulo: "DG REN1 - Renovação CPDF - Prod. Captação" };
    expect(donoDoEvento(e, [copia, original], AGENDA)?.id).toBe("1");
  });

  it("campanha de OUTRA agenda não é dona, nem com o id", () => {
    // FZ REN1 apontava para eventos da agenda do DG (cópia feita antes do #894).
    const fz = campanha("1", "FZ REN1 - Renovação MFB", [fase("a", "Prod. Captação", "ev1")], "fz@group");
    const e = { id: "ev1", titulo: "DG REN1 - Renovação CPDF - Prod. Captação" };
    expect(donoDoEvento(e, [fz], AGENDA)).toBeNull();
  });

  it("sem dona, devolve null — quem importa cai no corte pelo título", () => {
    expect(donoDoEvento({ id: "x", titulo: "FZ BLACK - Definições" }, [], AGENDA)).toBeNull();
  });
});

describe("vinculosDoServidor", () => {
  it("fase que já existe fica com o id do BANCO, não com o que a tela mandou", () => {
    // Tela com cache velho mandava o id antigo e desfazia o vínculo novo.
    const antes = [fase("a", "Prod. Captação", "ev-novo")];
    const depois = [fase("a", "Prod. Captação", "ev-velho")];
    expect(vinculosDoServidor(depois, antes, new Set())[0]!.googleEventId).toBe("ev-novo");
  });

  it("fase nova não herda id nenhum: ganha evento próprio", () => {
    // O desfazer da exclusão devolve a fase com o id de um evento já apagado.
    const r = vinculosDoServidor([fase("n", "Nova", "ev-apagado")], [], new Set());
    expect(r[0]!.googleEventId).toBeUndefined();
  });

  it("id que é de OUTRA campanha é descartado", () => {
    const antes = [fase("a", "Prod. Captação", "ev-da-outra")];
    const r = vinculosDoServidor(antes, antes, new Set(["ev-da-outra"]));
    expect(r[0]!.googleEventId).toBeUndefined();
  });

  it("a pendência também é do servidor", () => {
    const antes = [{ ...fase("a", "X", "ev"), googleSyncPendente: true }];
    const r = vinculosDoServidor([fase("a", "X", "ev")], antes, new Set());
    expect(r[0]!.googleSyncPendente).toBe(true);
  });
});

describe("semEventosRepetidos", () => {
  const ev = (googleEventId: string, name: string, start: string) => ({ id: `g${googleEventId}`, name, start, end: start, googleEventId });

  it("evento solto igual a uma fase que já tem evento é cópia — sai", () => {
    // O card em dobro dentro da campanha: a fase ligada + a sobra no Google.
    const r = semEventosRepetidos(
      [ev("ligado", "Prod. Carrinho", "2026-12-08"), ev("sobra", "Prod. Carrinho", "2026-12-08")],
      new Set(["ligado"]),
    );
    expect(r.map((f) => f.googleEventId)).toEqual(["ligado"]);
  });

  it("perpétuo repete a fase em ciclos: mesmo nome, outra data, fica", () => {
    const r = semEventosRepetidos(
      [ev("out", "Prod. Carrinho", "2026-10-20"), ev("nov", "Prod. Carrinho", "2026-11-20")],
      new Set(["out"]),
    );
    expect(r).toHaveLength(2);
  });

  it("duas cópias soltas iguais viram uma fase só", () => {
    const r = semEventosRepetidos(
      [ev("a", "Definições", "2026-09-08"), ev("b", "definicoes", "2026-09-08")],
      new Set(),
    );
    expect(r).toHaveLength(1);
  });
});

describe("mesmasFases", () => {
  it("ignora a ordem das chaves (o jsonb reordena)", () => {
    const daTela = [{ id: "a", name: "X", start: "2026-10-01", end: "2026-10-05", googleEventId: "e" }];
    const doBanco = [{ id: "a", end: "2026-10-05", name: "X", start: "2026-10-01", googleEventId: "e" }];
    expect(mesmasFases(daTela, doBanco)).toBe(true);
  });

  it("data mudada no Google é mudança", () => {
    const a = [{ id: "a", name: "X", start: "2026-10-01", end: "2026-10-05" }];
    expect(mesmasFases(a, [{ ...a[0]!, start: "2026-10-02" }])).toBe(false);
  });
});
