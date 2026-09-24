/**
 * Story 42.11 (AC7) — a jornada por canal do Lyrio.
 *
 * Três camadas, cada uma provada onde ela vive (PO-08 — a suíte não tem banco):
 *  1. a função pura (prioridade de canal, coorte, contagem por canal);
 *  2. o SQL, lido pelo `PgDialect` — `stage_id`, `GROUP BY app_user_id` +
 *     `bool_or` (um usuário conta uma vez), `revenue_usd > 0`, a coorte no
 *     HAVING e o `app_user_id` FORA do SELECT;
 *  3. o FIO: a rota montada com um banco falso que CAPTURA o SQL executado —
 *     cortar a ligação no call site (outro `stageId`, sem `getStage`, sem a
 *     coorte) derruba estes testes, não só os da função.
 */
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import {
  CANAIS_DA_JORNADA,
  canalDoUsuario,
  consultaDaJornada,
  consultaDoInicioDaAssinatura,
  lerLinhaDaJornada,
  montarJornada,
  type SinaisDoUsuario,
} from "../utils/jornada-lyrio.js";

const dialeto = new PgDialect();
/** O valor do parâmetro que o SQL liga a `alvo` (ex.: `"stage_id" = $9` → params[8]). */
function parametroDe(q: { sql: string; params: unknown[] }, alvo: string): unknown {
  const m = new RegExp(`${alvo.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&")} (?:=|<>|>=) \\$(\\d+)`).exec(q.sql);
  return m ? q.params[Number(m[1]) - 1] : undefined;
}
/** O trecho entre WHERE e GROUP BY — o escopo dos eventos, antes da agregação. */
function clausulaWhere(texto: string): string {
  return texto.slice(texto.search(/ where /i), texto.search(/ group by /i));
}
const DESDE = new Date("2026-06-25T12:00:00.000Z");
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";

const semCanal = { campanha: false, gclid: false, fbclid: false, installReferrer: false, organico: false, ios: false };
const usuario = (p: Partial<SinaisDoUsuario> = {}): SinaisDoUsuario => ({
  primeiroEvento: new Date("2026-09-01T10:00:00.000Z"),
  viuPaywall: true,
  interagiu: false,
  iniciou: false,
  iniciouTeste: false,
  pagou: false,
  receitaUsd: 0,
  ...semCanal,
  ...p,
});

describe("canalDoUsuario — prioridade declarada (AC3)", () => {
  it("gclid E ig4a no mesmo usuário → Google (inverter a ordem derruba)", () => {
    expect(canalDoUsuario({ ...semCanal, gclid: true, installReferrer: true })).toBe("google_gclid");
  });
  it("cada degrau vence os de baixo: campanha > gclid > fbclid > ig4a/fb4a > orgânico > iOS > Android/outro", () => {
    expect(canalDoUsuario({ campanha: true, gclid: true, fbclid: true, installReferrer: true, organico: true, ios: true })).toBe("campanha");
    expect(canalDoUsuario({ ...semCanal, gclid: true, fbclid: true, organico: true, ios: true })).toBe("google_gclid");
    expect(canalDoUsuario({ ...semCanal, fbclid: true, installReferrer: true })).toBe("meta_fbclid");
    expect(canalDoUsuario({ ...semCanal, installReferrer: true, organico: true })).toBe("meta_install");
    expect(canalDoUsuario({ ...semCanal, organico: true, ios: true })).toBe("organico");
    expect(canalDoUsuario({ ...semCanal, ios: true })).toBe("sem_ios");
    expect(canalDoUsuario(semCanal)).toBe("sem_android");
  });
});

