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
  // Story 47.13
  origins: [
    { value: "ia", active: true },
    { value: "h", active: true },
  ],
  partes: [
    { expert: "dg", type: "hook", code: "h01", active: true },
    { expert: "dg", type: "hook", code: "h02", active: false },
    { expert: "dg", type: "body", code: "b01", active: true },
    { expert: "bbe", type: "hook", code: "h01", active: true },
    // h03 existe SÓ no bbe — o teste do "expert do nome" precisa de um código que exista em outro expert
    { expert: "bbe", type: "hook", code: "h03", active: true },
  ],
});

// Story 47.13: a amostra genérica de 4 campos é `ad` — `adv` passou a ter 7 (v2) e o
// formato de 4 virou "padrão antigo" com aviso. Os testes originais da 47.10 seguem
// aqui, só com o tipo trocado: é o "velho → novo → velho" para ad/carr (AC12).
const CAMPOS = { creativeType: "ad", creativeSeq: 3, expert: "dg", launchType: "pg", launchSeq: 2, date: "09-2026" };
/** O exemplo literal do pedido do gestor (15/09/2026): adv01_h_dg_pg04_h01_b01_09-2026-- */
const VIDEO = { creativeType: "adv", creativeSeq: 1, origin: "h", expert: "dg", launchType: "pg", launchSeq: 4, hookCode: "h01", bodyCode: "b01", date: "09-2026" };

