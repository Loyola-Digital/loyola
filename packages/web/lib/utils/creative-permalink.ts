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

/**
 * Story 29.66 (QA-66-01) — a mesma cascata, para o payload da rota
 * `/creative-video/:adId`.
 *
 * ## Por que isto não é só um `creativePermalink(video)`
 *
 * A rota chama o permalink do Facebook de **`permalinkUrl`**; o criativo o chama
 * de **`adPermalinkUrl`**. Passar o objeto da rota direto para
 * `creativePermalink` compila sem reclamação — os dois campos da interface são
 * **opcionais**, então um objeto sem `adPermalinkUrl` é válido para o
 * compilador — e devolve `null` justamente para os anúncios que só têm post no
 * Facebook: os ~4% medidos na 29.63 (PP 5 de 125, Lyrio 2 de 56).
 *
 * O resultado é a perda silenciosa de um link que existe e funciona. Foi o que o
 * gate pegou, e o `tsc` não pegou.
 *
 * Esta função existe para que a tradução entre os dois formatos aconteça **num
 * lugar só, com nome, e presa por teste** — em vez de um objeto literal montado
 * na chamada, que o próximo consumidor teria de lembrar de repetir.
 */
export interface PermalinksDaRotaDeVideo {
  /** Permalink do post no Facebook — a rota chama assim (36.8). */
  permalinkUrl?: string | null;
  /** Permalink do post no Instagram (29.63). */
  igPermalinkUrl?: string | null;
}

export function permalinkDaRotaDeVideo(
  v: PermalinksDaRotaDeVideo | null | undefined,
): string | null {
  return creativePermalink({
    igPermalinkUrl: v?.igPermalinkUrl,
    adPermalinkUrl: v?.permalinkUrl,
  });
}

/**
 * Story 29.66 — a rede social de um permalink, para o rótulo do botão.
 *
 * ## Por que o rótulo não pode ser fixo
 *
 * Três telas diziam **"Assistir no Facebook"** com o texto escrito no código.
 * Trocar só a URL para a cascata acima faria o botão afirmar um destino e
 * entregar outro — e não em teoria: **~4% dos anúncios não têm post no
 * Instagram** (PP 5 de 125, Lyrio 2 de 56, medido em 2026-08-26) e caem
 * legitimamente no Facebook.
 *
 * Um texto fixo estará errado numa das duas pontas, sempre. Por isso o rótulo
 * sai da URL resolvida, e sai de um lugar só.
 *
 * `null` quando não há link: quem consome não renderiza botão nenhum, em vez de
 * oferecer um que não leva a lugar algum.
 */
export type RedeDoPermalink = "instagram" | "facebook" | null;

export function redeDoPermalink(url: string | null | undefined): RedeDoPermalink {
  if (!url) return null;
  // Casa pelo HOST, não por `includes` na string inteira: uma landing page
  // chamada `meusite.com/curso-de-instagram` casaria por substring e mandaria o
  // rótulo errado. O host é o que de fato decide para onde o clique vai.
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
  return null;
}

/**
 * Story 29.66 — o texto do botão que oferece o post como alternativa ao player.
 *
 * O verbo é "Assistir" porque estes botões são o fallback de quem não conseguiu
 * ver o vídeo tocar — e o post do Instagram toca o Reels.
 */
export function rotuloDoPermalink(url: string | null | undefined): string | null {
  const rede = redeDoPermalink(url);
  if (rede === "instagram") return "Assistir no Instagram";
  if (rede === "facebook") return "Assistir no Facebook";
  // URL de host desconhecido existe (nunca vimos, mas o dado vem da Meta):
  // melhor um rótulo genérico e honesto que afirmar a rede errada.
  return url ? "Assistir ao criativo" : null;
}