describe("montarJornada — coorte e contagem (AC2)", () => {
  it("coorte pela PRIMEIRA aparição: usuário antigo com evento novo na janela NÃO entra", () => {
    const antigo = usuario({ primeiroEvento: new Date("2026-05-01T00:00:00.000Z"), iniciou: true, pagou: true, receitaUsd: 9.99, gclid: true });
    const novo = usuario({ gclid: true });
    const noLimite = usuario({ primeiroEvento: DESDE, gclid: true });
    const r = montarJornada([antigo, novo, noLimite], DESDE);
    expect(r.total).toMatchObject({ novos: 2, iniciou: 0, pagou: 0, receitaUsd: 0 });
    expect(r.linhas.find((l) => l.canal === "google_gclid")?.novos).toBe(2);
    // sem primeiro evento conhecido não há como pôr na coorte
    expect(montarJornada([usuario({ primeiroEvento: null })], DESDE).total.novos).toBe(0);
  });
  it("cada usuário conta UMA vez e cai em UM canal; o Total é a soma das linhas", () => {
    const us = [
      usuario({ gclid: true, installReferrer: true, interagiu: true, iniciou: true, iniciouTeste: true, pagou: true, receitaUsd: 10.5 }),
      usuario({ installReferrer: true, interagiu: true }),
      usuario({ ios: true, iniciou: true, pagou: true, receitaUsd: 19.99 }),
      usuario({ viuPaywall: false }),
    ];
    const r = montarJornada(us, DESDE);
    expect(r.total).toEqual({ novos: 4, viuPaywall: 3, interagiu: 2, iniciou: 2, iniciouTeste: 1, pagou: 2, receitaUsd: 30.49 });
    const soma = r.linhas.reduce((a, l) => a + l.novos, 0);
    expect(soma).toBe(r.total.novos);
    expect(r.linhas.find((l) => l.canal === "google_gclid")).toMatchObject({ novos: 1, pagou: 1, receitaUsd: 10.5 });
    expect(r.linhas.find((l) => l.canal === "meta_install")).toMatchObject({ novos: 1, interagiu: 1 });
    expect(r.linhas.find((l) => l.canal === "sem_ios")).toMatchObject({ novos: 1, receitaUsd: 19.99 });
    expect(r.linhas.find((l) => l.canal === "sem_android")).toMatchObject({ novos: 1, viuPaywall: 0 });
  });
  it("receita só de quem PAGOU (o teste de US$ 0 não soma nem conta); fecha em centavos", () => {
    const r = montarJornada([usuario({ iniciou: true, iniciouTeste: true, pagou: false, receitaUsd: 7 }), usuario({ pagou: true, receitaUsd: 0.1 }), usuario({ pagou: true, receitaUsd: 0.2 })], DESDE);
    expect(r.total).toMatchObject({ pagou: 2, receitaUsd: 0.3, iniciouTeste: 1 });
  });
  it("as 7 linhas saem sempre, na ordem da tabela medida, mesmo zeradas", () => {
    const r = montarJornada([], DESDE);
    expect(r.linhas.map((l) => l.rotulo)).toEqual([
      "Google (gclid)",
      "Meta (ig4a/fb4a)",
      "Meta (fbclid)",
      "Orgânico ou cupom",
      "Sem atribuição — iOS",
      "Sem atribuição — Android/outro",
      "Campanha identificável (Meta + Google)",
    ]);
    expect(r.linhas.every((l) => l.novos === 0 && l.receitaUsd === 0)).toBe(true);
    expect(CANAIS_DA_JORNADA).toHaveLength(7);
  });
  it("lerLinhaDaJornada: timestamp em string, numeric em string, booleanos do pg", () => {
    const u = lerLinhaDaJornada({ primeiro_evento: "2026-09-01T10:00:00Z", viu_paywall: true, interagiu: false, iniciou: true, iniciou_teste: true, pagou: true, receita_usd: "12.3400", c_campanha: false, c_gclid: true, c_fbclid: false, c_install: true, c_organico: false, c_ios: false });
    expect(u).toMatchObject({ primeiroEvento: new Date("2026-09-01T10:00:00Z"), iniciou: true, pagou: true, receitaUsd: 12.34, gclid: true, installReferrer: true });
    expect(lerLinhaDaJornada({ primeiro_evento: null, receita_usd: null }).receitaUsd).toBe(0);
  });
});

