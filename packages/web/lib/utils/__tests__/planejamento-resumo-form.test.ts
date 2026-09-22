import { describe, expect, it } from "vitest";
import { rotulosVazios, type RotulosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";
import {
  OPCOES_DE_ROTULO,
  lerRotulo,
  origensPendentes,
  paraFormularioRotulos,
  paraPayloadRotulos,
  rotulosAlterados,
  valorDaOrigem,
} from "@/lib/utils/planejamento-resumo-form";

/** Story 48.5 — rótulos (DV-017 = A) e estados sem base das origens (AC13, AC17). */

function salvo(): RotulosDoSimulador {
  const v = rotulosVazios();
  v.cenarios[0].rotulo = "META PISO";
  v.cenarios[2].rotulo = "META SUPER";
  return v;
}

describe("rótulos ↔ payload", () => {
  it("ida-e-volta preserva; cinco posições; vazio = null", () => {
    const f = paraFormularioRotulos(salvo());
    expect(f).toEqual(["META PISO", null, "META SUPER", null, null]);
    expect(paraPayloadRotulos(f)).toEqual(salvo());
    expect(paraPayloadRotulos(paraFormularioRotulos(rotulosVazios()))).toEqual(rotulosVazios());
  });

  it("lerRotulo: só a lista literal da planilha; '' e texto fora da lista → null", () => {
    expect(OPCOES_DE_ROTULO).toEqual(["META PISO", "META BOA", "META SUPER"]);
    expect(lerRotulo("META BOA")).toBe("META BOA");
    expect(lerRotulo("")).toBeNull();
    expect(lerRotulo("meta boa")).toBeNull();
    expect(lerRotulo("META ÓTIMA")).toBeNull();
  });

  it("rotulosAlterados: igual → false; mudar um → true", () => {
    expect(rotulosAlterados(salvo(), salvo())).toBe(false);
    const a = salvo();
    a.cenarios[1].rotulo = "META BOA";
    expect(rotulosAlterados(a, salvo())).toBe(true);
    const b = salvo();
    b.cenarios[0].rotulo = null;
    expect(rotulosAlterados(b, salvo())).toBe(true);
  });
});

describe("origensPendentes (AC13)", () => {
  it("inputs nunca salvos → só o aviso dos inputs (as outras duas são irrelevantes)", () => {
    const p = origensPendentes({ inputsSalvos: false, organicosSalvos: false, pagosSalvos: false });
    expect(p.map((x) => x.origem)).toEqual(["inputs"]);
    expect(p[0].aba).toBe("inputs");
  });

  it("inputs salvos → um aviso por aba não salva, com a aba de destino certa", () => {
    expect(origensPendentes({ inputsSalvos: true, organicosSalvos: false, pagosSalvos: true }).map((x) => x.aba)).toEqual(["organicos"]);
    expect(origensPendentes({ inputsSalvos: true, organicosSalvos: true, pagosSalvos: false }).map((x) => x.aba)).toEqual(["pagos"]);
    expect(origensPendentes({ inputsSalvos: true, organicosSalvos: false, pagosSalvos: false }).map((x) => x.aba)).toEqual(["organicos", "pagos"]);
    expect(origensPendentes({ inputsSalvos: true, organicosSalvos: true, pagosSalvos: true })).toEqual([]);
  });

  it("valorDaOrigem: origem nunca salva → null (—), mesmo com a conta dando zero; salva → o valor", () => {
    expect(valorDaOrigem(0, false)).toBeNull();
    expect(valorDaOrigem(100, false)).toBeNull();
    expect(valorDaOrigem(0, true)).toBe(0);
    expect(valorDaOrigem(null, true)).toBeNull();
  });
});
