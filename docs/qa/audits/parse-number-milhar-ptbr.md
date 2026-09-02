# Achado: `parseNumber` da API lê `R$ 1.097,00` como `1,097`

**Encontrado em:** 2026-09-02, durante a implementação da Story 18.71
**Por:** @dev (Dex), validando o AC4 contra a planilha de produção
**Status:** ✅ CORRIGIDO em 7fddf450, autorizado pelo gestor em 2026-09-02
**Severidade:** alta — erro de 3 ordens de grandeza em dinheiro exibido

---

## O defeito

Três cópias do mesmo `parseNumber` na API:

```ts
// packages/api/src/utils/creative-sales-metrics.ts:42
// packages/api/src/routes/stage-creative-performance.ts:175
// packages/api/src/routes/creative-revenue.ts:36
const cleaned = val.replace(/[^\d.,]/g, "").replace(",", ".");
return parseFloat(cleaned) || 0;
```

`.replace(",", ".")` troca **só a primeira** vírgula, e o ponto de milhar
continua na string. `parseFloat` para no segundo ponto:

```
"797,00"      → "797.00"      → 797       ✅
"1.097,00"    → "1.097.00"    → 1.097     ❌  (deveria ser 1097)
"3.291,00"    → "3.291.00"    → 3.291     ❌
"12.345,67"   → "12.345.67"   → 12.345    ❌
```

Toda venda **a partir de R$ 1.000** é lida como aproximadamente um milésimo do
valor. Abaixo de mil funciona — por isso passou despercebido.

## Medição em produção

Aba `n8n-Kiwify` do `bbe-pr2-ago-26`, coluna `Preço Original`, as 6 vendas
`s=meta`:

```
célula          lido        correto
"1.097,00"      1,097       1.097,00
"1.097,00"      1,097       1.097,00
"1.097,00"      1,097       1.097,00
"3.291,00"      3,291       3.291,00
"2.194,00"      2,194       2.194,00
"797,00"      797,000 ✅      797,00
                ------      --------
soma          R$ 805,78    R$ 9.573,00
```

O faturamento por criativo dessa etapa aparece como **R$ 805,78** onde deveria
ser **R$ 9.573,00**. O ROAS derivado dele está igualmente errado.

## O que atinge

`Faturamento` e `ROAS` por criativo e por LP, na Captação Paga e onde mais essas
três rotas servirem. Não atinge os cards do topo, que usam outro parser.

## A correção existe no repo

O frontend já faz certo, em `leads-by-utm-table.tsx:81`:

```ts
if (hasDot && hasComma) norm = s.replace(/\./g, "").replace(",", ".");
else if (hasComma)      norm = s.replace(",", ".");
```

## Como foi corrigido

O `parseBrNumber` de `parse-faturamento.ts` — que já era a implementação certa e
completa do repo — foi extraído para `shared/src/numero-ptbr.ts`, e as três
cópias quebradas passaram a ler de lá. O `parse-faturamento.ts` também, para não
sobrar duas implementações corretas divergindo com o tempo.

**Verificado contra a planilha depois do fix:**

```
Captação Paga do bbe-pr2-ago-26, atribuído a criativo
  antes:  4 ingressos   R$   805,78
  depois: 6 ingressos   R$ 9.573,00
```

11 testes novos em `api/src/__tests__/numero-ptbr.test.ts`, incluindo a asserção
de que o corpo antigo chega em R$ 805,776 — reverter derruba o teste.

### O que NÃO mudou, de propósito

O sinal negativo continua descartado (o `[^\d.,]` original também removia o
`-`). Preservar sinal mudaria o valor de estornos na tela e merece decisão
própria.

### Ainda pendente

Validação visual: o Faturamento e o ROAS por criativo e por LP sobem nas etapas
afetadas. É a mudança mais visível desta leva.

## Como reproduzir

```bash
node -e 'const p = v => parseFloat(v.replace(/[^\d.,]/g,"").replace(",",".")) || 0;
for (const v of ["797,00","1.097,00","12.345,67"]) console.log(v, "->", p(v));'
```
