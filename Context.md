# Context — Loyola X Dashboard Epic 18

**Data:** 2026-04-20 | **Branch:** `feat/story-18.6-survey-integration` | **Status:** Story 18.6 em **Ready for Review**

---

## 📋 Visão Geral do Projeto

### Epic 18: Cross-Reference Meta Ads + Planilhas no Funil

Objetivo: Criar dashboards analíticos no funil que **cruzam** dados da API do Meta Ads (tráfego pago) com dados das planilhas vinculadas (leads, vendas, conversões), permitindo visão unificada de performance.

### Contexto histórico

- **EPIC-17** entregou infraestrutura de planilhas genéricas (schema, API, wizard)
- **EPIC-6/7** entregou dashboard Meta Ads original (aba existente)
- **Story 18.1** criou nova aba "Meta Ads 2" com tabela diária cruzando Meta Ads API + planilha (FEITA ✓ 2026-04-18)
- **Stories 18.2-18.7** migram toda a aba Meta Ads para metodologia unificada, adicionam pesquisa (EM PROGRESSO)

### Não-Objetivos

- Modificar abas originais (Meta Ads, Pesquisas, Planilhas)
- Integração com Google Ads
- Edição/escrita de dados na planilha

---

## 🎯 Status Atual: Story 18.6 — Integração da Pesquisa

### O que é

Integrar respostas da pesquisa Tally (captação) em **dois lugares** do dashboard:

1. **Seção no fim do dash** — barras de qualificação (faturamento %, profissão %, nº funcionários %)
2. **Cards do Top Criativos** — resposta mais frequente de faturamento + profissão por criativo

### Status

| Item | Status |
|------|--------|
| Implementação | ✓ FEITA (escopo original, 18 commits) |
| Validação manual | ✓ APROVADA (2026-04-20 revalidação) |
| Scope separation | ✓ FEITA (Match de Leads → Story 18.8) |
| QA Gate | ⏳ **PRÓXIMO** (Ready for QA Gate) |
| PR | ⏳ **Pendente** (após QA PASS) |
| Branch | `feat/story-18.6-survey-integration` |

---

## 🏗️ Decisões Arquiteturais

### Metodologia de cálculo (confirmada com Danilo)

| Métrica | Denominador | Fonte |
|---------|-------------|-------|
| **CPL** | Leads pagos (da planilha) | `funnelSpreadsheets` |
| **Leads** | Total cruzado (Meta + planilha) | Ambas |
| **Pesquisa %** | Total de respostas da pesquisa | `useSheetData` (Tally) |
| **Top-1 no card** | Respostas cruzadas pro `ad_id` | `utm_content = ad_id` |

### Normalização de respostas

```typescript
function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/\s+/g, " ");
}
```

- Agrupa: "Médico", "medico", "MÉDICO" → mesma opção
- Label exibido = versão **mais comum** (moda) do grupo

### Fallback de período curto

- Se `respostas_no_período < 10` → usar **total histórico** + badge ⚠️
- Threshold = constante `SURVEY_FALLBACK_THRESHOLD` (padrão: 10)
- Cenário típico: filtro de 7 dias em funil de baixo volume

### Colunas esperadas (case-insensitive)

| Pergunta | Matchers | Usado em |
|----------|----------|----------|
| Faturamento | "faturamento mensal", "faturamento" | Seção 3.a + Cards 3.b |
| Profissão | "profissão", "profissao", "ocupação", "ocupacao" | Seção 3.a + Cards 3.b |
| Nº funcionários | "funcionários", "funcionarios", "colaboradores", "equipe" | Seção 3.a apenas |
| Timestamp | "submitted at", "timestamp", "data" | Filtro de período |
| utm_content | Exato | Cruzamento com `ad_id` |

---

## 📂 Estrutura de Arquivos (Story 18.6)

### Novos (criados nesta story)

```
packages/web/
├── lib/
│   ├── constants/
│   │   └── survey-questions.ts          # SURVEY_QUESTION_MAP + SURVEY_FALLBACK_THRESHOLD
│   ├── hooks/
│   │   └── use-survey-aggregation.ts    # Hook principal — busca, normaliza, agrega surveys
│   └── utils/
│       ├── normalize-answer.ts          # normalizeAnswer() + denormalize (moda do grupo)
│       ├── top-creatives.ts             # mergeSurveyForGroup() [REFACTOR em progresso]
│       └── sheet-filters.ts             # filterSheetRowsByDays() [compartilhado com 18.2/18.5]
└── components/
    └── funnels/
        ├── survey-qualification-section.tsx  # Seção 3.a — barras horizontais
        ├── top-creatives-gallery.tsx         # Extensão 3.b — cards enriquecidos [REFACTOR em progresso]
        └── launch-dashboard.tsx              # Integração — chama hook + renderiza ambas
```

