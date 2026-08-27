import { describe, it, expect } from "vitest";
import {
  creativePermalink,
  redeDoPermalink,
  rotuloDoPermalink,
} from "@/lib/utils/creative-permalink";

/**
 * Story 29.63 (AC8) — o link do criativo.
 *
 * O defeito original: a coluna lia `creative.linkUrl`, que é a landing page de
 * destino. Um teste que só confirme "devolve o permalink quando ele existe"
 * continuaria verde com o bug de volta, porque nas fixtures os dois campos
 * existem. Por isso todo caso aqui carrega um `linkUrl` que **não pode** sair.
 */

/** LP de destino — presente em todos os casos, jamais é a resposta certa. */
const LP = "https://lp.exemplo.com.br/inscricao";
const IG = "https://www.instagram.com/p/Dcbk1PuM3Lh/";
const FB = "https://www.facebook.com/110471599611185/posts/1633365255457373";

describe("creativePermalink", () => {
  it("devolve o permalink do Instagram quando existe", () => {
    expect(creativePermalink({ igPermalinkUrl: IG, adPermalinkUrl: FB })).toBe(IG);
  });

  it("cai para o Facebook quando o Instagram não existe", () => {
    // Medido em 2026-08-26: 5 de 125 anúncios do PP e 2 de 56 do Lyrio estão
    // neste caso — todos `object_type: VIDEO`, e todos com o campo do Facebook.
    // Sem este degrau, essas linhas mostrariam "—" tendo link disponível.
    expect(creativePermalink({ igPermalinkUrl: null, adPermalinkUrl: FB })).toBe(FB);
    expect(creativePermalink({ adPermalinkUrl: FB })).toBe(FB);
  });

  it("devolve null quando nenhum dos dois existe", () => {
    // `null` e não `""`: a UI decide entre link e "—" com um if, e string vazia
    // produziria `href=""` — que recarrega a página em vez de não fazer nada.
    expect(creativePermalink({})).toBeNull();
    expect(creativePermalink(null)).toBeNull();
    expect(creativePermalink(undefined)).toBeNull();
  });

  it("string vazia não conta como link (a Meta às vezes devolve '')", () => {
    expect(creativePermalink({ igPermalinkUrl: "", adPermalinkUrl: FB })).toBe(FB);
    expect(creativePermalink({ igPermalinkUrl: "", adPermalinkUrl: "" })).toBeNull();
  });

  // ── Testes DIFERENCIAIS ────────────────────────────────────────────────
  // Estes falham se alguém reintroduzir o defeito. Os de cima, não.

  it("NUNCA devolve a landing page, mesmo sendo o único campo preenchido", () => {
    // Este é o defeito exato que a story corrigiu. Se a implementação voltar a
    // ler `linkUrl`, este caso devolve a LP e o teste quebra.
    const soDestino = { linkUrl: LP } as Parameters<typeof creativePermalink>[0];
    expect(creativePermalink(soDestino)).toBeNull();
  });

  it("prefere o post à landing page quando os dois existem", () => {
    const ambos = { igPermalinkUrl: IG, linkUrl: LP } as Parameters<
      typeof creativePermalink
    >[0];
    expect(creativePermalink(ambos)).toBe(IG);
    expect(creativePermalink(ambos)).not.toBe(LP);
  });

  it("a ordem Instagram → Facebook é fixa, não incidental", () => {
    // Os dois campos coexistem em ~96% dos anúncios, então inverter a
    // precedência não derrubaria nenhum teste de cobertura — entregaria o link
    // errado em silêncio. Este caso prende a ordem.
    expect(creativePermalink({ igPermalinkUrl: IG, adPermalinkUrl: FB })).not.toBe(FB);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Story 29.66 (AC7) — o rótulo do botão
// ═══════════════════════════════════════════════════════════════════════

describe("rotuloDoPermalink", () => {
  it("link do Instagram NUNCA produz um rótulo que diga Facebook", () => {
    // O defeito que esta story corrigiu: três telas tinham "Assistir no
    // Facebook" fixo no código. Trocar só a URL faria o botão mentir.
    const rotulo = rotuloDoPermalink(IG);
    expect(rotulo).toBe("Assistir no Instagram");
    expect(rotulo).not.toMatch(/facebook/i);
  });

  it("link do Facebook NUNCA produz um rótulo que diga Instagram", () => {
    // A direção inversa importa igual: ~4% dos anúncios não têm post no
    // Instagram (PP 5 de 125, Lyrio 2 de 56) e caem legitimamente aqui.
    // Um rótulo fixo em "Instagram" estaria errado exatamente nesses.
    const rotulo = rotuloDoPermalink(FB);
    expect(rotulo).toBe("Assistir no Facebook");
    expect(rotulo).not.toMatch(/instagram/i);
  });

  it("sem link, não há rótulo — quem consome não renderiza botão", () => {
    expect(rotuloDoPermalink(null)).toBeNull();
    expect(rotuloDoPermalink(undefined)).toBeNull();
    expect(rotuloDoPermalink("")).toBeNull();
  });

  it("host desconhecido não é rotulado como rede nenhuma", () => {
    // O dado vem da Meta; nunca vimos outro host, mas afirmar a rede errada é
    // pior do que ser genérico.
    const rotulo = rotuloDoPermalink("https://exemplo.com/algo");
    expect(rotulo).not.toMatch(/instagram|facebook/i);
    expect(rotulo).toBeTruthy();
  });
});

describe("redeDoPermalink", () => {
  it("casa pelo HOST, não por substring na URL inteira", () => {
    // Uma landing page com "instagram" no caminho casaria por `includes` e
    // mandaria o rótulo errado. O host é o que decide para onde o clique vai.
    expect(redeDoPermalink("https://meusite.com.br/curso-de-instagram")).toBeNull();
    expect(redeDoPermalink("https://meusite.com.br/?utm=facebook")).toBeNull();
  });

  it("reconhece subdomínios legítimos", () => {
    expect(redeDoPermalink("https://www.instagram.com/p/abc/")).toBe("instagram");
    expect(redeDoPermalink("https://web.facebook.com/1/posts/2")).toBe("facebook");
  });

  it("URL malformada devolve null em vez de estourar", () => {
    expect(redeDoPermalink("nao-e-url")).toBeNull();
  });
});
