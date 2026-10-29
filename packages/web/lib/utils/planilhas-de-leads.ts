/**
 * Story 18.100 — uma etapa com VÁRIAS planilhas de leads.
 *
 * ## O defeito
 *
 * A Captação Gratuita do dg-bf26 tem duas planilhas `leads`: a do formulário da
 * LP (`n8n-leads-captacao`) e a do Lead Form da Meta (`facebook-lead-form`). Os
 * sete pontos de leitura pegavam só a primeira (`find(type === "leads")`), então
 * o investimento das campanhas de Lead Form entrava na etapa e os leads delas
 * não: o CPL saía inflado, sem aviso.
 *
 * ## O que este módulo faz
 *
 * - `escolherPlanilhasDeLeads` / `planilhasDeLeadsDaEtapa`: a regra ÚNICA de
 *   escolha (AC2), em ordem determinística (`createdAt`, `id`).
 * - `unirPlanilhasDeLeads`: a união do `named` que a rota `/data` devolve
 *   (pontos 1, 2, 3 e 5). Concatena, com índice único na lista unida, e tira o
 *   prefixo de id do Lead Form (`semPrefixoDeId`, AC4a). Não deduplica: cada
 *   contador segue deduplicando como já fazia (AC3, P-5 opção b).
 * - `unirAbasCruasDeLeads`: a união das abas CRUAS no layout comum (ponto 4,
 *   que conta por índice de coluna), cada uma pelo seu `column_mapping` (AC4d).
 *
 * A data não é tratada aqui: `normaliseDate` já leva instante com fuso ao dia
 * de São Paulo (AC5), para qualquer planilha.
 */

import type {
  ColumnMapping,
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
  FunnelSpreadsheetRow,
} from "@/lib/types/funnel-spreadsheet";
import { semPrefixoDeId } from "@loyola-x/shared/src/utm-value";
import {
  remapearParaLayoutComum,
  type CampoDoLayoutComum,
} from "@loyola-x/shared/src/layout-comum";

type PlanilhaParaOrdenar = Pick<FunnelSpreadsheet, "id" | "createdAt">;

