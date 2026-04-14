# EPIC-16: Memorial de Cálculo em Dashboards

## Objetivo

Tornar todas as métricas e gráficos dos dashboards **auditáveis** ao usuário final: passando o mouse sobre qualquer valor calculado (KPI ou ponto de gráfico), exibir um tooltip com **fórmula simbólica**, **valores que entraram no cálculo** e **fonte de cada dado**.

Isso aumenta a confiança do cliente nas apresentações e reduz o tempo de resposta quando alguém pergunta "de onde veio esse número?".

## Contexto

Hoje os dashboards mostram métricas calculadas (ROAS, CPL, Conversão, Taxa de Engajamento etc.) como valores prontos. Se o cliente ou o próprio Lucas tem dúvida sobre a origem do número, precisa abrir planilha, código, ou memória — ruim em reuniões e gera insegurança.

### Exemplo

```
┌─────────────────────────────┐
│  Taxa de Conversão          │
│  90%                        │ ← hover
└─────────────────────────────┘
           ↓
┌──────────────────────────────────────────────┐
│ Fórmula: Vendas ÷ Inscrições                 │
│                                              │
│ Vendas:       900    (Meta Ads)              │
│ Inscrições:   1.000  (Google Sheets — CRM)   │
│                                              │
│ Resultado: 900 ÷ 1.000 = 0,90 = 90%          │
│ Período: 20/03 — 17/06                       │
└──────────────────────────────────────────────┘
```

### Arquitetura Técnica

**Componente reutilizável** em `packages/web/components/metrics/`:

- `<MetricWithTooltip>` — wrapper de card KPI que aceita valor + memorial
- `<FormulaTooltip>` — conteúdo do tooltip (fórmula + valores + fonte)
- `<FormulaChartTooltip>` — adaptador Recharts (custom `<Tooltip content=`) que reaproveita o mesmo visual

Baseado em `shadcn/ui Tooltip` (já presente no projeto) + `Popover` se precisar de tap no mobile (fase 2).

## Escopo

**IN:**
- Componente reutilizável `<MetricWithTooltip>` + tooltip Recharts
- Aplicar em **todos os dashboards existentes** (Instagram, Meta Ads, YouTube Ads, Vendas, Conversas, Funis)
- Mostrar fórmula simbólica + valores + fonte + período
- Tooltip em KPI cards **e** em gráficos (pontos/barras)

**OUT (fase 2):**
- Comportamento touch/mobile (popover ao tap)
- Memorial para dashboards futuros ainda não existentes
- Exportação do memorial (PDF/imagem)

## Stories

| # | Story | Descrição | Tamanho |
|---|-------|-----------|---------|
| 16.1 | Componente reutilizável `<MetricWithTooltip>` + `<FormulaChartTooltip>` | Base visual e API de props do memorial | L |
| 16.2 | Memorial — Dashboard Instagram | KPI cards + reach chart | M |
| 16.3 | Memorial — Dashboard Meta Ads | ROAS/CPL/CPA/CTR cards + gráficos | L |
| 16.4 | Memorial — Dashboard YouTube Ads | CPV/VTR/completion + gráficos | M |
| 16.5 | Memorial — Dashboard Vendas | Ticket médio, conversão de funil, LTV | M |
| 16.6 | Memorial — Dashboard Conversas | Taxa resposta, tempo médio | S |
| 16.7 | Memorial — Dashboards de Funis (Launch + Perpetual) | Conversão por etapa, ROAS, revenue | M |

**Total estimado:** 1 L (16.1) + 3 M (16.2, 16.4, 16.5, 16.7) + 1 L (16.3) + 1 S (16.6)

## Dependências

- `@radix-ui/react-tooltip` (já instalado via shadcn/ui)
- `recharts` (já instalado — custom tooltip content aceita componente React)
- Cada dashboard existente já funcional

## Ordem de execução recomendada

1. **16.1 primeiro** (bloqueia todas as outras — precisa do componente pronto)
2. **16.2–16.7 podem correr em paralelo** após 16.1 (cada uma é isolada por dashboard)

## Status: Draft

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-14 | Epic created | @sm (River) |
