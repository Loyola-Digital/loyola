import "dotenv/config";
import { buildServer } from "./app.js";
import { migracaoNoBoot } from "./migracao-no-boot.js";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  await migracaoNoBoot();

  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
