import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MENSAGENS_ERRO_GA4, pedeReconexaoGa4, CODIGOS_ERRO_GA4 } from "@loyola-x/shared";
import {
  Ga4Erro,
  clearGa4TokenCache,
  decryptGa4Secret,
  encryptGa4Secret,
  explicarErroGa4,
  getGa4AccessToken,
  runGa4PagesReport,
  runGa4Report,
} from "../services/ga4";

// Story 18.90 — a aba Analytics diz POR QUE o GA4 falhou. Medido em 20/10/2026
// no `dg-bf26`: o Google respondia 400 `invalid_grant` na renovação do token e
// a tela mostrava "Erro ao consultar GA4".

const TEST_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
const ARGS = { startDate: "2026-10-01", endDate: "2026-10-20", pageFilter: "dg-l01-bf26" };

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

/** Captura o erro lançado (a assertiva é sobre o CÓDIGO, não só a mensagem). */
async function erroDe(p: Promise<unknown>): Promise<Ga4Erro> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(Ga4Erro);
    return err as Ga4Erro;
  }
  throw new Error("esperava falhar");
}

describe("Story 18.90 — renovação do token: a causa vira código (AC1, AC2)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    clearGa4TokenCache();
    process.env.GOOGLE_ADS_CLIENT_ID = "cliente";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "segredo";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...env };
  });

  it("400 invalid_grant (o caso do dg-bf26) → token_revogado, com a mensagem do gestor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })));
    const err = await erroDe(getGa4AccessToken("rt"));
    expect(err.code).toBe("token_revogado");
    expect(explicarErroGa4(err)).toEqual({
      code: "token_revogado",
      error: "A conexão com o Google expirou. Reconecte o GA4 deste projeto.",
    });
  });

  it("invalid_client NÃO é conexão expirada: reconectar não resolveria", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(401, { error: "invalid_client" })));
    expect((await erroDe(getGa4AccessToken("rt"))).code).toBe("oauth_nao_configurado");
  });

  it("sem client OAuth no servidor → oauth_nao_configurado", async () => {
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    expect((await erroDe(getGa4AccessToken("rt"))).code).toBe("oauth_nao_configurado");
  });

  it("falha de rede → rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await erroDe(getGa4AccessToken("rt"))).code).toBe("rede");
  });

  it("Google fora do ar (503) → outro, com o status no detalhe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(503, {})));
    const err = await erroDe(getGa4AccessToken("rt"));
    expect(err.code).toBe("outro");
    expect(explicarErroGa4(err).error).toBe("O GA4 recusou a consulta: Google OAuth 503");
  });
});

describe("Story 18.90 — Data API: permissão, cota e rede (AC3)", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const [nome, rodar] of [
    ["runGa4Report", () => runGa4Report("at", "414288347", ARGS)],
    ["runGa4PagesReport", () => runGa4PagesReport("at", "414288347", ARGS)],
  ] as const) {
    it(`${nome}: 403 → sem_permissao, 429 → cota, 401 → token_revogado, rede → rede`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => resposta(403, { error: { message: "User does not have sufficient permissions" } })));
      const e403 = await erroDe(rodar());
      expect(e403.code).toBe("sem_permissao");
      expect(e403.message).toBe("GA4 Data 403: User does not have sufficient permissions");

      vi.stubGlobal("fetch", vi.fn(async () => resposta(429, { error: { message: "Exhausted property tokens" } })));
      expect((await erroDe(rodar())).code).toBe("cota");

      vi.stubGlobal("fetch", vi.fn(async () => resposta(401, {})));
      expect((await erroDe(rodar())).code).toBe("token_revogado");

      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
      expect((await erroDe(rodar())).code).toBe("rede");
    });
  }
});

describe("Story 18.90 — conexão salva ilegível (AC3)", () => {
  const original = process.env.ENCRYPTION_KEY;
  afterEach(() => { process.env.ENCRYPTION_KEY = original; });

  it("descriptografar com outra chave → chave_criptografia (reconectar regrava)", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const { encrypted, iv } = encryptGa4Secret("1//refresh-token");
    process.env.ENCRYPTION_KEY = TEST_KEY.replace(/^a1/, "ff");
    let err: unknown;
    try { decryptGa4Secret(encrypted, iv); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Ga4Erro);
    expect((err as Ga4Erro).code).toBe("chave_criptografia");
  });
});

describe("Story 18.90 — mensagens (AC2, AC3)", () => {
  it("cada código tem mensagem própria, sem a genérica antiga, e nada vaza segredo", () => {
    for (const code of CODIGOS_ERRO_GA4) {
      const { error } = explicarErroGa4(new Ga4Erro(code, "detalhe técnico"));
      expect(error).not.toBe("Erro ao consultar GA4");
      expect(error.toLowerCase()).not.toMatch(/refresh_token|access_token|encryption_key/);
      if (code !== "outro") expect(error).toBe(MENSAGENS_ERRO_GA4[code]);
    }
  });

  it("erro não classificado vira `outro` com o detalhe", () => {
    expect(explicarErroGa4(new Error("boom"))).toEqual({ code: "outro", error: "O GA4 recusou a consulta: boom" });
  });

  it("reconectar só é oferecido quando reconectar resolve", () => {
    expect(CODIGOS_ERRO_GA4.filter(pedeReconexaoGa4)).toEqual(["token_revogado", "sem_permissao", "chave_criptografia"]);
    expect(pedeReconexaoGa4(undefined)).toBe(false); // API anterior à v54
  });
});

/**
 * O fio da rota — prova pela reversão: cada `it` cai se a rota voltar a mandar
 * a mensagem genérica ou deixar de mandar o código.
 */
describe("Story 18.90 — fio da rota ga4-analytics (AC1, AC4)", () => {
  const rota = readFileSync(new URL("../routes/ga4.ts", import.meta.url), "utf8");
  const contrato = readFileSync(new URL("../../../shared/src/contract.ts", import.meta.url), "utf8");

  it("o 502 do GA4 manda a causa (error + code) via explicarErroGa4", () => {
    expect(rota).toMatch(/reply\.code\(502\)\.send\(\{\s*\.\.\.explicarErroGa4\(err\),/);
    expect(rota).not.toContain('error: "Erro ao consultar GA4"');
  });

  it("contrato 54 com a linha de histórico", () => {
    expect(contrato).toMatch(/export const API_CONTRACT_VERSION = 54;/);
    expect(contrato).toContain("v54 (Story 18.90");
  });
});
