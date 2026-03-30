---
description: ClickUp integration — agents register workflow actions automatically
globs: .aiox-core/development/agents/*.md
---

# ClickUp Workflow Registration — Pedro Valério Method

## Filosofia

Seguindo o método Pedro Valério: **tudo que acontece no workflow deve ser registrado no ClickUp.** O ClickUp é o sistema operacional — se não está lá, não aconteceu. Fluxo unidirecional, responsável obrigatório, data obrigatória.

## Config

- **Team ID:** `9013556102`
- **Space:** Loyola (ID: `901313244000`)
- **List:** APP - Loyola X (ID: `901326639417`) dentro de Áreas
- **Token:** Usar `CLICKUP_API_TOKEN` do `.env` da API (`pk_112122180_1P2350DUM80Z04BBJYRSFE1COFZ6G8O7`)

## Status Flow (unidirecional — cards NÃO voltam)

Usar os mesmos status da list APP - Loyola Agents:

```
backlog → ready for dev → in progress → in review → ready to ship → done
                                                  ↗
                                          blocked (lateral)
                                          on hold (lateral)
```

**IMPORTANTE:** Esses status precisam ser criados na list APP - Loyola X pelo admin do ClickUp (requer permissão de admin/owner). Solicitar a Alberto Soares (owner) que replique os status da list "APP - Loyola Agents" para "APP - Loyola X".

| Status ClickUp | Quem move | Quando |
|----------------|-----------|--------|
| **backlog** | @sm | Cria story |
| **ready for dev** | @po | Aprova story |
| **in progress** | @dev | Começa implementação |
| **in review** | @dev/@qa | Dev termina / QA revisa |
| **ready to ship** | @qa | QA passed |
| **blocked** | qualquer | Issue bloqueante |
| **on hold** | qualquer | Aguardando externo |
| **done** | @devops | Push/merge feito |

## Quando Registrar

Cada agente DEVE registrar no ClickUp ao executar ações de workflow. Usar `curl` via Bash.

**NOTA:** Enquanto os status da list APP - Loyola X não forem atualizados pelo admin, usar os status existentes (`não iniciado`, `em progresso`, `pronto p/ revisão`, `concluído`) como fallback temporário.

### Mapeamento Agente → Ação → ClickUp

| Agente | Ação no AIOX | ClickUp Action |
|--------|-------------|----------------|
| **@sm** | `*draft` / `*create-story` | **Criar task** com nome `[Story X.Y] título` — status: `backlog` |
| **@po** | `*validate-story-draft` (GO) | **Atualizar status** → `ready for dev` + comentário "✅ PO approved" |
| **@po** | `*validate-story-draft` (NO-GO) | **Comentário** na task "❌ NO-GO: [motivos]" — status: `blocked` |
| **@dev** | `*develop` (início) | **Atualizar status** → `in progress` + comentário "🔨 Dev started" |
| **@dev** | `*develop` (completo) | **Atualizar status** → `in review` + comentário "✅ Implementation complete" |
| **@qa** | `*qa-gate` (PASS) | **Atualizar status** → `ready to ship` + comentário "✅ QA passed" |
| **@qa** | `*qa-gate` (FAIL) | **Comentário** "❌ QA failed: [issues]" — status: `in progress` (volta ao dev) |
| **@devops** | `*push` / PR criado | **Atualizar status** → `done` + comentário "🚀 Shipped: [PR url]" |
| **@pm** | `*create-epic` | **Criar task** com nome `[Epic X] título` — status: `backlog`, tag: `epic` |
| **@architect** | Decisão arquitetural | **Comentário** na task da story "🏛️ Architecture: [decisão]" |

### Ações que NÃO registram (ruído)
- Leitura de arquivos, grep, exploração
- Discussões/perguntas do usuário
- Ativação/desativação de agente
- `*help`, `*guide`, `*exit`

## Como Registrar

### Criar Task
```bash
curl -s -X POST "https://api.clickup.com/api/v2/list/901326621645/task" \
  -H "Authorization: pk_112122180_1P2350DUM80Z04BBJYRSFE1COFZ6G8O7" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "[Story X.Y] título da story",
    "description": "Story path: docs/stories/X.Y.story.md\nAgent: @agent-name\nBranch: branch-name",
    "status": "backlog",
    "tags": ["aiox-agent"],
    "priority": 3
  }'
```

Salvar o `task_id` retornado para atualizações futuras. Guardar em comentário na story file como `<!-- clickup:task_id -->`.

### Atualizar Status
```bash
curl -s -X PUT "https://api.clickup.com/api/v2/task/{task_id}" \
  -H "Authorization: pk_112122180_1P2350DUM80Z04BBJYRSFE1COFZ6G8O7" \
  -H "Content-Type: application/json" \
  -d '{"status": "in progress"}'
```

### Adicionar Comentário
```bash
curl -s -X POST "https://api.clickup.com/api/v2/task/{task_id}/comment" \
  -H "Authorization: pk_112122180_1P2350DUM80Z04BBJYRSFE1COFZ6G8O7" \
  -H "Content-Type: application/json" \
  -d '{"comment_text": "✅ Dev complete — all tasks [x], tests passing"}'
```

### Buscar Task por Nome (se task_id não disponível)
```bash
curl -s "https://api.clickup.com/api/v2/list/901326621645/task?name=Story%20X.Y" \
  -H "Authorization: pk_112122180_1P2350DUM80Z04BBJYRSFE1COFZ6G8O7"
```

## Regras Pedro Valério Aplicadas

1. **Responsável obrigatório** — Toda task tem o agente como responsável no campo description
2. **Data obrigatória** — Usar `due_date` = hoje + 1 dia útil ao criar
3. **Fluxo não volta** — Status só avança (exceto QA fail → in progress, que é re-work legítimo)
4. **Templates são assets** — Story tasks seguem sempre o mesmo formato de nome e description
5. **Checklists embutidos** — Description inclui o que precisa ser feito
6. **Log completo** — Cada ação vira um comentário na task, formando histórico rastreável
7. **Impossibilitar caminhos** — Se status é "done", nenhum agente deve tentar atualizar

## Formato do Nome da Task

```
[Story {epicNum}.{storyNum}] {título da story}
[Epic {epicNum}] {título do epic}
[Fix] {descrição do fix}
[Chore] {descrição}
```

## Tags Padrão

- `aiox-agent` — Toda task criada por agente
- `epic` — Tasks de epic
- `bug-fix` — Correções
- `story` — Stories de desenvolvimento
