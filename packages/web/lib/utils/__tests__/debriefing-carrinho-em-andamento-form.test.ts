// Story 49.14 — o formulário e o botão com o CARRINHO aberto: o aviso, antes do
// clique, de que todas as fases terminaram e dá para marcar "encerrado" (AC6,
// R9-5 — sem bloquear a geração), e o rótulo do "em andamento" pelo contrato
// (a API v35 ainda responde 422 com o carrinho aberto).

import { describe, expect, it } from "vitest";
import {
  AINDA_NAO,
  avisoDoBotaoDeGerar,
  corpoDoPut,
  datasDasFasesDoForm,
  faltantesDoForm,
  formDoGet,
  formVazio,
  motivoSemFimAindaNao,
  rotuloDoEmAndamento,
  todasAsFasesTerminaram,
  type DebriefingConfigGet,
  type FormDaConfig,
} from "../debriefing-config-form";

/** 12:00 de 07/10/2026 em Brasília → ontem = 06/10. */
const AGORA = new Date("2026-10-07T15:00:00.000Z");
/** 22:30 de 06/10 em Brasília (01:30 UTC de 07/10): ontem = 05/10 em Brasília, 06/10 em UTC. */
const AGORA_NA_VIRADA = new Date("2026-10-07T01:30:00.000Z");

const datas = (over: Partial<NonNullable<DebriefingConfigGet["config"]>["datasChave"]> = {}) => ({
  inicioCaptacao: "2026-09-01",
  aberturaCarrinho: "2026-09-20",
  fimCarrinho: "2026-10-06",
  reabertura: { houve: false as const },
  downsell: { houve: false as const },
  ...over,
});

function getCom(d: ReturnType<typeof datas>): Pick<DebriefingConfigGet, "config" | "parcialAtual"> {
  return {
    parcialAtual: null,
    config: {
      situacaoDoLancamento: "em-andamento",
      datasChave: d,
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
    } as unknown as NonNullable<DebriefingConfigGet["config"]>,
  };
}

