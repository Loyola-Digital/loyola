# Epic 29 — Perpetual Spreadsheet Integration

**Status:** Approved
**Owner:** @pm (Morgan)
**Criado em:** 2026-05-22
**Estimativa:** 16 pts (5 stories)

---

## Goal

Permitir que o `PerpetualDashboard` use uma planilha Google Sheets como **source-of-truth** de vendas (e não mais a métrica `action_values.purchase` do Meta Pixel), seguindo o mesmo pattern que já existe pra etapas pagas de lançamento (Stories 19.4–19.6). Adicionar visualização de **Receita por Origem (utm_source)** — capacidade que hoje não existe em lugar nenhum do produto.

## Por que agora

1. **Precisão de dados:** Meta Pixel reporta purchases que frequentemente divergem do que realmente foi vendido (atribuição, eventos duplicados, conversões fora do janela). Planilha do checkout (Hotmart/Kiwify/Stripe export) é fonte controlada pelo usuário.
2. **Análise estratégica de canal:** Em produto perpétuo, entender qual `utm_source` traz mais receita é decisão diária (alocação de orçamento, criativos, parcerias). Hoje o time não tem esse dado consolidado no app.
3. **Consistência arquitetural:** Lançamentos já têm planilha conectada via `stageSalesSpreadsheets`. Perpétuo (modelo de venda contínua) é a peça que falta pra cobertura completa.

## Escopo (IN)

- Conexão de UMA planilha Google Sheets por funil de perpétuo (não por stage)
- Mapper de colunas: `email`, `valorBruto`, `valorLiquido`, `utmSource`, `formaPagamento`, `dataVenda`
- API que agrega vendas por email (dedup 1 venda/email) e expõe métricas
- Substituição das fontes de Vendas/Receita/CAC/Margem/ROAS no dashboard quando planilha conectada (Meta continua sendo fonte do **Investimento**)
- Gráfico novo **"Receita por Origem (utm_source)"**
- Fallback: quando planilha NÃO conectada, dashboard segue funcionando com dados Meta (comportamento atual)

## Escopo (OUT)

- Captura customizada de utm via pixel/checkout proprietário (assume planilha já vem com utm preenchido pelo checkout)
- Múltiplas planilhas por funil perpétuo (1 por funil; multi-planilha pode virar Story futura se necessário)
- Custo de produto pra cálculo de margem líquida real (margem segue = receita − spend; refinamento fica pra Epic futuro quando Lucas decidir o modelo)
- Webhook em tempo real de Hotmart/Kiwify (sync por planilha já resolve 95% dos casos)
- Mobile (continua sendo PC-only conforme arquitetura atual)

## Stories

| # | Story | Pts | Status | Dependência |
|---|---|---|---|---|
| 29.1 | Schema + API CRUD `perpetual_sales` spreadsheet | 3 | Draft | — |
| 29.2 | UI: Wizard de conexão de planilha no `PerpetualDashboard` | 3 | TBD | 29.1 |
| 29.3 | API `/perpetual/sales-data` (agregação por email + utm_source) | 3 | TBD | 29.1 |
| 29.4 | Dashboard usa planilha como fonte de vendas/receita/CAC/margem | 5 | TBD | 29.2, 29.3 |
| 29.5 | Gráfico "Receita por Origem (utm_source)" | 2 | TBD | 29.3 |

## Dependências externas

- **Zero.** Toda infra (Google Sheets sync, mapper UI, agregação por email) já existe em packages/api e packages/web. Pattern fonte: Stories 17.2 (funnel-spreadsheets-ui), 19.5/19.6 (stage-sales), 28.4 (dedup).

## Métricas de sucesso

- Pelo menos 1 funil perpétuo do projeto Loyola Digital com planilha conectada e dashboards exibindo dados consistentes
- ROAS exibido no perpétuo passa a refletir receita real (planilha) e não atribuição Meta
- Gráfico utm_source permite identificar pelo menos 3 origens distintas com receita > R$ 0

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Planilha desconectada / colunas renomeadas | M | Fallback explícito pra dados Meta + alerta UI quando sync falha |
| Email duplicado em vendas legítimas (re-compra) | M | Dedup por `(email, dataVenda)` invés de só email; documentar |
| utm_source vazio em maioria das vendas | L | Bucket "Direto / Sem origem" no gráfico (não esconder) |
| Performance: planilha grande (>10k linhas) | L | Reusa cache de sync do `funnelSpreadsheets` existente |

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-05-22 | @pm Morgan | Epic criado, escopo aprovado |
