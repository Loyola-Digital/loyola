/**
 * Leitura das vendas e das fontes de origem do lead de um funil — extraída de
 * `routes/stage-sales-journey.ts` sem mudança de comportamento (Story 48.15,
 * AC7; T1 do @architect, A1/A2).
 *
 * `lerVendas` e `fontesDeOrigem` eram closures do plugin só por causa de
 * `fastify.db`. A fábrica recebe o `db` e devolve as duas, idênticas; o plugin
 * faz `criarLeitoresDeVendasEOrigem(fastify.db)` e as chamadas não mudam.
 * Os auxiliares de nível de módulo que elas usam vieram junto e são importados
 * de volta pela rota (as outras rotas do arquivo também os usam).
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnelSpreadsheets, funnelSurveys, stageSalesSpreadsheets } from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";

/**
 * Story 18.83 — apelidos da coluna de `utm_content` quando o mapeamento não a
 * declara. Os mesmos do web (`useCrossReferenceLeads`): "content",
 * "utm_content" e "co=" (decisão do Danilo, 18.47).
 */
export const APELIDOS_DE_CONTEUDO = /^utm_?content$|^content$|^co=$/i;

/** dd/mm/aaaa, aaaa-mm-dd e ISO → aaaa-mm-dd local. */
export function parseDay(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normalizeEmail(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Valor "R$ 1.234,56" / "1234.56" → number. */
export function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const limpo = String(val).replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  // Formato BR quando a vírgula vem depois do último ponto.
  const temVirgulaDecimal = limpo.lastIndexOf(",") > limpo.lastIndexOf(".");
  const n = Number(temVirgulaDecimal ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface VendaLida {
  email: string;
  produto: string;
  day: string | null;
  bruto: number;
  origem: string;
  /** true se a planilha de origem TEM coluna de data mapeada (pro filtro de janela). */
  dated: boolean;
  /** origem da venda (utm_source, fallback canalOrigem). "(sem origem)" se vazio. */
  source: string;
  /** utm_term cru do checkout — carrega a LP, quando o link preservou. */
  term: string;
  /** utm_campaign cru — reserva pra achar a LP quando o term não tem. */
  campaign: string;
  /**
   * Story 18.83 (AC9): `utm_content` cru do checkout (o `co=`). Acréscimo — o
   * mini-funil da LP chaveia pela URL do anúncio; `buyers-origin` e a jornada
   * não leem o campo.
   */
  content: string;
}

/**
 * Fontes de origem do lead: as pesquisas (`funnel_surveys`) e as planilhas de
 * aplicação/lead do funil. As UTMs vivem nelas — a planilha de venda costuma
 * ter UTM do checkout, que diz o último clique, não de onde o lead nasceu.
 */
/**
 * Planilhas que NÃO servem de origem: são registros de COMPRA. Cruzar o
 * comprador contra elas casaria 100% por construção (ele está lá porque
 * comprou) e a UTM que carregam é a do checkout — último clique, não de onde
 * o lead nasceu.
 */
const TIPOS_DE_VENDA = new Set(["sales", "perpetual_sales", "perpetual_upsell"]);

export function criarLeitoresDeVendasEOrigem(db: Database) {
  /**
   * Lê as planilhas de venda de uma etapa e devolve as vendas já deduplicadas
   * e sem reembolso. Mesmas regras do dashboard de vendas, para os números não
   * divergirem entre um card e outro:
   *  - reembolso/chargeback excluem TAMBÉM a linha "paid" pareada (mesmo txId);
   *  - dedup por (planilha, txId, produto): order bump compartilha o txId da
   *    compra principal, então sem o produto na chave ele sumiria.
   */
  async function lerVendas(stageId: string, subtype: string): Promise<VendaLida[]> {
    const planilhas = await db
      .select()
      .from(stageSalesSpreadsheets)
      .where(
        and(eq(stageSalesSpreadsheets.stageId, stageId), eq(stageSalesSpreadsheets.subtype, subtype)),
      );

    const out: VendaLida[] = [];

    for (const sp of planilhas) {
      const mapping = (sp.columnMapping ?? {}) as {
        email?: string;
        productName?: string;
        valorBruto?: string;
        dataVenda?: string;
        transactionId?: string;
        status?: string;
        utm_source?: string;
        utm_term?: string;
        utm_campaign?: string;
        utm_content?: string;
        canalOrigem?: string;
      };

      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(sp.spreadsheetId, sp.sheetName);
      } catch {
        continue;
      }
      const col = (n: string | undefined) => (n ? data.headers.indexOf(n) : -1);
      const emailIdx = col(mapping.email);
      const dataIdx = col(mapping.dataVenda);
      const produtoIdx = col(mapping.productName);
      const brutoIdx = col(mapping.valorBruto);
      const txIdx = col(mapping.transactionId);
      const statusIdx = col(mapping.status);
      const utmSrcIdx = col(mapping.utm_source);
      const canalIdx = col(mapping.canalOrigem);
      // Apelido além do mapeamento: a planilha de venda quase nunca tem
      // utm_term mapeado no wizard, mas a coluna costuma existir na aba.
      const termIdx = col(mapping.utm_term) !== -1
        ? col(mapping.utm_term)
        : data.headers.findIndex((h) => /^utm_?term$|^te=$/i.test(h.trim()));
      const cmpIdx = col(mapping.utm_campaign) !== -1
        ? col(mapping.utm_campaign)
        : data.headers.findIndex((h) => /^utm_?campaign$|^ca=$/i.test(h.trim()));
      // Story 18.83: mesmos apelidos do web (`useCrossReferenceLeads`).
      const contentIdx = col(mapping.utm_content) !== -1
        ? col(mapping.utm_content)
        : data.headers.findIndex((h) => APELIDOS_DE_CONTEUDO.test(h.trim()));

      // Pass 1: transações reembolsadas.
      const reembolsados = new Set<string>();
      if (statusIdx !== -1 && txIdx !== -1) {
        for (const row of data.rows) {
          if (isRefundBucket(classifyRefundStatus(row[statusIdx], true))) {
            const tx = (row[txIdx] ?? "").trim();
            if (tx) reembolsados.add(tx);
          }
        }
      }

      const vistos = new Set<string>();
      for (const row of data.rows) {
        if (statusIdx !== -1) {
          if (isRefundBucket(classifyRefundStatus(row[statusIdx], true))) continue;
          const tx = txIdx !== -1 ? (row[txIdx] ?? "").trim() : "";
          if (tx && reembolsados.has(tx)) continue;
        }

        const email = emailIdx !== -1 ? normalizeEmail(row[emailIdx]) : "";
        const produto = produtoIdx !== -1 ? (row[produtoIdx] ?? "").trim() : "";
        const tx = txIdx !== -1 ? (row[txIdx] ?? "").trim() : "";

        if (tx) {
          const chave = `${sp.spreadsheetId}|${tx}|${produto.toLowerCase()}`;
          if (vistos.has(chave)) continue;
          vistos.add(chave);
        }

        const day = dataIdx !== -1 ? parseDay(row[dataIdx]) : null;
        const srcRaw =
          (utmSrcIdx !== -1 ? (row[utmSrcIdx] ?? "") : "").trim() ||
          (canalIdx !== -1 ? (row[canalIdx] ?? "") : "").trim();
        out.push({
          email,
          produto,
          day,
          bruto: brutoIdx !== -1 ? parseNumber(row[brutoIdx]) : 0,
          origem: `${sp.spreadsheetName} / ${sp.sheetName}`,
          dated: dataIdx !== -1,
          source: srcRaw || "(sem origem)",
          term: termIdx !== -1 ? (row[termIdx] ?? "").trim() : "",
          campaign: cmpIdx !== -1 ? (row[cmpIdx] ?? "").trim() : "",
          content: contentIdx !== -1 ? (row[contentIdx] ?? "").trim() : "",
        });
      }
    }

    return out;
  }

  /**
   * `stageId` restringe as fontes à etapa (mais as planilhas do funil sem etapa
   * definida, que valem para todas). Sem ele, varre o funil inteiro.
   *
   * Quem CONTA pessoas por etapa precisa passar o stageId: sem isso a planilha de
   * Aplicação (comercial), que pertence à etapa de Vendas, aparece na Captação
   * Paga e vira uma linha de funil que não existe naquele funil. Quem só procura
   * a ORIGEM de um e-mail (buyers-origin, jornada) quer o funil inteiro de
   * propósito — o lead pode ter nascido em qualquer etapa.
   */
  async function fontesDeOrigem(funnelId: string, stageId?: string) {
    const daEtapa = <T extends { stageId: string | null }>(rows: T[]): T[] =>
      stageId ? rows.filter((r) => r.stageId === stageId || r.stageId === null) : rows;

    const surveys = daEtapa(
      await db.select().from(funnelSurveys).where(eq(funnelSurveys.funnelId, funnelId)),
    );

    // Sem allowlist de tipos: pega TODA planilha conectada no funil e descarta
    // só as de venda. Assim, tipo novo de planilha entra na conta sozinho, sem
    // precisar lembrar de editar esta lista.
    const todas = await db
      .select()
      .from(funnelSpreadsheets)
      .where(eq(funnelSpreadsheets.funnelId, funnelId));
    const sheets = daEtapa(todas.filter((s) => !TIPOS_DE_VENDA.has(s.type)));

    return [
      ...surveys.map((s) => ({
        // Nome da ABA junto: "Leads" não diz qual planilha é, e o time precisa
        // conferir que a fonte certa entrou.
        label: `${s.spreadsheetName} / ${s.sheetName}`,
        sheetLabel: s.sheetName,
        tipo: "pesquisa" as const,
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
      })),
      ...sheets.map((s) => ({
        label: s.label ? `${s.label} · ${s.sheetName}` : `${s.spreadsheetName} / ${s.sheetName}`,
        sheetLabel: s.sheetName,
        tipo: (s.type === "applications" ? "aplicacao" : "captacao") as "aplicacao" | "captacao",
        spreadsheetId: s.spreadsheetId,
        sheetName: s.sheetName,
        mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
      })),
    ];
  }

  return { lerVendas, fontesDeOrigem };
}
