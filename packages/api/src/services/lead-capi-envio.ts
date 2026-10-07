/**
 * Qualificar os leads da etapa e mandar as faixas escolhidas ao Meta.
 *
 * ## Por que é um serviço e não só a rota
 *
 * O mesmo envio acontece por dois caminhos: o botão na tela e o agendador, que
 * roda sozinho quando a etapa está ligada. Fossem dois códigos, um dia um deles
 * mandaria um lote que o outro não mandaria — e a diferença só apareceria no
 * Gerenciador de Anúncios, semanas depois, como uma campanha otimizando para a
 * coisa errada.
 *
 * ## O que decide quem vai
 *
 * A classificação é a MESMA que a tela mostra (`classificarLeads`), e as faixas
 * são as que a etapa configurou. Lead sem e-mail nem telefone não vai: o Meta
 * não teria com o que casar. Lead que já foi não vai de novo.
 *
 * Ver `meta-capi.ts` para o que sai (hash, nunca PII em claro) e por que o
 * `event_id` é determinístico.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  funnelSurveys,
  metaAdsAccounts,
  stageLeadCapi,
  stageLeadCapiEnviados,
  stageLeadScoringSchemas,
  tallyConnections,
} from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import { readSheetData } from "./google-sheets.js";
import { respostasDoFormulario } from "./tally.js";
import {
  acharColunaDeEmail,
  acharColunaDeNome,
  acharColunaDeTelefone,
} from "./colunas-da-pesquisa.js";
import {
  MAX_POR_LOTE,
  enviarEventos,
  montarLote,
  nomeDoEventoDaFaixa,
  type LeadParaOMeta,
} from "./meta-capi.js";
import { classificarLeads, resolvePrecomputedBandColumn, type LeadScoringSchema } from "../routes/lead-scoring.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export interface ResumoDoEnvio {
  /** Os eventos que esta etapa manda ao Meta — um por faixa escolhida. */
  eventos?: string[];
  candidatos: number;
  aEnviar: number;
  jaEnviados: number;
  semIdentificador: number;
  faixas: string[];
  evento: string;
  teste: boolean;
  simulado?: boolean;
  enviados?: number;
  recebidos?: number;
}

/** O motivo de não ter dado — texto para a tela, não código para o log. */
export class EnvioImpossivel extends Error {}

/** As respostas da etapa, do Tally ou da planilha — a mesma fonte da tela. */
async function respostasDaEtapa(
  db: Database,
  scoring: { tallyFormId: string | null; surveyId: string | null },
  projectId: string,
): Promise<{ headers: string[]; rows: string[][] } | null> {
  if (scoring.tallyFormId) {
    const [conexao] = await db
      .select({ enc: tallyConnections.tokenEncrypted, iv: tallyConnections.tokenIv })
      .from(tallyConnections)
      .where(eq(tallyConnections.projectId, projectId))
      .limit(1);
    if (conexao) {
      const r = await respostasDoFormulario(decrypt(conexao.enc, conexao.iv), scoring.tallyFormId);
      return { headers: r.headers, rows: r.rows };
    }
  }
  if (!scoring.surveyId) return null;
  const [survey] = await db
    .select()
    .from(funnelSurveys)
    .where(eq(funnelSurveys.id, scoring.surveyId))
    .limit(1);
  if (!survey) return null;
  return readSheetData(survey.spreadsheetId, survey.sheetName);
}

/**
 * Qualifica e envia os leads da etapa.
 *
 * `simular` devolve a conta sem mandar nada — e ignora o "desligado", porque
 * conferir precisa ser possível ANTES de ligar. Já o envio de verdade exige a
 * etapa ativa: é a única chave entre a classificação e a conta de mídia.
 */
