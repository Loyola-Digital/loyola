/**
 * A mescla entre a chamada de ENTREGA e a de AÇÃO (`meta-insights-split.ts`).
 *
 * O que estes testes travam é o erro que custou o histórico de outubro: deixar
 * um zero vindo da resposta de ação encostar no `spend` da resposta de entrega.
 * A medição que motivou o split está no cabeçalho do módulo.
 */

import { describe, it, expect } from "vitest";
import {
  CAMPOS_DE_ACAO,
  ehCampoDeAcao,
  mesclarEntregaComAcoes,
} from "../services/meta-insights-split.js";

/** A chave real do grão de anúncio. */
const porAnuncioEDia = (l: Record<string, unknown>) => `${l.ad_id}|${l.date_start}`;

describe("mesclarEntregaComAcoes", () => {
  it("junta a entrega com as ações do mesmo (anúncio, dia)", () => {
    const entrega: Record<string, unknown>[] = [{ ad_id: "a1", date_start: "2026-10-01", spend: "200.38", impressions: "3126" }];
    const acoes: Record<string, unknown>[] = [
      {
        ad_id: "a1",
        date_start: "2026-10-01",
        spend: "0",
        impressions: "0",
        actions: [{ action_type: "lead", value: "7" }],
      },
    ];

    const [linha] = mesclarEntregaComAcoes(entrega, acoes, porAnuncioEDia);

    expect(linha.spend).toBe("200.38");
    expect(linha.impressions).toBe("3126");
    expect(linha.actions).toEqual([{ action_type: "lead", value: "7" }]);
  });

  it("não deixa o zero da resposta de ação apagar a entrega", () => {
    // Exatamente a resposta que a Meta passou a devolver: ações cheias e
    // entrega zerada. Se qualquer campo de entrega dela vazar, o bug volta.
    const entrega: Record<string, unknown>[] = [
      { ad_id: "a1", date_start: "2026-10-01", spend: "480.45", impressions: "6694", reach: "5000", clicks: "199" },
    ];
    const acoes: Record<string, unknown>[] = [
      {
        ad_id: "a1",
        date_start: "2026-10-01",
        spend: "0",
        impressions: "0",
        reach: "0",
        clicks: "0",
        ctr: "0",
        cpc: "0",
        cpm: "0",
        action_values: [{ action_type: "purchase", value: "63.24" }],
      },
    ];

    const [linha] = mesclarEntregaComAcoes(entrega, acoes, porAnuncioEDia);

    expect(linha).toMatchObject({
      spend: "480.45",
      impressions: "6694",
      reach: "5000",
      clicks: "199",
    });
    expect(linha.ctr).toBeUndefined();
    expect(linha.cpc).toBeUndefined();
    expect(linha.action_values).toEqual([{ action_type: "purchase", value: "63.24" }]);
  });

  it("mantém a linha de entrega que não tem ação nenhuma", () => {
    const entrega: Record<string, unknown>[] = [{ ad_id: "a1", date_start: "2026-10-01", spend: "10.00" }];

    const saida = mesclarEntregaComAcoes(entrega, [], porAnuncioEDia);

    expect(saida).toEqual([{ ad_id: "a1", date_start: "2026-10-01", spend: "10.00" }]);
  });

  it("preserva a ação sem entrega, e sem inventar spend zero", () => {
    // Conversão atribuída a um dia em que o anúncio não gastou. Descartar
    // perderia a conversão; gravar `spend: "0"` faria a trava do upsert achar
    // que há um número novo para escrever.
    const acoes: Record<string, unknown>[] = [
      {
        ad_id: "a2",
        ad_name: "anúncio 2",
        date_start: "2026-10-05",
        spend: "0",
        impressions: "0",
        actions: [{ action_type: "purchase", value: "1" }],
      },
    ];

    const [linha] = mesclarEntregaComAcoes([], acoes, porAnuncioEDia);

    expect(linha.ad_id).toBe("a2");
    expect(linha.ad_name).toBe("anúncio 2");
    expect(linha.actions).toEqual([{ action_type: "purchase", value: "1" }]);
    expect(linha.spend).toBeUndefined();
    expect(linha.impressions).toBeUndefined();
  });

  it("casa cada dia com o seu, e não embaralha a série", () => {
    const entrega: Record<string, unknown>[] = [
      { ad_id: "a1", date_start: "2026-10-01", spend: "200.38" },
      { ad_id: "a1", date_start: "2026-10-02", spend: "280.07" },
    ];
    const acoes: Record<string, unknown>[] = [
      { ad_id: "a1", date_start: "2026-10-02", spend: "0", actions: [{ action_type: "lead", value: "4" }] },
    ];

    const saida = mesclarEntregaComAcoes(entrega, acoes, porAnuncioEDia);
    const dia1 = saida.find((l) => l.date_start === "2026-10-01")!;
    const dia2 = saida.find((l) => l.date_start === "2026-10-02")!;

    expect(dia1.spend).toBe("200.38");
    expect(dia1.actions).toBeUndefined();
    expect(dia2.spend).toBe("280.07");
    expect(dia2.actions).toEqual([{ action_type: "lead", value: "4" }]);
  });
});

describe("CAMPOS_DE_ACAO", () => {
  it("inclui os campos de vídeo, que zeram a entrega do mesmo jeito", () => {
    // Medido: `video_p25_watched_actions` sozinho já leva o spend a zero. Tirar
    // qualquer um daqui o devolve para o `fields` da entrega — e reabre o bug.
    expect(CAMPOS_DE_ACAO).toContain("video_p25_watched_actions");
    expect(CAMPOS_DE_ACAO).toContain("video_play_actions");
    expect(CAMPOS_DE_ACAO).toContain("video_thruplay_watched_actions");
    expect(ehCampoDeAcao("actions")).toBe(true);
    expect(ehCampoDeAcao("action_values")).toBe(true);
    expect(ehCampoDeAcao("spend")).toBe(false);
    expect(ehCampoDeAcao("impressions")).toBe(false);
  });
});
