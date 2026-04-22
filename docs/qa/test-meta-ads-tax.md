# QA Teste: Imposto de 12,15% em Meta Ads (Story 18.13)

## Resumo da Mudança
Todos os valores de investimento (spend) em Meta Ads para datas **2026 em diante** agora incluem acréscimo de **12,15%** referente a impostos.

## Implementação
- **Arquivo:** `packages/web/lib/utils/funnel-metrics.ts`
- **Funções alteradas:**
  - `applyMetaAdsTax(spendValue, dateStr)` — função que aplica o imposto
  - `sumMetaInsights()` — agrega insights e aplica imposto
  - `aggregateMetaDailyByDate()` — agrega por data e aplica imposto
- **Taxa:** 1.1215 (12,15% de acréscimo = spend × 1.1215)

## Comportamento Esperado

### Regra de Aplicação
- ✅ **2026 em diante:** spend × 1.1215
- ✅ **Antes de 2026 (2025 ou anterior):** spend sem alteração
- ✅ **Spend = 0 ou negativo:** retorna como-é (sem multiplicação)

### Exemplos Numéricos
| Data | Spend Original | Spend com Imposto | Cálculo |
|------|---|---|---|
| 2025-12-31 | R$ 100,00 | R$ 100,00 | sem imposto |
| 2026-01-01 | R$ 100,00 | R$ 112,15 | 100 × 1.1215 |
| 2026-04-22 | R$ 500,00 | R$ 560,75 | 500 × 1.1215 |
| 2027-01-01 | R$ 250,00 | R$ 280,38 | 250 × 1.1215 |

## Dashboards Impactados

### 1. **Perpetual Dashboard**
- Localização: `/app/funnels/[id]/perpetual`
- Cards afetados:
  - **Investimento** card → exibe valor com imposto
  - **CPL Pago / CPL Geral** cards → recalculados com spend ajustado
  - **ROAS** card → recalculado com spend ajustado

### 2. **Launch Dashboard**
- Localização: `/app/funnels/[id]/launch`
- Cards afetados:
  - **Investimento** card → exibe valor com imposto
  - **CPL Pago / CPL Geral** cards → recalculados com spend ajustado
  - **ROAS** card → recalculado com spend ajustado

### 3. **Dados Diários (Tabela)**
- Localização: Tab "Dados diários" em qualquer dashboard
- Colunas afetadas:
  - **Spend** → exibe com imposto aplicado
  - **CPM** (Spend ÷ Impressions × 1000) → recalculado
  - **CPC** (Spend ÷ Link Clicks) → recalculado
  - **CPL Pago** → recalculado
  - **CPL Geral** → recalculado

### 4. **Gráficos**
- **Hot/Cold Spend Donut** → exibe distribuição com imposto
- **CPL Comparison Chart** → barras de invest com imposto
- **Crossed Funnel Daily Table** → colunas de spend e métricas derivadas

## Teste Manual

### Pré-requisitos
- [ ] Dev server rodando: `pnpm dev`
- [ ] Acessado em `http://localhost:3000`
- [ ] Autenticado (Clerk login)
- [ ] Funil selecionado com dados Meta Ads de **2026 em diante**

### Procedimento

#### 1️⃣ Verificar Spend em Card (Perpetual Dashboard)
1. Navegue para: `/app/funnels/[funnel-id]/perpetual`
2. Localize o card **"Investimento"**
3. Clique no card para abrir o memorial de cálculo
4. **Verificar:**
   - [ ] Expression mostra "Σ spend"
   - [ ] Valor exibido é o original × 1.1215
   - [ ] Se houver dados de 2025, o valor deve ser diferente dos de 2026+
5. **Exemplo:** Se a API retorna R$ 500 para 2026, o card deve exibir **R$ 560,75**

#### 2️⃣ Verificar CPL (Cost Per Lead)
1. No mesmo dashboard, localize cards **"CPL Pago"** e **"CPL Geral"**
2. Clique para abrir memorial de cálculo
3. **Verificar:**
   - [ ] Numerador (Investimento) mostra spend com imposto
   - [ ] Denominador (Leads) é o mesmo (não afetado)
   - [ ] Resultado final = spend_ajustado ÷ leads
4. **Exemplo:** Se spend é R$ 560,75 e leads = 5, então CPL = R$ 112,15

#### 3️⃣ Verificar ROAS (Return on Ad Spend)
1. Localize card **"ROAS"** no dashboard
2. Clique para abrir memorial
3. **Verificar:**
   - [ ] ROAS = Revenue ÷ spend_ajustado
   - [ ] Se revenue aumentou mas spend também, ROAS pode diminuir

#### 4️⃣ Verificar Tabela de Dados Diários
1. Navigate to "Dados diários" tab
2. **Verificar coluna "Spend":**
   - [ ] Valores de 2026 em diante são maiores que na API (× 1.1215)
   - [ ] Valores de 2025 ou anterior são iguais à API
   - [ ] Valor total (soma) no rodapé inclui imposto

3. **Verificar coluna "CPM":**
   - [ ] Recalculado como: (spend_ajustado ÷ impressions) × 1000
   - [ ] Deve aumentar proporcionalmente ao spend

4. **Verificar colunas de CPL:**
   - [ ] CPL Pago = spend_ajustado ÷ leads_pagos
   - [ ] CPL Geral = spend_ajustado ÷ total_leads
   - [ ] Ambos devem aumentar comparados à versão anterior

#### 5️⃣ Verificar Gráficos
1. **Hot/Cold Spend Donut:**
   - [ ] Slice size reflete spend com imposto
   - [ ] Percentuais estão corretos

2. **CPL Comparison Chart:**
   - [ ] Barras de investimento mostram valores com imposto
   - [ ] Linhas de CPL refletem novo cálculo

#### 6️⃣ Comparação: Antes vs Depois
Se houver dados cruzados (Meta Ads + planilha):
- [ ] Dados de 2025 → spend é o original (sem imposto)
- [ ] Dados de 2026 → spend é original × 1.1215
- [ ] Transição é clara na tabela (2025 vs 2026)

## Edge Cases

### Teste Negativo
1. **Dados de 2025:**
   - Spend na API: R$ 100
   - Esperado no dashboard: R$ 100 (sem imposto)
   - [ ] Verificado ✓

2. **Dados de 2027+:**
   - Spend na API: R$ 100
   - Esperado: R$ 112,15 (com imposto)
   - [ ] Verificado ✓

3. **Spend = 0:**
   - Se uma campanha tem R$ 0 em spend
   - Esperado: 0 (sem multiplicação)
   - [ ] Verificado ✓

### Teste de Período Misto
Se o dashboard mostra dados de **2025 + 2026**:
- [ ] Total = (2025_spend × 1) + (2026_spend × 1.1215)
- [ ] Não é total × 1.1215 (aplicado linha-por-linha, não no agregado)
- [ ] Verificado ✓

## Nota Importante
⚠️ **A taxa é aplicada uma única vez durante a agregação de dados.** Isso significa:
- Não há risco de duplicação (5% × 5% etc)
- Downstream calculations (CPL, ROAS, CPM) usam valores já ajustados
- A data vem de `date_start` do Meta Ads API insight

## Conclusão
- [ ] Todos os testes passaram
- [ ] Valores estão corretos em todos os dashboards
- [ ] Histórico (2025 vs 2026) está claro
- [ ] Cálculos derivados (CPL, ROAS) estão consistentes

---
**Data de Teste:** 2026-04-22
**Testador:** [seu nome]
**Status:** ⚠️ Aguardando teste manual