describe("AC6 — todas as fases terminaram até ontem", () => {
  it("fronteiras: fim = ontem terminou; fim = hoje não; 'ainda não aconteceu' (null) nunca terminou", () => {
    expect(todasAsFasesTerminaram(datas(), "2026-10-06")).toBe(true);
    expect(todasAsFasesTerminaram(datas({ fimCarrinho: "2026-10-07" }), "2026-10-06")).toBe(false);
    expect(todasAsFasesTerminaram(datas({ fimCarrinho: null }), "2026-10-06")).toBe(false);
    expect(todasAsFasesTerminaram(datas({ downsell: null }), "2026-10-06")).toBe(false);
    expect(todasAsFasesTerminaram(datas({ downsell: { houve: true, abertura: "2026-10-05", fim: "2026-10-06" } }), "2026-10-06")).toBe(true);
    expect(todasAsFasesTerminaram(datas({ reabertura: { houve: true, abertura: "2026-10-05", fim: "2026-10-08" } }), "2026-10-06")).toBe(false);
  });

  it("o botão avisa antes do clique, sem deixar de oferecer a geração (rótulo de sempre)", () => {
    const a = avisoDoBotaoDeGerar(getCom(datas()), AGORA, 36)!;
    expect(a.rotulo).toBe("Gerar parcial (dados até 06/10)");
    expect(a.fasesConcluidas).toBe(
      "Todas as fases (carrinho, reabertura e downsell) terminaram até 06/10: a parcial sai com os números do relatório final. Para gerar o relatório final, marque “encerrado” na configuração do debriefing.",
    );
    expect(avisoDoBotaoDeGerar(getCom(datas({ fimCarrinho: "2026-10-10" })), AGORA, 36)!.fasesConcluidas).toBeUndefined();
  });

  it("FE-001: contra a API v35 (422 CARRINHO_JA_ABERTO) ou de contrato desconhecido, o aviso diz que a API está atrás — nunca 'sai com os números do final'", () => {
    for (const contrato of [35, 34, null, undefined]) {
      const a = avisoDoBotaoDeGerar(getCom(datas()), AGORA, contrato)!;
      expect(a.fasesConcluidas).toMatch(/^Todas as fases \(carrinho, reabertura e downsell\) terminaram até 06\/10, mas a API em uso/);
      expect(a.fasesConcluidas).toMatch(/ainda não gera a parcial com o carrinho aberto \(contrato 36\) — provavelmente está atrás do painel/);
      expect(a.fasesConcluidas).not.toMatch(/números do relatório final/);
      expect(a.fasesConcluidas).toMatch(/marque “encerrado”/);
    }
    expect(avisoDoBotaoDeGerar(getCom(datas()), AGORA, 35)!.fasesConcluidas).toContain("(contrato 35)");
    expect(avisoDoBotaoDeGerar(getCom(datas()), AGORA, 37)!.fasesConcluidas).toMatch(/a parcial sai com os números do relatório final/);
  });

  it("'ontem' é o de Brasília: às 22:30 de 06/10 o fim em 06/10 ainda não terminou", () => {
    expect(avisoDoBotaoDeGerar(getCom(datas()), AGORA_NA_VIRADA, 36)!.fasesConcluidas).toBeUndefined();
    expect(avisoDoBotaoDeGerar(getCom(datas({ fimCarrinho: "2026-10-05" })), AGORA_NA_VIRADA, 36)!.fasesConcluidas).toMatch(/até 05\/10/);
  });

  it("no formulário: as datas vêm dos campos; a caixa 'ainda não aconteceu' e a 3ª resposta contam como não terminou", () => {
    const f: FormDaConfig = {
      ...formVazio(),
      situacao: "em-andamento",
      inicioCaptacao: "2026-09-01",
      aberturaCarrinho: "2026-09-20",
      fimCarrinho: "2026-10-06",
      reabertura: { houve: false, abertura: "", fim: "" },
      downsell: { houve: true, abertura: "2026-10-01", fim: "2026-10-03" },
    };
    expect(datasDasFasesDoForm(f)).toEqual({
      aberturaCarrinho: "2026-09-20",
      fimCarrinho: "2026-10-06",
      reabertura: { houve: false },
      downsell: { houve: true, abertura: "2026-10-01", fim: "2026-10-03" },
    });
    expect(todasAsFasesTerminaram(datasDasFasesDoForm(f), "2026-10-06")).toBe(true);
    expect(todasAsFasesTerminaram(datasDasFasesDoForm({ ...f, carrinhoAindaNao: { aberturaCarrinho: false, fimCarrinho: true } }), "2026-10-06")).toBe(false);
    expect(todasAsFasesTerminaram(datasDasFasesDoForm({ ...f, downsell: { houve: AINDA_NAO, abertura: "", fim: "" } }), "2026-10-06")).toBe(false);
    expect(todasAsFasesTerminaram(datasDasFasesDoForm({ ...f, reabertura: { houve: null, abertura: "", fim: "" } }), "2026-10-06")).toBe(false);
  });
});

describe("o rótulo do 'em andamento' pelo contrato da API", () => {
  it("v36: 'Em andamento' (o carrinho aberto é calculado); v35 ou anterior: '(captação aberta)'", () => {
    expect(rotuloDoEmAndamento(36).rotulo).toBe("Em andamento");
    expect(rotuloDoEmAndamento(36).dica).toMatch(/com o carrinho aberto, o que já aconteceu entra até ontem, marcado como parcial/);
    expect(rotuloDoEmAndamento(35).rotulo).toBe("Em andamento (captação aberta)");
    expect(rotuloDoEmAndamento(35).dica).not.toMatch(/carrinho aberto/);
    expect(rotuloDoEmAndamento(null).rotulo).toBe("Em andamento (captação aberta)");
  });
});

