/**
 * Story 41.12 — a camada 2 (mesma pessoa + mesmo produto conta uma vez) nas
 * leituras de planilha do painel de lançamento: `GET …/sales-data` (card),
 * `GET …/sales-data-daily` (gráfico diário) e a réplica `sales-daily-sync`.
 *
 * Por que um módulo e não um laço em cada rota: as três leituras precisam
 * decidir a MESMA sobrevivente para a mesma planilha — senão o gráfico diário
 * soma uma recompra que o card tirou. Aqui mora só o UNIVERSO de linhas que
 * disputam a vaga; a chave é a da função única
 * (`utils/dedup-pessoa-produto.ts`), que nenhuma ponta redefine.
 *
 * O universo é a planilha INTEIRA, sem o recorte de `days`: a sobrevivente é
 * decidida antes do corte (decisão de escopo da 41.12, a mesma do Resumão e do
 * Debriefing) — a venda ganha um dia, o da primeira linha, e uma recompra
 * dentro da janela cuja primeira compra ficou fora dela não volta a contar.
 *
 * Quem disputa a vaga (as linhas que o card conta como venda):
 * - e-mail preenchido (o card ignora linha sem e-mail; sem e-mail nunca colapsa);
 * - status que não é reembolso/chargeback, e transação que não foi reembolsada
 *   em nenhuma das planilhas lidas (o card cruza os IDs reembolsados de todas);
 * - camada 1 por planilha: mesmo `(transactionId, produto)` conta uma vez (a
 *   mesma chave inline do card — `stage-sales-data.ts`); a gêmea de uma
 *   recompra sai junto com ela;
 * - valor bruto > 0 — linha de valor zero não é venda paga e não disputa a vaga
 *   (`isenta`), como no Resumão, que nem a lê.
 *
 * Planilha sem `productName` mapeado: as linhas dela não colapsam nem ocupam a
 * chave (com produto sempre `""`, ingresso e bump da mesma pessoa colapsariam)
 * e ela volta em `planilhasSemProduto`.
 *
 * Vendas manuais entram DEPOIS das planilhas (a planilha vence por vir antes),
 * em ordem de `saleDate` — a ordem do banco não é garantida, a data é.
 */

import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";
import { deduplicarPorPessoaEProduto } from "../utils/dedup-pessoa-produto.js";

/**
 * PONTO ÚNICO do escopo da camada 2 por tipo de etapa (Story 41.12).
 *
 * Pendente com o dono (gate da parte A): se a regra vale nas etapas de Vendas
 * (`sales` — a recompra do principal pode ser 2ª matrícula/renovação, OWN-003)
 * e na captação de evento presencial (`event_capture` — a 2ª compra do mesmo
 * ingresso pode ser para outra pessoa, OWN-002). Até a resposta, a regra vale em
 * todas as etapas de lançamento: o conjunto está vazio.
 *
 * Tirar um tipo de etapa da regra = acrescentá-lo aqui. As quatro leituras de
 * lançamento — card (`sales-data`), gráfico diário (`sales-data-daily`),
 * réplica (`sales-daily-sync`) e Resumão (`launch-report-loader`) — consultam
 * `camada2ValeNaEtapa` e obedecem juntas. O Debriefing (49.3) não passa por
 * aqui: a regra dele é a da skill e vale em toda etapa.
 */
export const ETAPAS_SEM_CAMADA2: ReadonlySet<string> = new Set<string>();

/** `true` = a camada 2 age nas vendas desta etapa. Ver `ETAPAS_SEM_CAMADA2`. */
export function camada2ValeNaEtapa(stageType: string | null | undefined): boolean {
  return !stageType || !ETAPAS_SEM_CAMADA2.has(stageType);
}

export interface PlanilhaParaCamada2 {
  /** Identificador estável da planilha no request (o `id` do vínculo). */
  chave: string;
  /** Rótulo para o aviso de planilha sem produto. */
  nome: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  mapping: {
    email?: string;
    transactionId?: string;
    productName?: string;
    valorBruto?: string;
    status?: string;
  };
  /**
   * `true` = as linhas desta planilha nunca colapsam (ex.: a planilha do
   * perpétuo herdada pela réplica, cuja camada 2 é por janela — fatia B).
   */
  isenta?: boolean;
}

export interface VendaManualParaCamada2 {
  /** Identificador estável da venda manual (`manual_sales.id`). */
  id: string;
  email: string | null;
  product: string | null;
  valor: number;
  saleDate: Date | null;
}

interface Candidato {
  ref: string;
  /** Linhas que a camada 1 colapsou nesta (mesmo ID + produto): saem junto. */
  gemeas: string[];
  email: string;
  produto: string;
  bruto: number;
  isenta: boolean;
}

export interface DecisaoCamada2 {
  /**
   * Refs das linhas que saem: `"<chave da planilha>|<índice da linha>"` e
   * `"manual|<id>"`.
   */
  removidas: Set<string>;
  /** Planilhas lidas sem `productName` mapeado (a camada 2 não age nelas). */
  planilhasSemProduto: string[];
  /** `true` = o tipo da etapa está fora da regra (`camada2ValeNaEtapa`). */
  naoValeNaEtapa?: boolean;
}

/** Ref de uma linha de planilha — a mesma que as rotas guardam ao ler a linha. */
export function refDaLinha(chavePlanilha: string, indiceDaLinha: number): string {
  return `${chavePlanilha}|${indiceDaLinha}`;
}

/** Ref de uma venda manual. */
export function refDaManual(id: string): string {
  return `manual|${id}`;
}

