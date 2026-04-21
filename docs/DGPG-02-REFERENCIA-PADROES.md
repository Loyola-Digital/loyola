# DGPG 02 — Referência de Padrões (Funil de Referência)

**Data:** 2026-04-20
**Funil de Referência:** e25369be-1d04-4153-8178-14a3b617e70e / 5492a226-4378-44fa-8775-dec28140117e
**Etapa de Referência:** 2b8bff9a-4143-42da-8c76-fd3018a340cc

**DGPG 02:**
- Spreadsheet ID: `1CAcB2gq8XkQG0hY-QkHwT5sS57eXeSV89sw92QuPEwo`
- Sheet Name: `n8n-kiwify-captação` (ou variante)
- Tipo: Leads (contagem via planilha)

---

## Sumário de Cálculos Canônicos

Todos os cálculos abaixo estão implementados no funil de referência. **Replicar exatamente** para DGPG 02.

---

## 1. INVESTIMENTO (Spend)

**Fonte:** Meta Ads API  
**Campo API:** `spend`  
**Fórmula:** `SUM(campaign.spend)` para todas as campanhas do período

**Implementação:**
```typescript
// packages/web/lib/utils/funnel-metrics.ts

export function sumMetaInsights(allInsights: CampaignDailyInsight[][]): {
  spend: number;
  impressions: number;
  linkClicks: number;
  lpViews: number;
} {
  let spend = 0;
  for (const insights of allInsights) {
    for (const row of insights) {
      spend += parseFloat(row.spend || "0");  // ← Investimento
    }
  }
  return { spend, impressions, linkClicks, lpViews };
}
```

---

## 2. LEADS (Contagem via Planilha)

**Fonte:** Planilha vinculada (não Meta Ads API)  
**Arquivo:** `use-crossed-funnel-metrics.ts`  
**Lógica:** Contar linhas da planilha, categorizar por `utm_source`

### 2.1 Classificação de Origem

**3 categorias:**

| Categoria | Critério | Exemplo utm_source |
|-----------|----------|-------------------|
| **Leads Pagos** | utm_source ∈ PAID_SOURCES | "meta", "meta-ads", "google-ads" |
| **Leads Orgânicos** | utm_source preenchido mas não é pago | "organico", "facebook-organico", qualquer outro |
| **Sem Origem** | utm_source vazio / ausente / coluna não mapeada | NULL, "", não mapeado |

**PAID_SOURCES (set):**
```typescript
export const PAID_SOURCES = new Set(["meta", "meta-ads", "google-ads"]);
```

**Comparação:** case-insensitive (toLowerCase antes de consultar set)

### 2.2 Fórmula de Categorização

```typescript
export function categorizeLeads(
  rows: FunnelSpreadsheetRow[],
  utmSourceMapped: boolean,
): { leadsPagos: number; leadsOrg: number; leadsSemTrack: number } {
  let leadsPagos = 0, leadsOrg = 0, leadsSemTrack = 0;
  
  for (const row of rows) {
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    
    if (!utmSource || !utmSourceMapped) {
      leadsSemTrack += 1;  // ← Sem origem
    } else if (PAID_SOURCES.has(utmSource)) {
      leadsPagos += 1;     // ← Pago
    } else {
      leadsOrg += 1;       // ← Orgânico
    }
  }
  
  return { leadsPagos, leadsOrg, leadsSemTrack };
}
```

**Total Leads = leadsPagos + leadsOrg + leadsSemTrack**

---

## 3. CLIQUES (Link Clicks) — NÃO cliques totais

**⚠️ CRÍTICO:** Use `link_click` (ação específica), não `clicks` total

**Fonte:** Meta Ads API > `actions[]`  
**Campo:** `actions[].action_type === "link_click"` → `actions[].value`

**Implementação:**
```typescript
export function getActionValue(
  actions: { action_type: string; value: string }[] | undefined,
  type: string,
): number {
  if (!actions) return 0;
  const found = actions.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

// Uso:
const linkClicks = getActionValue(row.actions, "link_click");  // ← CORRETO
// NÃO use row.clicks (cliques totais)
```

---

## 4. CTR (Click-Through Rate)

**Fórmula:** `(linkClicks / impressions) × 100`

