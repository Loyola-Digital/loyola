/**
 * Etapa de Vendas — comparação D1/D2/D3, origem dos compradores e jornada do lead.
 *
 * Três perguntas que a etapa não respondia:
 *
 * 1. "Estamos vendendo mais que o lançamento passado NESTA altura?" — comparar
 *    por data não responde, porque dois lançamentos abrem carrinho em dias
 *    diferentes. A série é indexada em D1/D2/D3 (dia relativo à primeira venda),
 *    mesma convenção do gráfico de aplicações da Captação Paga.
 *
 * 2. "De onde veio quem comprou?" — cruza o e-mail do comprador com a pesquisa
 *    de aplicação, que é onde moram as UTMs do lead.
 *
 * 3. "O que esse e-mail fez no funil inteiro?" — a jornada, do primeiro registro
 *    na captação até a compra.
 *
 * Custo: tudo aqui lê Google Sheets ao vivo. `readSheetData` tem cache de 30s,
 * que é o que impede as três rotas de multiplicarem chamadas quando a aba monta.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnelStages,
  funnelSurveys,
  funnels,
  manualSales,
  stageCrmCards,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "../services/sales-status.js";
import { chaveLp, lpDoRegistro, parseUtmTerm, type FonteLp } from "../services/utm-term.js";
import { phoneTail } from "../utils/lead-origin.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

// ============================================================
// Helpers
// ============================================================

/** dd/mm/aaaa, aaaa-mm-dd e ISO → aaaa-mm-dd local. */
function parseDay(raw: string | undefined | null): string | null {
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

function normalizeEmail(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Valor "R$ 1.234,56" / "1234.56" → number. */
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const limpo = String(val).replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  // Formato BR quando a vírgula vem depois do último ponto.
  const temVirgulaDecimal = limpo.lastIndexOf(",") > limpo.lastIndexOf(".");
  const n = Number(temVirgulaDecimal ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface SalesDailyPoint {
  /** 1 = primeiro dia com venda daquele funil. */
  dia: number;
  date: string;
  vendas: number;
  acumulado: number;
  /** Quebra das vendas do dia por origem (utm_source da venda), desc. */
  porSource: { source: string; vendas: number }[];
}

/** Todos os dias entre o primeiro e o último, inclusive os zerados. */
function fillGaps(
  counts: Map<string, number>,
  bySource?: Map<string, Map<string, number>>,
): SalesDailyPoint[] {
  const dias = [...counts.keys()].sort();
  if (!dias.length) return [];

  const inicio = new Date(`${dias[0]}T00:00:00Z`);
  const fim = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  const out: SalesDailyPoint[] = [];
  let acumulado = 0;
  let i = 1;

  for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    // Dia sem venda vira 0 e permanece na série: o buraco é informação, e
    // omitir deslocaria o D-day de todos os dias seguintes.
    const n = counts.get(key) ?? 0;
    acumulado += n;
    const src = bySource?.get(key);
    const porSource = src
      ? [...src.entries()].map(([source, vendas]) => ({ source, vendas })).sort((a, b) => b.vendas - a.vendas)
      : [];
    out.push({ dia: i, date: key, vendas: n, acumulado, porSource });
    i++;
  }
  return out;
}

interface VendaLida {
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
}

export default fp(async function stageSalesJourneyRoutes(fastify) {
  /**
   * Lê as planilhas de venda de uma etapa e devolve as vendas já deduplicadas
   * e sem reembolso. Mesmas regras do dashboard de vendas, para os números não
   * divergirem entre um card e outro:
   *  - reembolso/chargeback excluem TAMBÉM a linha "paid" pareada (mesmo txId);
   *  - dedup por (planilha, txId, produto): order bump compartilha o txId da
   *    compra principal, então sem o produto na chave ele sumiria.
   */
  async function lerVendas(stageId: string, subtype: string): Promise<VendaLida[]> {
    const planilhas = await fastify.db
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
        });
      }
    }

    return out;
  }

  /**
   * Série diária de VENDAS (unidades) do produto principal, indexada em D-day.
   *
   * Conta a MESMA coisa que o card "Produto Principal" e o KPI do topo da etapa:
   * planilha `main_product` + `tmb` + vendas manuais (PIX). Antes lia só
   * `main_product`, então o gráfico ficava vendas atrás do número exibido logo
   * acima dele — a mesma pergunta com duas respostas na mesma tela.
   *
   * A comparação com o lançamento anterior passa por aqui também, então os dois
   * lados do gráfico seguem o mesmo critério.
   */
  async function serieDeVendas(stageId: string) {
    const vendas = [
      ...(await lerVendas(stageId, "main_product")),
      ...(await lerVendas(stageId, "tmb")),
    ];

    // Venda manual não vive em planilha; sem ela o gráfico ignora o PIX direto,
    // que é justamente a venda que o time lança na mão durante o carrinho.
    const manuais = await fastify.db
      .select({ saleDate: manualSales.saleDate, value: manualSales.value })
      .from(manualSales)
      .where(eq(manualSales.stageId, stageId));
    for (const m of manuais) {
      vendas.push({
        email: "",
        produto: "(venda manual)",
        day: m.saleDate ? parseDay(m.saleDate.toISOString()) : null,
        bruto: Number(m.value) || 0,
        origem: "Venda manual",
        dated: true,
        source: "venda manual",
        // Venda lançada na mão não tem UTM nenhuma — fica fora do funil por LP,
        // que é o correto: ninguém sabe de qual página ela veio.
        term: "",
        campaign: "",
      });
    }

    const counts = new Map<string, number>();
    const bySource = new Map<string, Map<string, number>>();
    let semData = 0;
    for (const v of vendas) {
      // Linha sem data válida não entra: entraria como "hoje" e inflaria o
      // último dia, que é exatamente o dia que o time olha.
      if (!v.day) {
        semData++;
        continue;
      }
      counts.set(v.day, (counts.get(v.day) ?? 0) + 1);
      const m = bySource.get(v.day) ?? new Map<string, number>();
      m.set(v.source, (m.get(v.source) ?? 0) + 1);
      bySource.set(v.day, m);
    }
    return { points: fillGaps(counts, bySource), total: vendas.length - semData, semData, temPlanilha: vendas.length > 0 };
  }

  // ============================================================
  // 1) Comparação D1/D2/D3 com o funil anterior
  // ============================================================

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-daily-comparison",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [ctx] = await fastify.db
        .select({
          funnelName: funnels.name,
          compareFunnelId: funnels.compareFunnelId,
          stageType: funnelStages.stageType,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!ctx) return reply.code(404).send({ error: "Etapa não encontrada" });

      const atual = await serieDeVendas(p.data.stageId);

      let comparacao: {
        funnelName: string;
        points: SalesDailyPoint[];
        total: number;
        semPlanilha: boolean;
      } | null = null;

      if (ctx.compareFunnelId) {
        const [cmpFunnel] = await fastify.db
          .select({ id: funnels.id, name: funnels.name })
          .from(funnels)
          .where(eq(funnels.id, ctx.compareFunnelId))
          .limit(1);
        const [cmpStage] = await fastify.db
          .select({ id: funnelStages.id })
          .from(funnelStages)
          .where(
            and(
              eq(funnelStages.funnelId, ctx.compareFunnelId),
              eq(funnelStages.stageType, ctx.stageType),
            ),
          )
          .limit(1);

        if (cmpFunnel && cmpStage) {
          const s = await serieDeVendas(cmpStage.id);
          comparacao = {
            funnelName: cmpFunnel.name,
            points: s.points,
            total: s.total,
            semPlanilha: !s.temPlanilha,
          };
        }
      }

      // Delta na MESMA altura: acumulado de hoje contra o acumulado do anterior
      // no mesmo D-day. Comparar com o total final do anterior diria que estamos
      // sempre perdendo até o último dia — leitura inútil.
      let deltaPercent: number | null = null;
      const ultimoDia = atual.points.length;
      if (ultimoDia > 0 && comparacao?.points.length) {
        const base = comparacao.points.find((x) => x.dia === ultimoDia)?.acumulado;
        const meu = atual.points[ultimoDia - 1].acumulado;
        if (base && base > 0) deltaPercent = +(((meu - base) / base) * 100).toFixed(1);
      }

      return {
        funnelName: ctx.funnelName,
        semPlanilha: !atual.temPlanilha,
        total: atual.total,
        semData: atual.semData,
        points: atual.points,
        comparacao,
        deltaPercent,
      };
    },
  );

  // ============================================================
  // 2) Origem dos compradores (cruzamento com a pesquisa de aplicação)
  // ============================================================

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
      await fastify.db.select().from(funnelSurveys).where(eq(funnelSurveys.funnelId, funnelId)),
    );

    // Sem allowlist de tipos: pega TODA planilha conectada no funil e descarta
    // só as de venda. Assim, tipo novo de planilha entra na conta sozinho, sem
    // precisar lembrar de editar esta lista.
    const todas = await fastify.db
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

  /** Índice de coluna por mapeamento explícito, com fallback por apelido. */
  function acharCol(headers: string[], mapeado: unknown, apelidos: RegExp): number {
    if (typeof mapeado === "string" && mapeado) {
      const i = headers.indexOf(mapeado);
      if (i !== -1) return i;
    }
    return headers.findIndex((h) => apelidos.test(h.trim()));
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/buyers-origin",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // Janela de dias — alinha com o resto do dashboard (stage-sales-data): só
      // filtra vendas de planilhas COM coluna de data; linha sem data válida numa
      // planilha datada é excluída. Sem ?days= = histórico completo.
      const days = ((): number | undefined => {
        const parsed = z.coerce.number().int().min(1).max(365).safeParse((request.query as { days?: unknown }).days);
        return parsed.success ? parsed.data : undefined;
      })();
      const cutoffYmd: string | null = (() => {
        if (!days) return null;
        const c = new Date();
        c.setDate(c.getDate() - days);
        return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
      })();
      const vendasRaw = await lerVendas(p.data.stageId, "main_product");
      const vendas = cutoffYmd
        ? vendasRaw.filter((v) => !v.dated || (v.day !== null && v.day >= cutoffYmd))
        : vendasRaw;
      // Um comprador = um e-mail. Quem compra duas vezes não conta como duas
      // origens, senão o maior comprador enviesaria o gráfico.
      const compradores = new Set(vendas.map((v) => v.email).filter(Boolean));
      if (compradores.size === 0) {
        return { semDados: true, totalCompradores: 0, casados: 0, semOrigem: 0, dimensoes: [], comTermEstruturado: 0, fontes: [] };
      }

      const fontes = await fontesDeOrigem(p.data.funnelId);
      const origemPorEmail = new Map<
        string,
        { source: string; medium: string; campaign: string; term: string; fonteLabel: string }
      >();

      for (const f of fontes) {
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(f.spreadsheetId, f.sheetName);
        } catch {
          continue;
        }
        const emailIdx = acharCol(data.headers, f.mapping.email, /e-?mail/i);
        if (emailIdx === -1) continue;
        const srcIdx = acharCol(data.headers, f.mapping.utm_source, /^utm_?source$/i);
        const medIdx = acharCol(data.headers, f.mapping.utm_medium, /^utm_?medium$/i);
        const cmpIdx = acharCol(data.headers, f.mapping.utm_campaign, /^utm_?campaign$/i);
        const termIdx = acharCol(data.headers, f.mapping.utm_term, /^utm_?term$/i);

        for (const row of data.rows) {
          const email = normalizeEmail(row[emailIdx]);
          if (!email || !compradores.has(email)) continue;
          // Primeira fonte que casar vence: as fontes vêm de pesquisa primeiro,
          // que é a origem declarada do lead, não o último clique do checkout.
          if (origemPorEmail.has(email)) continue;
          origemPorEmail.set(email, {
            source: (srcIdx !== -1 ? row[srcIdx] : "")?.trim() || "(sem utm)",
            medium: (medIdx !== -1 ? row[medIdx] : "")?.trim() || "",
            campaign: (cmpIdx !== -1 ? row[cmpIdx] : "")?.trim() || "(sem campanha)",
            // O term carrega LP, criativo, público e formato — é ele que
            // responde "de qual LP veio", que a campanha sozinha não responde.
            term: (termIdx !== -1 ? row[termIdx] : "")?.trim() || "",
            fonteLabel: f.label,
          });
        }
      }

      // Term parseado por comprador — daqui saem LP, criativo, público, formato.
      const detalhes = [...origemPorEmail.values()].map((o) => ({ ...o, t: parseUtmTerm(o.term) }));

      type Detalhe = (typeof detalhes)[number];
      const contar = (chave: (o: Detalhe) => string | null) => {
        const m = new Map<string, number>();
        for (const d of detalhes) {
          // Sem valor não vira "(vazio)" numa lista de igual pra igual: some, e
          // o total da dimensão mostra sozinho quantos tinham a informação.
          const k = chave(d);
          if (!k) continue;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return [...m.entries()]
          .map(([nome, compradores]) => ({ nome, compradores }))
          .sort((a, b) => b.compradores - a.compradores);
      };

      /**
       * Dimensões em vez de duas abas fixas. Cada uma responde uma pergunta
       * diferente sobre o mesmo conjunto de compradores, e vem com o total de
       * quem tinha aquela informação — sem isso, "3 vieram da lpa" esconde que
       * só 5 dos 27 tinham LP no term.
       */
      const dimensoes = [
        { key: "fonte", label: "Fonte", itens: contar((d) => (d.medium ? `${d.source} / ${d.medium}` : d.source)) },
        { key: "campanha", label: "Campanha", itens: contar((d) => d.t.campanha || d.campaign) },
        { key: "lp", label: "LP", itens: contar((d) => d.t.lp) },
        { key: "anuncio", label: "Anúncio", itens: contar((d) => d.t.anuncio) },
        { key: "conjunto", label: "Conjunto", itens: contar((d) => d.t.conjunto) },
        { key: "formato", label: "Formato", itens: contar((d) => d.t.formato) },
        { key: "publico", label: "Público", itens: contar((d) => d.t.publico) },
        { key: "posicionamento", label: "Posicionamento", itens: contar((d) => d.t.posicionamento) },
        { key: "objetivo", label: "Objetivo", itens: contar((d) => d.t.objetivo) },
        { key: "lote", label: "Lote", itens: contar((d) => d.t.lote) },
      ]
        // Dimensão sem nenhum valor não vira aba vazia pra pessoa clicar e não
        // achar nada — some.
        .filter((d) => d.itens.length > 0)
        .map((d) => ({
          ...d,
          comInfo: d.itens.reduce((s, i) => s + i.compradores, 0),
        }));

      // Quantos compradores cada PLANILHA casou. Sem isso não dá pra saber se
      // uma fonte conectada está de fato contribuindo ou entrou só de enfeite
      // (coluna de e-mail não mapeada, aba errada, planilha vazia).
      const porPlanilha = new Map<string, number>();
      for (const o of origemPorEmail.values()) {
        porPlanilha.set(o.fonteLabel, (porPlanilha.get(o.fonteLabel) ?? 0) + 1);
      }

      return {
        semDados: false,
        totalCompradores: compradores.size,
        casados: origemPorEmail.size,
        // Comprador que não aparece em nenhuma pesquisa/planilha de lead: comprou
        // sem passar pela aplicação, ou usou outro e-mail no checkout.
        semOrigem: compradores.size - origemPorEmail.size,
        dimensoes,
        /** Quantos compradores tinham utm_term estruturado (padrão do Meta). */
        comTermEstruturado: detalhes.filter((d) => d.t.estruturado).length,
        fontes: fontes.map((f) => ({
          label: f.label,
          tipo: f.tipo,
          compradores: porPlanilha.get(f.label) ?? 0,
        })),
      };
    },
  );

  // ============================================================
  // 3) Jornada do lead
  // ============================================================

  const journeyQuery = z.object({
    email: z.string().trim().min(3).max(200),
    /** "funnel" (padrão, barato) ou "project" — varre todos os funis. */
    scope: z.enum(["funnel", "project"]).optional(),
  });

  interface EventoJornada {
    kind: "captacao" | "aplicacao" | "pesquisa" | "compra" | "venda_manual" | "comercial";
    date: string | null;
    titulo: string;
    detalhe: string | null;
    funnelName: string;
    stageName: string | null;
    campos: { label: string; valor: string }[];
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-journey",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      const q = journeyQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const alvo = normalizeEmail(q.data.email);
      const scope = q.data.scope ?? "funnel";

      // Escopo: por padrão só este funil. "project" varre todos os funis do
      // projeto — é o que responde "esse lead já apareceu em lançamento
      // anterior?", mas custa uma leitura de Sheets por planilha de cada funil.
      const funisAlvo = await fastify.db
        .select({ id: funnels.id, name: funnels.name })
        .from(funnels)
        .where(
          scope === "project"
            ? eq(funnels.projectId, p.data.projectId)
            : and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)),
        );
      if (funisAlvo.length === 0) return reply.code(404).send({ error: "Funil não encontrado" });

      const funnelIds = funisAlvo.map((f) => f.id);
      const nomeFunil = new Map(funisAlvo.map((f) => [f.id, f.name]));

      const etapas = await fastify.db
        .select({ id: funnelStages.id, name: funnelStages.name, funnelId: funnelStages.funnelId })
        .from(funnelStages)
        .where(inArray(funnelStages.funnelId, funnelIds));
      const nomeEtapa = new Map(etapas.map((s) => [s.id, s.name]));
      const funilDaEtapa = new Map(etapas.map((s) => [s.id, s.funnelId]));

      const eventos: EventoJornada[] = [];

      /** Colunas que não viram "campo" no detalhe do evento. */
      const ignorar = /^(submission|respondent|submitted|carimbo)/i;

      // --- Planilhas de lead / aplicação e pesquisas ---
      const sheets = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(inArray(funnelSpreadsheets.funnelId, funnelIds));
      const surveys = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(inArray(funnelSurveys.funnelId, funnelIds));

      const leitura: {
        kind: EventoJornada["kind"];
        label: string;
        funnelId: string;
        stageId: string | null;
        spreadsheetId: string;
        sheetName: string;
        mapping: Record<string, unknown>;
      }[] = [
        ...sheets.map((s) => ({
          kind: (s.type === "applications" ? "aplicacao" : "captacao") as EventoJornada["kind"],
          label: s.label ?? `${s.spreadsheetName} / ${s.sheetName}`,
          funnelId: s.funnelId,
          stageId: s.stageId,
          spreadsheetId: s.spreadsheetId,
          sheetName: s.sheetName,
          mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
        })),
        ...surveys.map((s) => ({
          kind: "pesquisa" as EventoJornada["kind"],
          label: `${s.spreadsheetName} / ${s.sheetName}`,
          funnelId: s.funnelId,
          stageId: s.stageId,
          spreadsheetId: s.spreadsheetId,
          sheetName: s.sheetName,
          mapping: (s.columnMapping ?? {}) as Record<string, unknown>,
        })),
      ];

      for (const src of leitura) {
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(src.spreadsheetId, src.sheetName);
        } catch {
          continue;
        }
        const emailIdx = acharCol(data.headers, src.mapping.email, /e-?mail/i);
        if (emailIdx === -1) continue;
        const dataIdx = acharCol(
          data.headers,
          src.mapping.timestamp ?? src.mapping.date,
          /timestamp|carimbo|submitted|^data/i,
        );

        for (const row of data.rows) {
          if (normalizeEmail(row[emailIdx]) !== alvo) continue;
          const campos = data.headers
            .map((h, i) => ({ label: h.trim(), valor: (row[i] ?? "").trim() }))
            .filter((c) => c.label && c.valor && !ignorar.test(c.label));
          eventos.push({
            kind: src.kind,
            date: dataIdx !== -1 ? parseDay(row[dataIdx]) : null,
            titulo: src.label,
            detalhe: null,
            funnelName: nomeFunil.get(src.funnelId) ?? "—",
            stageName: src.stageId ? (nomeEtapa.get(src.stageId) ?? null) : null,
            campos: campos.slice(0, 30),
          });
        }
      }

      // --- Compras (todas as etapas, todos os subtypes) ---
      const etapaIds = etapas.map((s) => s.id);
      if (etapaIds.length > 0) {
        const vendaSheets = await fastify.db
          .select()
          .from(stageSalesSpreadsheets)
          .where(inArray(stageSalesSpreadsheets.stageId, etapaIds));

        for (const sp of vendaSheets) {
          const mapping = (sp.columnMapping ?? {}) as Record<string, unknown>;
          let data: { headers: string[]; rows: string[][] };
          try {
            data = await readSheetData(sp.spreadsheetId, sp.sheetName);
          } catch {
            continue;
          }
          const emailIdx = acharCol(data.headers, mapping.email, /e-?mail/i);
          if (emailIdx === -1) continue;
          const dataIdx = acharCol(data.headers, mapping.dataVenda, /data|timestamp/i);
          const prodIdx = acharCol(data.headers, mapping.productName, /produto|product/i);
          const brutoIdx = acharCol(data.headers, mapping.valorBruto, /bruto|valor|amount/i);
          const statusIdx = acharCol(data.headers, mapping.status, /status/i);

          for (const row of data.rows) {
            if (normalizeEmail(row[emailIdx]) !== alvo) continue;
            const status = statusIdx !== -1 ? (row[statusIdx] ?? "").trim() : "";
            const reembolso = statusIdx !== -1 && isRefundBucket(classifyRefundStatus(status, true));
            const valor = brutoIdx !== -1 ? parseNumber(row[brutoIdx]) : 0;
            eventos.push({
              kind: "compra",
              date: dataIdx !== -1 ? parseDay(row[dataIdx]) : null,
              titulo: prodIdx !== -1 && row[prodIdx] ? row[prodIdx].trim() : sp.spreadsheetName,
              // Reembolso aparece na jornada em vez de sumir: some do faturamento,
              // mas continua sendo um fato da relação com o lead.
              detalhe: reembolso ? `reembolsado (${status})` : status || null,
              funnelName: nomeFunil.get(funilDaEtapa.get(sp.stageId) ?? "") ?? "—",
              stageName: nomeEtapa.get(sp.stageId) ?? null,
              campos: [
                { label: "Planilha", valor: `${sp.spreadsheetName} / ${sp.sheetName}` },
                { label: "Tipo", valor: sp.subtype },
                ...(valor > 0 ? [{ label: "Valor", valor: valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }] : []),
              ],
            });
          }
        }

        // --- Vendas manuais ---
        const manuais = await fastify.db
          .select()
          .from(manualSales)
          .where(inArray(manualSales.stageId, etapaIds));
        for (const m of manuais) {
          if (normalizeEmail(m.customerEmail) !== alvo) continue;
          const valorManual = Number(m.value);
          eventos.push({
            kind: "venda_manual",
            date: m.saleDate ? parseDay(m.saleDate.toISOString()) : null,
            titulo: m.product ?? "Venda manual",
            detalhe: m.sellerName ? `vendedor: ${m.sellerName}` : null,
            funnelName: nomeFunil.get(funilDaEtapa.get(m.stageId) ?? "") ?? "—",
            stageName: nomeEtapa.get(m.stageId) ?? null,
            campos: [
              ...(m.customerName ? [{ label: "Nome", valor: m.customerName }] : []),
              ...(Number.isFinite(valorManual) && valorManual > 0
                ? [{ label: "Valor", valor: valorManual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }]
                : []),
            ],
          });
        }

        // --- Card no comercial ---
        const cards = await fastify.db
          .select()
          .from(stageCrmCards)
          .where(inArray(stageCrmCards.stageId, etapaIds));
        for (const c of cards) {
          if (normalizeEmail(c.customerEmail) !== alvo) continue;
          eventos.push({
            kind: "comercial",
            date: c.createdAt ? parseDay(c.createdAt.toISOString()) : null,
            titulo: c.customerName || "Card no comercial",
            detalhe: c.callStatus ?? null,
            funnelName: nomeFunil.get(funilDaEtapa.get(c.stageId) ?? "") ?? "—",
            stageName: nomeEtapa.get(c.stageId) ?? null,
            campos: [
              ...(c.customerPhone ? [{ label: "Telefone", valor: c.customerPhone }] : []),
              ...((c.callCount ?? 0) > 0 ? [{ label: "Ligações", valor: String(c.callCount) }] : []),
            ],
          });
        }
      }

      // Sem data vai para o fim: é registro real, só não dá pra posicionar no
      // tempo — esconder seria mentir sobre o que existe.
      eventos.sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return 0;
      });

      return {
        email: alvo,
        scope,
        encontrado: eventos.length > 0,
        eventos,
        resumo: {
          total: eventos.length,
          compras: eventos.filter((e) => e.kind === "compra" || e.kind === "venda_manual").length,
          primeiroContato: eventos.find((e) => e.date)?.date ?? null,
          funis: [...new Set(eventos.map((e) => e.funnelName))],
        },
      };
    },
  );

  // ============================================================
  // 4) Faixas por formulário de aplicação
  // ============================================================

  /**
   * "A Página A traz lead melhor que a Página B?" — quebra as aplicações de CADA
   * formulário (planilha `applications` do funil) por faixa de qualificação, e
   * cruza com quem comprou o produto principal.
   *
   * De onde sai a faixa, nesta ordem:
   *
   *  1. Coluna de faixa NA PRÓPRIA aba do formulário ("Faixa 1", escrita pelo
   *     n8n). É a fonte boa — cobre 100% de quem aplicou naquele form.
   *  2. Cruzamento por contato com as pesquisas do funil (e-mail primeiro,
   *     últimos 8 dígitos do telefone como reserva), pros forms que ainda não
   *     têm coluna de faixa própria.
   *
   * A ordem existe porque medimos a cobertura real: quem aplica direto na página
   * de aplicação em geral NÃO respondeu a pesquisa de captação, então o
   * cruzamento sozinho deixa a maioria sem faixa. Quem fica sem faixa continua na
   * resposta como `band: null` — sumir com ele mentiria sobre o tamanho do form e
   * inflaria a conversão das faixas reais.
   *
   * Sem janela de dias de propósito: a leitura é do lançamento inteiro. Filtrar
   * a venda por janela sem filtrar a aplicação (que é sempre anterior)
   * subestimaria a conversão de todas as faixas.
   */
  const SEM_FAIXA = "\u0000sem-faixa";

  /** Coluna de faixa: mapeamento explícito > "faixa 1" > 1º header "faixa…". */
  function acharColFaixa(headers: string[], mapeado: unknown): number {
    if (typeof mapeado === "string" && mapeado) {
      const i = headers.indexOf(mapeado);
      if (i !== -1) return i;
    }
    const norm = (s: string) => s.trim().toLowerCase();
    let i = headers.findIndex((h) => norm(h) === "faixa 1");
    if (i === -1) i = headers.findIndex((h) => norm(h).startsWith("faixa"));
    return i;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/application-bands",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const forms = await fastify.db
        .select({
          id: funnelSpreadsheets.id,
          label: funnelSpreadsheets.label,
          spreadsheetId: funnelSpreadsheets.spreadsheetId,
          sheetName: funnelSpreadsheets.sheetName,
          columnMapping: funnelSpreadsheets.columnMapping,
        })
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, p.data.funnelId),
            eq(funnelSpreadsheets.type, "applications"),
          ),
        );

      if (forms.length === 0) {
        return { semPlanilha: true, semFaixa: true, bandLabels: [], forms: [], total: null };
      }

      // --- Índice faixa por contato (vem das pesquisas do funil) ---
      const surveys = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.funnelId, p.data.funnelId));

      const faixaPorEmail = new Map<string, string>();
      const faixaPorTelefone = new Map<string, string>();
      const bandSet = new Set<string>();

      for (const s of surveys) {
        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(s.spreadsheetId, s.sheetName);
        } catch {
          continue;
        }
        const mapping = (s.columnMapping ?? {}) as Record<string, unknown>;
        const faixaIdx = acharColFaixa(data.headers, mapping.faixa);
        // Pesquisa sem coluna de faixa não contribui (é o caso das pesquisas de
        // aplicação: elas identificam a página, não a qualificação).
        if (faixaIdx === -1) continue;
        const emailIdx = acharCol(data.headers, mapping.email, /e-?mail/i);
        const phoneIdx = acharCol(data.headers, mapping.phone, /telefone|whats|phone|celular/i);
        if (emailIdx === -1 && phoneIdx === -1) continue;

        for (const row of data.rows) {
          const faixa = (row[faixaIdx] ?? "").trim().toUpperCase();
          if (!faixa) continue;
          bandSet.add(faixa);
          // Primeira resposta vence — o mesmo contato pode responder duas vezes.
          if (emailIdx !== -1) {
            const k = normalizeEmail(row[emailIdx]);
            if (k && !faixaPorEmail.has(k)) faixaPorEmail.set(k, faixa);
          }
          if (phoneIdx !== -1) {
            const k = phoneTail(row[phoneIdx]);
            if (k && !faixaPorTelefone.has(k)) faixaPorTelefone.set(k, faixa);
          }
        }
      }

      // --- Compradores do produto principal (mesma leitura do resto do dashboard) ---
      const receitaPorEmail = new Map<string, number>();
      for (const v of await lerVendas(p.data.stageId, "main_product")) {
        if (!v.email) continue;
        receitaPorEmail.set(v.email, (receitaPorEmail.get(v.email) ?? 0) + v.bruto);
      }

      interface Contato {
        faixa: string | null;
        email: string;
      }

      function agregar(contatos: Map<string, Contato>) {
        const porFaixa = new Map<string, { aplicacoes: number; compradores: number; receita: number }>();
        let comFaixa = 0;
        let compradores = 0;
        let receita = 0;

        for (const c of contatos.values()) {
          if (c.faixa) comFaixa++;
          const chave = c.faixa ?? SEM_FAIXA;
          const acc = porFaixa.get(chave) ?? { aplicacoes: 0, compradores: 0, receita: 0 };
          acc.aplicacoes++;
          const r = c.email ? receitaPorEmail.get(c.email) : undefined;
          if (r !== undefined) {
            acc.compradores++;
            acc.receita += r;
            compradores++;
            receita += r;
          }
          porFaixa.set(chave, acc);
        }

        const bands = [...porFaixa.entries()]
          .map(([band, a]) => ({
            band: band === SEM_FAIXA ? null : band,
            aplicacoes: a.aplicacoes,
            compradores: a.compradores,
            receita: +a.receita.toFixed(2),
            conversao: a.aplicacoes > 0 ? +((a.compradores / a.aplicacoes) * 100).toFixed(1) : 0,
          }))
          // Faixa nomeada em ordem alfabética (A antes de D); "sem faixa" no fim,
          // porque é resíduo de cruzamento, não uma faixa de verdade.
          .sort((x, y) => {
            if (x.band === null) return 1;
            if (y.band === null) return -1;
            return x.band.localeCompare(y.band);
          });

        return {
          aplicacoes: contatos.size,
          comFaixa,
          compradores,
          receita: +receita.toFixed(2),
          conversao: contatos.size > 0 ? +((compradores / contatos.size) * 100).toFixed(1) : 0,
          bands,
        };
      }

      // Total dedup por contato: quem aplicou nas duas páginas conta uma vez só,
      // senão a receita dele entraria duas vezes no consolidado.
      const contatosTotais = new Map<string, Contato>();
      const formsOut = [];

      for (const f of forms) {
        const mapping = (f.columnMapping ?? {}) as Record<string, unknown>;
        let data: { headers: string[]; rows: string[][] } | null = null;
        try {
          data = await readSheetData(f.spreadsheetId, f.sheetName);
        } catch {
          data = null;
        }

        const contatos = new Map<string, Contato>();
        let linhas = 0;

        // Faixa na própria aba do form vence o cruzamento: cobre todo mundo que
        // aplicou ali, enquanto a pesquisa só cobre quem também respondeu ela.
        const faixaPropriaIdx = data ? acharColFaixa(data.headers, mapping.faixa) : -1;

        if (data) {
          const emailIdx = acharCol(data.headers, mapping.email, /e-?mail/i);
          const phoneIdx = acharCol(data.headers, mapping.phone, /telefone|whats|phone|celular/i);

          for (const row of data.rows) {
            const email = emailIdx !== -1 ? normalizeEmail(row[emailIdx]) : "";
            const phone = phoneIdx !== -1 ? phoneTail(row[phoneIdx]) : "";
            // Linha sem nenhum identificador não dá pra cruzar com nada.
            if (!email && !phone) continue;
            linhas++;
            const key = email || `p:${phone}`;
            if (contatos.has(key)) continue;
            const propria =
              faixaPropriaIdx !== -1 ? (row[faixaPropriaIdx] ?? "").trim().toUpperCase() : "";
            if (propria) bandSet.add(propria);
            const faixa =
              propria ||
              (email ? faixaPorEmail.get(email) : undefined) ||
              (phone ? faixaPorTelefone.get(phone) : undefined) ||
              null;
            contatos.set(key, { faixa, email });
            if (!contatosTotais.has(key)) contatosTotais.set(key, { faixa, email });
          }
        }

        const agregado = agregar(contatos);

        formsOut.push({
          sheetId: f.id,
          label: f.label,
          /** Planilha ilegível (permissão, aba renomeada) — o card mostra o aviso. */
          erro: data === null,
          /** Linhas com contato. Difere de `aplicacoes` quando alguém aplica 2x. */
          linhas,
          /**
           * Como a faixa foi obtida neste form. "cruzamento" costuma ter
           * cobertura baixa — o card avisa, senão o time lê "sem faixa" como se
           * fosse lead ruim em vez de dado que não casou.
           */
          fonteFaixa: (faixaPropriaIdx !== -1
            ? "form"
            : agregado.comFaixa > 0
              ? "cruzamento"
              : null) as "form" | "cruzamento" | null,
          ...agregado,
        });
      }

      return {
        semPlanilha: false,
        // Nenhuma faixa em lugar nenhum (nem no form, nem nas pesquisas) — o card
        // explica o que configurar em vez de mostrar tudo como "sem faixa".
        semFaixa: bandSet.size === 0,
        bandLabels: [...bandSet].sort(),
        forms: formsOut,
        total: agregar(contatosTotais),
      };
    },
  );

  // ============================================================
  // 5) Mini-funil por LP
  // ============================================================

  /**
   * "A LPA converte melhor que a LPB?" — a mesma pergunta do `buyers-origin`,
   * mas olhando a CADEIA inteira em vez de só o comprador: quantos viraram lead,
   * quantos aplicaram, quantos responderam pesquisa e quantos compraram, por
   * página de captura.
   *
   * A tabela de LPs (`lp-performance-table`) já responde o lado do tráfego —
   * investimento, LP View, CPL, ROAS — porque esses números só existem na API do
   * Meta. O que ela não responde é o meio do funil, que só existe nas planilhas.
   * Este endpoint entrega esse meio; o card une os dois lados.
   *
   * **Atribuição, nesta ordem (cada linha é classificada uma vez):**
   *
   *  1. `utm_term` estruturado → `parseUtmTerm().lp`. É a fonte boa: o term é
   *     escrito pelo time no Meta e carrega a LP explicitamente.
   *  2. `utm_campaign` com `lp{letra}` — mesma regra que a tabela usa sobre o
   *     campaign_name, para o card não brigar com a linha que ele expande.
   *  3. Herança do lead de captação (por e-mail, telefone como reserva). Existe
   *     porque planilha de aplicação e de pesquisa quase nunca carregam o term:
   *     sem este degrau, essas duas etapas apareceriam zeradas mesmo com o funil
   *     inteiro rastreado. É o degrau mais fraco, então vem contado separado em
   *     `cobertura` — o card avisa quando a maior parte do número veio daqui.
   *
   * Quem não casa em nenhum dos três NÃO é distribuído entre as LPs: vai para
   * `semLp`. Ratear "não sei" entre as páginas inflaria a vencedora.
   */

  /** `heranca` só existe aqui: as duas outras vêm de `lpDoRegistro`. */
  type FonteAtribuicao = FonteLp | "heranca";
  type EtapaLp = "leads" | "aplicacoes" | "pesquisas";

  interface RegistroLp {
    email: string;
    phone: string;
    lp: string | null;
    fonte: FonteAtribuicao | null;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lp-funnel",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, p.data.stageId),
            eq(funnelStages.funnelId, p.data.funnelId),
            eq(funnels.projectId, p.data.projectId),
          ),
        )
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const days = ((): number | undefined => {
        const parsed = z.coerce
          .number()
          .int()
          .min(1)
          .max(365)
          .safeParse((request.query as { days?: unknown }).days);
        return parsed.success ? parsed.data : undefined;
      })();
      const cutoffYmd: string | null = (() => {
        if (!days) return null;
        const c = new Date();
        c.setDate(c.getDate() - days);
        return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
      })();

      // --- Passada 1: lê cada planilha e classifica o que dá pelo term/campanha ---
      const porEtapa: Record<EtapaLp, Map<string, RegistroLp>> = {
        leads: new Map(),
        aplicacoes: new Map(),
        pesquisas: new Map(),
      };
      // Escopado na ETAPA: este endpoint conta pessoas por etapa, então a
      // planilha de outra etapa não pode virar linha do funil desta.
      const fontes = await fontesDeOrigem(p.data.funnelId, p.data.stageId);
      const fontesOut: {
        label: string;
        tipo: "pesquisa" | "aplicacao" | "captacao";
        linhas: number;
        comLp: number;
        erro: boolean;
        semColunaTerm: boolean;
        /** Linhas jogadas fora por data ilegível — descarte deixa de ser silencioso. */
        dataIlegivel: number;
      }[] = [];

      for (const f of fontes) {
        const etapa: EtapaLp =
          f.tipo === "aplicacao" ? "aplicacoes" : f.tipo === "pesquisa" ? "pesquisas" : "leads";

        let data: { headers: string[]; rows: string[][] };
        try {
          data = await readSheetData(f.spreadsheetId, f.sheetName);
        } catch {
          fontesOut.push({
            label: f.label,
            tipo: f.tipo,
            linhas: 0,
            comLp: 0,
            erro: true,
            semColunaTerm: false,
            dataIlegivel: 0,
          });
          continue;
        }

        const emailIdx = acharCol(data.headers, f.mapping.email, /e-?mail/i);
        const phoneIdx = acharCol(data.headers, f.mapping.phone, /telefone|whats|phone|celular/i);
        // Nenhum identificador = não dá pra deduplicar nem herdar. A planilha
        // entra no diagnóstico zerada em vez de sumir sem explicação.
        if (emailIdx === -1 && phoneIdx === -1) {
          fontesOut.push({
            label: f.label,
            tipo: f.tipo,
            linhas: 0,
            comLp: 0,
            erro: false,
            semColunaTerm: false,
            dataIlegivel: 0,
          });
          continue;
        }

        const termIdx = acharCol(data.headers, f.mapping.utm_term, /^utm_?term$|^te=$/i);
        const cmpIdx = acharCol(data.headers, f.mapping.utm_campaign, /^utm_?campaign$|^ca=$/i);
        const dataIdx = acharCol(
          data.headers,
          f.mapping.timestamp ?? f.mapping.date,
          /^(data|date|timestamp|carimbo de data\/hora|submitted at)$/i,
        );

        let linhas = 0;
        let comLp = 0;
        let dataIlegivel = 0;

        for (const row of data.rows) {
          // Janela só se a aba tem data: filtrar planilha sem data mataria
          // fontes inteiras (o card mostraria zero onde há dado). Data presente
          // mas ilegível descarta a linha — mesmo critério das vendas — só que
          // agora contado, porque uma coluna em formato inesperado zerava a
          // planilha inteira sem deixar rastro.
          if (cutoffYmd && dataIdx !== -1) {
            const dia = parseDay(row[dataIdx]);
            if (!dia) {
              dataIlegivel++;
              continue;
            }
            if (dia < cutoffYmd) continue;
          }

          const email = emailIdx !== -1 ? normalizeEmail(row[emailIdx]) : "";
          const phone = phoneIdx !== -1 ? phoneTail(row[phoneIdx]) : "";
          if (!email && !phone) continue;

          linhas++;
          const chave = email || `p:${phone}`;
          // Primeira linha do contato vence — quem preenche duas vezes é uma
          // pessoa só, e a primeira passagem é a que tem a origem real.
          if (porEtapa[etapa].has(chave)) continue;

          const achado = lpDoRegistro(
            termIdx !== -1 ? (row[termIdx] ?? "").trim() : "",
            cmpIdx !== -1 ? (row[cmpIdx] ?? "").trim() : "",
          );
          if (achado) comLp++;
          porEtapa[etapa].set(chave, {
            email,
            phone,
            lp: achado?.rotulo ?? null,
            fonte: achado?.fonte ?? null,
          });
        }

        fontesOut.push({
          label: f.label,
          tipo: f.tipo,
          linhas,
          comLp,
          erro: false,
          semColunaTerm: termIdx === -1 && cmpIdx === -1,
          dataIlegivel,
        });
      }

      // --- Índice de herança: a LP que o contato tinha na CAPTAÇÃO ---
      const lpPorEmail = new Map<string, string>();
      const lpPorTelefone = new Map<string, string>();
      for (const r of porEtapa.leads.values()) {
        if (!r.lp) continue;
        if (r.email && !lpPorEmail.has(r.email)) lpPorEmail.set(r.email, r.lp);
        if (r.phone && !lpPorTelefone.has(r.phone)) lpPorTelefone.set(r.phone, r.lp);
      }
      const herdar = (email: string, phone: string): string | null =>
        (email ? lpPorEmail.get(email) : undefined) ??
        (phone ? lpPorTelefone.get(phone) : undefined) ??
        null;

      // --- Passada 2: herança para quem ficou sem LP própria ---
      for (const etapa of ["aplicacoes", "pesquisas"] as const) {
        for (const r of porEtapa[etapa].values()) {
          if (r.lp) continue;
          const h = herdar(r.email, r.phone);
          if (h) {
            r.lp = h;
            r.fonte = "heranca";
          }
        }
      }

      // --- Vendas: ingresso da captação e/ou produto principal ---
      // As duas coexistem porque a Captação Paga vende ingresso (`capture`) e a
      // etapa de Vendas vende o principal (`main_product`) — na prática cada
      // etapa configura uma. Dedup por e-mail evita contar em dobro quem
      // aparece nas duas.
      const vendasRaw = [
        ...(await lerVendas(p.data.stageId, "main_product")),
        ...(await lerVendas(p.data.stageId, "capture")),
      ];
      const vendas = cutoffYmd
        ? vendasRaw.filter((v) => !v.dated || (v.day !== null && v.day >= cutoffYmd))
        : vendasRaw;

      const compradores = new Map<string, { lp: string | null; fonte: FonteAtribuicao | null; receita: number }>();
      for (const v of vendas) {
        if (!v.email) continue;
        const existente = compradores.get(v.email);
        if (existente) {
          existente.receita += v.bruto;
          continue;
        }
        const achado = lpDoRegistro(v.term, v.campaign);
        const lp = achado?.rotulo ?? herdar(v.email, "");
        compradores.set(v.email, {
          lp,
          fonte: achado?.fonte ?? (lp ? "heranca" : null),
          receita: v.bruto,
        });
      }

      // --- Agregação por LP ---
      interface Acc {
        lp: string;
        variantes: Set<string>;
        leads: number;
        aplicacoes: number;
        pesquisas: number;
        compras: number;
        receita: number;
      }
      const acc = new Map<string, Acc>();
      const pegar = (rotulo: string): Acc => {
        const k = chaveLp(rotulo);
        let a = acc.get(k);
        if (!a) {
          a = { lp: k, variantes: new Set(), leads: 0, aplicacoes: 0, pesquisas: 0, compras: 0, receita: 0 };
          acc.set(k, a);
        }
        if (rotulo !== k) a.variantes.add(rotulo);
        return a;
      };

      const semLp = { leads: 0, aplicacoes: 0, pesquisas: 0, compras: 0 };
      const cobertura = { term: 0, campanha: 0, heranca: 0, semLp: 0 };

      for (const etapa of ["leads", "aplicacoes", "pesquisas"] as const) {
        for (const r of porEtapa[etapa].values()) {
          if (!r.lp) {
            semLp[etapa]++;
            cobertura.semLp++;
            continue;
          }
          pegar(r.lp)[etapa]++;
          if (r.fonte) cobertura[r.fonte]++;
        }
      }
      for (const c of compradores.values()) {
        if (!c.lp) {
          semLp.compras++;
          cobertura.semLp++;
          continue;
        }
        const a = pegar(c.lp);
        a.compras++;
        a.receita += c.receita;
        if (c.fonte) cobertura[c.fonte]++;
      }

      const lps = [...acc.values()]
        .map((a) => ({
          lp: a.lp,
          variantes: [...a.variantes].sort(),
          leads: a.leads,
          aplicacoes: a.aplicacoes,
          pesquisas: a.pesquisas,
          compras: a.compras,
          receita: +a.receita.toFixed(2),
        }))
        // Ordena pelo topo do funil: é o número que dá escala à página.
        .sort((x, y) => y.leads - x.leads || y.compras - x.compras);

      return {
        // Nenhuma planilha do funil rendeu uma linha sequer — o card explica o
        // que conectar, em vez de desenhar um funil todo zerado.
        semDados: lps.length === 0 && cobertura.semLp === 0,
        lps,
        semLp,
        cobertura,
        fontes: fontesOut,
      };
    },
  );
});
