# Epic 36 — Meta Ads Creative Intelligence API + MCP

**Status:** In Progress
**Owner:** @pm (formalização) / dirigido por @sm (River)
**Created:** 2026-06-18

---

## Objetivo

Expor a **performance de criativos do Meta Ads por campanha** como uma **API consumível por máquina**, protegida por API Key admin-only, e embrulhá-la num **MCP server** para que a IA do Lucas consulte ao vivo ("qual criativo da campanha SCA tem melhor CTR/CPA?", "qual o ROAS real desse criativo?").

## Por que agora

- O LoyolaX já tem um **cliente Meta Graph API completo** (`packages/api/src/services/meta-ads.ts`), com criativos, insights, métricas de vídeo e cache de insights diários. Falta só **expor** isso de forma segura para consumo automatizado.
- Toda auth hoje é Clerk (humano). Não existe caminho máquina-a-máquina — é o que o épico cria.
- O diferencial competitivo é o **ROAS real**: cruzar spend Meta com vendas reais Kiwify/Hotmart (já no banco), não o ROAS do pixel.

## Decisões de produto (validadas com Lucas, 2026-06-18)

| Decisão | Escolha |
|---------|---------|
| Fonte dos dados | **Sync + cache no banco** (API/MCP leem do cache, não da Graph API ao vivo) |
| Auth do MCP | **API Key gerada na tela de config** (admin-only, revogável) |
| Escopo de dados | **Completo**: métrica por criativo + agregado por campanha + série temporal + **ROAS real (cruzamento com vendas)** |

## Stories

| # | Story | Status | Depende de | Donos extras |
|---|-------|--------|-----------|--------------|
| 36.1 | Infra de API Keys + tela admin | ✅ Ready for Review (migration aplicada) | — | — |
| 36.2 | Middleware auth `X-API-Key` (read-only) | ✅ Ready for Review | 36.1 | @architect (scopes/rate limit) |
| 36.3 | Endpoints públicos de leitura Meta + discovery | 🔨 Implementado (local, Lote 1) | 36.2 | — |
| 36.4 | Job de sync/refresh de performance | Draft | — (paralelo) | — |
| 36.5 | ROAS real (Meta × vendas Kiwify/Hotmart) | Draft | 36.3 | @architect + @data-engineer |
| 36.6 | MCP server + `llms.txt` | 🔨 Implementado (local) | 36.3 | @devops (publicar) |

**Sequência:** 36.1 → 36.2 → 36.3/36.4 (paralelo) → 36.6 → 36.5.

## Gates que exigem decisão humana

1. **Migrations em produção** — `DATABASE_URL` local = prod, Coolify não roda migrations. Toda story com migration (36.1, 36.4, 36.5) precisa de aplicação confirmada.
2. **Modelo de atribuição venda↔campanha (36.5)** — reaproveitar a lógica UTM existente (`classifyFonte`/`PAID_UTM_SOURCES`) precisa de validação do @architect/@data-engineer.

## Entregável final

`llms.txt` documentando os endpoints e as tools do MCP, para a IA do Lucas saber consumir a API sem adivinhação.
