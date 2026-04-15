# Team Scopes — User Identification & Scope Enforcement

## Purpose

Identificar o usuário ativo (via `git config user.email`) no início de cada sessão e aplicar restrições de escopo de edição conforme definido em `docs/team/members.md`.

Esta regra implementa **soft enforcement**: a IA respeita os limites de escopo e recusa edições fora deles, mas não há enforcement a nível de git (qualquer um com permissão de push pode burlar — o objetivo é proteger contra edições por engano, não por má-fé).

## When This Applies

Esta regra se ativa em **toda sessão nova** de Claude Code neste repositório.

## Protocol

### Step 1 — Identify the user

No início da primeira interação com o usuário:

```bash
git config user.email
```

### Step 2 — Look up scope

Ler `docs/team/members.md` e encontrar a entrada cujo `email` bate exatamente com o resultado do passo 1.

- Se **match encontrado** com `scope: full` → nenhuma restrição. Proceda normalmente.
- Se **match encontrado** com `scope: restricted` → aplicar `allowed_paths` (ver Step 3).
- Se **nenhum match** → comportamento default: tratar como `full` (não bloquear), mas logar um aviso curto: "⚠️ Usuário `{email}` não cadastrado em `docs/team/members.md` — operando sem restrição de scope."

### Step 3 — Enforce scope (quando `restricted`)

Antes de usar `Write`, `Edit` ou `Bash(git commit)` em qualquer arquivo, verificar se o path bate com ao menos um dos `allowed_paths` do usuário.

- **Path DENTRO do scope:** prosseguir normalmente.
- **Path FORA do scope:** recusar a edição com mensagem clara:
  ```
  ⛔ Edição fora do seu escopo autorizado.

  Seu usuário ({email}) tem acesso de edição restrito às áreas de {scope_description}.
  Arquivo solicitado: {file_path}
  
  Se realmente precisa editar este arquivo, peça autorização ao Lucas e documente o motivo.
  ```

Ferramentas de **leitura** (`Read`, `Glob`, `Grep`, `Bash(ls)`, etc) NÃO são restritas — o usuário pode explorar todo o repositório.

### Step 4 — Session header

Na primeira resposta da sessão, mostrar um header curto identificando o usuário e o scope ativo (quando restrito):

```
👤 Identificado: Danilo (danilo@bonsaitrafegopago.com.br)
🔒 Scope: Tráfego (Meta Ads / Google Ads / YouTube / Funis)
```

Não mostrar esse header para `scope: full` — desnecessário.

## Edge Cases

### Usuário quer criar arquivo novo
Aplicar as mesmas regras de `Write` contra o path do arquivo a ser criado.

### Usuário pede pra editar fora do scope com justificativa
Ainda recusar por padrão. Se ele insistir dizendo "Lucas autorizou via {canal}" — registrar no commit message como `[scope-override]` e proceder, mas avisar que o commit vai ter essa flag.

### Branch `main`
Commit direto na `main` segue as regras normais do AIOX (@devops exclusivo). Restrições de scope são ortogonais a isso.

### Usuário muda de máquina ou troca git config
Se `git config user.email` muda no meio da sessão, re-executar Step 1-4.

## Escalation

Se ambígüidade ou conflito surgir, escalar para @aiox-master ou pedir autorização explícita ao Lucas antes de prosseguir.

## Reference Files

- `docs/team/members.md` — fonte de verdade de usuários e scopes
- `.claude/rules/agent-authority.md` — regras cruzadas com agent delegation
