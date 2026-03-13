import Fastify from "fastify";
import type { AppConfig } from "@loyola-x/shared";

export async function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => {
    const config: AppConfig = {
      name: "Loyola Digital X API",
      version: "0.0.0",
    };
    return { status: "ok", app: config.name };
  });

  return app;
}
