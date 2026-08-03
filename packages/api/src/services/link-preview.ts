/**
 * Preview de link (Open Graph) para o Swipe Files.
 *
 * Roda no SERVIDOR, não no browser: o fetch do front esbarraria em CORS na
 * maioria dos sites, e o resultado é cacheado no registro pra não refazer a
 * cada render — e pra a referência sobreviver se a página sair do ar.
 *
 * SSRF: a URL vem do usuário e o servidor a busca. Sem trava, isso viraria um
 * proxy pra rede interna (169.254.169.254, localhost, 10.x). Por isso só http/s
 * e host resolvido fora de faixa privada, sem seguir redirect cegamente.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TIMEOUT_MS = 8_000;
/** Só o <head> interessa; corta cedo pra não baixar página inteira. */
const MAX_BYTES = 512 * 1024;

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/** Bloqueia loopback, link-local, privadas e reservadas (IPv4 e IPv6). */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    // fc00::/7 (unique local) e fe80::/10 (link-local)
    if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true;
    // IPv4 mapeado em IPv6 (::ffff:10.0.0.1) — checa a parte v4
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // metadata de cloud
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reservado
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Só http(s) é aceito.");
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Endereço não permitido.");
    return url;
  }
  const { address } = await lookup(host);
  if (isPrivateAddress(address)) throw new Error("Endereço não permitido.");
  return url;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&"); // por último, senão desfaz os anteriores
}

/** Lê uma meta tag aceitando atributo em qualquer ordem e aspas simples/duplas. */
function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]?.trim()) return decodeEntities(m[1].trim());
    }
  }
  return null;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const url = await assertPublicUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let html = "";
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Sem UA de browser, muito site devolve página vazia ou bloqueia.
        "user-agent": "Mozilla/5.0 (compatible; LoyolaX-SwipeFiles/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`A página respondeu ${res.status}.`);

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      // Link direto pra imagem/vídeo: não tem OG, mas a própria URL é o preview.
      if (ct.startsWith("image/") || ct.startsWith("video/")) {
        return { title: null, description: null, image: url.href, siteName: url.hostname };
      }
      throw new Error("O link não aponta pra uma página HTML.");
    }

    // Lê no máximo MAX_BYTES: o <head> vem no começo e páginas podem ser enormes.
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (received >= MAX_BYTES || /<\/head>/i.test(html)) {
          await reader.cancel();
          break;
        }
      }
    } else {
      html = await res.text();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("A página demorou demais pra responder.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const image = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image"]);
  return {
    // OG primeiro; sem ele, cai no <title> da página. String vazia vira null
    // pra o front não renderizar um card com título em branco.
    title:
      metaContent(html, ["og:title", "twitter:title"]) ??
      (decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "") || null),
    description: metaContent(html, ["og:description", "twitter:description", "description"]),
    // Resolve caminho relativo contra a URL final.
    image: image ? new URL(image, url).href : null,
    siteName: metaContent(html, ["og:site_name"]) ?? url.hostname,
  };
}
