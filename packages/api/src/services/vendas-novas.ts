/**
 * Aviso de venda nova: um push por venda que cai na planilha.
 *
 * ## Por que relê a planilha inteira
 *
 * Google Sheets não avisa ninguém quando uma linha entra (o n8n escreve direto
 * na aba). Então não há gatilho: o ciclo relê a aba e compara com o que já foi
 * avisado (`sale_push_sent`). É o mesmo desenho do agendador da Kiwify — rodar
 * de novo é inofensivo de propósito, porque a comparação é por chave de venda,
 * não por posição da linha. Linha apagada no meio da aba, aba reordenada ou
 * coluna nova: nada disso reavisa.
 *
 * ## As mesmas fontes do dashboard
 *
 * `resolveSalesSheetsForStage` é a mesma resolução que o `sales-daily` usa, com
 * as regras dela (planilha da etapa, planilha vinculada pela tela, recuo para
 * capture em Captação Paga, herança da planilha do perpétuo). O aviso não pode
 * ter uma ideia própria de "quais são as vendas da etapa": se tivesse, um dia
 * notificaria venda que o painel não mostra, e descobrir isso seria por acaso.
 *
 * ## O funil sai de graça
 *
 * A planilha está pendurada na ETAPA, e a etapa pertence a um funil — então a
 * venda sempre sabe de que funil é, diferente do alerta de ROAS, onde o gasto
 * de mídia pode não ser reivindicado por etapa nenhuma ("(sem funil)").
 *
 * ## As travas
 *
 * - Só bucket de receita: reembolso e recusado não viram push.
 * - Estreia da etapa não avisa nada (senão o primeiro ciclo mandaria o
 *   histórico inteiro — são 354 vendas em 30 dias só no DG & CPDF).
 * - Teto por projeto por dia, com um resumo no lugar do excedente: o pico
 *   medido foi 81 vendas num dia (3/nov/2026, DG & CPDF).
 * - Só funil ATIVO: o arquivado ainda recebe cauda de venda, e avisar isso é
 *   ruído.
 */

import { and, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  funnelSpreadsheets,
  funnelStages,
  funnels,
  projects,
  pushSubscriptions,
  salePushSent,
  stageSalesSpreadsheets,
  users,
} from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { enviarPush } from "./push.js";
import { resolveSalesSheetsForStage } from "./sales-daily-sync.js";
import { classifyRefundStatus, isRevenueBucket } from "./sales-status.js";
import { parseDateIso, parseNumberBr } from "../utils/planilha-valores.js";

/** Teto de pushes por projeto por dia. Acima disto, um resumo substitui o resto. */
export const TETO_POR_PROJETO_POR_DIA = 30;

/**
 * Pausa entre etapas, para o ciclo não encostar na cota do Sheets.
 *
 * Medido em 23/11/2026, já sem os funis arquivados: 18 etapas que resolvem para
 * **17 pares (planilha, aba) distintos** — 17 leituras por ciclo. A conta de
 * serviço tem 60 leituras/min, e a cota é COMPARTILHADA com o painel, que lê as
 * mesmas planilhas quando alguém abre a tela de vendas.
 *
 * 1,5s por etapa deixa o pico em ~40 leituras/min e o ciclo em ~26s: com o
 * intervalo de 1 min do agendador, mais da metade do tempo fica com a cota
 * livre. Sem pausa, as 17 sairiam em rajada e passariam de 100/min — 429 na
 * cara, nas duas pontas.
 */
const PAUSA_ENTRE_ETAPAS_MS = 1_500;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SheetMapping = {
  email?: string;
  transactionId?: string;
  productName?: string;
  valorBruto?: string;
  valorLiquido?: string;
  dataVenda?: string;
  status?: string;
};

export interface VendaDaPlanilha {
  /** Chave de dedup — a mesma do dashboard quando há transação. */
  chave: string;
  produto: string | null;
  valorBruto: number;
  dataVenda: string | null;
}

/**
 * Chave de uma venda.
 *
 * `txId|produto` é a chave do dashboard (o mesmo pedido com dois produtos são
 * duas vendas). Sem coluna de transação, recua para e-mail+data+valor — menos
 * firme, mas estável entre rodadas, que é o que o dedup exige; sem nada disso a
 * linha não tem identidade e fica fora (devolve `null`).
 */
