/**
 * Story 49.1 — rotas da config do debriefing (AC2–AC5, AC8, AC10, AC11).
 *
 * Fastify real + `inject`, com o store em memória injetado no plugin. O que se
 * confere é o CORPO que chega ao store (`gravar`), não o tipo do hook: campo
 * normalizado, reset de `validado` e "nada gravado" quando a validação falha.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import { DEBRIEFING_COMBINACOES_LIBERADAS, type ValoresDaConfig } from "../services/debriefing-config.js";
import type { Database } from "../db/client.js";
import {
  IDS,
  contexto,
  linha,
  mundoPadrao,
  storeEmMemoria,
  valoresCompletos,
  type Mundo,
} from "./fixtures/debriefing-config-store.js";

const URL = `/api/projects/${IDS.projeto}/funnels/${IDS.funil}/stages/${IDS.debriefing}/debriefing/config`;

let mundo: Mundo;
let store: ReturnType<typeof storeEmMemoria>;
let app: FastifyInstance;

async function montarApp(role = "user"): Promise<FastifyInstance> {
  const a = Fastify();
  a.decorate("db", {} as Database);
  await a.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = IDS.usuario;
        request.userRole = (request.headers["x-role"] as string | undefined) ?? role;
      });
    }),
  );
  await a.register(debriefingConfigRoutes, { criarStore: () => store });
  await a.ready();
  return a;
}

/** Corpo do PUT a partir dos valores (forma que a 49.6 vai enviar). */
function corpo(v: ValoresDaConfig = valoresCompletos()): Record<string, unknown> {
  return {
    datasChave: {
      inicioCaptacao: v.inicioCaptacao,
      aberturaCarrinho: v.aberturaCarrinho,
      fimCarrinho: v.fimCarrinho,
      reabertura: v.reabertura,
      downsell: v.downsell,
    },
    lancamentoComparacaoFunnelId: v.lancamentoComparacaoFunnelId,
    etapas: v.etapas,
    perguntasConfirmadas: v.perguntasConfirmadas,
    closerMediums: v.closerMediums,
    closerPorSellerName: v.closerPorSellerName,
    ferramentasDeAtendimento: v.ferramentasDeAtendimento,
    dimensaoDeCriativo: v.dimensaoDeCriativo,
  };
}

beforeEach(async () => {
  mundo = mundoPadrao();
  store = storeEmMemoria(mundo);
  app = await montarApp();
});

describe("AC8 — guest 403 e IDOR 404 em todos os endpoints", () => {
  it.each([
    ["GET", URL],
    ["PUT", URL],
    ["POST", `${URL}/validate`],
  ] as const)("%s guest → 403 sem tocar o store", async (method, url) => {
    const res = await app.inject({ method, url, headers: { "x-role": "guest" }, payload: method === "PUT" ? corpo() : undefined });
    expect(res.statusCode).toBe(403);
    expect(store.contextoDaEtapa).not.toHaveBeenCalled();
    expect(store.gravar).not.toHaveBeenCalled();
    expect(store.marcarValidado).not.toHaveBeenCalled();
  });

  it("etapa que não é Debriefing → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${IDS.projeto}/funnels/${IDS.funil}/stages/${IDS.etapaNaoDebriefing}/debriefing/config`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("etapa de outro projeto/funil na URL → 404 (e nada gravado)", async () => {
    const outroProjeto = await app.inject({
      method: "PUT",
      url: `/api/projects/${IDS.outroProjeto}/funnels/${IDS.funil}/stages/${IDS.debriefing}/debriefing/config`,
      payload: corpo(),
    });
    expect(outroProjeto.statusCode).toBe(404);
    const outroFunil = await app.inject({
      method: "POST",
      url: `/api/projects/${IDS.projeto}/funnels/${IDS.funilComparacao}/stages/${IDS.debriefing}/debriefing/config/validate`,
    });
    expect(outroFunil.statusCode).toBe(404);
    expect(store.gravar).not.toHaveBeenCalled();
    expect(store.marcarValidado).not.toHaveBeenCalled();
  });
});