describe("buildAdName", () => {
  it("estrutura até o -- e nome completo; sem descrição os dois são iguais", () => {
    expect(buildAdName(CAMPOS)).toEqual({ structure: "ad03_dg_pg02_09-2026--", name: "ad03_dg_pg02_09-2026--" });
    expect(buildAdName({ ...CAMPOS, description: "gancho-demissao" })).toEqual({ structure: "ad03_dg_pg02_09-2026--", name: "ad03_dg_pg02_09-2026--gancho-demissao" });
  });
  it("NN sempre com dois dígitos", () => {
    expect(buildAdName({ ...CAMPOS, creativeSeq: 7, launchSeq: 1 }).structure).toBe("ad07_dg_pg01_09-2026--");
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
    const p = pedacosDoAnuncio({ creativeType: "ad", creativeSeq: 3, expert: "dg" });
    expect(p.map((x) => [x.campo, x.valor, x.faltando])).toEqual([
      ["creative", "ad03", false],
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
    const r = parseAdName("ad03_dg_pg02_09-2026--gancho-demissao", snap());
    expect(r).toMatchObject({ valid: true, errors: [], avisos: [], fields: { ...CAMPOS, description: "gancho-demissao" } });
    expect(r.partes).toEqual(["ad03", "dg", "pg02", "09-2026", "gancho-demissao"]);
    const semDesc = parseAdName("ad03_dg_pg02_09-2026--", snap());
    expect(semDesc.valid).toBe(true);
    expect(semDesc.fields?.description).toBeUndefined();
  });
  it("quebra no PRIMEIRO --: um -- dentro da descrição é erro da descrição, não da estrutura", () => {
    const r = parseAdName("ad03_dg_pg02_09-2026--gancho--dor", snap());
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['campo 5 (descrição): "gancho--dor" fora de [a-z0-9-] (sem "--")']);
  });
  it("sem -- é erro; estrutura com 3 ou 5 campos é erro de contagem", () => {
    expect(parseAdName("ad03_dg_pg02_09-2026", snap()).errors[0]).toMatch(/falta o separador "--"/);
    expect(parseAdName("ad03_dg_pg02--x", snap()).errors[0]).toMatch(/encontrados 2 \(3 campos\)/);
    expect(parseAdName("ad03_dg_pg02_09-2026_x--", snap()).errors[0]).toMatch(/encontrados 4 \(5 campos\)/);
  });
  it("tipo e sigla vêm do dicionário; inativo é válido com aviso; expert inexistente é erro", () => {
    expect(parseAdName("img03_dg_pg02_09-2026--", snap()).errors).toContain('campo 1 (criativo): tipo "img" não está no dicionário de tipo de criativo');
    expect(parseAdName("ad03_dg_xx02_09-2026--", snap()).errors).toContain('campo 3 (lançamento): sigla "xx" não está no dicionário de sigla de lançamento');
    const inativo = parseAdName("carr03_bbe_pg02_09-2026--", snap());
    expect(inativo.valid).toBe(true);
    expect(inativo.avisos).toEqual(["campo 2 (expert): bbe está inativo", "campo 1 (criativo): carr está inativo"]);
    expect(parseAdName("ad03_zz_pg02_09-2026--", snap()).errors).toContain('campo 2 (expert): "zz" não está cadastrado');
  });
  it("NN sem dois dígitos e data fora de mm-aaaa são estruturais", () => {
    expect(parseAdName("ad3_dg_pg02_09-2026--", snap()).errors).toContain('campo 1 (criativo): "ad3" não é tipo + NN (ex.: adv03)');
    expect(parseAdName("ad03_dg_pg02_2026-09--", snap()).errors).toContain('campo 4 (data): "2026-09" não está em mm-aaaa');
    expect(parseAdName("AD03_dg_pg02_09-2026--", snap()).errors.some((e) => /maiúscula/.test(e))).toBe(true);
  });
  it("build → parse fecha o ciclo", () => {
    const { name } = buildAdName({ ...CAMPOS, description: "prova-social" });
    expect(parseAdName(name, snap()).fields).toEqual({ ...CAMPOS, description: "prova-social" });
  });
});

describe("Story 47.13 — nome de vídeo v2 (adv)", () => {
  it("AC1: o exemplo do pedido, literal — adv01_h_dg_pg04_h01_b01_09-2026--", () => {
    expect(buildAdName(VIDEO)).toEqual({ structure: "adv01_h_dg_pg04_h01_b01_09-2026--", name: "adv01_h_dg_pg04_h01_b01_09-2026--" });
    expect(buildAdName({ ...VIDEO, origin: "ia", hookCode: "h02", description: "gancho-demissao" }).name).toBe("adv01_ia_dg_pg04_h02_b01_09-2026--gancho-demissao");
  });
  it("AC1: em adv, origem, hook e body são obrigatórios e têm formato — cada erro nomeia o campo na posição do vídeo", () => {
    expect(() => buildAdName({ ...VIDEO, origin: undefined })).toThrow(/campo 2 \(origem\): obrigatória em vídeo/);
    expect(() => buildAdName({ ...VIDEO, origin: "" })).toThrow(/campo 2 \(origem\)/);
    expect(() => buildAdName({ ...VIDEO, hookCode: undefined })).toThrow(/campo 5 \(hook\): obrigatório em vídeo/);
    expect(() => buildAdName({ ...VIDEO, hookCode: "hook1" })).toThrow(/campo 5 \(hook\): "hook1" não é h \+ dois dígitos/);
    expect(() => buildAdName({ ...VIDEO, bodyCode: undefined })).toThrow(/campo 6 \(body\): obrigatório em vídeo/);
    expect(() => buildAdName({ ...VIDEO, bodyCode: "h01" })).toThrow(/campo 6 \(body\): "h01" não é b \+ dois dígitos/);
    // a data é o campo 7 no vídeo (era 4 em ad/carr)
    expect(() => buildAdName({ ...VIDEO, date: "2026-09" })).toThrow(/campo 7 \(data\)/);
    expect(() => buildAdName({ ...VIDEO, description: "a--b" })).toThrow(/campo 8 \(descrição\)/);
  });
  it("AC1: fora de adv, origem/hook/body são PROIBIDOS — ad com origem é nome errado", () => {
    expect(() => buildAdName({ ...CAMPOS, origin: "h" })).toThrow(/campo 1 \(criativo\): origem "h" só existe no vídeo \(adv\)/);
    expect(() => buildAdName({ ...CAMPOS, hookCode: "h01" })).toThrow(/hook "h01" só existe no vídeo/);
    expect(() => buildAdName({ ...CAMPOS, creativeType: "carr", bodyCode: "b01" })).toThrow(/body "b01" só existe no vídeo/);
    // vazio não conta como "presente"
    expect(buildAdName({ ...CAMPOS, origin: "", hookCode: "", bodyCode: "" }).structure).toBe("ad03_dg_pg02_09-2026--");
  });
  it("AC3: pedacosDoAnuncio tem 7 estruturais para adv (na ordem do pedido) e 4 para os outros", () => {
    const v = pedacosDoAnuncio({ creativeType: "adv", creativeSeq: 1, expert: "dg", hookCode: "h01" });
    expect(v.map((x) => [x.campo, x.valor, x.faltando])).toEqual([
      ["creative", "adv01", false],
      ["origin", "", true],
      ["expert", "dg", false],
      ["launch", "", true],
      ["hook", "h01", false],
      ["body", "", true],
      ["date", "", true],
      ["description", "", false],
    ]);
    expect(v.find((x) => x.campo === "origin")?.bloco).toBe("origem");
    expect(v.find((x) => x.campo === "hook")?.bloco).toBe("gancho");
    expect(pedacosDoAnuncio({ creativeType: "carr" }).map((x) => x.campo)).toEqual(["creative", "expert", "launch", "date", "description"]);
    // sem tipo escolhido ainda: 4 (não inventa o vídeo)
    expect(pedacosDoAnuncio({}).map((x) => x.campo)).toEqual(["creative", "expert", "launch", "date", "description"]);
  });
  it("AC2: parse decide pelo tipo — adv com 7 campos é v2; com 4 é padrão antigo (válido, com aviso); outra contagem é erro do vídeo", () => {
    const v2 = parseAdName("adv01_h_dg_pg04_h01_b01_09-2026--", snap());
    expect(v2).toMatchObject({ valid: true, video: true, legado: false, errors: [], avisos: [], fields: VIDEO });
    expect(v2.partes).toEqual(["adv01", "h", "dg", "pg04", "h01", "b01", "09-2026", ""]);
    const antigo = parseAdName("adv03_dg_pg02_09-2026--gancho-demissao", snap());
    expect(antigo).toMatchObject({ valid: true, video: true, legado: true, errors: [] });
    expect(antigo.avisos).toContain("padrão antigo (47.10): sem origem, hook e body");
    expect(antigo.fields).toEqual({ creativeType: "adv", creativeSeq: 3, expert: "dg", launchType: "pg", launchSeq: 2, date: "09-2026", description: "gancho-demissao" });
    const cinco = parseAdName("adv01_h_dg_pg04_09-2026--", snap());
    expect(cinco.valid).toBe(false);
    expect(cinco.errors[0]).toMatch(/vídeo \(adv\): esperados 7 campos antes do "--" \(v2\) ou 4 \(padrão antigo\), encontrados 5/);
    // ad com 7 campos NÃO vira vídeo: é erro de contagem dos 4
    expect(parseAdName("ad01_h_dg_pg04_h01_b01_09-2026--", snap()).errors[0]).toMatch(/encontrados 6 \(7 campos\)/);
  });
  it("AC2: origem vem do dicionário; hook e body do cadastro DO EXPERT do nome; inativo é aviso, não erro", () => {
    expect(parseAdName("adv01_x_dg_pg04_h01_b01_09-2026--", snap()).errors).toContain('campo 2 (origem): "x" não está no dicionário de origem do vídeo');
    // h09 não existe em ninguém; h03 existe SÓ no bbe — o nome é do dg, então os dois são erro (matriz AC13, regra 4)
    expect(parseAdName("adv01_h_dg_pg04_h09_b01_09-2026--", snap()).errors).toContain("campo 5 (hook): h09 não está cadastrado para dg");
    expect(parseAdName("adv01_h_dg_pg04_h03_b01_09-2026--", snap()).errors).toContain("campo 5 (hook): h03 não está cadastrado para dg");
    expect(parseAdName("adv01_h_bbe_pg04_h01_b01_09-2026--", snap()).errors).toContain("campo 6 (body): b01 não está cadastrado para bbe");
    const inativo = parseAdName("adv01_h_dg_pg04_h02_b01_09-2026--", snap());
    expect(inativo.valid).toBe(true);
    expect(inativo.avisos).toContain("campo 5 (hook): h02 está inativo");
    expect(parseAdName("adv01_h_dg_pg04_hx_b01_09-2026--", snap()).errors).toContain('campo 5 (hook): "hx" não é h + dois dígitos (ex.: h01)');
  });
  it("AC2: snapshot de API anterior (sem origins/partes) não inventa validação — avisa e segue válido", () => {
    const velho = snap();
    delete velho.origins;
    delete velho.partes;
    const r = parseAdName("adv01_h_dg_pg04_h01_b01_09-2026--", velho);
    expect(r.valid).toBe(true);
    expect(r.avisos).toEqual([
      "campo 2 (origem): snapshot sem origens (API anterior à 47.13) — não validada",
      "campo 5 (hook): snapshot sem hooks/bodies (API anterior à 47.13) — não validados",
    ]);
  });
  it("AC12: velho → novo → velho — ad e carr constroem e parseiam byte a byte como antes; build → parse fecha o ciclo no v2", () => {
    const fixture = [
      "ad01_dg_pg02_09-2026--",
      "ad07_dg_l01_10-2026--prova-social",
      "carr02_bbe_pg03_09-2026--",
    ];
    for (const nome of fixture) {
      const r = parseAdName(nome, snap());
      expect(r.valid).toBe(true);
      expect(r.legado).toBe(false);
      expect(buildAdName(r.fields!).name).toBe(nome);
    }
    const { name } = buildAdName({ ...VIDEO, description: "prova-social" });
    expect(parseAdName(name, snap()).fields).toEqual({ ...VIDEO, description: "prova-social" });
  });
});
