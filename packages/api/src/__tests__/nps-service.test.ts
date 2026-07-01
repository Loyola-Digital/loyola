import { describe, it, expect } from "vitest";
import {
  parseScore,
  classifyNps,
  mapNpsRows,
  indexLoyola,
  crossNps,
  summarizeNps,
  findCol,
  findNameHeader,
} from "../services/nps";

describe("parseScore", () => {
  it("extrai 0..10 e arredonda; rejeita fora do range", () => {
    expect(parseScore("9")).toBe(9);
    expect(parseScore("Nota 10")).toBe(10);
    expect(parseScore("8,0")).toBe(8);
    expect(parseScore("0")).toBe(0);
    expect(parseScore("11")).toBeNull();
    expect(parseScore("")).toBeNull();
    expect(parseScore(null)).toBeNull();
    expect(parseScore("sem nota")).toBeNull();
  });
});

describe("classifyNps", () => {
  it("promotor 9-10, neutro 7-8, detrator 0-6", () => {
    expect(classifyNps(10)).toBe("promotor");
    expect(classifyNps(9)).toBe("promotor");
    expect(classifyNps(8)).toBe("neutro");
    expect(classifyNps(7)).toBe("neutro");
    expect(classifyNps(6)).toBe("detrator");
    expect(classifyNps(0)).toBe("detrator");
    expect(classifyNps(null)).toBeNull();
  });
});

describe("findCol", () => {
  it("casa header ignorando caixa e acento", () => {
    const h = ["Data/Hora", "Nome", "E-mail", "Nota de 0 a 10"];
    expect(findCol(h, "nome")).toBe(1);
    expect(findCol(h, "Nota de 0 a 10")).toBe(3);
    expect(findCol(h, "inexistente")).toBe(-1);
    expect(findCol(h, undefined)).toBe(-1);
  });
});

describe("mapNpsRows", () => {
  const headers = ["Carimbo", "Nome", "Email", "Nota"];
  const rows = [
    ["2026-06-01 10:00", "Maria Silva", "maria@x.com", "10"],
    ["2026-06-01 10:05", "João Souza", "joao@x.com", "6"],
    ["", "", "", ""], // linha vazia ignorada
  ];
  it("mapeia colunas e classifica", () => {
    const out = mapNpsRows(headers, rows, { name: "Nome", email: "Email", score: "Nota", timestamp: "Carimbo" });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "Maria Silva", email: "maria@x.com", score: 10, sentiment: "promotor", positive: true });
    expect(out[1]).toMatchObject({ score: 6, sentiment: "detrator", positive: false });
  });
});

describe("crossNps + summarize", () => {
  const loyolaHeaders = ["Email", "Nome completo", "Qual sua maior dor?"];
  const loyolaRows = [
    ["MARIA@x.com", "Maria Silva", "Falta de tempo"],
    ["outro@x.com", "Carlos Lima", "Preço"],
  ];

  it("cruza por e-mail (case-insensitive) e anexa infos", () => {
    const idx = indexLoyola(loyolaHeaders, loyolaRows, "Email", "Nome completo");
    const resp = mapNpsRows(["Nome", "Email", "Nota"], [["Maria S.", "maria@x.com", "9"]], { name: "Nome", email: "Email", score: "Nota" });
    const cross = crossNps(resp, idx);
    expect(cross[0].matched).toBe(true);
    expect(cross[0].matchedBy).toBe("email");
    expect(cross[0].loyola?.["Qual sua maior dor?"]).toBe("Falta de tempo");
  });

  it("cai pra nome quando NPS não tem e-mail", () => {
    const idx = indexLoyola(loyolaHeaders, loyolaRows, "Email", "Nome completo");
    const resp = mapNpsRows(["Nome", "Nota"], [["carlos lima", "7"]], { name: "Nome", score: "Nota" });
    const cross = crossNps(resp, idx);
    expect(cross[0].matched).toBe(true);
    expect(cross[0].matchedBy).toBe("nome");
    expect(cross[0].loyola?.["Email"]).toBe("outro@x.com");
  });

  it("matched=false quando não acha; summary calcula NPS", () => {
    const idx = indexLoyola(loyolaHeaders, loyolaRows, "Email", "Nome completo");
    const resp = mapNpsRows(
      ["Nome", "Email", "Nota"],
      [["Maria S.", "maria@x.com", "10"], ["Zé", "ze@x.com", "5"], ["Ninguém", "x@x.com", "8"]],
      { name: "Nome", email: "Email", score: "Nota" },
    );
    const cross = crossNps(resp, idx);
    expect(cross.find((c) => c.email === "ze@x.com")?.matched).toBe(false);
    const s = summarizeNps(cross);
    expect(s.total).toBe(3);
    expect(s.promotores).toBe(1);
    expect(s.neutros).toBe(1);
    expect(s.detratores).toBe(1);
    expect(s.matched).toBe(1);
    // %prom 33.3 - %detr 33.3 = 0
    expect(s.npsScore).toBe(0);
  });
});

describe("findNameHeader + match por nome fuzzy", () => {
  const headers = ["Seu nome completo", "Qual sua dor?"];
  const rows = [
    ["Daniele Aparecida de Godoy", "A"],
    ["Bruno Alexandre Neris da Silva", "B"],
    ["Marco Túlio Ferreira Naves", "C"],
  ];
  const idx = indexLoyola(headers, rows, undefined, findNameHeader(headers));
  const cross = (name: string) =>
    crossNps(mapNpsRows(["Nome", "Nota"], [[name, "9"]], { name: "Nome", score: "Nota" }), idx)[0];

  it("detecta a coluna de nome por heurística (não só lista fixa)", () => {
    expect(findNameHeader(headers)).toBe("Seu nome completo");
    expect(findNameHeader(["Qual é o seu nome", "x"])).toBe("Qual é o seu nome");
    expect(findNameHeader(["Nome do restaurante", "x"])).toBeUndefined();
  });

  it("casa nome curto vs completo (primeiro+último e subconjunto de tokens)", () => {
    expect(cross("Daniele Godoy").matched).toBe(true);
    expect(cross("Bruno Neris").matched).toBe(true);
    expect(cross("Marco Túlio Ferreira").matched).toBe(true);
    expect(cross("Daniele Godoy").loyola?.["Qual sua dor?"]).toBe("A");
  });

  it("não casa nome ausente", () => {
    expect(cross("Fulano Inexistente").matched).toBe(false);
  });
});