describe("PUT — corpo gravado", () => {
  it("cria a config com exatamente os valores normalizados", async () => {
    const v = valoresCompletos({ closerMediums: [" X1 ", "Comercial", "x1"] });
    const res = await app.inject({ method: "PUT", url: URL, payload: corpo(v) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, validacaoResetada: false });
    expect(store.gravar).toHaveBeenCalledTimes(1);
    expect(store.gravar).toHaveBeenCalledWith(
      IDS.debriefing,
      { ...valoresCompletos(), closerMediums: ["x1", "comercial"] },
      // Sem linha lida: o upsert reseta por precaução (corrida do 1º salvar).
      { resetarValidado: true },
    );
  });

  it("campos do classificador omitidos gravam 'sem resposta' (null), não default de expert", async () => {
    const b = corpo();
    delete b.closerMediums;
    delete b.closerPorSellerName;
    delete b.dimensaoDeCriativo;
    delete b.perguntasConfirmadas;
    const res = await app.inject({ method: "PUT", url: URL, payload: b });
    expect(res.statusCode).toBe(200);
    const gravado = store.gravar.mock.calls[0][1];
    expect(gravado.closerMediums).toBeNull();
    expect(gravado.closerPorSellerName).toBeNull();
    expect(gravado.dimensaoDeCriativo).toBeNull();
    expect(gravado.perguntasConfirmadas).toEqual({});
  });

  it("lista vazia de closerMediums é gravada como [] (resposta explícita)", async () => {
    await app.inject({ method: "PUT", url: URL, payload: corpo(valoresCompletos({ closerMediums: [] })) });
    expect(store.gravar.mock.calls[0][1].closerMediums).toEqual([]);
  });

  it("mudar premissa de config validada reseta validado", async () => {
    mundo.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos(), { validado: true, validadoEm: new Date(), validadoPor: IDS.usuario }),
    );
    const res = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpo(valoresCompletos({ closerPorSellerName: true })),
    });
    expect(res.json()).toEqual({ ok: true, validacaoResetada: true });
    expect(store.gravar.mock.calls[0][2]).toEqual({ resetarValidado: true });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(false);
  });

  it("salvar a mesma premissa não reseta validado", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos(), { validado: true }));
    const res = await app.inject({ method: "PUT", url: URL, payload: corpo() });
    expect(res.json()).toEqual({ ok: true, validacaoResetada: false });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(true);
  });
});

