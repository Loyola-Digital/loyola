/**
 * Story 47.10 — `buildAdName` e `parseAdName` (AC6). Módulo do `shared`,
 * testado aqui porque o `shared` não tem runner.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_DE_PADRAO_ANTIGO,
  AVISO_DO_V2,
  PERPETUO,
  SIGLA_SEM_NUMERO,
  buildAdName,
  escopoDoNnDoCriativo,
  formatoDoVideoGravado,
  mesmoEscopoDoNn,
  mesAnoDe,
  parseAdName,
  pedacosDoAnuncio,
  primeiroDiaDoMes,
  siglaSemNumero,
  textoDoEscopoDoNn,
  textoDoLancamento,
  type AdSnapshot,
} from "@loyola-x/shared";
import { numeroDoLancamentoNoPatch, proximoNnDeAnuncio } from "../services/nomenclatura/anuncios.js";

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
    // Story 47.16: cadastrada em produção em 21/09 pelo Danilo
    { value: "perpetuo", active: true },
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
/**
 * O exemplo literal do pedido do gestor (15/09/2026): adv01_h_dg_pg04_h01_b01_09-2026--
 * Story 47.16: desde o v3 este é o formato de RE-GRAVAR um v2 publicado — `{ formato: "v2" }`.
 */
const V2 = { formato: "v2" } as const;
const VIDEO = { creativeType: "adv", creativeSeq: 1, origin: "h", expert: "dg", launchType: "pg", launchSeq: 4, hookCode: "h01", bodyCode: "b01", date: "09-2026" };

