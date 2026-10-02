/**
 * Story 49.5 AC10 — conferência manual do Debriefing contra os oráculos, lado a lado.
 *
 * Gera o payload com os loaders e motores REAIS (49.3 + 49.4) e a composição da
 * 49.5, roda as guardas e compara com as fixtures: a do Loyola/Epic 41
 * (`governante`) e a da skill (`comparação — nunca bloqueia`).
 *
 * SOMENTE LEITURA: a sessão do Postgres abre com `default_transaction_read_only=on`
 * (qualquer escrita falha no banco); zero chamada à Meta (os loaders leem a
 * mídia do banco); as planilhas são lidas pela API do Google. Saída sem PII
 * (só agregados e códigos). NÃO roda em CI — precisa de banco e planilhas reais.
 *
 * Uso:
 *   pnpm --filter @loyola-x/api exec tsx --env-file=.env src/scripts/debriefing-conferir.ts \
 *     --stage <stageId> | --funnel <funnelId> | --config-json <arquivo>
 *     --fixture <id|lançamento>[,<id|lançamento>] [--oficial <investimento>]
 *
 *   `--fixture DG-PG02` pega as duas do lançamento (governante + comparação).
 *   `--config-json`: config de lançamento (`DebriefingConfigLancamento`) montada
 *   à mão, para conferir um funil que ainda não tem config de debriefing salva
 *   (é o caso do PG02) — só lida, nunca gravada. A config salva só é lida pela
 *   porta pública do service (`loadDebriefingConfig`, 49.1 R1).
 */

import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import { loadDebriefingConfig, type DebriefingConfig, type DebriefingConfigLancamento } from "../services/debriefing-config.js";
import { loadDebriefingMoneyTimeInput } from "../services/debriefing-money-time-loader.js";
import { loadDebriefingAudienceInput } from "../services/debriefing-audience-loader.js";
import { CRITERIO_DE_UNICO_HEADLINE, MAXD_PADRAO, computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience } from "../services/debriefing-audience-engine.js";
import { montarPayloadDebriefing } from "../services/debriefing-payload.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import { compararComFixture, type FixtureDeDebriefing, type LinhaDaComparacao } from "../services/debriefing-fixture-compare.js";
import dgPg01 from "../__tests__/fixtures/debriefing/danilo-gato-pg01.js";
import dgPg02 from "../__tests__/fixtures/debriefing/danilo-gato-pg02.js";
import dgPg04 from "../__tests__/fixtures/debriefing/danilo-gato-pg04.js";
import dgPg02Loyola from "../__tests__/fixtures/debriefing/danilo-gato-pg02-loyola.js";
import fzL1 from "../__tests__/fixtures/debriefing/fernanda-zapparolli-l1.js";
import fzL2 from "../__tests__/fixtures/debriefing/fernanda-zapparolli-l2.js";
import netao from "../__tests__/fixtures/debriefing/netao-bbe-pr1.js";

const FIXTURES: FixtureDeDebriefing[] = [dgPg02Loyola, dgPg01, dgPg02, dgPg04, fzL1, fzL2, netao];

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function escolherFixtures(pedido: string): FixtureDeDebriefing[] {
  const ids = pedido.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const escolhidas = FIXTURES.filter((f) => ids.includes(f.id) || ids.includes(f.lancamento.toLowerCase()));
  if (escolhidas.length === 0) {
    throw new Error(`nenhuma fixture para "${pedido}" — disponíveis: ${FIXTURES.map((f) => `${f.id} (${f.lancamento})`).join(", ")}`);
  }
  // governante primeiro
  return escolhidas.sort((a, b) => (a.oraculo.papel === b.oraculo.papel ? 0 : a.oraculo.papel === "governante" ? -1 : 1));
}

/** A config salva sai SÓ pela porta pública (`loadDebriefingConfig`, 49.1 R1); `--funnel` tenta cada etapa do funil. */
async function carregarConfig(db: Database, stage: string | null, funnel: string | null): Promise<DebriefingConfig> {
  if (stage) return loadDebriefingConfig(db, stage);
  if (!funnel) throw new Error("informe --stage <stageId>, --funnel <funnelId> ou --config-json <arquivo>");
  const etapas = await db.select({ id: schema.funnelStages.id }).from(schema.funnelStages).where(eq(schema.funnelStages.funnelId, funnel));
  const achadas: DebriefingConfig[] = [];
  for (const e of etapas) {
    try {
      achadas.push(await loadDebriefingConfig(db, e.id));
    } catch {
      // etapa sem config liberada pelo gate — não é a do debriefing
    }
  }
  if (achadas.length !== 1) {
    throw new Error(`o funil ${funnel} tem ${achadas.length} etapa(s) com config de debriefing liberada — use --stage ou --config-json`);
  }
  return achadas[0]!;
}

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Number.isInteger(v) ? v.toLocaleString("pt-BR") : v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

