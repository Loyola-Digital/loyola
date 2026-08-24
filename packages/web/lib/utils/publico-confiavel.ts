// ============================================================
// Story 29.61 (AC7-bis) — a dimensão de público se recusa a afirmar quando
// não sabe.
//
// ## O defeito que isto impede
//
// A tabela por público sai de `classifyOrigem(utm_source)`, que procura o valor
// INTEIRO em `PAID_UTM_SOURCES` (`meta`, `facebook`, `google`…). Qualquer outra
// coisa cai em "Orgânico".
//
// Conferido em produção (2026-08-24): no funil `dg-a1`, **2.147 linhas**, a
// coluna mapeada como `utm_source` é **"Origem de Checkout"** e carrega a string
// SRC inteira:
//
//   "120223887235780208_meta_120223887235810208_..._[ADV][COLD][ASC][DGA1]"
//   "Linktree_Linktree_Linktree_direct_direct"
//
// Nenhuma casa. Um funil que é quase todo tráfego pago frio — a própria string
// diz `_meta_`, `[ADV]`, `[COLD]` — apareceria como **100% Orgânico**, com AOV e
// taxa de bump atribuídos a uma origem que não é a dele.
//
// O defeito de mapeamento já existia, calado. O que a Story 29.61 acrescentaria
// é uma tabela que AFIRMA — e ninguém desconfia de um número apresentado com
// essa cara.
//
// ## Por que não uma heurística de formato
//
// Dava para farejar underscores e IDs numéricos na string. Seria frágil e
// arbitrário: amanhã aparece um `utm_source` legítimo com underscore.
//
// O dashboard já sabe o que precisa para desmentir a si mesmo. Funil com
// campanha Meta vinculada e **investimento no período**, mas **zero comprador
// classificado como Pago**, não é um funil que vende só no orgânico gastando em
// anúncio — é uma classificação quebrada. É fato observado, não palpite sobre
// o formato de uma string.
//
// Mesmo mecanismo do §C.8 do relatório perpétuo, que recusa gerar quando há
// venda e o investimento é zero. Precedente do projeto.
//
// Em `lib/utils` porque é o único diretório que o runner do pacote executa.
// ============================================================

/** O que a tabela precisa expor para ser auditada. */
export interface PublicoAuditavel {
  publico: string;
  compradores: number;
}

export type DiagnosticoDePublico =
  | { confiavel: true }
  | { confiavel: false; motivo: string };

/**
 * Decide se a dimensão de público pode ser afirmada.
 *
 * @param publicos     as linhas que a tabela mostraria
 * @param investimento investimento do período (com imposto), do Meta
 */
export function diagnosticarPublico(
  publicos: PublicoAuditavel[] | null | undefined,
  investimento: number | null | undefined,
): DiagnosticoDePublico {
  // Sem linhas não há o que afirmar nem o que desmentir — o vazio é tratado
  // pela própria tabela, que não se renderiza.
  if (!publicos || publicos.length === 0) return { confiavel: true };

  const gastou = (investimento ?? 0) > 0;
  if (!gastou) {
    // Sem investimento, "zero comprador Pago" é a verdade, não um sintoma.
    return { confiavel: true };
  }

  const compradoresPagos = publicos
    .filter((p) => p.publico.startsWith("Pago"))
    .reduce((s, p) => s + p.compradores, 0);
  if (compradoresPagos > 0) return { confiavel: true };

  const total = publicos.reduce((s, p) => s + p.compradores, 0);
  return {
    confiavel: false,
    motivo:
      `Há investimento em anúncio no período e nenhum dos ${total} compradores ` +
      `foi classificado como tráfego pago. A coluna mapeada como utm_source ` +
      `provavelmente não contém uma UTM — verifique o mapeamento na aba Planilhas.`,
  };
}
