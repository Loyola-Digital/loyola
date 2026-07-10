/**
 * Story 38.3 — Alerta diário de pagamentos (Evento Presencial).
 *
 * Varre os acordos de parcelamento das vendas do evento (manual_sales com
 * installment_count/amount/first_installment_date) e projeta as parcelas que
 * vencem HOJE (data local de São Paulo — o servidor roda em UTC). Quando há
 * pagamento no dia e a etapa tem alerta configurado, posta mensagem no canal
 * de chat do ClickUp mencionando os colaboradores configurados.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { manualSales, stageEventPaymentAlerts, funnelStages } from "../db/schema.js";

const SP_TIMEZONE = "America/Sao_Paulo";

/** Data local de São Paulo como YYYY-MM-DD (o container roda em UTC). */
export function todaySaoPaulo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

/** Hora local de São Paulo (0-23). */
export function hourSaoPaulo(): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SP_TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  return Number(fmt.format(new Date()));
}

/**
 * Soma meses preservando o dia, com clamp pro último dia do mês curto
 * (31/01 + 1m → 28/02). Mesma regra do calendário no web
 * (event-payment-calendar.tsx) — manter as duas em sincronia.
 */
function addMonthsClamped(year: number, month0: number, day: number, months: number): string {
  const m = month0 + months;
  const lastDay = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(year, m, Math.min(day, lastDay)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export interface DuePayment {
  customerName: string;
  product: string | null;
  amount: number;
  installmentNumber: number;
  installmentTotal: number;
}

/** Parcelas que vencem em `dateKey` (YYYY-MM-DD) na etapa. */
export async function getDuePayments(
  db: FastifyInstance["db"],
  stageId: string,
  dateKey: string,
): Promise<DuePayment[]> {
  const rows = await db
    .select()
    .from(manualSales)
    .where(and(eq(manualSales.stageId, stageId), isNotNull(manualSales.installmentCount)));

  const due: DuePayment[] = [];
  for (const sale of rows) {
    if (sale.refundedAt) continue; // reembolsada não cobra
    if (sale.installmentCount == null || sale.installmentAmount == null || !sale.firstInstallmentDate) {
      continue;
    }
    const m = sale.firstInstallmentDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    for (let i = 0; i < sale.installmentCount; i++) {
      if (addMonthsClamped(year, month, day, i) !== dateKey) continue;
      due.push({
        customerName: sale.customerName,
        product: sale.product,
        amount: Number(sale.installmentAmount),
        installmentNumber: i + 1,
        installmentTotal: sale.installmentCount,
      });
      break; // um acordo vence no máx. 1 vez por dia
    }
  }
  return due.sort((a, b) => a.customerName.localeCompare(b.customerName, "pt-BR"));
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Monta a mensagem markdown do alerta. */
export function buildAlertMessage(
  stageName: string,
  dateKey: string,
  payments: DuePayment[],
  mentionUsers: { id: string; username: string }[],
): string {
  const [y, mo, d] = dateKey.split("-");
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const lines: string[] = [];
  lines.push(`💰 **Pagamentos previstos pra hoje (${d}/${mo}/${y}) — ${stageName}**`);
  lines.push("");
  for (const p of payments) {
    const prod = p.product ? ` · ${p.product}` : "";
    lines.push(
      `- **${p.customerName}** — parcela ${p.installmentNumber}/${p.installmentTotal} · ${fmtBRL(p.amount)}${prod}`,
    );
  }
  lines.push("");
  lines.push(`**Total do dia: ${fmtBRL(total)}** (${payments.length} parcela${payments.length !== 1 ? "s" : ""})`);
  if (mentionUsers.length > 0) {
    // A API de chat não suporta menção inline no texto — os nomes aqui são
    // visuais; a notificação real vem do assignee + followers no POST.
    lines.push("");
    lines.push(
      `👤 ${mentionUsers.map((u) => `**@${u.username}**`).join(", ")} — confirmar recebimento ✅`,
    );
  }
  return lines.join("\n");
}

export interface AlertRunSummary {
  stagesChecked: number;
  messagesSent: number;
  errors: string[];
}

/**
 * Check diário: pra cada alerta habilitado ainda não processado hoje, computa
 * os vencimentos e envia a mensagem quando houver. Marca last_sent_date mesmo
 * sem pagamento (evita recomputar o dia inteiro a cada ciclo).
 */
export async function runPaymentAlerts(fastify: FastifyInstance): Promise<AlertRunSummary> {
  const summary: AlertRunSummary = { stagesChecked: 0, messagesSent: 0, errors: [] };
  if (!fastify.clickupService.isConfigured()) return summary;

  const today = todaySaoPaulo();
  const alerts = await fastify.db
    .select({
      alert: stageEventPaymentAlerts,
      stageName: funnelStages.name,
    })
    .from(stageEventPaymentAlerts)
    .innerJoin(funnelStages, eq(funnelStages.id, stageEventPaymentAlerts.stageId))
    .where(eq(stageEventPaymentAlerts.enabled, true));

  for (const { alert, stageName } of alerts) {
    if (alert.lastSentDate === today) continue; // já processado hoje
    summary.stagesChecked += 1;
    try {
      const payments = await getDuePayments(fastify.db, alert.stageId, today);
      if (payments.length > 0) {
        const message = buildAlertMessage(stageName, today, payments, alert.mentionUsers);
        await fastify.clickupService.sendChatMessage(alert.channelId, message, {
          // Mensagem ATRIBUÍDA ao 1º colaborador (notificação real + item
          // atribuído no chat); os demais entram como followers.
          assignee: alert.mentionUsers[0]?.id,
          followers: alert.mentionUsers.map((u) => u.id),
        });
        summary.messagesSent += 1;
      }
      await fastify.db
        .update(stageEventPaymentAlerts)
        .set({ lastSentDate: today, updatedAt: new Date() })
        .where(eq(stageEventPaymentAlerts.id, alert.id));
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return summary;
}