describe("REQ-002 — reabertura/downsell abertos com o fim 'ainda não aconteceu' no formulário", () => {
  const base: FormDaConfig = {
    ...formVazio(),
    situacao: "em-andamento",
    inicioCaptacao: "2026-09-01",
    aberturaCarrinho: "2026-09-20",
    fimCarrinho: "2026-09-25",
    reabertura: { houve: false, abertura: "", fim: "" },
    downsell: { houve: true, abertura: "2026-10-01", fim: "", fimAindaNao: true },
    papeis: { s: "vendas-captacao" },
    perguntas: { s: { faixa: "faixa" } },
    closerMediums: { resposta: "nenhum", texto: "" },
    closerPorSellerName: false,
    ferramentas: { resposta: "nenhuma", texto: "" },
    dimensaoDeCriativo: "nenhuma",
  };

  it("o corpo do PUT (API 36) leva fim nulo e a resposta explícita `fimDownsell`; no encerrado, nada disso", () => {
    const c = corpoDoPut(base, { apiContrato: 36, removidos: [] }) as { datasChave: Record<string, unknown> };
    expect(c.datasChave.downsell).toEqual({ houve: true, abertura: "2026-10-01", fim: null });
    expect(c.datasChave.aindaNaoAconteceu).toEqual(["fimDownsell"]);
    const enc = corpoDoPut({ ...base, situacao: "encerrado" }, { apiContrato: 36, removidos: [] }) as { datasChave: Record<string, unknown> };
    expect(enc.datasChave.downsell).toEqual({ houve: true, abertura: "2026-10-01", fim: "" });
    expect(enc.datasChave.aindaNaoAconteceu).toEqual([]);
  });

  it("faltantes: em andamento a caixa basta; no encerrado o fim continua faltando; sem caixa e sem data, falta com a 2ª resposta possível", () => {
    expect(faltantesDoForm(base)).toEqual([]);
    expect(faltantesDoForm({ ...base, situacao: "encerrado" })).toContain("Downsell: datas de abertura e fim");
    expect(faltantesDoForm({ ...base, downsell: { houve: true, abertura: "2026-10-01", fim: "" } })).toContain(
      'Downsell: data de abertura e o fim (a data ou "fim ainda não aconteceu")',
    );
  });

  it("o GET volta para o formulário com a caixa marcada (não como data, nem como a fase inteira 'ainda não aconteceu')", () => {
    const f = formDoGet({
      tipoDeFunil: "launch",
      etapasDoFunil: [],
      config: {
        situacaoDoLancamento: "em-andamento",
        datasChave: { inicioCaptacao: "2026-09-01", aberturaCarrinho: "2026-09-20", fimCarrinho: "2026-09-25", reabertura: { houve: false }, downsell: { houve: true, abertura: "2026-10-01", fim: null }, aindaNaoAconteceu: ["fimDownsell"] },
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
      },
    } as unknown as DebriefingConfigGet);
    expect(f.downsell).toEqual({ houve: true, abertura: "2026-10-01", fim: "", fimAindaNao: true });
  });

  it("a fase aberta com o fim 'ainda não aconteceu' nunca terminou (aviso do AC6)", () => {
    expect(datasDasFasesDoForm(base).downsell).toEqual({ houve: true, abertura: "2026-10-01", fim: null });
    expect(todasAsFasesTerminaram(datasDasFasesDoForm(base), "2026-10-06")).toBe(false);
  });
});

describe("FE-002 — 'fim ainda não aconteceu' só com a API ≥ 36", () => {
  it("v36+: sem motivo; v35, v34 ou desconhecido: a frase de API atrás", () => {
    expect(motivoSemFimAindaNao(36)).toBeNull();
    expect(motivoSemFimAindaNao(37)).toBeNull();
    expect(motivoSemFimAindaNao(35)).toBe(
      "A API em uso (contrato 35) ainda não aceita “fim ainda não aconteceu” (contrato 36) — provavelmente está atrás do painel. Veja o aviso de versão no topo.",
    );
    expect(motivoSemFimAindaNao(34)).toMatch(/contrato 34/);
    expect(motivoSemFimAindaNao(undefined)).toMatch(/^A API em uso ainda não aceita/);
  });
});
