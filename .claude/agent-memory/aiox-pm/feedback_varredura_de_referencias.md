---
name: varredura-de-referencias-no-repo
description: grep -r em docs/ + .aiox/ estoura o timeout de 2min neste repo; use `git grep -l` com pathspec para varrer referências
metadata:
  type: feedback
---

Para varrer referências por todo o repo (auditoria de epic, renumeração, caça a doc órfã), use **`git grep -l -E "padrão" -- 'docs/' '.claude/'`**. Não use `grep -r` nem expansão de `git ls-files` como argumentos.

**Why:** três tentativas estouraram o timeout de 2 minutos numa sessão: `grep -r` incluindo `.aiox/`, `git grep` contra uma *ref* (`origin/main`) em vez da árvore de trabalho, e `grep` recebendo 2.824 paths por expansão de shell. O `git grep` na árvore de trabalho com pathspec devolve o mesmo resultado em segundos porque respeita o `.gitignore` e não desce em `node_modules`/`.next`.

**How to apply:** primeiro `git grep -l` para achar os **arquivos**; depois `grep -n` só nesses arquivos para ver as linhas. Se precisar do conteúdo de uma ref (`origin/main`), use `git ls-tree -r --name-only` + `git show` arquivo a arquivo — `git grep <ref>` é lento demais aqui.

Relacionado: [[renumeracao-preserva-historia]].
