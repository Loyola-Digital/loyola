# Epic 20 — Funil Comparativo

**Status:** In Progress  
**Owner:** @sm → @po → @dev

---

## Objetivo

Permitir vincular dois funis para comparação de performance. Um funil pode referenciar outro funil "anterior" (de produto ou campanha diferente). Nos dashboards, as métricas do funil atual são exibidas lado a lado com as métricas equivalentes do funil de comparação, usando índice de dia relativo (Dia 1, Dia 2…) em vez de datas calendário — o que torna o benchmark justo mesmo entre campanhas de épocas diferentes.

---

## Escopo v1

- Vínculo a nível de funil (`compare_funnel_id` no DB)
- Etapas casadas por `stage_type` (captação paga ↔ captação paga)
- Comparativo visível **somente na aba Meta Ads** (v1)
- Cards de KPI: valor atual + valor comparativo + delta %
- Gráfico diário: duas séries (atual vs comparativo), eixo X = "Dia 1", "Dia 2"…
- Sem comparação → UI limpa, sem nenhuma indicação de comparativo

---

## Stories

| Story | Título | Pontos |
|-------|--------|--------|
| 20.1 | Vinculação de Funil de Comparação (DB + API + Settings) | 3 |
| 20.2 | Meta Ads com Métricas Comparativas | 8 |

---

## Fora de Escopo (v1)

- Google Ads, Switchy, Planilhas — comparativo fica para v2
- Comparação cross-projeto (só dentro do mesmo projeto)
- Múltiplos funis de comparação (apenas 1 por funil)
