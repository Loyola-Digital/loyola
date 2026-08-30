---
name: numeracao-de-epic-loyola
description: Regra de numeração de epic neste repo — o que reserva um número é o doc em docs/stories/epics/, não a story; próximo livre é 47; nada no repo detecta prefixo duplicado
metadata:
  type: project
---

**Neste repositório, quem reserva um número de epic é o doc em `docs/stories/epics/` — não a story.** Uma story pode *usar* um número; só o doc de epic o *ocupa*.

**Why:** em 2026-08-29 a `main` tinha dois Epic 45. O @sm criou a Story 45.1 ("navegação da etapa") abrindo um tema novo, numerou por convenção e registrou na própria story que criar o epic era do @pm — sem criá-lo. O número ficou desocupado em `docs/stories/epics/` e o Epic 45 "Construtor de BI" o pegou depois, com doc formalizado. Dois arquivos `45.1.*` conviveram na `main` sem que git, CI, lint ou build reclamassem: **nada no repo detecta prefixo duplicado.**

**How to apply:**

1. **Antes de numerar qualquer epic ou story de tema novo:** liste `docs/stories/` **e** `docs/stories/epics/`. Os dois. O censo de 2026-08-29 dava 1–38 e 40–45 em uso; **o próximo genuinamente livre é 47**. O 39 tem doc de epic (`epic-39-mcp-methodology-gaps.md`) sem nenhuma story — está ocupado, não vago.
2. **Crie o doc de epic no mesmo dia da primeira story de um tema novo**, ainda que mínimo. A janela "número usado mas não reservado" durou 1 dia e custou uma renumeração de 23 arquivos. É a prevenção mais barata que existe aqui.
3. **Se a colisão já aconteceu, o critério de desempate é volume + formalização, não ordem de chegada.** Ambos os lados costumam estar em produção, então "quem rodou primeiro" não desempata. Conte stories, linhas mergeadas, referências cruzadas e existência de doc de epic. Ver [[renumeracao-preserva-historia]] para como executar.

Caso concreto resolvido: navegação (2 stories, 1.564 linhas, sem doc de epic) → **Epic 46**; Construtor de BI (11 stories, 12.653 linhas, doc formalizado) manteve o **45**.
