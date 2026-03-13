import cors from "@fastify/cors";
import fp from "fastify-plugin";

export default fp(async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin: fastify.config.CORS_ORIGIN,
    credentials: true,
  });
});
