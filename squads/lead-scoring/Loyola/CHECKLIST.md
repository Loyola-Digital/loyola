# Checklist - Antes de usar o script

Use este checklist antes de executar o script pela primeira vez e antes de cada uso.

## Pré-requisitos de instalação ✓

- [ ] Python 3.7+ instalado (execute: `python3 --version`)
- [ ] openpyxl instalado (execute: `pip install openpyxl --break-system-packages`)
- [ ] Validação passou (execute: `python3 test_instalacao.py`)

## Preparação do arquivo Excel

- [ ] Arquivo .xlsx exportado do Google Sheets
- [ ] Aba **"Captação - Macro 2026"** existe
  - [ ] Coluna A: Dia (data em DD/MM/YYYY)
  - [ ] Coluna B: Investimento
  - [ ] Coluna C: Cliques
  - [ ] Coluna D: Impressões
  - [ ] Coluna E-O: CPM, CPC, CTR, LP View, Connect Rate, Tx Conv., Leads, CPL
  - [ ] Coluna P-T: Pesquisa, Pesquisa sem e-mail, Tx Resposta, Grupo WPP, Tx Grupo
- [ ] Aba **"Captação - Teste LP"** existe (se aplica)
  - [ ] Seção LPA com URL e dados
  - [ ] Seção LPB com URL e dados
- [ ] Aba **"Captação - Ads"** existe (público hot)
  - [ ] Coluna A: Nome do Ad
  - [ ] Coluna B-I: Invest, Impressões, Cliques, CTR, CPC, CPM, Leads, CPL
- [ ] Aba **"Ads-Cold"** existe (público frio)
  - [ ] Mesma estrutura da aba "Captação - Ads"
- [ ] Aba **"Resultado-Pesquisa"** existe
  - [ ] Tabelas dinâmicas com: Sexo, Idade, Filhos, Religião, Estado civil, Escolaridade, Renda

## Dados esperados

### Na aba "Captação - Macro 2026"

- [ ] Datas estão em formato DD/MM/YYYY ou como datas nativas do Excel
- [ ] Valores numéricos (não texto): Investimento, Cliques, Impressões, etc.
- [ ] Se usar vírgula decimal: certifique-se que Excel reconhece como número
- [ ] Mínimo 1 linha de dados no período especificado

### Na aba "Captação - Teste LP" (opcional)

- [ ] URLs das LPs estão preenchidas
- [ ] Dados de performance existem para o período
- [ ] Se não aplicável: deixe vazio ou remova a aba

### Na aba "Captação - Ads" (hot)

- [ ] Nomes de ads formatos:
  - [ ] Estáticos: começam com número (01-, 02-) ou 01-nome-...
  - [ ] Vídeos: começam com "v" (v01-, v02-) ou v01-nome-...
  - [ ] Carrosséis: começam com "c" (c01-, c02-) ou c01-nome-...
- [ ] Cada ad tem investimento > 0
- [ ] Cada ad tem leads > 0
- [ ] CPL é calculado automaticamente ou preenchido

### Na aba "Ads-Cold" (cold)

- [ ] Mesma estrutura que "Captação - Ads"
- [ ] Se não aplicável: deixe vazio ou remova a aba

### Na aba "Resultado-Pesquisa"

- [ ] Tabelas dinâmicas com contagens e percentuais
- [ ] Verificar especialmente:
  - [ ] % Mulheres
  - [ ] % Acima 36 anos
  - [ ] % Casadas
  - [ ] % Superior completo
  - [ ] % Até 2 filhos
  - [ ] % Católicas
  - [ ] % Renda acima 5k

## Preparação do histórico (opcional)

