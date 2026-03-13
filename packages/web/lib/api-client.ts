const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Client-side API fetch function factory.
 * Usage: const fetcher = createApiFetcher(getToken);
 */
export function createApiFetcher(getToken: () => Promise<string | null>) {
  return async <T>(path: string, options?: RequestInit): Promise<T> => {
    const token = await getToken();

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  };
}