**Implementação:**
```typescript
// packages/web/lib/utils/funnel-metrics.ts

ctr: meta.impressions > 0 
  ? (meta.linkClicks / meta.impressions) * 100  // ← %
  : 0
```

**Comportamento:**
- Se impressões = 0 → CTR = 0 (não null, é legítimo ter 0)
- Unidade: percentual (0-100)

---

## 5. CPC (Custo Por Clique)

**Fórmula:** `investimento / linkClicks`

**Implementação:**
```typescript
export function safeDivide(num: number, den: number): number | null {
  return den > 0 ? num / den : null;  // null quando denominador = 0
}

// Uso:
cpc: safeDivide(meta.spend, meta.linkClicks) ?? 0
```

**Comportamento:**
- Se linkClicks = 0 → CPC = null (convertido a 0 na exibição, ou "—" se null)

---

## 6. CPM (Custo Por Mil Impressões)

**Fórmula:** `(investimento / impressões) × 1000`

**Implementação:**
```typescript
cpm: meta.impressions > 0 
  ? (meta.spend / meta.impressions) * 1000  // ← R$ por 1000 imp
  : 0
```

**Comportamento:**
- Se impressões = 0 → CPM = 0

---

## 7. CPL PAGO e CPL GERAL

**CPL Pago = investimento / leads pagos**  
**CPL Geral = investimento / leads totais**

**Implementação:**
```typescript
cplPg: safeDivide(meta.spend, sheet.leadsPagos),    // null se leadsPagos = 0
cplG: safeDivide(meta.spend, totalLeads),           // null se totalLeads = 0
```

**Comportamento:**
- Retorna null se denominador = 0 (exibido como "—")

---

## 8. TAXA DE RESPOSTA (Pesquisa)

**Fórmula:** `(respostas da pesquisa / leads totais) × 100`

**Implementação:**
```typescript
// Em use-survey-aggregation.ts
// surveyResponses = contagem de linhas da pesquisa vinculada
// totalLeads = leads da planilha

taxaResposta: totalLeads > 0 
  ? (surveyResponses / totalLeads) * 100 
  : null
```

**Comportamento:**
- Capped a 100% (se respostas > leads, mostrar 100%)
- Retorna null se sem surveys vinculadas

---

## 9. MATCH PESQUISA × LEADS

**Algoritmo:** Cruzar email (case-insensitive) OU últimos 8 dígitos do telefone

### 9.1 Normalização Obrigatória

**Email:**
```typescript
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
```

**Telefone:**
```typescript
export function getLast8DigitsPhone(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, "");  // Remove símbolos
  if (cleaned.length < 8) return null;       // Não há 8 dígitos
  return cleaned.slice(-8);                  // Últimos 8 dígitos
}
```

### 9.2 Lógica de Match

```typescript
interface LeadMatch {
  leadId: string;
  email: string;
  phone: string;
}

// Construir mapas de leads (pré-processamento)
const leadsByEmail = new Map<string, LeadMatch>();  // email normalizado → lead
const leadsByPhone = new Map<string, LeadMatch>();  // phone últimos 8 → lead

for (const lead of leads) {
  const normalizedEmail = normalizeEmail(lead.email);
  if (normalizedEmail) {
    leadsByEmail.set(normalizedEmail, lead);
  }
  
  const normalizedPhone = getLast8DigitsPhone(lead.phone);
  if (normalizedPhone) {
    leadsByPhone.set(normalizedPhone, lead);
  }
}

// Para cada resposta de pesquisa:
function findLeadMatch(
  surveyEmail: string, 
  surveyPhone: string
): LeadMatch | null {
  // Tentar email primeiro
  if (surveyEmail) {
    const normalizedEmail = normalizeEmail(surveyEmail);
    const match = leadsByEmail.get(normalizedEmail);
    if (match) return match;  // ← Found by email
  }
  
  // Se não achou, tentar telefone
  if (surveyPhone) {
    const normalizedPhone = getLast8DigitsPhone(surveyPhone);
    if (normalizedPhone) {
      const match = leadsByPhone.get(normalizedPhone);
      if (match) return match;  // ← Found by phone
    }
  }
  
  // Sem match
  return null;
}
```

