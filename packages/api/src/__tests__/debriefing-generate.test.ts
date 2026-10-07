/**
 * Story 49.6 AC1/AC2 — ordem dos portões do "Gerar debriefing" e "nada
 * persistido em falha". Dependências falsas (sem banco nem planilha) que
 * REGISTRAM cada chamada: o teste prova em que passo a geração parou e que
 * `gravar` não foi chamado. O payload é o REAL dos motores sobre a entrada
 * sintética da 49.5.
 */

import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import debriefingGenerateRoutes from "../routes/debriefing-generate.js";
import {
  gerarDebriefing,
  type DependenciasDaGeracao,
  type EstadoDoSyncDaConta,
  type EtapaResolvida,
  type ParametrosDaGeracao,
  type PayloadSalvo,
  type RegistroDoDebriefing,
} from "../services/debriefing-generate.js";
import {
  DebriefingConfigError,
  type DebriefingConfig,
  type DebriefingConfigLancamento,
  type DebriefingConfigLancamentoEncerrado,
} from "../services/debriefing-config.js";
import { DebriefingDadoIndisponivelError } from "../services/debriefing-money-time-loader.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { configSintetica, entradaMoneyTimeSintetica, payloadSintetico } from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FB = "20000000-0000-4000-8000-000000000002";
const S = "30000000-0000-4000-8000-000000000001";
const SB = "30000000-0000-4000-8000-000000000002";
const U = "40000000-0000-4000-8000-000000000001";

const PARAMS: ParametrosDaGeracao = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null };

interface Falsas extends DependenciasDaGeracao {
  chamadas: string[];
  gravados: RegistroDoDebriefing[];
}

