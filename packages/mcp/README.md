# @loyola-x/mcp

MCP server que embrulha a **API pública Meta Ads Creative Intelligence** do Loyola X como tools, para a IA consultar performance de criativos e a estrutura de funis ao vivo (via stdio).

É um **transporte fino**: cada tool mapeia 1:1 num endpoint `/api/public/*`. Toda a regra de negócio vive na API (`packages/api`). Ver o contrato completo em [`docs/llms.txt`](../../docs/llms.txt).

## Tools

| Tool | Endpoint | Para quê |
|------|----------|----------|
| `list_projects` | `GET /api/public/v1/projects` | Descobrir os projetos (comece aqui) |
| `list_funnels` | `GET /api/public/v1/projects/{projectId}/funnels` | Funis de um projeto |
| `list_stages` | `GET /api/public/v1/funnels/{funnelId}/stages` | Etapas de um funil |
| `list_campaigns` | `GET /api/public/meta/v1/projects/{projectId}/campaigns` | Performance por campanha |
| `get_creative_performance` | `GET .../creatives` | Performance por criativo (rankeável) |
| `get_creative_timeseries` | `GET .../creatives/{adId}/timeseries` | Série diária de um criativo |

## Configuração

Duas variáveis de ambiente:

| Variável | Descrição |
|----------|-----------|
| `LOYOLA_API_BASE_URL` | Base da API pública (ex.: `https://api.loyolax.com.br`) |
| `LOYOLA_API_KEY` | API key admin — gere na tela de admin do Loyola X (Story 36.1), revogável |

## Rodar

```bash
# da raiz do monorepo
pnpm --filter @loyola-x/mcp build      # compila para dist/
# ou, em dev, sem build:
LOYOLA_API_BASE_URL=https://api.loyolax.com.br LOYOLA_API_KEY=sk_... pnpm --filter @loyola-x/mcp dev
```

## Registrar no cliente de IA

Exemplo de configuração MCP (Claude Desktop / Claude Code — `claude_desktop_config.json` ou `.mcp.json`):

```json
{
  "mcpServers": {
    "loyola-x": {
      "command": "node",
      "args": ["/caminho/absoluto/loyola/packages/mcp/dist/index.js"],
      "env": {
        "LOYOLA_API_BASE_URL": "https://api.loyolax.com.br",
        "LOYOLA_API_KEY": "sk_sua_chave_aqui"
      }
    }
  }
}
```

> Em dev, dá para apontar `command` para `tsx` e `args` para `src/index.ts` (sem build).
> O registro/ativação do MCP no ambiente da IA é coordenado pelo @devops (ver `.claude/rules/mcp-usage.md`).

## Notas de interpretação

- `spend` já inclui o **imposto Meta** (12,15% para datas ≥2026) — bate com o dashboard.
- `roas` é do **pixel** Meta, não o ROAS real cruzado com vendas (esse virá na Story 36.5).
- `partial: true` indica dias sem dado no cache; `lastSyncedAt` informa a idade do dado.
- A API é **read-only** e tem rate limit de 120 req/min por chave.
