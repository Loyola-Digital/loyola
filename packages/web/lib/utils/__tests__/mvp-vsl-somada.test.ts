import { describe, expect, it } from "vitest";
import {
  AVISO_DA_CADEIA,
  cadeiaDaVslSomada,
  leituraDaChainNecessaria,
  montarVturbDaMvp,
} from "@/lib/utils/mvp-vsl-somada";
import { buildMeasuredRates } from "@/lib/utils/mvp-chain-rates";
import {
  MOTIVO_FALHA,
  MOTIVO_SEM_PITCH,
  totalDaTabela,
  type TabelaDeVslsDoFunil,
  type VslDoFunil,
} from "@/lib/utils/vturb-tabela";
import type { VturbChain } from "@/lib/hooks/use-vturb";

/**
 * Story 29.81 — a Análise MVP com TODOS os vídeos do funil, "igual o VTurb".
 *
 * Os brutos de Retenção são os medidos pelo @sm em 23/09 contra o painel do
 * VTurb (NETÃO 225/4032 = 5,58 %; PPS 13/164 = 7,92 %), os mesmos da 29.78.
 * NETÃO: 3.903 plays únicos — a base encadeada daria 5,76 %.
 */

const NETAO: VslDoFunil = {
  playerId: "pNetao",
  nome: "NETÃO VSL V2.mp4",
  pitchTime: 160,
  pitchConfigurado: true,
  brutos: { viewedUniq: 9000, startedUniq: 3903, overPitch: 225, underPitch: 3807 },
  erro: null,
};
const PPS: VslDoFunil = {
  playerId: "pPps",
  nome: "PPS VSL.mp4",
  pitchTime: 90,
  pitchConfigurado: true,
  brutos: { viewedUniq: 500, startedUniq: 170, overPitch: 13, underPitch: 151 },
  erro: null,
};
const SEM_PITCH_COM_PLAYS: VslDoFunil = {
  playerId: "pSem",
  nome: "Hambúrguer VSL.mp4",
  pitchTime: null,
  pitchConfigurado: false,
  brutos: { viewedUniq: 300, startedUniq: 50, overPitch: 50, underPitch: 0 },
  erro: null,
};
const FALHOU: VslDoFunil = {
  playerId: "pFalha",
  nome: "English Kids VSL.mp4",
  pitchTime: 120,
  pitchConfigurado: true,
  brutos: null,
  erro: "VTurb 503",
};

const range = { startDate: "2026-09-01", endDate: "2026-09-22", timezone: "America/Sao_Paulo" };
const tabela = (...videos: VslDoFunil[]): TabelaDeVslsDoFunil => ({ funnelId: "f1", range, videos });
const overview = { totalLinkClicks: 20000, totalCheckouts: 60, totalSales: 20 };

describe("AC1 — Retenção do cartão: over ÷ (over + under), truncada", () => {
  it("NETÃO: 5,58 % — a base encadeada (plays únicos) daria 5,76 %", () => {
    const { cartao } = cadeiaDaVslSomada(tabela(NETAO));
    expect(cartao.retencao.texto).toBe("5,58%");
    expect(cartao.retencao.numerador).toBe(225);
    expect(cartao.retencao.denominador).toBe(4032);
  });

  it("truncada, não arredondada: PPS 7,92 (arredondar daria 7,93)", () => {
    expect(cadeiaDaVslSomada(tabela(PPS)).cartao.retencao.texto).toBe("7,92%");
  });

  it("Play rate segue como hoje: a fração crua (a tela arredonda com toFixed)", () => {
    const { cartao } = cadeiaDaVslSomada(tabela(NETAO));
    expect(cartao.playRate).toEqual({ valor: 3903 / 9000, numerador: 3903, denominador: 9000 });
  });
});

