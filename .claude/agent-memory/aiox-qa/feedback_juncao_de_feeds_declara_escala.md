---
name: juncao-de-feeds-declara-escala
description: Doc que manda cruzar dois feeds tem de declarar a ESCALA dos campos homônimos, não só a unidade da linha — no Loyola as taxas do /cadeia-cac são decimais e as do /creatives vêm ×100
metadata:
  type: feedback
---

Quando revisar documentação que instrui **juntar dois feeds**, não basta conferir a chave de
junção e a unidade da LINHA. Procurar campos com o **mesmo nome nos dois lados** e comparar
escala e definição do numerador. É onde o número errado nasce em silêncio.

**Why:** na Story 44.18 (gate CONCERNS, 2026-08-29) a receita nova avisava sobre duas
armadilhas — a linha do `/cadeia-cac` é um Ad Name que agrupa N `adId`, e os dois feeds
arredondam `spend` em pontos diferentes (divergência de centavos) — e calava sobre uma
terceira, de magnitude muito maior:

| campo | `/cadeia-cac` (`criativos`) | `/creatives` (`deriveMetrics`) |
|---|---|---|
| `ctr` | `div(linkClicks, impressions)` — **decimal**, clique no LINK | `(clicks/impressions)*100` — **percentual**, clique TOTAL |
| `cpc` | `div(spend, linkClicks)` | `spend / clicks` |
| `connectRate` | decimal | `×100` |

O `llms.txt` declara `unidadeDasTaxas: "decimal"` **dentro da seção da cadeia**; a seção do
`/creatives` não declara unidade nenhuma. O comparável de lá chama-se `ctrLink`/`cpcLink`.
Um agente que obedece literalmente troca um pelo outro e publica CTR ~100× errado — a mesma
classe do `connectRate` que ficou 18 a 35 p.p. errado por mais de um ano, que é a razão de
existir do Epic 44 ("uma régua só").

**How to apply:** em toda story cuja entrega é doc de integração ou receita de junção —
1. listar os campos dos DOIS payloads e marcar os homônimos;
2. para cada homônimo, ler a fórmula na origem (não o nome): escala (`*100`?) e numerador
   (cliques totais × cliques no link; pixel × venda real);
3. exigir que a receita diga **qual dos dois vale** para cada homônimo, não só para o que o
   autor lembrou;
4. conferir se o aviso está no arquivo que o **consumidor lê em execução** (`docs/llms.txt`),
   e não só no guia humano — os dois divergem com facilidade.

Relacionado: [[reversao-no-fio-nao-na-biblioteca]].
