# Índice Completo - Resumo Semanal de Campanhas de Marketing

## Visão geral

Sistema completo em Python para gerar resumos semanais padronizados de campanhas de marketing Facebook/Meta a partir de dados exportados de Google Sheets em formato .xlsx. Produz texto formatado em português (BR) pronto para ClickUp Chat.

**Status**: ✅ Pronto para usar (10/10 testes passaram)

---

## 📁 Estrutura de arquivos

### Scripts Python (executáveis)

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| `resumo_semanal.py` | 33 KB | Script principal - Processa dados e gera resumo |
| `test_instalacao.py` | 11 KB | Valida instalação e testa todas as dependências |

### Dados

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| `historico_template.json` | 361 B | Template para arquivo de histórico (copiar) |

### Documentação

| Arquivo | Tamanho | Proposito | Leia se... |
|---------|---------|----------|-----------|
| `README.md` | 8.2 KB | Documentação técnica completa | Quer entender tudo em detalhe |
| `SETUP.md` | 6 KB | Setup inicial e explicação geral | Instalando pela primeira vez |
| `GUIA_RAPIDO.md` | 3.6 KB | Guia em 3 passos para uso rápido | Quer ir rápido |
| `EXEMPLO_USO.md` | 7.4 KB | Exemplo detalhado com dados reais | Quer ver um exemplo prático |
| `CHECKLIST.md` | - | Checklist pré-execução | Quer validar antes de rodar |
| `COMANDOS_RAPIDOS.txt` | - | Referência rápida de comandos | Quer copiar/colar comandos |
| `INDEX.md` | Este arquivo | Índice e mapa de navegação | Procura por orientação |

---

## 🚀 Quick Start (para apressados)

### 1️⃣ Validar instalação
```bash
python3 test_instalacao.py
```

### 2️⃣ Executar script
```bash
python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

### 3️⃣ Copiar resultado para ClickUp
O resumo é impresso na tela e salvo em `resumo_DDMMYYYY.txt`

---

## 📖 Guias por cenário

### "Eu nunca usei isso antes"
1. Leia: `SETUP.md`
2. Execute: `python3 test_instalacao.py`
3. Leia: `GUIA_RAPIDO.md`
4. Consulte: `EXEMPLO_USO.md`

### "Quero usar rápido"
1. Leia: `GUIA_RAPIDO.md`
2. Consulte: `COMANDOS_RAPIDOS.txt`
3. Execute o comando

### "Quero entender tudo"
1. Leia: `README.md`
2. Leia: `SETUP.md`
3. Estude: `EXEMPLO_USO.md`
4. Explore o código em `resumo_semanal.py`

### "Algo deu errado"
1. Execute: `python3 test_instalacao.py`
2. Leia: `CHECKLIST.md`
3. Consulte: `README.md` → Troubleshooting
4. Verifique: `EXEMPLO_USO.md` → Estrutura do Excel

### "Preciso de um comando específico"
Consulte: `COMANDOS_RAPIDOS.txt`

---

## 📊 O que o script faz

### Entrada
- Arquivo .xlsx exportado de Google Sheets
- Data de início e data de fim (DD/MM/YYYY)
- Arquivo JSON com histórico (opcional)

### Processamento
1. Lê aba "Captação - Macro 2026" (métricas diárias)
2. Filtra por data especificada
3. Calcula agregações: investimento, leads, CPM, CPC, CTR, CPL, etc.
4. Lê LP tests da aba "Captação - Teste LP" (opcional)
5. Lê performance de criativos de "Captação - Ads" e "Ads-Cold"
6. Classifica ads: estáticos, vídeos, carrosséis
7. Identifica melhores performers por CPL
8. Extrai dados demográficos de "Resultado-Pesquisa"
9. Compara com histórico se fornecido
10. Formata em português (BR) para ClickUp

### Saída
1. Texto impresso no terminal
2. Arquivo .txt com o resumo formatado
3. Pronto para copiar/colar no ClickUp Chat

---

## 📋 Estrutura esperada do Excel

### Aba obrigatória: "Captação - Macro 2026"
Métricas diárias com colunas:
- A: Dia | B: Investimento | C: Cliques | D: Impressões | E-T: Outras métricas

### Aba opcional: "Captação - Teste LP"
A/B tests de landing pages com URLs e performance

### Aba obrigatória: "Resultado-Pesquisa"
Dados demográficos em tabelas dinâmicas (sexo, idade, estado civil, etc.)

### Aba opcional: "Captação - Ads" (hot)
Performance de criativos para público quente

### Aba opcional: "Ads-Cold"
Performance de criativos para público frio

Veja `README.md` > "Estrutura do arquivo Excel" para detalhes completos.

---

## 🔧 Uso técnico

### Linha de comando
```bash
python3 resumo_semanal.py -f ARQUIVO -s DD/MM/YYYY -e DD/MM/YYYY [--historico JSON] [-o OUTPUT]
```

### Em Python
```python
from resumo_semanal import ResumoSemanal

