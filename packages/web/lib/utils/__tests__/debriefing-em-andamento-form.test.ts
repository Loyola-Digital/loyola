// Story 49.12 — o formulário e o botão do Debriefing com o lançamento EM
// ANDAMENTO: a pergunta obrigatória, o que falta de fato em cada modo, o CORPO
// enviado ao PUT (com a API nova e com a anterior), o texto do botão (parcial
// com dados até ontem; "vai substituir") e o aviso do viewer (fora do iframe).

import { describe, expect, it } from "vitest";
import {
  AINDA_NAO,
  avisoDoBotaoDeGerar,
  corpoDoPut,
  erroDaGeracao,
  faltantesDoForm,
  formDoGet,
  formVazio,
  motivoSemEmAndamento,
  ontemEmBrasilia,
  type DebriefingConfigGet,
  type FormDaConfig,
} from "../debriefing-config-form";
import { avisoDeParcialNoViewer, buildDebriefingSrcDoc } from "@/lib/debriefing-frame";

const CAP = "s-cap";

function formPG05(over: Partial<FormDaConfig> = {}): FormDaConfig {
  return {
    ...formVazio(),
    situacao: "em-andamento",
    inicioCaptacao: "2026-09-30",
    carrinhoAindaNao: { aberturaCarrinho: true, fimCarrinho: true },
    reabertura: { houve: false, abertura: "", fim: "" },
    downsell: { houve: AINDA_NAO, abertura: "", fim: "" },
    papeis: { [CAP]: "vendas-captacao" },
    perguntas: { [CAP]: { faixa: "faixa" } },
    closerMediums: { resposta: "nenhum", texto: "" },
    closerPorSellerName: false,
    ferramentas: { resposta: "nenhuma", texto: "" },
    dimensaoDeCriativo: "nenhuma",
    ...over,
  };
}

function getCom(config: Partial<NonNullable<DebriefingConfigGet["config"]>> | null, extra: Partial<DebriefingConfigGet> = {}): DebriefingConfigGet {
  return {
    tipoDeFunil: "launch",
    config: config
      ? {
          datasChave: { inicioCaptacao: "2026-09-30", aberturaCarrinho: null, fimCarrinho: null, reabertura: { houve: false }, downsell: null },
          lancamentoComparacaoFunnelId: null,
          etapas: [],
          perguntasConfirmadas: {},
          closerMediums: [],
          closerPorSellerName: false,
          ferramentasDeAtendimento: [],
          dimensaoDeCriativo: "nenhuma",
          comparacaoRemovida: false,
          validado: false,
          validadoEm: null,
          validadoPorNome: null,
          ...config,
        }
      : null,
    bloqueio: null,
    camposFaltantes: [],
    avisos: [],
    combinacaoLiberada: true,
    imposto: { valor: 0.1215, origem: "default" },
    perguntasDisponiveis: [],
    ...extra,
  };
}

