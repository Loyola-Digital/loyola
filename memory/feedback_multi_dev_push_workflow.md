---
name: Workflow multi-dev — sync + push seguro
description: Passo a passo para subir código quando há commits de outro dev no remoto, sem perder alterações de ninguém
type: feedback
---

Quando Danilo tem alterações locais e o remoto tem commits novos de outro dev, seguir este fluxo:

1. **Diagnóstico** — `git status` + `git fetch origin` + `git log HEAD..origin/main` (ver o que há de novo)
2. **Stash** — `git stash --include-untracked` (salva tudo, incluindo arquivos novos)
3. **Merge** — `git merge origin/main` (incorpora os commits do outro dev)
4. **Stash pop** — `git stash pop` (restaura as alterações do Danilo em cima do código atualizado)
5. **Verificar conflitos** — se houver, resolver manualmente
6. **Lint + Typecheck antes de commit** — `npx next lint` e `npx tsc --noEmit` no packages/web
7. **Commit** — commitar apenas os arquivos relevantes (nunca `package-lock.json` — projeto usa pnpm)
8. **Branch + PR** — `main` tem branch protection, então criar feature branch e PR via `gh pr create`
9. **Se precisar corrigir** — `git commit --amend --no-edit` + `git push --force-with-lease`

**Why:** Dois devs trabalhando no mesmo projeto (Danilo + outro). Danilo é iniciante em git, então o Gage deve guiar cada passo e confirmar antes de executar ações destrutivas.

**How to apply:** Sempre que Danilo pedir para subir código e houver divergência com o remoto. Apresentar o plano antes de executar e pedir aprovação.