describe("PUT — validações (400 indicando o campo; nada gravado)", () => {
  async function put400(payload: Record<string, unknown>): Promise<string[]> {
    const res = await app.inject({ method: "PUT", url: URL, payload });
    expect(res.statusCode).toBe(400);
    expect(store.gravar).not.toHaveBeenCalled();
    return res.json().erros as string[];
  }

  it("AC2 — data inexistente", async () => {
    const b = corpo();
    (b.datasChave as Record<string, unknown>).fimCarrinho = "2026-02-30";
    expect((await put400(b)).join("\n")).toContain("datasChave.fimCarrinho: data inexistente");
  });

  it("AC2 — reabertura ausente e houve:true sem datas apontam o campo", async () => {
    const b = corpo();
    delete (b.datasChave as Record<string, unknown>).reabertura;
    (b.datasChave as Record<string, unknown>).downsell = { houve: true };
    const erros = (await put400(b)).join("\n");
    expect(erros).toContain("datasChave.reabertura");
    expect(erros).toContain("datasChave.downsell.abertura");
    expect(erros).toContain("datasChave.downsell.fim");
  });

  it("AC2 — data obrigatória ausente", async () => {
    const b = corpo();
    delete (b.datasChave as Record<string, unknown>).inicioCaptacao;
    expect((await put400(b)).join("\n")).toContain("datasChave.inicioCaptacao");
  });

  it("AC2 — ordem incoerente traz o par de campos", async () => {
    expect(await put400(corpo(valoresCompletos({ aberturaCarrinho: "2026-05-20" })))).toEqual([
      "datasChave.aberturaCarrinho (2026-05-20) é posterior a datasChave.fimCarrinho (2026-05-16)",
    ]);
  });

  it("AC3 — comparação com funil de outro projeto", async () => {
    expect(await put400(corpo(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilDeOutroProjeto })))).toEqual([
      `lancamentoComparacaoFunnelId (${IDS.funilDeOutroProjeto}) não é um funil do mesmo projeto`,
    ]);
  });

  it("AC4 — papel fora de DEBRIEFING_PAPEIS, lista vazia, etapa de outro funil", async () => {
    const papelInvalido = corpo();
    (papelInvalido.etapas as { papel: string }[])[0].papel = "captacao";
    expect((await put400(papelInvalido)).join("\n")).toContain("etapas.0.papel");

    store.gravar.mockClear();
    expect((await put400({ ...corpo(), etapas: [], perguntasConfirmadas: {} })).join("\n")).toContain("etapas");

    store.gravar.mockClear();
    const outroFunil = corpo(
      valoresCompletos({ etapas: [{ stageId: IDS.etapaDeOutroFunil, papel: "vendas-principal" }], perguntasConfirmadas: {} }),
    );
    expect(await put400(outroFunil)).toEqual([`etapas[${IDS.etapaDeOutroFunil}] não pertence ao funil da etapa`]);
  });

  it("AC5 — chave confirmada que não existe nas perguntas reais", async () => {
    const v = valoresCompletos({ perguntasConfirmadas: { [IDS.captacao]: { faixa: "faixa", religiao: "q_religiao" } } });
    expect(await put400(corpo(v))).toEqual([
      `perguntasConfirmadas[${IDS.captacao}].religiao = "q_religiao" não existe nas perguntas da pesquisa`,
    ]);
  });

  it("AC5 — etapa sem pesquisa em perguntasConfirmadas", async () => {
    const v = valoresCompletos({
      perguntasConfirmadas: { [IDS.captacao]: { faixa: null }, [IDS.principal]: { faixa: null } },
    });
    expect(await put400(corpo(v))).toEqual([
      `perguntasConfirmadas[${IDS.principal}]: a etapa não tem pesquisa — etapa sem pesquisa não entra`,
    ]);
  });

  it("AC5 — campo que não é dimensão canônica → 400", async () => {
    const v = corpo();
    v.perguntasConfirmadas = { [IDS.captacao]: { faixa: null, signo: "q" } };
    expect((await put400(v)).join("\n")).toContain(`perguntasConfirmadas.${IDS.captacao}`);
  });

  it("AC10 — dimensaoDeCriativo fora do enum e closerMediums com item vazio", async () => {
    expect((await put400({ ...corpo(), dimensaoDeCriativo: "carrossel" })).join("\n")).toContain("dimensaoDeCriativo");
    store.gravar.mockClear();
    expect((await put400({ ...corpo(), closerMediums: ["x1", "  "] })).join("\n")).toContain("closerMediums.1");
  });

  it("AC5 — planilha fora do ar ao conferir a chave → 503 e nada gravado (nunca aceitar sem conferir)", async () => {
    mundo.perguntas.set(IDS.captacao, new Error("Sheets 503"));
    const res = await app.inject({ method: "PUT", url: URL, payload: corpo() });
    expect(res.statusCode).toBe(503);
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("AC5 — só faixa: null não precisa abrir a planilha", async () => {
    mundo.perguntas.set(IDS.captacao, new Error("Sheets 503"));
    const v = valoresCompletos({ perguntasConfirmadas: { [IDS.captacao]: { faixa: null } } });
    const res = await app.inject({ method: "PUT", url: URL, payload: corpo(v) });
    expect(res.statusCode).toBe(200);
    expect(store.perguntasDaEtapa).not.toHaveBeenCalled();
  });
});

