# Epic 25 — Alerta de Campanhas Órfãs por Match Code

**Status:** Done
**Owner:** @sm → @po → @dev → @qa → @devops
**Criado em:** 2026-04-29

---

## Objetivo

Adicionar um campo `matchCode` no funil (ex: `dg-pg02`) e exibir um banner amarelo destacado quando existem campanhas Meta Ads na conta vinculada ao projeto que **contêm o `matchCode`** mas **não foram selecionadas em nenhuma etapa do funil**.

Banner aparece em 2 níveis:
- **Página do Funil** — banner agregado: "⚠️ 3 campanhas com `dg-pg02` não estão em nenhuma etapa"
- **Página da Etapa** — banner específico da etapa: "⚠️ 2 campanhas com `dg-pg02` não estão selecionadas nesta etapa"

---

## Justificativa de Negócio

Workflow atual: gestor cria nova campanha Meta com nome contendo o código do funil (ex: `[dg-pg02] Hot Abril v2`) e **esquece** de adicionar essa campanha na etapa correspondente do funil. Resultado:

- Investimento da nova campanha **não entra** nas métricas do funil
- Faturamento parece OK mas CPL está mascarado (faturamento total está cruzando com investimento incompleto)
- Diagnóstico errado de performance leva a decisões erradas

Hoje a única forma de detectar isso é manualmente: comparar lista de campanhas Meta com a lista de campanhas selecionadas em cada etapa. Em projetos com 5-10 funis, é inviável.

Um alerta visual no dashboard resolve em 1 click — o gestor vê, abre as Settings da etapa, marca a campanha, métricas voltam ao certo.

---

## Escopo v1

### Inclui
- Migration: nova coluna `match_code` (varchar, nullable) na tabela `funnels`
- API: endpoint que detecta órfãs comparando `matchCode` × campanhas Meta × campanhas selecionadas
- Settings UI: campo "Código de match" editável no popup de configuração do funil
- Banner amarelo destacado em 2 páginas (funil + etapa) com lista resumida das órfãs e link "Configurar etapa"
- Match: **substring case-insensitive** de `funnel.matchCode` em `campaign.name`
- Inclui campanhas em qualquer status (ACTIVE, PAUSED, ARCHIVED) — UI sinaliza status

### Fora de Escopo (v1)
- Adicionar campanha na etapa direto do banner (botão de quick-add) — fica como v2
- Match para Google Ads — só Meta Ads na v1
- Auto-detecção de matchCode (heurística) — sempre manual via Settings
- Notificação por email/push — só visual no app
- Alerta em outras telas (sidebar global, notificações) — só nas duas páginas mencionadas

---

## Stories

| Story | Título | Pontos |
|-------|--------|--------|
| 25.1 | Match Code + Detecção + Banner | 5 |

Epic com 1 story só — feature focada, escopo bem definido.

### ClickUp Tracking

| Item | Task ID | URL |
|------|---------|-----|
| Epic 25 | `86ah6d6hn` | https://app.clickup.com/t/86ah6d6hn |
| Story 25.1 | `86ah6d6na` | https://app.clickup.com/t/86ah6d6na |

---

## Premissas Técnicas

| Premissa | Implicação |
|----------|------------|
| `funnel.campaigns` armazena campanhas selecionadas a nível de funil (legacy, pré-Epic 19) | Comparação considera ambos: campanhas selecionadas no funil E nas etapas |
| `funnelStages.campaigns` armazena campanhas selecionadas por etapa (Epic 19) | Match a nível de etapa: campanhas in `stage.campaigns` |
| `useCampaignPicker(projectId)` retorna campanhas Meta da conta linkada | Reusamos esse hook — sem novo fetch |
| `funnel.matchCode` é nullable | Funis sem code não disparam alerta (feature opt-in) |

---

## Riscos & Mitigações

| Risco | Mitigação |
|-------|-----------|
| Falso positivo em substring genérica (ex: matchCode `pg` matchea tudo) | Settings exibe contador "X campanhas matcham seu code" antes de salvar — usuário valida |
| Campanhas archived poluem o banner | Ordenação: ACTIVE primeiro, PAUSED, ARCHIVED por último. UI mostra badge de status |
| Conta Meta sem campanhas (recém-conectada) | Endpoint retorna `orphans: []`, banner não aparece |
| Funil sem matchCode | Banner não aparece. Tooltip discreto no header sugerindo cadastrar |

---

## Definição de Done (Epic-level)

- [ ] Migration aplicada em PROD
- [ ] Endpoint detect-orphans retorna lista correta para funil + etapa
- [ ] Settings UI permite editar matchCode
- [ ] Banner aparece nas 2 páginas quando há órfãs e funil tem matchCode
- [ ] Banner não polui quando matchCode vazio ou sem órfãs
- [ ] Typecheck + lint passing
- [ ] Smoke test: criar funil "Test", matchCode "test-foo", criar 2 campanhas Meta com "test-foo" no nome, selecionar só 1 → banner mostra a outra