### 9.3 Contadores

```typescript
const matchedLeadIds = new Set<string>();  // Deduplicar leads que bateram
let matchedResponses = 0;                   // COUNT(responses com match)
let unmatchedResponses = 0;                 // COUNT(responses sem match)

for (const response of surveyResponses) {
  const leadMatch = findLeadMatch(
    response.email,
    response.phone
  );
  
  if (leadMatch) {
    matchedLeadIds.add(leadMatch.leadId);   // ← Add to set (dedup)
    matchedResponses += 1;
  } else {
    unmatchedResponses += 1;
  }
}

// Validação:
matchedResponses + unmatchedResponses === surveyResponses.length  // ✓
```

---

## 10. AGREGAÇÃO DIÁRIA (Tabela Cruzada)

**Estrutura:** Cada linha = 1 dia, com todos os cálculos acima

```typescript
export interface DailyRow {
  date: string;           // YYYY-MM-DD ou "Total"
  spend: number;
  linkClicks: number;
  impressions: number;
  cpm: number;            // (spend/impressions)*1000
  cpc: number;            // spend/linkClicks
  ctr: number;            // (linkClicks/impressions)*100
  lpView: number;         // landing page views
  connectRate: number | null;  // (lpView/linkClicks)*100
  txConv: number | null;       // (totalLeads/lpView)*100
  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  cplPg: number | null;   // spend/leadsPagos
  cplG: number | null;    // spend/totalLeads
}
```

**Processo:**
1. Agregar Meta Ads por data (`YYYY-MM-DD`)
2. Agregar Planilha por data (usar coluna de data)
3. Cruzar dados de ambas fontes
4. Calcular métricas por dia
5. Linha final = "Total" agregando todas as linhas

---

## 11. INTEGRAÇÃO COM PLANILHA

**Dados necessários na planilha:**

| Campo | Tipo | Obrigatório | Uso |
|-------|------|------------|-----|
| date | Data | Sim | Filtro temporal |
| leads (count) | Número | Sim | Contagem de leads |
| utm_source | String | Não (soft) | Classificação Pagos/Org/Sem origem |
| email | String | Não (pesquisa) | Match pesquisa × leads |
| phone | String | Não (pesquisa) | Match pesquisa × leads |
| vendas (count) | Número | Não | Adicional: Total de Vendas (Story 21.3) |
| faturamento | Moeda | Não | Adicional: Faturamento Bruto (Story 21.3) |

**Mapeamento de Colunas:**
- Usuário mapeia em UI (Google Sheets modal)
- Hook detecta presença de coluna via `FunnelSpreadsheetData.mapping`

---

## 12. HOOK PRINCIPAL: `useCrossedFunnelMetrics`

**Arquivo:** `packages/web/lib/hooks/use-crossed-funnel-metrics.ts`

**Uso:**
```typescript
const metrics = useCrossedFunnelMetrics(projectId, funnel, days);

// Acesso:
console.log(metrics.spend);          // R$ total
console.log(metrics.leadsPagos);     // Contagem
console.log(metrics.totalLeads);     // leadsPagos + leadsOrg + leadsSemTrack
console.log(metrics.cpc);            // R$ por clique
console.log(metrics.ctr);            // %
console.log(metrics.cpm);            // R$ por 1000 imp
console.log(metrics.cplPago);        // R$ por lead pago (ou null)
console.log(metrics.cplGeral);       // R$ por lead total (ou null)
console.log(metrics.rows);           // DailyRow[] (tabela cruzada)
console.log(metrics.totals);         // DailyRow (linha "Total")
console.log(metrics.hasLinkedSheet); // boolean
```

---

## 13. SURVEY AGGREGATION: `useSurveyAggregation`

**Arquivo:** `packages/web/lib/hooks/use-survey-aggregation.ts`

**Retorno:**
```typescript
export interface UseSurveyAggregationResult {
  byQuestion: Record<SurveyQuestionKey, SurveyQuestionAggregation[]>;
  byAdId: SurveyDataByAdId;
  totalResponses: number;
  usingFallback: boolean;
  fallbackReason?: string;
  isLoading: boolean;
  matchedLeadIds: Set<string>;      // ← Set de IDs com match
  matchedResponses: number;          // ← COUNT com match
  unmatchedResponses: number;        // ← COUNT sem match
}
```

