# Classificação das regras: Painel de Controle, categoria Planejamento

Documento derivado da especificação técnica `especificacao_tecnica_painel_planejamento.md` (referida abaixo como "spec"). Cada regra de cálculo, validação e formatação condicional da spec foi submetida ao teste: se a planilha fosse descartada e o processo redesenhado do zero, a regra ainda precisaria existir? Sim = regra de negócio (RN); não, existe só para contornar limitação da planilha = artefato (AR); não dá para decidir com o que está documentado = dúvida (DV). Constantes numéricas sem origem, contradições entre regras e exceções manuais foram classificadas como DV por obrigação, mesmo quando a regra em volta é claramente de negócio; nesses casos a RN aparece na tabela e a constante ou a contradição aparece como DV separada, ligada a ela.

Os IDs são estáveis e não devem ser renumerados. Criticidade: **alta** quando um erro afeta valor financeiro (meta, receita, margem, verba, CPL, vendas, leads que dimensionam investimento); **média** quando afeta decisão interna (indicadores, status, classificação); **baixa** quando é apresentação.

Abas: A1 = `[1] Inputs Financeiros`, A2 = `[2] Leads Orgânicos`, A3 = `[3] Leads Pagos`, A4 = `[4] Resumo Final`, CR = `Cronograma`, TL = `Cronograma (Timeline)`, VA = `Variáveis`, DA = `Desafios e aprendizados`.

## 1. Tabela resumo

| ID | Nome da regra | Aba de origem | Classificação | Criticidade |
|---|---|---|---|---|
| RN-001 | Total de custos variáveis sobre a receita bruta | A1 | RN | alta |
| RN-002 | Divisão da meta de margem de contribuição entre leads pagos e orgânicos | A1 | RN | alta |
| RN-003 | Margem-alvo dos leads orgânicos igual a 100% menos os custos variáveis | A1 | RN | alta |
| RN-004 | Receita necessária igual à meta de margem dividida pela margem-alvo | A1 | RN | alta |
| RN-005 | Margem de contribuição média alvo | A1 | RN | média |
| RN-006 | Distribuição do investimento em anúncios por plataforma e por público | A1 | RN | alta |
| RN-007 | Receita necessária por fonte paga a partir da meta de margem da fonte | A1 | RN | alta |
| RN-008 | Distribuição da meta de margem orgânica por canal e receita necessária por canal | A1 | RN | alta |
| RN-009 | Distribuição por canal orgânico deve fechar em 100% | A1 | RN | média |
| RN-010 | Leads esperados por campanha igual a taxa de captação vezes tamanho da base | A2 | RN | média |
| RN-011 | Progressão dos dez cenários de receita pela variação informada | A2, A3 | RN | alta |
| RN-012 | Escada de níveis de conversão decrescentes a partir da conversão média | A2, A3 | RN | alta |
| RN-013 | Número de vendas igual à receita dividida pelo ticket médio | A2, A3, A4 | RN | alta |
| RN-014 | Leads necessários igual a vendas dividido pela conversão | A2 | RN | alta |
| RN-015 | Classificação dos cenários de leads em quatro faixas em torno dos leads esperados | A2 | RN | média |
| RN-016 | Escolha de um cenário de receita por canal ou fonte para compor uma combinação | A2, A3 | RN | alta |
| RN-017 | Receita bruta da combinação igual à soma dos canais ou fontes | A2, A3, A4 | RN | alta |
| RN-018 | Cadeia de deduções: reembolso sobre a receita bruta, demais custos sobre a receita tributável | A2, A3, A4 | RN | alta |
| RN-019 | Margem de contribuição percentual sobre a receita bruta | A2, A3, A4 | RN | média |
| RN-020 | Atingimento e diferença em relação à meta de margem | A2, A3, A4 | RN | média |
| RN-021 | Escolha do nível de conversão assumido por canal ou fonte e leitura dos leads e CPL correspondentes | A2, A3 | RN | alta |
| RN-022 | Conversão efetiva por canal igual a vendas dividido por leads | A2, A3, A4 | RN | média |
| RN-023 | Totais de vendas e de leads orgânicos da combinação | A2, A4 | RN | alta |
| RN-024 | Divisão da verba de cada fonte paga entre captação e remarketing | A3 | RN | alta |
| RN-025 | CPL máximo por cenário igual à verba de captação dividida pelos leads necessários | A3 | RN | alta |
| RN-026 | Classificação dos cenários de CPL em quatro faixas em torno do CPL médio histórico | A3 | RN | média |
| RN-027 | Tráfego total e participação do tráfego na receita bruta | A3, A4 | RN | alta |
| RN-028 | Margem de contribuição dos leads pagos por plataforma, descontando a verba da plataforma | A3 | RN | alta |
| RN-029 | Vendas e leads por plataforma iguais à soma de público quente e público frio | A3, A4 | RN | alta |
| RN-030 | Custo por lead consolidado igual à verba dividida pelos leads | A4 | RN | alta |
| RN-031 | Margem de contribuição total e receita líquida total consolidadas | A4 | RN | alta |
| RN-032 | Tarefa atrasada quando a data de fim já passou e o status ainda está ativo | CR | RN | média |
| RN-033 | Status "Barra Macro" identifica faixa de fase, não tarefa | CR | RN | baixa |
| RN-034 | Status de tarefa restrito a sete valores | CR | RN (implícita) | média |
| RN-035 | Fase restrita a sete valores | CR, DA | RN (implícita) | média |
| RN-036 | Status de desafio restrito a dois valores | DA | RN (implícita) | baixa |
| RN-037 | Campos bloqueados não são editados; campos marcados como editáveis são as entradas | A1, A2, A3, A4 | RN (implícita) | baixa |
| RN-038 | Seleção de cenário deve ser inteiro de 1 a 10 ou vazio | A2, A3 | RN (implícita) | média |
| RN-039 | Pelo menos uma caixa de nível de conversão marcada por bloco | A2, A3 | RN (implícita) | média |
| RN-040 | Taxonomia fixa de canais: seis canais orgânicos e quatro fontes pagas | A1, A2, A3, A4 | RN (implícita) | média |
| AR-001 | Verificação de soma pagos + orgânicos (E13), identicamente 100% | A1 | AR | baixa |
| AR-002 | Verificações de investimento (E22/E23) e de metas de pagos (E30/E31), identicamente 100% | A1 | AR | baixa |
| AR-003 | Células espelho que copiam valores de outra aba | A2, A3, A4, CR | AR | baixa |
| AR-004 | Textos de legenda das faixas de leads e de CPL | A2, A3 | AR | baixa |
| AR-005 | Barra de progresso em caracteres do atingimento da meta | A2, A3, A4 | AR | baixa |
| AR-006 | Percentuais de dedução consolidados que reproduzem os percentuais de entrada | A4 | AR | baixa |
| AR-007 | Re-soma de totais orgânicos na aba 4 em vez de importar os totais da aba 2 | A4 | AR | baixa |
| AR-008 | Nome final da tarefa concatenado a partir de fase, demanda e atraso | CR | AR | baixa |
| AR-009 | Sinalização visual por cor de atraso, de positivo/negativo e de conferido/enviado | A2, A3, A4, CR, DA | AR | baixa |
| AR-010 | Visualização Timeline como projeção do Cronograma | TL | AR | baixa |
| AR-011 | Filtro de visualização salvo e faixas formatadas como tabela | DA, VA | AR | baixa |
| DV-001 | Receita da fonte Google frio dividida pela margem-alvo de orgânicos (G37) | A1 | DV | alta |
| DV-002 | Metas de margem por fonte paga reutilizam os percentuais de investimento | A1 | DV | alta |
| DV-003 | Constante 70% no primeiro cenário de receita | A2, A3 | DV | alta |
| DV-004 | Passo da escada de conversão igual à variação dividida por 100 | A2, A3 | DV | alta |
| DV-005 | Multiplicadores 2,5 e 5 das faixas de leads e de CPL | A2, A3 | DV | média |
| DV-006 | Cenário 3 do canal Área de Membros dividido por célula vazia | A2 | DV | alta |
| DV-007 | Tratamento de erro como zero e assimetria de piso entre abas 2 e 3 | A2, A3 | DV | alta |
| DV-008 | Mais de uma caixa marcada: a primeira vence; nenhuma marcada: erro | A2, A3 | DV | média |
| DV-009 | Verba de remarketing calculada sem consumidor | A3 | DV | média |
| DV-010 | Blocos 2 e 4 da aba 3 leem variações dos blocos 1 e 3 | A3 | DV | alta |
| DV-011 | Legendas intermediárias de CPL com formatação indeterminada | A3 | DV | baixa |
| DV-012 | Sentido das cores das faixas de CPL, invertido em relação às faixas de leads | A3 | DV | baixa |
| DV-013 | Total de vendas pagas soma apenas públicos quentes (Y46) | A3 | DV | média |
| DV-014 | CPL máximo e leads do Meta frio nas combinações 2 a 5 lidos do bloco errado | A3 | DV | alta |
| DV-015 | Vendas Google consolidadas contam só o público quente (G68) | A4 | DV | alta |
| DV-016 | Limiar de 70% na sinalização do atingimento da meta | A2, A3, A4 | DV | baixa |
| DV-017 | Rótulos META PISO, META BOA, META SUPER sem regra associada | A4 | DV | baixa |
| DV-018 | Tarefa sem data de fim tratada como atrasada | CR | DV | média |
| DV-019 | Origem da lista de responsáveis (aba inexistente ou lista de menus) | CR | DV | média |
| DV-020 | Sinalização "Conferido" e "Enviado" com valores fora das listas | CR, DA | DV | baixa |
| DV-021 | Marcador ◈ na coluna Demanda | CR | DV | baixa |
| DV-022 | Coluna Consequência com fórmula quebrada nas últimas linhas | DA | DV | média |
| DV-023 | Lista de fases aplicada à coluna de status nas linhas 10 a 21 | DA | DV | baixa |
| DV-024 | Unidades declaradas que divergem do conteúdo do campo | A1, A2, A3 | DV | baixa |
| DV-025 | Rótulos "Meta Ads" nas linhas de receita do Google | A3 | DV | baixa |
| DV-026 | Vendas e leads fracionários: arredondar ou não | A2, A3, A4 | DV | média |
| DV-027 | Configuração da Timeline (título, detalhe, cor, agrupamento) | TL | DV | baixa |
| DV-028 | Formato do ID da campanha: convenção obrigatória ou sugestão | VA | DV | baixa |
| DV-029 | Coluna Tags preenchida à mão sempre com o mesmo valor | CR | DV | baixa |
| DV-030 | Regras executadas por scripts externos (calendário, pasta, tracking) não documentadas | VA, CR | DV | média |
| DV-031 | Comportamento com texto em campo numérico ou de data | A1, CR | DV | média |

