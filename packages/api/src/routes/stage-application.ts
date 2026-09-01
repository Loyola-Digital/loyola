/**
 * A Etapa de Aplicação — rotas.
 *
 * Três endpoints:
 *
 * - `GET  …/application/sources` — quais planilhas de venda existem no funil e
 *   quais esta etapa já escolheu.
 * - `PUT  …/application/sources` — grava a escolha.
 * - `GET  …/application/dashboard` — os números.
 *
 * ## Por que a escolha de planilha é explícita
 *
 * Um funil costuma ter mais de uma natureza de venda conectada — no `dg-pg04`
 * são três na mesma etapa (produto principal, TMB e captação). Somar tudo
 * contaria coisas diferentes como se fossem a mesma, e o número ficaria errado
 * sem ninguém perceber. Então a etapa pergunta, e enquanto ninguém responder
 * ela DIZ que falta escolher — em vez de mostrar zero vendas, que é
 * indistinguível de "não vendeu nada".
 *
 * ## A leitura é ao vivo
 *
 * Planilha de pesquisa e planilha de venda são lidas do Google na hora, com o
 * cache curto que o `google-sheets` já aplica. O time edita a planilha e espera
 * ver aqui — é o mesmo contrato das outras telas que leem planilha.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  applicationStageConfigs,
  funnelStages,
  funnelSurveys,
  funnels,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import {
  dedupKey,
  dentroDoPeriodo,
  emailComparavel,
  resumir,
  sanitizarUtm,
  type AplicacaoDaEtapa,
  type VendaDaAplicacao,
} from "../services/etapa-de-aplicacao.js";

const params = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const periodo = z.object({
  /** Dias para trás. Ausente = tudo que a planilha tiver. */
  days: z.coerce.number().int().min(1).max(365).optional(),
});

const corpoDaConfig = z.object({
  salesSpreadsheetIds: z.array(z.string().uuid()).max(20),
});

/**
 * O índice da coluna, pelo mapeamento explícito ou por apelido.
 *
 * O mapeamento manda quando existe: é a escolha de quem conectou a planilha. O
 * apelido é rede de segurança para planilha antiga, conectada antes de o campo
 * existir — sem ele, mudar o app exigiria remapear vinte planilhas à mão.
 */
function coluna(headers: string[], mapeado: string | undefined, apelidos: RegExp): number {
  if (mapeado) {
    const i = headers.indexOf(mapeado);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => apelidos.test(h.trim()));
}

/** O valor em reais que a planilha escreveu como texto brasileiro. */
export function valorEmReais(bruto: string | undefined): number {
  if (!bruto) return 0;
  const limpo = bruto.replace(/[^\d.,]/g, "");
  if (!limpo) return 0;
  // Com vírgula, o ponto é separador de milhar (`1.234,56`). Sem vírgula, o
  // ponto é decimal (`1234.56`) — é como a Kiwify exporta.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  return Number.parseFloat(normalizado) || 0;
}

