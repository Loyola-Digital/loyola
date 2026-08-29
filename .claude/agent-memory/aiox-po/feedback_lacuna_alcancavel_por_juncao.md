---
name: lacuna-alcancavel-por-juncao
description: Antes de aprovar endpoint novo por "campo ausente", checar se o campo é alcançável por junção com um feed existente — campo ausente ≠ dado inalcançável
metadata:
  type: feedback
---

Uma tabela de lacunas que lista campos ausentes de um payload **não** justifica um endpoint
novo por si só. Antes do GO, checar para cada campo: (a) é derivável dos campos que já vêm?
(b) existe uma **chave de junção** no payload que dê acesso ao feed que tem o campo?

**Why:** na AC0 da Story 44.18 (2026-08-29) a story listava 5 campos ausentes de
`CriativoDaAba` como justificativa para uma rota nova. Verificando: CPM era `spend ÷
impressions × 1000` (conta, não lacuna) e os outros 4 estavam todos no feed de projeto,
alcançáveis por `adIds[]` — que o próprio payload expunha. A story tinha contado **9 campos
onde havia 10**, e o não contado era justamente `adIds[]`, a chave que dissolvia a lacuna.
Escopo caiu de M (5 pontos) para XS (1).

**How to apply:** em toda story que pede endpoint/rota nova alegando campo ausente —
1. contar os campos do tipo real (`sed` no arquivo), não confiar no número escrito na story;
2. procurar array de ids / chave estrangeira no payload → se existe, a lacuna é de
   conveniência (1 chamada vs 2), não de capacidade;
3. perguntar se o campo é **necessário** ou "seria bom ter". Métrica que a própria doc manda
   não usar para decidir (ex.: ROAS de pixel) não sustenta escopo;
4. contabilizar o **custo de entrega**: neste projeto, rota sobe sozinha no merge, mas tool
   MCP é rebuild manual do gateway (Story 44.22 — 5 tools levaram 2 meses). Tool nova nunca
   é de graça.

Se a decisão for "basta o que existe", a entrega não é zero: vira **correção de doc** que
ensina a junção, com os avisos de armadilha (unidade de agrupamento diferente nas duas
pontas; arredondamento em pontos diferentes → não somar os dois `spend`).

Relacionado: [[line-refs-drift]], [[ac-meio-impossivel]].
