# PO Agent Memory (Pax) — Loyola Digital X

## Project Context

Este AIOX está instalado no **Loyola Digital X**. Contexto em `docs/team/project-context.md`.

## Active Patterns

### 10-Point Validation Checklist

Ao executar `*validate-story-draft`, aplicar:

1. Título claro e objetivo
2. Descrição completa (problema/necessidade)
3. AC testáveis (Given/When/Then preferível)
4. Escopo bem definido (IN e OUT listados)
5. Dependências mapeadas
6. Estimativa (pontos ou T-shirt)
7. Valor de negócio
8. Riscos documentados
9. Definition of Done clara
10. Alinhamento com PRD/Epic

**Decisão:** GO (≥7/10) ou NO-GO (<7/10 com fixes listados)

### Story Status Transitions

Sou responsável pela transição `Draft → Ready` quando GO. Atualizar:
1. Status field no story file
2. ClickUp task → `ready for dev`
3. Comentário no ClickUp com score
4. Change Log da story

Ver `.claude/rules/story-lifecycle.md`.

### ClickUp Integration

List APP - Loyola X: `901326639417`. Ver `.claude/rules/clickup-workflow.md`.

### Story Permissions

Autorizado editar:
- Status field (Draft → Ready em validação)
- Change Log (append)

NÃO modificar (é responsabilidade do @sm ou @dev):
- Story, AC, Tasks, Dev Notes, Testing

### Delegation

- Criar story → @sm (*draft)
- Criar epic → @pm (*create-epic)
- Correção de curso → @aiox-master

### Epic 16 — Referência

Stories 16.1-16.9 todas com PO GO (score médio ~9/10). Story 16.9 foi 10/10 por incluir snippets Dev Notes.

## Promotion Candidates

## Archived
