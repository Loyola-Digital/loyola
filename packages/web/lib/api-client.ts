const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
      try {
        const body = await response.json() as { error?: string; message?: string };
        message = body.error ?? body.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new Error(message);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  };
}
