# EPIC-7: Traffic Analytics — Funil Completo (Ads + CRM + Vendas)

> Construir dashboard de analytics de trafego pago com 3 camadas de analise: metricas de midia (Meta Ads API), leads qualificados (Google Sheets CRM + pesquisa de captacao), e vendas (Google Sheets), cruzando tudo via UTMs para entregar visao real de performance por campanha, ad set e ad.

**Status:** Draft
**Created:** 2026-03-18
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1
**Depends on:** EPIC-6 (Meta Ads / Traffic — contas e API ja funcionando)

---

## Epic Goal

Dar ao gestor de trafego uma ferramenta completa de analise de performance que cruza dados reais do CRM (Google Sheets) com dados da Meta Ads API, permitindo avaliar campanhas, ad sets e ads nao apenas por metricas de midia (CTR, CPC, CPM), mas por conversoes reais, leads qualificados e vendas — tudo atribuido via UTMs.

## Business Value

- **Decisoes baseadas em dados reais:** Conversoes do CRM via UTM, nao pixel/modelagem estatistica
- **ROI real por campanha:** Cruzamento gasto Meta Ads × vendas reais da planilha
- **Lead scoring automatico:** Classificacao de leads qualificados por perfil (renda, sexo, filhos, etc.)
- **Analise em 3 niveis:** Campanha → Ad Set (publico) → Ad (criativo) — cada um com metricas completas
- **Tempo do gestor:** Elimina analise manual cruzando Meta Business Manager + planilha
- **Minds inteligentes:** Base para minds responderem "qual criativo vendeu mais no ultimo lancamento?"

## Modelo de Dados — As 3 Camadas de Analise

### Camada 1: Metricas de Midia (Meta Ads API — ja disponivel via EPIC-6)

| Metrica | Formula | Nivel |
|---------|---------|-------|
| Spend | direto da API | campanha, ad set, ad |
| Impressions | direto da API | campanha, ad set, ad |
| Reach | direto da API | campanha, ad set, ad |
| Clicks | direto da API | campanha, ad set, ad |
| CTR | cliques / impressoes | campanha, ad set, ad |
| CPC | gasto / cliques | campanha, ad set, ad |
| CPM | (gasto × 1000) / impressoes | campanha, ad set, ad |

### Camada 2: Leads + Qualificacao (Google Sheets CRM + Pesquisa)

| Dado | Fonte | Atribuicao |
|------|-------|------------|
| Total de leads | Sheets (aba CRM/leads) | UTM Campaign → campanha |
| Lead por ad set | Sheets (aba CRM/leads) | UTM Medium → ad set |
| Lead por ad | Sheets (aba CRM/leads) | UTM Content → ad |
| CPL (custo por lead) | Ads spend / total leads | por campanha, ad set, ad |
| Lead qualificado | Sheets (aba pesquisa) | Perfil configuravel (ex: mulher, renda >5k, catolica, ate 2 filhos) |
| CPL qualificado | Ads spend / leads qualificados | por campanha, ad set, ad |
| Taxa qualificacao | qualificados / total leads | por campanha, ad set, ad |

### Camada 3: Vendas (Google Sheets)

| Dado | Fonte | Atribuicao |
|------|-------|------------|
| Vendas | Sheets (aba vendas) | UTM Campaign/Medium/Content |
| Custo por venda | Ads spend / vendas | por campanha, ad set, ad |
| ROAS real | receita vendas / Ads spend | por campanha, ad set, ad |
| Taxa conversao | vendas / total leads | por campanha, ad set, ad |
| Taxa conversao qualificado | vendas / leads qualificados | por campanha, ad set, ad |

### Estrutura de UTMs (padrao do gestor)

```
UTM Campaign  → nome ou ID da campanha
UTM Medium    → nome ou ID do ad set (publico)
UTM Content   → nome ou ID do ad (criativo)
```

O cruzamento entre Meta Ads API e Google Sheets e feito por match de UTM Campaign = campaign name/id, UTM Medium = adset name/id, UTM Content = ad name/id.

## Epic Scope

**Fase 1 (MVP — implementar agora):**
- Google Sheets API integration (Service Account — ja pronta)
- Configuracao de planilha por projeto: URL da planilha, mapeamento de abas
- Dashboard de metricas de midia com graficos (spend, CTR, CPC, CPM por dia/periodo)
- Cruzamento Ads × CRM: leads por UTM com CPL real
- Tabela consolidada: campanha | spend | impressoes | cliques | CTR | CPC | CPM | leads | CPL

