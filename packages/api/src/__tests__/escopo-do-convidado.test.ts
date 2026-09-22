/**
 * O convidado preso a um funil e uma etapa (vendedor de evento).
 *
 * O que protege: o escopo vazio NÃO pode mudar o comportamento de quem já é
 * convidado hoje, e o escopo cheio tem de barrar funil e etapa alheios —
 * inclusive nas rotas soltas (`/api/funnels/...`), que hoje não checam nada.
 */

import { describe, expect, it } from "vitest";
import {
  algumEscopoPermite,
  escopoPermite,
  funilEEtapaDaUrl,
  type EscopoDoConvidado,
} from "../services/escopo-do-convidado.js";

const F = "11111111-1111-1111-1111-111111111111";
const OUTRO_F = "22222222-2222-2222-2222-222222222222";
const E = "33333333-3333-3333-3333-333333333333";
const OUTRA_E = "44444444-4444-4444-4444-444444444444";
const P = "99999999-9999-9999-9999-999999999999";

const escopo = (funnelId: string | null, stageId: string | null): EscopoDoConvidado => ({
  funnelId,
  stageId,
});

describe("funilEEtapaDaUrl", () => {
  it("lê os dois formatos de rota", () => {
    expect(funilEEtapaDaUrl(`/api/projects/${P}/funnels/${F}/stages/${E}/sales-data?days=30`)).toEqual({
      funnelId: F,
      stageId: E,
    });
    expect(funilEEtapaDaUrl(`/api/funnels/${F}/stages/${E}/lp-campaigns`)).toEqual({
      funnelId: F,
      stageId: E,
    });
  });

  it("rota sem funil devolve vazio", () => {
    expect(funilEEtapaDaUrl(`/api/projects/${P}/members`)).toEqual({ funnelId: null, stageId: null });
  });
});

describe("escopoPermite", () => {
  it("escopo vazio libera tudo — é o convidado de hoje", () => {
    expect(escopoPermite(escopo(null, null), `/api/funnels/${OUTRO_F}/stages/${OUTRA_E}/lp-campaigns`)).toBe(true);
  });

  it("barra funil de outro", () => {
    expect(escopoPermite(escopo(F, E), `/api/projects/${P}/funnels/${OUTRO_F}/stages/${E}`)).toBe(false);
  });

  it("barra etapa de outro no funil permitido", () => {
    expect(escopoPermite(escopo(F, E), `/api/projects/${P}/funnels/${F}/stages/${OUTRA_E}/sales-data`)).toBe(false);
  });

  it("libera a etapa dele, inclusive na rota solta que não checa nada", () => {
    expect(escopoPermite(escopo(F, E), `/api/projects/${P}/funnels/${F}/stages/${E}/sales-data`)).toBe(true);
    expect(escopoPermite(escopo(F, E), `/api/funnels/${F}/stages/${E}/creative-performance`)).toBe(true);
  });

  it("a tela do funil (sem etapa) passa — a lista de etapas já vem filtrada", () => {
    expect(escopoPermite(escopo(F, E), `/api/projects/${P}/funnels/${F}/stages`)).toBe(true);
  });

  it("rota da empresa, sem funil, não é barrada pelo escopo", () => {
    expect(escopoPermite(escopo(F, E), `/api/projects/${P}/members`)).toBe(true);
  });

  it("só funil no escopo: qualquer etapa dele passa", () => {
    expect(escopoPermite(escopo(F, null), `/api/projects/${P}/funnels/${F}/stages/${OUTRA_E}`)).toBe(true);
    expect(escopoPermite(escopo(F, null), `/api/projects/${P}/funnels/${OUTRO_F}`)).toBe(false);
  });
});

describe("algumEscopoPermite", () => {
  it("com dois acessos, basta um permitir", () => {
    const escopos = [escopo(F, E), escopo(OUTRO_F, null)];
    expect(algumEscopoPermite(escopos, `/api/funnels/${OUTRO_F}/stages/${OUTRA_E}/lp-campaigns`)).toBe(true);
    expect(algumEscopoPermite(escopos, `/api/funnels/${F}/stages/${OUTRA_E}/lp-campaigns`)).toBe(false);
  });

  it("sem acesso nenhum, nada passa", () => {
    expect(algumEscopoPermite([], `/api/funnels/${F}/stages/${E}/x`)).toBe(false);
  });
});
