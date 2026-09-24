import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  CONCORRENCIA_DA_TABELA,
  condicaoDoFunilNoProjeto,
  condicaoDosVinculosDoFunil,
  lerTabelaDasVsls,
  mapearComConcorrencia,
  pitchDoPainel,
  unirVideosDoFunil,
} from "../services/vturb-tabela.js";
import { VturbError, type VturbSessionStats } from "../services/vturb.js";

/**
 * Story 29.78 — a parte da API da tabela das VSLs: quais vídeos (união sem
 * duplicata, ordem determinística), qual pitch (o ATUAL, de `/players/list`),
 * quantas chamadas ao VTurb e o que falha onde. Sem banco e sem VTurb: as
 * chamadas são injetadas, e o recorte por projeto é provado no PREDICADO.
 */

const stats = (over: Partial<VturbSessionStats>): VturbSessionStats =>
  ({
    total_viewed: 0, total_viewed_device_uniq: 0, total_viewed_session_uniq: 0,
    total_started: 0, total_started_session_uniq: 0, total_started_device_uniq: 0,
    total_finished: 0, total_finished_session_uniq: 0, total_finished_device_uniq: 0,
    engagement_rate: 0, total_clicked: 0, total_clicked_device_uniq: 0,
    total_clicked_session_uniq: 0, total_over_pitch: 0, total_under_pitch: 0,
    over_pitch_rate: 0, total_conversions: 0, overall_conversion_rate: 0,
    total_amount_usd: 0, total_amount_brl: 0, total_amount_eur: 0, play_rate: 0,
    ...over,
  }) as VturbSessionStats;

describe("unirVideosDoFunil — AC5 / PO-15", () => {
  it("um vídeo vinculado a duas etapas aparece UMA vez (chave: player_id)", () => {
    const r = unirVideosDoFunil([
      { playerId: "p1", playerName: "NETÃO VSL V2.mp4" },
      { playerId: "p2", playerName: "Hambúrguer VSL" },
      { playerId: "p1", playerName: "NETÃO VSL V2.mp4" },
    ]);
    expect(r.map((v) => v.playerId)).toEqual(["p2", "p1"]);
  });

  it("ordem determinística por nome (pt-BR, sem caixa nem acento, números naturais) — não a do banco", () => {
    const vinculos = [
      { playerId: "c", playerName: "vsl 10" },
      { playerId: "a", playerName: "Ágil" },
      { playerId: "b", playerName: "vsl 2" },
      { playerId: "d", playerName: "abacate" },
    ];
    const esperado = ["abacate", "Ágil", "vsl 2", "vsl 10"];
    expect(unirVideosDoFunil(vinculos).map((v) => v.nome)).toEqual(esperado);
    expect(unirVideosDoFunil([...vinculos].reverse()).map((v) => v.nome)).toEqual(esperado);
  });

  it("o mesmo vídeo com nomes diferentes em dois vínculos: o escolhido não depende da ordem das linhas", () => {
    const a = { playerId: "p1", playerName: "VSL antiga" };
    const b = { playerId: "p1", playerName: "VSL nova" };
    expect(unirVideosDoFunil([a, b])).toEqual(unirVideosDoFunil([b, a]));
    expect(unirVideosDoFunil([b, a])).toEqual([{ playerId: "p1", nome: "VSL antiga" }]);
  });

  it("nome igual desempata pelo player_id", () => {
    const r = unirVideosDoFunil([
      { playerId: "zz", playerName: "VSL" },
      { playerId: "aa", playerName: "VSL" },
    ]);
    expect(r.map((v) => v.playerId)).toEqual(["aa", "zz"]);
  });
});