describe("R4-12 (pedido da 49.2) — ferramentasDeAtendimento no PUT", () => {
  it("normalizada (trim + minúsculas, sem repetição); omitida grava null (sem resposta); [] grava []", async () => {
    const b = corpo();
    b.ferramentasDeAtendimento = [" LeTalk ", "chatwoot", "letalk"];
    expect((await app.inject({ method: "PUT", url: URL, payload: b })).statusCode).toBe(200);
    expect(store.gravar.mock.calls[0][1].ferramentasDeAtendimento).toEqual(["letalk", "chatwoot"]);

    const semCampo = corpo();
    delete semCampo.ferramentasDeAtendimento;
    expect((await app.inject({ method: "PUT", url: URL, payload: semCampo })).statusCode).toBe(200);
    expect(store.gravar.mock.calls[1][1].ferramentasDeAtendimento).toBeNull();

    expect((await app.inject({ method: "PUT", url: URL, payload: corpo() })).statusCode).toBe(200);
    expect(store.gravar.mock.calls[2][1].ferramentasDeAtendimento).toEqual([]);
  });

  it("omitida → GET com bloqueio CONFIG_INCOMPLETA listando o campo", async () => {
    const dg = DEBRIEFING_COMBINACOES_LIBERADAS[0];
    mundo = mundoPadrao(contexto({ projectId: dg.projectId, funnelId: dg.funnelId }));
    store = storeEmMemoria(mundo);
    app = await montarApp();
    const url = `/api/projects/${dg.projectId}/funnels/${dg.funnelId}/stages/${IDS.debriefing}/debriefing/config`;
    const b = corpo();
    delete b.ferramentasDeAtendimento;
    expect((await app.inject({ method: "PUT", url, payload: b })).statusCode).toBe(200);
    const body = (await app.inject({ method: "GET", url })).json();
    expect(body.bloqueio.erro).toBe("CONFIG_INCOMPLETA");
    expect(body.camposFaltantes).toEqual(["ferramentasDeAtendimento (lista vazia é resposta válida)"]);
  });

  it("mudar a lista no PUT zera validado", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos(), { validado: true }));
    const res = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpo(valoresCompletos({ ferramentasDeAtendimento: ["letalk"] })),
    });
    expect(res.json()).toEqual({ ok: true, validacaoResetada: true });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(false);
  });

  it("item vazio → 400 apontando o item; nada gravado", async () => {
    const res = await app.inject({ method: "PUT", url: URL, payload: { ...corpo(), ferramentasDeAtendimento: ["letalk", " "] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erros.join("\n")).toContain("ferramentasDeAtendimento.1");
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("GET devolve a lista gravada", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos({ ferramentasDeAtendimento: ["letalk"] })));
    expect((await app.inject({ method: "GET", url: URL })).json().config.ferramentasDeAtendimento).toEqual(["letalk"]);
  });
});

