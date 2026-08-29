---
name: epic-45-numero-duplicado
description: Existem DOIS Epic 45 na main — "Navegação da etapa" (45.1 menu, 45.2 Análise MVP) e "Construtor de BI" (45.1–45.9, PR #665); os números 45.1 e 45.2 estão duplicados
metadata:
  type: project
---

O número **45** foi atribuído a dois epics diferentes, e ambos estão na `main`:

- **Epic 45 — Navegação da etapa**: `45.1.menu-de-abas-hierarquico.md` (PR #661) e `45.2.submenu-visivel-e-analise-mvp-em-dados.md` (PR #666, aberta).
- **Epic 45 — Construtor de BI**: `EPIC-45-CONSTRUTOR-DE-BI.md` com `45.1.catalogo-semantico.md` a `45.9.aplicacoes-planilha.md` (PR #665, mergeada em 2026-08-29).

Resultado: `docs/stories/` tem hoje **dois arquivos `45.1.*`** e vai ter **dois `45.2.*`**. Não há conflito de git (nomes de arquivo distintos), mas qualquer referência por número ("Story 45.2") é ambígua.

**Why:** o Epic 45 de Navegação nasceu sem doc de epic — o @po registrou isso como pendência no gate da 45.2 — e o @pm numerou o Construtor de BI como 45 sem que houvesse um `EPIC-45-*.md` ocupando o número. A colisão é consequência direta da story existir antes do epic.

**How to apply:** antes de numerar qualquer story nova, listar `docs/stories/` pelo prefixo (`ls docs/stories/ | grep '^4X\.'`) em vez de confiar no último número lembrado — é o mesmo cuidado que o Epic 29 já exigia. Ao citar uma story do 45, dizer também o slug do arquivo. A renumeração de um dos dois é decisão do @pm e ninguém a tomou ainda.
