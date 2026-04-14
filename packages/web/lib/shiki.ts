/**
 * Shiki-based syntax highlighter.
 *
 * Uses the v3 shorthand `codeToHtml` which lazy-loads languages and themes
 * on demand. Falls back to escaped plain text if the language isn't known.
 */

const THEME = "github-dark-dimmed";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalized language aliases → shiki language ids
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  rs: "rust",
  rb: "ruby",
};

function normalizeLang(lang: string | undefined): string {
  if (!lang) return "text";
  const key = lang.toLowerCase().trim();
  return LANG_ALIASES[key] ?? key;
}

export async function highlightCode(
  code: string,
  lang?: string,
): Promise<string> {
  const language = normalizeLang(lang);
  try {
    const { codeToHtml } = await import("shiki");
    return await codeToHtml(code, {
      lang: language,
      theme: THEME,
    });
  } catch {
    // Unknown language or runtime issue — render plain.
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}
