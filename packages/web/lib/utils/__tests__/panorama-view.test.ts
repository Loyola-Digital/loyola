import { describe, it, expect } from "vitest";
import {
  montarLinhasDoPanorama,
  montarPendencias,
  rotuloDoResultado,
  type PanoramaPayload,
  type EtapaDoPanorama,
} from "@/lib/utils/panorama-view";

/**
 * Story 44.21 — T1 a T5.
 *
 * ⚠️ Os testes rodam contra a função PURA, não contra o componente: o runner do
 * `web` cobre só `lib/utils`, sem jsdom, e os `.test.tsx` de componente seguem
 * órfãos de propósito (Story 29.35). Extrair a montagem de linha para
 * `panorama-view.ts` é o que torna isto testável — tentar renderizar o
 * componente aqui não funcionaria.
 */

const ATUAL = "stage-atual";

const etapa = (over: Partial<EtapaDoPanorama> = {}): EtapaDoPanorama => ({
  funnelId: "f1",
  funnelName: "bbe-pr2-ago-26",
  funnelType: "launch",
  stageId: ATUAL,
  stageName: "Captação Paga",
  stageType: "event_capture",
  familia: "paga",
  noAr: true,
  spendCurta: 3539.19,
  spendLonga: 8596.46,
  principal: { metrica: "cacReal", valor: 564.99, vendasReais: 15 },
  gargalo: { metrica: "convLP", atual: 0.0226, teto: 0.0714, queda: 0.676 },
  campanhas: [
    {
      campaignId: "c1",
      campaignName: "C1",
      spendCurta: 3539.19,
      spendLonga: 8596.46,
      effectiveStatus: "PAUSED",
      ultimoDiaComSpend: "2026-08-26",
    },
  ],
  ...over,
});

const payload = (over: Partial<PanoramaPayload> = {}): PanoramaPayload => ({
  projectId: "p1",
  projectName: "BBE",
  clientName: "Bruno",
  janelas: {
    curta: { from: "2026-08-21", to: "2026-08-27", dias: 7 },
    longa: { from: "2026-07-29", to: "2026-08-27", dias: 30 },
  },
  spendIncludesMetaTax: true,
  unidadeDasTaxas: "decimal",
  etapas: [etapa()],
  campanhasOrfas: [],
  pendencias: [],
  totais: {
    spendCurta: 3539.19,
    spendLonga: 8596.46,
    spendOrfas: 0,
    etapasNoAr: 1,
    campanhasComGasto: 1,
  },
  ...over,
});

// ─────────────────────────────────────────────────────────────
// T1 — o rótulo muda com a família
// ─────────────────────────────────────────────────────────────

