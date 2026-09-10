/**
 * Story 47.10 — `buildAdName` e `parseAdName` (AC6). Módulo do `shared`,
 * testado aqui porque o `shared` não tem runner.
 */
import { describe, expect, it } from "vitest";
import { buildAdName, mesAnoDe, parseAdName, pedacosDoAnuncio, primeiroDiaDoMes, type AdSnapshot } from "@loyola-x/shared";
import { proximoNnDeAnuncio } from "../services/nomenclatura/anuncios.js";

const snap = (): AdSnapshot => ({
  experts: [
    { code: "dg", active: true },
    { code: "bbe", active: false },
  ],
  creativeTypes: [
    { value: "ad", active: true },
    { value: "adv", active: true },
    { value: "carr", active: false },
  ],
  launchTypes: [
    { value: "pg", active: true },
    { value: "l", active: true },
  ],
});

const CAMPOS = { creativeType: "adv", creativeSeq: 3, expert: "dg", launchType: "pg", launchSeq: 2, date: "09-2026" };

describe("buildAdName", () => {
  it("estrutura até o -- e nome completo; sem descrição os dois são iguais", () => {
    expect(buildAdName(CAMPOS)).toEqual({ structure: "adv03_dg_pg02_09-2026--", name: "adv03_dg_pg02_09-2026--" });
    expect(buildAdName({ ...CAMPOS, description: "gancho-demissao" })).toEqual({ structure: "adv03_dg_pg02_09-2026--", name: "adv03_dg_pg02_09-2026--gancho-demissao" });
  });
  it("NN sempre com dois dígitos", () => {
    expect(buildAdName({ ...CAMPOS, creativeSeq: 7, launchSeq: 1 }).structure).toBe("adv07_dg_pg01_09-2026--");
  });
  it("lança nomeando o campo: NN fora de 1–99, data fora de mm-aaaa, descrição com _ ou --", () => {
    expect(() => buildAdName({ ...CAMPOS, creativeSeq: 0 })).toThrow(/campo 1 \(criativo\)/);
    expect(() => buildAdName({ ...CAMPOS, launchSeq: 100 })).toThrow(/campo 3 \(lançamento\)/);
    expect(() => buildAdName({ ...CAMPOS, date: "2026-09" })).toThrow(/campo 4 \(data\): "2026-09" não está em mm-aaaa/);
    expect(() => buildAdName({ ...CAMPOS, date: "13-2026" })).toThrow(/campo 4/);
    expect(() => buildAdName({ ...CAMPOS, description: "gancho_demissao" })).toThrow(/campo 5 \(descrição\)/);
    expect(() => buildAdName({ ...CAMPOS, description: "gancho--demissao" })).toThrow(/campo 5 \(descrição\)/);
  });
  it("pedacosDoAnuncio: quatro estruturais + descrição (que nunca falta)", () => {
    const p = pedacosDoAnuncio({ creativeType: "adv", creativeSeq: 3, expert: "dg" });
    expect(p.map((x) => [x.campo, x.valor, x.faltando])).toEqual([
      ["creative", "adv03", false],
      ["expert", "dg", false],
      ["launch", "", true],
      ["date", "", true],
      ["description", "", false],
    ]);
  });
});

describe("mm-aaaa", () => {
  it("mesAnoDe: Date e AAAA-MM-DD → mm-aaaa; primeiroDiaDoMes faz a volta", () => {
    expect(mesAnoDe(new Date(2026, 8, 10))).toBe("09-2026");
    expect(mesAnoDe("2026-09-01")).toBe("09-2026");
    expect(primeiroDiaDoMes("09-2026")).toBe("2026-09-01");
    expect(primeiroDiaDoMes("13-2026")).toBeNull();
    expect(primeiroDiaDoMes("2026-09")).toBeNull();
  });
});

describe("proximoNnDeAnuncio — sequência única por expert (Q3)", () => {
  it("menor livre, contando todos os tipos; null depois de 99", () => {
    expect(proximoNnDeAnuncio([])).toBe(1);
    expect(proximoNnDeAnuncio([1, 2, 4])).toBe(3);
    expect(proximoNnDeAnuncio(Array.from({ length: 99 }, (_, i) => i + 1))).toBeNull();
  });
});

describe("parseAdName — AC6", () => {
  it("nome válido, com e sem descrição; a descrição pode ter -", () => {
    const r = parseAdName("adv03_dg_pg02_09-2026--gancho-demissao", snap());
    expect(r).toMatchObject({ valid: true, errors: [], fields: { ...CAMPOS, description: "gancho-demissao" } });
    expect(r.partes).toEqual(["adv03", "dg", "pg02", "09-2026", "gancho-demissao"]);
    const semDesc = parseAdName("adv03_dg_pg02_09-2026--", snap());
    expect(semDesc.valid).toBe(true);
    expect(semDesc.fields?.description).toBeUndefined();
  });
  it("quebra no PRIMEIRO --: um -- dentro da descrição é erro da descrição, não da estrutura", () => {
    const r = parseAdName("adv03_dg_pg02_09-2026--gancho--dor", snap());
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['campo 5 (descrição): "gancho--dor" fora de [a-z0-9-] (sem "--")']);
  });
  it("sem -- é erro; estrutura com 3 ou 5 campos é erro de contagem", () => {
    expect(parseAdName("adv03_dg_pg02_09-2026", snap()).errors[0]).toMatch(/falta o separador "--"/);
    expect(parseAdName("adv03_dg_pg02--x", snap()).errors[0]).toMatch(/encontrados 2 \(3 campos\)/);
    expect(parseAdName("adv03_dg_pg02_09-2026_x--", snap()).errors[0]).toMatch(/encontrados 4 \(5 campos\)/);
  });
  it("tipo e sigla vêm do dicionário; inativo é válido com aviso; expert inexistente é erro", () => {
    expect(parseAdName("img03_dg_pg02_09-2026--", snap()).errors).toContain('campo 1 (criativo): tipo "img" não está no dicionário de tipo de criativo');
    expect(parseAdName("adv03_dg_xx02_09-2026--", snap()).errors).toContain('campo 3 (lançamento): sigla "xx" não está no dicionário de sigla de lançamento');
    const inativo = parseAdName("carr03_bbe_pg02_09-2026--", snap());
    expect(inativo.valid).toBe(true);
    expect(inativo.avisos).toEqual(["campo 2 (expert): bbe está inativo", "campo 1 (criativo): carr está inativo"]);
    expect(parseAdName("adv03_zz_pg02_09-2026--", snap()).errors).toContain('campo 2 (expert): "zz" não está cadastrado');
  });
  it("NN sem dois dígitos e data fora de mm-aaaa são estruturais", () => {
    expect(parseAdName("adv3_dg_pg02_09-2026--", snap()).errors).toContain('campo 1 (criativo): "adv3" não é tipo + NN (ex.: adv03)');
    expect(parseAdName("adv03_dg_pg02_2026-09--", snap()).errors).toContain('campo 4 (data): "2026-09" não está em mm-aaaa');
    expect(parseAdName("ADV03_dg_pg02_09-2026--", snap()).errors.some((e) => /maiúscula/.test(e))).toBe(true);
  });
  it("build → parse fecha o ciclo", () => {
    const { name } = buildAdName({ ...CAMPOS, description: "prova-social" });
    expect(parseAdName(name, snap()).fields).toEqual({ ...CAMPOS, description: "prova-social" });
  });
});
