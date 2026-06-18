import type { Config } from "./config.js";

/**
 * Cliente HTTP fino para a API pública Loyola X (`/api/public/*`).
 * Zero lógica de negócio — só mapeia chamada → request HTTP → JSON, com o header
 * `X-API-Key` e tradução dos erros da API em mensagens úteis para a IA.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function describeError(status: number, body: string): string {
  switch (status) {
    case 401:
      return "API key ausente ou inválida. Verifique a variável LOYOLA_API_KEY.";
    case 403:
      return "Acesso negado: scope insuficiente ou API key revogada. Gere uma nova key na tela de admin.";
    case 404:
      return "Recurso não encontrado. Confira o projectId/funnelId/adId (use list_projects → list_funnels para descobrir os IDs).";
    case 429:
      return "Rate limit excedido (120 requisições/min por chave). Aguarde alguns segundos e tente novamente.";
    case 405:
      return "Método não permitido — a API é read-only (somente GET).";
    default: {
      const snippet = body ? `: ${body.slice(0, 200)}` : "";
      return `Erro ${status} da API Loyola X${snippet}`;
    }
  }
}

export type QueryValue = string | number | undefined | null;

export class LoyolaClient {
  constructor(private readonly config: Config) {}

  async get(path: string, query?: Record<string, QueryValue>): Promise<unknown> {
    const url = new URL(this.config.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "X-API-Key": this.config.apiKey, Accept: "application/json" },
      });
    } catch (err) {
      throw new ApiError(0, `Falha de rede ao chamar ${url.pathname}: ${(err as Error).message}`);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(res.status, describeError(res.status, text));
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(res.status, `Resposta não-JSON da API: ${text.slice(0, 200)}`);
    }
  }
}