- [ ] Se quer comparação histórica:
  - [ ] Copiar `historico_template.json` → `historico.json`
  - [ ] Preencher com dados de campanhas anteriores:
    - [ ] `campanhas_anteriores.FZ-BF25.CPM`
    - [ ] `campanhas_anteriores.FZ-BF25.CTR`
    - [ ] `campanhas_anteriores.FZ-BF25.CPC`
    - [ ] `campanhas_anteriores.FZF2.CPM`
    - [ ] `campanhas_anteriores.FZF2.CTR`
    - [ ] `campanhas_anteriores.FZF2.CPC`
  - [ ] Preencher médias de pesquisa:
    - [ ] `medias_pesquisa.acima_36_anos`
    - [ ] `medias_pesquisa.casadas`
    - [ ] `medias_pesquisa.superior_completo`
    - [ ] `medias_pesquisa.ate_2_filhos`
    - [ ] `medias_pesquisa.catolicas`
    - [ ] `medias_pesquisa.renda_acima_5k`

## Antes de executar

- [ ] Arquivo .xlsx está no caminho correto
- [ ] Sabe o caminho completo do arquivo (ex: `/home/user/dados.xlsx`)
- [ ] Sabe as datas de início e fim (formato DD/MM/YYYY)
  - [ ] Data início: __/__/____
  - [ ] Data fim: __/__/____
- [ ] Se usando histórico, arquivo `historico.json` existe e é válido
- [ ] Nenhum arquivo Excel aberto (pode causar problemas)

## Comando para executar

### Básico (sem histórico)
```bash
python3 resumo_semanal.py -f /caminho/do/arquivo.xlsx -s 01/03/2026 -e 07/03/2026
```

### Com histórico (recomendado)
```bash
python3 resumo_semanal.py -f /caminho/do/arquivo.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

- [ ] Comando digitado corretamente
- [ ] Caminhos entre aspas se tiverem espaços
- [ ] Datas em DD/MM/YYYY

## Verificação de saída

- [ ] ✅ Script executa sem erros (0 segundos-2 segundos típico)
- [ ] ✅ Resumo imprime na tela (português)
- [ ] ✅ Arquivo `resumo_DDMMYYYY.txt` criado no diretório
- [ ] ✅ Conteúdo tem:
  - [ ] "Resumão DD/MM/YYYY a DD/MM/YYYY:"
  - [ ] "Geral (aba - Captação - Macro 2026)"
  - [ ] Seção de investimento e leads
  - [ ] Seção de CPM, CTR, CPC
  - [ ] Seção de criativos (se houver dados)
  - [ ] Seção de pesquisa (se houver dados)

## Pós-execução

- [ ] Revisar texto do resumo:
  - [ ] Valores estão razoáveis (não muito altos/baixos)
  - [ ] Nomes de criativos estão corretos
  - [ ] Percentuais fazem sentido
- [ ] Copiar conteúdo do arquivo .txt
- [ ] Colar no ClickUp Chat
- [ ] Verificar formatação no ClickUp

## Problemas?

Se algo deu errado:

1. [ ] Execute `python3 test_instalacao.py` novamente
2. [ ] Verifique nomes exatos das abas no Excel
3. [ ] Verifique formato das datas (DD/MM/YYYY)
4. [ ] Verifique que números não são texto
5. [ ] Consulte `EXEMPLO_USO.md` para estrutura esperada
6. [ ] Consulte `README.md` para troubleshooting

## Dica: Automação futura

Para automatizar execução semanal:

### No Windows (Task Scheduler)
- [ ] Criar tarefa agendada
- [ ] Executar script toda segunda-feira às 9:00

### No macOS/Linux (cron)
- [ ] Adicionar ao crontab: `0 9 * * 1 python3 /caminho/resumo_semanal.py -f /caminho/dados.xlsx -s $(date +%d/%m/%Y -d "1 day ago") -e $(date +%d/%m/%Y)`

### Via Google Sheets (Apps Script)
- [ ] Automatizar export do Google Sheets
- [ ] Disparar script Python automaticamente

---

## Resumo rápido

```bash
# 1. Validar
python3 test_instalacao.py

# 2. Preencher histórico (opcional)
cp historico_template.json historico.json
# ... editar com dados reais

# 3. Executar
python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json

# 4. Verificar saída
cat resumo_07032026.txt

# 5. Copiar para ClickUp
# (copiar conteúdo do arquivo)
```

---

**Status da verificação**: 

Todos os itens acima foram checados? Sim ( ) Não ( )

Se não: Volte aos itens não checados antes de executar.

Se sim: Pronto para executar o script! 🚀