## 2. Regras de negócio

As regras implícitas RN-034 a RN-040 estão detalhadas na seção 5, com os mesmos campos. Em todas as regras do simulador (abas 1 a 4) a frequência é "sob demanda": o recálculo acontece a cada alteração de qualquer entrada, e não há periodicidade própria.

### RN-001 Total de custos variáveis sobre a receita bruta

* **Enunciado.** O percentual total de custos variáveis do lançamento é a soma de seis percentuais: reembolso, plataforma de pagamento, imposto, custos do produto, comissões e outros custos. Cada percentual é informado pela equipe como fração da receita bruta.
* **Entrada.** Seis percentuais manuais (A1, G3:G8).
* **Resultado e consumidor.** Percentual total de custos (A1, G9). Consumido por RN-003 (margem-alvo dos orgânicos) e, item a item, por RN-018 (deduções das abas 2, 3 e 4).
* **Condições e exceções.** Percentual vazio conta como zero. Não há validação de faixa (um total acima de 100% é aceito e zera ou inverte a margem-alvo, ver RN-003).
* **Frequência.** Sob demanda.
* **Depende de.** Nenhuma.
* **Referência.** spec 1.2, "pct_custos_total (G9)".

### RN-002 Divisão da meta de margem de contribuição entre leads pagos e orgânicos

* **Enunciado.** A meta de margem de contribuição total do lançamento é repartida em uma parte vinda de leads pagos e outra vinda de leads orgânicos; a equipe informa a participação dos pagos e a dos orgânicos é o complemento até 100%.
* **Entrada.** Meta de margem total (A1, F13) e participação dos pagos (A1, E14), ambas manuais.
* **Resultado e consumidor.** Participação dos orgânicos (E15), meta de margem dos pagos (F14) e dos orgânicos (F15). Consumidas por RN-004, RN-007, RN-008 e pelas comparações de atingimento RN-020 (abas 2 e 3).
* **Condições e exceções.** Participação vazia vale zero (toda a meta vai para orgânicos). Não há validação de 0% a 100%.
* **Frequência.** Sob demanda.
* **Depende de.** Nenhuma.
* **Referência.** spec 1.2, "pct_margem_organicos (E15), pct_check_margem (E13)" e "meta_margem_pagos (F14), meta_margem_organicos (F15)".

### RN-003 Margem-alvo dos leads orgânicos igual a 100% menos os custos variáveis

* **Enunciado.** A margem de contribuição esperada sobre a receita de leads orgânicos é tudo o que sobra depois dos custos variáveis, ou seja, 100% menos o total de custos.
* **Entrada.** Total de custos variáveis (RN-001).
* **Resultado e consumidor.** Margem-alvo dos orgânicos (A1, F17). Consumida por RN-004, RN-008 e, na fonte, também por G37 (ver DV-001).
* **Condições e exceções.** Se os custos somarem 100%, a margem-alvo é zero e as receitas necessárias dos orgânicos ficam indefinidas (divisão por zero). Custos vazios resultam em margem-alvo de 100%.
* **Frequência.** Sob demanda.
* **Depende de.** RN-001.
* **Referência.** spec 1.2, "mc_alvo_organicos (F17)".

### RN-004 Receita necessária igual à meta de margem dividida pela margem-alvo

* **Enunciado.** Para atingir uma meta de margem de contribuição com uma margem-alvo percentual, a receita bruta necessária é a meta dividida pela margem-alvo. A receita necessária total é a soma das receitas necessárias de pagos e de orgânicos.
* **Entrada.** Metas de margem de pagos e de orgânicos (RN-002); margem-alvo dos pagos (A1, F18, manual) e dos orgânicos (RN-003).
* **Resultado e consumidor.** Receita necessária de pagos (G14), de orgânicos (G15) e total (G13). Consumidas por RN-005; os valores por fonte e por canal seguem o mesmo princípio em RN-007 e RN-008.
* **Condições e exceções.** Margem-alvo vazia ou zero produz erro de divisão por zero, que se propaga ao total, à média (RN-005) e às abas 2, 3 e 4.
* **Frequência.** Sob demanda.
* **Depende de.** RN-002, RN-003.
* **Referência.** spec 1.2, "receita_meta_pagos (G14), receita_meta_organicos (G15), receita_meta_total (G13)".

### RN-005 Margem de contribuição média alvo

* **Enunciado.** A margem média esperada do lançamento é a meta de margem total dividida pela receita necessária total.
* **Entrada.** Meta de margem total (A1, F13) e receita necessária total (RN-004).
* **Resultado e consumidor.** Indicador percentual (A1, F19). Não é consumido por nenhuma outra regra; é lido pela equipe.
* **Condições e exceções.** Receita necessária zero (meta zero) produz divisão por zero.
* **Frequência.** Sob demanda.
* **Depende de.** RN-004.
* **Referência.** spec 1.2, "mc_alvo_media (F19)".

### RN-006 Distribuição do investimento em anúncios por plataforma e por público

* **Enunciado.** O investimento total em anúncios é repartido entre Meta Ads e Google Ads pela participação informada para o Meta (o Google recebe o complemento). Dentro de cada plataforma, a verba é repartida entre público quente e público frio pela participação informada para o quente (o frio recebe o complemento).
* **Entrada.** Investimento total (A1, G23), participação do Meta (E24), participação do quente no Meta (E25) e no Google (E28), todos manuais.
* **Resultado e consumidor.** Verbas do Meta e do Google (G24, G27) e das quatro combinações plataforma × público (G25, G26, G28, G29). Consumidas por RN-024 (aba 3) e pelo tráfego consolidado RN-027 (abas 3 e 4).
* **Condições e exceções.** Participações vazias valem zero (tudo vai para o complemento). Não há validação de 0% a 100%.
* **Frequência.** Sob demanda.
* **Depende de.** Nenhuma.
* **Referência.** spec 1.2, "Distribuição do investimento (E23, E26, E27, E29, G24:G29)".

### RN-007 Receita necessária por fonte paga a partir da meta de margem da fonte

* **Enunciado.** Cada uma das quatro fontes pagas (Meta quente, Meta frio, Google quente, Google frio) tem uma meta de margem de contribuição; a receita que a fonte precisa gerar é a sua meta de margem dividida pela margem-alvo dos leads pagos. As receitas por fonte somam a receita necessária por plataforma e o total de pagos.
* **Entrada.** Meta de margem dos pagos (RN-002); percentuais de repartição da meta por plataforma e por público (na fonte, iguais aos da distribuição do investimento, ver DV-002); margem-alvo dos pagos (A1, F18).
* **Resultado e consumidor.** Metas de margem por fonte (F32:F37) e receitas necessárias por fonte (G33, G34, G36, G37) e agregadas (G32, G35, G31). As receitas por fonte alimentam a aba 3 (RN-011, cenário base de cada fonte).
* **Condições e exceções.** Margem-alvo dos pagos vazia ou zero produz divisão por zero. A fonte Google frio divide por outra margem-alvo (DV-001).
* **Frequência.** Sob demanda.
* **Depende de.** RN-002, RN-004 (mesmo princípio), DV-001, DV-002.
* **Referência.** spec 1.2, "Metas financeiras de leads pagos (E31:G37)".

