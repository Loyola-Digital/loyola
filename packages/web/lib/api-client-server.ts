import { auth } from "@clerk/nextjs/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Server-side API client — use in Server Components and Route Handlers.
 * Automatically injects Clerk JWT token.
 */
export async function apiServer<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { getToken } = await auth();
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

  // 204 No Content é válido para DELETE sem payload
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    // Body vazio (além de 204): retornar objeto genérico vazio
    // Logs pra diagnóstico se isso aparecer frequentemente.
    console.warn(`[api-client-server] Empty response body from ${path} (status ${response.status})`);
    return {} as T;
  }

  return JSON.parse(text) as T;
}
