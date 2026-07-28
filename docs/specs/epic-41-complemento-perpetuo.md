# COMPLEMENTO DA SPEC — Botão 3: Dashboard de Funil Perpétuo

> **Fonte:** complemento fornecido pelo usuário em 2026-07-28, à especificação técnica
> "Gerador de Resumão e Comparativo Loyola" (jul/2026). Resolve a pendência da §12.5
> da spec principal ("Perpétuo — requer especificação própria").
>
> **Escopo de validação:** rodado sobre dado real de 3 funis — BBE-A1 (Netão), PPS-A1
> (Dr. Paulo Pacheco) e FZ-A1 (Fernanda Zapparolli), período jun–jul/2026. Valores de
> conferência na §C.10.
>
> ⚠️ **Este arquivo é a fonte literal da spec.** As decisões de implementação que divergem
> dela estão registradas em `docs/stories/epics/epic-41-resumao-comparativo-generator.md`
> e nas stories 41.7–41.9 — ver especialmente a nota de §C.3.4 sobre a taxa de reembolso.

---

## C.1 Por que é um botão separado

Perpétuo **não é um lançamento com janela**. As diferenças são estruturais, não de parâmetro:

| Dimensão | Lançamento (botões 1 e 2) | Perpétuo (botão 3) |
|---|---|---|
| Recorte | período do lançamento, com lote | janela móvel contínua |
| Etapas | captação → carrinho → downsell | não existe |
| Produto | captação vs order bump | oferta única (order bump pode existir) |
| KPI central | ROAS por origem, CPV, Faixa | **CAC, margem de contribuição, ROAS** |
| Comparação | lançamento A vs B | **período total vs últimos 7 dias** |
| Qualificação | pesquisa com Faixa A/B/C/D | não se aplica |
| Segmentação | quente/frio + criativo | quente/frio + **formato** + público + criativo |

**Não reaproveitar** as seções 2 (ROAS por origem), 4 (Qualificação) e 5 (Renda) do Resumão.

**Reaproveitar integralmente:** gross-up de imposto (§2.3c), reconciliação campaign×ad (§2.3b),
classificação de origem (§2.6), hot/cold por substring (§2.7), extração de ad_name do `utm_term`
(§2.7), guardas de qualidade (§8) e a regra de texto narrativo (§6).

---

## C.2 Contrato de entrada adicional

Reusa `v_campanhas`, `v_ads` e `v_vendas` da spec principal. **Não usa `v_pesquisa`.**

Nova tabela de configuração:

### `v_funil_perpetuo_config`

| coluna | tipo | semântica |
|---|---|---|
| `funil` | STRING | sigla, ex: `bbe-a1`, `pps-a1`, `fz-a1` |
| `expert` | STRING | sigla do expert |
| `ad_account_id` | STRING | conta Meta do funil |
| `prefixo_campanha` | STRING | substring que identifica as campanhas, ex: `bbe-a1-jul-26` ou `FZA1` |
| `produto` | STRING | nome do produto principal na plataforma de venda |
| `produtos_order_bump` | ARRAY\<STRING\> | opcional; vazio se o funil não tem OB |
| `imposto_pct` | DECIMAL | default `0.1215` |
| `taxa_plataforma_pct` | DECIMAL | default `0.0499` (Kiwify) |
| `taxa_imposto_pct` | DECIMAL | default `0.11` |
| `taxa_outros_pct` | DECIMAL | default `0.01` |
| `tem_split_formato` | BOOLEAN | se os nomes de campanha trazem `videos`/`estaticos` |
| `origens_pagas` | ARRAY\<STRING\> | valores de `utm_source` que contam como pago |
| `inicio_trafego` | DATE | primeira veiculação |
| `validado` | BOOLEAN | conferido manualmente contra o painel |

> ⚠️ **`prefixo_campanha` roda por ciclo.** O BBE usa `bbe-a1-<mes>-<ano>`. Confirmar o prefixo
> vigente a cada execução — não assumir que o do mês passado continua valendo.

---

## C.3 Regras específicas do perpétuo

### C.3.1 Venda paga do funil

```
venda_paga = utm_source ∈ config.origens_pagas
             E status = aprovado
             E utm_campaign (c=) ∈ campanhas do funil no período
```

Se um `c=` de venda não bater com nenhuma campanha coletada, **investigar antes de seguir** —
é sinal de coleta incompleta.

Vendas com origem fora de `origens_pagas` (orgânico, youtube, manychat…) **ficam fora de
CAC, ROAS e margem**. Reportar à parte, como contexto.

### C.3.2 Unidade contada

```
vendas = e-mails distintos com venda paga aprovada no período
transações = todas as linhas aprovadas (inclui order bump)
```

Diferente do lançamento, aqui **não há dedupe por "produto de captação"** — a oferta é única.
Se o funil tiver order bump, ele conta no faturamento mas não cria comprador novo.

