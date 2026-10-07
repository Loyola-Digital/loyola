// Story 49.6 — o CORPO que o formulário envia ao PUT da config (49.11 AC7/AC11 f),
// os campos obrigatórios nomeados e a leitura do erro da geração.

import { describe, expect, it } from "vitest";
import {
  corpoDoPut,
  erroDaGeracao,
  ESCOPO_DOS_FUNIS_DA_COMPARACAO,
  erroDaValidacao,
  faltantesDoForm,
  formDoGet,
  formVazio,
  listaEfetivaDoGet,
  motivoSemSegundoItem,
  nomeDoFunilDaComparacao,
  opcoesDaComparacao,
  type DebriefingConfigGet,
  type FunilDaComparacao,
  type FormDaConfig,
} from "../debriefing-config-form";

const CAP = "s-cap";
const PRIN = "s-prin";

function formCompleto(over: Partial<FormDaConfig> = {}): FormDaConfig {
  return {
    ...formVazio(),
    situacao: "encerrado", // 49.12 AC1: a pergunta é obrigatória (config nova não vem pré-marcada)
    inicioCaptacao: "2026-04-16",
    aberturaCarrinho: "2026-05-09",
    fimCarrinho: "2026-05-27",
    reabertura: { houve: false, abertura: "", fim: "" },
    downsell: { houve: true, abertura: "2026-06-03", fim: "2026-06-13" },
    papeis: { [CAP]: "vendas-captacao", [PRIN]: "vendas-principal" },
    perguntas: { [CAP]: { faixa: "faixa" } },
    closerMediums: { resposta: "lista", texto: "x1, comercial" },
    closerPorSellerName: true,
    ferramentas: { resposta: "nenhuma", texto: "" },
    dimensaoDeCriativo: "ia-humano",
    ...over,
  };
}

function getCom(config: Partial<NonNullable<DebriefingConfigGet["config"]>>): DebriefingConfigGet {
  return {
    tipoDeFunil: "launch",
    config: {
      datasChave: { inicioCaptacao: "2026-04-16", aberturaCarrinho: "2026-05-09", fimCarrinho: "2026-05-27", reabertura: { houve: false }, downsell: { houve: false } },
      lancamentoComparacaoFunnelId: null,
      etapas: [],
      perguntasConfirmadas: {},
      closerMediums: null,
      closerPorSellerName: null,
      ferramentasDeAtendimento: null,
      dimensaoDeCriativo: null,
      comparacaoRemovida: false,
      validado: false,
      validadoEm: null,
      validadoPorNome: null,
      ...config,
    },
    bloqueio: null,
    camposFaltantes: [],
    avisos: [],
    combinacaoLiberada: false,
    imposto: { valor: 0.1215, origem: "default" },
    perguntasDisponiveis: [],
  };
}