describe("AC2 — soma dos brutos de todos os vídeos, nunca média de taxas", () => {
  const { cartao, fontes } = cadeiaDaVslSomada(tabela(NETAO, PPS));

  it("Retenção = Σ over ÷ Σ (over + under): 238/4196 = 5,67 % (a média das taxas daria 6,75 %)", () => {
    expect(cartao.retencao).toEqual({ texto: "5,67%", motivo: null, numerador: 238, denominador: 4196 });
  });

  it("Play rate = Σ started ÷ Σ viewed: 4073/9500 (a média das taxas daria ≈ 38,7 %)", () => {
    expect(cartao.playRate.valor).toBe(4073 / 9500);
    expect(cartao.playRate.valor).not.toBeCloseTo((3903 / 9000 + 170 / 500) / 2, 3);
  });

  it("é a MESMA Retenção da linha de Total da tabela das VSLs (29.78) — DoD", () => {
    const videos = [NETAO, PPS, SEM_PITCH_COM_PLAYS, FALHOU];
    expect(cadeiaDaVslSomada(tabela(...videos)).cartao.retencao.texto).toBe(totalDaTabela(videos).retencao.texto);
    expect(cartao.retencao.texto).toBe(totalDaTabela([NETAO, PPS]).retencao.texto);
  });

  it("diz quantos vídeos entraram e lista cada um com o pitch ATUAL (GR-01.e)", () => {
    expect(cartao.totalDeVideos).toBe(2);
    expect(cartao.entraram).toBe(2);
    expect(cartao.proveniencia).toEqual([
      "NETÃO VSL V2.mp4 (pNetao) · pitch em 2:40",
      "PPS VSL.mp4 (pPps) · pitch em 1:30",
    ]);
    expect(fontes!.fonte).toBe("soma de 2 vídeos: NETÃO VSL V2.mp4 (pNetao), PPS VSL.mp4 (pPps)");
  });

  it("a janela do cartão é a DEVOLVIDA pela leitura (guarda de janela, PO-15)", () => {
    expect(cartao.janela).toEqual(range);
  });
});

describe("AC4/AC5 — a cadeia recebe os Σ e mantém a base encadeada (CHAIN-01)", () => {
  const { fontes } = cadeiaDaVslSomada(tabela(NETAO, PPS));
  const r = buildMeasuredRates({ overview, vturb: fontes });

  it("connect_rate = Σ viewed ÷ cliques (um vídeo só daria 9000)", () => {
    expect(r.connect_rate.numerador).toBe(9500);
    expect(r.connect_rate.value).toBe(9500 / 20000);
    expect(r.connect_rate.source).toContain("soma de 2 vídeos");
  });

  it("pitch_rate da cadeia = Σ over ÷ Σ plays únicos (238/4073) — NÃO a Retenção do cartão", () => {
    expect(r.pitch_rate.value).toBe(238 / 4073);
    expect(r.pitch_rate.value).not.toBeCloseTo(238 / 4196, 4);
  });

  it("conv_post_pitch = checkouts ÷ Σ over", () => {
    expect(r.conv_post_pitch.value).toBe(60 / 238);
  });

  it("CHAIN-01 com 2 vídeos: o numerador de cada elo é o denominador do seguinte", () => {
    expect(r.connect_rate.numerador).toBe(r.play_rate.denominador);
    expect(r.play_rate.numerador).toBe(r.pitch_rate.denominador);
    expect(r.pitch_rate.numerador).toBe(r.conv_post_pitch.denominador);
    expect(r.conv_post_pitch.numerador).toBe(r.conv_checkout.denominador);
    // e o produto telescopa: vendas ÷ cliques.
    const produto = [r.connect_rate, r.play_rate, r.pitch_rate, r.conv_post_pitch, r.conv_checkout].reduce(
      (acc, t) => acc * (t.value as number),
      1,
    );
    expect(produto).toBeCloseTo(20 / 20000, 12);
  });

  it("o cartão avisa que a cadeia usa a base encadeada", () => {
    expect(AVISO_DA_CADEIA).toMatch(/acima do pitch ÷ plays únicos/);
  });
});