describe("o SQL da jornada — lido pelo PgDialect (PO-08)", () => {
  const q = dialeto.sqlToQuery(consultaDaJornada(STAGE, DESDE));
  const select = q.sql.slice(0, q.sql.search(/ from /i));

  it("filtra pelo stage_id da etapa, com usuário, sem evento TEST", () => {
    expect(parametroDe(q, '"revenuecat_sales"."stage_id"')).toBe(STAGE);
    expect(q.sql).toContain('"revenuecat_sales"."app_user_id" is not null');
    expect(parametroDe(q, 'and "revenuecat_sales"."event_type"')).toBe("TEST");
  });
  it("um usuário conta uma vez: GROUP BY app_user_id e bool_or por etapa (dois PAYWALL_IMPRESSION = 1)", () => {
    expect(q.sql).toMatch(/group by "revenuecat_sales"\."app_user_id"/i);
    expect(q.sql).toContain(`coalesce(bool_or("revenuecat_sales"."event_type" LIKE 'PAYWALL%'), false) AS "viu_paywall"`);
  });
  it("pagou e receita só com revenue_usd > 0 em REVENUE_EVENT_TYPES (o teste de US$ 0 fica fora)", () => {
    expect(q.sql).toMatch(/"event_type" IN \(\$\d+, \$\d+, \$\d+, \$\d+\) AND "revenuecat_sales"\."revenue_usd" > 0\), false\) AS "pagou"/);
    expect(q.sql).toMatch(/sum\("revenuecat_sales"\."revenue_usd"\) FILTER \(WHERE "revenuecat_sales"\."event_type" IN \(\$\d+, \$\d+, \$\d+, \$\d+\) AND "revenuecat_sales"\."revenue_usd" > 0\)/);
    expect(q.params).toEqual(expect.arrayContaining(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE", "UNCANCELLATION"]));
  });
  it("teste = INITIAL_PURCHASE com period_type TRIAL vindo do payload (não é coluna)", () => {
    expect(q.sql).toContain(`"revenuecat_sales"."event_type" = 'INITIAL_PURCHASE' AND "revenuecat_sales"."payload"->'event'->>'period_type' = 'TRIAL'`);
  });
  it("coorte no HAVING: min(event_at) de TODA a série >= início da janela", () => {
    expect(q.sql).toMatch(/having min\("revenuecat_sales"\."event_at"\) >= \$\d+::timestamptz$/i);
    expect(parametroDe(q, 'HAVING min("revenuecat_sales"."event_at")')).toBe(DESDE.toISOString());
  });
  it("QA 42.11 TEST-001 — a coorte vem da SÉRIE INTEIRA: nenhum filtro de data no WHERE", () => {
    // AC2: "novo" = primeiro evento do usuário em TODA a série da etapa. Um
    // `event_at >= desde` no WHERE faria o min() ver só a janela: o HAVING vira
    // tautologia, todo ATIVO na janela vira "novo" e as etapas deixam de contar
    // "até hoje". O índice (stage_id, event_at) convida essa "otimização" — não faça.
    expect(q.sql).toMatch(/ where [\s\S]* group by /i);
    expect(clausulaWhere(q.sql)).not.toMatch(/event_at/i);
    // e o event_at só aparece nos dois min(): a coluna primeiro_evento e o HAVING —
    // nenhum FILTER/CASE de janela escondido em outra coluna
    expect(q.sql.match(/event_at/g)).toHaveLength(2);
    expect(q.sql.match(/min\("revenuecat_sales"\."event_at"\)/g)).toHaveLength(2);
  });
  it("QA 42.11 TEST-002 — cada condição de canal amarrada ao SEU alias (trocar duas derruba)", () => {
    const col = (cond: string, alias: string) => `coalesce(bool_or(${cond}), false) AS "${alias}"`;
    expect(q.sql).toContain(
      col(
        `"revenuecat_sales"."utm_campaign" LIKE '1202%' OR "revenuecat_sales"."utm_content" LIKE '1202%' OR "revenuecat_sales"."utm_medium" LIKE '1202%' OR "revenuecat_sales"."utm_source" = 'google-ads' OR "revenuecat_sales"."utm_campaign" ~ '^2[0-9]{10}$'`,
        "c_campanha",
      ),
    );
    expect(q.sql).toContain(col(`"revenuecat_sales"."gclid" IS NOT NULL`, "c_gclid"));
    expect(q.sql).toContain(col(`"revenuecat_sales"."fbclid" IS NOT NULL`, "c_fbclid"));
    expect(q.sql).toContain(
      col(`"revenuecat_sales"."utm_campaign" IN ('ig4a', 'fb4a') OR "revenuecat_sales"."utm_source" IN ('apps.instagram.com', 'apps.facebook.com')`, "c_install"),
    );
    expect(q.sql).toContain(
      col(
        `"revenuecat_sales"."utm_medium" = 'organic' OR "revenuecat_sales"."utm_source" IN ('ig', 'website', 'google', 'chatgpt.com', 'latam_Med', 'google-play') OR "revenuecat_sales"."utm_content" = 'link_in_bio' OR jsonb_exists("revenuecat_sales"."payload"->'event'->'subscriber_attributes', 'coupom_code')`,
        "c_organico",
      ),
    );
    expect(q.sql).toContain(col(`upper("revenuecat_sales"."payload"->'event'->>'platform') = 'IOS' OR "revenuecat_sales"."store" = 'APP_STORE'`, "c_ios"));
  });
  it("QA 42.11 TEST-002 — o fio alias → sinal → canal: cada alias sozinho cai no canal dele", () => {
    const soEste = (alias: string) =>
      canalDoUsuario(
        lerLinhaDaJornada({ c_campanha: false, c_gclid: false, c_fbclid: false, c_install: false, c_organico: false, c_ios: false, [alias]: true }),
      );
    expect(soEste("c_campanha")).toBe("campanha");
    expect(soEste("c_gclid")).toBe("google_gclid");
    expect(soEste("c_fbclid")).toBe("meta_fbclid");
    expect(soEste("c_install")).toBe("meta_install");
    expect(soEste("c_organico")).toBe("organico");
    expect(soEste("c_ios")).toBe("sem_ios");
    expect(soEste("nenhum")).toBe("sem_android");
    // e todo alias que a leitura consome existe no SELECT
    for (const alias of ["c_campanha", "c_gclid", "c_fbclid", "c_install", "c_organico", "c_ios"]) expect(select).toContain(`AS "${alias}"`);
  });
  it("canais com os valores medidos — a lista de orgânicos é FECHADA (valor novo de utm_source cai em iOS/Android)", () => {
    expect(q.sql).toContain(`"revenuecat_sales"."utm_source" IN ('ig', 'website', 'google', 'chatgpt.com', 'latam_Med', 'google-play')`);
    expect(q.sql).toContain(`jsonb_exists("revenuecat_sales"."payload"->'event'->'subscriber_attributes', 'coupom_code')`);
    expect(q.sql).toContain(`upper("revenuecat_sales"."payload"->'event'->>'platform') = 'IOS' OR "revenuecat_sales"."store" = 'APP_STORE'`);
    expect(q.sql).toContain(`"revenuecat_sales"."utm_campaign" IN ('ig4a', 'fb4a') OR "revenuecat_sales"."utm_source" IN ('apps.instagram.com', 'apps.facebook.com')`);
    expect(q.sql).toContain(`"revenuecat_sales"."utm_campaign" LIKE '1202%'`);
    expect(q.sql).not.toContain("acquisition_source");
  });
  it("NENHUM campo de PII no SELECT: o id só agrupa", () => {
    expect(select.length).toBeGreaterThan(100);
    expect(select).not.toMatch(/app_user_id|email|ip_address|idfa/i);
  });
  it("início da assinatura: primeiro evento que não é paywall nem TEST, da etapa", () => {
    const i = dialeto.sqlToQuery(consultaDoInicioDaAssinatura(STAGE));
    expect(i.sql).toMatch(/"revenuecat_sales"\."stage_id" = \$1 AND "revenuecat_sales"\."event_type" NOT LIKE 'PAYWALL%' AND "revenuecat_sales"\."event_type" <> 'TEST'/);
    expect(i.params).toEqual([STAGE]);
  });
});

