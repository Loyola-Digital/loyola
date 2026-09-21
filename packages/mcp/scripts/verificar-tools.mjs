/**
 * Guard de build: a lista canônica tem que bater com o que `tools.ts` registra.
 *
 * `TOOLS_DO_MCP` (em @loyola-x/shared) é a metade fixa da checagem de defasagem
 * — é ela que a API publica como "o que a main tem". Se alguém adicionar uma
 * tool e esquecer da lista, a checagem passa a mentir na direção pior: diria
 * que o gateway está em dia enquanto falta tool.
 *
 * Roda no `build`, então falha no CI e falha também no rebuild feito no
 * gateway. É o guard que substitui a lembrança — documentar já foi tentado, e
 * está escrito em dois lugares desde julho.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const fonteTools = join(aqui, "..", "src", "tools.ts");
const fonteLista = join(aqui, "..", "..", "shared", "src", "mcp-tools.ts");

/** Nomes passados a `server.registerTool("...")`, na ordem do arquivo. */
function registradasNoFonte() {
  const src = readFileSync(fonteTools, "utf8");
  return [...src.matchAll(/server\.registerTool\(\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Nomes dentro do array `TOOLS_DO_MCP`. Lido como texto para não exigir build do shared. */
function listaCanonica() {
  const src = readFileSync(fonteLista, "utf8");
  const bloco = src.match(/TOOLS_DO_MCP\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!bloco) throw new Error("Não achei TOOLS_DO_MCP em shared/src/mcp-tools.ts");
  return [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const registradas = registradasNoFonte();
const canonicas = listaCanonica();

const faltamNaLista = registradas.filter((t) => !canonicas.includes(t));
const sobramNaLista = canonicas.filter((t) => !registradas.includes(t));

if (faltamNaLista.length > 0 || sobramNaLista.length > 0) {
  console.error("\n✗ A lista canônica de tools do MCP está fora de sincronia.\n");
  if (faltamNaLista.length > 0) {
    console.error(`  Registradas em tools.ts e AUSENTES na lista: ${faltamNaLista.join(", ")}`);
  }
  if (sobramNaLista.length > 0) {
    console.error(`  Na lista e NÃO registradas em tools.ts: ${sobramNaLista.join(", ")}`);
  }
  console.error("\n  Corrija packages/shared/src/mcp-tools.ts (TOOLS_DO_MCP).");
  console.error("  Ela é o que a API publica como 'o que a main tem' — se mentir, a");
  console.error("  checagem de defasagem do gateway passa a mentir junto.\n");
  process.exit(1);
}

console.log(`✓ ${registradas.length} tools do MCP conferem com a lista canônica.`);

// O vocabulário da esteira anual: a cópia do MCP (enum das tools) tem que ser a
// do shared (o que a API valida). Divergir = o modelo escolhe da lista e a API
// recusa, ou a API aceita um funil que o modelo nunca vê.
const listasDe = (arquivo) => {
  const src = readFileSync(arquivo, "utf8");
  return Object.fromEntries(
    [...src.matchAll(/export const (\w+) = \[([\s\S]*?)\] as const/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    ]),
  );
};
const doShared = listasDe(join(aqui, "..", "..", "shared", "src", "planner-anual.ts"));
const doMcp = listasDe(join(aqui, "..", "src", "vocabulario-anual.ts"));
for (const nome of ["FAIXAS_DO_ANUAL", "CATEGORIAS_DO_ANUAL", "FUNIS_DO_ANUAL"]) {
  if (JSON.stringify(doShared[nome]) !== JSON.stringify(doMcp[nome])) {
    console.error(`
✗ ${nome} diverge entre shared/src/planner-anual.ts e mcp/src/vocabulario-anual.ts.`);
    console.error(`  shared: ${JSON.stringify(doShared[nome])}`);
    console.error(`  mcp:    ${JSON.stringify(doMcp[nome])}
`);
    process.exit(1);
  }
}
console.log("✓ vocabulário da esteira anual confere com o shared.");