describe("AC3 — pitch atual; vídeo sem pitch e funil misto", () => {
  it("sem pitch: entra no Play rate, fica FORA da Retenção do cartão, com o nome", () => {
    const { cartao } = cadeiaDaVslSomada(tabela(NETAO, PPS, SEM_PITCH_COM_PLAYS));
    expect(cartao.playRate.numerador).toBe(4123);
    expect(cartao.retencao.texto).toBe("5,67%"); // os 50 "acima" do vídeo sem pitch NÃO entram
    expect(cartao.foraDaRetencao).toEqual(["Hambúrguer VSL.mp4"]);
    expect(cartao.proveniencia[2]).toBe(`Hambúrguer VSL.mp4 (pSem) · ${MOTIVO_SEM_PITCH}`);
  });

  it("funil misto (sem pitch COM plays): pitch_rate e conv_post_pitch ausentes, com o motivo", () => {
    const { cartao, fontes } = cadeiaDaVslSomada(tabela(NETAO, PPS, SEM_PITCH_COM_PLAYS));
    const r = buildMeasuredRates({ overview, vturb: fontes });
    expect(r.pitch_rate.value).toBeNull();
    expect(r.pitch_rate.motivo).toMatch(/funil misto — Hambúrguer VSL\.mp4/);
    expect(r.conv_post_pitch.value).toBeNull();
    expect(r.conv_post_pitch.motivo).toMatch(/funil misto/);
    expect(cartao.convPostPitch).toEqual({ denominador: null, motivo: expect.stringMatching(/funil misto/) });
    // O que não depende do pitch segue medido.
    expect(r.play_rate.value).toBe(4123 / 9800);
    expect(r.connect_rate.value).toBe(9800 / 20000);
  });

  it("vídeo sem pitch e SEM plays não torna o funil misto", () => {
    const parado = { ...SEM_PITCH_COM_PLAYS, brutos: { viewedUniq: 40, startedUniq: 0, overPitch: 0, underPitch: 0 } };
    const r = buildMeasuredRates({ overview, vturb: cadeiaDaVslSomada(tabela(NETAO, parado)).fontes });
    expect(r.pitch_rate.value).toBe(225 / 3903);
    expect(r.conv_post_pitch.value).toBe(60 / 225);
  });

  it("nenhum vídeo com pitch: nada vira 100 % nem 0 %", () => {
    const { cartao, fontes } = cadeiaDaVslSomada(tabela(SEM_PITCH_COM_PLAYS));
    expect(cartao.retencao.texto).toBeNull();
    expect(cartao.retencao.motivo).toBe(MOTIVO_SEM_PITCH);
    const r = buildMeasuredRates({ overview, vturb: fontes });
    expect(r.pitch_rate.value).toBeNull();
    expect(r.pitch_rate.motivo).toBe(MOTIVO_SEM_PITCH);
    expect(r.conv_post_pitch.value).toBeNull();
  });
});

describe("AC7 — erro não vira ausência", () => {
  it("vídeo que falhou sai do Σ COM a indicação; os elos que cruzam com a Meta ficam ausentes", () => {
    const { cartao, fontes } = cadeiaDaVslSomada(tabela(NETAO, PPS, FALHOU));
    expect(cartao.entraram).toBe(2);
    expect(cartao.totalDeVideos).toBe(3);
    expect(cartao.foraPorFalha).toEqual([{ nome: "English Kids VSL.mp4", erro: "VTurb 503" }]);
    const r = buildMeasuredRates({ overview, vturb: fontes });
    expect(r.connect_rate.value).toBeNull();
    expect(r.connect_rate.motivo).toMatch(/falha na leitura de English Kids VSL\.mp4/);
    expect(r.conv_post_pitch.value).toBeNull();
    expect(r.conv_post_pitch.motivo).toMatch(/falha na leitura/);
    // Os elos internos ao VTurb seguem: são razões sobre os MESMOS vídeos.
    expect(r.play_rate.value).toBe(4073 / 9500);
    expect(r.pitch_rate.value).toBe(238 / 4073);
  });

  it("todos falharam: nenhum Σ de zeros com cara de medida — motivo de falha na cadeia", () => {
    const mvp = montarVturbDaMvp({ vsls: tabela(FALHOU), erroVsls: null, chain: undefined });
    expect(mvp.fontes).toBeNull();
    expect(mvp.cartao!.retencao.motivo).toBe(MOTIVO_FALHA);
    expect(mvp.cartao!.playRate.valor).toBeNull();
    const r = buildMeasuredRates({ overview, vturb: mvp.fontes, motivoSemVturb: mvp.motivoSemVturb });
    expect(r.connect_rate.motivo).toMatch(/falha na leitura/);
    expect(r.connect_rate.motivo).not.toMatch(/não vinculada/);
    expect(r.play_rate.value).toBeNull();
  });

  it("falha geral da leitura (≠ 404) é erro, com a mensagem — nunca 'sem VSL'", () => {
    const erro = Object.assign(new Error("VTurb 502"), { status: 502 });
    const mvp = montarVturbDaMvp({ vsls: undefined, erroVsls: erro, chain: undefined });
    expect(mvp.erro).toBe("VTurb 502");
    expect(mvp.origem).toBe("vsls");
    const r = buildMeasuredRates({ overview, vturb: mvp.fontes, motivoSemVturb: mvp.motivoSemVturb });
    expect(r.connect_rate.motivo).toMatch(/VTurb 502/);
    expect(r.pitch_rate.value).toBeNull();
  });
});

