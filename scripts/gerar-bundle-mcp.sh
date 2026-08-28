#!/usr/bin/env bash
#
# Gera o bundle vendorizado do MCP do Inácio (Story 44.22).
#
# RODE NA SUA MÁQUINA, no repo do Loyola X. O resultado é um arquivo que vai
# COMMITADO NO FORK DO OPENCLAW, em `vendor/loyola-mcp/index.cjs`.
#
#   bash scripts/gerar-bundle-mcp.sh [destino.cjs]
#
# ── Por que não se atualiza no gateway ──────────────────────────────────────
#
# O que roda no container do Inácio é `/app/vendor/loyola-mcp/index.cjs`, um
# bundle único assado DENTRO da imagem Docker do openclaw. Aquele container não
# tem o repo do Loyola X — o único `.git` lá é o workspace do próprio agente,
# sem remote e sem commits.
#
# Então "entrar no gateway e buildar" não existe. O caminho, segundo o README
# que vive ao lado do bundle:
#
#   1. gerar o bundle aqui (este script);
#   2. commitar em `vendor/loyola-mcp/index.cjs` no fork do openclaw;
#   3. push → o workflow de imagem assa a nova;
#   4. redeploy do Inácio no Coolify.
#
# Trocar o arquivo direto no container até funciona, mas dura até o próximo
# deploy: a imagem traz a versão dela de volta. O `.bak-20260713T144717Z` ao
# lado do bundle em produção sugere que foi isso que aconteceu em julho — e
# ajuda a explicar por que a atualização "já feita uma vez" não durou.
#
set -euo pipefail

cd "$(dirname "$0")/.."
SAIDA="${1:-$(pwd)/packages/mcp/loyola-mcp-bundle.cjs}"
TESTE="$(mktemp -t loyola-mcp-teste-XXXXXX.mjs 2>/dev/null || mktemp /tmp/loyola-mcp-teste-XXXXXX.mjs)"
trap 'rm -f "$TESTE"' EXIT

echo "── 1. compilando o pacote ──────────────────────────────"
# O build já valida a lista canônica de tools e falha se estiver fora de
# sincronia com tools.ts.
pnpm --filter @loyola-x/mcp build
echo

echo "── 2. empacotando ──────────────────────────────────────"
# Sobre `dist/index.js`, e não sobre `src/`: é o que o README do vendor manda,
# e o bundle em produção foi gerado assim.
pnpm dlx esbuild packages/mcp/dist/index.js \
  --bundle --platform=node --format=cjs --outfile="$SAIDA"
echo

echo "── 3. validando ────────────────────────────────────────"
# Conversa MCP de verdade com o arquivo gerado. Contar texto não prova que o
# servidor sobe — e um bundle que não sobe tira TODAS as tools do Inácio, o que
# é pior que o atraso que viemos corrigir.
#
# A URL aponta para porta fechada de propósito: o servidor tem que subir mesmo
# sem alcançar a API. Se a checagem de defasagem derrubasse o MCP, seria aqui
# que apareceria.
cat > "$TESTE" <<'JS'
import { spawn } from "node:child_process";
const p = spawn("node", [process.argv[2]], {
  env: { ...process.env, LOYOLA_API_BASE_URL: "http://127.0.0.1:1", LOYOLA_API_KEY: "teste" },
  stdio: ["pipe", "pipe", "pipe"],
});
let saida = "";
p.stdout.on("data", (d) => { saida += d.toString(); });
const enviar = (o) => p.stdin.write(JSON.stringify(o) + "\n");
enviar({ jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "check", version: "1" } } });
setTimeout(() => {
  enviar({ jsonrpc: "2.0", method: "notifications/initialized" });
  enviar({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
}, 2000);
setTimeout(() => {
  p.kill();
  const linhas = saida.split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const tools = linhas.find((l) => l.id === 2)?.result?.tools ?? [];
  if (tools.length === 0) {
    console.error("✗ O bundle não respondeu tools/list — não commite este arquivo.");
    process.exit(1);
  }
  console.log(`✓ o servidor respondeu com ${tools.length} tools:`);
  console.log("  " + tools.map((t) => t.name).sort().join(", "));
  process.exit(0);
}, 7000);
JS

node "$TESTE" "$SAIDA"
echo

echo "════════════════════════════════════════════════════════"
echo "Bundle pronto:"
echo "  $SAIDA"
echo "  $(wc -c < "$SAIDA" | tr -d ' ') bytes · da main em $(git log --oneline -1)"
echo
echo "Agora, NO FORK DO OPENCLAW:"
echo "  cp '$SAIDA' <fork>/vendor/loyola-mcp/index.cjs"
echo "  git add vendor/loyola-mcp/index.cjs && git commit && git push"
echo
echo "Depois, redeploy do Inácio no Coolify — o bundle só entra em uso quando"
echo "a imagem for reassada. Trocar o arquivo dentro do container funciona até"
echo "o próximo deploy, e volta atrás sozinho."