const ROTULO = { governante: "governante", comparacao: "comparação — nunca bloqueia" } as const;

async function main() {
  const fixtures = escolherFixtures(arg("fixture") ?? "");
  const oficialArg = arg("oficial");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, options: "-c default_transaction_read_only=on" });
  try {
    const db = drizzle(pool, { schema }) as unknown as Database;
    const ro = await pool.query("SHOW default_transaction_read_only");
    if (ro.rows[0]?.default_transaction_read_only !== "on") throw new Error("a sessão não abriu em modo somente leitura — abortado");

    const arquivoDeConfig = arg("config-json");
    const config = arquivoDeConfig
      ? (JSON.parse(readFileSync(arquivoDeConfig, "utf8")) as DebriefingConfigLancamento)
      : await carregarConfig(db, arg("stage"), arg("funnel"));
    const stageId = config.stageId;
    if (config.tipoDeFunil !== "launch") throw new Error(`etapa ${stageId}: funil ${config.tipoDeFunil} — este script confere lançamento`);

    const mtIn = await loadDebriefingMoneyTimeInput(db, { config });
    const mt = computeDebriefingMoneyTime({ ...mtIn, criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE, maxD: MAXD_PADRAO });
    const auIn = await loadDebriefingAudienceInput(db, { config }, { entradaMoneyTime: mtIn });
    const au = computeDebriefingAudience(auIn);
    const payload = montarPayloadDebriefing(mt, au, config, new Date());

    const guardas = validateDebriefing(payload, { investimentoOficial: oficialArg ? Number(oficialArg) : null });
    console.log(`\n== Debriefing ${stageId} — datas ${config.datasChave.inicioCaptacao} → ${config.datasChave.fimCarrinho} (janela ${mt.janela.inicio} → ${mt.janela.fim})`);
    console.log(`imposto ${mt.imposto.impostoPct} (${mt.imposto.impostoOrigem}); critério ${mt.criterioDeUnico}`);
    console.log(`\n-- Guardas (bloqueado: ${guardas.bloqueado})`);
    for (const i of guardas.invariantes) console.log(`${i.codigo.padEnd(4)} ${i.status.padEnd(7)} ${i.detalhe}`);
    for (const a of guardas.alertas) console.log(`${a.codigo.padEnd(4)} alerta  ${a.mensagem}`);
    console.log(`conf ${guardas.conferencia.status.padEnd(7)} ${guardas.conferencia.detalhe}`);
    console.log(`lacunas: ${payload.lacunas.map((l) => l.codigo).join(", ")}`);

    const resultados = fixtures.map((f) => ({ f, r: compararComFixture(payload, f) }));
    const mapeamentos = [...new Set(resultados.flatMap(({ r }) => r.linhas.map((l) => l.mapeamento)))];
    console.log(`\n-- Comparação (${resultados.map(({ f, r }) => `${f.id} = ${ROTULO[f.oraculo.papel]}, K ${r.K.toFixed(7)}`).join(" | ")})`);
    console.log(["campo do payload", "gerador", ...resultados.map(({ f }) => `${f.id} [${ROTULO[f.oraculo.papel]}]`)].join(" | "));
    for (const mp of mapeamentos) {
      let gerador: number | null = null;
      const colunas = resultados.map(({ r }) => {
        const l: LinhaDaComparacao | undefined = r.linhas.find((x) => x.mapeamento === mp);
        if (!l) return "—";
        gerador = l.obtido;
        const classe = l.classificacao ? ` (${l.classificacao.causa}${l.classificacao.causa === "fonte-janela" ? " — diferença de fonte declarada" : ""})` : "";
        return `${fmt(l.esperadoOriginal)}${l.esperadoAjustado !== l.esperadoOriginal ? ` → ${fmt(l.esperadoAjustado)}` : ""} ${l.status}${classe}${l.nota ? ` · ${l.nota}` : ""}`;
      });
      console.log([mp, fmt(gerador), ...colunas].join(" | "));
    }
    for (const { f, r } of resultados) {
      if (r.semCampoEquivalente.length) {
        console.log(`\n${f.id} — SEM_CAMPO_EQUIVALENTE (fora da comparação): ${r.semCampoEquivalente.map((s) => `${s.chave} = ${fmt(s.valor)}`).join("; ")}`);
      }
      console.log(
        `${f.id} [${ROTULO[f.oraculo.papel]}]: ${r.divergenciasNaoClassificadas.length} divergência(s) sem classificação` +
          `${r.divergenciasNaoClassificadas.length ? ` (${r.divergenciasNaoClassificadas.join(", ")})` : ""}` +
          (f.oraculo.papel === "governante" ? ` — conferência ${r.bloqueiaConferencia ? "FALHA até classificar" : "ok"}` : " — relatório"),
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`debriefing-conferir: ${(e as Error).message}`);
  process.exit(1);
});
