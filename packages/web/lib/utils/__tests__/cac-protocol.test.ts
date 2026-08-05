import { describe, it, expect } from "vitest";
import {
  targetCacDeck,
  killContinueThreshold,
  compareToTarget,
  assertRate,
  roundMoney,
  ProtocolViolation,
  SCOPE_WARNING_D7,
  type TargetCacInputs,
} from "../cac-protocol";

/**
 * Story 29.35 (AC8) — paridade com `cac_engine.py`.
 *
 * Os valores esperados aqui não são invenção deste teste: foram produzidos
 * executando a suíte de referência do protocolo (`python3 cac_engine.py`,
 * 100% de aderência, exit 0) em 2026-08-04. Se um destes números mudar, ou o
 * port divergiu do engine, ou o protocolo foi revisado — nos dois casos a
 * mudança precisa ser deliberada, não silenciosa.
 */

/** Cenário canônico do protocolo: ticket R$450. */
const PROTOCOL_INPUTS: TargetCacInputs = {
  ticket: 450,
  ticketBasis: "GROSS",
  margemDesejada: 0.15,
  imposto: 0.1,
  gatewayPct: 0.0699,
  gatewayFixo: 1,
  cmv: 60,
  reembolso: 0.08,
  chargeback: 0.01,
};

describe("targetCacDeck — paridade com cac_engine.py (AC8)", () => {
  it("reproduz o CAC alvo de referência: R$ 204,55", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    expect(r.value).toBe(204.55);
    expect(r.status).toBe("DERIVED");
    expect(r.missing).toHaveLength(0);
  });

  it("arredonda SÓ no fim (ROUND-01) — o gateway exato é 32,455, não 32,46", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    const gateway = r.lines.find((l) => l.label === "− Gateway");
    // 450 × 0,0699 + 1 = 32,455. A fonte reporta R$204,54 porque arredonda
    // ISTO para 32,46 antes de subtrair; nós não.
    expect(gateway?.value).toBeCloseTo(-32.455, 3);
    // Prova de que a diferença de R$0,01 vem daí:
    expect(roundMoney(450 - 67.5 - 45 - 32.46 - 60 - 36 - 4.5)).toBe(204.54);
  });

  it("expõe o memorial linha a linha, não só o resultado", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    expect(r.lines.map((l) => l.label)).toEqual([
      "Ticket médio",
      "− Margem desejada",
      "− Imposto",
      "− Gateway",
      "− CMV",
      "− Reembolso",
      "− Chargeback",
    ]);
    expect(r.expression).toContain("= 204.55");
  });

  it("carrega o aviso de escopo D7 — o CAC alvo não cobre equipe/ferramentas/comissão", () => {
    expect(targetCacDeck(PROTOCOL_INPUTS).caveats).toContain(SCOPE_WARNING_D7);
  });

  it("limiar de kill/continue: 1,3 × alvo = R$ 265,91", () => {
    const r = targetCacDeck(PROTOCOL_INPUTS);
    // Do valor EXATO (204,545), nunca do exibido: 204,545 × 1,3 = 265,9085.
    expect(killContinueThreshold(r.valueExact)).toBe(265.91);
    // Prova de que derivar do arredondado divergiria — é o erro que ROUND-01
    // existe para impedir, e que este teste pegou no primeiro port.
    expect(killContinueThreshold(204.55)).toBe(265.92);
  });
});

describe("GR-01 — proibição de inferência", () => {
  it("input ausente devolve null e NOMEIA o que falta, nunca um valor plausível", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, cmv: null, margemDesejada: null });
    expect(r.value).toBeNull();
    expect(r.status).toBe("MISSING");
    expect(r.missing).toEqual(["margem desejada", "CMV"]);
  });

  it("ticket ausente não vira zero nem média", () => {
    const r = targetCacDeck({ ...PROTOCOL_INPUTS, ticket: null });
    expect(r.value).toBeNull();
    expect(r.missing).toContain("ticket médio");
  });
});

describe("RC-01 — guarda de dupla dedução", () => {
  it("aborta com ticket NET_OF_REFUNDS e provisão de reembolso > 0", () => {
    expect(() =>
      targetCacDeck({ ...PROTOCOL_INPUTS, ticketBasis: "NET_OF_REFUNDS" }),
    ).toThrow(ProtocolViolation);
  });

  it("aceita NET_OF_REFUNDS quando as provisões estão zeradas — que é o caso do Loyola X", () => {
    const r = targetCacDeck({
      ...PROTOCOL_INPUTS,
      ticketBasis: "NET_OF_REFUNDS",
      reembolso: 0,
      chargeback: 0,
    });
    // Sem as duas linhas de provisão: 450 − 67,5 − 45 − 32,455 − 60
    expect(r.value).toBe(245.05);
  });
});

describe("U-01 — guarda de unidade", () => {
  it("rejeita taxa em pontos percentuais (o erro clássico: 2 em vez de 0,02)", () => {
    expect(() => assertRate(2, "CTR")).toThrow(ProtocolViolation);
    expect(() => assertRate(15, "margem")).toThrow(/pontos percentuais/);
  });

  it("rejeita taxa ZERO — quase sempre significa etapa não medida, não conversão nula", () => {
    expect(() => assertRate(0, "play rate")).toThrow(ProtocolViolation);
  });

  it("aceita o intervalo válido, inclusive o extremo 1", () => {
    expect(assertRate(0.02, "CTR")).toBe(0.02);
    expect(assertRate(1, "connect rate")).toBe(1);
  });

  it("margem em pontos percentuais aborta o CAC alvo inteiro", () => {
    expect(() => targetCacDeck({ ...PROTOCOL_INPUTS, margemDesejada: 15 })).toThrow(
      ProtocolViolation,
    );
  });
});

describe("compareToTarget — gap e kill/continue (MTAX-04)", () => {
  it("realizado abaixo do alvo → ESCALAR", () => {
    expect(compareToTarget(180, 204.55).verdict).toBe("ESCALAR");
  });

  it("acima do alvo mas dentro dos 30% → ZONA_DE_TOLERANCIA", () => {
    const exact = targetCacDeck(PROTOCOL_INPUTS).valueExact;
    const r = compareToTarget(250, exact);
    expect(r.verdict).toBe("ZONA_DE_TOLERANCIA");
    expect(r.threshold).toBe(265.91);
  });

  it("o CAC de R$347,22 do protocolo contra alvo de R$204,55 → PAUSAR", () => {
    const r = compareToTarget(347.22, 204.55);
    expect(r.verdict).toBe("PAUSAR");
    expect(r.deltaPct).toBeCloseTo(69.7, 1);
  });

  it("sem realizado ou sem alvo → UNKNOWN, nunca um veredito chutado", () => {
    expect(compareToTarget(null, 204.55).verdict).toBe("UNKNOWN");
    expect(compareToTarget(347.22, null).verdict).toBe("UNKNOWN");
  });
});
