---
name: story-44-24-qa-concerns
description: Story 44.24 (paginação na tool MCP de criativos) — gate CONCERNS; AC5 depende de rebuild do gateway e o detector da 44.22 é cego a ela
metadata:
  type: project
---

Story 44.24 — `offset` + `limit` até 500 na tool MCP `get_creative_performance`. Gate **CONCERNS** em 2026-08-29, branch `docs/44.23-paginacao-tool-criativos` (nome antigo: a story foi renumerada de 44.23 para 44.24 porque o PR #669 ocupou o número).

**Why:** AC1–AC4 entregues e verificadas; a AC5 (rebuild + restart do gateway, @devops, mais o probe do `limit: 300`) ficou aberta e é DoD. Não foi FAIL porque não há trabalho de @dev pendente — o que falta é operação.

**How to apply:**
- **O detector de defasagem da 44.22 é cego a mudança de schema.** `compararComManifesto` calcula `faltando`/`sobrando` como diferença de conjunto sobre **nomes** de tool, e `index.ts` só registra o `AVISO_bundle_do_mcp_desatualizado` se um dos dois for não-vazio. Story que altera schema sem mexer em nome deixa o roster idêntico ao de um gateway em dia. `diasDeAtraso` e o `contract` do manifesto chegam ao ponto de decisão e são descartados — é o fix barato para a 44.22 (QA-4424-03).
- **Probe discriminante para rebuild do gateway:** chamar a tool com `limit: 300`. Só o schema novo aceita; o velho rejeita em `.max(200)`. Ler o roster não serve.
- Dois follow-ups abertos, nenhum é trabalho da 44.24: **QA-4424-01** (o desempate por `adId` da rota `/creatives` não dispara com métrica `null` — ver [[desempate-inalcancavel]]) e **QA-4424-02** (a asserção de contrato tool↔rota era escrevível — ver [[runner-que-enxerga-o-arquivo]]).
- `packages/mcp` de fato não tem runner nem `test`; a raiz também não. `packages/api` tem vitest.
