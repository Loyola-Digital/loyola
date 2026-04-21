# Gerador de Resumo Semanal - Campanhas de Marketing

Script Python para gerar resumos semanais padronizados de campanhas de marketing Facebook/Meta a partir de dados exportados de Google Sheets em formato .xlsx.

## Características

- Lê dados de múltiplas abas de um arquivo Excel
- Processa métricas diárias de campanhas (investimento, leads, CPM, CPC, CTR, etc.)
- Analisa testes de landing pages (A/B tests)
- Identifica criativos (estáticos, vídeos, carrosséis) com melhor desempenho
- Extrai dados demográficos de pesquisas
- Compara com histórico de campanhas anteriores
- Formata saída em português brasileiro para ClickUp Chat
- Gera arquivo .txt com o resumo formatado

## Instalação

### Pré-requisitos

- Python 3.7+
- openpyxl para leitura de arquivos Excel

### Setup

```bash
pip install openpyxl --break-system-packages
```

## Uso

### Comando básico

```bash
python resumo_semanal.py -f dados_campanha.xlsx -s 01/03/2026 -e 07/03/2026
```

### Com histórico de campanhas anteriores

```bash
python resumo_semanal.py -f dados_campanha.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

### Com caminho de saída customizado

```bash
python resumo_semanal.py -f dados_campanha.xlsx -s 01/03/2026 -e 07/03/2026 -o /path/to/resumo_saida.txt
```

### Argumentos disponíveis

| Argumento | Curto | Tipo | Obrigatório | Descrição |
|-----------|-------|------|-------------|-----------|
| `--file` | `-f` | string | Sim | Caminho do arquivo .xlsx exportado |
| `--start` | `-s` | DD/MM/YYYY | Sim | Data de início do período analisado |
| `--end` | `-e` | DD/MM/YYYY | Sim | Data de término do período analisado |
| `--historico` | - | string | Não | Caminho do arquivo JSON com dados históricos |
| `--output` | `-o` | string | Não | Caminho do arquivo de saída (padrão: `resumo_DDMMYYYY.txt`) |

## Estrutura do arquivo Excel

O script espera as seguintes abas no arquivo .xlsx:

### 1. "Captação - Macro 2026" (Métricas diárias)

| Coluna | Rótulo | Descrição |
|--------|--------|-----------|
| A | Dia | Data (DD/MM/YYYY) |
| B | Investimento | Valor investido em R$ |
| C | Cliques | Total de cliques |
| D | Impressões | Total de impressões |
| E | CPM | Custo por mil impressões |
| F | CPC | Custo por clique |
| G | CTR | Taxa de clique (%) |
| H | LP View | Visualizações de landing page |
| I | Connect Rate | Taxa de conexão (%) |
| J | Tx Conv. | Taxa de conversão (%) |
| K | Leads pagos | Leads pagos/qualificados |
| L | Leads org | Leads orgânicos |
| M | Leads s/track | Leads sem rastreamento |
| N | CPL Pg | Custo por lead pago |
| O | CPL G | Custo por lead geral |
| P | Pesquisa | Pesquisas respondidas |
| Q | Pesquisa sem e-mail | Pesquisas via WhatsApp sem e-mail |
| R | Tx Resposta | Taxa de resposta (%) |
| S | Grupo WPP | Grupos de WhatsApp criados |
| T | Tx Grupo | Taxa de grupo (%) |

### 2. "Captação - Teste LP" (A/B tests de landing pages)

Estrutura esperada:
- Seção LPA com URL e dados de performance
- Seção LPB com URL e dados de performance
- Colunas: Dia, Investimento, Cliques, Impressões, CPM, CPC, CTR, LP View, Connect Rate, Tx Conv., Leads, CPL, Pesquisa, Pesquisa sem e-mail, Tx Pesquisa

### 3. "Captação - Ads" (Performance de criativos - Público quente/hot)

| Coluna | Rótulo |
|--------|--------|
| A | Nome do Ad |
| B | Invest-Imposto |
| C | Impressões |
| D | Cliques |
| E | CTR |
| F | CPC |
| G | CPM |
| H | Leads |
| I | CPL |

Nomenclatura dos ads:
- Estáticos: começam com número (ex: "01-fz-l1-fev26-...")
- Vídeos: começam com "v" (ex: "v02-fz-l1-fev26-...")
- Carrosséis: começam com "c" (ex: "c05-fz-l1-fev26-...")

### 4. "Ads-Cold" (Performance de criativos - Público frio)

Mesma estrutura da aba "Captação - Ads", mas para público frio.

### 5. "Resultado-Pesquisa" (Dados demográficos)

Tabelas dinâmicas com as seguintes categorias:
- Sexo (Homem/Mulher)
- Idade (faixas etárias, especialmente "acima de 36 anos")
- Filhos (quantidades: 1, 2, 3, 4, 5+)
- Religião (Católica, Evangélica, etc.)
- Estado civil (Casado/Divorciado/Solteiro)
- Escolaridade (níveis, especialmente "superior completo")
- Renda familiar (faixas de renda, especialmente "acima de 5k")

## Arquivo de histórico (JSON)

O arquivo `historico.json` permite comparar métricas com campanhas anteriores.

### Estrutura

```json
{
  "campanhas_anteriores": {
    "NOME_CAMPANHA": {
      "CPM": valor_float,
      "CTR": valor_float,
      "CPC": valor_float
    }
  },
  "medias_pesquisa": {
    "acima_36_anos": valor_percentual,
    "casadas": valor_percentual,
    "superior_completo": valor_percentual,
    "ate_2_filhos": valor_percentual,
    "catolicas": valor_percentual,
    "renda_acima_5k": valor_percentual
  }
}
```

### Exemplo

```json
{
  "campanhas_anteriores": {
    "FZ-BF25": {
      "CPM": 18.4,
      "CTR": 1.56,
      "CPC": 1.2
    },
    "FZF2": {
      "CPM": 15.5,
      "CTR": 0.84,
      "CPC": 1.9
    }
  },
  "medias_pesquisa": {
    "acima_36_anos": 62,
    "casadas": 94,
    "superior_completo": 72,
    "ate_2_filhos": 65,
    "catolicas": 86,
    "renda_acima_5k": 36
  }
}
```

## Formato de saída

O resumo gerado segue este padrão:

```
Resumão DD/MM/YYYY a DD/MM/YYYY:

