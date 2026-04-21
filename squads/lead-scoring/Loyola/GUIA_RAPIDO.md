# Guia Rápido - Resumo Semanal

## Como usar em 3 passos

### 1. Preparar arquivo Excel
Exporte seu Google Sheet como .xlsx contendo estas abas:
- "Captação - Macro 2026" → Métricas diárias
- "Captação - Teste LP" → A/B tests (opcional)
- "Captação - Ads" → Performance hot
- "Ads-Cold" → Performance cold
- "Resultado-Pesquisa" → Dados demográficos

### 2. Executar script
```bash
python resumo_semanal.py -f sua_campanha.xlsx -s 01/03/2026 -e 07/03/2026
```

### 3. Copiar saída
O resumo aparece no terminal e é salvo em `resumo_DDMMYYYY.txt`. Cole no ClickUp Chat.

---

## Comandos úteis

**Com histórico de campanhas anteriores:**
```bash
python resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 --historico historico.json
```

**Salvando em caminho específico:**
```bash
python resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026 -o ~/Desktop/resumo.txt
```

---

## Arquivo histórico.json

Use `historico_template.json` como base. Copie e preencha com dados anteriores:

```json
{
  "campanhas_anteriores": {
    "FZ-BF25": {"CPM": 18.4, "CTR": 1.56, "CPC": 1.2},
    "FZF2": {"CPM": 15.5, "CTR": 0.84, "CPC": 1.9}
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

---

## O que o script faz

✅ Soma investimento, leads e cliques por período  
✅ Calcula CPM, CPC, CTR, CPL  
✅ Identifica melhor LP (A ou B)  
✅ Encontra melhores criativos por audiência  
✅ Extrai dados demográficos da pesquisa  
✅ Compara com campanhas anteriores  
✅ Formata em português para ClickUp  

---

## Estrutura do Excel esperada

### "Captação - Macro 2026"
- Col A: Data (DD/MM/YYYY)
- Col B: Investimento
- Col C: Cliques
- ... (próximas colunas com métricas conforme header)

### "Captação - Ads"
- Col A: Nome do Ad
- Col B: Investimento
- Col C: Impressões
- Col D: Cliques
- ... (E: CTR, F: CPC, G: CPM, H: Leads, I: CPL)

### "Resultado-Pesquisa"
Tabelas dinâmicas com:
- Sexo, Idade, Filhos, Religião, Estado civil, Escolaridade, Renda

---

## Troubleshooting

**Script não encontra abas?**  
→ Verifique nomes exatos: "Captação - Macro 2026", "Captação - Ads", etc.

**Valores aparecem em branco?**  
→ Pode estar em outro intervalo. O script processa linhas com dados.

**Erro de data?**  
→ Use formato DD/MM/YYYY (ex: 01/03/2026)

**openpyxl not installed?**  
→ Execute: `pip install openpyxl --break-system-packages`

---

## Exemplos de saída

### Seção de CPL com histórico
```
CPM R$ 15,80 (FZ-BF25 foi R$ 18,40 e FZF2 foi R$ 15,50*)
CTR 1,23% (FZ-BF25 foi 1,56% e FZF2 foi 0,84%*)
CPC R$ 1,50 (FZ-BF25 foi R$ 1,20 e FZF2 foi R$ 1,90*)
```

### Seção de Criativos
```
Público quente (hot)

Melhor estático: 01-fz-l1-fev26-carrousel (CPL R$ 25,60)
Melhores vídeos: v02-fz-l1-fev26-hook, v03-fz-l1-fev26-reels (CPL R$ 22,30)
```

---

## Dicas

💡 Sempre verificar se as datas dos dados cobrem o período solicitado  
💡 Manter arquivo histórico atualizado após cada campanha  
💡 Preencher todos os campos da pesquisa para resumo completo  
💡 Usar nomes descritivos nos ads (com prefixo tipo "01-", "v05-", "c03-")  
💡 Exportar Excel sem filtros aplicados (dados brutos)  

---

## Instalação (primeira vez)

```bash
# Verificar Python instalado
python3 --version

# Instalar openpyxl
pip install openpyxl --break-system-packages

# Executar script
python resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026
```

---

Pronto! Seu resumo será gerado em segundos. 🚀
