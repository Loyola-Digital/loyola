import { describe, it, expect } from "vitest";
import { classificarFalhaGoogleAds, orientacaoDaFalha } from "../google-ads-erro";

/**
 * Story 42.8 — as duas mensagens abaixo são as REAIS, colhidas em produção em
 * 2026-08-25 chamando a API com as credenciais gravadas.
 */
const ERRO_LYRIO =
  'Falha ao obter access token do Google: {\n  "error": "invalid_grant",\n  "error_description": "Token has been expired or revoked."\n}';
const ERRO_NETAO =
  "Google Ads API error (403): User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the login-customer-id header.";

describe("classificarFalhaGoogleAds", () => {
  it("reconhece o token revogado do Lyrio", () => {
    expect(classificarFalhaGoogleAds(ERRO_LYRIO)).toBe("token_revogado");
  });

  it("reconhece a falta de permissão do Netão", () => {
    expect(classificarFalhaGoogleAds(ERRO_NETAO)).toBe("sem_permissao");
  });

  it("sem erro, não há falha", () => {
    expect(classificarFalhaGoogleAds(null)).toBeNull();
    expect(classificarFalhaGoogleAds(undefined)).toBeNull();
    expect(classificarFalhaGoogleAds("")).toBeNull();
  });

  it("erro desconhecido não é forçado numa das duas caixas", () => {
    // Inventar diagnóstico é pior que dizer "veio isto da API": manda o gestor
    // executar a ação errada com confiança.
    expect(classificarFalhaGoogleAds("connect ETIMEDOUT")).toBe("outra");
  });
});

describe("orientacaoDaFalha", () => {
  it("token revogado manda RECONECTAR", () => {
    const o = orientacaoDaFalha(ERRO_LYRIO)!;
    expect(o.acao).toMatch(/reconecte/i);
    expect(o.titulo).not.toMatch(/não retornou campanhas/i);
  });

  it("falta de permissão NÃO manda reconectar como primeira ação", () => {
    // Reconectar com o mesmo usuário sem acesso não resolve — e faz o gestor
    // concluir que o sistema está quebrado.
    const o = orientacaoDaFalha(ERRO_NETAO)!;
    expect(o.acao).toMatch(/permiss/i);
    expect(o.titulo).toMatch(/acesso/i);
  });

  it("as duas orientações são diferentes entre si", () => {
    // O ponto todo da story: a frase única mandava as duas contas para o mesmo
    // lugar, e uma delas para o lugar errado.
    expect(orientacaoDaFalha(ERRO_LYRIO)!.acao).not.toBe(orientacaoDaFalha(ERRO_NETAO)!.acao);
  });

  it("a mensagem crua da API é preservada", () => {
    expect(orientacaoDaFalha(ERRO_LYRIO)!.detalhe).toContain("invalid_grant");
  });

  it("sem erro, não há orientação", () => {
    expect(orientacaoDaFalha(null)).toBeNull();
  });
});