### Compartilhados (reutilizados de stories anteriores)

- `useFunnelSurveys()` — retorna surveys vinculadas (18.5)
- `useSheetData()` — retorna rows + headers (18.2/18.5)
- `filterSheetRowsByDays()` — aplica filtro temporal (18.2)

---

## 🔧 Convenções de Desenvolvimento

### Nomenclatura

| Padrão | Exemplo | Nota |
|--------|---------|------|
| Hook | `use[Purpose]` | `useSurveyAggregation`, `useCrossedFunnelMetrics` |
| Componente | `[Feature][Type]` | `SurveyQualificationSection`, `TopCreativesGallery` |
| Utility | `[verb][Noun]` ou `[noun]` | `normalizeAnswer`, `mergeSurveyForGroup`, `filterSheetRowsByDays` |
| Constante | `[SCREAMING_SNAKE_CASE]` | `SURVEY_QUESTION_MAP`, `SURVEY_FALLBACK_THRESHOLD` |

### Tipagem

- **Interfaces**: `PascalCase` (ex: `TopSurveyAnswer`, `SurveyAggregation`)
- **Record<>**: Preferir tipos explícitos quando possível (ex: `Record<string, SurveyDataByAdId>`)
- **Defaults**: Usar const, nunca função ou dynamic import sem motivo

### Commits (Conventional Commits)

```
feat(web/funnels): [descrição curta] (Story X.Y)
fix(web/funnels): [descrição curta]
docs(story-X.Y): [descrição]
refactor(web): [descrição]
```

- Prefixo: tipo + escopo
- Story como sufixo quando relevante
- Atomic: 1 tarefa por commit

### Testing & Validation

Checklist obrigatório **antes de marcar task como feita**:

```bash
pnpm run typecheck  # deve passar
pnpm run lint       # deve passar
pnpm dev            # rodar no browser e validar:
  - renderização (sem erros de console)
  - dados exibidos (manual verification)
  - filtro de data (trocar 7/30/90 dias)
  - empty states (sem surveys, sem respostas)
```

---

## 🔀 Fluxo Git & Branch Management

### Branches ativas

| Branch | Para | Status | Dependência |
|--------|------|--------|-------------|
| `feat/story-18.2-meta-ads-cards-crossref` | Story 18.2 | Ready for Review | Aguarda PR |
| `feat/story-18.3-daily-table` | Story 18.3 | Ready | Bloqueada por 18.2 PR |
| `feat/story-18.4-charts-reorg` | Story 18.4 | Ready | Bloqueada por 18.2 PR |
| `feat/story-18.5-top-creatives` | Story 18.5 | Ready for Review | Aguarda PR |
| `feat/story-18.6-survey-integration` | Story 18.6 | In Review (QA PASS) | Aguarda @devops PR |
| `feat/story-18.8-match-leads` | Story 18.8 | Draft | Bloqueada por 18.6 merge |
| `feat/story-18.7-meta-features-audit` | Story 18.7 | Ready | Bloqueada por 18.2-18.6 |

### Branch protection

- `main` exige **PR obrigatória** (nenhum push direto)
- Merges bloqueadas até:
  1. PR aprovado por @po (Product Owner)
  2. @qa valida (QA Gate = PASS ou CONCERNS)
  3. @devops executa `git push` + PR merge

### Fluxo de Push

```
1. Commit local na branch feat/
2. @devops → gh pr create [title] [body]
3. Aguarda revisão + QA Gate
4. @devops → gh pr merge
```

---

## 📊 Dados & Integração

### Pipeline de dados (Story 18.6)

```
useFunnelSurveys()
    ↓
useSheetData() [por cada survey]
    ↓
useSurveyAggregation() [agrupa tudo]
    ├─ Normaliza respostas
    ├─ Mapeia colunas
    ├─ Aplica filtro por data
    └─ Retorna byQuestion + byAdId
    ↓
TopCreativesGallery (consome byAdId)
SurveyQualificationSection (consome byQuestion)
```