describe("buildAdName", () => {
  // 47.16 (AC4, opção B — PO-11): sem descrição o NOME termina na data; a estrutura segue com o `--`. Antes: os dois iguais.
  it("estrutura até o -- e nome completo; sem descrição o nome termina na data (47.16, opção B)", () => {
    expect(buildAdName(CAMPOS)).toEqual({ structure: "ad03_dg_pg02_09-2026--", name: "ad03_dg_pg02_09-2026" });
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

// Story 47.18 — INVERTIDO: na 47.10 (Q3) a lista era "todos os NN do expert, qualquer tipo"; agora quem chama
// passa os NN do ESCOPO (expert + sigla + nº + tipo). A função em si é a mesma: menor livre de 1 a 99.
describe("proximoNnDeAnuncio — menor livre entre os NN do escopo (47.18)", () => {
  it("menor livre entre os usados do escopo; null depois de 99", () => {
    expect(proximoNnDeAnuncio([])).toBe(1);
    expect(proximoNnDeAnuncio([1, 2, 4])).toBe(3);
    expect(proximoNnDeAnuncio(Array.from({ length: 99 }, (_, i) => i + 1))).toBeNull();
  });
});

describe("escopoDoNnDoCriativo — Story 47.18 (AC1/AC3)", () => {
  it("completo: tipo + sigla + nº; com perpetuo o nº é null e um nº que venha é ignorado", () => {
    expect(escopoDoNnDoCriativo({ creativeType: "ad", launchType: "pg", launchSeq: 5 })).toEqual({ creativeType: "ad", launchType: "pg", launchSeq: 5 });
    expect(escopoDoNnDoCriativo({ creativeType: "adv", launchType: "perpetuo" })).toEqual({ creativeType: "adv", launchType: "perpetuo", launchSeq: null });
    expect(escopoDoNnDoCriativo({ creativeType: "adv", launchType: "perpetuo", launchSeq: 4 })).toEqual({ creativeType: "adv", launchType: "perpetuo", launchSeq: null });
  });
  it("incompleto → null: sem tipo, sem sigla, ou sigla com número sem o nº", () => {
    expect(escopoDoNnDoCriativo({ launchType: "pg", launchSeq: 5 })).toBeNull();
    expect(escopoDoNnDoCriativo({ creativeType: "ad", launchSeq: 5 })).toBeNull();
    expect(escopoDoNnDoCriativo({ creativeType: "ad", launchType: "pg" })).toBeNull();
    expect(escopoDoNnDoCriativo({ creativeType: "ad", launchType: "pg", launchSeq: null })).toBeNull();
    expect(escopoDoNnDoCriativo({ creativeType: "", launchType: "perpetuo" })).toBeNull();
  });
  it("mesmoEscopoDoNn compara os três (null ≠ tudo); textoDoEscopoDoNn = lançamento (tipo), perpetuo sem número", () => {
    const pg05ad = { creativeType: "ad", launchType: "pg", launchSeq: 5 };
    expect(mesmoEscopoDoNn(pg05ad, { ...pg05ad })).toBe(true);
    expect(mesmoEscopoDoNn(pg05ad, { ...pg05ad, launchSeq: 4 })).toBe(false);
    expect(mesmoEscopoDoNn(pg05ad, { ...pg05ad, creativeType: "adv" })).toBe(false);
    expect(mesmoEscopoDoNn(pg05ad, { ...pg05ad, launchType: "l" })).toBe(false);
    expect(mesmoEscopoDoNn(null, null)).toBe(false);
    expect(mesmoEscopoDoNn(pg05ad, undefined)).toBe(false);
    expect(textoDoEscopoDoNn(pg05ad)).toBe("pg05 (ad)");
    expect(textoDoEscopoDoNn({ creativeType: "adv", launchType: "perpetuo", launchSeq: null })).toBe("perpetuo (adv)");
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
  // 47.16 (AC4, decisão 5.5 — PO-11): sem `--` passou a ser VÁLIDO, com descrição vazia. Antes: erro.
  it("sem -- é válido (descrição vazia); estrutura com 3 ou 5 campos é erro de contagem", () => {
    const semSeparador = parseAdName("ad03_dg_pg02_09-2026", snap());
    expect(semSeparador).toMatchObject({ valid: true, errors: [], avisos: [], fields: CAMPOS });
    expect(semSeparador.partes).toEqual(["ad03", "dg", "pg02", "09-2026", ""]);
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
  // 47.16: o v2 só é montado para RE-GRAVAR um publicado (`formato: "v2"`); o default virou o v3. Sem descrição, sem `--` no nome.
  it("AC1: o exemplo do pedido, literal — adv01_h_dg_pg04_h01_b01_09-2026-- (como estrutura do v2)", () => {
    expect(buildAdName(VIDEO, V2)).toEqual({ structure: "adv01_h_dg_pg04_h01_b01_09-2026--", name: "adv01_h_dg_pg04_h01_b01_09-2026" });
    expect(buildAdName({ ...VIDEO, origin: "ia", hookCode: "h02", description: "gancho-demissao" }, V2).name).toBe("adv01_ia_dg_pg04_h02_b01_09-2026--gancho-demissao");
  });
  it("AC1: em adv v2, origem, hook e body são obrigatórios e têm formato — cada erro nomeia o campo na posição do vídeo", () => {
    expect(() => buildAdName({ ...VIDEO, origin: undefined }, V2)).toThrow(/campo 2 \(origem\): obrigatória em vídeo/);
    expect(() => buildAdName({ ...VIDEO, origin: "" }, V2)).toThrow(/campo 2 \(origem\)/);
    expect(() => buildAdName({ ...VIDEO, hookCode: undefined }, V2)).toThrow(/campo 5 \(hook\): obrigatório em vídeo/);
    expect(() => buildAdName({ ...VIDEO, hookCode: "hook1" }, V2)).toThrow(/campo 5 \(hook\): "hook1" não é h \+ dois dígitos/);
    expect(() => buildAdName({ ...VIDEO, bodyCode: undefined }, V2)).toThrow(/campo 6 \(body\): obrigatório em vídeo/);
    expect(() => buildAdName({ ...VIDEO, bodyCode: "h01" }, V2)).toThrow(/campo 6 \(body\): "h01" não é b \+ dois dígitos/);
    // a data é o campo 7 no vídeo v2 (era 4 em ad/carr; é 5 no v3)
    expect(() => buildAdName({ ...VIDEO, date: "2026-09" }, V2)).toThrow(/campo 7 \(data\)/);
    expect(() => buildAdName({ ...VIDEO, description: "a--b" }, V2)).toThrow(/campo 8 \(descrição\)/);
  });
  it("AC1: fora de adv, origem/hook/body são PROIBIDOS — ad com origem é nome errado", () => {
    expect(() => buildAdName({ ...CAMPOS, origin: "h" })).toThrow(/campo 1 \(criativo\): origem "h" só existe no vídeo \(adv\)/);
    expect(() => buildAdName({ ...CAMPOS, hookCode: "h01" })).toThrow(/hook "h01" só existe no vídeo/);
    expect(() => buildAdName({ ...CAMPOS, creativeType: "carr", bodyCode: "b01" })).toThrow(/body "b01" só existe no vídeo/);
    // vazio não conta como "presente"
    expect(buildAdName({ ...CAMPOS, origin: "", hookCode: "", bodyCode: "" }).structure).toBe("ad03_dg_pg02_09-2026--");
  });
  it("AC3: pedacosDoAnuncio tem 7 estruturais para adv v2 (na ordem do pedido) e 4 para os outros", () => {
    const v = pedacosDoAnuncio({ creativeType: "adv", creativeSeq: 1, expert: "dg", hookCode: "h01" }, V2);
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
  // 47.16 (AC5): o v2 ganhou aviso PRÓPRIO (PO-02) e o de 5 campos virou o v3 válido (PO-11 :180).
  it("AC2: parse decide pelo tipo — adv com 7 campos é v2 (com aviso próprio); com 4 é padrão antigo (válido, com aviso); com 5 é v3; outra contagem é erro do vídeo", () => {
    const v2 = parseAdName("adv01_h_dg_pg04_h01_b01_09-2026--", snap());
    expect(v2).toMatchObject({ valid: true, video: true, legado: false, formato: "v2", errors: [], avisos: [AVISO_DO_V2], fields: VIDEO });
    expect(v2.partes).toEqual(["adv01", "h", "dg", "pg04", "h01", "b01", "09-2026", ""]);
    const antigo = parseAdName("adv03_dg_pg02_09-2026--gancho-demissao", snap());
    expect(antigo).toMatchObject({ valid: true, video: true, legado: true, formato: "antigo", errors: [] });
    expect(antigo.avisos).toContain("padrão antigo (47.10): sem origem, hook e body");
    expect(antigo.avisos).not.toContain(AVISO_DO_V2);
    expect(antigo.fields).toEqual({ creativeType: "adv", creativeSeq: 3, expert: "dg", launchType: "pg", launchSeq: 2, date: "09-2026", description: "gancho-demissao" });
    const cinco = parseAdName("adv01_h_dg_pg04_09-2026--", snap());
    expect(cinco).toMatchObject({ valid: true, formato: "v3", avisos: [], fields: { creativeType: "adv", creativeSeq: 1, origin: "h", expert: "dg", launchType: "pg", launchSeq: 4, date: "09-2026" } });
    expect(parseAdName("adv01_h_dg_pg04_h01_09-2026--", snap()).errors[0]).toMatch(/vídeo \(adv\): esperados 5 campos antes do "--" \(v3\), 7 \(v2\) ou 4 \(padrão antigo\), encontrados 6/);
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
      AVISO_DO_V2,
      "campo 2 (origem): snapshot sem origens (API anterior à 47.13) — não validada",
      "campo 5 (hook): snapshot sem hooks/bodies (API anterior à 47.13) — não validados",
    ]);
  });
  // 47.16 (opção B — PO-11): o nome sem descrição saiu do fixture com o `--`; ele ainda PARSEIA (o `--` é opcional), mas o build devolve sem.
  it("AC12: velho → novo → velho — ad e carr constroem e parseiam byte a byte; build → parse fecha o ciclo no v2", () => {
    const fixture = [
      "ad01_dg_pg02_09-2026",
      "ad07_dg_l01_10-2026--prova-social",
      "carr02_bbe_pg03_09-2026",
    ];
    for (const nome of fixture) {
      const r = parseAdName(nome, snap());
      expect(r.valid).toBe(true);
      expect(r.legado).toBe(false);
      expect(buildAdName(r.fields!).name).toBe(nome);
    }
    const { name } = buildAdName({ ...VIDEO, description: "prova-social" }, V2);
    expect(parseAdName(name, snap()).fields).toEqual({ ...VIDEO, description: "prova-social" });
    // o antigo com `--` e sem descrição continua lido (o parse aceita os dois)
    expect(parseAdName("ad01_dg_pg02_09-2026--", snap()).valid).toBe(true);
  });
});

// ─────────────── Story 47.16 — nome v3: `perpetuo` sem número, hook/body fora do nome, `--` opcional ───────────────

/** O snapshot de produção do dg em 23/09: h01–h06 e b01–b06 cadastrados e ativos. */
const snapDoDg = (): AdSnapshot => ({
  ...snap(),
  partes: [1, 2, 3, 4, 5, 6].flatMap((n) => [
    { expert: "dg", type: "hook" as const, code: `h0${n}`, active: true },
    { expert: "dg", type: "body" as const, code: `b0${n}`, active: true },
  ]),
});
/** Os 6 nomes do dg no Meta, LITERAIS (levantamento de 23/09). */
const SEIS = [1, 2, 3, 4, 5, 6].map((n) => `adv0${n}_ia_dg_perpetuo_h0${n}_b0${n}_09-2026`);
const PERPETUO_V3 = { creativeType: "adv", creativeSeq: 1, origin: "ia", expert: "dg", launchType: "perpetuo", date: "09-2026" };

describe("Story 47.16 — nome v3", () => {
  it("PO-09: a sigla sem número é a constante PERPETUO do shared (redeclarada no módulo folha, igual byte a byte)", () => {
    expect(SIGLA_SEM_NUMERO).toBe(PERPETUO);
    expect(siglaSemNumero("perpetuo")).toBe(true);
    expect(siglaSemNumero("pg")).toBe(false);
    expect(siglaSemNumero("perpetuo01")).toBe(false);
  });

  it("AC1/AC2: build — perpetuo sem número é válido nos três tipos; os exemplos literais da story", () => {
    expect(buildAdName(PERPETUO_V3)).toEqual({ structure: "adv01_ia_dg_perpetuo_09-2026--", name: "adv01_ia_dg_perpetuo_09-2026" });
    expect(buildAdName({ ...PERPETUO_V3, origin: "h", launchType: "pg", launchSeq: 4 }).name).toBe("adv01_h_dg_pg04_09-2026");
    expect(buildAdName({ creativeType: "ad", creativeSeq: 7, expert: "dg", launchType: "perpetuo", date: "09-2026" }).name).toBe("ad07_dg_perpetuo_09-2026");
    // null explícito = ausente (é o que o serviço manda com a coluna nullable)
    expect(buildAdName({ ...PERPETUO_V3, launchSeq: null }).name).toBe("adv01_ia_dg_perpetuo_09-2026");
    // com descrição: estrutura + descrição, como sempre
    expect(buildAdName({ ...PERPETUO_V3, description: "gancho-demissao" })).toEqual({ structure: "adv01_ia_dg_perpetuo_09-2026--", name: "adv01_ia_dg_perpetuo_09-2026--gancho-demissao" });
  });

  it("AC1: build — número com perpetuo é ERRO; outra sigla sem número é ERRO (em cada formato, na posição certa)", () => {
    expect(() => buildAdName({ ...PERPETUO_V3, launchSeq: 1 })).toThrow(/campo 4 \(lançamento\): "perpetuo" não tem número do lançamento \(recebido 1\)/);
    expect(() => buildAdName({ ...CAMPOS, launchType: "perpetuo" })).toThrow(/campo 3 \(lançamento\): "perpetuo" não tem número/);
    expect(() => buildAdName({ ...PERPETUO_V3, launchType: "pg" })).toThrow(/campo 4 \(lançamento\): a sigla "pg" exige o número do lançamento/);
    expect(() => buildAdName({ ...CAMPOS, launchSeq: null })).toThrow(/campo 3 \(lançamento\): a sigla "pg" exige/);
    expect(() => buildAdName({ ...VIDEO, launchType: "perpetuo" }, V2)).toThrow(/campo 4 \(lançamento\): "perpetuo" não tem número/);
    expect(() => buildAdName({ ...CAMPOS, creativeType: "adv", launchType: "perpetuo" }, { formato: "antigo" })).toThrow(/campo 3 \(lançamento\): "perpetuo" não tem número/);
  });

  it("AC2/AC3: v3 tem 5 campos — a origem fica obrigatória; hook e body NÃO entram no nome (nem quando vêm)", () => {
    expect(buildAdName({ ...PERPETUO_V3, hookCode: "h01", bodyCode: "b01" }).name).toBe("adv01_ia_dg_perpetuo_09-2026");
    expect(() => buildAdName({ ...PERPETUO_V3, origin: undefined })).toThrow(/campo 2 \(origem\): obrigatória em vídeo/);
    expect(() => buildAdName({ ...PERPETUO_V3, date: "2026-09" })).toThrow(/campo 5 \(data\)/);
    expect(() => buildAdName({ ...PERPETUO_V3, description: "a_b" })).toThrow(/campo 6 \(descrição\)/);
    // ad/carr continuam proibindo origem/hook/body
    expect(() => buildAdName({ ...CAMPOS, hookCode: "h01" })).toThrow(/hook "h01" só existe no vídeo/);
    // formato de vídeo pedido para quem não é vídeo
    expect(() => buildAdName(CAMPOS, V2)).toThrow(/"ad" não tem formato v2 — só o vídeo \(adv\) tem/);
  });

  it("PO-08: pedacosDoAnuncio — com perpetuo o lançamento é o pedaço inteiro, sem número, e NÃO falta (o Salvar não trava)", () => {
    const p = pedacosDoAnuncio({ ...PERPETUO_V3 });
    expect(p.map((x) => [x.campo, x.valor, x.faltando])).toEqual([
      ["creative", "adv01", false],
      ["origin", "ia", false],
      ["expert", "dg", false],
      ["launch", "perpetuo", false],
      ["date", "09-2026", false],
      ["description", "", false],
    ]);
    // outra sigla sem número continua faltando
    expect(pedacosDoAnuncio({ ...PERPETUO_V3, launchType: "pg" }).find((x) => x.campo === "launch")).toMatchObject({ valor: "", faltando: true });
    expect(pedacosDoAnuncio({ ...PERPETUO_V3, launchType: "pg", launchSeq: 4 }).find((x) => x.campo === "launch")?.valor).toBe("pg04");
  });

  it("AC6: textoDoLancamento nunca desenha perpetuonull, perpetuo00 nem perpetuo0", () => {
    expect(textoDoLancamento("perpetuo", null)).toBe("perpetuo");
    expect(textoDoLancamento("perpetuo", undefined)).toBe("perpetuo");
    expect(textoDoLancamento("pg", 4)).toBe("pg04");
    for (const t of [textoDoLancamento("perpetuo", null), textoDoLancamento("perpetuo", undefined)]) expect(t).not.toMatch(/null|undefined|\d/);
  });

  it("AC5: parse — v3 de 5 campos válido SEM aviso; perpetuo com número inválido nos três formatos; outra sigla sem número inválida", () => {
    const v3 = parseAdName("adv01_ia_dg_perpetuo_09-2026", snap());
    expect(v3).toMatchObject({ valid: true, video: true, legado: false, formato: "v3", errors: [], avisos: [], fields: PERPETUO_V3 });
    expect(v3.fields).not.toHaveProperty("launchSeq");
    expect(parseAdName("adv01_ia_dg_perpetuo04_09-2026", snap()).errors).toContain('campo 4 (lançamento): "perpetuo04": "perpetuo" não tem número do lançamento');
    expect(parseAdName("adv01_ia_dg_perpetuo01_h01_b01_09-2026", snap()).errors).toContain('campo 4 (lançamento): "perpetuo01": "perpetuo" não tem número do lançamento');
    expect(parseAdName("adv01_dg_perpetuo01_09-2026--", snap()).errors).toContain('campo 3 (lançamento): "perpetuo01": "perpetuo" não tem número do lançamento');
    expect(parseAdName("ad07_dg_perpetuo00_09-2026", snap()).valid).toBe(false);
    expect(parseAdName("ad07_dg_pg_09-2026", snap()).errors).toContain('campo 3 (lançamento): "pg" não é sigla + NN (ex.: pg02) — só "perpetuo" vai sem número');
    expect(parseAdName("ad07_dg_perpetuo_09-2026", snap())).toMatchObject({ valid: true, fields: { creativeType: "ad", creativeSeq: 7, expert: "dg", launchType: "perpetuo", date: "09-2026" } });
  });

  it("AC5/AC9: os 6 nomes REAIS do dg são válidos — v2 + perpetuo sem número + sem `--` —, com o aviso do v2 (não o da 47.10)", () => {
    for (const [i, nome] of SEIS.entries()) {
      const n = i + 1;
      const r = parseAdName(nome, snapDoDg());
      expect(r, nome).toMatchObject({ valid: true, video: true, legado: false, formato: "v2", errors: [], avisos: [AVISO_DO_V2] });
      expect(r.avisos).not.toContain(AVISO_DE_PADRAO_ANTIGO);
      expect(r.fields).toEqual({ creativeType: "adv", creativeSeq: n, origin: "ia", expert: "dg", launchType: "perpetuo", hookCode: `h0${n}`, bodyCode: `b0${n}`, date: "09-2026" });
      // re-gravar no v2 devolve o nome do Meta byte a byte (regra 6); a estrutura ganha o `--` (AC4/AC9)
      expect(buildAdName(r.fields!, V2)).toEqual({ structure: `${nome}--`, name: nome });
      expect(formatoDoVideoGravado(nome)).toBe("v2");
    }
  });

  it("AC5: v2 com pg04 segue válido, com o aviso próprio; o `--` é opcional nos três formatos", () => {
    for (const nome of ["adv01_h_dg_pg04_h01_b01_09-2026", "adv01_h_dg_pg04_h01_b01_09-2026--", "adv01_h_dg_pg04_h01_b01_09-2026--gancho"]) {
      expect(parseAdName(nome, snap()), nome).toMatchObject({ valid: true, formato: "v2", avisos: [AVISO_DO_V2] });
    }
    for (const nome of ["adv01_h_dg_pg04_09-2026", "adv01_h_dg_pg04_09-2026--", "adv01_h_dg_pg04_09-2026--gancho"]) {
      expect(parseAdName(nome, snap()), nome).toMatchObject({ valid: true, formato: "v3", avisos: [] });
    }
    for (const nome of ["adv03_dg_pg02_09-2026", "adv03_dg_pg02_09-2026--"]) {
      expect(parseAdName(nome, snap()), nome).toMatchObject({ valid: true, formato: "antigo", avisos: [AVISO_DE_PADRAO_ANTIGO] });
    }
  });

  it("AC8: formatoDoVideoGravado lê o formato do NAME — 7 = v2, 4 = antigo, o resto = v3 (com ou sem `--`)", () => {
    expect(formatoDoVideoGravado("adv01_h_dg_pg04_h01_b01_09-2026--desc")).toBe("v2");
    expect(formatoDoVideoGravado("adv07_bbe_pg02_09-2026--")).toBe("antigo");
    expect(formatoDoVideoGravado("adv07_bbe_pg02_09-2026")).toBe("antigo");
    expect(formatoDoVideoGravado("adv01_ia_dg_perpetuo_09-2026")).toBe("v3");
    expect(formatoDoVideoGravado("adv01_ia_dg_perpetuo_09-2026--a-b")).toBe("v3");
  });

  it("build → parse fecha o ciclo no v3 com perpetuo (com e sem descrição)", () => {
    for (const f of [PERPETUO_V3, { ...PERPETUO_V3, description: "prova-social" }, { ...PERPETUO_V3, launchType: "pg", launchSeq: 2 }]) {
      expect(parseAdName(buildAdName(f).name, snap()).fields).toEqual(f);
    }
  });

  it("AC6 (PO-03/PO-04): numeroDoLancamentoNoPatch — trocar PARA perpetuo zera; DE perpetuo para outra sem número fica null (o serviço dá 400); o do corpo sempre vale", () => {
    const pg04 = { launchType: "pg", launchSeq: 4 };
    const perp = { launchType: "perpetuo", launchSeq: null };
    expect(numeroDoLancamentoNoPatch({ launchType: "perpetuo" }, pg04)).toBeNull();
    expect(numeroDoLancamentoNoPatch({ launchType: "pg" }, perp)).toBeNull();
    expect(numeroDoLancamentoNoPatch({ launchType: "pg", launchSeq: 3 }, perp)).toBe(3);
    expect(numeroDoLancamentoNoPatch({}, pg04)).toBe(4);
    expect(numeroDoLancamentoNoPatch({ launchSeq: 7 }, pg04)).toBe(7);
    expect(numeroDoLancamentoNoPatch({ launchType: "l" }, pg04)).toBe(4);
    // corpo com número E perpetuo: vale o do corpo — quem recusa é o serviço (400), não esta função
    expect(numeroDoLancamentoNoPatch({ launchType: "perpetuo", launchSeq: 2 }, pg04)).toBe(2);
    // QA 47.16 TEST-002: `null` EXPLÍCITO é "sem número", não "não veio" — num pg04 não mantém o 4 calado (o serviço dá 400)
    expect(numeroDoLancamentoNoPatch({ launchSeq: null }, pg04)).toBeNull();
    expect(numeroDoLancamentoNoPatch({ launchType: "pg", launchSeq: null }, pg04)).toBeNull();
  });
});