### RN-008 Distribuição da meta de margem orgânica por canal e receita necessária por canal

* **Enunciado.** A meta de margem dos leads orgânicos é repartida entre seis canais (WhatsApp, Email, Instagram, Telegram, YouTube, Área de Membros) por percentuais informados pela equipe. A receita que cada canal precisa gerar é a sua meta de margem dividida pela margem-alvo dos orgânicos.
* **Entrada.** Meta de margem dos orgânicos (RN-002), seis percentuais manuais (A1, E42:E47), margem-alvo dos orgânicos (RN-003).
* **Resultado e consumidor.** Meta de margem por canal (F42:F47), receita necessária por canal (G42:G47) e total (G41). As receitas por canal alimentam a aba 2 (RN-011, cenário base de cada canal).
* **Condições e exceções.** Percentual vazio vale zero para o canal. Margem-alvo zero produz divisão por zero em todos os canais. Se os percentuais não somarem 100%, a soma das receitas por canal não coincide com a receita necessária dos orgânicos calculada em RN-004 (sinalizado por RN-009).
* **Frequência.** Sob demanda.
* **Depende de.** RN-002, RN-003.
* **Referência.** spec 1.2, "Metas financeiras de leads orgânicos (E41:G47)".

### RN-009 Distribuição por canal orgânico deve fechar em 100%

* **Enunciado.** A soma dos percentuais dos seis canais orgânicos deve ser exatamente 100%; quando falta ou sobra, a equipe é avisada de quanto falta distribuir ou quanto reduzir, em pontos percentuais inteiros.
* **Entrada.** Seis percentuais por canal (A1, E42:E47).
* **Resultado e consumidor.** Mensagem de status (A1, E40) com três estados: falta distribuir X%, 100% ok, passou de 100% reduzir X%. Lida pela equipe; não bloqueia o cálculo.
* **Condições e exceções.** Percentuais todos vazios resultam em "falta distribuir 100%". A comparação com 100% é exata, sem tolerância; somas com resíduo de ponto flutuante podem cair no estado errado. O valor X é arredondado para inteiro (meia unidade afastando-se de zero).
* **Frequência.** Sob demanda.
* **Depende de.** RN-008.
* **Referência.** spec 1.2, "Mensagens de distribuição (E22, E30, E40)"; as verificações E22 e E30 são AR-002.

### RN-010 Leads esperados por campanha igual a taxa de captação vezes tamanho da base

* **Enunciado.** Para cada canal orgânico, o número médio de leads que uma campanha capta é a taxa média de captação do canal aplicada ao tamanho da base do canal.
* **Entrada.** Taxa de captação (A2, campo "Taxa de captação média da base" de cada bloco, manual) e tamanho da base (A1, G49:G54, manual).
* **Resultado e consumidor.** Leads esperados por campanha (A2, F12 e equivalentes). Consumido apenas por RN-015 (faixas de classificação) e pelas legendas AR-004.
* **Condições e exceções.** Entrada vazia vale zero. Sem validação.
* **Frequência.** Sob demanda.
* **Depende de.** Nenhuma.
* **Referência.** spec 2.2, "leads_medios_campanha (F{r0+6})".

### RN-011 Progressão dos dez cenários de receita pela variação informada

* **Enunciado.** Para cada canal orgânico e cada fonte paga são gerados dez cenários de receita. O primeiro cenário parte de uma fração fixa da receita necessária do canal ou fonte (a fração é DV-003) e cada cenário seguinte é o anterior acrescido do percentual de variação informado pela equipe para aquele canal ou fonte.
* **Entrada.** Receita necessária do canal (RN-008) ou da fonte (RN-007); percentual "Variação cenários 1 → 10" de cada bloco (manual).
* **Resultado e consumidor.** Dez valores de receita por bloco (linha de receita de cada bloco, colunas J:S). Consumidos por RN-013, RN-014, RN-025 e pela seleção RN-016.
* **Condições e exceções.** Receita necessária vazia gera dez cenários zerados; variação vazia gera dez cenários iguais. Na aba 3, o bloco Google frio usa a variação do bloco Google quente (DV-010).
* **Frequência.** Sob demanda.
* **Depende de.** RN-007, RN-008, DV-003, DV-010.
* **Referência.** spec 2.2 e 3.2, "Série de receita por cenário".

### RN-012 Escada de níveis de conversão decrescentes a partir da conversão média

* **Enunciado.** Para cada canal ou fonte, a conversão média em vendas informada pela equipe é o primeiro nível de uma escada; cada nível seguinte reduz a conversão em um passo fixo derivado do percentual "Variação cenários conversão" (o tamanho do passo é DV-004). A aba de orgânicos tem oito níveis e nunca deixa a conversão ficar negativa; a aba de pagos tem dez níveis e não impõe piso (a assimetria é DV-007).
* **Entrada.** Conversão média e variação da conversão de cada bloco (manuais).
* **Resultado e consumidor.** Oito ou dez níveis de conversão por bloco (coluna I das linhas de leads ou de CPL). Consumidos por RN-014 (orgânicos), RN-025 (pagos) e RN-021 (nível escolhido).
* **Condições e exceções.** Conversão média vazia ou negativa: na aba 2 toda a escada é zero; na aba 3 a escada parte do valor informado e pode ser negativa. Na aba 3, os blocos Meta frio e Google frio usam a variação de outro bloco (DV-010).
* **Frequência.** Sob demanda.
* **Depende de.** DV-004, DV-007, DV-010.
* **Referência.** spec 2.2 e 3.2, "Escada de conversão".

### RN-013 Número de vendas igual à receita dividida pelo ticket médio

* **Enunciado.** O número de vendas correspondente a uma receita é a receita dividida pelo ticket médio único do lançamento. Vale para cada cenário de cada canal ou fonte e para a receita escolhida de cada canal ou fonte na combinação.
* **Entrada.** Receita do cenário (RN-011) ou receita escolhida (RN-016); ticket médio (A1, F16, manual).
* **Resultado e consumidor.** Vendas por cenário (linhas de vendas da aba 2; implícito nas fórmulas de leads e CPL da aba 3) e vendas por canal ou fonte na combinação (A2 Y35, Y39, …; A3 Y48, Y53, Y59, Y64; A4 G41:G46, G66:G70 por importação). Consumidas por RN-014, RN-022, RN-023, RN-029.
* **Condições e exceções.** Ticket vazio ou zero: nas linhas de cenário da aba 2 e no bloco Meta frio da aba 3 o resultado vira zero silenciosamente (DV-007); nas demais posições é erro de divisão por zero. O resultado é fracionário e não é arredondado (DV-026).
* **Frequência.** Sob demanda.
* **Depende de.** RN-011, RN-016, DV-007, DV-026.
* **Referência.** spec 2.2 "Vendas por cenário", 2.2 "Vendas, leads e conversão por canal", 3.2 "CPL máximo por cenário e leads por cenário", 3.2 "Resumo de marketing".

### RN-014 Leads necessários igual a vendas dividido pela conversão

* **Enunciado.** Para cada canal orgânico, o número de leads necessário para produzir as vendas de um cenário, em um dado nível de conversão, é o número de vendas dividido por esse nível de conversão. A grade cruza os dez cenários com os oito níveis.
* **Entrada.** Vendas por cenário (RN-013) e nível de conversão da linha (RN-012).
* **Resultado e consumidor.** Grade de leads por cenário e nível (linhas de leads de cada bloco da aba 2). Consumida por RN-015 (faixas) e por RN-021 (leads do nível escolhido).
* **Condições e exceções.** Conversão zero resulta em zero leads (e não em erro), ver DV-007. No canal Área de Membros, o cenário 3 está ligado a uma célula vazia e dá sempre zero (DV-006). Resultado fracionário (DV-026).
* **Frequência.** Sob demanda.
* **Depende de.** RN-012, RN-013, DV-006, DV-007.
* **Referência.** spec 2.2, "Leads necessários por cenário".

### RN-015 Classificação dos cenários de leads em quatro faixas em torno dos leads esperados