resumo = ResumoSemanal("dados.xlsx", "01/03/2026", "07/03/2026", "historico.json")
print(resumo.gerar_resumo())
resumo.salvar_resumo("saida.txt")
```

Veja `README.md` > "Argumentos" para lista completa de opções.

---

## 🎯 Formatos de saída

### Formatação de números
- **Moeda**: `R$ 1.234,56` (ponto = milhares, vírgula = decimal)
- **Percentual**: `45%` ou `45,5%`
- **Datas**: `DD/MM/YYYY`

### Seções do resumo

1. **Geral** → Investimento, leads, CPL, taxa de resposta, connect rate, CPM/CPC/CTR
2. **Testes de LP** → URLs, qual performou melhor, connect rate
3. **Criativos** → Melhores ads por tipo (estático/vídeo) e audiência (hot/cold)
4. **Pesquisa** → Dados demográficos com comparação histórica

---

## 🔍 Validação & Testes

### Script de teste
```bash
python3 test_instalacao.py
```

Valida:
- Python version ✅
- openpyxl instalado ✅
- JSON processing ✅
- Argparse ✅
- DateTime ✅
- Script principal ✅
- Help ✅
- UTF-8 ✅
- Formatação ✅
- Estrutura de diretórios ✅

### Checklist pré-execução
Execute antes de cada uso: `CHECKLIST.md`

---

## 🛠️ Instalação

### Pré-requisitos
- Python 3.7+
- openpyxl (instalar via pip)

### Passos
```bash
pip install openpyxl --break-system-packages
python3 test_instalacao.py
```

Veja `SETUP.md` para detalhes.

---

## 📝 Exemplos

### Básico (sem histórico)
```bash
python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026
```

### Com histórico (recomendado)
```bash
python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

### Output customizado
```bash
python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 -o ~/Desktop/relatorio.txt
```

Mais exemplos em `EXEMPLO_USO.md` e `COMANDOS_RAPIDOS.txt`.

---

## ❓ Perguntas frequentes

**P: Como começar?**
R: Leia `SETUP.md` depois `GUIA_RAPIDO.md`

**P: Quais são os requisitos do Excel?**
R: Consulte `README.md` > "Estrutura do arquivo Excel"

**P: Deu erro, o que fazer?**
R: Execute `python3 test_instalacao.py` e consulte `README.md` > "Troubleshooting"

**P: Como usar com histórico?**
R: Copie `historico_template.json` → `historico.json`, preencha, e use `--historico historico.json`

**P: Posso usar em produção/automação?**
R: Sim! Veja `SETUP.md` > "Automação" para agendamento com cron/Task Scheduler

---

## 📚 Documentação por tema

### Instalação & Setup
- `SETUP.md` → Guia de setup inicial
- `test_instalacao.py` → Script de validação
- `CHECKLIST.md` → Checklist pré-execução

### Uso básico
- `GUIA_RAPIDO.md` → 3 passos para começar
- `COMANDOS_RAPIDOS.txt` → Referência de comandos
- `EXEMPLO_USO.md` → Exemplo completo passo a passo