export async function enviarLeadsDaEtapa(
  db: Database,
  stageId: string,
  projectId: string,
  opcoes: { simular?: boolean } = {},
): Promise<ResumoDoEnvio> {
  const simular = opcoes.simular ?? false;

  const [config] = await db
    .select()
    .from(stageLeadCapi)
    .where(eq(stageLeadCapi.stageId, stageId))
    .limit(1);
  if (!config) throw new EnvioImpossivel("Envio ao Meta não configurado nesta etapa.");
  if (config.bands.length === 0) throw new EnvioImpossivel("Nenhuma faixa escolhida — nada a enviar.");
  if (!config.ativo && !simular) throw new EnvioImpossivel("O envio está desligado nesta etapa.");

  const [scoring] = await db
    .select()
    .from(stageLeadScoringSchemas)
    .where(eq(stageLeadScoringSchemas.stageId, stageId))
    .limit(1);
  if (!scoring) throw new EnvioImpossivel("Esta etapa não tem modelo de scoring.");

  const sheet = await respostasDaEtapa(db, scoring, projectId);
  if (!sheet) throw new EnvioImpossivel("Nenhuma fonte de respostas configurada.");

  const schema = scoring.schemaJson as LeadScoringSchema;
  const [survey] = scoring.surveyId
    ? await db
        .select({ mapping: funnelSurveys.columnMapping })
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoring.surveyId))
        .limit(1)
    : [undefined];

  const classificados = classificarLeads(
    schema,
    sheet,
    resolvePrecomputedBandColumn(schema, survey?.mapping),
  );

  const mapeamento = (survey?.mapping ?? {}) as { email?: string; telefone?: string; name?: string };
  const iEmail = acharColunaDeEmail(sheet.headers, mapeamento.email);
  const iTel = acharColunaDeTelefone(sheet.headers, mapeamento.telefone);
  const iNome = acharColunaDeNome(sheet.headers, mapeamento.name);
  const iData = sheet.headers.findIndex((h) => /submitted at|carimbo|timestamp|data/i.test(h));
  const celula = (linha: string[], idx: number) => (idx >= 0 ? (linha[idx] ?? "").trim() : "");

  const leads: LeadParaOMeta[] = [];
  for (const c of classificados) {
    if (!c.faixa) continue;
    const linha = sheet.rows[c.linha] ?? [];
    const email = celula(linha, iEmail);
    const telefone = celula(linha, iTel);
    const chave = email.toLowerCase() || telefone.replace(/\D/g, "") || celula(linha, iNome);
    if (!chave) continue;
    leads.push({
      chave,
      email,
      telefone,
      faixa: c.faixa,
      score: c.score,
      quando: celula(linha, iData) || null,
    });
  }

  // O controle é por lead E evento: o mesmo lead pode ir sob um evento novo
  // quando a configuração muda de nome, sem reenviar o que já foi sob o antigo.
  const jaForam = await db
    .select({ h: stageLeadCapiEnviados.leadHash, evento: stageLeadCapiEnviados.eventName })
    .from(stageLeadCapiEnviados)
    .where(eq(stageLeadCapiEnviados.stageId, stageId));
  const idsEnviados = new Set(jaForam.map((x) => `${x.h}|${x.evento}`));

  const { eventos, enviados: paraRegistrar, semIdentificador, jaEstavam } = montarLote(leads, {
    stageId,
    eventName: config.eventName,
    eventosPorFaixa: config.eventosPorFaixa ?? {},
    faixas: config.bands,
    jaEnviados: new Set(
      leads.flatMap((l) => {
        const nome = nomeDoEventoDaFaixa(config.eventName, l.faixa, config.eventosPorFaixa ?? {});
        return idsEnviados.has(`${hash(l.chave)}|${nome}`) ? [`${l.chave}|${nome}`] : [];
      }),
    ),
  });

  const faixasQueridas = new Set(config.bands.map((b) => b.toUpperCase()));
  const resumo: ResumoDoEnvio = {
    candidatos: leads.filter((l) => faixasQueridas.has(l.faixa.toUpperCase())).length,
    aEnviar: eventos.length,
    jaEnviados: jaEstavam,
    semIdentificador,
    faixas: config.bands,
    evento: config.eventName,
    // Um por faixa — é o que a pessoa escolhe no Gerenciador do Meta.
    eventos: [...new Set(paraRegistrar.map((e) => e.evento))].sort(),
    teste: Boolean(config.testEventCode),
  };

  if (simular) return { ...resumo, simulado: true };
  if (eventos.length === 0) return { ...resumo, enviados: 0, recebidos: 0 };

  const [conta] = config.metaAccountId
    ? await db
        .select({ enc: metaAdsAccounts.accessTokenEncrypted, iv: metaAdsAccounts.accessTokenIv })
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, config.metaAccountId))
        .limit(1)
    : [undefined];
  if (!conta) throw new EnvioImpossivel("Escolha a conta de anúncio de onde sai o token.");

  const token = decrypt(conta.enc, conta.iv);
  let enviados = 0;
  let recebidos = 0;
  // Em lotes: o Meta recusa acima de mil por chamada, e um lançamento grande
  // passa disso com folga.
  for (let i = 0; i < eventos.length; i += MAX_POR_LOTE) {
    const r = await enviarEventos(
      config.datasetId,
      token,
      eventos.slice(i, i + MAX_POR_LOTE),
      config.testEventCode,
    );
    enviados += r.enviados;
    recebidos += r.recebidos;
  }

  // Só registra depois que o Meta aceitou — marcar antes faria um lote recusado
  // sumir para sempre, sem ninguém notar que aqueles leads nunca chegaram.
  if (paraRegistrar.length > 0) {
    await db
      .insert(stageLeadCapiEnviados)
      .values(
        paraRegistrar.map((e) => ({
          stageId,
          leadHash: hash(e.chave),
          faixa: e.faixa,
          eventName: e.evento,
        })),
      )
      .onConflictDoNothing();
  }

  const resultado = { ...resumo, enviados, recebidos };
  await db
    .update(stageLeadCapi)
    .set({ ultimoEnvioEm: new Date(), ultimoResultado: resultado, updatedAt: new Date() })
    .where(eq(stageLeadCapi.stageId, stageId));

  return resultado;
}
