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
      return "Acesso negado: a API key não tem o scope necessário (Planner exige planner:read para ler e planner:write para gravar) ou foi revogada. Peça uma chave nova ao admin.";
    case 404:
      return "Recurso não encontrado. Confira o projectId/funnelId/adId (use list_projects → list_funnels para descobrir os IDs).";
    case 429:
      return "Rate limit excedido (120 requisições/min por chave). Aguarde alguns segundos e tente novamente.";
    case 405:
      return "Método não permitido — fora do Planner a API é somente leitura (GET).";
    case 409:
      return `Já existe: ${body.slice(0, 300)}`;
    case 400:
      // O 400 do Planner explica o que corrigir (opções válidas, esteira que
      // não existe): o corpo inteiro é a mensagem útil.
      return `Pedido inválido: ${body.slice(0, 1500)}`;
    default: {
      const snippet = body ? `: ${body.slice(0, 200)}` : "";
      return `Erro ${status} da API Loyola X${snippet}`;
    }
  }
}

export type QueryValue = string | number | undefined | null;

export class LoyolaClient {
  constructor(private readonly config: Config) {}

  /** Escrita (Planner): POST / PUT / PATCH / DELETE com corpo JSON. */
  async send(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<unknown> {
    return this.request(method, new URL(this.config.baseUrl + path), body);
  }

  async get(path: string, query?: Record<string, QueryValue>): Promise<unknown> {
    const url = new URL(this.config.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return this.request("GET", url);
  }

  private async request(method: string, url: URL, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "X-API-Key": this.config.apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