describe("T1 — o rótulo do Resultado muda com a família", () => {
  it("etapa paga → CAC · etapa gratuita → CPL", () => {
    const pagas = montarLinhasDoPanorama(payload(), ATUAL);
    expect(pagas[0].rotuloDoResultado).toBe("CAC");

    const gratuitas = montarLinhasDoPanorama(
      payload({ etapas: [etapa({ familia: "gratuita", principal: { metrica: "cplReal", valor: 100.93, leadsUnicos: 185 } })] }),
      ATUAL,
    );
    expect(gratuitas[0].rotuloDoResultado).toBe("CPL");
  });

  it("a REVERSÃO: um rótulo fixo daria a mesma resposta nas duas — e é o bug", () => {
    /**
     * Regra da Story 44.17 AC1: rótulo fixo MENTE. Chamar o CPL de CAC é o erro
     * que o Epic 44 existe para impedir, e ele só aparece quando as duas
     * famílias são comparadas lado a lado.
     *
     * Sem esta asserção, um `rotuloDoResultado` que devolvesse sempre "CAC"
     * passaria no teste acima se ele só testasse a etapa paga.
     */
    const fixo = () => "CAC" as const;
    expect(fixo()).toBe(rotuloDoResultado("paga"));
    expect(fixo()).not.toBe(rotuloDoResultado("gratuita"));
    expect(rotuloDoResultado("gratuita")).toBe("CPL");
  });

  it("família null não tem rótulo — não é 'CAC' nem string vazia", () => {
    expect(rotuloDoResultado(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// T2 — etapa fora da aba
// ─────────────────────────────────────────────────────────────

describe("T2 — etapa fora da aba entra na tabela com `—` e o motivo", () => {
  it("familia null zera Resultado e Gargalo, e carrega a mensagem do payload", () => {
    const p = payload({
      etapas: [etapa({ stageId: "lyrio", stageName: "Lyrio - APP", familia: null, principal: null, gargalo: null, spendCurta: 826.79 })],
      pendencias: [
        {
          stageId: "lyrio",
          codigo: "foraDaAba",
          mensagem: 'A etapa é do tipo "lyrio", que não pertence a nenhuma das duas famílias da aba.',
          origem: "cadeia",
        },
      ],
    });
    const [l] = montarLinhasDoPanorama(p, ATUAL);

    expect(l.rotuloDoResultado).toBeNull();
    expect(l.resultado).toBeNull();
    expect(l.gargalo).toBeNull();
    expect(l.motivoForaDaAba).toContain("não pertence a nenhuma das duas famílias");
    // Mas continua na tabela, com estado e investimento — omiti-la faria o
    // operador ver panorama vazio num expert que está gastando R$ 826.
    expect(l.spendCurta).toBe(826.79);
    expect(l.noAr).toBe(true);
  });

  it("um gargalo que viesse preenchido numa etapa fora da aba é descartado", () => {
    // Defesa: `familia: null` manda `—`, mesmo que o payload trouxesse ranking.
    const p = payload({
      etapas: [etapa({ familia: null, gargalo: { metrica: "cpc", atual: 5, teto: 2, queda: 0.6 } })],
    });
    expect(montarLinhasDoPanorama(p, ATUAL)[0].gargalo).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// T4 — a etapa atual é marcada, não removida
// ─────────────────────────────────────────────────────────────

describe("T4 — a etapa atual aparece marcada", () => {
  it("continua na lista e vem com `ehAtual`", () => {
    const p = payload({ etapas: [etapa(), etapa({ stageId: "outra", stageName: "Perpétuo" })] });
    const linhas = montarLinhasDoPanorama(p, ATUAL);

    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.stageId === ATUAL)?.ehAtual).toBe(true);
    expect(linhas.find((l) => l.stageId === "outra")?.ehAtual).toBe(false);
  });

  it("a REVERSÃO: filtrar a etapa atual quebraria a comparação e a soma", () => {
    /**
     * Se a implementação removesse a atual, esta lista teria 1 linha e a soma
     * das linhas não fecharia com `totais`. É por isso que a AC2 pede marcada, e
     * não removida.
     */
    const p = payload({ etapas: [etapa(), etapa({ stageId: "outra" })] });
    const linhas = montarLinhasDoPanorama(p, ATUAL);
    const semAtual = linhas.filter((l) => !l.ehAtual);
    expect(semAtual).toHaveLength(1);
    expect(linhas.length).not.toBe(semAtual.length);
  });
});

// ─────────────────────────────────────────────────────────────
// T5 — PAUSED com gasto continua "no ar"
// ─────────────────────────────────────────────────────────────

describe("T5 — `noAr` vem do gasto, não do status da campanha", () => {
  it("campanha PAUSED com gasto na janela mantém a etapa no ar", () => {
    const [l] = montarLinhasDoPanorama(payload(), ATUAL);
    expect(l.noAr).toBe(true);

    /**
     * A REVERSÃO: a régua errada — estado vindo de `effectiveStatus` — sobre
     * EXATAMENTE a mesma linha. Se ela desse o mesmo resultado, o teste acima
     * seria decorativo.
     *
     * Em 27/08, 5 das 13 campanhas do BBE com gasto na semana estavam `PAUSED`.
     */
    const p = payload();
    const comRéguaErrada = p.etapas[0].campanhas.some((c) => c.effectiveStatus === "ACTIVE");
    expect(comRéguaErrada).toBe(false);
    expect(comRéguaErrada).not.toBe(l.noAr);
  });

  it("`effectiveStatus: null` não muda o estado — ausência de dado não é pausa", () => {
    const p = payload({
      etapas: [etapa({ campanhas: [{ ...etapa().campanhas[0], effectiveStatus: null }] })],
    });
    expect(montarLinhasDoPanorama(p, ATUAL)[0].noAr).toBe(true);
  });

  it("sem gasto na janela curta, a etapa sai do ar mesmo com campanha ACTIVE", () => {
    const p = payload({
      etapas: [
        etapa({
          noAr: false,
          spendCurta: 0,
          campanhas: [{ ...etapa().campanhas[0], spendCurta: 0, effectiveStatus: "ACTIVE" }],
        }),
      ],
    });
    expect(montarLinhasDoPanorama(p, ATUAL)[0].noAr).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// AC4 — as pendências preservam a mensagem e a procedência
// ─────────────────────────────────────────────────────────────

describe("AC4 — pendências carregam a mensagem original e a origem", () => {
  it("a mensagem não é reescrita, e o derivado não se disfarça de fato do backend", () => {
    const p = payload({
      pendencias: [
        {
          stageId: ATUAL,
          codigo: "semDados",
          mensagem: "A etapa não tem nenhuma fonte de vendas conectada (nem planilha, nem venda manual).",
          origem: "cadeia",
        },
        {
          stageId: ATUAL,
          codigo: "semTetoConfiavel",
          mensagem: "Todos os tetos desta etapa têm confiança BAIXA — a base de cada janela vencedora ficou abaixo do piso da Story 44.5.",
          origem: "panorama",
        },
      ],
    });
    const lista = montarPendencias(p);

    expect(lista[0].mensagem).toBe(p.pendencias[0].mensagem);
    expect(lista[0].origem).toBe("cadeia");
    expect(lista[1].origem).toBe("panorama");
    // E a linha diz de qual etapa é, para fazer sentido fora do contexto dela.
    expect(lista[0].stageName).toBe("Captação Paga");
  });

  it("`syncPendente` e `semDados` não colapsam — as ações são opostas", () => {
    const p = payload({
      pendencias: [
        { stageId: ATUAL, codigo: "semDados", mensagem: "conecte uma fonte", origem: "cadeia" },
        { stageId: "outra", codigo: "syncPendente", mensagem: "espere o sync", origem: "cadeia" },
      ],
    });
    const codigos = montarPendencias(p).map((x) => x.codigo);
    expect(codigos).toEqual(["semDados", "syncPendente"]);
  });

  it("pendência de etapa que não está na lista não derruba a montagem", () => {
    const p = payload({
      pendencias: [{ stageId: "fantasma", codigo: "semDados", mensagem: "x", origem: "cadeia" }],
    });
    expect(montarPendencias(p)[0].stageName).toBe("—");
  });
});