**Fase 2 (proximo ciclo):**
- Lead Qualification Engine: importar pesquisa de captacao, classificar leads por perfil
- Sales Funnel: vendas por UTM, ROAS real, custo por venda
- Full Funnel Dashboard: visao consolidada das 3 camadas
- Comparativo entre periodos/lancamentos

**Out of Scope:**
- Criacao/edicao de campanhas via API
- Google Ads / TikTok Ads (outras plataformas)
- Export PDF/CSV (futuro)
- Alertas automaticos de budget/performance
- Integracao com Minds (tool de metricas — futuro epic)

## Technical Approach

### Google Sheets API

- **Auth:** Service Account (JSON key no backend, env var `GOOGLE_SERVICE_ACCOUNT_KEY`)
- **Lib:** `googleapis` package (oficial Google)
- **Fluxo:** Usuario compartilha planilha com email da SA → backend acessa via API
- **Dados:** `sheets.spreadsheets.get` (lista abas) + `sheets.spreadsheets.values.get` (dados da aba)
- **Cache:** TTL 5min para lista de abas, 15min para dados (configurable)

### Novas tabelas

**`google_sheets_connections`:**
```
id (uuid PK)
project_id (uuid FK → projects) UNIQUE
spreadsheet_id (varchar 200) — ID extraido da URL do Sheets
spreadsheet_url (text) — URL completa para referencia
spreadsheet_name (varchar 200) — nome da planilha (extraido via API)
is_active (boolean, default true)
created_by (uuid FK → users)
created_at (timestamp)
updated_at (timestamp)
```

**`google_sheets_tab_mappings`:**
```
id (uuid PK)
connection_id (uuid FK → google_sheets_connections)
tab_name (varchar 200) — nome da aba na planilha
tab_type (varchar 50) — 'leads' | 'survey' | 'sales'
column_mapping (jsonb) — mapeamento de colunas: { utm_campaign: "coluna A", utm_medium: "coluna B", ... }
is_active (boolean, default true)
created_at (timestamp)
updated_at (timestamp)
UNIQUE(connection_id, tab_name)
```

### Padroes a seguir (existentes no projeto)

- **Service pattern:** `packages/api/src/services/meta-ads.ts` (rate limiting, caching, error handling)
- **Route pattern:** `packages/api/src/routes/meta-ads.ts` (Fastify plugin + Zod validation)
- **Schema pattern:** `packages/api/src/db/schema.ts` (Drizzle ORM)
- **Hook pattern:** `packages/web/lib/hooks/use-meta-ads.ts` (React Query)
- **Settings UI pattern:** `packages/web/app/(app)/settings/traffic/page.tsx`
- **Dashboard pattern:** `packages/web/app/(app)/traffic/page.tsx`
- **Encryption:** `packages/api/src/services/encryption.ts` (AES-256-GCM) — para SA key se necessario

### Dashboard UI (Ads Analytics)

- **Graficos:** Recharts (ja presente no projeto ou adicionar se necessario)
- **Filtros:** Periodo (7d, 30d, 90d, custom), conta Meta Ads, projeto
- **Tabela principal:** Campanha | Spend | Impressions | Clicks | CTR | CPC | CPM | Leads | CPL
- **Drill-down:** Campanha → Ad Sets → Ads (expandir linhas)
- **Timeline:** Grafico de linha com spend diario + cliques diarios

---

## Stories — Fase 1

### Story 7.1: Google Sheets Integration — Schema + API Service

> Criar tabelas de conexao com Google Sheets, servico de integracao com Sheets API, e rotas para conectar planilha, listar abas e mapear colunas.

- **Executor:** `@dev` (schema: `@data-engineer`)
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[schema_validation, code_review, security_scan]`
- **Scope:** DB schema, migration, google-sheets.ts service, rotas API, env config
- **AC:**
  1. Tabelas `google_sheets_connections` e `google_sheets_tab_mappings` criadas com migration Drizzle
  2. Service `google-sheets.ts`: conectar via Service Account, validar acesso a planilha, listar abas, ler dados de aba
  3. `POST /api/google-sheets/connections` — conectar planilha (valida acesso, extrai nome e abas)
  4. `GET /api/google-sheets/connections/:projectId` — retorna conexao do projeto com abas mapeadas
  5. `DELETE /api/google-sheets/connections/:id` — remove conexao
  6. `PUT /api/google-sheets/connections/:id/tabs` — mapear abas (tipo + colunas UTM)
  7. `GET /api/google-sheets/connections/:id/tabs/:tabName/preview` — preview dos primeiros 10 rows da aba (para auxiliar mapeamento)
  8. `GET /api/google-sheets/connections/:id/tabs/:tabName/data` — retorna dados completos da aba com mapeamento aplicado
  9. Rate limiting: 60 req/min (quota Sheets API: 300 req/min por projeto)
  10. Env var `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON stringified da SA key)
  11. Validacao: ao conectar, confirma que SA tem acesso a planilha (erro claro se nao compartilhada)