/** A ordem da união (AC2): `createdAt` crescente, `id` como desempate. */
export function ordemDaUniao(a: PlanilhaParaOrdenar, b: PlanilhaParaOrdenar): number {
  const ta = Date.parse(a.createdAt ?? "");
  const tb = Date.parse(b.createdAt ?? "");
  const da = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const db = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  if (da !== db) return da < db ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * As planilhas `leads` da etapa, na ordem da união. Sem fallback: é o que usam
 * o ponto 4 (que cai em `sales`) e o ponto 5 (que não tem fallback).
 */
export function planilhasDeLeadsDaEtapa(
  planilhas: FunnelSpreadsheet[] | null | undefined,
): FunnelSpreadsheet[] {
  if (!planilhas) return [];
  return planilhas.filter((p) => p.type === "leads").sort(ordemDaUniao);
}

/**
 * As planilhas de onde saem os leads da etapa (pontos 1, 2 e 3): todas as
 * `leads`, na ordem da união; sem nenhuma, a primeira vinculada, como hoje (as
 * etapas de perpétuo só têm a de vendas). Mesma escolha no Top Criativos e no
 * Desempenho de Criativos — é o que faz os números baterem (18.89).
 */
export function escolherPlanilhasDeLeads(
  planilhas: FunnelSpreadsheet[] | null | undefined,
): FunnelSpreadsheet[] {
  const deLeads = planilhasDeLeadsDaEtapa(planilhas);
  if (deLeads.length > 0) return deLeads;
  const primeira = planilhas?.[0];
  return primeira ? [primeira] : [];
}

/** A escolha caiu no fallback (etapa sem planilha `leads`)? */
export function ehFallbackSemLeads(escolhidas: Pick<FunnelSpreadsheet, "type">[]): boolean {
  return escolhidas.length === 1 && escolhidas[0].type !== "leads";
}

/** As colunas em que a integração do Lead Form põe prefixo no id (AC4a). */
const COLUNAS_COM_PREFIXO_DE_ID = ["utm_campaign", "utm_medium", "utm_content"] as const;

/** A linha com o prefixo de id tirado de cada coluna (AC4a). Não muta a entrada. */
export function linhaSemPrefixoDeId(row: FunnelSpreadsheetRow): FunnelSpreadsheetRow {
  let named = row.named;
  for (const coluna of COLUNAS_COM_PREFIXO_DE_ID) {
    const valor = named[coluna];
    if (typeof valor !== "string") continue;
    const limpo = semPrefixoDeId(coluna, valor);
    if (limpo !== valor) named = { ...named, [coluna]: limpo };
  }
  return named === row.named ? row : { ...row, named };
}

/** Uma planilha escolhida e os dados dela (ausentes enquanto carregam). */
export interface PlanilhaComDados {
  planilha: Pick<FunnelSpreadsheet, "id" | "type">;
  dados: FunnelSpreadsheetData | undefined;
}

/**
 * A união das planilhas de leads, no formato que os contadores já leem.
 *
 * - Ordem: a recebida (quem escolhe já ordenou, AC2). Índice único na lista
 *   unida: a posição na concatenação (AC3).
 * - `mapping`: um campo conta como mapeado se ALGUMA planilha o mapeia (AC6). A
 *   linha da planilha que não o mapeia chega com a célula vazia e cai onde uma
 *   célula vazia cai hoje.
 * - `headers` e `values` seguem o layout de cada planilha. Numa união de duas ou
 *   mais, `headers` vem vazio: só o `named` é comum, e nenhum contador destes
 *   pontos lê `values` por índice.
 * - Devolve `undefined` enquanto alguma planilha não carregou: número parcial
 *   na tela seria pior que o carregando.
 * - Fallback (etapa sem `leads`): a planilha volta intacta, como hoje (AC6).
 */
export function unirPlanilhasDeLeads(
  fontes: readonly PlanilhaComDados[],
): FunnelSpreadsheetData | undefined {
  if (fontes.length === 0) return undefined;
  if (fontes.some((f) => !f.dados)) return undefined;
  const dados = fontes.map((f) => f.dados as FunnelSpreadsheetData);
  if (ehFallbackSemLeads(fontes.map((f) => f.planilha))) return dados[0];

  const mapping: ColumnMapping = {};
  for (const d of dados) {
    for (const [campo, coluna] of Object.entries(d.mapping ?? {}) as [keyof ColumnMapping, string | undefined][]) {
      if (coluna && !mapping[campo]) mapping[campo] = coluna;
    }
  }

  return {
    headers: dados.length === 1 ? dados[0].headers : [],
    rows: dados.flatMap((d) => d.rows.map(linhaSemPrefixoDeId)),
    mapping,
    totalRows: dados.reduce((soma, d) => soma + (d.totalRows ?? d.rows.length), 0),
  };
}

// ---- Ponto 4: as abas cruas no layout comum (AC4d) -----------------------

/** Cabeçalhos que a busca de hoje do ponto 4 reconhece (`contagem-de-leads.ts`). */
const CABECALHOS_DE_CONTEUDO = ["content", "utm_content", "co="] as const;
const CABECALHOS_DE_TERMO = ["utm_term", "term", "t="] as const;
const CABECALHOS_DE_ORIGEM = ["source", "utm_source"] as const;
const CABECALHOS_DE_AD_NAME = ["ad name", "ad_name", "adname", "nome do anúncio", "nome do anuncio"] as const;

/**
 * Os campos do ponto 4, com os nomes canônicos que `contarLeadsDaPlanilha` já
 * reconhece por cabeçalho — assim o contador não muda.
 *
 * - `date`: SÓ pelo mapeamento (C-T0-3). Planilha sem `date` mapeada chega com
 *   a data vazia, mesmo que tenha uma coluna chamada `data`.
 * - conteúdo e termo: mapeamento; senão a busca de hoje, com a reserva 5/7.
 * - origem: mapeamento; senão a busca de hoje (sem reserva, como hoje).
 * - "Ad Name": não tem chave no mapeamento; só a busca de hoje.
 */
export const CAMPOS_DO_PONTO_4: readonly CampoDoLayoutComum[] = [
  { campo: "date" },
  { campo: "utm_content", cabecalhos: CABECALHOS_DE_CONTEUDO, reserva: 5 },
  { campo: "utm_term", cabecalhos: CABECALHOS_DE_TERMO, reserva: 7 },
  { campo: "utm_source", cabecalhos: CABECALHOS_DE_ORIGEM },
  { campo: "ad name", semMapeamento: true, cabecalhos: CABECALHOS_DE_AD_NAME },
];

/**
 * Os campos do mapa ad_id → Ad Name e da coleta de ad_ids para os nomes da
 * Meta: os mesmos, SEM a reserva por posição — essas duas leituras nunca usaram
 * a reserva (sem cabeçalho de conteúdo, não liam nada).
 */
export const CAMPOS_DOS_NOMES: readonly CampoDoLayoutComum[] = [
  { campo: "utm_content", cabecalhos: CABECALHOS_DE_CONTEUDO },
  { campo: "ad name", semMapeamento: true, cabecalhos: CABECALHOS_DE_AD_NAME },
];

/** Uma aba crua com o `column_mapping` da planilha. */
export interface AbaCruaDeLeads {
  headers: string[];
  rows: string[][];
  columnMapping: ColumnMapping | null | undefined;
}

/** As abas unidas no layout comum, e a coluna de data a passar ao contador. */
export interface AbasUnidas {
  headers: string[];
  rows: string[][];
  /**
   * `"date"` quando alguma planilha mapeia `date` (mesmo que o cabeçalho tenha
   * sumido: aí o contador marca "coluna ausente" e não recorta, como hoje).
   */
  colunaDeData: string | null;
}

/**
 * As abas cruas de N planilhas `leads`, cada uma pelo seu `column_mapping`,
 * concatenadas no layout comum, com o prefixo de id do anúncio tirado (AC4a).
 */
export function unirAbasCruasDeLeads(
  abas: readonly AbaCruaDeLeads[],
  campos: readonly CampoDoLayoutComum[],
): AbasUnidas {
  const unida = remapearParaLayoutComum(
    abas.map((a) => ({
      headers: a.headers ?? [],
      rows: a.rows ?? [],
      mapeamento: (a.columnMapping ?? null) as Record<string, string | undefined> | null,
    })),
    campos,
  );
  const prefixadas = COLUNAS_COM_PREFIXO_DE_ID.map((c) => [c, unida.headers.indexOf(c)] as const).filter(
    ([, i]) => i >= 0,
  );
  const rows =
    prefixadas.length === 0
      ? unida.rows
      : unida.rows.map((row) => {
          const nova = [...row];
          for (const [coluna, i] of prefixadas) nova[i] = semPrefixoDeId(coluna, nova[i] ?? "");
          return nova;
        });
  const algumaMapeiaData = abas.some((a) => !!a.columnMapping?.date?.trim());
  return { headers: unida.headers, rows, colunaDeData: algumaMapeiaData ? "date" : null };
}
