import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userRole: string;
    userStatus: string;
    // Story 36.2: populado pelo middleware de API key nas rotas /api/public/*.
    // Ausente em rotas autenticadas via Clerk.
    apiKey?: { id: string; scopes: string[] };
  }
}
