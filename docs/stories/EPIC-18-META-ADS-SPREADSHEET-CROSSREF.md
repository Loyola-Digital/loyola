# EPIC-18: Cross-Reference Meta Ads + Planilhas no Funil

## Objetivo

Criar dashboards analíticos dentro do funil que **cruzam** dados da API do Meta Ads (métricas de tráfego pago) com dados das planilhas vinculadas (leads, vendas, conversões), permitindo visão unificada de performance de campanha até venda.

## Contexto

- EPIC-17 entregou a infraestrutura de planilhas genéricas no funil (schema, API, wizard de mapeamento).
- EPIC-17 explicitamente excluiu dashboards/visualizações: "Dashboards/visualizações analíticas sobre os dados mapeados (escopo de epic futuro)."
- EPIC-6/7 entregou o dashboard Meta Ads (aba existente) com métricas de tráfego puro.
- Agora conectamos os dois mundos: **tráfego (Meta Ads API) × resultado (planilha)** em uma mesma tabela diária.

## Não-Objetivos (Scope OUT)

- Modificar a aba "Meta Ads" existente (permanece intocada).
- Modificar a aba "Planilhas" (permanece intocada).
- Integração com Google Ads neste epic (escopo futuro).
- Edição/escrita de dados na planilha (read-only).

## Stories

| # | Story | Descrição | Estimate |
|---|-------|-----------|----------|
| 18.1 | Meta Ads 2 — Tabela diária cruzada | Nova aba "Meta Ads 2" no funil com tabela diária cruzando Meta Ads API + dados da planilha vinculada | L |

## Dependências

- EPIC-17 (planilhas vinculadas ao funil — `funnelSpreadsheets` + endpoints de dados)
- EPIC-6 (serviço Meta Ads — `services/meta-ads.ts`)
- EPIC-7 (Traffic Analytics — `services/traffic-analytics.ts`)

## Critérios de Aceite do Epic

- [ ] Nova aba "Meta Ads 2" visível no funil com dados cruzados
- [ ] Tabela diária mostra métricas de tráfego (Meta Ads) + métricas de resultado (planilha) lado a lado
- [ ] Métricas calculadas (Connect Rate, Tx Conv., CPL) derivam corretamente de ambas as fontes
- [ ] Aba "Meta Ads" original continua funcionando sem regressão

## Status: Draft
