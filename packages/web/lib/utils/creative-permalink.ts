/**
 * Story 29.63 — o link do CRIATIVO (o post publicado), não o destino do clique.
 *
 * ## Por que isto existe
 *
 * A coluna "Link" do Detalhamento apontava para `creative.linkUrl`, que é a
 * **landing page de destino** (resolvida na 29.40 a partir de
 * `object_story_spec`). Ela nunca foi o criativo — daí o relato do gestor de que
 * "o link não abre o anúncio". A causa não era dado faltando: era campo errado.
 *
 * ## A cascata
 *
 * 1. **Instagram** (`igPermalinkUrl`) — `https://www.instagram.com/p/{code}/`.
 *    É o link que o anunciante reconhece, e o que ele pediu. Cobertura medida
 *    em 2026-08-26: BBE 150/150, PP 120/125 (96,0%), Lyrio 54/56 (96,4%).
 * 2. **Facebook** (`adPermalinkUrl`) — montado do `effective_object_story_id`
 *    pela 36.8. Cobre **100%** nas mesmas contas, e é por isso que ele fecha o
 *    buraco de ~4% em vez de deixá-lo virar "—".
 * 3. **`null`** — a UI mostra "—", nunca um href vazio.
 *
 * A ordem importa e não é arbitrária: os dois campos costumam existir juntos,
 * então inverter a precedência não quebraria teste nenhum de cobertura — só
 * entregaria silenciosamente o link errado. É o que o teste desta função prende.
 *
 * Vive em `lib/utils` (e não junto do hook) porque é lógica pura e é aqui que o
 * runner de teste do `packages/web` enxerga (ver `vitest.config.ts`).
 */

/** Só o que a cascata precisa ler — evita arrastar o tipo inteiro do criativo. */
export interface CreativeComPermalink {
  igPermalinkUrl?: string | null;
  adPermalinkUrl?: string | null;
}

export function creativePermalink(
  c: CreativeComPermalink | null | undefined,
): string | null {
  return c?.igPermalinkUrl || c?.adPermalinkUrl || null;
}
