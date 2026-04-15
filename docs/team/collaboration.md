# Team Collaboration — Git Workflow & Branch Policy

Este documento define como os integrantes do time colaboram neste repositório. A IA do AIOX (Claude Code) usa este documento como referência ao operar o git.

---

## Branch Policy (enforced via GitHub branch protection)

A branch `main` está protegida com as seguintes regras:

| Regra | Valor | Efeito |
|-------|-------|--------|
| Required pull request reviews | **Sim** (0 approvals) | Push direto na `main` BLOQUEADO — obrigatório passar por PR |
| Allow force pushes | **Não** | `git push --force origin main` BLOQUEADO |
| Allow deletions | **Não** | Não é possível deletar a branch `main` |
| Enforce admins | **Não** | Lucas (admin) pode bypassar em emergências |

**Na prática:**
- Todo commit na `main` precisa vir via Pull Request
- Só quem não é admin (ex: Danilo) está 100% obrigado a seguir esse fluxo
- O AIOX `@devops` já força esse fluxo por convenção — a proteção do GitHub é rede de segurança

---

## Workflow padrão (SDC — Story Development Cycle)

Para qualquer trabalho:

1. **Antes de começar:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Criar feature branch** (`@sm` faz isso no fluxo auto):
   ```bash
   git checkout -b feature/X.Y-descricao-curta
   ```
   Convenção: `feature/{epic}.{story}-{kebab-case}` ou `feature/{scope}-{kebab-case}`.

3. **Trabalhar local** — commits normais (`@dev` faz isso no fluxo auto):
   ```bash
   git add <arquivos-específicos>
   git commit -m "feat(scope): descrição [Story X.Y]"
   ```

4. **Antes de abrir PR — sincronizar com main atualizada:**
   ```bash
   git pull --rebase origin main
   # resolver conflitos se houver
   ```

5. **Push + PR via `@devops`** (fluxo auto faz isso):
   ```bash
   git push -u origin feature/X.Y-...
   gh pr create --title "..." --body "..."
   ```

6. **Merge** (fluxo auto faz):
   ```bash
   gh pr merge {N} --squash --delete-branch
   ```

7. **Sync local com main após merge:**
   ```bash
   git checkout main
   git pull origin main
   ```

---

## Trabalho em paralelo — como evitar conflitos

O time trabalha em paralelo. Cada pessoa tem seu scope (ver `docs/team/members.md`). A regra de ouro:

### Regra 1 — Respeitar o scope reduz conflitos físicos
Se Danilo só edita arquivos de tráfego e Lucas evita arquivos de tráfego, conflitos são raros. O AIOX `team-scopes` rule ajuda a manter isso.

### Regra 2 — Arquivos "quentes" (compartilhados) exigem comunicação
Estes arquivos podem ser tocados por ambos e precisam de heads-up antes:

- `package.json` / `pnpm-lock.yaml` (dependências)
- `packages/web/lib/formulas/funnels.ts` (factories de tráfego — compartilhado)
- `packages/web/components/funnels/**` (scope do Danilo, mas Lucas também trabalha aqui)
- `pnpm-workspace.yaml`, `turbo.json` (infra monorepo)
- `.env*` templates (configs)

Se for alterar algum desses → avisar o outro antes (WhatsApp/Telegram).

### Regra 3 — Rebase antes de PR (não merge)
Sempre `git pull --rebase origin main` antes de abrir ou atualizar o PR. Mantém o histórico linear e reduz chance do GitHub dizer "conflict".

### Regra 4 — Quem mergeia primeiro, o outro rebaseia
Se ambos têm PR aberto:
- Quem mergear primeiro → ok, subiu pra main
- O outro → precisa fazer `git pull --rebase origin main` na feature branch, resolver conflitos se houver, push de novo (`git push --force-with-lease` na própria feature)

### Regra 5 — Conflitos em arquivos de story/gate são impossíveis
`docs/stories/X.Y.md` e `docs/qa/gates/X.Y.yml` são únicos por story — não há colisão. Cada pessoa cuida dos arquivos da sua story.

---

## Como resolver um conflito de merge

Se ao fazer `git pull --rebase origin main` aparecer `CONFLICT`:

1. `git status` mostra quais arquivos têm conflito
2. Abra cada arquivo, procure `<<<<<<< HEAD ... ======= ... >>>>>>>`, decida qual versão fica (ou combine as duas)
3. `git add <arquivo-resolvido>`
4. `git rebase --continue`
5. Se der ruim: `git rebase --abort` volta tudo ao estado anterior

Se estiver confuso, **pergunte ao Lucas antes de continuar** — conflito mal resolvido perde trabalho.

---

## Autoridade por agente (AIOX)

Quem pode fazer o quê (reforço do `.claude/rules/agent-authority.md`):

| Operação | Quem | Como |
|----------|------|------|
| `git commit` local | `@dev`, `@sm` (só feature branches locais) | Fluxo normal |
| `git push` para remoto | **`@devops` EXCLUSIVO** | `@devops *push` |
| `gh pr create` | **`@devops` EXCLUSIVO** | `@devops *create-pr` |
| `gh pr merge` | **`@devops` EXCLUSIVO** | `@devops *push` no fim do fluxo |
| `git push --force` | **`@devops` + confirmação explícita** | Apenas em emergência |

---

## Checklist para o Danilo (setup inicial)

Primeira vez clonando o repo:

```bash
# 1. Clonar
git clone https://github.com/Loyola-Digital/loyola.git
cd loyola

# 2. Configurar identidade (IMPORTANTE — usado pelo team-scopes)
git config user.name "Danilo"
git config user.email "danilo@bonsaitrafegopago.com.br"

# 3. Instalar deps
pnpm install

# 4. Configurar .env local (pedir template pro Lucas)
cp .env.example .env   # ou conforme orientação

# 5. Subir o Claude Code neste diretório
claude

# Claude Code carrega automaticamente:
# - .claude/CLAUDE.md (regras do projeto)
# - .claude/rules/team-scopes.md (identifica o Danilo e aplica scope)
# - docs/team/members.md (fonte do scope)
# - docs/team/project-context.md (contexto do produto)
```

Na primeira sessão, a IA vai mostrar:
```
👤 Identificado: Danilo (danilo@bonsaitrafegopago.com.br)
🔒 Scope: Tráfego (Meta Ads / Google Ads / YouTube / Funis)
```

---

## Troubleshooting

**"Push rejected — protected branch"**
→ Você tentou push direto na `main`. Use feature branch + PR.

**"Não consigo mergear — PR conflict"**
→ `git checkout sua-branch` → `git pull --rebase origin main` → resolver conflitos → `git push --force-with-lease`.

**"Não sei se estou na main ou na feature"**
→ `git branch --show-current` mostra. Se for main e tem trabalho não-commitado, cria feature branch AGORA: `git checkout -b feature/meu-trabalho`.

**"A IA tá recusando editar um arquivo que eu preciso"**
→ Você está fora do scope. Fale com o Lucas, ele autoriza e a edição vai marcada com `[scope-override]` no commit.
