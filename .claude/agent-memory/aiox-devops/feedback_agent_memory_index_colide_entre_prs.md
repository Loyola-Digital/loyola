---
name: agent-memory-index-colide-entre-prs
description: Duas PRs paralelas quase sempre colidem em .claude/agent-memory/*/MEMORY.md — checar esse arquivo antes de afirmar "sem sobreposição"
metadata:
  type: feedback
---

Antes de mergear PRs em sequência, conferir se ambas tocam `.claude/agent-memory/*/MEMORY.md`. Se tocarem, a segunda vai ficar `CONFLICTING/DIRTY` depois que a primeira mover a `main` — mesmo que os diretórios de produto (`packages/`, `docs/`) não tenham interseção nenhuma.

**Why:** o índice de memória é append-only no fim do arquivo. Duas branches saídas do mesmo tip acrescentam linhas na mesma posição, e o git não tem como decidir a ordem. Em 2026-08-29, o briefing das PRs #661 (Story 45.1 — hoje **46.1**, `packages/web`) e #662 (Story 44.18, `docs/`) declarava "zero sobreposição de arquivo" olhando só as áreas de produto; as duas mexiam em `aiox-qa/MEMORY.md` e a #661 travou logo após o merge da #662.

**How to apply:** ao planejar uma sequência de merges, rodar `gh pr view N --json files` nas duas e cruzar os paths — incluindo `.claude/`. Se houver colisão só no índice de memória, o conflito é textual e trivial (duas linhas independentes), mas resolvê-lo é commit novo na branch: pertence a quem é dono da PR, não ao merge. Verificar o conflito sem sujar a árvore com `git merge-tree --write-tree --name-only origin/main origin/<branch>`.

Relacionado: [[commit-qa-gate-before-pr]], [[pr-conventions-loyola]].
