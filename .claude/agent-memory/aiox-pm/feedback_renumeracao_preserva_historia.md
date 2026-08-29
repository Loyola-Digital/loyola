---
name: renumeracao-preserva-historia
description: Ao renumerar story/epic, proteja os fatos imutáveis do git (branch, commit, PR) antes de rodar o sed — e deixe uma ponte do número velho ao novo, senão o histórico fica órfão
metadata:
  type: feedback
---

**Renumerar não é search-and-replace.** Antes de qualquer substituição em massa, isole os fatos que **não** podem mudar; depois deixe uma ponte explícita do número antigo para o novo.

**Why:** commits, PRs e nomes de branch são imutáveis. Um `sed 's/45.1/46.1/g'` ingênuo reescreve `feat/45.1-menu-abas-hierarquico` para uma branch que não existe — transformando documentação correta em documentação falsa. E, sem ponte, quem chega por `git log` ou pela PR #661 procurando "Story 45.1" não acha arquivo nenhum: o histórico fica órfão. Na renumeração Epic 45 → 46 (2026-08-29) havia 4 armadilhas num único arquivo: dois nomes de branch, uma menção a "Epic 45 — Construtor de BI" (o *outro* epic, que devia ficar) e um intervalo `45.1–45.9` dele.

**How to apply:**

1. **Liste antes de substituir.** `git grep -l` com pathspec, depois `grep -n` arquivo a arquivo. Leia cada ocorrência — a taxa de falso positivo é alta (`R$ 45.20`, CTR, `45.10`).
2. **Proteja por sentinela, não por regex esperta.** Troque branch/commit/PR/menções ao outro epic por um placeholder, faça a substituição, restaure. Regex com lookahead falha em casos que você não previu.
3. **Deixe a ponte em dois lugares:** uma tabela na story (número antigo → commits, PRs, branches, card do ClickUp) e uma § "Nota de renumeração" no doc de epic com o critério da decisão.
4. **Não renumere IDs de achado do @qa** (`QA-451-*`). São chaves já publicadas em gates mergeados e em memória de agente; renumerá-las orfana mais do que conserta. Documente o mapeamento.
5. **Prove que o diff de código é inerte:** `git diff -U0 -- packages/ | grep '^[+-]'` filtrando linhas de comentário. Se sobrar algo, não era só renumeração.
6. **Uma branch só.** Se metade do renumeramento sai da `main` e a outra metade de uma branch com PR aberta, e as duas tocam o mesmo arquivo, o conflito é garantido — e um repo meio renumerado é pior que a colisão original.

Ver [[numeracao-de-epic-loyola]] para o critério de qual lado renumera.