export function chaveDaVenda(v: {
  txId: string | null;
  email: string | null;
  produto: string | null;
  dataVenda: string | null;
  valorBruto: number;
}): string | null {
  if (v.txId) return `${v.txId}|${v.produto ?? ""}`;
  if (v.email) return `e:${v.email.trim().toLowerCase()}|${v.dataVenda ?? ""}|${v.valorBruto}`;
  return null;
}

/** As vendas de receita das planilhas da etapa, com a chave de dedup já montada. */
export async function lerVendasDaEtapa(
  db: FastifyInstance["db"],
  stageId: string,
): Promise<VendaDaPlanilha[]> {
  const { sheets } = await resolveSalesSheetsForStage(db, stageId);
  const vendas: VendaDaPlanilha[] = [];
  const vistas = new Set<string>();

  for (const sheet of sheets) {
    const mapping = (sheet.columnMapping ?? {}) as SheetMapping;
    let data: { headers: string[]; rows: string[][] };
    try {
      data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
    } catch {
      // Planilha inacessível (permissão removida, aba renomeada) não pode
      // derrubar as outras fontes da etapa.
      continue;
    }
    const col = (n?: string) => (n ? data.headers.indexOf(n) : -1);
    const emailIdx = col(mapping.email);
    const txIdx = col(mapping.transactionId);
    const produtoIdx = col(mapping.productName);
    const brutoIdx = col(mapping.valorBruto);
    const statusIdx = col(mapping.status);
    const dataIdx = col(mapping.dataVenda);
    if (emailIdx === -1 && txIdx === -1) continue; // sem identificador algum

    for (const row of data.rows) {
      const email = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() || null : null;
      const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() || null : null;
      if (!email && !txId) continue; // linha vazia
      // Sem coluna de status a planilha só tem venda paga (mesma suposição do
      // row-level 39.I3) — `classifyRefundStatus` devolveria "other" na célula
      // vazia e nada seria avisado.
      const bucket = statusIdx >= 0 ? classifyRefundStatus(row[statusIdx], true) : "paid";
      if (!isRevenueBucket(bucket)) continue;

      const produto = produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim() || null : null;
      const valorBruto = brutoIdx >= 0 ? parseNumberBr(row[brutoIdx]) : 0;
      const dataVenda = dataIdx >= 0 ? parseDateIso(row[dataIdx]) : null;
      const chave = chaveDaVenda({ txId, email, produto, dataVenda, valorBruto });
      if (!chave) continue;
      // A mesma transação pode estar em duas fontes da etapa (capture + sales):
      // o dedup é por etapa, não por planilha.
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      vendas.push({ chave, produto, valorBruto, dataVenda });
    }
  }
  return vendas;
}

export interface Reparticao {
  /** Vai virar push, uma por venda. */
  avisar: VendaDaPlanilha[];
  /** Passou do teto do dia: entra marcada, e sai no resumo. */
  excedentes: VendaDaPlanilha[];
}

/**
 * O que avisar desta etapa, dado o que já foi visto e quanto já saiu hoje.
 *
 * `estreia` devolve tudo como excedente sem avisar: é a diferença entre estrear
 * em silêncio e mandar o histórico inteiro no primeiro ciclo. Parte pura — é
 * daqui que o teste exercita.
 */