---

### Story 7.2: Ads Analytics Dashboard — Metricas de Midia

> Transformar o shell de /traffic em dashboard completo com graficos de performance, tabela de campanhas com metricas calculadas, e drill-down por ad set e ad.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, ui_validation]`
- **Scope:** Dashboard UI, graficos, tabela de campanhas, filtros, hooks adicionais
- **AC:**
  1. Dashboard `/traffic` com seletor de conta Meta Ads e filtro de periodo (7d, 14d, 30d, 90d)
  2. Cards de resumo: total spend, total impressions, total clicks, CTR medio, CPC medio, CPM medio
  3. Grafico de linha: spend diario + clicks diarios no periodo (Recharts ou chart lib)
  4. Tabela de campanhas: nome | status | spend | impressions | clicks | CTR | CPC | CPM
  5. Metricas calculadas no frontend: CTR = clicks/impressions, CPC = spend/clicks, CPM = (spend×1000)/impressions
  6. Drill-down: clicar em campanha expande ad sets; clicar em ad set expande ads
  7. `GET /api/meta-ads/accounts/:id/adsets?campaignId=X` — nova rota para ad sets de uma campanha
  8. `GET /api/meta-ads/accounts/:id/ads?adsetId=X` — nova rota para ads de um ad set
  9. `GET /api/meta-ads/accounts/:id/insights/daily?days=30` — nova rota para insights diarios (breakdown por dia)
  10. Hooks: `useMetaAdsAdSets(accountId, campaignId)`, `useMetaAdsAds(accountId, adsetId)`, `useMetaAdsDailyInsights(accountId, days)`
  11. Loading skeletons para graficos e tabelas
  12. Empty state quando conta nao tem campanhas ativas

---

### Story 7.3: Google Sheets Settings UI + Tab Mapping

> Criar interface em Settings para conectar planilha Google Sheets ao projeto, visualizar abas, e mapear colunas de UTM para cada tipo de dado (leads, pesquisa, vendas).

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, ui_validation]`
- **Scope:** Settings UI para Sheets, mapeamento de abas, preview de dados
- **AC:**
  1. Nova secao "Google Sheets" na pagina `/settings/traffic` (abaixo das contas Meta Ads)
  2. Formulario: colar URL da planilha → sistema valida acesso e extrai nome + lista de abas
  3. Mostrar nome da planilha conectada com status (ativo/inativo) e botao de remover
  4. Lista de abas da planilha com tipo atribuido: "Leads", "Pesquisa", "Vendas" ou "Nao mapeada"
  5. Ao selecionar tipo da aba, preview das primeiras 10 linhas para o usuario identificar colunas
  6. Mapeamento de colunas: para aba "Leads" → selecionar coluna de UTM Campaign, UTM Medium, UTM Content
  7. Mapeamento de colunas: para aba "Vendas" → selecionar coluna de UTM Campaign, UTM Medium, UTM Content, valor da venda
  8. Mapeamento de colunas: para aba "Pesquisa" → selecionar colunas de perfil (renda, sexo, filhos, etc.)
  9. Hooks: `useGoogleSheetsConnection(projectId)`, `useConnectGoogleSheet()`, `useMapSheetTab()`
  10. Validacao: erro claro se planilha nao compartilhada com SA, se aba vazia, se colunas obrigatorias nao mapeadas

---

### Story 7.4: CRM Crossover — Leads por UTM + CPL Real

