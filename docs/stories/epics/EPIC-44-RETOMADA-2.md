# Epic 44 — ponto de retomada · Fase 2

**Congelado em:** 2026-08-18
**Anterior:** `EPIC-44-RETOMADA.md` (Fase 1, congelado em 17/08 — ainda vale para as decisões de origem)

---

## Onde paramos

| story | estado |
|---|---|
| 44.1 – 44.5 | ✅ na `main` e **em produção** (PR #543, `288b7a1c`) |
| 44.6 núcleo de cálculo | ✅ na `main` (PR #544, `067faa27`) — **mergeada, não deployada** |
| **44.7 composição do teto** | 🔵 **InReview** — 4 commits **locais, não pushados** |
| 44.8 endpoint · 44.9 aba · 44.10 criativos · 44.11 CAC · 44.12 doc | ⬜ a escrever |

**Branch aberta:** `feature/44.7-composicao-do-teto`, criada de `067faa27`.
Commits: `587767a3` · `e314cbcc` · `481a5a91` · `db5a6c64`. Árvore limpa.

**Próximo passo: `@qa` na 44.7.**

---

## A spec mestre agora existe

`docs/stories/epics/epic-44-aba-inacio.md` **v1.1**. Até 18/08 ela era citada por todas as stories e **não existia como arquivo**.

**A descoberta que reorganizou o epic — a cadeia telescopa:**

```
CPC ÷ (Connect × Conv.LP × Conv.Checkout)
  = (spend/linkClicks) ÷ ( (lpv/linkClicks) × (ck/lpv) × (vendas/ck) )
  = spend ÷ vendas
```

Com atribuição parcial, o CAC infla por `1 ÷ cobertura` — **medido de 2,0× a 36,3×** nas 10 etapas pagas, três indefinidas. A Conv. Checkout saiu da multiplicação; o número principal virou `CAC real = spend ÷ vendas`, imune a atribuição.

**Corolário:** o "teste de sanidade" da v1.0 (dois CACs lado a lado) era **vazio** — a divergência entre eles é a cobertura reescrita.

O `R$ 347,22` dos testes dourados sobreviveu, como `CAC real`. Só o rótulo estava errado.

---

## O que existe em código

Tudo em `packages/shared/src/cadeia-cac.ts` — módulo folha. **Web por subpath, API por bare import; não são intercambiáveis** (Story 19.14: o subpath na API passa por `tsc`, `vitest` e `next build` e derruba o boot em runtime).

**44.6:** `classificarFamilia`, `agregar`, `calcularMetricas`, `cacReal`, `cplReal`, `custoDaCadeia`, `janelasDe7Dias`, `baseDaMetrica`, `selo`, `coberturaAtipica`, `quedaReal`, `ranquear`, `compostoNoTeto`, `decomporCPC`.

**44.7:** `calcularTetos`, `tetosResolvidos`, `montarRanking`, `metricasDoTeto` + os tipos de entrada `SerieDeCampanha` e `CoberturaDiaria`.

66 testes no módulo, 1153 na suíte. Os 12 valores dourados da §8 batem.

---

## ⚠️ Três regras que não vieram de spec nem de AC

Vieram de teste que falhou. Se alguém "simplificar" qualquer uma delas, o número quebra em silêncio.

1. **Empate no teto desempata pela MAIOR base.** Campanha de desempenho constante produz N janelas com o mesmo valor; ficar com a primeira escolhe a de **1 dia** em vez da de 7 — o teto vira "melhor valor visto num dia" em vez de "sustentado por uma semana".
2. **Lead ausente ≠ zero lead.** `agregar()` fazia `?? 0`. O custo saía `null` de qualquer jeito, mas `quedaReal("convLP", 0, teto)` dá **100%**, e a etapa sem planilha de leads **liderava o ranking**.
3. **`coberturaAtipica` arredonda antes de comparar.** `0.9 - 0.7` em IEEE754 dá `0.20000000000000007`. Sem arredondar, a mesma janela concorre num dia e não no outro.

---

## Armadilhas que continuam valendo

- **`lpRate` do payload público NÃO é o `Conv. LP` da spec.** Lá é LP views ÷ link clicks (= Connect Rate); aqui é checkouts ÷ LP views.
- **Janela de 7 dias por DATA (`RANGE`), nunca por linha (`ROWS`)** — 41% das campanhas têm gap, o maior de 14 dias.
- **Não estender `ehCaptacaoPaga()` e irmãos** — decidem sync diário e CRM. Nenhum deles produz a família paga da spec; a aba classifica por conta própria.
- **Nada chamado `cac` na cadeia de decomposição** (Bloqueio B4) e **nada chamado `lpRate`** (B2).
- **`traffic-analytics.ts:452`** ainda calcula CAC como `spend ÷ purchases`. Migração é a 44.11.
- **Arquivos duplicados `" 2"`**: ~142 no repo, e rodar `pnpm dev` gera mais 25 em `packages/web/.next/types/` que quebram o typecheck do web com `TS2300`. Limpar antes de investigar; não são do seu código.
- **CodeRabbit nunca rodou** neste epic — CLI em WSL, máquina é macOS.

---

## Pendências fora do código

1. **Deploy da API** com a 44.6 — sem urgência, o módulo não tem consumidor.
2. **`RAILWAY_GIT_COMMIT_SHA`** não configurado: `/api/health` devolve `commit: null`. A checagem de **contrato** funciona (está em `2`); a de **commit** não.
3. **As duas versões do `story-lifecycle` divergem** sobre quem move a story para `Done` — a global diz `@qa`, a do projeto diz `@devops`. Alguém precisa reconciliar.

---

## Arquivos que contam a história

| arquivo | o que tem |
|---|---|
| `docs/stories/epics/epic-44-aba-inacio.md` | **a spec mestre v1.1** — fonte única da matemática |
| `EPIC-44-RETOMADA.md` | Fase 1 e as 4 decisões de origem |
| `AUDITORIA-ABA-CAC.md` | Fase 0 — campos, lacunas, 5 bloqueios |
| `docs/stories/44.1` … `44.7` | as stories, com decisões nos Change Logs |
| `docs/qa/gates/44.1-44.5-fase-1-epic-44.yml` | gate da Fase 1 + re-review |
| `docs/qa/gates/44.6-nucleo-de-calculo.yml` | gate da 44.6 + re-review + QA-446-05 |
| `packages/shared/src/cadeia-cac.ts` | o núcleo inteiro |