describe("lerTabelaDasVsls — AC4 / AC7 / AC8 / PO-08", () => {
  const videos = [
    { playerId: "hamb", nome: "Hambúrguer" },
    { playerId: "pps", nome: "PPS" },
  ];

  it("funil sem vídeo → [] SEM chamar o VTurb (nem a lista de players)", async () => {
    const listarPlayers = vi.fn();
    const lerStats = vi.fn();
    expect(await lerTabelaDasVsls({ videos: [], listarPlayers, lerStats })).toEqual([]);
    expect(listarPlayers).not.toHaveBeenCalled();
    expect(lerStats).not.toHaveBeenCalled();
  });

  it("o pitch enviado ao VTurb é o ATUAL da lista, não a cópia do vínculo; UMA /players/list por leitura", async () => {
    const listarPlayers = vi.fn(async () => [
      { id: "hamb", pitch_time: 212, duration: 900 },
      { id: "pps", pitch_time: 95, duration: 600 },
    ]);
    const lerStats = vi.fn(async () => stats({}));
    await lerTabelaDasVsls({ videos, listarPlayers, lerStats });
    expect(listarPlayers).toHaveBeenCalledTimes(1);
    expect(lerStats).toHaveBeenCalledTimes(2);
    expect(lerStats).toHaveBeenCalledWith({ playerId: "hamb", pitchTime: 212, videoDuration: 900 });
    expect(lerStats).toHaveBeenCalledWith({ playerId: "pps", pitchTime: 95, videoDuration: 600 });
  });

  it("pitch 0, ausente ou vídeo fora da conta → pitchConfigurado false e pitchTime null", async () => {
    const listarPlayers = async () => [
      { id: "hamb", pitch_time: 0, duration: 900 },
      { id: "pps", pitch_time: null, duration: 600 },
    ];
    const lerStats = vi.fn(async () => stats({}));
    const r = await lerTabelaDasVsls({
      videos: [...videos, { playerId: "sumiu", nome: "Sumiu da conta" }],
      listarPlayers,
      lerStats,
    });
    expect(r.map((l) => [l.playerId, l.pitchConfigurado, l.pitchTime])).toEqual([
      ["hamb", false, null],
      ["pps", false, null],
      ["sumiu", false, null],
    ]);
    // sem pitch válido, nada de pitch no corpo — nunca a cópia do vínculo
    for (const chamada of lerStats.mock.calls) expect((chamada as unknown as [{ pitchTime: unknown }])[0].pitchTime).toBeNull();
  });

  it("pitch que chega como texto é lido como número", async () => {
    const r = await lerTabelaDasVsls({
      videos: [videos[1]!],
      listarPlayers: async () => [{ id: "pps", pitch_time: "95" as unknown as number, duration: null }],
      lerStats: async () => stats({}),
    });
    expect(r[0]).toMatchObject({ pitchConfigurado: true, pitchTime: 95 });
  });

  it("devolve os QUATRO brutos da tabela, não as taxas prontas", async () => {
    const r = await lerTabelaDasVsls({
      videos: [videos[1]!],
      listarPlayers: async () => [{ id: "pps", pitch_time: 95, duration: 600 }],
      lerStats: async () =>
        stats({
          total_viewed_device_uniq: 521,
          total_started_device_uniq: 158,
          total_over_pitch: 13,
          total_under_pitch: 151,
          over_pitch_rate: 7.93, // pronta — não entra
          play_rate: 30.33,
        }),
    });
    expect(r[0]!.brutos).toEqual({ viewedUniq: 521, startedUniq: 158, overPitch: 13, underPitch: 151 });
    expect(r[0]!.erro).toBeNull();
  });

  it("falha de UM vídeo fica na linha dele; os outros seguem (AC8)", async () => {
    const r = await lerTabelaDasVsls({
      videos,
      listarPlayers: async () => [
        { id: "hamb", pitch_time: 212, duration: 900 },
        { id: "pps", pitch_time: 95, duration: 600 },
      ],
      lerStats: async ({ playerId }) => {
        if (playerId === "hamb") throw new VturbError("Limite de requisições do VTurb atingido.", 429, true);
        return stats({ total_viewed_device_uniq: 10, total_started_device_uniq: 5 });
      },
    });
    expect(r[0]).toMatchObject({ playerId: "hamb", brutos: null, erro: "Limite de requisições do VTurb atingido." });
    expect(r[1]).toMatchObject({ playerId: "pps", erro: null });
    expect(r[1]!.brutos?.startedUniq).toBe(5);
  });

  it("falha da lista de players é falha GERAL: sobe, e nenhuma stats é pedida", async () => {
    const lerStats = vi.fn();
    await expect(
      lerTabelaDasVsls({
        videos,
        listarPlayers: async () => {
          throw new VturbError("VTurb respondeu 500", 500, true);
        },
        lerStats,
      }),
    ).rejects.toThrow("VTurb respondeu 500");
    expect(lerStats).not.toHaveBeenCalled();
  });
});

