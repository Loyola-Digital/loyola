# Roteiro de conferência — a leva do Inácio (44.26 a 44.31)

**Data da medição:** 2026-09-08 · **Stories:** 44.26, 44.27, 44.28, 44.29, 44.30, 44.31
**Fixture:** `BBE · bbe-fc1-a1-mai-26 · etapa bbe-funil-churrasco`

> Os valores foram medidos contra produção em 08/09. **Vendas e investimento
> mudam todo dia** — o que se confere é a *relação* entre os números, não o
> valor exato. Onde um valor exato importa, está dito.

---

## Como usar

Cada item tem **o que ver** e **o que reprova**. A coluna "o que reprova" existe
porque na validação da 44.25 um item passava e falhava com a mesma tela — se as
duas colunas descrevem a mesma coisa, o item não verifica nada. Se você achar
um assim aqui, isso é um achado.

---

## Bloco 1 — O CAC da aba Cadeia de CAC subiu (Story 44.28)

`Projeto BBE → funil bbe-fc1-a1-mai-26 → etapa bbe-funil-churrasco → aba Cadeia de CAC`

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 1 | O card do topo | **"CAC real"** com um **valor em reais** | `—` no lugar do valor, ou uma caixa âmbar dizendo que o CAC não é publicado |
| 2 | Caixa âmbar de "régua divergente" | **Não existe mais** | A caixa ainda aparece |
| 3 | O valor do CAC | Na casa de **R$ 160–210** | Na casa de R$ 110–130 (a régua antiga) |

⚠️ **O número subiu de propósito.** Em 30 dias ele saiu de R$ 117,78 para
R$ 205,32 — a contagem antiga inflava as vendas e barateava o CAC. Se comparar
com print anterior a 08/09, a diferença é a correção.

---

## Bloco 2 — A aba diz de que período é o número (Story 44.31)

Mesma tela do bloco 1.

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 4 | Logo abaixo do card do topo | Uma linha cinza: **"Todo o histórico · 17/07 a 08/09 · 54 dias com dado"** | Nenhuma linha de período; ou um período sem a palavra "histórico" |
| 5 | O número de dias | Bate com o intervalo (17/07→08/09 ≈ 54 dias) | Um número muito maior — 200+ dias para um intervalo de dois meses |

⚠️ O item 5 é o controle de um defeito real: a primeira versão mostrava **239**
para esse mesmo intervalo, porque contava pares (campanha × dia) em vez de dias.

### Bloco 2b — o mesmo, no Panorama

`Aba Panorama` (do mesmo projeto)

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 6 | Cabeçalho | Traz as **datas** entre parênteses, ex. `(02/09–08/09)` | Só "em 7 dias", sem datas |
| 7 | Cabeçalho da coluna de resultado | **"Resultado (30d)"** | Só "Resultado" |

⚠️ Itens 6 e 7 explicam a divergência que motivou a story: `bbe-pr2-ago-26 /
Captação Paga` mostrava **R$ 743,58** na aba Cadeia e **R$ 855,11** no Panorama.
Os dois certos — histórico inteiro × 30 dias. Agora as duas telas dizem qual.

**Controle:** abra `bbe-pr2-ago-26 / Captação Paga` nas duas telas. Os CACs
devem continuar diferentes, e agora cada tela deve declarar sua janela. Se
ficarem iguais, algo mudou de número — e esta story não muda número nenhum.

---

## Bloco 3 — A janela de 7 dias (Story 44.27)

`Aba Meta Ads` do mesmo funil, seletor em **7 dias**.

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 8 | A tabela Dados Diários | Lista **7 linhas** | Lista 8 linhas, com a primeira sem investimento |
| 9 | A primeira linha da tabela | Tem investimento **e** venda | Investimento `—` com venda preenchida |
| 10 | O card de investimento (7d) | Bate com a **soma da coluna** da tabela | Diverge da soma por um dia inteiro |

---

