# Exemplo de Uso Completo

## Cenário

Você acabou de exportar uma campanha de marketing para a semana de 01/03/2026 a 07/03/2026 e quer gerar o resumo para ClickUp.

## Passo 1: Preparar os arquivos

### Estrutura de pastas
```
projeto/
├── resumo_semanal.py          # Script principal
├── historico_template.json    # Template de histórico
├── historico.json             # Seu histórico (cópia preenchida do template)
└── dados_campanha_mar.xlsx    # Seu arquivo exportado do Google Sheets
```

### Preencher histórico.json

Copie `historico_template.json` e edite com dados reais:

```json
{
  "campanhas_anteriores": {
    "FZ-BF25": {
      "CPM": 18.40,
      "CTR": 1.56,
      "CPC": 1.20
    },
    "FZF2": {
      "CPM": 15.50,
      "CTR": 0.84,
      "CPC": 1.90
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

## Passo 2: Executar o script

### Comando simples (sem comparação histórica)
```bash
python resumo_semanal.py -f dados_campanha_mar.xlsx -s 01/03/2026 -e 07/03/2026
```

### Comando com histórico (recomendado)
```bash
python resumo_semanal.py -f dados_campanha_mar.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

### Comando com output customizado
```bash
python resumo_semanal.py -f dados_campanha_mar.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json -o ~/Desktop/resumo_marco.txt
```

## Passo 3: Resultado esperado

O script imprimirá algo como:

```
Resumão 01/03/2026 a 07/03/2026:

Geral (aba - Captação - Macro 2026)

Investimento: R$ 4.500,00
Leads: 185 (94 pag / 58 org / 33 sem track)
CPL pago R$ 47,87

Taxa de resposta na pesquisa: 32% (82 → 26 vieram sem e-mail - origem Whatsapp obrigado)

Connect Rate: 68%

CPM R$ 16,50 (FZ-BF25 foi R$ 18,40 e FZF2 foi R$ 15,50*)
CTR 1,45% (FZ-BF25 foi 1,56% e FZF2 foi 0,84%*)
CPC R$ 1,35 (FZ-BF25 foi R$ 1,20 e FZF2 foi R$ 1,90*)

Teste de LPs (aba - Captação - Teste LP)

Iniciamos no dia 01/03/2026 um teste de LP para o público frio:
LPA → https://exemplo.com/lp-a-frio
LPB → https://exemplo.com/lp-b-frio

LPB está performando melhor com taxa de conversão de 8,5%

Connect Rate da LPB está em 72%

Desempenho de Criativos (aba - Captação - Ads)

Público quente (hot)

Melhor estático: 01-fz-educacao-feb26-banner (CPL R$ 35,60)
Melhores vídeos: v02-fz-educacao-feb26-hook, v03-fz-educacao-feb26-testimonial (CPL R$ 38,90)

Público frio (cold)

Melhor estático: 02-fz-educacao-feb26-carousel (CPL R$ 52,30)
Melhor vídeo: v05-fz-educacao-feb26-awareness (CPL R$ 48,75)

Resultado da Pesquisa (aba Resultado-Pesquisa)

89% mulheres
67% acima de 36 anos (a média dos outros lançamentos foi de 62%)
91% casadas (a média dos outros lançamentos foi de 94%)
78% com ao menos superior completo (a média dos outros lançamentos foi de 72%)
68% com até 2 filhos (a média dos outros lançamentos foi de 65%)
84% católicas (a média dos outros lançamentos foi de 86%)
42% com renda acima de 5k (a média dos outros lançamentos foi de 36%)

============================================================
Resumo salvo em: resumo_07032026.txt
```

## Passo 4: Usar no ClickUp

1. Abra o ClickUp Chat
2. Copie o conteúdo de `resumo_07032026.txt`
3. Cole na mensagem

Pronto! O resumo está formatado e pronto para compartilhar com a equipe.

---

## Estrutura esperada do Excel

### Exemplo: Aba "Captação - Macro 2026"