### C.3.3 Valor da venda

Mesma regra da spec principal (§2.4): usar o campo de **preço**, nunca "valor da oferta".

⚠️ **O perpétuo tem parcelamento**, então o preço varia legitimamente por transação
(ex: 347 · 365,27 · 377,79 · 390,60 · 430,65 para uma oferta de R$ 347). Isso **não é**
contaminação — a checagem de "poucos valores distintos" da spec principal **não se aplica aqui**.
O que vale é: os valores devem ser ≥ preço base da oferta.

### C.3.4 Margem de contribuição — memorial obrigatório

Exibir **linha a linha**, nunca só o resultado:

```
Faturamento bruto                          FAT
− Taxa de plataforma (4,99%)              −FAT × 0,0499
− Imposto (11%)                           −FAT × 0,11
− Outros (1%)                             −FAT × 0,01
= Receita líquida (83,01% do bruto)        FAT × 0,8301
− Investimento (com gross-up)             −INV
= MARGEM DE CONTRIBUIÇÃO                   FAT × 0,8301 − INV
```

**A coluna "líquido" da plataforma NÃO substitui esse memorial.** Padrão da casa.

> **Nota de implementação (2026-07-28, @sm + usuário):** os 83,01% desta seção correspondem ao
> ramo `reembolsoReal = true` já implementado na Story 29.7/29.8 — planilha **com** coluna de
> status, em que o reembolso é medido e já saiu do bruto. Para planilha **sem** coluna de status,
> o código aplica adicionalmente 4% de reembolso estimado (líquido 79,01%), e Hotmart usa 10% de
> marketplace no lugar de 4,99%. A implementação mantém os dois ramos e expõe as taxas na config;
> os 3 funis da §C.10 caem no ramo de 83,01%.

### C.3.5 Ponto de equilíbrio

Métrica de decisão que o dashboard deve exibir:

```
cac_breakeven = ticket_medio × (1 − taxa_plataforma − taxa_imposto − taxa_outros)
```

Se `CAC > cac_breakeven`, o funil opera no prejuízo mesmo com ROAS > 1.

### C.3.6 Segmentação micro

Ordem obrigatória:

1. **Quente vs Frio** — substring `hot`/`cold` no nome da campanha
2. **Vídeos vs Estáticos** — substring `video`/`estatic`. **Só se `config.tem_split_formato`**
3. **Campanhas individuais** — cruzamento público × formato
4. **Públicos** — nome do conjunto, somado entre campanhas (o mesmo conjunto existe em várias)
5. **Criativos** — nome do anúncio, somado entre conjuntos e campanhas

Em CBO o mesmo criativo existe em todos os conjuntos gastando centavos — é esperado ter
dezenas de instâncias para poucos criativos. **Sempre agregar por nome**, nunca por ID.

⚠️ **Normalizar acentos no matching.** A planilha traz `o-netão-te-ensina`, o Gerenciador pode
vir sem acento.

### C.3.7 Tendência

```
SE dias_no_recorte >= 14:
    comparar período total vs últimos 7 dias em: investimento, vendas, faturamento,
    ticket, CAC, ROAS
SENÃO:
    exibir "Tendência não aplicável — funil com N dias" + vendas por dia
```

Funil novo fica dias em "Em aprendizado" com entrega abaixo do orçamento — **não concluir
nada forte nesse estágio**.

### C.3.8 Amostra pequena

```
SE vendas < 20:
    marcar leituras por criativo e por público como DIRECIONAIS
    NÃO recomendar desligar criativo com CAC alto
```

---

## C.4 Contrato de saída — Dashboard Perpétuo

### Cabeçalho
Nome do funil · período · nº de dias · produto.

### KPIs (8 cards)
Investimento (com imposto, mostrando o bruto no subtítulo) · Vendas · Faturamento bruto ·
Ticket médio · **CAC** · **ROAS** · **Margem de contribuição** (card verde se ≥0, vermelho se <0) ·
CTR/CPC/CPM.

### Memorial da margem
Tabela de 7 linhas conforme §C.3.4, com os deduções em vermelho.

### Fontes
Expert · conta de anúncios · planilha · impressões · cliques · data/hora da coleta.

### Micro
Uma tabela por nível (público → formato → campanha → conjunto → criativo), todas com as mesmas
colunas: Investimento · % do investimento · Vendas · Faturamento · CAC · ROAS · Margem.

Margem em verde quando positiva, vermelha quando negativa.

### Tendência
Tabela total vs 7 dias com delta percentual. **CAC tem sinal invertido** — queda é melhora.

### Leituras
3 a 6 bullets **gerados do dado** (ver §C.5).