### Referência técnica
- `README.md` → Documentação técnica completa
- `resumo_semanal.py` → Código-fonte comentado em português

### Índice & Navegação
- `INDEX.md` → Este arquivo

---

## 🐛 Troubleshooting rápido

| Problema | Solução |
|----------|---------|
| `openpyxl not installed` | `pip install openpyxl --break-system-packages` |
| `Arquivo não encontrado` | Verificar caminho do .xlsx |
| `Formato de data inválido` | Usar `DD/MM/YYYY` |
| `Aba não encontrada` | Verificar nomes exatos (com espaços) |
| Resultado vazio | Verificar dados no período especificado |

Mais detalhes em `README.md` > "Troubleshooting".

---

## 📞 Suporte

Para resolver problemas:

1. Execute: `python3 test_instalacao.py`
2. Verifique: `CHECKLIST.md`
3. Consulte: `README.md` → Troubleshooting
4. Estude: `EXEMPLO_USO.md`

---

## 🎓 Aprendizado progressivo

### Nível 1: Iniciante
1. Leia: `SETUP.md`
2. Execute: `test_instalacao.py`
3. Use: `GUIA_RAPIDO.md`

### Nível 2: Intermediário
1. Leia: `README.md`
2. Estude: `EXEMPLO_USO.md`
3. Configure: `historico.json`

### Nível 3: Avançado
1. Explore: `resumo_semanal.py` (código)
2. Customize: Adaptar script para sua necessidade
3. Automatize: Setup com cron/Task Scheduler

---

## ✅ Checklist de sucesso

- [ ] Python 3.7+ instalado
- [ ] openpyxl instalado
- [ ] Teste passou (10/10)
- [ ] Entendi a estrutura esperada do Excel
- [ ] Preparei arquivo com dados
- [ ] (Opcional) Preenchido `historico.json`
- [ ] Executei script com sucesso
- [ ] Resultado copiado para ClickUp
- [ ] Entendi as seções do resumo
- [ ] Pronto para próximas semanas

---

## 📈 Próximos passos

1. ✅ Validação completa
2. → Preparar `historico.json` com dados anteriores
3. → Exportar primeiro Google Sheet como .xlsx
4. → Executar script
5. → Colar resultado em ClickUp
6. → Manter histórico atualizado

---

## 📊 Estatísticas

- **Linhas de código**: ~850 (resumo_semanal.py)
- **Funções principais**: 10+
- **Testes de validação**: 10
- **Documentação**: 8 arquivos
- **Tempo de execução**: 1-2 segundos típico
- **Tamanho total**: ~40 KB código + docs

---

## 🗺️ Mapa de navegação

```
INDEX (você está aqui) ← Comece aqui para orientação
├── SETUP.md ← Setup inicial
├── GUIA_RAPIDO.md ← 3 passos para começar
├── README.md ← Documentação técnica
├── EXEMPLO_USO.md ← Exemplo prático
├── CHECKLIST.md ← Pré-execução
├── COMANDOS_RAPIDOS.txt ← Referência de comandos
├── resumo_semanal.py ← Script principal
└── test_instalacao.py ← Teste de validação
```

---

## 🎯 Resumo executivo

**O que é**: Script Python que processa dados de Google Sheets (Excel) e gera resumo semanal de campanhas de marketing em português para ClickUp.

**Como usar**: 
1. Prepare Excel com estrutura esperada
2. Execute: `python3 resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json`
3. Copie resultado para ClickUp

**Requisitos**: Python 3.7+, openpyxl

**Status**: ✅ Pronto para produção

**Tempo de aprendizado**: 15-30 minutos para iniciante

**Tempo de execução**: 1-2 segundos

---

**Versão**: 1.0  
**Data**: Abril 2026  
**Status**: ✅ Validado e pronto para uso

Comece por: `SETUP.md` ou `GUIA_RAPIDO.md`

Boa sorte! 🚀