## Bloco 4 — As duas contagens de venda, com nomes diferentes (Story 44.28)

Ainda na aba Meta Ads, seletor em **7 dias**.

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 11 | Card "Vendas" × soma da coluna de vendas da tabela | Podem **diferir por 1 ou 2** | Um deles mudou de ordem de grandeza |
| 12 | O rodapé "Total" da tabela | Diz que conta **vendas-dia**, não compradores | Diz só "Total", parecendo o mesmo do card |

⚠️ **A diferença é correta e deliberada.** O card conta compradores únicos no
período; a tabela deduplica dentro de cada dia, então quem comprou em dois dias
conta duas vezes lá. Medido em 08/09 no BBE em 7 dias: os dois deram **15** —
ninguém repetiu na semana. No `fz` em 7 dias deu 67 contra 66.

---

## Bloco 5 — O veredito do Resumão (Story 44.30)

Este bloco **não é de tela**: é do relatório que o Inácio publica.

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 13 | O Resumão abre com um estado | **🔴 Alerta**, 🟡 Atenção, 🟢 Saudável ou ⚪ Sem dado | "no ar e saudável" em texto livre |
| 14 | Logo abaixo do estado | A **condição que disparou**, ex. *"5 dos últimos 7 dias fecharam com margem negativa"* | Um parágrafo de impressão, sem condição citada |
| 15 | O estado do BBE hoje | **🔴 Alerta** | 🟢 Saudável |
| 16 | O texto | Cita ROAS de 7 **e** 30 dias, e a meta de 2x | Cita connect rate como razão do estado |

⚠️ **Item 15 é o caso que abriu a story.** O Resumão de 06/09 chamou de "no ar e
saudável" uma operação com ROAS 7d de 1,47x contra meta de 2x. Hoje o BBE está
em 1,33x (7d) e 1,94x (30d), com **5 dos 7 últimos dias negativos**.

| # | O que ver | ✅ passa | ❌ reprova |
|---|---|---|---|
| 17 | Blocos do Resumão | **Quatro**: dia fechado, 7 dias, 30 dias, contexto 90 dias | Só o dia, como no de 06/09 |
| 18 | Higiene | Sem `semTetoConfiavel`, `baseInsuficiente`, número de story, nome de rota ou campo | Qualquer código interno no texto |
| 19 | Pendências de infra | **Nenhuma** (VERCEL_TOKEN, deploy, gateway) | Alguma delas no Resumão da diretoria |
| 20 | O timestamp | Em **BRT**, e uma hora que já passou | "23:01 UTC" num relatório escrito às 17h |

---

## Bloco 6 — O que NÃO vai funcionar ainda, e por quê

| item | estado |
|---|---|
| A tool `get_perpetual_metrics` no Inácio | ⛔ **Não chega ainda.** O bundle MCP roda na máquina de quem usa o agente e precisa de rebuild manual. Story 44.22, com @devops. |
| O Resumão sair no formato novo | Depende do prompt do agente ser atualizado com o guia (`docs/guides/inacio-panorama-diario.md`, §5). |

⚠️ Se o Resumão de amanhã sair no formato antigo, **não é bug de código** — é o
prompt do agente que ainda não foi trocado.

---

## Achado conhecido, fora do escopo desta leva

`DG & CPDF / dg-a1` exibe **`CAC real R$ 0,00`** com 2.162 vendas: o
investimento no período é zero e `0 ÷ 2162 = 0`. É anterior a esta leva e atinge
qualquer etapa paga sem gasto no período. "R$ 0,00" lê-se como *aquisição de
graça* onde o fato é *não houve mídia* — deveria ser `—`. Registrado na Story
44.28, não corrigido; pede story própria.

---

## Se algo reprovar

Anote **qual item**, **o que apareceu na tela** e **em qual funil/etapa**. Um
print ajuda mais que a descrição. Se o número divergir, diga qual seletor de
período estava ativo — metade das divergências desta leva eram janelas
diferentes, não contas erradas.
