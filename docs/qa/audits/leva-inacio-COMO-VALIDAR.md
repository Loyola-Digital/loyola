# Como validar a leva do Inácio — mensagens e conferência visual

**Estado em 2026-09-08:** merge feito (`58d22fb1`), **API no ar** (contrato 6, build 14:17 UTC) e **painel no ar** (Vercel produção, 14:16 UTC). Pode conferir agora — não vai ver código velho.

---

# PARTE 1 — As mensagens

São **duas mudanças de número** que entraram juntas, e vale mandar **uma mensagem só**. A 44.27 estava pendente desde ontem; a 44.28 entrou hoje.

## Para quem

| público | manda? | por quê |
|---|---|---|
| Time de tráfego (quem abre o painel) | **sim** | vão ver o número diferente hoje |
| Lucas / quem decide verba | **sim** | o `pps1` cruzou o ponto de equilíbrio |
| Diretoria | **não diretamente** | eles leem o Resumão; o Inácio explica lá |
| Canal técnico | opcional | o rastro completo está nos dois `.md` de auditoria |

## A mensagem, pronta para colar

> **Aviso: os números de perpétuo mudaram no painel hoje — e é correção, não piora.**
>
> Duas coisas foram corrigidas:
>
> **1. O seletor de período somava um dia a mais de faturamento do que de investimento.** Com "7 dias" a tabela listava oito: a venda do dia extra entrava, o custo dele não. Todo ROAS ficava inflado, sempre para cima.
>
> **2. A aba Cadeia de CAC contava vendas de um jeito e a aba Meta Ads de outro.** Agora as duas usam a mesma contagem — compradores únicos no período.
>
> **O que você vai ver diferente:**
>
> • ROAS dos seletores de 7 / 30 / 90 dias: **cai um pouco** (e passa a estar certo)
> • CAC na aba Cadeia de CAC de três funis perpétuos: **sobe**
>   – BBE / Funil Churrasco: R$ 118 → **R$ 205**
>   – PP / Aquisição: R$ 92 → **R$ 109**
>   – FZ / Vendas: R$ 40 → **R$ 41**
> • Investimento: **não muda em lugar nenhum**
>
> **⚠️ O caso que precisa de atenção: o `pps1`.** O ROAS de 30 dias foi de **1,07x para 0,91x** — cruzou o ponto de equilíbrio. Ele não piorou; a conta é que estava errada. A operação já não se pagava, e o painel dizia que sim. Se alguma decisão de verba estava apoiada naquele "acima de 1", vale revisar.
>
> Se você tem print de antes de hoje, os números não vão bater — é esperado.

## Se alguém perguntar "por que subiu tanto no BBE?"

> A aba Cadeia contava **transações**; a aba Meta Ads conta **compradores**. Quem comprou duas vezes no mês contava como dois na primeira e um na segunda. Como CAC é *custo de aquisição de cliente*, a contagem certa é a de compradores — e são 74 no mês, não 129. O investimento é o mesmo; o que mudou foi o denominador.

## Se alguém perguntar "e o Resumão do Inácio?"

> O Resumão ainda vai sair no formato antigo até o prompt dele ser trocado. Quando trocar, ele passa a ter três recortes (dia, 7 e 30 dias) e um estado 🟢/🟡/🔴 calculado por regra, não por impressão.

---

# PARTE 2 — A conferência visual

O roteiro completo é `leva-inacio-roteiro-de-conferencia.md`, organizado por story. **Este aqui é o mesmo conteúdo reorganizado por TELA**, para você não ficar pulando entre abas.

**Tempo:** ~15 minutos. **Fixture:** `BBE → funil bbe-fc1-a1-mai-26`.

---

## Tela 1 — aba **Cadeia de CAC** da etapa `bbe-funil-churrasco`

`Projetos → BBE → bbe-fc1-a1-mai-26 → etapa bbe-funil-churrasco → aba Cadeia de CAC`

| # | Onde olhar | ✅ passa | ❌ reprova |
|---|---|---|---|
| 1 | Card do topo, número grande | **"CAC real"** com valor em R$ | `—` no lugar do valor |
| 2 | Logo abaixo do card | **Não** existe caixa âmbar sobre "régua divergente" | A caixa ainda aparece |
| 3 | O valor | Casa de **R$ 160–210** | Casa de R$ 110–130 |
| 4 | Linha cinza sob o card | **"Todo o histórico · 17/07 a 08/09 · 54 dias com dado"** | Sem linha de período |
| 5 | O número de dias dessa linha | Compatível com o intervalo (~54) | 200+ dias para dois meses de intervalo |