* **Enunciado.** Cada valor de leads necessários é classificado em relação aos leads esperados por campanha do canal (RN-010), usando a "faixa de variação" informada pela equipe: abaixo do limite inferior, entre o inferior e o intermediário, entre o intermediário e o superior, ou acima do superior. Os três limites são múltiplos da faixa (os multiplicadores 2,5 e 5 são DV-005). Na planilha a classificação aparece como cor de fundo (azul, verde, amarelo, vermelho) e como texto de legenda.
* **Entrada.** Leads necessários (RN-014), leads esperados (RN-010), faixa de variação do bloco (manual).
* **Resultado e consumidor.** Faixa de cada célula de leads. Lida pela equipe para escolher o nível de conversão e o cenário (RN-021, RN-016).
* **Condições e exceções.** Os limites inferior e superior são estritos e os intermediários inclusivos; um valor exatamente no limite intermediário cai na segunda faixa. Faixa vazia colapsa os três limites no valor dos leads esperados.
* **Frequência.** Sob demanda.
* **Depende de.** RN-010, RN-014, DV-005.
* **Referência.** spec 2.2, "Formatação condicional das faixas de leads" e "Legendas das faixas"; legenda em texto é AR-004.

### RN-016 Escolha de um cenário de receita por canal ou fonte para compor uma combinação

* **Enunciado.** Uma combinação é formada escolhendo, para cada canal orgânico (aba 2) e para cada fonte paga (aba 3), o número de um dos dez cenários de receita; a receita do canal ou fonte na combinação é a receita daquele cenário. Há cinco combinações independentes em cada aba, e a combinação de número k da aba 2 e a de número k da aba 3 formam o Cenário k da aba 4.
* **Entrada.** Número do cenário escolhido (colunas X, Z, AB, AD, AF das abas 2 e 3, manual, ver RN-038) e as séries de receita (RN-011).
* **Resultado e consumidor.** Receita por canal ou fonte por combinação (A2 Y11:Y16; A3 Y12, Y13, Y15, Y16, e colunas equivalentes). Consumida por RN-017, RN-013 e RN-021.
* **Condições e exceções.** Seleção vazia vale receita zero para o canal ou fonte. Seleção fora de 1 a 10 produz erro que se propaga a toda a combinação e ao cenário correspondente da aba 4.
* **Frequência.** Sob demanda.
* **Depende de.** RN-011, RN-038.
* **Referência.** spec 2.2, "Receita por canal na combinação (Y11:Y16 e equivalentes)"; spec 3.2, "Receita das combinações (Y10:Y16)".

### RN-017 Receita bruta da combinação igual à soma dos canais ou fontes

* **Enunciado.** A receita bruta de uma combinação de orgânicos é a soma das receitas escolhidas dos seis canais; a de pagos é a soma das quatro fontes (agrupadas por plataforma); a receita bruta total de um cenário da aba 4 é a soma das duas.
* **Entrada.** Receitas escolhidas (RN-016).
* **Resultado e consumidor.** A2 Y10; A3 Y11, Y14, Y10; A4 G11, G12, G10. Consumida por RN-018, RN-019, RN-027.
* **Condições e exceções.** Todas as seleções vazias resultam em receita zero, o que gera divisão por zero nos percentuais (RN-019, RN-027).
* **Frequência.** Sob demanda.
* **Depende de.** RN-016.
* **Referência.** spec 2.2 "Receita bruta e cadeia de deduções"; spec 3.2 "Receita das combinações"; spec 4.2 "Receitas e deduções".

### RN-018 Cadeia de deduções: reembolso sobre a receita bruta, demais custos sobre a receita tributável

* **Enunciado.** Da receita bruta desconta-se primeiro o reembolso (percentual sobre a receita bruta), obtendo a receita tributável. Sobre a receita tributável aplicam-se, cada um separadamente, os percentuais de plataforma de pagamento, imposto, custo do produto, comissões e outros custos. O que sobra é a margem de contribuição (orgânicos) ou a receita líquida antes do tráfego (pagos). A aba 4 consolida cada dedução somando a parte orgânica e a parte paga.
* **Entrada.** Receita bruta da combinação (RN-017) e os seis percentuais de custo (RN-001, itens individuais).
* **Resultado e consumidor.** Reembolso, receita tributável, cinco deduções e margem/receita líquida por combinação (A2 Y18:Y28; A3 Y18:Y28; A4 G14:G24). Consumidos por RN-019, RN-020, RN-028, RN-031.
* **Condições e exceções.** Percentual vazio vale zero para aquela dedução. Não há dedução condicional: todas se aplicam sempre.
* **Frequência.** Sob demanda.
* **Depende de.** RN-001, RN-017.
* **Referência.** spec 2.2 "Receita bruta e cadeia de deduções"; spec 3.2 "Cadeia de deduções e tráfego"; spec 4.2 "Receitas e deduções".

### RN-019 Margem de contribuição percentual sobre a receita bruta

* **Enunciado.** A margem de contribuição percentual de uma combinação, de uma plataforma ou de um cenário consolidado é a margem em valor dividida pela receita bruta correspondente.
* **Entrada.** Margem em valor (RN-018 para orgânicos; RN-028 para pagos; RN-031 para o total) e receita bruta (RN-017).
* **Resultado e consumidor.** A2 Y29; A3 X40, X41, Y42; A4 F34, F35, F36. Indicadores lidos pela equipe.
* **Condições e exceções.** Receita bruta zero produz divisão por zero.
* **Frequência.** Sob demanda.
* **Depende de.** RN-017, RN-018, RN-028, RN-031.
* **Referência.** spec 2.2 (Y29), 3.2 "Margem de contribuição dos leads pagos", 4.2 "Margem de contribuição (G34:G36, F34:F36)".

### RN-020 Atingimento e diferença em relação à meta de margem

* **Enunciado.** Para cada combinação ou cenário, o atingimento é a margem de contribuição obtida dividida pela meta de margem correspondente (orgânica na aba 2, paga na aba 3, total na aba 4), e a diferença é a margem obtida menos a meta.
* **Entrada.** Margem obtida (RN-018 orgânicos; RN-028 pagos; RN-031 total) e metas (RN-002, A1 F13).
* **Resultado e consumidor.** A2 Y2 e Y5; A3 Y2 e Y5; A4 G2 e G5 (e colunas equivalentes). Lidos pela equipe; a barra gráfica é AR-005 e a sinalização por cor usa um limiar não explicado (DV-016).
* **Condições e exceções.** Meta zero produz divisão por zero no atingimento; a diferença continua numérica.
* **Frequência.** Sob demanda.
* **Depende de.** RN-002, RN-018, RN-028, RN-031.
* **Referência.** spec 2.2, 3.2 e 4.2, "Meta, atingimento, barra e gap".

### RN-021 Escolha do nível de conversão assumido por canal ou fonte e leitura dos leads e CPL correspondentes

* **Enunciado.** Para cada canal orgânico e cada fonte paga, a equipe marca na escada de conversão o nível que assume como premissa. O número de leads da combinação (e, para pagos, o CPL máximo) é o valor da grade na linha do nível marcado e na coluna do cenário escolhido para aquele canal ou fonte.
* **Entrada.** Caixas de seleção da escada (colunas H das abas 2 e 3, manuais, ver RN-039), cenário escolhido (RN-016), grades de leads (RN-014) e de CPL e leads pagos (RN-025).
* **Resultado e consumidor.** Leads por canal na combinação (A2 Y36, Y40, Y44, Y48, Y52, Y56); CPL máximo e leads por fonte (A3 Y49, Y50, Y54, Y55, Y60, Y61, Y65, Y66). Consumidos por RN-022, RN-023, RN-029, RN-030 e exportados para a aba 4.
* **Condições e exceções.** Nenhuma caixa marcada ou cenário vazio produz erro, que se propaga aos totais de leads, às conversões e à aba 4. Mais de uma caixa marcada: vale a primeira de cima para baixo (DV-008). Nas combinações 2 a 5 da aba 3, a fonte Meta frio lê o bloco errado (DV-014).
* **Frequência.** Sob demanda.
* **Depende de.** RN-014, RN-016, RN-025, RN-039, DV-008, DV-014.
* **Referência.** spec 2.2 "Vendas, leads e conversão por canal"; spec 3.2 "Resumo de marketing (Y46:Y67)".

### RN-022 Conversão efetiva por canal igual a vendas dividido por leads

* **Enunciado.** A conversão efetiva de um canal, fonte, plataforma ou do total é o número de vendas dividido pelo número de leads correspondentes.
* **Entrada.** Vendas (RN-013, RN-029) e leads (RN-021, RN-029).
* **Resultado e consumidor.** A2 Y37, Y41, …; A3 Y51, Y56, Y62, Y67; A4 G48, G72, G73, G76 (e importações). Indicadores lidos pela equipe.
* **Condições e exceções.** Na aba 2 a divisão por zero ou erro nos leads resulta em conversão zero (DV-007); nas abas 3 e 4 resulta em erro.
* **Frequência.** Sob demanda.
* **Depende de.** RN-013, RN-021, RN-029, DV-007.
* **Referência.** spec 2.2, 3.2 e 4.2, resumos de marketing.

