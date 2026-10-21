import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { pedeReconexaoGa4 } from "@loyola-x/shared/src/ga4-erros";

// Story 18.90 — a aba Analytics oferece "Reconectar" quando reconectar resolve.
// O vitest do web só coleta `.test.ts`, então o fio do componente (`.tsx`) é
// conferido pelo texto: cada `it` cai se o trecho voltar ao que era.

const aba = readFileSync(new URL("../../../components/funnels/ga4-stage-tab.tsx", import.meta.url), "utf8");

describe("Story 18.90 — Reconectar na aba Analytics (AC2, AC4)", () => {
  it("decide pelo `code` do erro da consulta, não pela mensagem", () => {
    expect(aba).toContain("pedeReconexaoGa4((analytics.error as { code?: unknown } | null)?.code)");
  });

  it("com o painel aberto o botão some, e o painel fecha quando a consulta volta (gate @qa TEST-002)", () => {
    expect(aba).toContain("?.code) && !reconectando && (");
    expect(aba).toContain("useEffect(() => { if (analytics.isSuccess) setReconectando(false); }, [analytics.isSuccess]);");
  });

  it("reconectar abre o mesmo fluxo de conectar (OAuth + escolha da propriedade)", () => {
    expect(aba).toMatch(/\{reconectando && <Ga4ConnectPanel projectId=\{projectId\} \/>\}/);
  });

  it("a mensagem exibida é a da API (que já traz a causa)", () => {
    expect(aba).toContain("<span>{errMsg(analytics.error)}</span>");
  });

  it("API anterior à v54 (sem `code`): não oferece Reconectar", () => {
    const erroAntigo = Object.assign(new Error("Erro ao consultar GA4"), { status: 502 });
    expect(pedeReconexaoGa4((erroAntigo as { code?: unknown }).code)).toBe(false);
    expect(pedeReconexaoGa4("token_revogado")).toBe(true);
  });
});
