---
name: project-story-49-2
description: Story 49.2 QA CONCERNS (2026-10-01) — classificador único de origem em shared; código limpo, pendência do dono (FZ letalk+x1) muda 72/107 compradores do FZ-L1
metadata:
  type: project
---

Gate CONCERNS em 2026-10-01 (commit 808868d1, branch feat/49.2-classificador-unico). O código não tem defeito: as 14 mutações do QA morreram todas.

**O medium é decisão do dono, não bug.** No FZ, `letalk`/`chatwoot` + `x1` hoje dá aquisição "Outros orgânicos". No FZ-L1, 72 dos 107 compradores do produto mudam de balde conforme a resposta. Nos snapshots, todas as linhas com `letalk` têm `x1`, então dá para resolver pela config (`closerNomes`). Com o `chatwoot` não.

**Por que importa:** se o dono pedir "só closer", a ConfigClassificador da 49.1 ganha um campo novo e o CLASSIFICADOR_VERSAO sobe. A 49.3 e a 49.5 não devem fixar números do FZ antes disso.

**Como aplicar:**
- Ao revisar 49.3/49.5, confira se a pergunta 2 foi respondida.
- A substring do Quente/Frio foi MEDIDA e é segura: 0 divergência em 23.749 utm_term. Nos 1.265 nomes de campanha, todas as divergências eram acertos (QUENTES/SUPERHOT/FRIOS).

**Fonte de dados para medir regras de origem sem tocar produção:** `aiox-bonsai/squads/loyola-debriefing/dados/<expert>/*.csv`, snapshots das planilhas (181k linhas). Ver [[feedback-snapshot-da-skill-mede-regra]].