describe("AC9 — a leitura nova manda; a /chain é só o fallback do 404", () => {
  const chain: VturbChain = {
    player: { id: "l1", playerId: "pNetao", name: "NETÃO VSL V2.mp4", duration: 1200, pitchTime: 0 },
    cadeia: {
      playRate: { valor: 3903 / 9000, numerador: 3903, denominador: 9000 },
      pitchRate: { valor: null, motivo: "pitch_time não configurado no VTurb", numerador: 225, denominador: 3903 },
      convPostPitchDenominador: 0,
    },
    proveniencia: { source: "VTurb", windowStart: range.startDate, windowEnd: range.endDate, timezone: range.timezone },
    brutos: { viewedUniq: 9000, startedUniq: 3903, overPitch: 225 },
  };

  it("com a /vsls disponível, os brutos da /chain são ignorados mesmo que existam", () => {
    const mvp = montarVturbDaMvp({ vsls: tabela(NETAO, PPS), erroVsls: null, chain });
    expect(mvp.origem).toBe("vsls");
    expect(mvp.fontes!.viewedUniq).toBe(9500);
    expect(mvp.fontes!.pitchRate.valor).toBe(238 / 4073);
  });

  it("404 da /vsls (API antiga): a cadeia e o cartão voltam à /chain, sem erro", () => {
    const erro = Object.assign(new Error("Not Found"), { status: 404 });
    expect(leituraDaChainNecessaria(erro)).toBe(true);
    const mvp = montarVturbDaMvp({ vsls: undefined, erroVsls: erro, chain });
    expect(mvp.origem).toBe("chain");
    expect(mvp.erro).toBeNull();
    expect(mvp.fontes).toMatchObject({ playerId: "pNetao", viewedUniq: 9000, overPitch: 225 });
  });

  it("só o 404 aciona a /chain — outro erro, carregando ou sucesso, não", () => {
    expect(leituraDaChainNecessaria(null)).toBe(false);
    expect(leituraDaChainNecessaria(undefined)).toBe(false);
    expect(leituraDaChainNecessaria({ status: 502 })).toBe(false);
    expect(leituraDaChainNecessaria({ status: 409 })).toBe(false);
  });

  it("funil sem vídeo (200, lista vazia): o 'sem VSL' de sempre, sem fontes nem erro", () => {
    const mvp = montarVturbDaMvp({ vsls: tabela(), erroVsls: null, chain: undefined });
    expect(mvp).toEqual({ origem: "vsls", cartao: null, fontes: null, motivoSemVturb: null, erro: null });
  });

  it("leitura ainda não voltou: pendente", () => {
    expect(montarVturbDaMvp({ vsls: undefined, erroVsls: null, chain: undefined }).origem).toBe("pendente");
  });
});