| Dia | Investimento | Cliques | Impressões | CPM | CPC | CTR | LP View | Connect Rate | Tx Conv. | Leads pagos | Leads org | Leads s/track | ... |
|-----|--------------|---------|------------|-----|-----|-----|---------|--------------|----------|-------------|-----------|---------------|-----|
| 01/03/2026 | 600 | 85 | 42000 | 14,29 | 7,06 | 0,20 | 58 | 68% | 6,9% | 12 | 8 | 4 | ... |
| 02/03/2026 | 650 | 92 | 45000 | 14,44 | 7,07 | 0,20 | 63 | 68% | 7,1% | 13 | 8 | 5 | ... |
| 03/03/2026 | 620 | 88 | 43500 | 14,25 | 7,05 | 0,20 | 60 | 68% | 7,0% | 12 | 8 | 4 | ... |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

### Exemplo: Aba "Captação - Ads" (Hot)

| Nome do Ad | Invest | Impressões | Cliques | CTR | CPC | CPM | Leads | CPL |
|-----------|--------|-----------|---------|-----|-----|-----|-------|-----|
| 01-fz-educacao-feb26-banner | 450 | 25000 | 68 | 0,27% | 6,62 | 18,00 | 12 | 37,50 |
| 02-fz-educacao-feb26-carousel | 380 | 21000 | 56 | 0,27% | 6,79 | 18,10 | 9 | 42,22 |
| v02-fz-educacao-feb26-hook | 520 | 28000 | 75 | 0,27% | 6,93 | 18,57 | 13 | 40,00 |
| v03-fz-educacao-feb26-testimonial | 490 | 26500 | 71 | 0,27% | 6,90 | 18,49 | 12 | 40,83 |

### Exemplo: Aba "Resultado-Pesquisa"

```
Qual é seu sexo?          Contagem    %
Mulher                    156        89%
Homem                     19         11%

E a sua idade?            Contagem    %
18-25 anos               8          4,5%
26-35 anos               48         27,5%
36-45 anos               72         41,1%
46+                      47         26,9%

Qual é a sua religião?    Contagem    %
Católica                  147        84%
Evangélica                22         12,6%
Espírita                  4          2,3%
Outra                     2          1,1%

... (outras dimensões)
```

---

## Ajustes comuns

### Se os dados estão em outra unidade

Se o "Investimento" está em centavos no Excel (ex: 600000 em vez de 600), o script ainda funcionará mas os valores estarão diferentes. Verifique a coluna no Excel.

### Se faltar a aba de teste LP

O script automaticamente pula essa seção se não encontrar a aba "Captação - Teste LP".

### Se não tiver dados de pesquisa

O script também pula a seção "Resultado da Pesquisa" se não encontrar dados.

### Se os dados chegam até o dia 8/03

Use `-e 08/03/2026` para incluir aquele dia no cálculo.

---

## Troubleshooting

### Erro: "Arquivo não encontrado"
```
Erro: Arquivo não encontrado: dados_campanha_mar.xlsx
```
Solução: Verifique o caminho do arquivo e que o .xlsx existe no diretório.

### Erro: "Formato de data inválido"
```
Erro: Formato de data inválido: 03-01-2026. Use DD/MM/YYYY
```
Solução: Use DD/MM/YYYY (dia/mês/ano), não MM-DD-YYYY ou outro formato.

### Resumo vazio ou em branco
Possíveis causas:
1. Nomes das abas não batem (verifique espaços e maiúsculas)
2. Dados estão em linhas/colunas diferentes esperadas
3. Período de datas não tem dados

Verifique o arquivo .xlsx manualmente.

### Número formatado errado
Se ver "R$ 6000" em vez de "R$ 6.000,00":
- Verifique se a coluna de investimento tem dados numéricos (não texto)
- Excel às vezes salva números como texto

---

## Dicas para manter dados organizados

1. **Nomes dos Ads**: Use nomenclatura consistente
   - Estáticos: `01-campanha-publico-mes-descricao`
   - Vídeos: `v01-campanha-publico-mes-descricao`
   - Carrosséis: `c01-campanha-publico-mes-descricao`

2. **Datas**: Sempre DD/MM/YYYY

3. **Números**: Sem símbolos de moeda nas colunas (o script formata)

4. **Histórico**: Atualizar ao final de cada campanha

5. **Backup**: Manter cópia do histórico em local seguro

---

## Próximos passos

1. Copiar `historico_template.json` para `historico.json`
2. Preencher com dados de campanhas anteriores
3. Executar script regularmente no final de cada semana
4. Manter histórico atualizado

Qualquer dúvida, consulte o README.md ou GUIA_RAPIDO.md!