describe("R4-14 — comparação apagada depois de validar (edição única, com aviso)", () => {
  /** Comparação gravada que não é mais funil do projeto (movida para outro projeto). */
  function comComparacaoOrfa(validado: boolean) {
    mundo.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilDeOutroProjeto }), {
        validado,
        validadoPor: validado ? IDS.usuario : null,
        validadoEm: validado ? new Date("2026-10-01T10:00:00Z") : null,
      }),
    );
  }

  it("GET: sem bloqueio, validado mantido, comparação marcada como removida e aviso COMPARACAO_REMOVIDA", async () => {
    comComparacaoOrfa(true);
    const body = (await app.inject({ method: "GET", url: URL })).json();
    expect(body.bloqueio).toBeNull();
    expect(body.camposFaltantes).toEqual([]);
    expect(body.config.lancamentoComparacaoFunnelId).toBe(IDS.funilDeOutroProjeto);
    expect(body.config.comparacaoRemovida).toBe(true);
    expect(body.config.validado).toBe(true);
    expect(body.config.validadoPorNome).toBe("Fulano do Time");
    expect(body.avisos.map((a: { codigo: string }) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);
    expect(body.avisos[0].detalhe).toContain("edição única");
  });

  it("GET sem comparação removida: avisos [] e comparacaoRemovida false", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos(), { validado: true }));
    const body = (await app.inject({ method: "GET", url: URL })).json();
    expect(body.avisos).toEqual([]);
    expect(body.config.comparacaoRemovida).toBe(false);
  });

  it("PUT limpando a comparação órfã NÃO reseta validado (o gerador já fazia edição única)", async () => {
    comComparacaoOrfa(true);
    const res = await app.inject({ method: "PUT", url: URL, payload: corpo(valoresCompletos()) });
    expect(res.json()).toEqual({ ok: true, validacaoResetada: false });
    expect(store.gravar.mock.calls[0][2]).toEqual({ resetarValidado: false });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(true);
  });

  it("PUT trocando a comparação órfã por OUTRO funil reseta validado (premissa nova)", async () => {
    comComparacaoOrfa(true);
    const res = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpo(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilComparacao })),
    });
    expect(res.json()).toEqual({ ok: true, validacaoResetada: true });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(false);
  });

  it("PUT reenviando o id órfão → 400 (não é funil do projeto); nada gravado", async () => {
    comComparacaoOrfa(true);
    const res = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpo(valoresCompletos({ lancamentoComparacaoFunnelId: IDS.funilDeOutroProjeto })),
    });
    expect(res.statusCode).toBe(400);
    expect(store.gravar).not.toHaveBeenCalled();
  });
});

describe("AC11 — tipo de funil nas rotas", () => {
  it("perpétuo: PUT sem campos cria a linha (ancora validado); campo de lançamento → 400", async () => {
    mundo = mundoPadrao(contexto({ funnelType: "perpetual" }));
    store = storeEmMemoria(mundo);
    app = await montarApp();

    const vazio = await app.inject({ method: "PUT", url: URL, payload: {} });
    expect(vazio.statusCode).toBe(200);
    expect(store.gravar.mock.calls[0][1]).toEqual({
      inicioCaptacao: null,
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: null,
      downsell: null,
      lancamentoComparacaoFunnelId: null,
      etapas: [],
      perguntasConfirmadas: {},
      closerMediums: null,
      closerPorSellerName: null,
      ferramentasDeAtendimento: null,
      dimensaoDeCriativo: null,
    });

    const comCampo = await app.inject({ method: "PUT", url: URL, payload: corpo() });
    expect(comCampo.statusCode).toBe(400);
    expect(comCampo.json().erros[0]).toContain("não se aplica a funil perpétuo");

    const validar = await app.inject({ method: "POST", url: `${URL}/validate` });
    expect(validar.statusCode).toBe(200);

    // O GET mostra o bloqueio do AC11 mesmo validado (até a 49.10).
    const get = await app.inject({ method: "GET", url: URL });
    expect(get.json().bloqueio.erro).toBe("TIPO_DE_FUNIL_NAO_SUPORTADO");
    expect(get.json().camposFaltantes).toEqual([]);
    expect(get.json().perguntasDisponiveis).toEqual([]);
  });

  it("mobile: PUT e validate → 422 TIPO_DE_FUNIL_NAO_SUPORTADO, nada gravado", async () => {
    mundo = mundoPadrao(contexto({ funnelType: "mobile" }));
    store = storeEmMemoria(mundo);
    app = await montarApp();
    const put = await app.inject({ method: "PUT", url: URL, payload: {} });
    expect(put.statusCode).toBe(422);
    expect(put.json().erro).toBe("TIPO_DE_FUNIL_NAO_SUPORTADO");
    expect(put.json().detalhe).toContain('"mobile"');
    const val = await app.inject({ method: "POST", url: `${URL}/validate` });
    expect(val.statusCode).toBe(422);
    expect(store.gravar).not.toHaveBeenCalled();
    expect(store.marcarValidado).not.toHaveBeenCalled();
  });
});

