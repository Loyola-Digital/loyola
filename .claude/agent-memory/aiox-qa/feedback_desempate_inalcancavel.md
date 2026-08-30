---
name: desempate-inalcancavel
description: Desempate de sort pode existir no código e nunca ser alcançado — ler o comparador inteiro, não só a linha do tiebreak
metadata:
  type: feedback
---

Quando uma story alega "a ordenação já desempata por X, então paginar por offset é seguro", **execute o comparador**, não leia a linha do desempate.

**Why:** na Story 44.24 a rota `/creatives` tinha o desempate por `adId` — com comentário declarando-o "OBRIGATÓRIO... senão paginar pula ou repete criativo" — e ele era inalcançável para 6 dos 10 `orderBy`. O padrão:

```ts
const orderVal = (c) => typeof v === "number" ? v : -Infinity;  // null vira -Infinity
const d = orderVal(b) - orderVal(a);        // -Infinity - (-Infinity) = NaN
return d !== 0 ? d : a.adId.localeCompare(b.adId);   // NaN !== 0 é TRUE → nunca chega no desempate
```

Comparador que devolve NaN vale `+0` (ECMA-262 SortCompare) e, com `sort` estável, sobra a ordem de ENTRADA — que aqui vinha de um `SELECT` sem `ORDER BY`. A guarda `d !== 0` é o defeito: só `d === 0` cai no desempate, e NaN escapa.

**How to apply:** em qualquer review de paginação por offset, cursor ou "top N estável":
1. Liste quais campos do `orderBy` podem ser `null` (`safeDiv` devolve null com denominador 0; guardas `impressions > 0` idem). No Loyola X, nulos: `ctr` `cpc` `cpm` `cpl` `cpa` `roas`. Nunca nulos: `spend` `impressions` `clicks` `leads`.
2. Rode o comparador literal com dois itens nulos num `node -e` e confira se a ordem sai pelo desempate ou pela entrada.
3. Cuidado com o probe: duas chamadas seguidas costumam trazer a mesma ordem do banco, então **o probe de "os adId não se repetem entre páginas" passa mesmo com o defeito**. Probe verde não refuta.

Correção genérica: `Number.isFinite(d) && d !== 0 ? d : desempate`.

Relacionado: [[injetar-a-armadilha-prevista]], [[runner-que-enxerga-o-arquivo]].