### RN-023 Totais de vendas e de leads orgânicos da combinação

* **Enunciado.** O total de vendas dos orgânicos é a soma das vendas dos seis canais; o total de leads é a soma dos leads dos seis canais.
* **Entrada.** Vendas por canal (RN-013) e leads por canal (RN-021).
* **Resultado e consumidor.** A2 Y33 e Y34; A4 G40 e G56 (recalculados a partir das linhas por canal, AR-007). Consumidos por RN-022 (conversão dos orgânicos, aba 4).
* **Condições e exceções.** Erro em qualquer canal (caixa não marcada) propaga para o total.
* **Frequência.** Sob demanda.
* **Depende de.** RN-013, RN-021.
* **Referência.** spec 2.2 "Vendas, leads e conversão por canal"; spec 4.2 "Resumo de marketing: orgânicos".

### RN-024 Divisão da verba de cada fonte paga entre captação e remarketing

* **Enunciado.** A verba de cada fonte paga é dividida entre captação e remarketing: a equipe informa a parte destinada à captação e o remarketing fica com o complemento. Só a verba de captação entra no cálculo do CPL máximo.
* **Entrada.** Verba da fonte (RN-006, via importação) e percentual de captação (A3, coluna E de cada bloco, manual).
* **Resultado e consumidor.** Verba de captação e verba de remarketing por fonte. A de captação é consumida por RN-025; a de remarketing não tem consumidor (DV-009).
* **Condições e exceções.** Percentual vazio vale zero (toda a verba vai para remarketing, e o CPL máximo fica zero).
* **Frequência.** Sob demanda.
* **Depende de.** RN-006, DV-009.
* **Referência.** spec 3.2, "Divisão da verba em captação e remarketing".

### RN-025 CPL máximo por cenário igual à verba de captação dividida pelos leads necessários

* **Enunciado.** Para cada fonte paga, cenário de receita e nível de conversão, os leads necessários são as vendas do cenário divididas pelo nível de conversão, e o CPL máximo que a fonte pode pagar é a verba de captação dividida por esses leads.
* **Entrada.** Verba de captação (RN-024), receita do cenário (RN-011), ticket médio (RN-013), nível de conversão (RN-012).
* **Resultado e consumidor.** Grades de CPL máximo e de leads por fonte (aba 3, linhas ímpares e pares de cada bloco). Consumidas por RN-026 e RN-021.
* **Condições e exceções.** Ticket ou conversão zero: erro de divisão por zero nos blocos Meta quente, Google quente e Google frio; zero no bloco Meta frio (DV-007). Receita zero produz leads zero e CPL indefinido. Conversão negativa (sem piso na aba 3) produz leads e CPL negativos sem erro.
* **Frequência.** Sob demanda.
* **Depende de.** RN-011, RN-012, RN-013, RN-024, DV-007, DV-010.
* **Referência.** spec 3.2, "CPL máximo por cenário e leads por cenário".

### RN-026 Classificação dos cenários de CPL em quatro faixas em torno do CPL médio histórico

* **Enunciado.** Cada CPL máximo é classificado em relação ao CPL médio histórico da fonte, informado pela equipe, usando a "faixa de variação de preço do CPL": abaixo do limite inferior, entre inferior e intermediário, entre intermediário e superior, ou acima do superior (multiplicadores DV-005). A planilha mostra a faixa como cor de fundo, na ordem inversa das cores da aba 2 (DV-012), e como legenda.
* **Entrada.** CPL máximo (RN-025), CPL médio histórico e faixa (manuais, por bloco).
* **Resultado e consumidor.** Faixa de cada célula de CPL. Lida pela equipe para escolher nível e cenário (RN-021, RN-016).
* **Condições e exceções.** Limites estritos e inclusivos como em RN-015; no bloco Google quente o limite superior é inclusivo (maior ou igual), nos outros três é estrito.
* **Frequência.** Sob demanda.
* **Depende de.** RN-025, DV-005, DV-012.
* **Referência.** spec 3.2, "Formatação condicional das faixas de CPL" e "Legendas de faixa de CPL".

### RN-027 Tráfego total e participação do tráfego na receita bruta

* **Enunciado.** O tráfego (investimento em anúncios) de uma combinação é a soma das verbas das quatro fontes, agrupadas por plataforma; a participação do tráfego é o tráfego dividido pela receita bruta de pagos (aba 3) ou pela receita bruta total (aba 4).
* **Entrada.** Verbas por fonte (RN-006, importadas na aba 3) e receita bruta (RN-017).
* **Resultado e consumidor.** A3 Y30:Y37; A4 G26:G32 e F26. Consumidos por RN-028 e RN-030.
* **Condições e exceções.** O tráfego é o mesmo nas cinco combinações (não depende do cenário escolhido). Receita bruta zero produz divisão por zero no percentual.
* **Frequência.** Sob demanda.
* **Depende de.** RN-006, RN-017.
* **Referência.** spec 3.2 "Cadeia de deduções e tráfego"; spec 4.2 "Tráfego (G26:G32, F26)".

### RN-028 Margem de contribuição dos leads pagos por plataforma, descontando a verba da plataforma

* **Enunciado.** Para cada plataforma (Meta, Google), a margem de contribuição é a receita da plataforma menos o reembolso, menos os cinco custos variáveis aplicados à receita tributável, menos a verba de tráfego da plataforma. A margem dos leads pagos é a soma das duas plataformas.
* **Entrada.** Receita por plataforma (RN-017), percentuais de custo (RN-001), verba por plataforma (RN-027).
* **Resultado e consumidor.** A3 Y40, Y41, Y39. Consumidos por RN-019, RN-020, RN-031 (via aba 4).
* **Condições e exceções.** Segue a mesma cadeia de RN-018; o resultado equivale à receita líquida da combinação menos o tráfego total.
* **Frequência.** Sob demanda.
* **Depende de.** RN-001, RN-017, RN-018, RN-027.
* **Referência.** spec 3.2, "Margem de contribuição dos leads pagos (Y39:Y42, X40:X41)".

### RN-029 Vendas e leads por plataforma iguais à soma de público quente e público frio

* **Enunciado.** As vendas de uma plataforma são as vendas do público quente mais as do público frio; o mesmo para leads. Os totais de pagos são a soma das duas plataformas.
* **Entrada.** Vendas e leads por fonte (RN-013, RN-021).
* **Resultado e consumidor.** A3 Y47, Y58; A4 G65, G89, G92, G88. Consumidos por RN-022 e RN-030.
* **Condições e exceções.** Na fonte, duas células não seguem a regra: o total de vendas pagas da aba 3 soma apenas os públicos quentes (DV-013) e as vendas do Google na aba 4 contam só o público quente (DV-015). A regra acima descreve as demais células; as duas exceções estão como dúvidas.
* **Frequência.** Sob demanda.
* **Depende de.** RN-013, RN-021, DV-013, DV-015.
* **Referência.** spec 3.2 "Resumo de marketing (Y46:Y67)"; spec 4.2 "Resumo de marketing: pagos".

### RN-030 Custo por lead consolidado igual à verba dividida pelos leads

* **Enunciado.** O custo por lead de um cenário é a verba de tráfego dividida pelos leads correspondentes: total de pagos, Meta e Google.
* **Entrada.** Verbas (RN-027) e leads por plataforma (RN-029).
* **Resultado e consumidor.** A4 G80, G81, G84. Indicadores lidos pela equipe.
* **Condições e exceções.** Leads zero ou em erro propagam. Os valores por fonte (G82, G83, G85, G86) não são calculados aqui, são os CPL máximos escolhidos em RN-021.
* **Frequência.** Sob demanda.
* **Depende de.** RN-027, RN-029.
* **Referência.** spec 4.2, "Resumo de marketing: pagos (G64:G94)".

### RN-031 Margem de contribuição total e receita líquida total consolidadas

* **Enunciado.** A margem de contribuição total de um cenário é a margem dos orgânicos mais a margem dos pagos; a receita líquida total é a soma da margem dos orgânicos com a receita líquida dos pagos antes do tráfego (as duas parcelas são "receita depois dos custos variáveis, antes do tráfego").
* **Entrada.** Margem dos orgânicos (RN-018, aba 2), margem dos pagos (RN-028), receita líquida dos pagos (RN-018, aba 3).
* **Resultado e consumidor.** A4 G34 e G24. Consumidos por RN-019 e RN-020.
* **Condições e exceções.** Erros das abas 2 e 3 propagam.
* **Frequência.** Sob demanda.
* **Depende de.** RN-018, RN-028.
* **Referência.** spec 4.2, "Receitas e deduções (G10:G24)" e "Margem de contribuição (G34:G36)".

### RN-032 Tarefa atrasada quando a data de fim já passou e o status ainda está ativo

