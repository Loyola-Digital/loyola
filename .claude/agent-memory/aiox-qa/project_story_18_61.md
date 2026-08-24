---
name: story-18-61-qa-concerns
description: QA gate story 18.61 (coluna Status Ativo/Pausado nos Criativos) — CONCERNS, aberto TEST-001/REL-001
metadata:
  type: project
---

Story 18.61 — Coluna "Status" (Ativo/Pausado/"—") na tabela Desempenho de Criativos. Gate **CONCERNS** (não-bloqueante → Done) em 2026-07-18, commit `489c943`, branch `feat/18.61-creative-status`.

**O que a story faz:** effective_status por ad_id no `meta_entity_names_cache` (migration 0082, nullable + COALESCE no upsert), populado pelo backfill de nomes (mesmo batch, +1 field). Endpoint agrega por regra **OR** (Ativo se ≥1 ad_id ACTIVE; Pausado se todos conhecidos não-ativos; "—" se nenhum tem status). Tooltip lista adsets ativos (sem novo I/O). Reader ad-scoped `getAdEffectiveStatusFromDb`. Dashboard lê do banco, nunca chama Meta.

**Issues abertas (não-bloqueantes):**
- TEST-001 (medium): lógica OR sem teste executável — vitest ausente no repo + `__tests__` fora do tsconfig do web (débito herdado 18.55/18.60). Testes `.test.tsx` são dead code.
- REL-001 (medium): coluna mostra "—" em tudo até deploy da API (com Lucas) + primeira execução do backfill com o novo field. Ver [[story-lp-paga-deploy]] / mesma dinâmica de 18.60.
- REQ-001 (low): edge case grupo misto (≥1 pausado conhecido + ad_ids uncached) → "paused"; segue Dev Notes aprovadas.

**Why:** dashboard interno de tráfego; gates tsc api+web verdes; 8/8 ACs; File List == 11 arquivos do commit (zero scope creep).
**How to apply:** se o usuário disser que a coluna Status está "—" pós-merge, não é bug — é o backfill/deploy pendente (REL-001). Se retomar cobertura de teste, TEST-001 é o alvo.