> **Por que o item 5 existe:** a primeira versão mostrava **239** ali, porque contava pares (campanha × dia) em vez de dias. Se você vir um número muito maior que o intervalo, é esse defeito de volta.

---

## Tela 2 — aba **Panorama** (mesmo projeto)

| # | Onde olhar | ✅ passa | ❌ reprova |
|---|---|---|---|
| 6 | Cabeçalho, ao lado de "X etapas no ar" | Traz **datas** entre parênteses, ex. `(02/09–08/09)` | Só "em 7 dias", sem datas |
| 7 | Cabeçalho da coluna de resultado | **"Resultado (30d)"** | Só "Resultado" |

### O controle que vale a pena (item 8)

Abra `BBE → bbe-pr2-ago-26 → etapa Captação Paga` nas **duas** telas (Cadeia de CAC e Panorama).

- ✅ **passa:** os CACs continuam **diferentes** (~R$ 744 × ~R$ 855), e agora **cada tela diz sua janela**
- ❌ **reprova:** ficarem iguais — essa story não muda número nenhum, só rótulo

> É o par que motivou a correção: dois números certos, janelas diferentes, e nenhuma tela dizendo qual.

---

## Tela 3 — aba **Meta Ads** do mesmo funil, seletor em **7 dias**

| # | Onde olhar | ✅ passa | ❌ reprova |
|---|---|---|---|
| 9 | Tabela Dados Diários | **7 linhas** | 8 linhas, a primeira sem investimento |
| 10 | Primeira linha da tabela | Tem investimento **e** venda | Investimento `—` com venda preenchida |
| 11 | Card de investimento (7d) | Bate com a **soma da coluna** | Diverge por um dia inteiro |
| 12 | Card "Vendas" × soma da coluna de vendas | Podem diferir por **1 ou 2** | Diferença grande, de ordem de grandeza |
| 13 | Rodapé "Total" da tabela | Diz que conta **vendas-dia** | Diz só "Total", parecendo o mesmo do card |

> **Item 12 — a diferença é correta.** O card conta compradores únicos no período; a tabela deduplica dentro de cada dia. Quem comprou em dois dias conta duas vezes na tabela e uma no card. Em 08/09 o BBE deu 15 e 15 (ninguém repetiu); o FZ deu 67 e 66.

---

## Parte 4 — o Resumão (quando o prompt for trocado)

**Não dá para conferir hoje** — depende de trocar o prompt do Inácio pelo guia atualizado. Quando trocar:

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 14 | Abre com um estado | 🔴 Alerta / 🟡 Atenção / 🟢 Saudável / ⚪ Sem dado | "no ar e saudável" em texto livre |
| 15 | Abaixo do estado | A **condição que disparou**, ex. "5 dos últimos 7 dias com margem negativa" | Parágrafo de impressão |
| 16 | O estado do BBE | **🔴 Alerta** | 🟢 Saudável |
| 17 | Quantos blocos | **Quatro**: dia, 7 dias, 30 dias, contexto 90 dias | Só o dia |
| 18 | Códigos internos no texto | Nenhum | `semTetoConfiavel`, número de story, nome de rota |
| 19 | Pendências de infra (deploy, token, gateway) | Nenhuma no Resumão da diretoria | Alguma delas |
| 20 | Timestamp | **BRT**, e hora que já passou | "23:01 UTC" num texto escrito às 17h |

---

# Se algo reprovar

Anote **três coisas** e me manda:

1. **Qual item** (o número)
2. **O que apareceu** — print vale mais que descrição
3. **Qual funil/etapa e qual seletor de período** estava ativo

> ⚠️ O terceiro é o que mais economiza tempo: **metade das divergências desta leva eram janelas diferentes, não contas erradas.** Sem saber o seletor, a investigação começa do zero.

# O que NÃO é bug

| sintoma | por quê |
|---|---|
| Número diferente de print anterior a hoje | é a correção — ver Parte 1 |
| CAC do BBE mais alto que ontem | subiu de propósito, +74% |
| ROAS um pouco menor em todos os seletores | a régua de faturamento foi corrigida |
| Tool `get_perpetual_metrics` não aparece no Inácio | falta rebuild do bundle no gateway (Story 44.22) |
| Resumão no formato antigo | falta trocar o prompt do agente |
| `DG & CPDF / dg-a1` com "CAC real R$ 0,00" | defeito **anterior** a esta leva, já registrado |
