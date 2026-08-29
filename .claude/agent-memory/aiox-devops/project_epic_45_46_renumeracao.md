---
name: epic-45-46-renumeracao
description: RESOLVIDO — havia dois Epic 45 na main; a Navegação da etapa virou Epic 46 (46.1/46.2) e o Construtor de BI manteve o 45. Commits, branches e as PRs #661/#666 continuam citando os números antigos
metadata:
  type: project
---

Em 2026-08-29 a `main` tinha **dois Epic 45** com stories de número sobreposto. O @pm resolveu no mesmo dia: **a Navegação da etapa virou o Epic 46**; o Construtor de BI manteve o 45.

| Antes | Agora |
|---|---|
| `docs/stories/45.1.menu-de-abas-hierarquico.md` | `docs/stories/46.1.menu-de-abas-hierarquico.md` |
| `docs/stories/45.2.submenu-visivel-e-analise-mvp-em-dados.md` | `docs/stories/46.2.submenu-visivel-e-analise-mvp-em-dados.md` |
| gates `docs/qa/gates/45.{1,2}-*.yml` | gates `docs/qa/gates/46.{1,2}-*.yml` |
| (sem doc de epic) | `docs/stories/epics/epic-46-navegacao-da-etapa.md` |
| `45.1.catalogo-semantico.md` … `45.11.agente-de-bi.md` | **inalterados** — o BI fica no 45 |

**Why:** o tema de navegação nasceu sem doc de epic — o @sm numerou a story como 45.1 e registrou que formalizar o epic era do @pm, sem criá-lo. O número ficou desocupado em `docs/stories/epics/` e o Construtor de BI o ocupou de fato. O critério da decisão: **o que reserva um número neste repo é o doc de epic, não a story** — e o volume confirma (BI: 11 stories, 12.653 linhas, 3 PRs mergeadas; navegação: 2 stories, uma ainda em PR aberta). Provisório perde para formalizado.

**How to apply:**

1. **Ao ler qualquer commit ou PR antigo:** `4da6f14b`, `925acfcc`, `73c9a531`, `238d8840`, `db8e7694`, `2ae39408`, `5b1d8c38`, `3aebdf23`, as branches `feat/45.1-menu-abas-hierarquico` / `feat/45.2-submenu-visivel` e as **PRs #661 e #666** citam 45.1/45.2 e **não foram reescritos**. Traduza para 46.1/46.2. A ponte completa está em `docs/stories/epics/epic-46-navegacao-da-etapa.md` § "Nota de renumeração".
2. **Os IDs de achado do @qa não mudaram:** `QA-451-*` = story 46.1, `QA-452-*` = story 46.2.
3. **⚠️ A PR #666 continua aberta com título/corpo citando "45.2"** — atualizar é do @devops, junto com o merge.
4. **Ao numerar qualquer epic novo:** liste `docs/stories/` **e** `docs/stories/epics/` antes. Nada no repo detecta prefixo duplicado — git, CI, lint e build passaram com dois `45.1.*` conviventes. Próximo número livre depois do 46: **47** (39 não conta: tem doc de epic sem stories).
5. **Prevenção:** criar o doc de epic no mesmo dia da primeira story de um tema novo, ainda que mínimo. A janela "número usado mas não reservado" durou 1 dia e custou esta renumeração.

Ver também [[story-46-1-shipped-com-concerns]].
