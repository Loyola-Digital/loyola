---
name: project-story-18-56
description: Story 18.56 (link manual por LP, nome hiperlinkado) — QA PASS, Done, aguarda push/PR
metadata:
  type: project
---

Story 18.56 "Testes de LPs — Link manual por LP com nome hiperlinkado" — **QA gate PASS (Quinn), status Done**. Commit `5ddff6f`, branch `feat/18.56-lp-links`. Gate: `docs/qa/gates/18.56-lp-links-manual.yml`.

Coluna `lp_links` (JSONB, default `{}`) em `funnel_stages` (metadado por etapa: LPA da Paga ≠ LPA da Gratuita). Migration 0080 additive+idempotente **já aplicada em prod** (não reaplicar). PUT de stage estendido; lápis+popover na `lp-performance-table.tsx` (`LpNameCell`); nome vira `<a rel=noopener noreferrer>` quando há link.

**Why:** gestor confere a página real de cada LP em 1 clique durante análise de testes.

**How to apply:** ao mexer em funnel-stages PUT ou na tabela de LPs, `lpLinks` é opcional e NÃO dispara Meta sync (só `body.campaigns !== undefined` dispara `fireBackgroundMetaSync` — rate-limit safe). Concerns low abertos: PERF-001 (`useFunnelStage` adiciona 1 fetch por seção, não deduplicado do cache plural `funnel-stages`) e TEST-001 (sem vitest no `packages/web`, débito herdado). Próximo passo: @devops push/PR.