// ─────────────── o fio: a rota com um banco falso que captura o SQL ───────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const URL_ = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat/jornada`;

function bancoFalso(opts: { membro?: boolean; etapa?: boolean; linhas?: Record<string, unknown>[]; desde?: unknown; falhar?: boolean } = {}) {
  const executados: { sql: string; params: unknown[] }[] = [];
  const consultados: string[] = [];
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), consultados.push(tabela), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
        const linhas = tabela === "project_members" ? (opts.membro ? [{ projectId: PROJ }] : []) : tabela === "projects" ? [{ id: PROJ }] : tabela === "funnel_stages" ? (opts.etapa === false ? [] : [{ id: STAGE }]) : [];
        return Promise.resolve(linhas).then(ok, erro);
      },
    };
    return c;
  };
  const db = {
    select: () => cadeia(),
    execute: async (q: SQL) => {
      const texto = dialeto.sqlToQuery(q);
      executados.push(texto);
      if (opts.falhar) throw new Error("conexão caiu");
      return { rows: /group by/i.test(texto.sql) ? (opts.linhas ?? []) : [{ desde: opts.desde ?? null }] };
    },
  };
  return { db, executados, consultados };
}

async function montar(banco: ReturnType<typeof bancoFalso>) {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = "10000000-0000-4000-8000-000000000001";
    req.userRole = (req.headers["x-papel"] as string) || "strategist";
  });
  app.decorate("db", banco.db as never);
  await app.register(revenuecatRoutes);
  await app.ready();
  return app;
}

