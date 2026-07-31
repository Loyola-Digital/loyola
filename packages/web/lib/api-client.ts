// In dev, use relative path so Next.js rewrites proxy to the API server.
// This allows access from any device on the same network (e.g. phone via LAN IP).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Client-side API fetch function factory.
 * Usage: const fetcher = createApiFetcher(getToken);
 */
export function createApiFetcher(getToken: () => Promise<string | null>) {
  return async <T>(path: string, options?: RequestInit): Promise<T> => {
    const token = await getToken();

    const hasBody = options?.body != null;
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let message = `API error: ${response.status}`;
      let code: string | undefined;
      let body: unknown;
      try {
        body = await response.json();
        const b = body as { error?: string; message?: string; code?: string; detalhe?: string };
        // `detalhe` entra na lista porque as rotas de relatório (Epic 41) usam o
        // formato do §9.1 (`{ erro, codigo, detalhe, acao }`), sem `error` nem
        // `message` — sem isso a mensagem ficava só "API error: 422".
        message = b.error ?? b.message ?? b.detalhe ?? message;
        code = b.code;
      } catch {
        // non-JSON error body
      }
      const err = new Error(message) as Error & {
        status: number;
        code?: string;
        body?: unknown;
      };
      err.status = response.status;
      err.code = code;
      // O corpo inteiro fica acessível: erros estruturados (422 com `acao`, por
      // exemplo) precisam chegar à tela, e antes disso eles eram descartados
      // aqui — o consumidor via só a mensagem e caía no erro genérico.
      err.body = body;
      throw err;
    }

    const text = await response.text();
    if (!text) {
      // 204 No Content é válido para DELETE sem payload. Para outras operações,
      // retornar um valor padrão apropriado: array vazio ou objeto vazio genérico.
      if (response.status === 204) {
        return undefined as T;
      }
      // Para endpoints que esperam dados (200 OK) mas retornam vazio,
      // retornar um objeto genérico vazio que a maioria dos hooks consegue processar.
      // Alternativas:
      // - Array: [] (correto para endpoints que retornam arrays)
      // - Objeto: {} (genérico mas menos seguro)
      // Como não temos informação do tipo esperado, retornar {} e deixar
      // que o hook ou componente valide.
      console.warn(`[api-client] Empty response body from ${path} (status ${response.status})`);
      return {} as T;
    }
    return JSON.parse(text) as T;
  };
}
