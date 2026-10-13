/**
 * A Kiwify entrando no dashboard de vendas como se fosse uma planilha.
 *
 * ## Por que assim, e não um segundo caminho de cálculo
 *
 * O agregador de vendas da etapa (`routes/stage-sales-data.ts`) tem ~1700
 * linhas: dedup por transação, classificação de origem por UTM, único vs total,
 * ingressos por dia, camada 2, contadores de descarte. Tudo isso consome uma
 * forma só — `{ headers, rows, mapping }` — e foi afinado contra dados reais ao
 * longo de dezenas de stories.
 *
 * Escrever um segundo agregador para a Kiwify criaria dois números para a mesma
 * pergunta, e um dia eles divergiriam: o jeito de descobrir seria alguém notar
 * que a etapa A e a etapa B contam diferente. Então a Kiwify vira uma planilha
 * virtual e entra pelo MESMO caminho — o que ela ganha não é um cálculo novo, é
 * um dado melhor na entrada.
 *
 * ## O que a Kiwify põe aqui que a planilha não tinha
 *
 * As UTMs. Medido em 13/10/2026 na conta DG & CPDF: 92,3% das 574 vendas de 30
 * dias já chegam com `utm_source` da própria Kiwify. É isso que faz a origem
 * das vendas parar de depender de alguém colar coluna na aba certa.
 *
 * Módulo puro: sem DB, sem rede.
 */

import type { kiwifySales } from "../db/schema.js";
import {
  classifyRefundStatus,
  isRefundBucket,
  isRevenueBucket,
} from "./sales-status.js";

type VendaDoCache = typeof kiwifySales.$inferSelect;

/**
 * Os cabeçalhos da planilha virtual.
 *
 * Nomes internos, nunca mostrados: o `mapping` abaixo aponta para eles, e o
 * agregador faz `headers.indexOf(mapping.campo)`. Ficam explícitos numa
 * constante para que mexer num nome quebre o `mapping` no mesmo arquivo, em vez
 * de devolver `-1` em silêncio lá no agregador — que é exatamente o modo de
 * falhar que esta integração existe para evitar.
 */
export const COLUNAS = [
  "email",
  "transactionId",
  "valorBruto",
  "valorLiquido",
  "formaPagamento",
  "canalOrigem",
  "utm_source",
  "utm_medium",
  "utm_term",
  "utm_content",
  "dataVenda",
  "productName",
  "status",
] as const;

/** O mapeamento que o agregador espera — identidade, por construção. */
export const MAPEAMENTO = Object.fromEntries(COLUNAS.map((c) => [c, c])) as Record<
  (typeof COLUNAS)[number],
  string
>;

/** Centavos → reais com duas casas, como a planilha escreveria. */
export function emReais(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  return (centavos / 100).toFixed(2);
}

/**
 * A data da venda no formato que o agregador já sabe ler (`aaaa-mm-dd`).
 *
 * Usa a data de APROVAÇÃO quando existe, senão a de criação. É a diferença
 * entre "o pix foi gerado" e "o dinheiro entrou": um boleto criado no dia 30 e
 * pago no dia 2 pertence ao dia 2, e contá-lo no 30 move faturamento para um
 * mês em que ele não aconteceu.
 */
export function dataDaVenda(v: VendaDoCache): string {
  const d = v.aprovadaEm ?? v.criadaEm;
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * O canal de origem: a própria `utm_source`, sem reinterpretar.
 *
 * ## Por que NÃO classificamos aqui
 *
 * O agregador já tem a classificação oficial (`classifyFonte`, com
 * `PAID_UTM_SOURCES`), e ela roda sobre a coluna `utm_source` que este módulo
 * preenche. Mapear canal aqui criaria uma segunda classificação da mesma venda,
 * e as duas JÁ divergiriam: `ig` não está em `PAID_UTM_SOURCES`, então o
 * agregador o conta como orgânico — correto, porque é link na bio (a venda real
 * medida traz `sck: "dgpg05_bio_ig_dgpg05-cap_org"`). Um mapa ingênuo aqui
 * diria "Meta Ads" e a mesma tela mostraria a venda como paga num lugar e
 * orgânica no outro.
 */
export function canalDaVenda(v: VendaDoCache): string {
  const s = (v.utmSource ?? "").trim();
  return s.length > 0 ? s : "Não informado";
}

/**
 * Esta venda tem o que fazer no agregador?
 *
 * Só a PAGA (vira receita) e o REEMBOLSO (que o agregador desconta). Recusada e
 * aguardando pagamento ficam fora.
 *
 * ## Por que o filtro mora aqui, e não lá
 *
 * `routes/stage-sales-data.ts` só trata o bucket de reembolso de forma
 * especial; `refused` e `waiting_payment` cairiam direto em receita. Medido na
 * conta DG & CPDF em 13/10/2026: das 574 vendas de 30 dias, **54 recusadas
 * (R$ 13.995,39) e 43 aguardando pagamento (R$ 3.823,10)** — R$ 17.818 de
 * faturamento que nunca existiu, 24% a mais.
 *
 * A planilha tem o mesmo problema (`isRevenueBucket` chegou nas rotas do
 * perpétuo pela Story 29.26 e não no lançamento), mas as abas que o time usa
 * costumam vir só com venda paga. Corrigir o agregador mudaria o número de toda
 * etapa de lançamento que já existe, sem ninguém pedir — então aqui a gente não
 * entrega o problema, e o agregador fica para uma decisão à parte.
 */
function entraNaConta(status: string | null): boolean {
  const bucket = classifyRefundStatus(status, true);
  return isRevenueBucket(bucket) || isRefundBucket(bucket);
}

/**
 * As vendas do cache como `{ headers, rows, mapping }`.
 *
 * Venda sem e-mail sai de fora: o agregador casa, deduplica e cruza com lead
 * por e-mail, e linha sem ele seria descartada mais adiante de qualquer forma —
 * mas contada como "pulada por e-mail vazio" num contador que fala de planilha.
 *
 * Os dois números de descarte voltam juntos: sumir com quase um quarto do
 * volume sem dizer quanto foi é o jeito errado de estar certo.
 */
export function vendasComoPlanilha(vendas: VendaDoCache[]): {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
  semEmail: number;
  /** Recusadas e aguardando pagamento. Ver `entraNaConta`. */
  naoSaoVenda: number;
} {
  const rows: string[][] = [];
  let semEmail = 0;
  let naoSaoVenda = 0;
  for (const v of vendas) {
    if (!entraNaConta(v.status)) {
      naoSaoVenda += 1;
      continue;
    }
    const email = (v.customerEmail ?? "").trim();
    if (!email) {
      semEmail += 1;
      continue;
    }
    rows.push([
      email,
      // O id da venda é a chave de dedup do agregador. É estável e único na
      // Kiwify, então a mesma venda nunca entra duas vezes nem some.
      v.saleId,
      emReais(v.brutoCentavos),
      emReais(v.liquidoCentavos),
      v.paymentMethod ?? "Não informado",
      canalDaVenda(v),
      v.utmSource ?? "",
      v.utmMedium ?? "",
      v.utmTerm ?? "",
      v.utmContent ?? "",
      dataDaVenda(v),
      v.productName ?? "",
      v.status ?? "",
    ]);
  }
  return { headers: [...COLUNAS], rows, mapping: MAPEAMENTO, semEmail, naoSaoVenda };
}