export function repartir(
  vendas: VendaDaPlanilha[],
  jaVistas: Set<string>,
  avisadasHoje: number,
  estreia: boolean,
): Reparticao {
  const novas = vendas.filter((v) => !jaVistas.has(v.chave));
  if (estreia) return { avisar: [], excedentes: novas };
  const resto = Math.max(0, TETO_POR_PROJETO_POR_DIA - avisadasHoje);
  return { avisar: novas.slice(0, resto), excedentes: novas.slice(resto) };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** O texto de uma venda: funil no título; expert (projeto), valor e produto no corpo. */
export function textoDaVenda(
  venda: VendaDaPlanilha,
  nomeDoFunil: string,
  nomeDoProjeto: string,
): { titulo: string; corpo: string } {
  const partes = [nomeDoProjeto, BRL.format(venda.valorBruto)];
  if (venda.produto) partes.push(venda.produto);
  return { titulo: `Venda · ${nomeDoFunil}`, corpo: partes.join(" · ") };
}

/** O resumo que substitui o excedente do teto. */
export function textoDoExcedente(
  quantas: number,
  total: number,
  nomeDoProjeto: string,
): { titulo: string; corpo: string } {
  return {
    titulo: `+${quantas} ${quantas === 1 ? "venda" : "vendas"} · ${nomeDoProjeto}`,
    corpo: `${BRL.format(total)} · teto de ${TETO_POR_PROJETO_POR_DIA} avisos do dia atingido`,
  };
}

/**
 * Quem recebe aviso de venda: **a equipe interna que instalou o app**.
 *
 * Não é `notification_follows` como nos alertas de funil. Venda é notícia que
 * interessa a todo mundo que trabalha nos funis, e exigir que cada um "siga" o
 * projeto fazia o aviso não chegar: medido em 23/11/2026, 20 pessoas internas
 * ativas, só 2 seguiam — e eram as mesmas 2 com aparelho inscrito.
 *
 * **Guest fica fora**, e não por capricho: convidado externo vê a etapa dele e
 * nada mais (é o mesmo motivo do guest-guard na API), e o aviso carrega
 * faturamento e nome de produto. São 14 guests ativos hoje — mais que a metade
 * da base. Bloqueado também fica fora.
 *
 * A lista sai de quem TEM inscrição de push: quem não instalou o PWA não entra
 * no envio, e não é erro — é só não ter aparelho registrado.
 */
export async function destinatariosDeVenda(db: FastifyInstance["db"]): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(and(eq(users.status, "active"), ne(users.role, "guest")));
  return linhas.map((l) => l.userId);
}

export interface ResumoDoCiclo {
  etapasLidas: number;
  avisos: number;
  /** Aparelhos que o serviço de push aceitou — 0 com aviso > 0 é sinal de problema. */
  aparelhos: number;
  estreias: number;
  erros: string[];
}

/** Etapas candidatas: funil ativo com planilha de venda, em qualquer projeto. */
async function etapasComVenda(
  db: FastifyInstance["db"],
): Promise<
  Array<{
    stageId: string;
    funnelId: string;
    funnelName: string;
    projectId: string;
    projectName: string;
  }>