> Cruzar dados de leads do Google Sheets com dados de campanhas do Meta Ads via UTM para calcular conversoes reais, CPL por campanha/ad set/ad.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, pattern_validation]`
- **Scope:** Servico de cruzamento, rotas de analytics, integracao no dashboard
- **AC:**
  1. Service `traffic-analytics.ts`: cruza dados Meta Ads + Google Sheets leads via UTM
  2. Logica de match: UTM Campaign ↔ campaign name/id, UTM Medium ↔ adset name/id, UTM Content ↔ ad name/id
  3. `GET /api/traffic/analytics/:projectId/campaigns?days=30` — campanhas com metricas de midia + leads + CPL
  4. `GET /api/traffic/analytics/:projectId/adsets?campaignId=X&days=30` — ad sets com leads + CPL
  5. `GET /api/traffic/analytics/:projectId/ads?adsetId=X&days=30` — ads com leads + CPL
  6. Resposta inclui: campanha | spend | impressions | clicks | CTR | CPC | CPM | leads | CPL
  7. Tabela no dashboard atualizada com colunas de Leads e CPL (quando Sheets conectado)
  8. Indicador visual quando projeto tem Sheets conectado vs. apenas metricas de midia
  9. Cache de dados cruzados: TTL 15min (invalidar ao re-mapear abas)
  10. Tratamento de UTMs nao encontradas: mostrar leads "sem atribuicao" separadamente

---

## Stories — Fase 2

### Story 7.5: Lead Qualification Engine — Perfil + Classificacao Automatica

> Importar dados de pesquisa de captacao do Google Sheets, configurar perfil de lead qualificado por projeto, e classificar leads automaticamente para calcular CPL qualificado.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, pattern_validation]`
- **Scope:** DB schema (qualification_profiles), servico de classificacao, rotas API, settings UI, dashboard update
- **Depends on:** 7.1, 7.3, 7.4
- **AC:**
  1. Nova tabela `qualification_profiles` — perfil qualificado por projeto: regras em JSONB (ex: `[{field: "sexo", operator: "equals", value: "feminino"}, {field: "renda", operator: "gte", value: "5000"}, ...]`)
  2. `POST /api/traffic/qualification/:projectId` — criar/atualizar perfil de qualificacao
  3. `GET /api/traffic/qualification/:projectId` — retorna perfil configurado
  4. Service `lead-qualification.ts`: cruza leads com dados da aba "survey" (pesquisa) da Sheets via UTM; aplica regras do perfil; classifica cada lead como qualificado ou nao
  5. Operadores suportados: `equals`, `not_equals`, `gte`, `lte`, `contains`, `in` (para arrays como religiao)
  6. Lead qualificado = TODOS os criterios do perfil satisfeitos (AND logico)
  7. `GET /api/traffic/analytics/:projectId/campaigns` atualizado — retorna campos adicionais: `qualifiedLeads`, `cplQualified`, `qualificationRate`
  8. Mesma logica para adsets e ads (drill-down com metricas de qualificacao)
  9. Settings UI: nova secao "Perfil de Lead Qualificado" em `/settings/traffic` — formulario para adicionar regras (campo + operador + valor)
  10. Settings UI: preview — "X de Y leads seriam qualificados com este perfil" (dry-run antes de salvar)
  11. Dashboard: colunas Qualificados, CPL Qual, Taxa Qual visíveis quando perfil configurado
  12. Cache invalidado ao atualizar perfil
  13. `pnpm typecheck` e `pnpm lint` passam

**Exemplo do gestor:**
> No caso da Fernanda Zaparoli, o perfil que mais converteu foi: mulher, com ate dois filhos, renda acima de 5 mil e catolica.

Configuracao correspondente:
```json
[
  { "field": "sexo", "operator": "equals", "value": "feminino" },
  { "field": "filhos", "operator": "lte", "value": "2" },
  { "field": "renda", "operator": "gte", "value": "5000" },
  { "field": "religiao", "operator": "equals", "value": "catolica" }
]
```

---

### Story 7.6: Sales Funnel Analysis — Vendas por UTM + ROAS Real

