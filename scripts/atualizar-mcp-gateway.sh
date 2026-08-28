#!/usr/bin/env bash
#
# Atualiza o bundle do MCP do Inácio no gateway (Story 44.22).
#
# RODE NO CONTAINER DO INÁCIO, não na sua máquina.
#
#   bash scripts/atualizar-mcp-gateway.sh
#
# ── Por que não é `pnpm --filter @loyola-x/mcp build` ────────────────────────
#
# O que roda no gateway não é `packages/mcp/dist/index.js`. É um bundle único
# em `/app/vendor/loyola-mcp/index.cjs`, registrado no `mcp.servers` do
# openclaw.json. O `.bak-20260713T144717Z` ao lado dele mostra como a última
# atualização foi feita: gerar o bundle e trocar o arquivo, guardando o antigo.
#
# O procedimento que circulava ("git pull && pnpm build && reinicie o serviço")
# não funciona aqui — não há dist/ em uso e não há serviço para reiniciar. Isso
# provavelmente é o que fez a atualização de julho não acontecer.
#
# ── O que este script faz ───────────────────────────────────────────────────
#
# Gera o bundle num arquivo TEMPORÁRIO, valida esse temporário conversando MCP
# com ele de verdade, e só então troca o que está no ar. Build direto no destino
# deixaria o Inácio com um arquivo pela metade se algo falhasse no meio.
#
set -euo pipefail

REPO="${REPO:-/home/node/.openclaw/workspace}"
DEST="${DEST:-/app/vendor/loyola-mcp/index.cjs}"
ESBUILD_VER="${ESBUILD_VER:-0.25.0}"

TMP="$(mktemp /tmp/loyola-mcp-XXXXXX.cjs)"
TESTE="$(mktemp /tmp/loyola-mcp-teste-XXXXXX.mjs)"
trap 'rm -f "$TMP" "$TESTE"' EXIT

# Lista os nomes de tool presentes num bundle, um por linha.
nomes_no_bundle() {
  grep -oE '"(list|get)_[a-z_]+"' "$1" 2>/dev/null | tr -d '"' | sort -u
}

echo "── 1. antes ────────────────────────────────────────────"
if [ ! -f "$DEST" ]; then
  echo "✗ Não achei $DEST."
  echo "  Confira o caminho em: grep -A6 loyola-x ~/.openclaw/openclaw.json"
  exit 1
fi
echo "bundle em uso : $DEST"
echo "gerado em     : $(date -r "$DEST" '+%d/%m/%Y %H:%M' 2>/dev/null || stat -c '%y' "$DEST")"
ANTES="$(nomes_no_bundle "$DEST" | wc -l | tr -d ' ')"
echo "tools hoje    : $ANTES"
echo

echo "── 2. puxando a main ───────────────────────────────────"
cd "$REPO"
git remote -v | head -1
git pull origin main
echo "commit        : $(git log --oneline -1)"
echo

echo "── 3. gerando o bundle (em arquivo temporário) ─────────"
npx --yes "esbuild@${ESBUILD_VER}" packages/mcp/src/index.ts \
  --bundle --platform=node --format=cjs --target=node20 --outfile="$TMP"
echo

echo "── 4. validando o bundle novo ──────────────────────────"
# Conversa MCP de verdade com o arquivo gerado: handshake + tools/list. Contar
# ocorrência de texto não prova que o servidor sobe — e um bundle que não sobe
# tira TODAS as tools do Inácio, o que é pior que o atraso que viemos corrigir.
#
# A URL aponta para uma porta fechada de propósito: o servidor tem que subir
# mesmo sem alcançar a API. Se a checagem de defasagem derrubasse o MCP, era
# aqui que apareceria.
cat > "$TESTE" <<'JS'
import { spawn } from "node:child_process";
const alvo = process.argv[2];
const p = spawn("node", [alvo], {
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
    console.error("✗ O bundle novo não respondeu tools/list. NADA foi trocado.");
    process.exit(1);
  }
  console.log(`servidor respondeu: ${tools.length} tools`);
  console.log(tools.map((t) => t.name).sort().join(", "));
  process.exit(0);
}, 7000);
JS

if ! node "$TESTE" "$TMP"; then
  echo
  echo "✗ Validação falhou — o bundle em uso NÃO foi tocado."
  exit 1
fi
echo

echo "── 5. trocando ─────────────────────────────────────────"
BAK="${DEST}.bak-$(date -u +%Y%m%dT%H%M%SZ)"
cp "$DEST" "$BAK"
echo "backup: $BAK"
# `cat >` em vez de `mv`: preserva dono, permissão e inode do arquivo que o
# openclaw já conhece.
cat "$TMP" > "$DEST"
DEPOIS="$(nomes_no_bundle "$DEST" | wc -l | tr -d ' ')"
echo "tools agora: $ANTES → $DEPOIS"
echo

echo "════════════════════════════════════════════════════════"
echo "Falta o passo que este script não pode fazer: REINICIAR A SESSÃO"
echo "do Inácio. O MCP é stdio — quem o inicia é o cliente, e o processo"
echo "antigo segue no ar com o código velho em memória até isso acontecer."
echo
echo "Depois do restart, peça o roster ao Inácio. Tem que vir $DEPOIS tools."
echo
echo "Se vier menos, o backup está em:"
echo "  $BAK"
echo "  (restaurar: cat '$BAK' > '$DEST')"