/**
 * Decide, sobre as planilhas inteiras (e as vendas manuais, se houver), quais
 * linhas são recompra do mesmo produto pela mesma pessoa.
 *
 * Pura. `parseValor` é o parser da rota que chama — o universo usa a mesma
 * leitura de valor que o card soma. `opcoes.valeNaEtapa === false` (o
 * `camada2ValeNaEtapa` da etapa) = nada sai.
 */
export function decidirCamada2DasPlanilhas(
  planilhas: readonly PlanilhaParaCamada2[],
  parseValor: (celula: string | undefined) => number,
  manuais: readonly VendaManualParaCamada2[] = [],
  opcoes: { valeNaEtapa?: boolean } = {},
): DecisaoCamada2 {
  if (opcoes.valeNaEtapa === false) {
    return { removidas: new Set(), planilhasSemProduto: [], naoValeNaEtapa: true };
  }
  const col = (headers: readonly string[], nome: string | undefined) =>
    nome ? headers.indexOf(nome) : -1;

  // IDs reembolsados em QUALQUER planilha lida — mesma regra do card.
  const reembolsadas = new Set<string>();
  for (const p of planilhas) {
    const statusIdx = col(p.headers, p.mapping.status);
    const txIdx = col(p.headers, p.mapping.transactionId);
    if (statusIdx === -1 || txIdx === -1) continue;
    for (const row of p.rows) {
      if (isRefundBucket(classifyRefundStatus(row[statusIdx], true))) {
        const tx = (row[txIdx] ?? "").trim();
        if (tx) reembolsadas.add(tx);
      }
    }
  }

  const candidatos: Candidato[] = [];
  const planilhasSemProduto: string[] = [];

  for (const p of planilhas) {
    const emailIdx = col(p.headers, p.mapping.email);
    if (emailIdx === -1) continue;
    const txIdx = col(p.headers, p.mapping.transactionId);
    const produtoIdx = col(p.headers, p.mapping.productName);
    const brutoIdx = col(p.headers, p.mapping.valorBruto);
    const statusIdx = col(p.headers, p.mapping.status);
    const semProduto = produtoIdx === -1;
    if (semProduto && !p.isenta) planilhasSemProduto.push(p.nome);

    const representante = new Map<string, Candidato>();
    p.rows.forEach((row, i) => {
      const email = (row[emailIdx] ?? "").trim().toLowerCase();
      if (!email) return;
      if (statusIdx !== -1 && isRefundBucket(classifyRefundStatus(row[statusIdx], true))) return;
      const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
      if (txId && reembolsadas.has(txId)) return;
      const produto = produtoIdx !== -1 ? (row[produtoIdx] ?? "").trim() : "";
      const k = txId ? `${txId}|${produto.toLowerCase()}` : null;
      const ja = k ? representante.get(k) : undefined;
      if (ja) {
        // Retry do gateway: é a MESMA venda. Não disputa a vaga, mas, se a
        // representante for recompra, sai com ela — quem lê sem a camada 1
        // (o gráfico diário) não soma a gêmea no lugar.
        ja.gemeas.push(refDaLinha(p.chave, i));
        return;
      }
      const bruto = parseValor(row[brutoIdx] ?? "");
      const c: Candidato = {
        ref: refDaLinha(p.chave, i),
        gemeas: [],
        email,
        produto,
        bruto,
        isenta: !!p.isenta || semProduto || bruto <= 0,
      };
      if (k) representante.set(k, c);
      candidatos.push(c);
    });
  }

  const ordenadas = [...manuais].sort((a, b) => {
    const ta = a.saleDate ? a.saleDate.getTime() : Number.POSITIVE_INFINITY;
    const tb = b.saleDate ? b.saleDate.getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  for (const m of ordenadas) {
    candidatos.push({
      ref: refDaManual(m.id),
      gemeas: [],
      email: (m.email ?? "").trim().toLowerCase(),
      produto: (m.product ?? "").trim(),
      bruto: m.valor,
      isenta: m.valor <= 0,
    });
  }

  const { removidas } = deduplicarPorPessoaEProduto(
    candidatos,
    (c) => ({ email: c.email, produto: c.produto }),
    (c) => c.isenta,
  );
  return {
    removidas: new Set(removidas.flatMap((c) => [c.ref, ...c.gemeas])),
    planilhasSemProduto,
  };
}

/**
 * O campo de transparência do painel (AC8 da 41.12): o que a camada 2 tirou do
 * período e, se não agiu em alguma planilha, por quê. ADITIVO e opcional no
 * contrato — o web antigo o ignora, o novo não exige.
 */
export interface DedupPessoaProduto {
  aplicada: boolean;
  removidas: { linhas: number; valor: number };
  naoAplicadaMotivo?: string;
}

export function resumoDedupPessoaProduto(
  decisao: DecisaoCamada2,
  totalDePlanilhas: number,
  removidasNoPeriodo: { linhas: number; valor: number },
): DedupPessoaProduto {
  if (decisao.naoValeNaEtapa) {
    return {
      aplicada: false,
      removidas: { linhas: 0, valor: 0 },
      naoAplicadaMotivo: "a regra não vale neste tipo de etapa",
    };
  }
  const sem = decisao.planilhasSemProduto;
  const aplicada = sem.length === 0 || sem.length < totalDePlanilhas;
  return {
    aplicada,
    removidas: {
      linhas: removidasNoPeriodo.linhas,
      valor: Math.round(removidasNoPeriodo.valor * 100) / 100,
    },
    ...(sem.length > 0
      ? {
          naoAplicadaMotivo:
            `coluna de produto não mapeada em ${sem.map((n) => `"${n}"`).join(", ")} — ` +
            "as recompras do mesmo produto pela mesma pessoa dessa planilha seguem somadas",
        }
      : {}),
  };
}
