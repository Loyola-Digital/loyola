# Video Creation Squad - Scripts

> Worker scripts para operacoes deterministicas - 100% Python, zero tokens LLM.

## Arquitetura

Todos os scripts seguem o padrao **EXEC-W-001** (Worker Deterministico):
- Mesma entrada = mesma saida, sempre
- Sem chamadas a LLM ou APIs externas
- Saida em texto legivel ou JSON estruturado
- Codigos de saida padronizados: `0` = sucesso, `1` = falha, `2` = erro

```
Decisao de executor:
  Deterministico? --SIM--> Worker (Python script)
  Requer analise? --SIM--> Agent (LLM)
  Misto?          --SIM--> Hybrid (Worker coleta, Agent analisa)
```

## Dependencias

- **Python 3.8+**
- **PyYAML** (`pip install pyyaml`)

Nenhuma outra dependencia externa e necessaria. Os scripts usam apenas a
biblioteca padrao do Python alem do PyYAML.

## Scripts Disponiveis

### validate-squad-structure.py

Valida a estrutura completa do squad video-creation em 4 fases:

| Fase | Descricao |
|------|-----------|
| Fase 0 | Deteccao de tipo (pipeline, expert, hybrid) |
| Fase 1 | Validacao de estrutura (diretorios, arquivos, YAML, seguranca) |
| Fase 2 | Arquitetura de agentes (level_0 a level_5) |
| Fase 3 | Referencias cruzadas (workflows <-> agents/tasks) |

**Uso:**

```bash
# Validacao com saida em texto
python scripts/validate-squad-structure.py

# Validacao com saida JSON (para consumo por outros scripts/agents)
python scripts/validate-squad-structure.py --output json

# Modo verboso
python scripts/validate-squad-structure.py --verbose
```

**Codigos de saida:**
- `0` - Todas as validacoes passaram
- `1` - Uma ou mais validacoes falharam
- `2` - Erro de execucao (diretorio nao encontrado, etc.)

---

### quality_gate.py

Avalia a qualidade do squad com sistema de pontuacao 0-10.

| Categoria | Peso | O que avalia |
|-----------|------|--------------|
| Structure | 25% | Diretorios, arquivos obrigatorios, contagem de componentes |
| Coverage | 25% | Knowledge base, checklists, templates, workflows |
| Quality | 25% | Profundidade dos agentes (>300 linhas), complexidade de workflows |
| Documentation | 25% | README, CHANGELOG, documentacao inline, scripts |

**Threshold:** 7.0/10 (padrao) ou 8.5/10 (modo strict)

**Uso:**

```bash
# Avaliacao padrao com saida em texto
python scripts/quality_gate.py

# Saida em JSON
python scripts/quality_gate.py --output json

# Modo strict (threshold mais alto: 8.5/10)
python scripts/quality_gate.py --strict

# Combinado
python scripts/quality_gate.py --strict --output json
```

**Codigos de saida:**
- `0` - Score acima do threshold (PASS)
- `1` - Score abaixo do threshold (FAIL)
- `2` - Erro de execucao

---

## Exemplos de Integracao

### Pipeline de validacao completa

```bash
# Passo 1: Validar estrutura
python scripts/validate-squad-structure.py --output json > /tmp/structure.json

# Passo 2: Rodar quality gate
python scripts/quality_gate.py --output json > /tmp/quality.json

# Passo 3: Verificar resultados
echo "Estrutura: $(python -c "import json; d=json.load(open('/tmp/structure.json')); print(d['summary']['recommendation'])")"
echo "Qualidade: $(python -c "import json; d=json.load(open('/tmp/quality.json')); print(d['summary']['verdict'], d['summary']['final_score'])")"
```

### Uso com Agent (Hybrid)

Os scripts geram JSON que pode ser consumido por um Agent para enriquecimento:

```bash
# Worker coleta dados deterministicos
STRUCTURE=$(python scripts/validate-squad-structure.py --output json)
QUALITY=$(python scripts/quality_gate.py --output json)

# Agent pode consumir o JSON para gerar relatorio enriquecido
```

---

## Convencoes

- Todos os scripts aceitam `--output json` para saida estruturada
- Nenhum script modifica arquivos do squad (somente leitura)
- Scripts devem ser executados a partir do diretorio do squad ou de qualquer
  diretorio pai que contenha a estrutura `squads/video-creation/`
- Nomes de scripts usam kebab-case (`.py`) ou snake_case (`.py`)

---

*Video Creation Squad Scripts v1.0.0*
*Pattern: EXEC-W-001 (Worker - Deterministic)*
