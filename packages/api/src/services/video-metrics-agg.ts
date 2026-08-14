// ============================================================
// Story 43.2 — soma das métricas de vídeo por período.
//
// O `/creatives` público agrega linhas DIÁRIAS de `meta_ad_insights_daily` por
// anúncio. Impressões, cliques e investimento eram somados pelos N dias; o
// `videoMetrics` não era — pegava o primeiro dia com valor e descartava o resto:
//
//   accumulate(acc, row);                       // soma
//   if (row.videoMetrics && !acc.videoMetrics)  // pega UM dia
//     acc.videoMetrics = row.videoMetrics;
//
// O resultado era uma razão com numerador de 1 dia e denominador de N dias:
// num período de 30 dias, qualquer taxa de retenção saía ~30× menor. Medido em
// produção: 42–86% dos criativos com p25÷impressões abaixo de 1%.
//
// Pior que o número feio era o ranking: ordenar criativo por retenção usando um
// valor que depende de qual dia veio primeiro no ORDER BY é ordenar por acaso.
// ============================================================

/**
 * Soma as métricas de vídeo de várias linhas diárias numa só.
 *
 * Recebe `unknown[]` de propósito: a coluna `video_metrics` é `jsonb` sem
 * `$type<>` no schema (`schema.ts:1992`), então o que chega do banco não tem
 * garantia de forma. Validar aqui é mais honesto que fingir um cast.
 *
 * **Soma todas as chaves numéricas encontradas**, em vez de uma lista fixa de
 * campos. Hoje são `{p25, p50, p75, p100, thruplay}`; a Story 43.3 acrescenta
 * `views3s` e `plays`, e com soma dinâmica ela não precisa tocar nesta função —
 * nem corre o risco de acrescentar um campo que silenciosamente não soma.
 *
 * Devolve `null` quando nenhuma linha tem vídeo. **Não devolve zeros:** "este
 * anúncio não é vídeo" e "este vídeo não teve retenção" são coisas diferentes, e
 * `{0,0,0,0,0}` apaga a distinção — que é justamente o tipo de erro que esta
 * story existe para corrigir.
 */
export function somarVideoMetrics(linhas: unknown[]): Record<string, number> | null {
  const soma: Record<string, number> = {};
  let temAlgum = false;

  for (const linha of linhas) {
    if (!linha || typeof linha !== "object" || Array.isArray(linha)) continue;

    let contribuiu = false;
    for (const [chave, valor] of Object.entries(linha as Record<string, unknown>)) {
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      soma[chave] = (soma[chave] ?? 0) + valor;
      contribuiu = true;
    }
    if (contribuiu) temAlgum = true;
  }

  return temAlgum ? soma : null;
}