describe("49.11 AC7 / AC11(f) — corpo enviado (não o tipo)", () => {
  it("0 item: só o campo antigo, null — sem a chave nova", () => {
    const c = corpoDoPut(formCompleto(), { apiContrato: 32, removidos: [] });
    expect(c.lancamentoComparacaoFunnelId).toBeNull();
    expect(c).not.toHaveProperty("lancamentosComparacao");
  });
  it("1 item: só o campo antigo (a API v30 recusaria a chave nova)", () => {
    const c = corpoDoPut(formCompleto({ comparacoes: ["f1"] }), { apiContrato: 30, removidos: [] });
    expect(c.lancamentoComparacaoFunnelId).toBe("f1");
    expect(c).not.toHaveProperty("lancamentosComparacao");
    expect(c).not.toHaveProperty("pesquisaDeCaptacaoPorEtapa");
  });
  it("2+ itens: as duas chaves, o antigo = o 1º, ordem preservada", () => {
    const c = corpoDoPut(formCompleto({ comparacoes: ["f2", "f1", "f3"] }), { apiContrato: 31, removidos: [] });
    expect(c.lancamentoComparacaoFunnelId).toBe("f2");
    expect(c.lancamentosComparacao).toEqual(["f2", "f1", "f3"]);
  });
  it("UX-002: o removido pelo servidor sai antes de salvar; se era o principal, o próximo assume", () => {
    const c = corpoDoPut(formCompleto({ comparacoes: ["morto", "f1"] }), { apiContrato: 31, removidos: ["morto"] });
    expect(c.lancamentoComparacaoFunnelId).toBe("f1");
    expect(c).not.toHaveProperty("lancamentosComparacao");
  });
  it("pesquisa de captação só com a API ≥ 31, e só de etapa do lançamento", () => {
    const f = formCompleto({ pesquisaDeCaptacao: { [CAP]: "pesq-1", "fora": "pesq-2" } });
    expect(corpoDoPut(f, { apiContrato: 30, removidos: [] })).not.toHaveProperty("pesquisaDeCaptacaoPorEtapa");
    expect(corpoDoPut(f, { apiContrato: undefined, removidos: [] })).not.toHaveProperty("pesquisaDeCaptacaoPorEtapa");
    expect(corpoDoPut(f, { apiContrato: 31, removidos: [] }).pesquisaDeCaptacaoPorEtapa).toEqual({ [CAP]: "pesq-1" });
  });
  it("respostas explícitas: 'não houve' vira {houve:false}; 'nenhuma' vira []; listas normalizadas", () => {
    const c = corpoDoPut(formCompleto(), { apiContrato: 32, removidos: [] }) as {
      datasChave: { reabertura: unknown; downsell: unknown };
      ferramentasDeAtendimento: string[];
      closerMediums: string[];
      perguntasConfirmadas: Record<string, unknown>;
    };
    expect(c.datasChave.reabertura).toEqual({ houve: false });
    expect(c.datasChave.downsell).toEqual({ houve: true, abertura: "2026-06-03", fim: "2026-06-13" });
    expect(c.ferramentasDeAtendimento).toEqual([]);
    expect(c.closerMediums).toEqual(["x1", "comercial"]);
    expect(Object.keys(c.perguntasConfirmadas)).toEqual([CAP]);
  });
  it("o 2º item é bloqueado com motivo visível enquanto a API for anterior à 31", () => {
    expect(motivoSemSegundoItem(30)).toMatch(/contrato 31/);
    expect(motivoSemSegundoItem(undefined)).not.toBeNull();
    expect(motivoSemSegundoItem(31)).toBeNull();
  });
});

describe("leitura do GET (CONTRACT-001 / API antiga)", () => {
  it("lista gravada no form (removidos riscados); a efetiva exclui os removidos", () => {
    const g = getCom({ lancamentoComparacaoFunnelId: "morto", lancamentosComparacao: ["morto", "f1"], comparacoesRemovidas: ["morto"], comparacaoRemovida: true });
    expect(formDoGet(g).comparacoes).toEqual(["morto", "f1"]);
    expect(listaEfetivaDoGet(g.config!)).toEqual(["f1"]);
  });
  it("API v30 (sem a lista): vale o campo antigo; comparacaoRemovida marca ele", () => {
    const g = getCom({ lancamentoComparacaoFunnelId: "f9", comparacaoRemovida: true });
    expect(formDoGet(g).comparacoes).toEqual(["f9"]);
    expect(listaEfetivaDoGet(g.config!)).toEqual([]);
  });
  it("config nula → formulário vazio, nada presumido", () => {
    const f = formDoGet({ ...getCom({}), config: null });
    expect(f).toEqual(formVazio());
    expect(f.reabertura.houve).toBeNull();
    expect(f.dimensaoDeCriativo).toBeNull();
  });
  it("[] gravado vira a resposta explícita 'nenhum(a)'; null vira 'não respondido'", () => {
    const f = formDoGet(getCom({ closerMediums: [], ferramentasDeAtendimento: null }));
    expect(f.closerMediums.resposta).toBe("nenhum");
    expect(f.ferramentas.resposta).toBeNull();
  });
});