> Cruzar dados de vendas do Google Sheets com campanhas via UTM para calcular vendas reais, custo por venda, ROAS real e taxa de conversao por campanha/ad set/ad.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, pattern_validation]`
- **Scope:** Servico de vendas, rotas API expandidas, dashboard update
- **Depends on:** 7.1, 7.4
- **AC:**
  1. Service `sales-analytics.ts`: le aba "sales" do Sheets via `getTabData()` com column mapping (utmCampaign, utmMedium, utmContent, valor)
  2. Contagem de vendas por UTM — mesmo padrao de `countLeadsByUtm()` do traffic-analytics
  3. Calculo de receita: somar coluna "valor" agrupada por UTM
  4. `GET /api/traffic/analytics/:projectId/campaigns` atualizado — campos adicionais: `sales`, `revenue`, `costPerSale`, `roas`, `conversionRate`
  5. `costPerSale` = spend / sales (null se sales = 0)
  6. `roas` = revenue / spend (null se spend = 0)
  7. `conversionRate` = sales / leads × 100 (null se leads = 0)
  8. Mesma logica para adsets e ads
  9. Dashboard: colunas Vendas, Custo/Venda, ROAS visíveis quando aba "sales" mapeada
  10. Analise por criativo: "este ad trouxe 60 leads, 50 qualificados, vendeu 25" — todos os dados numa linha
  11. Vendas sem UTM mostradas como "sem atribuicao"
  12. Cache compartilhado com traffic-analytics (mesma TTL 15min)
  13. `pnpm typecheck` e `pnpm lint` passam

**Metricas finais por linha da tabela (quando tudo conectado):**
```
campanha | spend | impressions | clicks | CTR | CPC | CPM | leads | CPL | qualificados | CPL qual | vendas | custo/venda | ROAS
```

---

### Story 7.7: Full Funnel Dashboard — Visao Consolidada

> Refatorar o dashboard /traffic para exibir visao consolidada das 3 camadas (midia + qualificacao + vendas) com funil visual, tabela master, e seletor de projeto.

- **Executor:** `@dev`
- **Quality Gate:** `@architect`
- **Quality Gate Tools:** `[code_review, ui_validation]`
- **Scope:** Dashboard UI refactor, funil visual, tabela master, filtros por projeto
- **Depends on:** 7.2, 7.4, 7.5, 7.6
- **AC:**
  1. Dashboard `/traffic` com seletor de projeto (alem de conta Meta Ads) — projeto determina se tem CRM/qualificacao/vendas
  2. Badge visual por projeto: "Midia" (cinza), "CRM Conectado" (verde), "Qualificacao" (azul), "Vendas" (amarelo)
  3. Funil visual (Recharts FunnelChart ou componente custom): Impressions → Clicks → Leads → Qualificados → Vendas — com taxas de conversao entre cada etapa
  4. SummaryCards expandidos: Total Spend, Leads, CPL, Qualificados, CPL Qual, Vendas, ROAS
  5. Tabela master com TODAS as colunas: Nome | Spend | Impressions | Clicks | CTR | CPC | CPM | Leads | CPL | Qual | CPL Qual | Vendas | Custo/Venda | ROAS
  6. Colunas condicionais: Leads/CPL so aparecem se CRM; Qual so aparece se perfil configurado; Vendas/ROAS so aparece se aba sales mapeada
  7. Drill-down completo: campanha → ad sets → ads — todas metricas em todos niveis
  8. Linha "Sem atribuicao" no final da tabela com leads/vendas que nao matcharam
  9. Sorting: clicar em header da coluna ordena por aquela metrica (asc/desc)
  10. Destaque visual: melhor e pior campanha por cada metrica (verde/vermelho sutil)
  11. Loading states e empty states para cada secao
  12. `pnpm typecheck` e `pnpm lint` passam

---

## Compatibility Requirements

- [x] EPIC-6 intacto — contas Meta Ads, rotas CRUD, UI de settings nao modificados
- [x] Schema changes sao aditivas — tabelas novas, nenhuma existente alterada
- [x] Padroes de UI consistentes (sidebar, settings, cards, hooks)
- [x] Permissoes: admin/manager configuram Sheets; gestores veem dashboard por projeto

## Risk Mitigation

- **Primary Risk:** Planilha do Google Sheets com formato inconsistente (colunas mudam entre lancamentos)
  - **Mitigation:** Preview de dados antes de mapear + mapeamento flexivel por aba + validacao de colunas obrigatorias
- **Secondary Risk:** Quota da Google Sheets API (300 req/min por projeto)
  - **Mitigation:** Cache agressivo (15min TTL) + rate limiting no service (60 req/min)
- **Tertiary Risk:** UTMs inconsistentes entre Meta Ads e planilha
  - **Mitigation:** Match flexivel (case-insensitive, trim whitespace) + mostrar leads "sem atribuicao" para o gestor identificar problemas
- **Rollback Plan:** Drop tabelas google_sheets_*; remover rotas e UI (zero impacto no EPIC-6)

## Definition of Done

**Fase 1 (COMPLETA — Stories 7.1-7.4):**
- [x] Google Sheets API integrada via Service Account
- [x] Tabelas criadas e migration aplicada
- [x] CRUD de conexao Sheets funcionando via API
- [x] UI de settings com mapeamento de abas + preview
- [x] Dashboard de metricas de midia com graficos e tabela de campanhas
- [x] Drill-down por ad set e ad
- [x] Cruzamento Ads × CRM leads via UTM funcionando
- [x] Tabela consolidada com metricas de midia + leads + CPL
- [x] Zero regressao em EPIC-6 e funcionalidades existentes

**Fase 2:**
- [ ] Lead Qualification Engine funcionando
- [ ] Sales Funnel com ROAS real
- [ ] Full Funnel Dashboard consolidado