describe("GET …/revenuecat/jornada — o fio da rota (AC5)", () => {
  const linha = { primeiro_evento: new Date(), viu_paywall: true, interagiu: true, iniciou: true, iniciou_teste: true, pagou: true, receita_usd: 9.99, c_campanha: false, c_gclid: true, c_fbclid: false, c_install: true, c_organico: false, c_ios: false };

  it("executa a consulta com o stageId DA ROTA, a janela de `days` e a coorte; devolve só contagens", async () => {
    const banco = bancoFalso({ linhas: [linha], desde: new Date("2026-08-10T20:19:27.113Z") });
    const app = await montar(banco);
    const antes = Date.now();
    const r = await app.inject({ method: "GET", url: `${URL_}?days=30` });
    expect(r.statusCode).toBe(200);
    const jornada = banco.executados.find((e) => /group by/i.test(e.sql))!;
    expect(parametroDe(jornada, '"revenuecat_sales"."stage_id"')).toBe(STAGE);
    const inicioDaJanela = new Date(String(parametroDe(jornada, 'HAVING min("revenuecat_sales"."event_at")'))).getTime();
    expect(Math.abs(inicioDaJanela - (antes - 30 * 86_400_000))).toBeLessThan(5_000);
    // QA TEST-001: a janela entra SÓ no HAVING — o SQL executado não filtra event_at no WHERE (coorte pela série inteira, AC2)
    expect(clausulaWhere(jornada.sql)).not.toMatch(/event_at/i);
    expect(jornada.sql.match(/event_at/g)).toHaveLength(2);
    const corpo = r.json();
    expect(corpo).toMatchObject({ days: 30, assinaturaDesde: "2026-08-10" });
    expect(corpo.total).toMatchObject({ novos: 1, iniciou: 1, pagou: 1, receitaUsd: 9.99 });
    expect(corpo.linhas.find((l: { canal: string }) => l.canal === "google_gclid").novos).toBe(1);
    // AC5: nenhum PII na resposta — só as chaves conhecidas
    expect(Object.keys(corpo).sort()).toEqual(["assinaturaDesde", "days", "desde", "linhas", "total"]);
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId|email/i);
    // a guarda: getProjectAccess (projects) E getStage (funnel_stages)
    expect(banco.consultados).toEqual(["projects", "funnel_stages"]);
  });

  it("etapa de outro funil/projeto → 404 SEM consultar eventos; guest sem vínculo → 404", async () => {
    const semEtapa = bancoFalso({ etapa: false });
    const r = await (await montar(semEtapa)).inject({ method: "GET", url: URL_ });
    expect(r.statusCode).toBe(404);
    expect(semEtapa.executados).toHaveLength(0);
    const guest = bancoFalso();
    const g = await (await montar(guest)).inject({ method: "GET", url: URL_, headers: { "x-papel": "guest" } });
    expect(g.statusCode).toBe(404);
    expect(guest.executados).toHaveLength(0);
    const guestComVinculo = bancoFalso({ membro: true });
    expect((await (await montar(guestComVinculo)).inject({ method: "GET", url: URL_, headers: { "x-papel": "guest" } })).statusCode).toBe(200);
  });

  it("days fora de 1–365 → 400; default 90; sem assinatura ainda → assinaturaDesde null", async () => {
    const banco = bancoFalso();
    const app = await montar(banco);
    expect((await app.inject({ method: "GET", url: `${URL_}?days=0` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `${URL_}?days=366` })).statusCode).toBe(400);
    const r = await app.inject({ method: "GET", url: URL_ });
    expect(r.json()).toMatchObject({ days: 90, assinaturaDesde: null, total: { novos: 0 } });
  });

  it("falha do banco NÃO vira tabela vazia: 500 (o bloco mostra erro — AC6)", async () => {
    const r = await (await montar(bancoFalso({ falhar: true }))).inject({ method: "GET", url: URL_ });
    expect(r.statusCode).toBe(500);
  });
});