describe("AC11 — não deixa enviar com obrigatório vazio e diz qual", () => {
  it("formulário vazio lista cada campo, sem presumir padrão", () => {
    const falta = faltantesDoForm(formVazio());
    for (const t of ["Início da captação", "Abertura do carrinho", "Fim do carrinho", "Reabertura", "Downsell", "Etapas do lançamento", "utm_medium de closer", "seller_name", "Ferramentas de atendimento", "Dimensão de criativo"]) {
      expect(falta.some((f) => f.includes(t)), t).toBe(true);
    }
  });
  it("completo → nada falta; 'houve' sem datas falta; faixa ausente falta mas 'não tem faixa' (null) é resposta", () => {
    expect(faltantesDoForm(formCompleto(), [{ stageId: CAP, nome: "Captação" }])).toEqual([]);
    expect(faltantesDoForm(formCompleto({ reabertura: { houve: true, abertura: "", fim: "" } }))).toEqual(["Reabertura: datas de abertura e fim"]);
    expect(faltantesDoForm(formCompleto({ perguntas: {} }), [{ stageId: CAP, nome: "Captação" }])[0]).toMatch(/faixa da etapa "Captação"/);
    expect(faltantesDoForm(formCompleto({ perguntas: { [CAP]: { faixa: null } } }), [{ stageId: CAP, nome: "Captação" }])).toEqual([]);
  });
});

describe("AC11/AC12 — erro da geração na tela", () => {
  it("422 com código/detalhe/ação, inclusive INVARIANTE_VIOLADO com as violações", () => {
    const e = erroDaGeracao({ status: 422, body: { erro: "INVARIANTE_VIOLADO", codigo: "F3", detalhe: "Σ ≠ total", acao: "conferir", violacoes: [{ codigo: "F3", detalhe: "x" }] } });
    expect(e).toMatchObject({ titulo: "Os números não fecham (F3)", codigo: "F3", detalhe: "Σ ≠ total", acao: "conferir" });
    expect(e.violacoes).toHaveLength(1);
  });
  it("decisão 10: TEXTO_IA_* também vira código + motivo + ação", () => {
    expect(erroDaGeracao({ status: 422, body: { erro: "TEXTO_IA_REPROVADO", detalhe: "número fora", acao: "gerar de novo" } })).toMatchObject({ codigo: "TEXTO_IA_REPROVADO", titulo: "Textos da IA reprovados" });
  });
  it("API atrás (404 Not Found da rota inexistente) → frase padrão, nunca 'Not Found' cru", () => {
    const e = erroDaGeracao({ status: 404, message: "Not Found", body: { error: "Not Found" } });
    expect(e.titulo).toBe("API atrás do painel");
    expect(e.detalhe).not.toMatch(/^Not Found$/);
  });
  it("404 de domínio (etapa não encontrada) NÃO é API atrás", () => {
    expect(erroDaGeracao({ status: 404, body: { error: "Etapa não encontrada" } }).titulo).not.toBe("API atrás do painel");
  });
});