* **Enunciado.** Uma tarefa do cronograma está atrasada quando tem demanda e status preenchidos, a data de fim é anterior à data de hoje, e o status não é "Feito", nem "Cancelado", nem uma faixa "Barra Macro".
* **Entrada.** Demanda, status e data de fim da linha (CR, colunas F, A, J) e a data corrente.
* **Resultado e consumidor.** Marcação "atrasado" por tarefa (CR, coluna K). Lida pela equipe, usada no nome final da tarefa (AR-008) e sinalizada em vermelho (AR-009).
* **Condições e exceções.** Tarefa que termina hoje não está atrasada. Demanda ou status vazios: sem marcação. Data de fim vazia: tratada como atrasada (DV-018). Status contendo "barra macro" em qualquer posição e caixa é excluído.
* **Frequência.** Diária (depende da data corrente); deve ser reavaliada a cada dia e a cada alteração da linha.
* **Depende de.** RN-033, RN-034, DV-018.
* **Referência.** spec 5.2, "atrasado (K2:K30)".

### RN-033 Status "Barra Macro" identifica faixa de fase, não tarefa

* **Enunciado.** Uma linha do cronograma com status "Barra Macro" não é uma tarefa: é uma faixa que representa uma fase do lançamento na linha do tempo. Ela nunca é marcada como atrasada e aparece na visualização apenas com o texto da demanda, sem prefixo de fase.
* **Entrada.** Status da linha (CR, coluna A).
* **Resultado e consumidor.** Tratamento diferenciado em RN-032 e AR-008; cor distinta na Timeline (AR-010).
* **Condições e exceções.** Na fonte, as faixas usam a demanda no formato "⎯ NOME ⎯"; a convenção do texto não é regra, é apresentação.
* **Frequência.** Por registro.
* **Depende de.** RN-034.
* **Referência.** spec 5.1 (valores de status), 5.2 "nome_final_tarefa" e "atrasado", 6.1.

## 3. Artefatos descartados

| ID | Artefato | Onde (spec) | Motivo do descarte |
|---|---|---|---|
| AR-001 | Verificação E13: soma da participação dos pagos com a dos orgânicos | 1.2 "pct_margem_organicos (E15), pct_check_margem (E13)" | A participação dos orgânicos é o complemento da dos pagos, então a soma é sempre 100% para qualquer entrada numérica. A célula só existe para exibir "100%"; não altera nenhum resultado. A regra de negócio subjacente (RN-002) permanece. |
| AR-002 | Verificações E22/E23 (investimento) e E30/E31 (metas de pagos) com mensagem de status | 1.2 "Mensagens de distribuição" e "Distribuição do investimento" | Pelo mesmo motivo, E23 e E31 valem sempre 100% e as mensagens E22 e E30 nunca mudam de estado. Só a verificação dos canais orgânicos (E40/E41) pode variar, e essa é RN-009. |
| AR-003 | Células espelho: metas e bases importadas da aba 1 para as abas 2 e 3; percentuais de custo copiados para as colunas V; meta de margem em W4; todas as importações da aba 4 (E4, G11, G12, G28:G32, G35, G36, G41:G46, G49:G54, G57:G62, G66, G67, G69, G70, G74, G75, G77, G78, G82, G83, G85, G86, G90, G91, G93, G94); coluna Campanha do Cronograma | 2.2 "importação", 3.2 "Importações", 4.1 mapa de campos, 5.2 "campanha (B2:B29)" | Cópias de valor entre abas para que fórmulas locais possam referenciá-los ou para exibir o mesmo número em outra tela. Não há transformação; em um sistema o dado é lido na origem. As regras que produzem os valores originais estão em RN-001, RN-002, RN-006, RN-007, RN-008 e nas RNs das abas 2 e 3. |
| AR-004 | Textos de legenda das faixas de leads (aba 2, D14:D17 e equivalentes) e de CPL (aba 3, D16:D19 e equivalentes) | 2.2 "Legendas das faixas", 3.2 "Legendas de faixa de CPL" | Renderização em texto dos limites já definidos em RN-015 e RN-026, com arredondamento só para exibição. Os limites em si dependem de DV-005; as legendas intermediárias de CPL são DV-011. |
| AR-005 | Barra de progresso do atingimento em caracteres "█" (Y3 nas abas 2 e 3, G3 na aba 4), inclusive o tratamento de erro que devolve 0 na aba 3 | 2.2, 3.2 e 4.2 "Meta, atingimento, barra e gap" | Representação gráfica improvisada do atingimento (RN-020) porque a planilha não tem componente de barra. Os 12 caracteres e o corte em 100% são escolhas de layout. A variação de referência entre as células (uma lê a cópia local da meta, as outras leem a origem) não altera o valor. |
| AR-006 | Percentuais de dedução consolidados da aba 4 (F14, F18:F22) | 4.2 "Receitas e deduções" | Dividem a dedução consolidada pela base e reproduzem exatamente os percentuais de entrada da aba 1 (observado nos valores em cache). São eco das entradas, não informação nova. Os percentuais de tráfego e de margem (F26, F34:F36) não foram descartados: são RN-019 e RN-027. |
| AR-007 | Re-soma dos totais de vendas e leads orgânicos na aba 4 (G40, G56) | 4.2 "Resumo de marketing: orgânicos" | Caminho de cálculo duplicado: a aba 2 já tem os mesmos totais (Y33, Y34). A regra é uma só (RN-023); a duplicidade existe porque a aba 4 importa linha a linha. |
| AR-008 | Nome final da tarefa: "[Fase] Demanda", com prefixo 🔴 quando atrasada, ou só a demanda para faixas | 5.2 "nome_final_tarefa (G2:G29)" | Concatenação de texto em coluna oculta, criada para que a Timeline exiba fase, demanda e atraso em um único campo. Fase, demanda e atraso continuam existindo como dados separados (RN-032, RN-033, RN-035). |
| AR-009 | Formatação condicional puramente visual: fonte vermelha em "🔴 Atrasado" (CR K); fonte verde/vermelha para valores positivos/negativos (A2 Y5, Y28:Y29; A3 Y5, Y38:Y41; A4 F34, G5, G35:G37 e equivalentes); fundo em "✅ Conferido"/"✅ Enviado" (CR E, DA A:B) | 2.2, 3.2, 4.2 (formatação condicional), 5.3, 8.3 | Sinalizam por cor o sinal de um número ou a presença de um texto, sem alterar dados nem introduzir limiar próprio. As regras com limiar (70% do atingimento, "Conferido"/"Enviado" fora das listas) não foram descartadas: são DV-016 e DV-020. |
| AR-010 | Visualização Cronograma (Timeline) | 6.1 a 6.4 | É uma projeção visual da tabela do Cronograma, sem cálculo próprio. A configuração da visualização não é legível (DV-027); os dados que ela mostra vêm de RN-032, RN-033 e das colunas manuais. |
| AR-011 | Filtro de visualização salvo em Desafios e aprendizados; faixas formatadas como tabela (`Table_2`, `Table_3`) | 7.1, 8.3 | Recursos de apresentação do Sheets sem efeito sobre valores. |

## 4. Perguntas ao cliente

Cada pergunta corresponde a uma DV. "Bloqueia" indica o que não pode ser implementado com segurança enquanto a resposta não vier.

### 4.1 Metas financeiras (aba 1)

**DV-001.** A receita necessária da fonte Google frio é calculada dividindo a meta de margem dessa fonte pela margem-alvo dos leads orgânicos, enquanto Meta quente, Meta frio e Google quente dividem pela margem-alvo dos leads pagos. As quatro fontes deveriam usar a margem-alvo dos pagos, ou o Google frio tem uma margem-alvo diferente de propósito? Bloqueia: RN-007 para a fonte Google frio e, por consequência, o cenário base do bloco Google frio (RN-011) e tudo o que deriva dele na aba 3.

**DV-002.** A meta de margem de cada fonte paga é repartida com os mesmos percentuais usados para repartir o investimento (a participação do Meta no investimento vira a participação do Meta na meta de margem, e o mesmo para público quente). Essa igualdade é uma decisão (a meta de margem de uma fonte deve ser proporcional à verba dela) ou é uma simplificação que o novo processo pode separar em percentuais próprios? Bloqueia: RN-007.

### 4.2 Cenários de receita e escada de conversão (abas 2 e 3)

**DV-003.** O primeiro dos dez cenários de receita de cada canal e fonte é sempre 70% da receita necessária. De onde vem esse 70%? É um piso pessimista padrão, deve ser parametrizável, ou pode variar por canal? Bloqueia: RN-011 e todos os valores derivados (vendas, leads, CPL, combinações).

**DV-004.** O campo "Variação cenários conversão" é exibido como percentual, mas a fórmula divide o valor por 100 antes de subtrair: um valor mostrado como 25% reduz a conversão em 0,25 ponto percentual por nível, e não em 25%. Qual é o passo pretendido entre os níveis de conversão: pontos percentuais fixos, redução relativa, ou outro? Bloqueia: RN-012 e, por consequência, RN-014, RN-025, RN-021.

