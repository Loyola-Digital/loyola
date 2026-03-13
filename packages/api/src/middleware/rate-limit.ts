import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

export default fp(async function rateLimitPlugin(fastify) {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      return request.userId ?? request.ip;
    },
  });
});