Geral (aba - Captação - Macro 2026)

Investimento: R$ X.XXX,XX
Leads: XXX (XX pag / XX org / XX sem track)
CPL pago R$ XX,XX

Taxa de resposta na pesquisa: X% (XXX → XX vieram sem e-mail - origem Whatsapp obrigado)

Connect Rate: X%

CPM R$ XX,XX (FZ-BF25 foi R$ XX,XX e FZF2 foi R$ XX,XX*)
CTR X% (FZ-BF25 foi X% e FZF2 foi X%*)
CPC R$ X,XX (FZ-BF25 foi R$ X,XX e FZF2 foi R$ X,XX*)

Teste de LPs (aba - Captação - Teste LP)

Iniciamos no dia XX/XX/XXXX um teste de LP para o público frio:
LPA → https://...
LPB → https://...

[Análise de qual LP performou melhor]

Connect Rate da LPB está em X%

Desempenho de Criativos (aba - Captação - Ads)

Público quente (hot)

Melhor estático: 01-ad-name (CPL R$ XX,XX)
Melhores vídeos: v02-ad-name, v03-ad-name (CPL R$ XX,XX)

Público frio (cold)

Melhor estático: 02-ad-name (CPL R$ XX,XX)
Melhor vídeo: v05-ad-name (CPL R$ XX,XX)

Resultado da Pesquisa (aba Resultado-Pesquisa)

XX% mulheres
XX% acima de 36 anos (a média dos outros lançamentos foi de XX%)
XX% casadas (a média dos outros lançamentos foi de XX%)
XX% com ao menos superior completo (a média dos outros lançamentos foi de XX%)
XX% com até 2 filhos (a média dos outros lançamentos foi de XX%)
XX% católicas (a média dos outros lançamentos foi de XX%)
XX% com renda acima de 5k (a média dos outros lançamentos foi de XX%)
```

## Tratamento de erros

O script é robusto a:
- Células vazias
- Formatos de número variados (com ou sem R$, vírgula vs ponto decimal)
- Abas faltando
- Datas em formatos diferentes
- Valores não numéricos

## Saída

O script produz:
1. **Stdout**: Imprime o resumo completo no terminal
2. **Arquivo .txt**: Salva o resumo em arquivo (padrão: `resumo_DDMMYYYY.txt`)

## Formatação de valores

O script segue padrão brasileiro:
- **Moeda**: R$ com vírgula para decimal e ponto para milhares (ex: R$ 1.234,56)
- **Percentual**: Número com % (ex: 45% ou 45,5%)
- **Datas**: DD/MM/YYYY

## Limitações conhecidas

- A aba "Captação - Ads" com filtro de público (hot/cold) pode mostrar apenas um estado quando exportada. Recomenda-se ter abas separadas "Captação - Ads" e "Ads-Cold"
- O script não identifica automaticamente o intervalo de dados - é necessário especificar datas de início e fim
- Surveys respondidas sem e-mail são assumidas como origem WhatsApp

## Troubleshooting

### Erro: "Aba 'X' não encontrada"
Verifique se os nomes das abas no arquivo Excel batem exatamente com os esperados:
- "Captação - Macro 2026"
- "Captação - Teste LP"
- "Captação - Ads"
- "Ads-Cold"
- "Resultado-Pesquisa"

### Dados em branco no resumo
Verifique se os dados estão nas colunas esperadas. Use o arquivo de saída para debug.

### Valores incorretos
Certifique-se de que:
- Datas estão no formato DD/MM/YYYY ou como valores de data nativos do Excel
- Números usam vírgula como separador decimal
- Não há espaços em branco ou caracteres especiais nos dados numéricos

## Licença

Desenvolvido para uso interno da agência de marketing.