### Tipo de retorno do hook

```typescript
interface SurveyAggregation {
  byQuestion: {
    faturamento: Array<{ label: string; count: number; pct: number }>;
    profissao: Array<{ label: string; count: number; pct: number }>;
    funcionarios: Array<{ label: string; count: number; pct: number }>;
  };
  byAdId: Record<string, {
    faturamento: Array<{ label: string; count: number }>;
    profissao: Array<{ label: string; count: number }>;
    funcionarios: Array<{ label: string; count: number }>;
    voce_e: Array<{ label: string; count: number }>;
  }>;
  totalResponses: number;
  usingFallback: boolean;
  fallbackReason?: string;
}
```

---

## ✅ Acceptance Criteria (10 ACs)

**Status:** 9/10 atendidas (AC6 empty states em validação)

| AC | Descrição | Status |
|----|-----------|--------|
| AC1 | Hook `useSurveyAggregation` implementado | ✓ |
| AC2 | Filtro data com fallback `< 10` | ✓ |
| AC3 | Seção "Resultados da Pesquisa" (3.a) com barras | ✓ |
| AC4 | Top Criativos enriquecido com faturamento + profissão (3.b) | ✓ |
| AC5 | Integração no `LaunchDashboard` | ✓ |
| AC6 | Empty states (sem surveys, sem respostas) | ✓ |
| AC7 | Normalização agrupa variações | ✓ |
| AC8 | Filtro de data efetivo (7/30/90 dias) | ✓ |
| AC9 | Sem regressão em outras abas | ✓ |
| AC10 | Validação numérica (% somam ~100%) | ⏳ Aguardando commit do refactor |

---

## 🚀 Próximos Passos

### Imediato (hoje)

1. **Committar mudanças pendentes** (refactor `TopSurveyAnswer`)
   ```bash
   git add packages/web/components/funnels/top-creatives-gallery.tsx
   git add packages/web/lib/utils/top-creatives.ts
   git commit -m "refactor(web): simplify TopSurveyAnswer — remove totalResponses field"
   ```

2. **Validar AC10** (validação numérica) no browser
   - Rodar `pnpm dev`
   - Abrir funil de referência
   - Verificar que % somam ~100% na seção 3.a
   - Verificar que counts de `byAdId` batem com dados exibidos

3. **Ativar QA Gate**
   - Story 18.6 está Ready for Review
   - Próximo passo: @qa valida (7 quality checks)
   - Se PASS → @devops cria PR

### Follow-up (próxima sessão)

- **Se QA PASS:** @devops cria PR, merges para main
- **Se QA CONCERNS:** fix rápido (deve ser trivial agora)
- **Próxima story:** 18.2 (já pronta, aguardando 18.6 PR)

---

## 📚 Referências Documentadas

### Memória de projeto

- `project_epic_18_dashboard_improvements.md` — visão geral de todas 6 stories
- `project_story_18_1.md` — Status 18.1 (feita, validada)
- `feedback_dashboard_date_filter.md` — Lição aprendida: filtro de data é crítico

### Stories relacionadas

- `docs/stories/18.1.meta-ads-spreadsheet-crossref-tab.md` — Base (tabela diária Meta Ads 2)
- `docs/stories/18.5.top-creatives-aggregation-and-cpl.md` — Antes (Top Criativos base)
- `docs/stories/18.6.survey-integration-qualification-and-top-creatives.md` — Atual

---

## 💡 Dicas para Continuação

### Se você recebe "Context not available"

- Leia este `Context.md` (você o está lendo agora ✓)
- Abra `docs/stories/18.6.survey-integration-qualification-and-top-creatives.md` (spec completa)
- Consulte git log: `git log --oneline -20` mostra os 10 commits desta story

### Se precisa entender uma decisão

- Commits: `git log --all --grep="Story 18.6"` mostra decisões rationale
- Story file: seções "Contexto", "Decisão arquitetural", "Dev Notes" documentam **why**

### Se acha que há um bug

- Tipo: `pnpm run typecheck`
- Lint: `pnpm run lint`
- Visual: `pnpm dev` + browser → console + Network tab

---

**Last updated:** 2026-04-20 | **Próximo review:** Após QA Gate (Story 18.6) ou antes de começar Story 18.7
