# EPIC-14: Google Sheets — Pesquisas de Funil

## Objetivo

Integrar Google Sheets ao Loyola X para vincular planilhas de pesquisas a funis. As respostas da pesquisa aparecem como secao colapsavel no funil e a % de respostas (respostas/leads) conta no dashboard geral.

## Contexto

- Autenticacao via Google OAuth (mesmas credenciais do Google Ads/YouTube — adicionar scope `spreadsheets.readonly`)
- Google Sheets API v4 para listar planilhas, abas e ler dados
- Cada funil pode ter N planilhas de pesquisa vinculadas
- Cada planilha pode ter N abas marcadas como "pesquisa"
- % resposta = total de linhas da aba de pesquisa / total de leads do funil

## Fluxo do Usuario

1. No funil, nova tab "Pesquisas" (ao lado de Meta Ads e YouTube Ads)
2. Clica "Vincular planilha" → abre picker de planilhas (Google Sheets API)
3. Seleciona planilha → sistema lista as abas
4. Usuario indica qual(is) aba(s) sao de pesquisa
5. Dados aparecem colapsados no funil
6. Dashboard mostra KPI de % respostas

## Stories

| # | Story | Descricao |
|---|-------|-----------|
| 14.1 | Conectar Google Sheets | OAuth scope, API service, schema para vinculos |
| 14.2 | Picker de planilhas no funil | Listar planilhas, selecionar, listar abas, marcar pesquisa |
| 14.3 | Visualizacao de pesquisas no funil | Tab "Pesquisas" colapsavel com dados da aba |
| 14.4 | KPI de % respostas no dashboard | Respostas/leads no dashboard geral do funil |

## Dependencias

- Google Sheets API v4
- OAuth2 (reaproveitando credenciais existentes — adicionar scope)
- Schema do funil (adicionar campo sheets/surveys)

## Status: Draft
