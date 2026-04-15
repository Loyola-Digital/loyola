# EPIC-17: Planilhas Genéricas no Funil

## Objetivo

Permitir que cada funil tenha uma aba **"Planilhas"** onde o usuário vincula N planilhas do Google Sheets (leads, vendas, custom), seleciona a aba e **mapeia os campos** (nome, email, telefone, UTMs, data, status, valor). Generaliza o que hoje está limitado a "Pesquisas" (EPIC-14) e ao fluxo de Vendas em settings globais.

## Contexto

- EPIC-14 já entregou vinculação de planilha → funil, mas apenas para tipo **Pesquisa** (sem mapeamento rico de campos).
- EPIC de Vendas (settings globais) já tem wizard de mapeamento rico (3 steps: planilha → aba → colunas), mas fora do funil.
- Agora unificamos: **dentro do funil**, uma aba genérica "Planilhas" com mapeamento rico reutilizado.
- Aba "Pesquisa" permanece **intocada** — coexistência garantida.

## Não-Objetivos (Scope OUT)

- Migrar `funnelSurveys` para o novo modelo (permanecem separados).
- Deduplicar a página `/settings/sales` (fora de escopo — fica para eventual consolidação futura).
- Dashboards/visualizações analíticas sobre os dados mapeados (escopo de epic futuro).

## Fluxo do Usuário

1. Dentro do funil, clica na nova aba **"Planilhas"** (ao lado de "Pesquisa")
2. Clica **"Vincular planilha"** → abre wizard 3-step:
   - Step 1: Seleciona planilha do Drive
   - Step 2: Seleciona aba
   - Step 3: Define tipo (leads/vendas/custom) + label + mapeamento de colunas
3. Campos mapeáveis: **nome, email, telefone, UTMs (source/medium/campaign/term/content), data, status, valor**
4. Lista mostra todas as planilhas vinculadas ao funil com badges de tipo e contagem de campos mapeados
5. Pode editar mapeamento ou remover vínculo a qualquer momento

## Stories

| # | Story | Descrição | Estimate |
|---|-------|-----------|----------|
| 17.1 | Schema + API | Tabela `funnelSpreadsheets` + endpoints CRUD + hooks React | M |
| 17.2 | UI Aba Planilhas | Nova tab no funnel page + wizard de mapeamento + listagem | M |

## Dependências

- EPIC-14 (reusa `services/google-sheets.ts` — listagem de planilhas/abas/dados)
- Sales mapping pattern (reusa UX do `MappingDialog` de `/settings/sales/page.tsx`)
- Autenticação Google OAuth já ativa

## Critérios de Aceite do Epic

- [ ] Usuário consegue vincular múltiplas planilhas de tipos diferentes em um único funil
- [ ] Mapeamento de campos persiste em banco e é editável
- [ ] Aba "Pesquisa" original continua funcionando sem regressão
- [ ] Dados mapeados ficam disponíveis via API para uso futuro (dashboards/consultas)

## Status: Draft
