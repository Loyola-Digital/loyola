# EPIC-26: Tracking de Grupos via Planilha

## Objetivo

Conectar uma planilha do Google Sheets que registra snapshots diários de grupos (WhatsApp/Telegram) por campanha de tráfego, ingerir esses dados e exibir no dashboard do funil os indicadores de entrada/saída/saldo de participantes ao longo do tempo.

## Contexto

A operação de tráfego pago redireciona leads para grupos antes do evento. Hoje a contagem de "quantas pessoas estão nos grupos" mora numa planilha externa, sem visualização integrada. O time precisa acompanhar diariamente:

- Quantas pessoas entraram nos grupos (hoje vs. ontem)
- Quantas saíram (output)
- Saldo líquido de participantes
- Quantos grupos já estão lotados vs. com vaga
- Performance por campanha

## Estrutura da Planilha (entrada)

A aba contém uma linha por snapshot (vários snapshots/dia) com as colunas:

| Coluna | Tipo | Descrição |
|---|---|---|
| Campaign ID | string | ID externo da campanha (não é Meta `campaign_id`) |
| Campaign Name | string | Nome da campanha |
| Clicks Total Count | int | Cliques acumulados no link do grupo |
| Criação | ISO timestamp | Momento do snapshot |
| Group Full Amount | int | Grupos lotados |
| Group Open Amount | int | Grupos com vaga |
| Group Total Amount | int | Total de grupos |
| Input Amount | int | Entradas acumuladas |
| Output Amount | int | Saídas acumuladas |
| Participants Amount | int | Participantes atuais |

## Decisões Técnicas

- **Reuso:** integração Google Sheets existente (`packages/api/src/services/google-sheets.ts`, service account). NÃO criar nova autenticação.
- **Schema:** 2 tabelas — `funnel_groups_spreadsheets` (link config) e `funnel_group_snapshots` (snapshots ingeridos).
- **Granularidade:** persistir TODOS snapshots; agregação para "último por dia" feita em query/front.
- **Sync:** endpoint dedicado `/sync` (manual via botão "Atualizar"). Dedup por `(funnel_id, campaign_id, snapshot_at)`.
- **UI:** nova tab "Grupos" no funil (paralela a Pesquisas e Meta Ads).

## Stories

| # | Story | Descrição |
|---|---|---|
| 26.1 | Conexão + Sync + Dashboard Grupos | Schema, endpoints, sync da planilha, tab "Grupos" no funil com KPIs e tabela diária |

## Status: Draft
