import { z } from "zod";
import fp from "fastify-plugin";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MINDS_BASE_PATH: z.string().default("./squads"),
  CLICKUP_API_TOKEN: z.string().min(1).optional(),
  CLICKUP_LIST_ID: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export default fp(async function envPlugin(fastify) {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    fastify.log.error(
      { errors: parsed.error.flatten().fieldErrors },
      "Invalid environment variables"
    );
    throw new Error("Invalid environment variables");
  }

  fastify.decorate("config", parsed.data);
});
