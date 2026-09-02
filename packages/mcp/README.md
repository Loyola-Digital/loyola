# @loyola-x/mcp

MCP server que embrulha a **API pública Meta Ads Creative Intelligence** do Loyola X como tools, para a IA consultar performance de criativos e a estrutura de funis ao vivo (via stdio).

É um **transporte fino**: cada tool mapeia 1:1 num endpoint `/api/public/*`. Toda a regra de negócio vive na API (`packages/api`). Ver o contrato completo em [`docs/llms.txt`](../../docs/llms.txt).

## Tools

**18 tools**, todas read-only. Cada uma mapeia 1:1 num endpoint `/api/public/*`.

Comece por `list_projects` — o `projectId` dele é a entrada de quase todas as
outras.

### Estrutura

| Tool | Para quê |
|------|----------|
| `list_projects` | Descobrir os projetos (comece aqui) |
| `list_funnels` | Funis de um projeto |
| `list_stages` | Etapas de um funil |

### Tráfego

| Tool | Para quê |
|------|----------|
| `list_campaigns` | Performance por campanha Meta |
| `get_creative_performance` | Performance por criativo, rankeável |
| `get_creative_timeseries` | Série diária de um criativo |
| `get_daily` | Dados diários do projeto |
| `get_stage_daily` | Dados diários da etapa |

### Leads e qualificação

| Tool | Para quê |
|------|----------|
| `get_stage_leads_summary` | Leads por origem × temperatura |
| `get_stage_survey` | Pesquisa de qualificação da etapa |
| `get_stage_cadeia_cac` | Cadeia de CAC da etapa |
| `get_project_panorama` | Panorama do projeto (cadeia de CAC) |

### Vendas

| Tool | Para quê |
|------|----------|
| `get_stage_sales` | Resumo enxuto de uma etapa |
| `get_funnel_sales` | Agregado do funil inteiro |
| `get_stage_sales_daily` | Vendas diárias por origem |
| `get_stage_sales_rows` | Row-level, transação a transação |
| `get_cross_launch` | Recompra entre funis do projeto |
| `get_stage_operational_costs` | Custos operacionais da etapa |

### `AVISO_bundle_do_mcp_desatualizado`

Não é uma tool de dado: aparece **só quando o gateway está atrás da `main`**, e
existe porque um bundle velho não dá erro — serve menos tools, em silêncio. Se
ela estiver no roster, as tools que faltam não existem naquele gateway, e não
adianta tentar chamá-las. Ver [`docs/guides/mcp-gateway.md`](../../docs/guides/mcp-gateway.md).

## Configuração

Duas variáveis de ambiente:

| Variável | Descrição |
|----------|-----------|
| `LOYOLA_API_BASE_URL` | Base da API pública (ex.: `https://api.loyoladigital.com`) |
| `LOYOLA_API_KEY` | API key admin — gere na tela de admin do Loyola X (Story 36.1), revogável |

## Rodar

```bash
# da raiz do monorepo
pnpm --filter @loyola-x/mcp build      # compila para dist/
# ou, em dev, sem build:
LOYOLA_API_BASE_URL=https://api.loyoladigital.com LOYOLA_API_KEY=sk_... pnpm --filter @loyola-x/mcp dev
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
        "LOYOLA_API_BASE_URL": "https://api.loyoladigital.com",
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
