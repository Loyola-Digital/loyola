# Planner pelo Claude — esteira anual e calendário

**Para:** Ágatha (Projetos e Processos) e quem mais for usar o Claude conectado ao Loyola X.
**O que dá para fazer:** ler e preencher a visão **Anual (esteiras)** do Planner, e criar ou editar **campanhas e fases** do calendário, pedindo em português ao Claude. Nada disso precisa de navegador.

O contrato técnico completo, que o Claude também lê, está em [`docs/llms.txt`](../llms.txt), seção **Planner**.

---

## 1. Instalação (uma vez)

Você precisa de três coisas. As duas primeiras vêm do Lucas:

1. **A chave de API**, gerada em *Configurações → API Keys* com a permissão **Planner (escrita)** (`planner:write`). É uma chave só sua: se vazar, ela é revogada sem derrubar a de ninguém.
2. **O arquivo do MCP** (`loyola-mcp.cjs`), gerado com `bash scripts/gerar-bundle-mcp.sh ~/Desktop/loyola-mcp.cjs`. Guarde numa pasta fixa, por exemplo `C:\Loyola\loyola-mcp.cjs`.
3. **Node.js 20 ou mais novo** instalado (nodejs.org).

No Claude Desktop, abra *Settings → Developer → Edit Config* e adicione:

```json
{
  "mcpServers": {
    "loyola-x": {
      "command": "node",
      "args": ["C:\\Loyola\\loyola-mcp.cjs"],
      "env": {
        "LOYOLA_API_BASE_URL": "https://api.loyoladigital.com",
        "LOYOLA_API_KEY": "lyx_live_SUA_CHAVE"
      }
    }
  }
}
```

Reinicie o Claude Desktop. Na lista de ferramentas devem aparecer `get_esteira_anual`, `upsert_esteira_celulas` e as demais listadas abaixo.

> Se aparecer uma ferramenta chamada `AVISO_bundle_do_mcp_desatualizado`, o arquivo do MCP está velho: peça um novo ao Lucas.

---

## 2. Esteira anual

### Como a tela vira dados

```
Empresa + Ano
└── Faixa (ORGÂNICO · TRÁFEGO/CAMPANHA · ASCENSÃO)
    └── Esteira (linha: "Perpétuo Funil de Lucro", "Renovação MFB")
        └── Mês (JAN … DEZ)
            ├── nota       o texto curto acima da célula
            ├── produto
            ├── categoria  Back-End | Front-End
            └── funil      Lançamento | DR - VSL | Grupo de Conteúdo | Reunião Secreta | Webinar diário | Time comercial
```

- **A esteira vale para todos os anos.** Criar "Perpétuo Funil de Lucro" em 2027 faz a linha aparecer também em 2026, vazia. Só as células são por ano.
- A **faixa** pode ser chamada pelo nome que aparece na tela: "TRÁFEGO" na FZ e "CAMPANHA" na DG são a mesma faixa.
- **Categoria e funil** só aceitam as opções acima. Se o Claude tentar outra, a API recusa e devolve a lista.

### Pedido típico

> "Sobe na esteira da BBE 2027: esteira 'Perpétuo Funil de Lucro' na faixa Tráfego, de março a dezembro, produto 'Funil de Lucro (VSL 2)', Front-End, DR - VSL."

O que o Claude faz, nesta ordem:

1. **Lê** a esteira da BBE 2027 (`get_esteira_anual`).
2. **Simula** a gravação (`upsert_esteira_celulas` com `dryRun: true`) e **mostra o diff**: cada mês, o que tinha e o que vai ficar.
3. **Espera o seu ok.**
4. **Grava** (a mesma chamada, sem `dryRun`).
5. Você confere na tela com um reload.

Se algo estiver errado no pedido (esteira que não existe, funil fora da lista), **nada é gravado** e o Claude diz o que corrigir.

### Regras que valem a pena saber