describe("POST /validate", () => {
  it("sem config → 404 (salvar antes)", async () => {
    const res = await app.inject({ method: "POST", url: `${URL}/validate` });
    expect(res.statusCode).toBe(404);
  });

  it("marca validado/validado_em/validado_por com o usuário da requisição", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const res = await app.inject({ method: "POST", url: `${URL}/validate` });
    expect(res.statusCode).toBe(200);
    expect(store.marcarValidado).toHaveBeenCalledWith(IDS.debriefing, IDS.usuario);
    expect(mundo.linhas.get(IDS.debriefing)).toMatchObject({ validado: true, validadoPor: IDS.usuario });
  });
});

describe("GET — config, gate, imposto e perguntas", () => {
  it("sem config: bloqueio de ausência, imposto resolvível, perguntas por etapa", async () => {
    mundo.impostoPorProjeto.set(IDS.projeto, "0.1000");
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tipoDeFunil).toBe("launch");
    expect(body.config).toBeNull();
    expect(body.bloqueio.erro).toBe("COMBINACAO_NAO_VALIDADA");
    expect(body.combinacaoLiberada).toBe(false);
    expect(body.imposto).toEqual({ valor: 0.1, origem: "project" });
    const captacao = body.perguntasDisponiveis.find((p: { stageId: string }) => p.stageId === IDS.captacao);
    expect(captacao.status).toBe("ok");
    expect(captacao.perguntas.map((q: { key: string }) => q.key)).toEqual(["faixa", "q_renda", "q_idade"]);
    // A própria etapa de debriefing não é oferecida.
    expect(body.perguntasDisponiveis.some((p: { stageId: string }) => p.stageId === IDS.debriefing)).toBe(false);
  });

  it("falha ao ler a planilha ≠ sem pesquisa", async () => {
    mundo.perguntas.set(IDS.captacao, new Error("Sheets fora"));
    const body = (await app.inject({ method: "GET", url: URL })).json();
    const porEtapa = Object.fromEntries(
      body.perguntasDisponiveis.map((p: { stageId: string; status: string }) => [p.stageId, p.status]),
    );
    expect(porEtapa[IDS.captacao]).toBe("falha");
    expect(porEtapa[IDS.principal]).toBe("sem-pesquisa");
  });

  it("comparação omitida → GET devolve null; combinação liberada e completa → bloqueio null", async () => {
    const dg = DEBRIEFING_COMBINACOES_LIBERADAS[0];
    mundo = mundoPadrao(contexto({ projectId: dg.projectId, funnelId: dg.funnelId }));
    store = storeEmMemoria(mundo);
    app = await montarApp();
    const url = `/api/projects/${dg.projectId}/funnels/${dg.funnelId}/stages/${IDS.debriefing}/debriefing/config`;
    const b = corpo();
    delete b.lancamentoComparacaoFunnelId;
    expect((await app.inject({ method: "PUT", url, payload: b })).statusCode).toBe(200);
    const body = (await app.inject({ method: "GET", url })).json();
    expect(body.config.lancamentoComparacaoFunnelId).toBeNull();
    expect(body.combinacaoLiberada).toBe(true);
    expect(body.bloqueio).toBeNull();
    expect(body.camposFaltantes).toEqual([]);
  });

  it("config incompleta: bloqueio CONFIG_INCOMPLETA e campos faltantes listados", async () => {
    mundo.linhas.set(
      IDS.debriefing,
      linha(IDS.debriefing, valoresCompletos({ dimensaoDeCriativo: null }), { validado: true, validadoPor: IDS.usuario }),
    );
    const body = (await app.inject({ method: "GET", url: URL })).json();
    expect(body.bloqueio.erro).toBe("CONFIG_INCOMPLETA");
    expect(body.camposFaltantes).toEqual(["dimensaoDeCriativo"]);
    expect(body.config.validadoPorNome).toBe("Fulano do Time");
  });
});
