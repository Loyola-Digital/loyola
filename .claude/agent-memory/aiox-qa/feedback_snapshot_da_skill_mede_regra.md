---
name: feedback-snapshot-da-skill-mede-regra
description: Risco hipotético de regra de classificação (substring, termos, campo) se mede no dado antes de virar pergunta ao dono; o "conserto" óbvio pode ser pior
metadata:
  type: feedback
---

Quando o @dev levanta um risco teórico de regra ("`hotmart` vira Quente pela substring"), o QA MEDE antes de repassar a pergunta. Fontes:
- os snapshots CSV da skill em `aiox-bonsai/squads/loyola-debriefing/dados/<expert>/`;
- nomes de campanha em produção, consultados em `BEGIN READ ONLY`.

**Por quê:** na 49.2, a troca "óbvia" (token inteiro) perderia 15 campanhas reais (`QUENTES`, `SUPERHOT`, `FRIOS`) e não evitaria nenhum falso positivo. Zero foram encontrados em 23.749 terms e 1.265 nomes. A pergunta que parecia menor (FZ `letalk + x1`) era a que movia 67% dos compradores de um lançamento.

**Como aplicar:** em pergunta ao dono sobre regra de dado, leve o NÚMERO dos dois lados (o que muda e o que se perde). E cruze lead × venda antes de afirmar impacto: das 88 vendas `letalk + x1`, só 72 mudavam, porque 16 tinham lead com UTM. Ver [[project-story-49-2]].