describe("UX-496-2 — erro de \"Marcar combinação como validada\" na tela (código, detalhe, ação)", () => {
  it("422 do gate da 49.1 → o corpo inteiro, como na geração", () => {
    expect(
      erroDaValidacao({ status: 422, body: { erro: "TIPO_DE_FUNIL_NAO_SUPORTADO", detalhe: "funil perpétuo", acao: "Aguardar a Story 49.10" } }),
    ).toEqual({ titulo: "Tipo de funil não suportado", codigo: "TIPO_DE_FUNIL_NAO_SUPORTADO", detalhe: "funil perpétuo", acao: "Aguardar a Story 49.10" });
  });
  it("404 de config ausente → título da VALIDAÇÃO (não 'gerar'), código HTTP, o motivo da API e a ação de salvar antes", () => {
    const e = erroDaValidacao({ status: 404, body: { error: "Configuração não encontrada — salve a config do debriefing antes de validar" } });
    expect(e).toEqual({
      titulo: "Não foi possível marcar a combinação como validada",
      codigo: "HTTP 404",
      detalhe: "Configuração não encontrada — salve a config do debriefing antes de validar",
      acao: "Salvar a config do debriefing e validar de novo",
    });
  });
  it("API atrás (404 Not Found cru) → frase padrão, nunca 'Not Found'", () => {
    const e = erroDaValidacao({ status: 404, message: "Not Found", body: { error: "Not Found" } });
    expect(e.titulo).toBe("API atrás do painel");
    expect(e.detalhe).not.toMatch(/^Not Found$/);
  });
  it("todo caminho tem detalhe e ação não vazios (falha de rede sem status inclusive)", () => {
    for (const x of [{ message: "Failed to fetch" }, { status: 500, body: {} }, { status: 403 }, null]) {
      const e = erroDaValidacao(x);
      expect(e.detalhe).toMatch(/\S/);
      expect(e.acao).toMatch(/\S/);
    }
  });
});

describe("49.13 — lançamentos arquivados na lista de comparação", () => {
  // Funis do projeto na ordem em que a API os devolve (arquivado no meio de propósito).
  const PROJETO: FunilDaComparacao[] = [
    { id: "f-atual", name: "DG PG05", archivedAt: null },
    { id: "f-pg03", name: "DG PG03", archivedAt: "2026-08-01T12:00:00.000Z" },
    { id: "f-pg04", name: "DG PG04", archivedAt: null },
    { id: "f-pg01", name: "DG PG01", archivedAt: "2026-03-10T12:00:00.000Z" },
    { id: "f-pg02", name: "DG PG02" },
  ];
  // O que `GET /api/projects/:id/funnels?archived=<escopo>` devolve
  // (`routes/funnels.ts`: "false" → `archivedAt IS NULL`; "all" → sem filtro).
  const doServidor = (escopo: "false" | "all") => (escopo === "all" ? PROJETO : PROJETO.filter((x) => !x.archivedAt));
  const funis = doServidor(ESCOPO_DOS_FUNIS_DA_COMPARACAO);

  it("AC1 (a) — o formulário busca ativos E arquivados, e o arquivado está nas opções (menos o próprio e os já na lista)", () => {
    expect(ESCOPO_DOS_FUNIS_DA_COMPARACAO).toBe("all");
    const ids = opcoesDaComparacao(funis, "f-atual", ["f-pg04"]).map((o) => o.id);
    expect(ids).toContain("f-pg03");
    expect(ids).toContain("f-pg01");
    expect(ids).not.toContain("f-atual");
    expect(ids).not.toContain("f-pg04");
    expect(ids).toHaveLength(3);
  });

  it("AC2 (b) — arquivado com o sufixo \"(arquivado)\" e ativos antes dos arquivados (ordem da API dentro de cada grupo)", () => {
    expect(opcoesDaComparacao(PROJETO, "f-atual", [])).toEqual([
      { id: "f-pg04", rotulo: "DG PG04" },
      { id: "f-pg02", rotulo: "DG PG02" },
      { id: "f-pg03", rotulo: "DG PG03 (arquivado)" },
      { id: "f-pg01", rotulo: "DG PG01 (arquivado)" },
    ]);
  });

  it("AC3 (c) — comparação salva que hoje está arquivada aparece pelo nome com \"(arquivado)\", nunca pelo id", () => {
    expect(nomeDoFunilDaComparacao(funis, "f-pg03")).toBe("DG PG03 (arquivado)");
    expect(nomeDoFunilDaComparacao(funis, "f-pg04")).toBe("DG PG04");
    // Funil apagado (não volta nem com "all") continua pelo id, como hoje.
    expect(nomeDoFunilDaComparacao(funis, "f-apagado")).toBe("f-apagado");
    expect(nomeDoFunilDaComparacao(undefined, "f-pg03")).toBe("f-pg03");
  });
});
