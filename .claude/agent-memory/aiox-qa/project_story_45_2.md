---
name: story-45-2
description: Story 45.2 (Análise MVP muda do grupo Meta Ads para Dados) — gate CONCERNS em 2026-08-29; código limpo, o que segurou o PASS foi a validação visual nunca executada
metadata:
  type: project
---

Story 45.2 — `ANALISE_MVP` saiu de `filhosDeMetaAds` e virou o **primeiro** filho do grupo `dados` sob `funnelType === "perpetual"`, em `packages/web/lib/utils/menu-de-abas.ts`. 21 linhas, 1 arquivo de código. Gate **CONCERNS** (1 medium + 5 lows), Status Done, ClickUp `86ak85bft` em `ready to ship`.

**Why:** a validação visual da 45.1 (a que o gate CONCERNS dela dizia ser a única capaz de achar isto) produziu o relato *"Análise MVP está fora, pode colocar ele em Dados tbm"*. O @sm leu como "a aba não foi vista" e escreveu uma AC3 de UI; o @po apontou que era inferência; perguntado, o dono respondeu **"eu a vi, mas no grupo errado"**. A AC3 saiu do escopo e a story caiu de S(3) para XS(1) — sobrou mover de grupo.

**How to apply:**
- **O medium (QA-452-01) é a validação visual da AC4, nunca executada.** É a segunda story seguida do Epic 45 a chegar ao gate sem tela. O roteiro está no gate `docs/qa/gates/45.2-...yml` e inclui o item herdado do **QA-451-01** (medium da 45.1, ainda aberto e em produção: etapa A → clicar NPS → trocar para B pela sidebar).
- **Efeito colateral vivo:** `abaPadraoDoGrupo` devolve `filhos[0]`, então clicar em "Dados" num funil perpétuo abre **Análise MVP**, não Pesquisas — e monta o `<PerpetualMvpAnalysis>` (hooks de config+vendas) em vez de Pesquisas. Declarado, aceito por [AUTO-DECISION] do @po, travado em teste nos dois funis. Reverter é uma linha.
- **Consequência que ninguém escreveu:** no perpétuo a segunda linha some da tela inicial (aba padrão `meta-ads` ficou sem filhos), então a Análise MVP **passa a exigir um clique** — antes aparecia sem clique. É o que o dono pediu, mas inverte a premissa original da story.
- **Mudança de escopo deixa afirmações órfãs.** Sete trechos fora do bloco de esclarecimento ainda dizem que ninguém achou a aba: o próprio título, § Story, § Valor de negócio, 2 mitigações da tabela de Riscos (uma cita a T2, cancelada pelo próprio @po), § Nota de processo. Ao revisar story que mudou de escopo no meio, varra o documento inteiro — o bloco de esclarecimento no topo não desativa o corpo.

Ver [[injetar-a-armadilha-prevista]] para como as duas armadilhas do @po foram verificadas, e [[story-45-1-menu-abas-hierarquico]] para o contexto.
