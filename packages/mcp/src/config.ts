/**
 * Configuração do MCP server, lida de variáveis de ambiente.
 *
 *   LOYOLA_API_BASE_URL — base da API pública (ex: https://api.loyolax.com.br)
 *   LOYOLA_API_KEY      — API key admin gerada na tela de config (Story 36.1)
 */
export interface Config {
  baseUrl: string;
  apiKey: string;
}

export function loadConfig(): Config {
  const baseUrl = process.env.LOYOLA_API_BASE_URL;
  const apiKey = process.env.LOYOLA_API_KEY;

  if (!baseUrl) {
    throw new Error(
      "LOYOLA_API_BASE_URL não configurada. Defina a base da API pública (ex: https://api.loyolax.com.br)."
    );
  }
  if (!apiKey) {
    throw new Error(
      "LOYOLA_API_KEY não configurada. Gere uma API key na tela de admin (Story 36.1) e exporte-a."
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