describe("mapearComConcorrencia — o freio da cota (AC7)", () => {
  it("nunca passa do limite ao mesmo tempo e devolve na ORDEM dos itens", async () => {
    let emVoo = 0;
    let pico = 0;
    const r = await mapearComConcorrencia([50, 5, 30, 1, 20, 10, 2], 3, async (ms, i) => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((res) => setTimeout(res, ms));
      emVoo--;
      return i;
    });
    expect(pico).toBe(3);
    expect(r).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  // TEST-002b (gate) — o teste acima prova o MECANISMO com `3` explícito; este
  // trava o VALOR que a rota usa, que chama `lerTabelaDasVsls` sem `concorrencia`.
  it("a leitura da tabela, sem `concorrencia`, põe no máximo 3 sessions/stats em voo", async () => {
    const atrasos = [40, 5, 25, 1, 15, 8, 2];
    const videos = atrasos.map((_, i) => ({ playerId: `p${i}`, nome: `VSL ${i}` }));
    let emVoo = 0;
    let pico = 0;
    await lerTabelaDasVsls({
      videos,
      listarPlayers: async () => videos.map((v) => ({ id: v.playerId, pitch_time: 90, duration: 600 })),
      lerStats: async ({ playerId }) => {
        emVoo++;
        pico = Math.max(pico, emVoo);
        await new Promise((res) => setTimeout(res, atrasos[Number(playerId.slice(1))]));
        emVoo--;
        return stats({});
      },
    });
    expect(CONCORRENCIA_DA_TABELA).toBe(3);
    expect(pico).toBe(3);
  });
});

describe("pitchDoPainel — AC12: o painel por vídeo usa o pitch ATUAL, nunca a cópia do vínculo", () => {
  // O vínculo guarda a cópia de quando foi feito (120 s); o VTurb, hoje, diz outra coisa.
  const vinculo = { playerId: "netao", pitchTime: 120 };

  it("pitch atual válido → o atual (95), não a cópia (120)", () => {
    expect(pitchDoPainel(vinculo, [
      { id: "outro", pitch_time: 300 },
      { id: "netao", pitch_time: 95 },
    ])).toEqual({ pitchTime: 95, pitchConfigurado: true });
  });

  it("pitch atual 0 → não configurado, mesmo com a cópia válida", () => {
    expect(pitchDoPainel(vinculo, [{ id: "netao", pitch_time: 0 }])).toEqual({ pitchTime: null, pitchConfigurado: false });
  });

  it("pitch atual ausente ou vídeo fora da conta → não configurado, mesmo com a cópia válida", () => {
    expect(pitchDoPainel(vinculo, [{ id: "netao", pitch_time: null }])).toEqual({ pitchTime: null, pitchConfigurado: false });
    expect(pitchDoPainel(vinculo, [{ id: "outro", pitch_time: 95 }])).toEqual({ pitchTime: null, pitchConfigurado: false });
  });

  it("cópia vazia e pitch atual como texto → o atual, em número", () => {
    expect(pitchDoPainel({ playerId: "netao", pitchTime: null }, [{ id: "netao", pitch_time: "95" as unknown as number }]))
      .toEqual({ pitchTime: 95, pitchConfigurado: true });
  });
});

describe("recorte por projeto — o predicado, não a fila", () => {
  // Um banco mockado devolve o que o teste mandar: se o filtro de projeto
  // sumir, um teste de rota continua verde. O que prova o recorte é a SQL.
  const dialeto = new PgDialect();

  it("o funil só é lido se for do projeto da URL", () => {
    const predicado = condicaoDoFunilNoProjeto("proj-1", "funil-1");
    if (!predicado) throw new Error("predicado vazio — o filtro sumiu");
    const sql = dialeto.sqlToQuery(predicado);
    expect(sql.sql).toContain('"funnels"."project_id"');
    expect(sql.sql).toContain('"funnels"."id"');
    expect(sql.params).toEqual(expect.arrayContaining(["proj-1", "funil-1"]));
  });

  it("os vínculos vêm das etapas do funil E do projeto da URL", () => {
    const predicado = condicaoDosVinculosDoFunil("proj-1", "funil-1");
    if (!predicado) throw new Error("predicado vazio — o filtro sumiu");
    const sql = dialeto.sqlToQuery(predicado);
    expect(sql.sql).toContain('"vturb_players"."project_id"');
    expect(sql.sql).toContain('"funnel_stages"."funnel_id"');
    expect(sql.params).toEqual(expect.arrayContaining(["proj-1", "funil-1"]));
  });
});