function deps(over: {
  etapa?: Partial<EtapaResolvida> | null;
  config?: (stageId: string) => DebriefingConfig;
  payload?: (c: DebriefingConfigLancamento) => DebriefingPayload;
  etapasDaComparacao?: string[];
  salvoDaComparacao?: PayloadSalvo | null;
  sync?: EstadoDoSyncDaConta[];
  agora?: Date;
} = {}): Falsas {
  const chamadas: string[] = [];
  const gravados: RegistroDoDebriefing[] = [];
  return {
    chamadas,
    gravados,
    async resolverEtapa() {
      chamadas.push("etapa");
      if (over.etapa === null) return null;
      return { stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert", ...over.etapa };
    },
    async carregarConfig(stageId) {
      chamadas.push(`config:${stageId}`);
      return over.config ? over.config(stageId) : { ...configSintetica(), stageId };
    },
    async etapasDeDebriefingDoFunil(funnelId) {
      chamadas.push(`etapasDebriefing:${funnelId}`);
      return over.etapasDaComparacao ?? [];
    },
    async ultimoPayloadSalvoDoFunil(projectId, funnelId) {
      chamadas.push(`salvo:${projectId}:${funnelId}`);
      return over.salvoDaComparacao ?? null;
    },
    async calcularPayload(c) {
      chamadas.push(`payload:${c.stageId}`);
      return over.payload ? over.payload(c) : payloadSintetico();
    },
    async nomes() {
      chamadas.push("nomes");
      return { funis: { [F]: "PG02", [FB]: "PG01" }, etapas: {} };
    },
    async gravar(r) {
      chamadas.push("gravar");
      gravados.push(r);
      return { id: "50000000-0000-4000-8000-000000000001" };
    },
    async estadoDoSyncDaMidia() {
      chamadas.push("sync");
      return over.sync ?? [];
    },
    agora: () => over.agora ?? new Date("2026-10-02T12:00:00.000Z"),
  };
}

const configDe = (stageId: string, extra: Partial<DebriefingConfigLancamentoEncerrado> = {}): DebriefingConfigLancamentoEncerrado => ({
  ...configSintetica(),
  stageId,
  ...extra,
});

/**
 * TEST-496-1 (QA 49.6): todo 422 da geração é EXPLICADO — `detalhe` e `acao`
 * não vazios. Conferir só `erro` deixava passar um 422 com `detalhe: ""`, que a
 * tela mostraria como um código sem motivo.
 */
function esperarCorpoExplicado(r: { status: number; body: Record<string, unknown> }, erro: string): void {
  expect(r.status).toBe(422);
  expect(r.body).toMatchObject({ erro, detalhe: expect.stringMatching(/\S/), acao: expect.stringMatching(/\S/) });
}

describe("AC1 — ordem fixa dos portões e nada persistido em falha", () => {
  it("1. guest → 403 sem tocar em nada", async () => {
    const d = deps();
    const r = await gerarDebriefing(d, { ...PARAMS, userRole: "guest" });
    expect(r).toEqual({ status: 403, body: { error: "Acesso negado" } });
    expect(d.chamadas).toEqual([]);
  });

  it("2a. etapa fora do funil/projeto da URL → 404", async () => {
    const d = deps({ etapa: null });
    expect((await gerarDebriefing(d, PARAMS)).status).toBe(404);
    expect(d.chamadas).toEqual(["etapa"]);
  });

  it("2b. etapa de outro tipo → 422 ETAPA_NAO_E_DEBRIEFING, antes do gate", async () => {
    const d = deps({ etapa: { stageType: "sales", stageName: "Vendas" } });
    const r = await gerarDebriefing(d, PARAMS);
    esperarCorpoExplicado(r, "ETAPA_NAO_E_DEBRIEFING");
    expect(d.chamadas).toEqual(["etapa"]);
  });

  it.each(["TIPO_DE_FUNIL_NAO_SUPORTADO", "COMBINACAO_NAO_VALIDADA", "CONFIG_INCOMPLETA"] as const)(
    "3. gate da 49.1 (%s) → 422 com o corpo do gate, sem carga nem gravação",
    async (codigo) => {
      const d = deps({
        config: () => {
          throw new DebriefingConfigError(codigo, `detalhe ${codigo}`, "ação");
        },
      });
      const r = await gerarDebriefing(d, PARAMS);
      expect(r).toEqual({ status: 422, body: { erro: codigo, detalhe: `detalhe ${codigo}`, acao: "ação" } });
      expect(d.chamadas).toEqual(["etapa", `config:${S}`]);
    },
  );

  it("4. planilha que falha → 422 DADO_INDISPONIVEL (nunca dado vazio), sem gravar", async () => {
    const d = deps({
      payload: () => {
        throw new DebriefingDadoIndisponivelError("planilha X não abriu", "tente de novo");
      },
    });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r).toEqual({ status: 422, body: { erro: "DADO_INDISPONIVEL", detalhe: "planilha X não abriu", acao: "tente de novo" } });
    expect(d.gravados).toHaveLength(0);
  });

  it("5. invariante violada → 422 INVARIANTE_VIOLADO com o corpo da 49.5 (codigo, violacoes), antes do render, sem gravar", async () => {
    const quebrado = payloadSintetico();
    quebrado.dinheiroTempo.ingressosUnicos += 7;
    expect(validateDebriefing(quebrado).bloqueado).toBe(true); // pré-condição
    const d = deps({ payload: () => quebrado });
    const r = await gerarDebriefing(d, PARAMS);
    esperarCorpoExplicado(r, "INVARIANTE_VIOLADO");
    expect(r.body).toHaveProperty("codigo");
    expect((r.body as { violacoes: unknown[] }).violacoes.length).toBeGreaterThan(0);
    expect(d.chamadas).not.toContain("gravar");
  });

  it("5. conferência externa fora do limite → 422 CONFERENCIA_EXTERNA, sem gravar", async () => {
    const d = deps();
    const r = await gerarDebriefing(d, { ...PARAMS, investimentoOficial: 999_999 });
    esperarCorpoExplicado(r, "CONFERENCIA_EXTERNA");
    // O detalhe é o da conferência da 49.5 (o que divergiu e por quanto), não um texto qualquer.
    const conferencia = validateDebriefing(payloadSintetico(), { investimentoOficial: 999_999 }).conferencia;
    expect(conferencia.detalhe).toMatch(/\S/); // pré-condição
    expect((r.body as { detalhe: string }).detalhe).toBe(conferencia.detalhe);
    expect(d.gravados).toHaveLength(0);
  });

  it("6. HTML acima de 5 MB → 413 PAYLOAD_TOO_LARGE (mesmo corpo do Resumão), sem gravar", async () => {
    const enorme = payloadSintetico();
    enorme.dinheiroTempo.auditoriaDeVendas[0]!.produto = "x".repeat(6 * 1024 * 1024);
    expect(validateDebriefing(enorme).bloqueado).toBe(false);
    const d = deps({ payload: () => enorme });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r).toEqual({ status: 413, body: { error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" } });
    expect(d.gravados).toHaveLength(0);
  });

  it("7. sucesso → grava UMA vez (HTML + payload + alertas) e responde { id, html, payload, alertas }", async () => {
    const d = deps();
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    const body = r.body as { id: string; html: string; payload: DebriefingPayload; alertas: unknown[] };
    expect(Object.keys(body).sort()).toEqual(["alertas", "html", "id", "payload", "substituiuParcial"]);
    expect(d.chamadas.filter((c) => c === "gravar")).toHaveLength(1);
    expect(d.chamadas.indexOf("gravar")).toBe(d.chamadas.length - 1);
    const g = d.gravados[0]!;
    expect(g).toMatchObject({ stageId: S, createdBy: U, comparacao: null });
    expect(g.payload.tipo).toBe("lancamento");
    expect(g.payload.versao).toBe(1);
    expect(g.html).toBe(body.html);
    expect(g.campaignName).toMatch(/^Debriefing Expert PG02 — \d{2}\/\d{2} a \d{2}\/\d{2}$/);
    expect(g.alertas).toEqual(body.alertas);
    expect(body.html).toContain("edição única");
  });

  it("AC2 — o payload persistido não tem PII de comprador (sem e-mail, sem telefone)", async () => {
    const d = deps();
    await gerarDebriefing(d, PARAMS);
    const json = JSON.stringify(d.gravados[0]!.payload);
    expect(json).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    // Nenhum telefone cru da entrada sintética (nem com só os dígitos).
    const mt = entradaMoneyTimeSintetica();
    const telefones = [...mt.vendas.map((v) => v.telefoneCru), ...mt.leads.map((l) => l.telefoneCru)]
      .filter((t): t is string => !!t)
      .map((t) => t.replace(/\D/g, "").replace(/0$/, ""))
      .filter((t) => t.length >= 8);
    expect(telefones.length).toBeGreaterThan(0);
    for (const t of telefones) expect(json).not.toContain(t);
  });
});

describe("Comparação (Δ) — config do lançamento de comparação pela mesma porta", () => {
  const comComparacao = (stageId: string) =>
    stageId === S ? configDe(S, { lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] }) : configDe(stageId);

  it("comparação sem etapa Debriefing E sem payload salvo → 422 COMPARACAO_SEM_CONFIG ANTES da carga pesada, sem gravar", async () => {
    const d = deps({ config: comComparacao, etapasDaComparacao: [] });
    const r = await gerarDebriefing(d, PARAMS);
    esperarCorpoExplicado(r, "COMPARACAO_SEM_CONFIG");
    expect((r.body as { detalhe: string }).detalhe).toMatch(/nenhum debriefing dele foi gerado e salvo/);
    expect(d.chamadas).toContain(`salvo:${P}:${FB}`);
    expect(d.chamadas.some((c) => c.startsWith("payload:"))).toBe(false);
    expect(d.gravados).toHaveLength(0);
  });

  const SALVO: PayloadSalvo = {
    debriefingId: "50000000-0000-4000-8000-0000000000aa",
    salvoEm: "2026-06-21T01:00:00.000Z", // 22:00 de 20/06 em Brasília
    payload: payloadSintetico(),
  };

  it("R7-7 — comparação sem config, COM payload salvo → Δ contra o salvo (sem recálculo), aviso visível e origem gravada", async () => {
    const d = deps({ config: comComparacao, etapasDaComparacao: [], salvoDaComparacao: SALVO });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    // só o atual passa pelos motores; a comparação vem do salvo
    expect(d.chamadas.filter((c) => c.startsWith("payload:"))).toEqual([`payload:${S}`]);
    const html = (r.body as { html: string }).html;
    expect(html).toContain("Debriefing Comparativo <b>PG02</b> × <b>PG01</b>");
    const aviso = /<li data-aviso="COMPARACAO_DE_PAYLOAD_SALVO">[\s\S]*?<\/li>/.exec(html)?.[0] ?? "";
    expect(aviso).toContain("gerado em 20/06/26"); // o dia é o de Brasília, não o UTC
    expect(aviso).toContain("ele não tem etapa Debriefing");
    expect(d.gravados[0]!.comparacao).toMatchObject({
      funnelId: FB,
      origem: { tipo: "payload-salvo", debriefingId: SALVO.debriefingId, salvoEm: SALVO.salvoEm },
    });
  });

  it("R7-7 — config da comparação fechada pelo gate + payload salvo → usa o salvo e o aviso cita o motivo", async () => {
    const d = deps({
      etapasDaComparacao: [SB],
      salvoDaComparacao: SALVO,
      config: (stageId) => {
        if (stageId === SB) throw new DebriefingConfigError("COMBINACAO_NAO_VALIDADA", "não conferida", "validar");
        return comComparacao(stageId);
      },
    });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    expect((r.body as { html: string }).html).toMatch(/data-aviso="COMPARACAO_DE_PAYLOAD_SALVO">[^]*COMBINACAO_NAO_VALIDADA/);
  });

  it("R7-7 — payload salvo que viola invariante também bloqueia (Δ contra número errado não sai)", async () => {
    const ruim = payloadSintetico();
    ruim.dinheiroTempo.ingressosUnicos += 7;
    const d = deps({ config: comComparacao, etapasDaComparacao: [], salvoDaComparacao: { ...SALVO, payload: ruim } });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.body).toMatchObject({ erro: "INVARIANTE_VIOLADO" });
    expect(d.gravados).toHaveLength(0);
  });

  it("R7-7 — duas configs liberadas na comparação continua 422 (ambíguo), mesmo com payload salvo", async () => {
    const d = deps({ config: comComparacao, etapasDaComparacao: [SB, "30000000-0000-4000-8000-000000000003"], salvoDaComparacao: SALVO });
    const r = await gerarDebriefing(d, PARAMS);
    esperarCorpoExplicado(r, "COMPARACAO_SEM_CONFIG");
    expect(d.chamadas.some((c) => c.startsWith("salvo:"))).toBe(false);
  });

  it("comparação com config bloqueada pelo gate e sem payload salvo → 422 COMPARACAO_SEM_CONFIG citando o motivo", async () => {
    const d = deps({
      etapasDaComparacao: [SB],
      config: (stageId) => {
        if (stageId === SB) throw new DebriefingConfigError("COMBINACAO_NAO_VALIDADA", "não conferida", "validar");
        return comComparacao(stageId);
      },
    });
    const r = await gerarDebriefing(d, PARAMS);
    esperarCorpoExplicado(r, "COMPARACAO_SEM_CONFIG");
    expect((r.body as { detalhe: string }).detalhe).toContain("COMBINACAO_NAO_VALIDADA");
  });

  it("comparação liberada → dois payloads pelos mesmos motores; título A × B; grava a comparação junto", async () => {
    const d = deps({ config: comComparacao, etapasDaComparacao: [SB] });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    expect(d.chamadas.filter((c) => c.startsWith("payload:"))).toEqual([`payload:${S}`, `payload:${SB}`]);
    expect((r.body as { html: string }).html).toContain("Debriefing Comparativo <b>PG02</b> × <b>PG01</b>");
    expect(d.gravados[0]!.comparacao).toMatchObject({ funnelId: FB, nome: "PG01", origem: { tipo: "recalculada" } });
    expect((r.body as { html: string }).html).not.toContain("COMPARACAO_DE_PAYLOAD_SALVO");
    expect(d.chamadas.some((c) => c.startsWith("salvo:"))).toBe(false); // recalculou: o salvo nem é lido
    expect(d.gravados[0]!.campaignName).toContain("PG02 × PG01");
  });

  it("payload da comparação que viola invariante bloqueia (Δ contra número errado não sai)", async () => {
    const d = deps({
      config: comComparacao,
      etapasDaComparacao: [SB],
      payload: (c) => {
        const p = payloadSintetico();
        if (c.stageId === SB) p.dinheiroTempo.ingressosUnicos += 7;
        return p;
      },
    });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.body).toMatchObject({ erro: "INVARIANTE_VIOLADO" });
    expect((r.body as { detalhe: string }).detalhe).toMatch(/^lançamento de comparação PG01: /);
    expect(d.gravados).toHaveLength(0);
  });
});

