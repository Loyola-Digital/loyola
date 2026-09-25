import { describe, expect, it } from "vitest";
import {
  ESTADO_VAZIO_DO_ANUNCIO,
  aoEscolherNoAnuncio,
  camposDoAnuncio,
  comSugestaoDoLancamento,
  comSugestaoDoNn,
  corpoDaEdicaoDoAnuncio,
  corpoDoAnuncio,
  ehVideoDoPadraoAntigo,
  escopoDoNnDoEstado,
  estadoDeAnuncio,
  faltaNoEscopoDoNn,
  formatoDoAnuncioGravado,
  mesAnoDe,
  mesCorrente,
  nnDe,
  parametrosDoProximoNn,
  previaDoAnuncio,
  respostaComEscopo,
  textoDoLancamento,
  textoDoNnDoCriativo,
  type RespostaDoProximoNn,
} from "../nomenclatura-anuncio";

const experts = [{ id: "e", code: "dg" }];
// Story 47.13: `adv` passou a ser vídeo v2 (7 campos) — a amostra genérica dos testes da 47.10 vira `ad`.
const cheio = { expertId: "e", creativeType: "ad", creativeSeq: "03", launchType: "pg", launchSeq: "02", date: "09-2026", description: "", notes: "", origin: "", hookId: "", bodyId: "" };
/** O exemplo do pedido (15/09/2026), no estado do gerador: adv01_h_dg_pg04_h01_b01_09-2026-- */
const video = { expertId: "e", creativeType: "adv", creativeSeq: "01", launchType: "pg", launchSeq: "04", date: "09-2026", description: "", notes: "", origin: "h", hookId: "H1", bodyId: "B1" };
const partes = [{ id: "H1", code: "h01" }, { id: "B1", code: "b01" }, { id: "H2", code: "h02" }];

