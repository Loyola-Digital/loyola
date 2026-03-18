import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userRole: string;
    userStatus: string;
  }
}
