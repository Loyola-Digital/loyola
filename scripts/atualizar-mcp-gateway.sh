#!/usr/bin/env bash
#
# Atualiza o bundle do MCP no gateway (Story 44.22).
#
# Rode ESTE script NA MÁQUINA onde o MCP do Inácio roda — não na sua.
# O bundle não sobe no merge: `packages/mcp/dist` é gitignored e o pipeline da
# `main` não toca no gateway. Foi assim que cinco tools de julho só chegaram ao
# Inácio em 28/08.
#
#   bash scripts/atualizar-mcp-gateway.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
echo "repo: $(pwd)"
echo

echo "── 1. antes ─────────────────────────────────────────────"
echo "commit: $(git log --oneline -1)"
if [ -f packages/mcp/dist/tools.js ]; then
  echo "bundle atual: $(grep -c 'registerTool(' packages/mcp/dist/tools.js || true) ocorrências em dist/tools.js"
  echo "gerado em:    $(date -r packages/mcp/dist/tools.js '+%d/%m/%Y %H:%M' 2>/dev/null || echo '?')"
else
  echo "bundle atual: dist/ não existe (primeiro build nesta máquina)"
fi
echo

echo "── 2. puxando a main ────────────────────────────────────"
git pull origin main
echo

echo "── 3. build ─────────────────────────────────────────────"
# O build já valida a lista canônica de tools e falha se estiver fora de
# sincronia — não precisa conferir isso à mão.
pnpm --filter @loyola-x/mcp build
echo

echo "── 4. depois ────────────────────────────────────────────"
echo "commit: $(git log --oneline -1)"
# `server.registerTool(` com o prefixo: `grep -c registerTool` sozinho conta
# também a linha da função `registerTools` e devolve um a mais.
echo "tools no fonte: $(grep -c 'server\.registerTool(' packages/mcp/src/tools.ts)"
echo "bundle gerado em: $(date -r packages/mcp/dist/tools.js '+%d/%m/%Y %H:%M' 2>/dev/null || echo '?')"
echo
echo "════════════════════════════════════════════════════════"
echo "FALTA O PASSO QUE O SCRIPT NÃO FAZ: reiniciar quem inicia o MCP."
echo
echo "O MCP é stdio — ele não é um serviço, é um executável que o CLIENTE"
echo "spawna (o Claude do Inácio, via mcpServers no config). Build sem"
echo "restart do cliente = o processo antigo continua no ar, e o roster não"
echo "muda. Reinicie a sessão/serviço do Inácio e peça para ele listar as"
echo "tools."
echo
echo "Se o roster ainda vier curto depois do restart, o cliente está"
echo "apontando para OUTRO caminho de dist/. Confira o 'args' do mcpServers"
echo "no config dele contra: $(pwd)/packages/mcp/dist/index.js"