describe("Rota — POST …/debriefing/generate", () => {
  async function app(d: DependenciasDaGeracao, role = "user") {
    const a = Fastify();
    a.decorate("db", {} as never);
    await a.register(
      fp(async (f) => {
        f.addHook("onRequest", async (request) => {
          request.userId = U;
          request.userRole = role as never;
        });
      }),
    );
    await a.register(debriefingGenerateRoutes, { dependencias: () => d });
    await a.ready();
    return a;
  }
  const url = `/api/projects/${P}/funnels/${F}/stages/${S}/debriefing/generate`;

  it("guest → 403 antes de validar o corpo", async () => {
    const d = deps();
    const a = await app(d, "guest");
    const r = await a.inject({ method: "POST", url, payload: { gates: "x" } });
    expect(r.statusCode).toBe(403);
    expect(d.chamadas).toEqual([]);
  });

  it("corpo de gates é recusado (a config vem da 49.1): 400 com chave desconhecida", async () => {
    const d = deps();
    const a = await app(d);
    const r = await a.inject({ method: "POST", url, payload: { datasChave: {} } });
    expect(r.statusCode).toBe(400);
    expect(d.chamadas).toEqual([]);
  });

  it("sucesso repassa status e corpo do serviço", async () => {
    const d = deps();
    const a = await app(d);
    const r = await a.inject({ method: "POST", url, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveProperty("id");
  });
});