**Uso:**
```typescript
const survey = useSurveyAggregation(projectId, funnelId, days);

console.log(survey.matchedResponses);    // Quantos respondentes = leads
console.log(survey.unmatchedResponses);  // Quantos respondentes ≠ leads
console.log(survey.matchedLeadIds);      // Set de IDs de leads com match
```

---

## 14. DETALHAMENTOS — ONDE EXIBIR

**Em todas as tabelas e gráficos de DGPG 02:**

### Seção de Leads
```
Leads: 45 (27 Pagos | 12 Orgânicos | 6 Sem origem)
```

### Seção de Pesquisa
```
Pesquisa: 18 respostas (15 com match | 3 sem match)
Taxa de Resposta: 40%
```

**Exemplos de locais:**
- CrossedFunnelDailyTable (footer ou coluna adicional)
- CplComparisonChart (tooltip)
- LeadsCumulativeChart (stack ou legenda)
- TopCreativesGallery (card de cada criativo)
- SurveyQualificationSection (já existe, validar)
- KPI Cards (hover)

---

## 15. COMPONENTES RELEVANTES

| Arquivo | Função |
|---------|---------|
| `launch-dashboard.tsx` | Dashboard principal da etapa |
| `crossed-funnel-daily-table.tsx` | Tabela cruzada (Meta + Planilha) |
| `cpl-comparison-chart.tsx` | Gráfico CPL Pago vs CPL Geral |
| `leads-cumulative-chart.tsx` | Gráfico leads acumulados |
| `top-creatives-gallery.tsx` | Galeria de top criativos |
| `survey-qualification-section.tsx` | Resultados da pesquisa |
| `stage-sales-section.tsx` | Vendas e faturamento |
| `use-crossed-funnel-metrics.ts` | Hook de cálculos (core) |
| `use-survey-aggregation.ts` | Hook de pesquisa + match |
| `funnel-metrics.ts` | Utilities de cálculo |

---

## 16. CHECKLIST DE IMPLEMENTAÇÃO (Para @dev)

- [ ] Investimento: usar Meta Ads API `spend` (sumMetaInsights)
- [ ] Leads: usar contagem de planilha, não API
- [ ] Classificação: derivar origem (Pagos/Org/Sem origem) via `utm_source`
- [ ] Link Clicks: usar `actions[link_click]`, não cliques totais
- [ ] CTR: (linkClicks / impressions) × 100
- [ ] CPC: spend / linkClicks (safeDivide)
- [ ] CPM: (spend / impressions) × 1000
- [ ] CPL Pago: spend / leadsPagos (safeDivide)
- [ ] CPL Geral: spend / totalLeads (safeDivide)
- [ ] Taxa Resposta: (respostas / leads) × 100 (capped 100%)
- [ ] Match: email case-insensitive + últimos 8 phone digits
- [ ] Normalização: normalizeEmail(), getLast8DigitsPhone()
- [ ] Agregação: buildDailyRows(), computeTotals()
- [ ] Detalhamentos: exibir em todas tabelas/gráficos
- [ ] Validação numérica: Pagos + Org + Sem origem = Total

---

## 17. VALIDAÇÃO DE DADOS (Para Testes)

**Comparar DGPG 02 refatorado vs Funil de Referência:**

```
Período: 7 dias
Funil Referência:
  - Investimento: R$ 5.200
  - Leads: 127 (85 Pagos | 28 Org | 14 Sem)
  - CPC: R$ 40,94
  - CTR: 3.2%
  - CPM: R$ 45,61
  - CPL Pago: R$ 61,18
  - Pesquisa: 42 respostas (35 match | 7 sem)

DGPG 02 (esperado idêntico):
  - Investimento: R$ 5.200 ✓
  - Leads: 127 (85 Pagos | 28 Org | 14 Sem) ✓
  - CPC: R$ 40,94 ✓
  - CTR: 3.2% ✓
  - ... [todos os valores batem]
```

---

**Fim da Referência**

*Usar este documento como consulta durante a implementação das Stories 21.1, 21.2, 21.3.*