> {
  // A planilha de venda pode estar na etapa (duas tabelas diferentes, por
  // histórico) ou no FUNIL, no caso do perpétuo — e aí quem herda é a etapa de
  // captação. Aqui basta saber que a etapa é candidata; quem resolve de verdade
  // é `resolveSalesSheetsForStage`, e etapa sem fonte só devolve lista vazia.
  return db
    .select({
      stageId: funnelStages.id,
      funnelId: funnels.id,
      funnelName: funnels.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(funnelStages)
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .innerJoin(projects, eq(projects.id, funnels.projectId))
    .where(
      and(
        // Funil arquivado não é vigiado: lançamento encerrado ainda recebe
        // cauda de venda na planilha (downsell, reembolso tardio), e avisar
        // isso é ruído — quem arquivou já tirou o funil da mesa. Corta mais da
        // metade do ciclo: 38 etapas viram 18, 39 leituras viram 17 (medido em
        // 23/11/2026). É o mesmo recorte do GET default de funis, que tem o
        // índice `idx_funnels_active` para isto.
        //
        // Desarquivar um funil não vira enxurrada: as vendas que entraram
        // enquanto ele esteve fora já estão marcadas em `sale_push_sent` da
        // estreia; só as posteriores a ela seriam avisadas, e aí o teto por
        // projeto por dia segura.
        isNull(funnels.archivedAt),
        sql`(
          exists (select 1 from ${stageSalesSpreadsheets} ss where ss.stage_id = ${funnelStages.id})
          or exists (select 1 from ${funnelSpreadsheets} fs where fs.stage_id = ${funnelStages.id} and fs.type = 'sales')
          or exists (select 1 from ${funnelSpreadsheets} fp where fp.funnel_id = ${funnels.id} and fp.type = 'perpetual_sales')
        )`,
      ),
    );
}

/**
 * Um ciclo: lê as planilhas de venda e avisa o que entrou desde a última volta.
 *
 * Nunca lança — planilha fora do ar numa etapa não pode calar as outras.
 */
export async function rodarAvisosDeVenda(fastify: FastifyInstance): Promise<ResumoDoCiclo> {
  const resumo: ResumoDoCiclo = { etapasLidas: 0, avisos: 0, aparelhos: 0, estreias: 0, erros: [] };

  // Uma lista só para o ciclo inteiro: os destinatários não dependem do projeto
  // (ver `destinatariosDeVenda`), e sem ninguém com o app instalado não há o que
  // entregar — mas as vendas novas ainda precisam ser MARCADAS, senão viram
  // "novidade" quando alguém instalar o app.
  const destinatarios = await destinatariosDeVenda(fastify.db);
  const etapas = await etapasComVenda(fastify.db);
  if (etapas.length === 0) return resumo;
  // Quantos avisos já saíram hoje em cada projeto — o teto é por projeto.
  const avisadasHoje = new Map<string, number>();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const contagem = await fastify.db
    .select({ projectId: projects.id, n: sql<number>`count(*)::int` })
    .from(salePushSent)
    .innerJoin(funnelStages, eq(funnelStages.id, salePushSent.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .innerJoin(projects, eq(projects.id, funnels.projectId))
    .where(and(isNotNull(salePushSent.avisadoEm), gte(salePushSent.avisadoEm, inicioDoDia)))
    .groupBy(projects.id);
  for (const c of contagem) avisadasHoje.set(c.projectId, c.n);

  let primeira = true;
  for (const etapa of etapas) {
    if (!primeira) await esperar(PAUSA_ENTRE_ETAPAS_MS);
    primeira = false;
    try {
      const jaVistasRows = await fastify.db
        .select({ chave: salePushSent.chave })
        .from(salePushSent)
        .where(eq(salePushSent.stageId, etapa.stageId));
      const jaVistas = new Set(jaVistasRows.map((r) => r.chave));

      const vendas = await lerVendasDaEtapa(fastify.db, etapa.stageId);
      if (vendas.length === 0) continue;
      resumo.etapasLidas += 1;

      const estreia = jaVistas.size === 0;
      const { avisar, excedentes } = repartir(
        vendas,
        jaVistas,
        avisadasHoje.get(etapa.projectId) ?? 0,
        estreia,
      );
      if (avisar.length === 0 && excedentes.length === 0) continue;
      if (estreia) resumo.estreias += 1;

      const url = `/projects/${etapa.projectId}/funnels/${etapa.funnelId}`;

      for (const venda of avisar) {
        if (destinatarios.length > 0) {
          const r = await enviarPush(fastify, destinatarios, {
            ...textoDaVenda(venda, etapa.funnelName, etapa.projectName),
            url,
            // Tag por venda: duas vendas seguidas são dois avisos na bandeja. A
            // tag repetida SUBSTITUI, e aí a segunda apagaria a primeira.
            tag: `venda-${etapa.stageId}-${venda.chave}`,
          });
          resumo.aparelhos += r.enviados;
        }
        resumo.avisos += 1;
      }
      if (excedentes.length > 0 && !estreia && destinatarios.length > 0) {
        const total = excedentes.reduce((s, v) => s + v.valorBruto, 0);
        await enviarPush(fastify, destinatarios, {
          ...textoDoExcedente(excedentes.length, total, etapa.projectName),
          url,
          // Aqui a substituição é desejada: o resumo de agora troca o anterior.
          tag: `venda-teto-${etapa.projectId}`,
        });
      }

      avisadasHoje.set(etapa.projectId, (avisadasHoje.get(etapa.projectId) ?? 0) + avisar.length);

      // Marca TODAS as chaves novas — avisadas e excedentes. A venda que passou
      // do teto não volta na rodada seguinte como novidade: ela já saiu no
      // resumo, e insistir é exatamente o que vira spam.
      const agora = new Date();
      await fastify.db
        .insert(salePushSent)
        .values([
          ...avisar.map((v) => ({ stageId: etapa.stageId, chave: v.chave, avisadoEm: agora })),
          ...excedentes.map((v) => ({ stageId: etapa.stageId, chave: v.chave, avisadoEm: null })),
        ])
        .onConflictDoNothing();
    } catch (err) {
      resumo.erros.push(`${etapa.funnelName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return resumo;
}