### Notas de dado
Gross-up aplicado · memorial usado · divergência pixel × planilha · vendas orgânicas fora do
cálculo · limitações do funil específico (sem split de formato, sem ad_name no term, amostra
pequena).

---

## C.5 Leituras — geração dinâmica

Aplicar a regra da §6 da spec principal. Nenhum verbo ou número literal.

```
# 1. Resultado geral
verbo = (margem >= 0) ? "cobre" : "não cobre"
"ROAS de {roas}. O faturamento bruto {verbo} o investimento. Depois das taxas sobra
 margem de {margem} ({pct_margem} do bruto)."

# 2. Público — derivar qual é melhor, não assumir
melhor, pior = ordenar([quente, frio], por=roas, desc)
"{melhor.nome} performa melhor: ROAS {melhor.roas} contra {pior.roas}, com CAC
 {melhor.cac} vs {pior.cac}. O {pior.nome} leva {pior.pct_inv} do investimento."

# 3. Formato — só se houver split; declarar empate quando a diferença for pequena
SE |videos.roas − estaticos.roas| < 0.15:
    "Vídeos e estáticos praticamente empatam — o formato não é a alavanca aqui."
SENÃO:
    melhor = argmax(roas); "{melhor} entrega ROAS melhor ({a} vs {b})."

# 4. Campanhas no prejuízo
perdedoras = campanhas ONDE roas < 1 E investimento > 0
SE perdedoras não vazio:
    "{n} campanha(s) com ROAS abaixo de 1 consumindo {soma} ({pct} do investimento): {lista}"

# 5. Ponto de equilíbrio — sempre exibir
"Com ticket de {ticket} e 83,01% de receita líquida, o CAC precisa ficar abaixo de
 {cac_breakeven}. Hoje está em {cac}."

# 6. Orgânico
SE vendas_organicas > 0:
    "{n} venda(s) fora do tráfego pago somando {valor} — ficam fora de CAC/ROAS/margem."
```

---

## C.6 Guardas específicas

Além das 9 invariantes da §8.1:

```
P1  Σ spend dos anúncios == Σ spend das campanhas do funil     tolerância R$ 0,01
    (se sobrar cauda não capturada, declarar o valor no dashboard)
P2  todo c= de venda paga ∈ campanhas do funil no período      exato
P3  Σ investimento dos segmentos (quente+frio) == total        tolerância R$ 0,01
P4  Σ investimento (vídeos+estáticos) == total                 só se tem_split_formato
P5  receita_liquida == FAT × 0,8301                            tolerância R$ 0,01
P6  margem == receita_liquida − INV                            tolerância R$ 0,01

W-P1  divergência pixel × planilha — sempre reportar, nunca bloquear
W-P2  vendas < 20 → marcar leituras micro como direcionais
W-P3  dias < 14 → tendência indisponível
W-P4  utm_term sem Adset|Ad em >50% das vendas → criativo/público indisponível
W-P5  campanha sem venda atribuída mas com spend > 0 → sinalizar
```

---

## C.7 Fuso horário — fonte clássica de erro

A planilha registra a data em **UTC** (sufixo `Z`). O Gerenciador reporta no fuso da conta
(**America/Sao_Paulo, UTC−3**).

```
converter created_at para America/Sao_Paulo ANTES de cortar o período
```

Sem isso, venda de fim de noite cai no dia errado — `21/07 01:18Z` é venda do dia **20/07** no
Brasil.

**Usar dias completos.** Se hoje é dia 28, o período fecha em 27. Vendas de hoje ficam fora do
corte (citar só como contexto).

---

## C.8 Contrato do botão

```
POST /dashboards/perpetuo
{
  "funil":       "bbe-a1",
  "data_inicio": "2026-07-01",    // opcional — default: mês corrente até ontem
  "data_fim":    "2026-07-27",    // opcional — default: ontem
  "formato":     "html"
}

200 → { "html": "...", "metricas": {...}, "alertas": [...] }
422 → { "erro":"INVARIANTE_VIOLADO", "codigo":"P2",
        "detalhe":"3 vendas com c= fora das campanhas do funil",
        "acao":"Verificar se a coleta do Meta cobriu todas as campanhas do prefixo" }
```

Se o funil tiver `validado = falso`, bloquear como na §12.2.

---

## C.9 Variações observadas entre funis

Três funis reais, três comportamentos diferentes. **Tratar cada um por configuração, nunca
por inferência.**

| | BBE-A1 | PPS-A1 | FZ-A1 |
|---|---|---|---|
| Padrão de nome | `bbe-a1-jul-26--venda--perpetuo--hot_cbo_videos` | `pps-a1-jul-26--venda--perpetuo--hot--videos` | `[FZA1][FB/IG][LEADS][2025.08.25][HOT][ALL-IN-ONE]` |
| Separador | `_` no segmento final | `--` uniforme | colchetes, formato de 2025 |
| Split de formato | ✅ + campanha `vencedores` | ✅ | ❌ todos são vídeos |
| `utm_term` com Adset\|Ad | ✅ 39/42 | ✅ 253/255 | ❌ 34/1468 |
| Order bump | não | ✅ produto sem nome, R$ 47 | não |
| Origem paga | `meta` | `meta`, `fb` | `meta` |
| Formato do export Meta | ponto decimal (inglês) | ponto decimal (inglês) | via MCP |