describe("estado do gerador (AC8)", () => {
  // Story 47.18 (AC3b) — INVERTIDO: na 47.10 trocar sigla ou tipo MANTINHA o NN do criativo ("03"); agora o NN é do
  // escopo e é limpo (a sugestão do escopo novo o preenche). Na edição, continua fixo (D23).
  it("trocar o expert limpa os dois NN; trocar a sigla limpa o NN do lançamento E o do criativo; trocar tipo ou nº limpa o NN do criativo; o resto fica", () => {
    expect(aoEscolherNoAnuncio(cheio, "expertId", "e2")).toMatchObject({ expertId: "e2", creativeSeq: "", launchSeq: "", creativeType: "ad", date: "09-2026" });
    expect(aoEscolherNoAnuncio(cheio, "launchType", "l")).toMatchObject({ launchType: "l", launchSeq: "", creativeSeq: "" });
    expect(aoEscolherNoAnuncio(cheio, "creativeType", "carr")).toMatchObject({ creativeType: "carr", creativeSeq: "", launchSeq: "02" });
    expect(aoEscolherNoAnuncio(cheio, "launchSeq", "05")).toMatchObject({ launchSeq: "05", creativeSeq: "", launchType: "pg" });
    expect(aoEscolherNoAnuncio(cheio, "expertId", "e")).toBe(cheio);
    expect(aoEscolherNoAnuncio(cheio, "launchSeq", "02")).toBe(cheio);
    // descrição, data, notas não são escopo: o NN fica
    expect(aoEscolherNoAnuncio(cheio, "date", "10-2026").creativeSeq).toBe("03");
  });
  it("47.18 (AC5/D23): na EDIÇÃO trocar sigla ou nº NÃO limpa o NN do criativo — ele é fixo depois de salvo", () => {
    expect(aoEscolherNoAnuncio(cheio, "launchType", "l", { editando: true })).toMatchObject({ launchType: "l", launchSeq: "", creativeSeq: "03" });
    expect(aoEscolherNoAnuncio(cheio, "launchSeq", "05", { editando: true })).toMatchObject({ launchSeq: "05", creativeSeq: "03" });
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
  // 47.16 (AC4, opção B — PO-11): sem descrição o nome termina na data; a estrutura (o "Copiar estrutura") segue com `--`.
  it("completa: estrutura até o -- e nome sem o -- quando não há descrição; com descrição normalizada, nome completo", () => {
    const p = previaDoAnuncio(cheio, experts);
    expect(p.estrutura).toBe("ad03_dg_pg02_09-2026--");
    expect(p.nome).toBe("ad03_dg_pg02_09-2026");
    expect(p.completo).toBe(true);
    const q = previaDoAnuncio({ ...cheio, description: "Gancho Demissão" }, experts);
    expect(q.nome).toBe("ad03_dg_pg02_09-2026--gancho-demissao");
    expect(q.estrutura).toBe("ad03_dg_pg02_09-2026--");
    expect(q.tamanho).toBe(q.nome!.length);
  });
  // 47.16 (PO-08): o fallback desenha o NOME — o `--` só com descrição (antes: sempre).
  it("parcial: … no que falta, -- só com descrição, Salvar bloqueado", () => {
    const p = previaDoAnuncio({ ...cheio, launchSeq: "", date: "" }, experts);
    expect(p.completo).toBe(false);
    expect(p.nome).toBeNull();
    expect(p.texto).toBe("ad03_dg_…_…");
    expect(previaDoAnuncio({ ...cheio, launchSeq: "", description: "gancho" }, experts).texto).toBe("ad03_dg_…_09-2026--gancho");
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
    // 47.18 (AC3b): o NN do criativo também é limpo (o tipo é escopo) — na 47.13 ficava "01"
    expect(aoEscolherNoAnuncio(video, "creativeType", "ad")).toMatchObject({ creativeType: "ad", origin: "", hookId: "", bodyId: "", creativeSeq: "" });
    expect(aoEscolherNoAnuncio(video, "creativeType", "adv")).toBe(video);
    expect(aoEscolherNoAnuncio(video, "expertId", "e2")).toMatchObject({ expertId: "e2", hookId: "", bodyId: "", origin: "h", creativeSeq: "", launchSeq: "" });
    // ad → adv não inventa nada: os três continuam vazios até a pessoa escolher
    expect(aoEscolherNoAnuncio(cheio, "creativeType", "adv")).toMatchObject({ creativeType: "adv", origin: "", hookId: "", bodyId: "" });
  });
  // 47.16 (AC2/AC3): o vídeo novo é v3 — 5 pedaços, hook/body fora do nome MAS exigidos (faltaForaDoNome trava o Salvar).
  it("AC3/AC9 + 47.16: prévia do vídeo v3 tem 5 pedaços; hook e body não entram no nome, mas sem eles Salvar fica bloqueado", () => {
    const p = previaDoAnuncio(video, experts, partes);
    expect(p.pedacos.map((x) => x.campo)).toEqual(["creative", "origin", "expert", "launch", "date", "description"]);
    expect(p.estrutura).toBe("adv01_h_dg_pg04_09-2026--");
    expect(p.nome).toBe("adv01_h_dg_pg04_09-2026");
    expect(p).toMatchObject({ completo: true, faltaForaDoNome: [] });
    const semHook = previaDoAnuncio({ ...video, hookId: "" }, experts, partes);
    expect(semHook).toMatchObject({ completo: false, faltaForaDoNome: ["hook"], nome: "adv01_h_dg_pg04_09-2026" });
    expect(previaDoAnuncio({ ...video, hookId: "", bodyId: "" }, experts, partes).faltaForaDoNome).toEqual(["hook", "body"]);
    // hook de id desconhecido (outro expert) não vira código: fica faltando
    expect(previaDoAnuncio({ ...video, hookId: "X" }, experts, partes).completo).toBe(false);
    // no v2 (editar um publicado) eles voltam a ser pedaços do nome
    const v2 = previaDoAnuncio(video, experts, partes, { formato: "v2" });
    expect(v2.pedacos.map((x) => x.campo)).toEqual(["creative", "origin", "expert", "launch", "hook", "body", "date", "description"]);
    expect(v2).toMatchObject({ estrutura: "adv01_h_dg_pg04_h01_b01_09-2026--", completo: true, faltaForaDoNome: [] });
    expect(previaDoAnuncio({ ...video, hookId: "" }, experts, partes, { formato: "v2" }).texto).toBe("adv01_h_dg_pg04_…_b01_09-2026");
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
  it("AC7 (achado do QA): EDITAR vídeo do padrão antigo — prévia de 4 campos, completa, estrutura igual à gravada; sem `legado` ficava com 8 pedaços e Salvar desabilitado", () => {
    const antigo = { expertId: "e", creativeType: "adv", creativeSeq: 7, launchType: "pg", launchSeq: 2, adDate: "2026-09-01", description: null, notes: null, origin: null, hookId: null, bodyId: null };
    const p = previaDoAnuncio(estadoDeAnuncio(antigo, "editar"), experts, [], { formato: "antigo" });
    expect(p.pedacos.map((x) => x.campo)).toEqual(["creative", "expert", "launch", "date", "description"]);
    expect(p.completo).toBe(true);
    expect(p.estrutura).toBe("adv07_dg_pg02_09-2026--");
    // sem a opção, o mesmo estado é incompleto — é o defeito que o teste protege
    expect(previaDoAnuncio(estadoDeAnuncio(antigo, "editar"), experts, []).completo).toBe(false);
  });
});

describe("Story 47.16 — perpetuo sem número e o formato do registro", () => {
  const perpetuo = { ...video, origin: "ia", launchType: "perpetuo", launchSeq: "" };

  it("AC1/AC7 (PO-08): com perpetuo a prévia fica COMPLETA sem número — adv01_ia_dg_perpetuo_09-2026; Salvar libera", () => {
    const p = previaDoAnuncio(perpetuo, experts, partes);
    expect(p.pedacos.find((x) => x.campo === "launch")).toMatchObject({ valor: "perpetuo", faltando: false });
    expect(p).toMatchObject({ nome: "adv01_ia_dg_perpetuo_09-2026", estrutura: "adv01_ia_dg_perpetuo_09-2026--", completo: true, erro: null });
    expect(previaDoAnuncio({ ...cheio, launchType: "perpetuo", launchSeq: "" }, experts).nome).toBe("ad03_dg_perpetuo_09-2026");
    // um número que sobrou no estado (ex.: digitado antes de trocar a sigla) NÃO entra — nem no nome, nem no corpo
    expect(previaDoAnuncio({ ...perpetuo, launchSeq: "04" }, experts, partes).nome).toBe("adv01_ia_dg_perpetuo_09-2026");
    expect(camposDoAnuncio({ ...perpetuo, launchSeq: "04" }, experts, partes).launchSeq).toBeUndefined();
    // outra sigla sem número continua incompleta
    expect(previaDoAnuncio({ ...perpetuo, launchType: "pg" }, experts, partes).completo).toBe(false);
  });

  it("AC6: corpoDoAnuncio manda launchSeq null com perpetuo (nunca 0) e null sem número (o 0 de antes era sentinela)", () => {
    expect(corpoDoAnuncio(perpetuo).launchSeq).toBeNull();
    expect(corpoDoAnuncio({ ...perpetuo, launchSeq: "04" }).launchSeq).toBeNull();
    expect(corpoDoAnuncio({ ...cheio, launchSeq: "" }).launchSeq).toBeNull();
    expect(corpoDoAnuncio(cheio).launchSeq).toBe(2);
  });

  it("AC6: gravado com launchSeq null → estado com campo vazio e lista com `perpetuo` — nunca perpetuonull/perpetuo00/perpetuo0", () => {
    const gravado = { expertId: "e", creativeType: "adv", creativeSeq: 1, launchType: "perpetuo", launchSeq: null, adDate: "2026-09-01", description: null, notes: null, origin: "ia", hookId: "H1", bodyId: "B1" };
    const e = estadoDeAnuncio(gravado, "editar");
    expect(e.launchSeq).toBe("");
    expect(JSON.stringify(e)).not.toMatch(/null|perpetuo0/);
    expect(textoDoLancamento(gravado.launchType, gravado.launchSeq)).toBe("perpetuo");
    expect(previaDoAnuncio(e, experts, partes).nome).toBe("adv01_ia_dg_perpetuo_09-2026");
  });

  // Story 47.18 (AC3, PO-06) — INVERTIDO: na 47.16 a sigla `perpetuo` NÃO ia para /ads/proximo (`siglaParaSugestao`);
  // agora ela é escopo do NN e vai sempre. A sugestão do NÚMERO continua não rodando com perpetuo (rota + comSugestaoDoLancamento).
  it("AC7 + 47.18: perpetuo CHEGA a /ads/proximo (escopo do NN), sem nº; a sugestão do número não preenche com perpetuo", () => {
    expect(parametrosDoProximoNn(perpetuo)).toEqual({ launchType: "perpetuo", creativeType: "adv", launchSeq: undefined });
    expect(parametrosDoProximoNn({ ...perpetuo, launchSeq: "04" }).launchSeq).toBeUndefined();
    expect(parametrosDoProximoNn(cheio)).toEqual({ launchType: "pg", creativeType: "ad", launchSeq: "2" });
    expect(parametrosDoProximoNn({ ...cheio, launchSeq: "0" }).launchSeq).toBeUndefined();
    expect(parametrosDoProximoNn({ launchType: "", creativeType: "", launchSeq: "" })).toEqual({ launchType: undefined, creativeType: undefined, launchSeq: undefined });
    expect(comSugestaoDoLancamento(perpetuo, 4)).toBe(perpetuo);
    expect(comSugestaoDoLancamento({ ...cheio, launchSeq: "" }, 4).launchSeq).toBe("04");
    // não sobrescreve o que a pessoa digitou; sem sugestão, nada muda
    expect(comSugestaoDoLancamento(cheio, 9)).toBe(cheio);
    expect(comSugestaoDoLancamento({ ...cheio, launchSeq: "" }, null).launchSeq).toBe("");
  });

  it("AC8/AC4: um dos 6 do dg (v2, sem `--`) é editado no v2 — 7 pedaços, prévia completa e o NOME igual ao do Meta, sem `--`", () => {
    const seis = { expertId: "e", creativeType: "adv", creativeSeq: 1, launchType: "perpetuo", launchSeq: null, adDate: "2026-09-01", description: null, notes: null, origin: "ia", hookId: "H1", bodyId: "B1", name: "adv01_ia_dg_perpetuo_h01_b01_09-2026" };
    const formato = formatoDoAnuncioGravado(seis);
    expect(formato).toBe("v2");
    const p = previaDoAnuncio(estadoDeAnuncio(seis, "editar"), experts, partes, { formato });
    expect(p.pedacos).toHaveLength(8);
    expect(p).toMatchObject({ completo: true, nome: seis.name, estrutura: `${seis.name}--` });
    // sem o formato (defeito que o teste protege) a prévia viraria v3 e mudaria o nome publicado
    expect(previaDoAnuncio(estadoDeAnuncio(seis, "editar"), experts, partes).nome).not.toBe(seis.name);
    // anúncio que não é vídeo, e vídeo v3 / antigo
    expect(formatoDoAnuncioGravado({ creativeType: "ad", name: "ad01_dg_pg02_09-2026" })).toBe("v3");
    expect(formatoDoAnuncioGravado({ creativeType: "adv", name: "adv01_ia_dg_perpetuo_09-2026" })).toBe("v3");
    expect(formatoDoAnuncioGravado({ creativeType: "adv", name: "adv07_bbe_pg02_09-2026--" })).toBe("antigo");
  });
});

describe("QA 47.16 — o corpo ENVIADO no PATCH e o botão \"Copiar nome completo\"", () => {
  const seis = { expertId: "e", creativeType: "adv", creativeSeq: 2, launchType: "perpetuo", launchSeq: null, adDate: "2026-09-01", description: null, notes: null, origin: "ia", hookId: "H1", bodyId: "B1" };

  it("TEST-001: editar um perpetuo manda `launchSeq: null` EXPLÍCITO no JSON — o corpo que a rota testa em nomenclatura-rotas.test.ts", () => {
    const ad = corpoDaEdicaoDoAnuncio({ ...cheio, launchType: "perpetuo", launchSeq: "", date: "10-2026", description: "prova social" }, { padraoAntigo: false });
    expect(ad).toEqual({ launchType: "perpetuo", launchSeq: null, date: "10-2026", description: "prova social", notes: null });
    // o que o useEditarAnuncio envia é JSON.stringify(dados): `undefined` sumiria, `null` fica
    expect(JSON.parse(JSON.stringify(ad))).toHaveProperty("launchSeq", null);

    // um dos 6 do dg (v2): trocar só a descrição manda também origem, hook e body — e o launchSeq null
    const video = corpoDaEdicaoDoAnuncio({ ...estadoDeAnuncio(seis, "editar"), description: "prova social" }, { padraoAntigo: false });
    expect(video).toEqual({ launchType: "perpetuo", launchSeq: null, date: "09-2026", description: "prova social", notes: null, origin: "ia", hookId: "H1", bodyId: "B1" });
    expect(JSON.parse(JSON.stringify(video))).toHaveProperty("launchSeq", null);
  });

  it("TEST-001: com número vai o número; tipo e NN nunca vão (D23); vídeo do padrão antigo não manda origem/hook/body (47.13 AC7)", () => {
    const pg = corpoDaEdicaoDoAnuncio(cheio, { padraoAntigo: false });
    expect(pg).toEqual({ launchType: "pg", launchSeq: 2, date: "09-2026", description: null, notes: null });
    expect(pg).not.toHaveProperty("creativeType");
    expect(pg).not.toHaveProperty("creativeSeq");
    const antigo = corpoDaEdicaoDoAnuncio(video, { padraoAntigo: true });
    expect(antigo).not.toHaveProperty("origin");
    expect(antigo).not.toHaveProperty("hookId");
    expect(antigo).not.toHaveProperty("bodyId");
    expect(corpoDaEdicaoDoAnuncio(video, { padraoAntigo: false })).toMatchObject({ origin: "h", hookId: "H1", bodyId: "B1" });
  });

  it("MNT-001: nome e estrutura nunca coincidem (opção B) — por isso o botão só depende de haver nome", () => {
    for (const [estado, formato] of [
      [cheio, undefined],
      [{ ...cheio, description: "gancho" }, undefined],
      [{ ...cheio, launchType: "perpetuo", launchSeq: "" }, undefined],
      [video, undefined],
      [{ ...video, description: "gancho" }, "v2"],
      [estadoDeAnuncio(seis, "editar"), "v2"],
    ] as const) {
      const p = previaDoAnuncio(estado, experts, partes, { formato });
      expect(p.nome).toBeTruthy();
      expect(p.estrutura?.endsWith("--")).toBe(true);
      expect(p.nome).not.toBe(p.estrutura);
    }
  });
});

describe("Story 47.18 — o NN do criativo por lançamento e por tipo no gerador", () => {
  const dg = { ...ESTADO_VAZIO_DO_ANUNCIO, expertId: "e", date: "09-2026" };
  const advPerpetuo = { ...dg, creativeType: "adv", launchType: "perpetuo" };
  const adPg05 = { ...dg, creativeType: "ad", launchType: "pg", launchSeq: "05" };
  const resp = (escopo: RespostaDoProximoNn["escopo"], nn: string | null, lseq: number | null = null): RespostaDoProximoNn => ({ creativeSeq: nn === null ? null : Number(nn), creativeSeqTexto: nn, launchSeqSugerido: lseq, escopo });
  const E_ADV_PERP = { creativeType: "adv", launchType: "perpetuo", launchSeq: null };
  const E_AD_PG05 = { creativeType: "ad", launchType: "pg", launchSeq: 5 };
  /** A API anterior ao contrato 28: descarta os parâmetros novos e responde por expert, SEM `escopo`. */
  const apiAntiga = { creativeSeq: 7, creativeSeqTexto: "07", launchSeqSugerido: 4 } as RespostaDoProximoNn;

  it("AC3: o escopo do formulário — completo só com tipo + sigla (+ nº fora do perpetuo); o que falta, na ordem", () => {
    expect(escopoDoNnDoEstado(advPerpetuo)).toEqual(E_ADV_PERP);
    expect(escopoDoNnDoEstado(adPg05)).toEqual(E_AD_PG05);
    expect(escopoDoNnDoEstado({ ...adPg05, launchSeq: "" })).toBeNull();
    expect(faltaNoEscopoDoNn(dg)).toEqual(["o tipo de criativo", "a sigla do lançamento"]);
    expect(faltaNoEscopoDoNn({ ...adPg05, launchSeq: "" })).toEqual(["o nº do lançamento"]);
    expect(faltaNoEscopoDoNn(advPerpetuo)).toEqual([]);
  });

  it("AC3b (exemplo do PO): dg + adv + perpetuo preenche 07 → trocar para ad + pg05 limpa e o campo mostra 01, não 07", () => {
    let e = comSugestaoDoNn(advPerpetuo, resp(E_ADV_PERP, "07"));
    expect(e.creativeSeq).toBe("07");
    e = aoEscolherNoAnuncio(e, "creativeType", "ad");
    e = aoEscolherNoAnuncio(e, "launchType", "pg");
    expect(e.creativeSeq).toBe("");
    // a resposta do escopo ANTERIOR (ainda na tela enquanto a nova não chega) não preenche
    expect(comSugestaoDoNn(e, resp(E_ADV_PERP, "07")).creativeSeq).toBe("");
    // PO-06: o nº do lançamento sugerido muda a chave da query — antes do escopo completo o NN não é preenchido
    const semNumero = resp(null, null, 5);
    e = comSugestaoDoNn(e, semNumero);
    expect(e.creativeSeq).toBe("");
    e = comSugestaoDoLancamento(e, semNumero.launchSeqSugerido);
    expect(e.launchSeq).toBe("05");
    expect(comSugestaoDoNn(e, resp(E_ADV_PERP, "07")).creativeSeq).toBe("");
    e = comSugestaoDoNn(e, resp(E_AD_PG05, "01"));
    expect(e.creativeSeq).toBe("01");
  });

  it("comSugestaoDoNn: não sobrescreve o NN digitado; resposta sem sugestão não muda nada", () => {
    expect(comSugestaoDoNn({ ...adPg05, creativeSeq: "09" }, resp(E_AD_PG05, "01")).creativeSeq).toBe("09");
    expect(comSugestaoDoNn(adPg05, resp(E_AD_PG05, null))).toBe(adPg05);
    expect(comSugestaoDoNn(adPg05, undefined)).toBe(adPg05);
  });

  it("AC7: resposta da API antiga (sem `escopo`) NÃO preenche nem é rotulada com escopo — a tela diz que a API está atrás", () => {
    expect(respostaComEscopo(apiAntiga)).toBe(false);
    expect(respostaComEscopo(resp(null, null))).toBe(true);
    expect(respostaComEscopo(undefined)).toBe(false);
    expect(comSugestaoDoNn(adPg05, apiAntiga)).toBe(adPg05);
    const t = textoDoNnDoCriativo({ estado: adPg05, resposta: apiAntiga, expertCode: "dg", editando: false });
    expect(t.aviso).toBe(true);
    expect(t.texto).toMatch(/^A API ainda não foi atualizada/);
    expect(t.texto).not.toMatch(/pg05|07/);
  });

  it("AC6: o texto da tela — \"Próximo livre de dg em pg05 (ad): 01\"; com perpetuo, \"em perpetuo (adv)\"; o texto antigo saiu", () => {
    const texto = (estado: typeof dg, resposta?: RespostaDoProximoNn, extra: { editando?: boolean; erro?: string } = {}) => textoDoNnDoCriativo({ estado, resposta, expertCode: "dg", editando: extra.editando ?? false, erro: extra.erro });
    expect(texto(adPg05, resp(E_AD_PG05, "01"))).toEqual({ texto: "Próximo livre de dg em pg05 (ad): 01.", aviso: false });
    expect(texto(advPerpetuo, resp(E_ADV_PERP, "07"))).toEqual({ texto: "Próximo livre de dg em perpetuo (adv): 07.", aviso: false });
    // escopo incompleto: diz o que falta, sem número
    expect(texto({ ...adPg05, launchSeq: "" }, resp(null, null, 4)).texto).toBe("Escolha o nº do lançamento para sugerir o NN — ele conta por lançamento e por tipo.");
    expect(texto(dg, resp(null, null)).texto).toBe("Escolha o tipo de criativo e a sigla do lançamento para sugerir o NN — ele conta por lançamento e por tipo.");
    // NN digitado diferente do sugerido: aviso no escopo
    expect(texto({ ...adPg05, creativeSeq: "03" }, resp(E_AD_PG05, "01"))).toEqual({ texto: "Próximo livre de dg em pg05 (ad): 01. Um NN já usado neste lançamento e tipo é recusado ao salvar.", aviso: true });
    // resposta de outro escopo (a nova ainda não chegou): não rotula o número velho
    expect(texto(adPg05, resp(E_ADV_PERP, "07")).texto).toBe("Buscando o próximo livre de dg em pg05 (ad)…");
    expect(texto(adPg05, resp(E_AD_PG05, null))).toEqual({ texto: "Os 99 NN de dg em pg05 (ad) estão usados.", aviso: true });
    // erro da consulta ≠ "buscando"
    expect(texto(adPg05, undefined, { erro: "Erro interno" })).toEqual({ texto: "Não foi possível buscar o próximo NN: Erro interno. Digite o NN ou tente de novo.", aviso: true });
    expect(texto(adPg05, undefined, { editando: true }).texto).toBe("Fixo depois de salvo.");
    expect(texto({ ...adPg05, expertId: "" }, undefined).texto).toBe("Escolha o expert.");
    for (const r of [resp(E_AD_PG05, "01"), resp(null, null), apiAntiga]) expect(texto(adPg05, r).texto).not.toMatch(/Sequência única por expert/);
  });
});