**DV-007.** As abas de orgânicos e de pagos tratam erros e limites de forma diferente: a de orgânicos não deixa a conversão ficar negativa e devolve zero em vez de erro quando o ticket ou a conversão é zero; a de pagos deixa a conversão ficar negativa e devolve erro, exceto no bloco Meta frio, que devolve zero. Como o novo processo deve se comportar quando ticket médio, conversão ou leads forem zero ou vazios: bloquear a entrada, mostrar erro, ou considerar zero? A conversão pode ser negativa? Bloqueia: comportamento de exceção de RN-012, RN-013, RN-014, RN-022, RN-025.

**DV-010.** Na aba de pagos, o bloco Meta frio usa a variação de conversão do bloco Meta quente, e o bloco Google frio usa a variação de conversão e a variação de receita do bloco Google quente; os campos próprios desses blocos existem, são preenchidos, mas não são lidos por nenhuma fórmula. Cada bloco deve usar os próprios parâmetros? Bloqueia: RN-011 e RN-012 para os blocos Meta frio e Google frio.

**DV-006.** No canal Área de Membros, o cenário 3 de vendas divide a receita por uma célula vazia (e não pelo ticket médio), resultando sempre em zero vendas e zero leads nesse cenário. É um erro a corrigir ou há motivo para o cenário 3 desse canal ser zero? Bloqueia: RN-013 e RN-014 para o canal Área de Membros; a escolha do cenário 3 desse canal em qualquer combinação.

**DV-026.** Vendas e leads são calculados com casas decimais e nunca arredondados; a planilha apenas exibe sem decimais. O CPL máximo é calculado sobre leads fracionários. O novo processo deve arredondar vendas e leads (para cima, para baixo, ao inteiro mais próximo) antes de calcular conversão e CPL, ou manter frações? Bloqueia: precisão de RN-013, RN-014, RN-022, RN-025, RN-030.

### 4.3 Faixas de classificação (abas 2 e 3)

**DV-005.** Os limites das faixas de leads e de CPL são o valor de referência multiplicado por 1 menos 2,5 vezes a faixa, 1 mais 2,5 vezes a faixa e 1 mais 5 vezes a faixa. Por que 2,5 e 5? Esses multiplicadores são fixos, ou o que a equipe informa como "faixa de variação" já deveria ser o limite direto? Bloqueia: RN-015, RN-026, AR-004.

**DV-012.** Nas faixas de leads, o menor intervalo é azul e o maior é vermelho; nas faixas de CPL a ordem é invertida (menor intervalo vermelho, maior azul). Qual faixa de CPL é considerada boa e qual é ruim? A inversão é intencional (CPL baixo demais indica premissa irreal?) ou o mesmo sentido das cores deveria valer nas duas abas? Bloqueia: RN-026 (significado das quatro faixas de CPL).

**DV-011.** Nas legendas intermediárias das faixas de CPL, a fórmula aninha o segundo texto dentro do formato do primeiro, e o texto exibido não é previsível. O texto pretendido é "R$ [limite inferior] < CPL < R$ [limite intermediário]" e "R$ [limite intermediário] < CPL < R$ [limite superior]"? Bloqueia: AR-004 para a aba 3 (apenas texto).

### 4.4 Combinações e resumo de marketing (abas 2, 3 e 4)

**DV-008.** Se mais de uma caixa de nível de conversão estiver marcada no mesmo bloco, a planilha usa a primeira de cima para baixo e ignora as demais; se nenhuma estiver marcada, tudo o que depende dela vira erro. O novo processo deve exigir exatamente uma marcação por bloco? O que fazer enquanto não houver marcação? Bloqueia: RN-021, RN-039.

**DV-013.** O "Nº de Vendas Totais Leads Pagos" da aba 3 soma apenas as vendas de Meta quente e Google quente, deixando de fora os públicos frios, embora as linhas de subtotal por plataforma incluam quente e frio. O total deveria incluir os quatro públicos? Bloqueia: RN-029 para essa célula.

**DV-014.** Nas combinações 2 a 5 da aba 3, o CPL máximo e o número de leads do Meta frio são lidos do bloco Meta quente, usando o cenário escolhido para o Google frio; só a combinação 1 lê o bloco Meta frio com o cenário do Meta frio. Confirmam que as cinco combinações deveriam ler o bloco Meta frio com o cenário do Meta frio? Bloqueia: RN-021 e RN-029 para Meta frio nas combinações 2 a 5; na aba 4, CPL, leads e conversão do Meta frio nos cenários 2 a 5.

**DV-015.** Na aba 4, "Nº de Vendas Google" repete as vendas do público quente e não soma o público frio, apesar de a linha do Meta somar quente e frio; isso reduz o total de vendas pagas, a conversão do Google e a conversão de pagos. As vendas do Google devem somar quente e frio? Bloqueia: RN-029 e RN-022 para o Google e para o total de pagos na aba 4.

**DV-009.** A verba de remarketing de cada fonte é calculada, mas nenhuma outra célula a usa. Ela deveria alimentar algum cálculo (por exemplo, descontar do tráfego ou de outra meta) ou é só informativa? Bloqueia: nada hoje; define se RN-024 tem um segundo resultado.

**DV-017.** Os rótulos "META PISO", "META BOA" e "META SUPER" podem ser escolhidos para cada cenário da aba 4, mas nenhuma fórmula os usa e dois cenários ficam sem rótulo. O rótulo é só uma anotação, ou existe uma regra que liga cada rótulo a uma faixa de atingimento? Bloqueia: nada nos cálculos; define se há uma classificação de cenários a implementar.

**DV-016.** A sinalização por cor do atingimento da meta fica verde a partir de 100% e vermelha até 70%, sem cor entre 70% e 100%. De onde vem o 70%? Existe um significado de negócio (por exemplo, abaixo de 70% o cenário é inaceitável)? Bloqueia: sinalização de RN-020.

### 4.5 Cronograma e Timeline

**DV-018.** Uma tarefa com status ativo e sem data de fim é marcada como atrasada (a data vazia é tratada como uma data no passado). É o comportamento desejado, ou tarefa sem data de fim não deve ser avaliada? Bloqueia: exceção de RN-032.

**DV-019.** A lista de responsáveis das tarefas aponta, na maioria das linhas, para uma aba "Time" que não existe no arquivo, e em uma linha para a coluna "Time" da aba de menus. Qual é a fonte oficial da lista de responsáveis, e ela deve ser mantida como cadastro? Bloqueia: validação do campo Responsável.

**DV-020.** A coluna Fase do Cronograma e as colunas Status/Fase de Desafios e aprendizados têm sinalização por cor para os textos "✅ Conferido" e "✅ Enviado", que não existem nas listas de valores aceitos por essas colunas. Esses estados ainda são usados? Em qual campo? Bloqueia: nada nos cálculos; define se há dois status a mais.

**DV-021.** A coluna Status do Cronograma é destacada em azul quando a demanda da linha contém o caractere "◈", mas nenhuma linha do arquivo contém esse marcador. O marcador ainda tem significado (por exemplo, tarefa de destaque)? Bloqueia: nada; define se existe uma classificação de tarefa a mais.

**DV-029.** A coluna Tags do Cronograma é preenchida à mão e tem o mesmo valor em todas as linhas; na Timeline, ela é o agrupamento. Qual é o critério de preenchimento das Tags (uma por lançamento, por frente de trabalho, por equipe)? Bloqueia: RN sobre agrupamento da Timeline (não identificada) e AR-010.

**DV-027.** A configuração da Timeline não foi exportada. Quais colunas definem o título, o detalhe, a cor e o agrupamento dos cards, e qual é a escala de tempo? Bloqueia: AR-010 (reprodução da visualização).

**DV-031.** O que deve acontecer quando um campo numérico (percentuais, ticket) ou de data (fim da tarefa) receber texto? A planilha tem comportamentos não verificáveis nesses casos. Podemos bloquear a entrada? Bloqueia: tratamento de exceção de RN-009 e RN-032.

### 4.6 Desafios e aprendizados, Variáveis e integrações

**DV-022.** Nas linhas 15 a 21 de Desafios e aprendizados, a coluna Consequência tem uma fórmula que montaria "[ID da campanha] [algo] Ocorrido", mas a referência a "algo" foi perdida e a fórmula dá erro sempre que o Ocorrido é preenchido; nas linhas 2 a 14 a coluna é preenchida à mão. A coluna Consequência deve ser calculada? Se sim, o que era a referência perdida (fase, status, data)? Bloqueia: definição da coluna Consequência.