/** A data que a planilha escreveu, aceitando o formato brasileiro. */
export function dataDaCelula(bruto: string | undefined): Date | null {
  if (!bruto) return null;
  const texto = bruto.trim();
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, a] = br;
    const dt = new Date(Number(a), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const iso = new Date(texto);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

export default fp(async function stageApplicationRoutes(fastify) {
  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/application";

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  /** A etapa existe, é do funil e o funil é do projeto? */
  async function etapaValida(p: z.infer<typeof params>): Promise<boolean> {
    const [linha] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, p.stageId),
          eq(funnelStages.funnelId, p.funnelId),
          eq(funnels.projectId, p.projectId),
        ),
      )
      .limit(1);
    return Boolean(linha);
  }

  /** Toda planilha de venda do FUNIL, de qualquer etapa. */
  async function planilhasDoFunil(funnelId: string) {
    return fastify.db
      .select({
        id: stageSalesSpreadsheets.id,
        stageId: stageSalesSpreadsheets.stageId,
        stageName: funnelStages.name,
        subtype: stageSalesSpreadsheets.subtype,
        spreadsheetId: stageSalesSpreadsheets.spreadsheetId,
        spreadsheetName: stageSalesSpreadsheets.spreadsheetName,
        sheetName: stageSalesSpreadsheets.sheetName,
        columnMapping: stageSalesSpreadsheets.columnMapping,
      })
      .from(stageSalesSpreadsheets)
      .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
      .where(eq(funnelStages.funnelId, funnelId));
  }

  async function escolhidas(stageId: string): Promise<string[]> {
    const [cfg] = await fastify.db
      .select({ ids: applicationStageConfigs.salesSpreadsheetIds })
      .from(applicationStageConfigs)
      .where(eq(applicationStageConfigs.stageId, stageId))
      .limit(1);
    return cfg?.ids ?? [];
  }

  // ---- GET /sources — o que dá para escolher, e o que já foi escolhido ----
  fastify.get(base + "/sources", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = params.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await etapaValida(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

    const disponiveis = await planilhasDoFunil(p.data.funnelId);
    const ids = await escolhidas(p.data.stageId);

    return {
      // A etapa de origem vai junto: "n8n-kiwify-produto" sozinho não diz de
      // onde veio, e o time precisa reconhecer a planilha que ele conectou.
      disponiveis: disponiveis.map((s) => ({
        id: s.id,
        stageName: s.stageName,
        subtype: s.subtype,
        spreadsheetName: s.spreadsheetName,
        sheetName: s.sheetName,
        /** Sem UTM mapeada, a quebra por origem sai toda em "Sem Track". */
        temUtm: Boolean(s.columnMapping?.utm_source || s.columnMapping?.utm_medium),
      })),
      escolhidas: ids,
    };
  });

  // ---- PUT /sources — grava a escolha ----
  fastify.put(base + "/sources", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = params.safeParse(request.params);
    const b = corpoDaConfig.safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await etapaValida(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Só aceita planilha DESTE funil. Sem esta checagem, um id de outro projeto
    // gravado à mão faria a etapa somar receita alheia.
    const doFunil = new Set((await planilhasDoFunil(p.data.funnelId)).map((s) => s.id));
    const invalidos = b.data.salesSpreadsheetIds.filter((id) => !doFunil.has(id));
    if (invalidos.length > 0) {
      return reply.code(400).send({
        error: "Alguma planilha escolhida não é deste funil.",
        invalidos,
      });
    }

    await fastify.db
      .insert(applicationStageConfigs)
      .values({
        stageId: p.data.stageId,
        salesSpreadsheetIds: b.data.salesSpreadsheetIds,
        createdBy: request.userId ?? null,
      })
      .onConflictDoUpdate({
        target: applicationStageConfigs.stageId,
        set: {
          salesSpreadsheetIds: b.data.salesSpreadsheetIds,
          updatedAt: new Date(),
        },
      });

    return { ok: true, escolhidas: b.data.salesSpreadsheetIds };
  });

  // ---- GET /dashboard — os números ----
  fastify.get(base + "/dashboard", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = params.safeParse(request.params);
    const q = periodo.safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await etapaValida(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

    let de: Date | null = null;
    if (q.data.days) {
      de = new Date();
      de.setDate(de.getDate() - q.data.days);
      de.setHours(0, 0, 0, 0);
    }

    const avisos: string[] = [];

    // ---- aplicações: as planilhas de pesquisa da etapa (ou do funil) ----
    const pesquisas = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(eq(funnelSurveys.funnelId, p.data.funnelId));

    // Pesquisa sem etapa vale para o funil todo — é como o resto do app trata.
    const minhas = pesquisas.filter(
      (s) => s.stageId === p.data.stageId || s.stageId === null,
    );
    if (minhas.length === 0) {
      avisos.push("Nenhuma planilha de aplicação conectada nesta etapa.");
    }

    const aplicacoes: AplicacaoDaEtapa[] = [];
    for (const s of minhas) {
      try {
        const dados = await readSheetData(s.spreadsheetId, s.sheetName);
        const m = s.columnMapping ?? {};
        const iEmail = coluna(dados.headers, m.email, /e-?mail/i);
        const iData = coluna(dados.headers, m.timestamp, /data|timestamp|carimbo/i);
        const iSource = coluna(dados.headers, m.utm_source, /utm[_ ]?source|origem/i);
        const iMedium = coluna(dados.headers, m.utm_medium, /utm[_ ]?medium|m[ií]dia/i);

        for (const linha of dados.rows) {
          const data = iData >= 0 ? dataDaCelula(linha[iData]) : null;
          if (!dentroDoPeriodo(data, de, null)) continue;
          aplicacoes.push({
            email: iEmail >= 0 ? emailComparavel(linha[iEmail]) : "",
            data,
            utmSource: (iSource >= 0 ? sanitizarUtm(linha[iSource]) : null) ?? "",
            utmMedium: (iMedium >= 0 ? sanitizarUtm(linha[iMedium]) : null) ?? "",
          });
        }
      } catch (erro) {
        // Uma aba ilegível não pode derrubar o dashboard inteiro: o time
        // precisa ver o que deu certo E saber o que faltou.
        fastify.log.warn({ erro, sheet: s.sheetName }, "aba de aplicacao ilegivel");
        avisos.push(`Não consegui ler a aba "${s.sheetName}" de aplicações.`);
      }
    }

    // ---- vendas: só as planilhas escolhidas ----
    const ids = await escolhidas(p.data.stageId);
    const vendas: VendaDaAplicacao[] = [];

    if (ids.length === 0) {
      avisos.push(
        "Nenhuma planilha de venda escolhida — escolha em Configurar fontes para ver as vendas.",
      );
    } else {
      const fontes = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(inArray(stageSalesSpreadsheets.id, ids));

      for (const f of fontes) {
        try {
          const dados = await readSheetData(f.spreadsheetId, f.sheetName);
          const m = (f.columnMapping ?? {}) as Record<string, string | undefined>;
          const iEmail = coluna(dados.headers, m.email, /e-?mail/i);
          const iValor = coluna(dados.headers, m.valorBruto, /valor|bruto|pre[çc]o|total/i);
          const iData = coluna(dados.headers, m.dataVenda, /data|criad|pago|timestamp/i);
          const iTx = coluna(dados.headers, m.transactionId, /transa|order|pedido|\bid\b/i);
          const iSource = coluna(dados.headers, m.utm_source, /utm[_ ]?source|(^|\W)s=/i);
          const iMedium = coluna(dados.headers, m.utm_medium, /utm[_ ]?medium|(^|\W)m=/i);

          dados.rows.forEach((linha, indice) => {
            const data = iData >= 0 ? dataDaCelula(linha[iData]) : null;
            if (!dentroDoPeriodo(data, de, null)) return;
            vendas.push({
              email: iEmail >= 0 ? emailComparavel(linha[iEmail]) : "",
              valor: iValor >= 0 ? valorEmReais(linha[iValor]) : 0,
              utmSource: (iSource >= 0 ? sanitizarUtm(linha[iSource]) : null) ?? "",
              utmMedium: (iMedium >= 0 ? sanitizarUtm(linha[iMedium]) : null) ?? "",
              data,
              chave: dedupKey(f.id, indice, iTx >= 0 ? linha[iTx] : null),
            });
          });
        } catch (erro) {
          fastify.log.warn({ erro, sheet: f.sheetName }, "aba de vendas ilegivel");
          avisos.push(`Não consegui ler a aba "${f.sheetName}" de vendas.`);
        }
      }
    }

    return {
      periodo: { days: q.data.days ?? null, desde: de?.toISOString().slice(0, 10) ?? null },
      resumo: resumir(aplicacoes, vendas),
      fontes: { aplicacoes: minhas.length, vendas: ids.length },
      avisos,
    };
  });
});
