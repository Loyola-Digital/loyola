---
name: story-45-1-shipped-com-concerns
description: Story 45.1 (menu de abas hierárquico) mergeada em 2026-08-29 com gate CONCERNS e validação visual ainda pendente — agora só verificável em produção
metadata:
  type: project
---

Story 45.1 foi para a `main` em **2026-08-29** (PR #661, squash `4da6f14b`), com **gate CONCERNS** e a **validação visual nunca executada**. Merge não converteu o veredito em PASS.

**Why:** o menu da etapa passou de 14 abas soltas para 5 grupos, e o único juiz do conserto do **QA-451-01** (trocar de aba e navegar para outra etapa pela sidebar — a aba deve voltar ao default e a URL bater com a tela) é o comportamento na tela. O `useEffect` com deps `[params.stageId]` que zera `abaEscolhida` e relê `?tab=` está na `main`, mas nenhum teste cobre a interação real de navegação.

**How to apply:** enquanto os 4 pontos não forem conferidos logado em produção — (1) launch com captação paga, perpétuo e etapa de família `null`, onde o grupo "Inácio" **não** deve aparecer; (2) `?tab=nps` aberto em outra sessão; (3) o QA-451-01; (4) "Meta Ads TESTE" e volta ao dashboard pelo pai — trate a 45.1 como entregue mas não validada. Não a cite como precedente estável de navegação de abas, e não feche o CONCERNS por conta do merge.

Ver também [[loyola-pr-conventions]] (o card do ClickUp já vai a `done` na criação da PR, então o pendente mora no comentário, não no status).