**DV-023.** Nas linhas 10 a 21 de Desafios e aprendizados, a lista de valores aceitos da coluna Status é a lista de fases, e não a de status. A coluna Status deve aceitar só "⚠️ Corrigir no próximo" e "✅ Corrigido" em todas as linhas? Bloqueia: RN-036.

**DV-028.** O ID da campanha segue o formato PRODUTO-ÍNDICE-ANO-MÊS, apresentado na planilha como sugestão. O formato é obrigatório (validado) ou livre? Bloqueia: validação do ID da campanha, usado no Cronograma e em Desafios.

**DV-030.** As variáveis Calendário Editorial, SheetID, FolderID e URL da planilha de tracking existem para alimentar scripts de automação (integração com calendário, pasta de arquivos e planilha auxiliar) que não estão no arquivo. Quais regras esses scripts aplicam sobre o Cronograma, o Plano de Comunicação e as demais abas (o que leem, o que escrevem, quando rodam)? Bloqueia: qualquer regra de negócio embutida nos scripts; RN-032 se algum script alterar status ou datas.

### 4.7 Rótulos e unidades (apresentação)

**DV-024.** Vários campos declaram unidade diferente do conteúdo (percentuais marcados como R$, contagem de leads marcada como R$, tamanho de base marcado como R$). Qual é a unidade e o formato de cada um desses campos? Bloqueia: apresentação e validação das entradas de RN-002, RN-008, RN-010 e das bases.

**DV-025.** Na aba de pagos, as linhas de receita do Google quente e do Google frio estão rotuladas como "Receita Meta Ads Público Quente/Frio". Confirmam que são as receitas do Google Ads? Bloqueia: apenas rótulos de RN-016/RN-017.

## 5. Regras implícitas

Regras de negócio que não estão em fórmula: listas de valores aceitos, sinalizações com critério próprio e colunas preenchidas à mão segundo um critério. Classificadas pelo mesmo teste.

### RN-034 Status de tarefa restrito a sete valores

* **Enunciado.** O status de uma tarefa do cronograma só pode ser um de: A fazer, Fazendo, Feito, Bloqueado, Cancelado, Milestone, Barra Macro.
* **Entrada.** Escolha manual por linha (CR, coluna A), a partir da lista da aba de menus.
* **Resultado e consumidor.** Valor de status usado por RN-032 (atraso) e RN-033 (faixa de fase).
* **Condições e exceções.** A lista está definida em dois lugares com o mesmo conteúdo (referência à aba de menus na linha 2, lista literal nas demais). Vazio é aceito; sem status não há avaliação de atraso.
* **Frequência.** Por registro.
* **Depende de.** Nenhuma.
* **Referência.** spec 5.3 (validação de dados A2 e A3:A30).

### RN-035 Fase restrita a sete valores

* **Enunciado.** A fase de uma tarefa ou de um desafio só pode ser uma de: Planejamento, Captação, Countdown, CPLs, Lista Vip, Vendas, Pós-Vendas.
* **Entrada.** Escolha manual por linha (CR coluna E; DA coluna B), a partir da lista da aba de menus.
* **Resultado e consumidor.** Usada no nome final da tarefa (AR-008) e na Timeline; classificação dos desafios.
* **Condições e exceções.** Em Desafios, a mesma lista está aplicada por engano também à coluna Status nas linhas 10 a 21 (DV-023).
* **Frequência.** Por registro.
* **Depende de.** Nenhuma.
* **Referência.** spec 5.3 (E2:E29) e 8.3 (B2:B9, A10:B21).

### RN-036 Status de desafio restrito a dois valores

* **Enunciado.** Um desafio registrado só pode estar em "⚠️ Corrigir no próximo" ou "✅ Corrigido".
* **Entrada.** Escolha manual por linha (DA, coluna A, linhas 2 a 9).
* **Resultado e consumidor.** Classificação lida pela equipe; nenhum cálculo a consome.
* **Condições e exceções.** Nas linhas 10 a 21 a validação aplicada é a de fases (DV-023). A sinalização "✅ Enviado" não pertence à lista (DV-020).
* **Frequência.** Por registro.
* **Depende de.** DV-020, DV-023.
* **Referência.** spec 8.3.

### RN-037 Campos bloqueados não são editados; campos marcados como editáveis são as entradas

* **Enunciado.** Nas abas do simulador, cada linha carrega um marcador: lápis para campo que a equipe preenche, cadeado para campo calculado ou trazido de outra aba, que não deve ser alterado à mão. O conjunto de campos com lápis define as entradas do simulador.
* **Entrada.** Marcadores da coluna B (abas 1, 2, 3) e cabeçalhos "✏️" das colunas de seleção (abas 2, 3, 4).
* **Resultado e consumidor.** Lista de entradas e de saídas por aba (mapas de campos da spec).
* **Condições e exceções.** É convenção visual: a planilha não impede edição de célula bloqueada. Em um sistema, vira permissão de edição.
* **Frequência.** Por campo (estático).
* **Depende de.** Nenhuma.
* **Referência.** spec "Convenções", 1.1, 2.1, 3.1, 4.1.

### RN-038 Seleção de cenário deve ser inteiro de 1 a 10 ou vazio

* **Enunciado.** O número do cenário escolhido para cada canal ou fonte em uma combinação é um inteiro de 1 a 10; vazio significa "canal sem receita nesta combinação".
* **Entrada.** Colunas de seleção das abas 2 e 3 (manuais).
* **Resultado e consumidor.** RN-016 e RN-021.
* **Condições e exceções.** A planilha não valida o campo: valores fora da lista produzem erro em cascata. Em um sistema, é validação de entrada.
* **Frequência.** Por registro.
* **Depende de.** Nenhuma.
* **Referência.** spec 2.2 "Receita por canal na combinação" (comportamento com valores inválidos).

### RN-039 Pelo menos uma caixa de nível de conversão marcada por bloco

* **Enunciado.** Para cada canal orgânico e cada fonte paga, a equipe precisa marcar um nível de conversão como premissa; sem isso os leads da combinação não podem ser determinados.
* **Entrada.** Caixas de seleção (colunas H das abas 2 e 3).
* **Resultado e consumidor.** RN-021.
* **Condições e exceções.** A planilha não impede zero ou várias marcações; várias marcações usam a primeira (DV-008).
* **Frequência.** Por bloco.
* **Depende de.** DV-008.
* **Referência.** spec 2.1 (coluna H), 2.2 e 3.2 (comportamento do INDEX/MATCH).

### RN-040 Taxonomia fixa de canais: seis canais orgânicos e quatro fontes pagas

* **Enunciado.** O simulador modela exatamente seis canais orgânicos (WhatsApp, Email, Instagram, Telegram, YouTube, Área de Membros), nessa ordem, e quatro fontes pagas (Meta Ads e Google Ads, cada uma com público quente e público frio). Metas, bases, cenários, seleções e resumos existem por canal ou fonte.
* **Entrada.** Estrutura das abas 1 a 4.
* **Resultado e consumidor.** Todas as RNs por canal ou fonte (RN-006, RN-007, RN-008, RN-011 a RN-029).
* **Condições e exceções.** A lista não é parametrizável na planilha; acrescentar um canal exige replicar blocos e fórmulas.
* **Frequência.** Estática.
* **Depende de.** Nenhuma.
* **Referência.** spec 1.1 (ordem dos canais), 2 e 3 (tabelas de blocos), 4.1.

### Regras implícitas classificadas como dúvida

Cada uma já consta da tabela resumo e da seção 4; aqui fica o vínculo com a origem implícita.

| ID | Origem implícita | Motivo de ser DV |
|---|---|---|
| DV-016 | Formatação condicional do atingimento (abas 2, 3, 4): verde a partir de 100%, vermelho até 70% | Limiar de 70% sem origem explicada. |
| DV-017 | Lista de valores "META PISO, META BOA, META SUPER" (aba 4, G6:O6) | Classificação manual sem regra associada; dois cenários sem rótulo. |
| DV-019 | Validação de Responsável (Cronograma C) | Fonte da lista inexistente ou divergente entre linhas. |
| DV-020 | Formatação condicional "✅ Conferido"/"✅ Enviado" (Cronograma E; Desafios A:B) | Textos que não constam das listas aceitas: contradição entre validação e sinalização. |
| DV-021 | Formatação condicional pelo marcador "◈" (Cronograma A) | Critério manual sem ocorrência no arquivo e sem explicação. |
| DV-023 | Validação da coluna Status de Desafios nas linhas 10 a 21 | Duas validações contraditórias na mesma coluna. |
| DV-028 | Formato do ID da campanha (Variáveis) | Apresentado como sugestão; obrigatoriedade não documentada. |
| DV-029 | Coluna Tags (Cronograma D) preenchida à mão | Critério de preenchimento não documentado; é o agrupamento da Timeline. |
| DV-024 | Coluna de unidade (abas 1 a 3) | Unidade declarada contradiz o conteúdo em vários campos. |