**Consequências que o código precisa suportar:**

- O parser de nome de campanha **não pode assumir separador fixo** — usar substring
- `tem_split_formato = falso` remove a seção inteira, não a preenche com zero
- Sem Adset|Ad no `utm_term`, as seções de público e criativo **não são renderizadas**
- Uma campanha pode existir fora do padrão de formato (ex: `vencedores`) — tratar como
  categoria própria, não forçar em vídeos ou estáticos
- Export do Gerenciador vem em **formato inglês** (`119.54`), export do sistema pode vir em
  BR (`119,54`) — detectar antes de parsear

---

## C.10 Valores de conferência

Se a implementação der diferente, tem bug.

### BBE-A1 · 17/07 a 27/07/2026 (11 dias)
```
investimento bruto      R$  3.697,76      com imposto  R$  4.209,17
vendas (meta)                     39      transações            39
faturamento bruto       R$ 14.495,61
ticket médio            R$    371,68      CAC          R$    107,93
ROAS                            3,44      margem       R$  7.823,63  (54,0%)
🔥 quente  inv R$ 3.064,34 · 36 vendas · CAC R$  85,12 · ROAS 4,36
❄️ frio    inv R$ 1.144,84 ·  3 vendas · CAC R$ 381,61 · ROAS 0,98
vendas orgânicas (youtube): 3 · R$ 1.059,27 — fora do cálculo
pixel 34 vs planilha 39
```

### PPS-A1 · 09/07 a 27/07/2026 (19 dias)
```
investimento bruto      R$  7.831,38      com imposto  R$  8.914,49
vendas (meta+fb)                 246      transações           251
faturamento bruto       R$ 17.106,96
ticket médio            R$     69,54      CAC          R$     36,24
ROAS                            1,92      margem       R$  5.286,00  (30,9%)
🔥 quente  inv R$ 2.623,23 ·  78 vendas · CAC R$ 33,63 · ROAS 2,02
❄️ frio    inv R$ 6.291,26 · 164 vendas · CAC R$ 38,36 · ROAS 1,82
vídeos     inv R$ 4.348,86 · 120 vendas · ROAS 1,90
estáticos  inv R$ 4.565,63 · 122 vendas · ROAS 1,86
reconciliação campanha × anúncio: diferença R$ 0,00 em todas
pixel 186 vs planilha 251
```

### FZ-A1 · 01/06 a 27/07/2026 (57 dias)
```
investimento bruto      R$ 10.710,65      com imposto  R$ 12.191,97
vendas (meta)                    209      transações           209
faturamento bruto       R$ 12.331,00
ticket médio            R$     59,00      CAC          R$     58,33
ROAS                            1,01      margem       R$ -1.956,01  (-15,9%)
🔥 quente  inv R$ 4.546,68 ·  77 vendas · CAC R$ 59,05 · ROAS 1,00
❄️ frio    inv R$ 7.645,29 · 128 vendas · CAC R$ 59,73 · ROAS 0,99
CAC de equilíbrio: R$ 48,98 — está R$ 9,35 acima
sem split de formato · criativo/público indisponíveis
```

---

## C.11 Checklist

```
[ ] v_funil_perpetuo_config implementada
[ ] prefixo_campanha confirmado para o ciclo vigente (roda por mês)
[ ] Conversão UTC → America/Sao_Paulo antes do corte de período
[ ] Dias completos (fecha em ontem)
[ ] Gross-up de imposto no investimento
[ ] Reconciliação campaign × ad level
[ ] Vendas orgânicas fora de CAC/ROAS/margem, reportadas à parte
[ ] Memorial da margem linha a linha, nunca só o resultado
[ ] CAC de equilíbrio calculado e exibido
[ ] Agregação de criativo/público por NOME, com acentos normalizados
[ ] tem_split_formato respeitado (remove a seção, não zera)
[ ] Seções de criativo/público omitidas quando o utm_term não traz Adset|Ad
[ ] Tendência só com ≥14 dias
[ ] Amostra <20 vendas marcada como direcional
[ ] Invariantes P1–P6 antes do render
[ ] Zero número ou adjetivo literal nas leituras
[ ] Os 3 funis da §C.10 batendo casa a casa
```

---

*Complemento validado sobre BBE-A1, PPS-A1 e FZ-A1 (jun–jul/2026). Resolve a pendência da
§12.5 da especificação principal.*
