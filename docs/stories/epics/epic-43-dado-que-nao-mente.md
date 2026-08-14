# EPIC-43 — Dado que não mente: ausência declarada no feed de métricas

**Origem:** dois chamados independentes de 2026-08-14 — *"a Página C não aparece no gráfico de Aplicações"* e uma lista de 6 itens sobre métricas de vídeo/criativos do feed público.

**Objetivo:** eliminar a classe de defeito em que **o número errado se parece com o número certo**. Não é sobre calcular mais coisas — é sobre nenhuma tela ou payload afirmar completude que não tem.

**Criado:** 2026-08-14 (@pm — Morgan) — **retroativamente**, ver "Dívida de processo"
**Status:** Done (5 stories implementadas, revisadas e mergeadas)

---

## ⚠️ Dívida de processo: este epic foi criado depois das stories

**O fluxo correto é @pm cria o epic → @sm escreve as stories.** Aqui aconteceu o inverso: as stories 43.1–43.5 foram numeradas por continuidade (as anteriores eram 42.x) e chegaram à `main` antes de o epic existir.

Consequência concreta e registrada: **o @po marcou o ponto 10 do checklist (alinhamento com PRD/Epic) como não atendido nas cinco validações**, e nenhuma delas fechou 10/10. O @sm agiu certo ao se recusar a criar o epic — não é autoridade dele.

**Decisão: formalizar retroativamente, não renumerar.** Renumerar custaria reescrever 5 PRs mergeados, 5 tasks de ClickUp, 6 gates e 3 documentos de validação, para ganhar consistência de numeração que ninguém consulta. O custo é real e o benefício é estético.

**O que muda daqui para frente:** epic antes de story. Se aparecer trabalho novo sem epic, o @sm escala para cá **antes** de numerar.

---

## 🎯 Por que este epic existe

As cinco stories nasceram de sintomas diferentes e revelaram **o mesmo defeito estrutural**:

| Story | O sintoma | O que estava mentindo |
|---|---|---|
| 43.1 | "a Página C não aparece" | O gráfico mostrava 2 de 3 páginas **sem sinalizar** que podia estar cego |
| 43.2 | "42–86% dos criativos com retenção < 1%" | Impressões somavam 30 dias, vídeo somava **1 dia** — a razão parecia uma métrica |
| 43.3 | "falta o 3s" | `p25` era usado como proxy de gancho, mas **inclui quem pulou** |
| 43.4 | "a API corta em 200" | Resposta truncada **idêntica em forma** a uma completa |
| 43.5 | "o Slide 20 fica pela metade" | A tentação de estimar conversão com cliques no CTA |

Em todos, o dado ausente ou parcial se apresentava como dado completo. **Um relatório sobre 500 de 700 anúncios não se anuncia.** Uma retenção de 0,04% não diz que é de um dia só. Um gráfico com duas linhas não diz que existe uma terceira.

O custo não é estético: é decidir corte de verba sobre uma página que não está sendo vista, ou ranquear criativo por um número que depende de qual dia veio primeiro no `ORDER BY`.

---

## 🧭 O princípio que atravessa as cinco

**Ausência tem que ser visível. Zero não é ausência. Proxy plausível é pior que lacuna declarada.**

Isso apareceu como decisão concreta em cada story, e foi o critério que os gates usaram:

- **43.1** — aba ilegível vira **aviso**, não série zerada. Zerado se lê como "essa página não performou".
- **43.2** — anúncio sem vídeo devolve `null`, nunca `{0,0,0,0,0}`. "Não é vídeo" ≠ "vídeo sem retenção".
- **43.3** — campo que a Meta não reportou fica **ausente do jsonb**, não gravado como `0`. E como o valor é persistido, zero gravado não se recupera depois.
- **43.4** — `truncated` no payload. Sem ele, `limit=50` devolve 50 de 448 e parece o conjunto.
- **43.5** — `convPostPitch: null` com nota, e **proibição explícita** de usar cliques no CTA como proxy. Há teste que quebra se alguém tentar.

**Recomendação para o futuro:** usar isso como critério de revisão em qualquer story de métrica. A pergunta é *"o que este payload afirma que não pode provar?"*.

---

## 📋 Stories

| # | Story | PR | Gate |
|---|---|---|---|
| 43.1 | Aplicações por dia — descobrir sozinho as páginas ativas | #524 | CONCERNS (2 it.) |
| 43.2 | Métricas de vídeo somam o período, não um dia só | #526 | **PASS** |
| 43.3 | Payload de vídeo — 3s, denominador e unidades declaradas | #527 | PASS (2 it.) |
| 43.4 | Volume de criativos — o corte é nosso, e é silencioso | #528 | **PASS** |
| 43.5 | Funil de VSL por etapa — Play rate e Pitch rate | #529 | PASS (2 it.) |

### Sobre a 43.1 ser de outro domínio

**É, e isso não passou despercebido.** A 43.1 trata de planilhas do comercial (Google Sheets); as outras quatro tratam do feed público de métricas da Meta. Tecnicamente não se tocam.

O que as une é o princípio acima, não a implementação — e é uma união real, não conveniência retroativa: a 43.1 foi a primeira a estabelecer o padrão de "aviso em vez de série zerada", e a 43.2 citou explicitamente esse precedente.

**Daqui para frente:** trabalho novo de aplicações do comercial abre epic próprio. Este fica fechado com as cinco.

---

## 🔍 Três premissas do chamado que a investigação derrubou

Registro porque é o resultado mais valioso do epic — e porque **implementar o pedido ao pé da letra teria produzido trabalho errado nos três casos**:

1. **"Sub-contagem de vídeo por placement (Reels/Stories)"** — errado. Era a agregação. Provado com **desvio zero** contra a Meta via MCP, em 3 anúncios × 4 métricas. O item mais crítico da lista **não precisou de story**.
2. **`video_3_sec_watched_actions`** — não existe na API. O 3s é `actions[].video_view`, que o projeto já lia desde a 18.65. E não há `video_15_sec`: `thruplay` já é "completar ou 15s".
3. **"A API da Meta corta em 200"** — errado. A Meta pagina normalmente. As travas eram nossas: 4 caps, **só um avisava**, e o apontado pela story era de adsets, não de criativos.

**Lição de processo:** investigar antes de escrever a story mudou o escopo de três dos seis itens. Story sem causa raiz vira chute para o @dev.

---

## 🚧 Fora do escopo

- **Story 42.7** (colunas de receita por criativo no Lyrio) — bloqueada por rastreio, não por este epic
- Automatizar o numerador da conversão pós-pitch — é integração com outro sistema
- Corrigir configuração de campanha (macros `{{ad.id}}` literais, install referrer) — não é trabalho de dev
- Backfill do histórico com `views3s` — o passado fica sem 3s, e isso é visível de propósito

---

## 📌 Pendências que sobrevivem ao epic

**1. Deploy da API — o gargalo.** Nada deste epic produz efeito em produção até o deploy acontecer. Represado junto: 42.6. Hoje, em produção: a Página C do DG continua invisível, a retenção continua ~N× menor, os caps continuam truncando calados.

**2. Ao deployar a 43.2, os números de retenção sobem** proporcionalmente à janela. **Não é regressão** — relatórios anteriores subestimavam. Se algum foi apresentado a cliente, o número mudou.

**3. Validação da 43.1 contra dado real (QA-21)** — a descoberta de abas nunca rodou com a credencial do Google, que só existe em produção. Depois do deploy: conferir se a Página C aparece e se as séries A e B mantêm os mesmos totais.
