# Aba Cadeia de CAC — o que ela faz, o que não faz e como ler

**Última atualização:** 2026-08-20 · Epic 44 · Story 44.13

> Este doc vive junto do código de propósito: quando um item sai da lista de
> pendências, sai aqui no mesmo commit. Um guia que descreve um estado antigo é
> pior que guia nenhum.

---

## A pergunta que a aba responde

**Se eu quero baixar o CAC, mexo em quê primeiro?**

Ela pega o CAC real da etapa — investimento dividido por vendas ou leads
únicos, sem estimativa — e quebra na cadeia que o produz: CPM, CTR, CPC,
Connect Rate e Conv. LP. Para cada uma, compara o valor de hoje contra **o
melhor que aquela etapa já entregou** numa janela de sete dias.

Esse é o **teto**: não é meta de mercado, é recorde próprio. Quando ainda não
existe teto, o alvo é o **benchmark** — a mediana histórica.

---

## Como ler a tela

```
CPL real · investimento ÷ leads únicos
R$ 202,51
R$ 15.188,46 investidos · 75 leads · imposto Meta (12,15%) já incluído

Métrica         Atual      Teto     Benchmark   Selo
CPM          R$ 51,57  R$ 37,07   R$ 48,19     alvo R$ 37,07
CTR             1,47%     3,41%      2,00%     alvo 3,41%
CPC           R$ 3,52   R$ 1,35    R$ 3,65     alvo R$ 1,35
Connect Rate   77,67%    90,89%     85,00%     alvo 90,89%
Conv. LP        2,00%     3,10%          —     alvo 3,10%
```

**Onde atacar primeiro** ordena por quanto de custo cai ao levar cada métrica
até o teto. CPM e CTR **não** entram nessa lista de propósito: a queda do CPC
já contém as duas, e somá-las contaria o mesmo ganho duas vezes.

Abaixo, o **bloco de criativos** responde a pergunta seguinte — *em qual
criativo?* — com a mesma régua, ordenado por investimento.

---

## O que está pronto

| Item | Desde |
|---|---|
| CAC e CPL reais | 44.8 / 44.9 |
| Cadeia de decomposição (CPM, CTR, CPC, Connect Rate) | 44.6 / 44.7 |
| Onde atacar primeiro, sem dupla contagem | 44.7 |
| Guarda de rastreio | 44.12 |
| **Conv. LP** com valor, teto e selo | **44.10** |
| **Bloco de criativos** com Hook e Hold | **44.11** |
| **Distribuição do Hook Rate** | **44.11** |

---

## O que NÃO está pronto — e por quê

Vale ler antes de reportar: os itens abaixo aparecem vazios **por construção**,
não por defeito.

### Body Conversion (leads ÷ 75% assistido)

O bloco de criativos mostra Hook e Hold, mas não o Body. Ele precisa de leads
por anúncio, e o custo foi medido antes de a decisão ser tomada: **a maior
campanha do projeto tem 75 anúncios**, então guardar `anúncio × dia` no cache
de leads multiplicaria por ~15 um campo que já cresce.

A alternativa — usar o contador de leads do próprio Meta — resolveria o
tamanho, mas misturaria dado de pixel numa aba que usa lead do Loyola em todo
o resto. A tela declara a ausência em vez de escondê-la.

### Atribuição de VENDA por campanha

A cobertura de **lead** por campanha existe desde a 44.10. A de venda não: a
planilha do sync de vendas não mapeia `utm_content`, então não há de onde
tirar o numerador.

⚠️ Isso **não** afeta o CAC real, que depende do total da etapa — foi a
propriedade que motivou a revisão v1.1 da spec.

### CAC igual ao do resto do painel

O epic previa unificar o CAC desta aba com o de `traffic-analytics`. Ao chegar
lá, o alvo não existia mais: aquele arquivo não calcula CAC hoje, e a página
de tráfego não o exibe. Os outros pontos do produto que calculam CAC são do
funil perpétuo, com régua legitimamente própria.

**Não há divergência aberta.** Se algum dia alguém quiser alinhar perpétuo e
cadeia, é decisão de produto, não dívida desta aba.

---

## Duas coisas que costumam confundir

**A soma dos dias não bate com o total do período.** É correto. A cobertura de
rastreio deduplica lead **por dia**, e quem se cadastrou em dois dias conta nos
dois. O total do período deduplica no período inteiro. Somar os dias e comparar
com o total encontra uma diferença que é real, não erro.

**A soma dos criativos não bate exatamente com o investimento do topo.** Fecha
até centavos: a cadeia arredonda por campanha-dia e o bloco por anúncio-dia. A
diferença fica abaixo de 0,005% e é inerente a agregar em níveis diferentes.

---

## O que ajuda reportar

1. **Um número que você sabe estar errado** — diga a etapa, o período e o valor
   esperado. O CAC é o mais crítico.
2. **Um teto que parece bom demais** — pode ser a janela que a guarda deveria
   ter descartado.
3. **Uma etapa que devia aparecer e não aparece**, ou o contrário.
4. **Onde a tela não explica o que mostra** — campo vazio sem motivo declarado
   é defeito nosso, não sua falta de contexto.

O que **não** precisa reportar: os três itens da seção "não está pronto".

---

## Para quem for mexer no código

- O cálculo mora no `@loyola-x/shared` (regra 7.6 da spec), **nunca** na rota.
  Foi assim que o `connectRate` divergiu do painel por mais de um ano.
- `packages/api/src/__tests__/cadeia-cac-paridade.test.ts` compara o número
  servido pela rota com o que o núcleo produz. Ele pega **divergência de
  valor**; duplicação com fórmula idêntica nenhum teste de valor pega.
- `accumulate` (`utils/meta-insight-agg.ts`) **já aplica** o imposto Meta.
  Quem soma `spend` por fora dele produz um número 13,83% menor — aconteceu na
  44.11 e está travado por teste.
