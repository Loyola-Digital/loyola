/**
 * Story 18.100 (AC4d, AC7) — várias planilhas de leads num LAYOUT COMUM.
 *
 * ## O problema
 *
 * Cada planilha tem o seu `column_mapping`: a do formulário da LP guarda o
 * anúncio em `content`, a do Lead Form em `ad_id`. Quem lê a aba crua por
 * ÍNDICE (o Desempenho por LP no web, os pontos 6 e 7 na API) não pode
 * simplesmente concatenar as linhas: a coluna 5 de uma é o anúncio, a da outra
 * é o nome do conjunto. O número sai errado sem erro nenhum.
 *
 * ## A regra
 *
 * Cada fonte é lida pelo SEU mapeamento e devolvida com cabeçalhos canônicos
 * (o próprio nome do campo). Para cada campo pedido, a coluna da fonte é:
 *
 * 1. a do `column_mapping`, quando o campo está mapeado (mapeado mas ausente do
 *    cabeçalho → célula vazia, como a rota `/data` já faz);
 * 2. senão, a busca por cabeçalho de hoje (`cabecalhos`), quando o campo tem
 *    uma; a coluna "Ad Name" não tem chave no mapeamento (`semMapeamento`) e
 *    usa só essa busca;
 * 3. senão, a posição de reserva de hoje (`reserva`), quando o campo tem uma.
 *
 * Campo sem busca por cabeçalho (a data, por exemplo) vem SÓ do mapeamento:
 * planilha que não mapeia `date` chega com a data vazia, mesmo que tenha uma
 * coluna chamada `data` (C-T0-3).
 *
 * O campo só entra no layout se ALGUMA fonte tem coluna para ele. Assim, uma
 * planilha sozinha sem coluna de origem continua sem coluna de origem (e o
 * contador segue com o comportamento de hoje), e numa união a linha da
 * planilha que não tem o campo chega com a célula vazia.
 *
 * As linhas são concatenadas na ordem das fontes, com índice único na lista
 * unida (a posição na concatenação; nenhuma fonte reinicia em 0).
 *
 * ## Módulo folha, sem imports
 *
 * Mesmo desenho de `utm-value.ts` e pelo mesmo motivo (Story 19.14). O prefixo
 * de id (`semPrefixoDeId`) é aplicado por quem chama, depois do remapeamento:
 * importar `utm-value` daqui faria deste um módulo não folha.
 */

/** Um campo do layout comum e como achar a coluna dele em cada fonte. */
export interface CampoDoLayoutComum {
  /** Nome canônico: o cabeçalho no layout comum e a chave no `column_mapping`. */
  campo: string;
  /** Busca por cabeçalho (em minúsculas) quando o campo não está mapeado. */
  cabecalhos?: readonly string[];
  /** Posição de reserva quando nem o mapeamento nem o cabeçalho acham a coluna. */
  reserva?: number;
  /** Campo sem chave no `column_mapping` (a coluna "Ad Name"): só a busca por cabeçalho. */
  semMapeamento?: boolean;
}

/** Uma planilha crua com o seu `column_mapping`. */
export interface FonteDoLayoutComum {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  /** Nome do cabeçalho por campo. Nulo ou vazio = planilha sem mapeamento. */
  mapeamento?: Readonly<Record<string, string | null | undefined>> | null;
}

/** As fontes concatenadas no layout comum. */
export interface PlanilhaNoLayoutComum {
  /** Os campos que alguma fonte tem, na ordem pedida. */
  headers: string[];
  rows: string[][];
  /** De qual fonte (índice na lista recebida) veio cada linha. */
  fonteDaLinha: number[];
}

const normalizar = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/** A coluna de um campo numa fonte, pelas regras (1) a (3); `-1` = sem coluna. */
export function colunaDoCampo(fonte: FonteDoLayoutComum, campo: CampoDoLayoutComum): number {
  const cabecalhos = fonte.headers.map(normalizar);
  const mapeado = campo.semMapeamento ? undefined : fonte.mapeamento?.[campo.campo];
  if (mapeado && mapeado.trim()) return cabecalhos.indexOf(normalizar(mapeado));
  if (campo.cabecalhos) {
    const i = cabecalhos.findIndex((h) => campo.cabecalhos!.includes(h));
    if (i >= 0) return i;
  }
  return campo.reserva ?? -1;
}

/**
 * As fontes, cada uma pelo seu mapeamento, concatenadas no layout comum.
 * Não muta as fontes.
 */
export function remapearParaLayoutComum(
  fontes: readonly FonteDoLayoutComum[],
  campos: readonly CampoDoLayoutComum[],
): PlanilhaNoLayoutComum {
  const colunasPorFonte = fontes.map((fonte) => campos.map((campo) => colunaDoCampo(fonte, campo)));
  const presentes = campos
    .map((_, i) => i)
    .filter((i) => colunasPorFonte.some((colunas) => colunas[i] >= 0));

  const rows: string[][] = [];
  const fonteDaLinha: number[] = [];
  fontes.forEach((fonte, f) => {
    const colunas = colunasPorFonte[f];
    for (const row of fonte.rows) {
      rows.push(presentes.map((i) => (colunas[i] >= 0 ? String(row[colunas[i]] ?? "") : "")));
      fonteDaLinha.push(f);
    }
  });

  return { headers: presentes.map((i) => campos[i].campo), rows, fonteDaLinha };
}
