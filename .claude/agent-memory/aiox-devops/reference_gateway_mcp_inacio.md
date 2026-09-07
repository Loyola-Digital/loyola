---
name: gateway-mcp-inacio-update-path
description: Atualizar a tool MCP do Inácio passa por um SEGUNDO repo (fork do openclaw) + Coolify — não é build no gateway, e não é alcançável da máquina do Danilo
metadata:
  type: reference
---

O bundle MCP que o Inácio executa é `/app/vendor/loyola-mcp/index.cjs`, **assado na imagem Docker do openclaw**. O container não tem o repo do Loyola X. Procedimento real, documentado em `docs/guides/mcp-gateway.md` (Story 44.22, já na `main`):

1. `bash scripts/gerar-bundle-mcp.sh` — no repo do Loyola X, gera o `.cjs` (gitignored, destino é outro repo);
2. copiar para `vendor/loyola-mcp/index.cjs` **no fork do openclaw**, commit + push;
3. redeploy do Inácio no **Coolify** (a imagem é reassada);
4. reiniciar a sessão do Inácio e conferir o roster.

**Da máquina do Danilo só o passo 1 é executável** (verificado em 2026-08-30 na AC5 da Story 44.24): o fork do openclaw não existe localmente e não aparece em `gh repo list Loyola-Digital` (a org tem um repo só), não há CLI do Coolify nem Docker, `mcpServers` está vazio no `~/.claude.json` (não há cliente MCP para invocar a tool no gateway) e não existe `LOYOLA_API_KEY` em nenhum `.env`. **Dono do fechamento: Lucas.** A tabela "Onde roda e quem tem acesso" do guia continua `_(a preencher)_` nos seis campos — é essa lacuna que faz cada atualização depender de uma pessoa.

⚠️ **A instrução `git pull && pnpm --filter @loyola-x/mcp build` no gateway (AC1 da 44.22) está errada** — sobreviveu no texto da story e no `suggestedFix` do detector de defasagem, mas o gateway não é uma máquina onde se builda.

⚠️ **O detector de defasagem da 44.22 só compara NOMES de tool.** Mudança de schema (novo parâmetro, teto diferente) passa invisível: bundle velho e bundle novo devolvem o mesmo roster e nenhum `AVISO_`. Medido conversando MCP com os dois em 2026-08-30, não só deduzido do código.

**Como verificar um bundle sem gateway e sem credencial:** subir o `.cjs` por stdio com `LOYOLA_API_BASE_URL` apontando para um stub HTTP local que registra a querystring recebida, e falar JSON-RPC (`initialize` → `tools/list` → `tools/call`). Isso mostra o `inputSchema` real e **o que foi de fato para a URL**. Provar por reversão editando o número no `.cjs` gerado (artefato gitignored, não toca código) — sem isso, "não deu erro" é ausência de sinal.

⚠️ `scripts/gerar-bundle-mcp.sh` gera o bundle mas **quebra no passo 3 (validação) no macOS**: BSD `mktemp -t nome.mjs` põe o sufixo aleatório *depois* do template (`...mjs.T44zfole2R`) e o Node recusa a extensão. Em Linux passa. Follow-up aberto, script não alterado.

Relacionado: [[loyola-api-deploy-is-manual-and-lags]].
