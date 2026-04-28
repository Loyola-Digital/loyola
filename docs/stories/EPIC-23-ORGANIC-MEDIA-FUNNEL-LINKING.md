# Epic 23 — Organic Media → Funnel Stage Linking

**Status:** Done
**Owner:** @sm → @po → @dev → @qa → @devops
**Criado em:** 2026-04-28

---

## Objetivo

Permitir que o usuário, a partir do dashboard de **Mídias Orgânicas** (YouTube e Instagram), vincule um post/vídeo orgânico a uma **etapa de funil** específica — sinalizando que aquele conteúdo é referente àquela etapa do funil. Os posts vinculados aparecem dentro do dashboard da etapa, em uma nova aba **"Mídias Orgânicas"**, com métricas atualizadas hidratadas das fontes originais (YouTube Analytics, Instagram Graph).

A vinculação é **N:N**: um post pode ser vinculado a múltiplas etapas (ex: o mesmo vídeo serve de aquecimento E de CPL), e uma etapa pode acumular múltiplos posts orgânicos.

---

## Justificativa de Negócio

Hoje o trabalho de orgânico (YouTube + Instagram) e o funil pago vivem em mundos separados. O time de tráfego mede CPL/CPA pelas campanhas, mas o time de orgânico publica conteúdo que **sustenta** as etapas do funil (aquecimento, CPL gratuito, página de vendas) sem qualquer rastreio de "qual conteúdo orgânico está rodando para qual etapa". Esse epic cria a ponte: o dashboard da etapa passa a mostrar **todo o esforço** (pago + orgânico) que a sustenta.

---

## Escopo v1

- **Sources suportados:** YouTube (vídeos do canal vinculado ao projeto) e Instagram (mídia da conta vinculada ao projeto).
- **Vinculação N:N** entre posts e etapas (`stage_organic_posts`).
- **UI no Dash Orgânico:** botão por card → modal com select Funil → select Etapa → confirmação. Indicador visual no card quando já vinculado.
- **Tab "Mídias Orgânicas" no Stage Page:** lista posts vinculados com **métricas hidratadas** das fontes originais. Botão de desvincular.
- **Permissão:** qualquer membro do projeto pode vincular/desvincular (igual aos outros vínculos da etapa).

---

## Stories

| Story | Título | Pontos | Depende de |
|-------|--------|--------|------------|
| 23.1 | Schema & API — Stage Organic Posts | 3 | — |
| 23.2 | UI Dash Orgânico — Botão "Vincular a Etapa" | 5 | 23.1 |
| 23.3 | Tab "Mídias Orgânicas" no Stage Page | 5 | 23.1 |

23.2 e 23.3 podem rodar em paralelo após 23.1 estar Done.

### ClickUp Tracking

| Item | Task ID | URL |
|------|---------|-----|
| Epic 23 | `86ah54pgq` | https://app.clickup.com/t/86ah54pgq |
| Story 23.1 | `86ah54pjm` | https://app.clickup.com/t/86ah54pjm |
| Story 23.2 | `86ah54pn5` | https://app.clickup.com/t/86ah54pn5 |
| Story 23.3 | `86ah54pqv` | https://app.clickup.com/t/86ah54pqv |

---

## Fora de Escopo (v1)

- TikTok, LinkedIn, X, Threads — apenas YouTube + Instagram nesta v1.
- Vinculação automática (sugestões por título/hashtag) — manual apenas.
- Persistência local de posts/vídeos no DB do Loyola — vínculo guarda apenas `external_id + source`, métricas são hidratadas on-demand.
- Comparativo cross-funnel de mídia orgânica — fica para v2.
- Edição em massa (vincular múltiplos posts de uma vez) — single-post na v1.
- Reordenação manual dos posts dentro da tab — ordem por `created_at` desc.

---

## Riscos & Premissas

| Risco | Mitigação |
|-------|-----------|
| Post deletado no YouTube/Instagram cria órfão no DB | GET hidrata `null` + flag `isStale: true`; UI mostra estado "indisponível" + botão de desvincular |
| Performance: GET da tab faz N requests externos | Hidratação server-side com cache de 5min em memória (já há `instagramMetricsCache`); para YouTube usar `youtubeVideos` query existente |
| Schema de Instagram media não está persistido | Tabela `stage_organic_posts` guarda apenas `external_id` (Instagram media ID) — hidratação via Graph API no GET |
| Múltiplos vínculos do mesmo post na mesma etapa | Constraint `UNIQUE (stage_id, source, external_id)` |

---

## Definição de Done (Epic-level)

- [ ] Schema migrado em PROD (187.77.231.80:5433)
- [ ] Endpoints `POST/DELETE/GET /stages/:id/organic-posts` documentados e cobertos por smoke test
- [ ] Botão "Vincular a Etapa" funcional no Dash Orgânico (YouTube + Instagram)
- [ ] Tab "Mídias Orgânicas" funcional no Stage Page com hidratação multi-source
- [ ] Typecheck + lint passing em `@loyola-x/web` e `@loyola-x/api`
- [ ] Smoke test manual: vincular vídeo → ver na tab → desvincular → some da tab
