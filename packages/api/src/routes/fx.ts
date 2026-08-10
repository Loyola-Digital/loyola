import fp from "fastify-plugin";
import { getUsdToBrl } from "../services/fx.js";

// Câmbio USD->BRL pro dashboard unificar a moeda (Meta em BRL, RevenueCat em USD).
export default fp(async function fxRoutes(fastify) {
  fastify.get("/api/fx/usd-brl", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    return getUsdToBrl();
  });
});