describe("AC1 — 'O lançamento terminou?' é obrigatória e não vem pré-marcada", () => {
  it("config nova: a pergunta falta; config salva antes da 49.12 (API sem o campo): encerrado, sem pedir de novo", () => {
    expect(formVazio().situacao).toBeNull();
    expect(faltantesDoForm(formPG05({ situacao: null }))).toContain("O lançamento terminou? (encerrado ou em andamento)");
    expect(formDoGet(getCom({})).situacao).toBe("encerrado");
    expect(formDoGet(getCom(null)).situacao).toBeNull();
    expect(formDoGet(getCom({ situacaoDoLancamento: "em-andamento", datasChave: { inicioCaptacao: "2026-09-30", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null, aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura"] } }))).toMatchObject({
      situacao: "em-andamento",
      carrinhoAindaNao: { aberturaCarrinho: true, fimCarrinho: true },
      reabertura: { houve: AINDA_NAO },
      downsell: { houve: null },
    });
  });
});

describe("AC2 — o formulário só lista o que falta DE FATO no modo escolhido", () => {
  it("PG05 em andamento com o carrinho 'ainda não aconteceu': 'Abertura do carrinho' e 'Fim do carrinho' saem da lista", () => {
    expect(faltantesDoForm(formPG05())).toEqual([]);
  });

  it("em andamento sem resposta: cada fase pede a data OU 'ainda não aconteceu'", () => {
    const f = formPG05({ carrinhoAindaNao: { aberturaCarrinho: false, fimCarrinho: false }, downsell: { houve: null, abertura: "", fim: "" } });
    expect(faltantesDoForm(f)).toEqual([
      'Abertura do carrinho (a data ou "ainda não aconteceu")',
      'Fim do carrinho (a data ou "ainda não aconteceu")',
      'Downsell: responda "houve", "não houve" ou "ainda não aconteceu"',
    ]);
  });

  it("encerrado: 'ainda não aconteceu' não vale — as datas e o 'houve/não houve' voltam a faltar", () => {
    expect(faltantesDoForm(formPG05({ situacao: "encerrado" }))).toEqual(["Abertura do carrinho", "Fim do carrinho", 'Downsell: responda "houve" ou "não houve"']);
  });
});

describe("AC11/AC12 — o corpo do PUT", () => {
  it("API v35+: situação + datas nulas + fases 'ainda não aconteceu' ('não houve' continua {houve:false})", () => {
    const c = corpoDoPut(formPG05(), { apiContrato: 35, removidos: [] });
    expect(c.situacaoDoLancamento).toBe("em-andamento");
    expect(c.datasChave).toEqual({
      inicioCaptacao: "2026-09-30",
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: { houve: false },
      downsell: null,
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "downsell"],
    });
  });

  it("API v35+ e encerrado: a situação explícita e nenhuma fase", () => {
    const f = formPG05({ situacao: "encerrado", aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25", carrinhoAindaNao: { aberturaCarrinho: false, fimCarrinho: false }, downsell: { houve: false, abertura: "", fim: "" } });
    const c = corpoDoPut(f, { apiContrato: 35, removidos: [] });
    expect(c.situacaoDoLancamento).toBe("encerrado");
    expect((c.datasChave as Record<string, unknown>).aindaNaoAconteceu).toEqual([]);
    expect((c.datasChave as Record<string, unknown>).aberturaCarrinho).toBe("2026-10-20");
  });

  it("API v34 (anterior): nenhuma chave nova (o corpo `.strict()` dela recusaria) — o formulário de antes", () => {
    const f = formPG05({ situacao: "encerrado", aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25", downsell: { houve: false, abertura: "", fim: "" } });
    const c = corpoDoPut(f, { apiContrato: 34, removidos: [] });
    expect(c).not.toHaveProperty("situacaoDoLancamento");
    expect(c.datasChave).toEqual({ inicioCaptacao: "2026-09-30", aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25", reabertura: { houve: false }, downsell: { houve: false } });
  });

  it("API atrás: a opção 'em andamento' fica desabilitada com a frase de API atrás (47.15)", () => {
    expect(motivoSemEmAndamento(34)).toBe("A API ainda não tem o modo “em andamento” do debriefing — provavelmente está atrás do painel. Veja o aviso de versão no topo.");
    expect(motivoSemEmAndamento(undefined)).not.toBeNull();
    expect(motivoSemEmAndamento(35)).toBeNull();
  });
});

describe("AC3/AC11 — o botão diz que gera uma parcial com dados até ontem (Brasília) e que vai substituir", () => {
  it("ontem é o de Brasília, não o de UTC (01:30 UTC de 07/10 = 22:30 de 06/10 em Brasília)", () => {
    expect(ontemEmBrasilia(new Date("2026-10-07T01:30:00.000Z"))).toBe("2026-10-05");
    expect(ontemEmBrasilia(new Date("2026-10-07T03:30:00.000Z"))).toBe("2026-10-06");
  });

  it("em andamento sem parcial; com parcial → avisa que substitui; encerrado → o botão de sempre", () => {
    const agora = new Date("2026-10-07T15:00:00.000Z");
    expect(avisoDoBotaoDeGerar(getCom({ situacaoDoLancamento: "em-andamento" }, { parcialAtual: null }), agora)).toEqual({
      rotulo: "Gerar parcial (dados até 06/10)",
      detalhe: "Lançamento em andamento: gera uma parcial com os dados até 06/10 (ontem, no fuso de Brasília).",
    });
    const com = avisoDoBotaoDeGerar(
      getCom({ situacaoDoLancamento: "em-andamento" }, { parcialAtual: { debriefingId: "d1", geradaEm: "2026-10-06T12:00:00.000Z", corte: "2026-10-05", dMaisN: 5 } }),
      agora,
    );
    expect(com!.detalhe).toMatch(/SUBSTITUI a parcial atual \(dados até 05\/10\)/);
    expect(avisoDoBotaoDeGerar(getCom({ situacaoDoLancamento: "encerrado" }), agora)).toBeNull();
    expect(avisoDoBotaoDeGerar(getCom({}), agora)).toBeNull(); // API anterior
  });

  it("os 422 novos aparecem no bloco de erro persistente com título, código, detalhe e ação", () => {
    for (const [erro, titulo] of [
      ["SEM_DIA_FECHADO", "Ainda não há dia fechado para analisar"],
      ["CARRINHO_JA_ABERTO", "O carrinho já abriu"],
      ["MIDIA_DO_CORTE_NAO_SINCRONIZADA", "Mídia do dia de corte não sincronizada"],
      ["COMPARACAO_EM_ANDAMENTO", "Lançamento de comparação em andamento"],
    ] as const) {
      expect(erroDaGeracao({ status: 422, body: { erro, detalhe: "d", acao: "a" } })).toEqual({ titulo, codigo: erro, detalhe: "d", acao: "a" });
    }
  });
});

describe("AC14 — o viewer avisa que o documento é parcial, fora do HTML salvo", () => {
  it("parcial → aviso com o corte, o D+N e que a próxima geração substitui as edições", () => {
    expect(avisoDeParcialNoViewer({ parcial: { corte: "2026-10-06", dMaisN: 6 } })).toBe(
      "Documento PARCIAL — lançamento em andamento, dados até 06/10/2026 (D+6). A próxima geração substitui este documento, inclusive as edições feitas aqui (os comentários ficam).",
    );
  });

  it("final, upload manual (null) e API anterior (campo ausente) → sem aviso", () => {
    expect(avisoDeParcialNoViewer({ parcial: null })).toBeNull();
    expect(avisoDeParcialNoViewer({})).toBeNull();
    expect(avisoDeParcialNoViewer(undefined)).toBeNull();
  });

  it("o aviso não entra no documento do iframe (nem no editável, que é o que a edição inline salva)", () => {
    const html = "<!DOCTYPE html><html><body><h1>Debriefing PARCIAL</h1></body></html>";
    const aviso = avisoDeParcialNoViewer({ parcial: { corte: "2026-10-06", dMaisN: 6 } })!;
    for (const editable of [false, true]) {
      const doc = buildDebriefingSrcDoc(html, { editable });
      expect(doc).not.toContain(aviso);
      expect(doc).not.toContain("A próxima geração substitui");
    }
  });
});
