---
name: story-46-1-shipped-com-concerns
description: Epic 46 Navegação — 46.1 mergeada com CONCERNS e VALIDADA na tela (passou nos 4 pontos, gerou a 46.2); 46.2 na PR #666 aberta e não mergeada, com validação visual de novo pendente
metadata:
  type: project
---

**Epic 46 "Navegação da etapa"** — o fio do menu de abas. Estado em 2026-08-29:

> ⚠️ **Este epic era o Epic 45 até 2026-08-29** (stories 45.1 e 45.2). Commits, branches e as PRs **#661** e **#666** ainda citam os números antigos — ver [[epic-45-46-renumeracao]].

- **46.1** (menu hierárquico, 14 abas soltas → 5 grupos): na `main` desde 2026-08-29 (PR #661, squash `4da6f14b`), gate **CONCERNS**. A validação visual **foi feita** pelo dono do produto e **passou nos quatro pontos** — o que a tela devolveu não foi defeito, foi preferência de agrupamento. O merge não converteu o veredito em PASS, mas o CONCERNS foi exercido.
- **46.2** (Análise MVP sai de Meta Ads e vira 1º filho de Dados, em perpétuo): **PR #666 aberta, CI verde, NÃO mergeada**. Gate **CONCERNS** de novo, e de novo por DoD — a validação visual (AC4) não foi executada. Segunda story seguida do Epic 46 sem tela.
- **QA-451-01** (medium) segue **aberto e em produção**: trocar de etapa pela sidebar com uma aba não-default selecionada deve devolver a aba ao default com a URL batendo. O `useEffect` com deps `[params.stageId]` está na `main`, mas nenhum teste cobre a interação; só a tela prova. Roteiro de 30s no item (d) do gate da 46.2.

**Why:** a 46.2 existe porque a 46.1 subiu sem tela — e a tela, quando finalmente aconteceu, produziu uma story inteira que nenhum teste teria levantado. Repetir o padrão na 46.2 recria a mesma dívida.

**How to apply:** ao retomar o Epic 46, cobrar a validação visual da 46.2 **antes** de empilhar uma 46.3 de navegação (perpétuo: Análise MVP em Dados, em primeiro, Meta Ads sem seta; lançamento com captação paga: Meta Ads com "Meta Ads TESTE", Dados começando em Pesquisas) e aproveitar a sessão logada para fechar o QA-451-01. Cuidado com [[epic-45-46-renumeracao]] ao numerar qualquer story nova. Ver também [[loyola-pr-conventions]] (o card do ClickUp vai a `done` na criação da PR, então o pendente mora no comentário, não no status).
