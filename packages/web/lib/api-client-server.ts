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

  // 204 No Content é válido para DELETE/PATCH sem payload
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    throw new Error(`API response body is empty from ${path}`);
  }

  return JSON.parse(text) as T;
}
