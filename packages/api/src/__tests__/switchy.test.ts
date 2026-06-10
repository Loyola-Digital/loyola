import { describe, it, expect } from "vitest";
import { buildTrackedCheckoutUrl } from "../services/switchy";

// Base do modelo decodificado (Story 33.2). Constantes do batch:
// campaign=fzl1, term=cpl, content=org.
const BASE = "https://pay.tmbeducacao.com.br/FernandaZapp/Y5B1006856G";

describe("buildTrackedCheckoutUrl", () => {
  // ---- 7 exemplos-ouro (campaign=fzl1, term=cpl, content=org) ----
  const goldenChannels: { label: string; medium: string; source: string }[] = [
    { label: "bio", medium: "bio", source: "ig" },
    { label: "direct", medium: "direct", source: "ig" },
    { label: "stories", medium: "stories", source: "ig" },
    { label: "manychat", medium: "automacao", source: "manychat" },
    { label: "chatwoot", medium: "disparo", source: "chatwoot" },
    { label: "email", medium: "email", source: "mautic" },
    { label: "grupo", medium: "grupo", source: "whatsapp" },
  ];

  for (const ch of goldenChannels) {
    it(`golden URL for channel "${ch.label}" (${ch.medium}/${ch.source})`, () => {
      const url = buildTrackedCheckoutUrl({
        baseUrl: BASE,
        campaign: "fzl1",
        medium: ch.medium,
        source: ch.source,
        term: "cpl",
        content: "org",
      });
      expect(url).toBe(
        `${BASE}?utm_campaign=fzl1&utm_medium=${ch.medium}&utm_source=${ch.source}` +
          `&utm_term=cpl&utm_content=org&sck=fzl1_${ch.medium}_${ch.source}_cpl_org&vk_source=`,
      );
    });
  }

  it("omits utm_term and utm_content (and excludes from sck) when both empty", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: BASE,
      campaign: "fzl1",
      medium: "bio",
      source: "ig",
    });
    expect(url).toBe(
      `${BASE}?utm_campaign=fzl1&utm_medium=bio&utm_source=ig&sck=fzl1_bio_ig&vk_source=`,
    );
  });

  it("omits utm_content (and excludes from sck) when only content empty", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: BASE,
      campaign: "fzl1",
      medium: "bio",
      source: "ig",
      term: "cpl",
    });
    expect(url).toBe(
      `${BASE}?utm_campaign=fzl1&utm_medium=bio&utm_source=ig&utm_term=cpl&sck=fzl1_bio_ig_cpl&vk_source=`,
    );
  });

  it("treats whitespace-only term/content as empty", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: BASE,
      campaign: "fzl1",
      medium: "bio",
      source: "ig",
      term: "   ",
      content: "",
    });
    expect(url).toBe(
      `${BASE}?utm_campaign=fzl1&utm_medium=bio&utm_source=ig&sck=fzl1_bio_ig&vk_source=`,
    );
  });

  it("uses '&' separator when baseUrl already has a querystring", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: `${BASE}?ref=abc`,
      campaign: "fzl1",
      medium: "bio",
      source: "ig",
      term: "cpl",
      content: "org",
    });
    expect(url).toBe(
      `${BASE}?ref=abc&utm_campaign=fzl1&utm_medium=bio&utm_source=ig` +
        `&utm_term=cpl&utm_content=org&sck=fzl1_bio_ig_cpl_org&vk_source=`,
    );
  });

  it("encodeURIComponent applied to values only (not keys)", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: BASE,
      campaign: "f z&l",
      medium: "bio",
      source: "ig",
    });
    // espaço -> %20, & -> %26 nos valores; chaves intactas
    expect(url).toBe(
      `${BASE}?utm_campaign=f%20z%26l&utm_medium=bio&utm_source=ig&sck=f%20z%26l_bio_ig&vk_source=`,
    );
  });

  it("always ends with '&vk_source=' (present and empty)", () => {
    const url = buildTrackedCheckoutUrl({
      baseUrl: BASE,
      campaign: "fzl1",
      medium: "bio",
      source: "ig",
      term: "cpl",
      content: "org",
    });
    expect(url.endsWith("&vk_source=")).toBe(true);
  });
});