| Situação | Comportamento |
|---|---|
| Campo não mencionado | Não muda. "Troca o funil de março para Lançamento" mexe só no funil. |
| "Limpa a nota de março" | O campo vira vazio (`null`). |
| Célula que fica sem nada | Some da tela, igual a apagar à mão. |
| Esteira que não existe | Erro, com a lista das que existem na faixa. Para criar, peça explicitamente ("cria se não existir"). |
| Limpar meses | O Claude mostra o que será apagado e pede confirmação antes. |

---

## 3. Calendário (campanhas e fases)

Cada **campanha** é um card no calendário. Se estiver ligada a uma **agenda do Google** (ex.: "🇺🇸 [FZ] Agenda Geral"), cada **fase** com data vira um evento nessa agenda, com o título `NOME DA CAMPANHA - Fase`.

### Pedidos típicos

> "Cria a campanha 'FZ REN4 - Renovação MFB' na agenda da FZ com Prod. Captação de 10 a 19/08/27 e Exec. Captação de 20/08 a 02/09/27."

> "Na BBEPR2, muda a Prod. Captação para começar em 21/09."

> "Quais campanhas têm fase entre outubro e novembro?"

O que acontece:

- **Criar ou editar fase:** só aquela fase muda, e o evento no Google é criado ou atualizado na hora.
- **Excluir fase:** apaga também o evento no Google. O Claude confirma antes.
- **Renomear campanha:** muda o título de **todos** os eventos dela no Google.
- Se o Google recusar (permissão da agenda, instabilidade), a campanha é salva mesmo assim e o Claude avisa. O Planner tenta de novo sozinho a cada 30 minutos.

**O que não dá para fazer pelo Claude, só na tela:** excluir uma campanha inteira, conectar uma agenda nova, importar do Google e mudar o nome ou a cor de uma faixa da esteira.

---

## 4. Segurança e rastro

- **Tudo o que o Claude grava fica registrado** com a sua chave, a hora e o antes → depois (tabela `planner_api_audit`). Se algo sair errado, dá para ver exatamente o que mudou e desfazer.
- A chave tem só permissão de Planner. Ela não mexe em tráfego, vendas nem configurações.
- Limite: 120 chamadas por minuto. Um pedido normal usa de 2 a 4.

---

## 5. Ferramentas disponíveis

| Ferramenta | O que faz |
|---|---|
| `get_esteira_anual` | Lê a esteira de uma empresa num ano |
| `upsert_esteira_celulas` | Preenche ou atualiza meses em lote (com simulação) |
| `create_esteira` | Cria uma linha numa faixa |
| `clear_esteira_celulas` | Limpa meses de uma linha (com simulação) |
| `list_planner_agendas` | Lista as agendas do Google conectadas |
| `list_planner_campanhas` | Lista campanhas e fases (por nome, empresa ou período) |
| `create_planner_campanha` | Cria campanha, com fases |
| `update_planner_campanha` | Renomeia, recolore, troca empresa ou agenda |
| `upsert_planner_fase` | Cria ou edita uma fase |
| `delete_planner_fase` | Exclui uma fase (e o evento no Google) |

Continuam disponíveis as ferramentas de leitura de tráfego, leads e vendas, se a chave tiver também a permissão **Dados (leitura)**.

---

## 6. Problemas comuns

| Mensagem | Causa | O que fazer |
|---|---|---|
| "Acesso negado: a API key não tem o scope necessário" | A chave não tem `planner:write` | Pedir uma chave com a permissão Planner (escrita) |
| "API key ausente ou inválida" | Chave errada no config | Conferir `LOYOLA_API_KEY` e reiniciar o Claude Desktop |
| "Agenda X não identificada" | Nome da agenda ambíguo | Usar o nome completo, que o Claude pega em `list_planner_agendas` |
| Ferramentas do Planner não aparecem | Arquivo do MCP antigo | Pedir o arquivo novo ao Lucas |
| Gravou, mas a tela não mudou | A tela não recarregou | Dar reload. A tela da esteira também se atualiza sozinha a cada 15 s |
