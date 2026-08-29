# EPIC 46 — Navegação da etapa

**Status:** Em andamento — 46.1 na `main` e em produção · 46.2 entregue, na PR #666 (aberta)
**Origem:** pedido do dono do produto em 2026-08-28 — *"está muito comprida e pouco funcional"* · e, a partir da 46.2, a **validação visual** da 46.1 feita por ele em 2026-08-29
**Owner:** @sm (stories) → @dev (implementação)
**Criado:** 2026-08-29 pelo @pm (Morgan), junto com a renumeração 45 → 46 — ver § "Nota de renumeração"

---

## O que é

O menu da etapa do Loyola X tinha **14 `<TabsTrigger>` numa fileira única**, declarados como JSX literal em `packages/web/app/(app)/projects/[id]/funnels/[funnelId]/stages/[stageId]/page.tsx`, todos no mesmo nível hierárquico. Este epic transforma essa fileira em **cinco destinos de primeiro nível com submenu**, e coloca a aba ativa na URL.

Não é redesenho visual. É hierarquia de informação: o menu passa a refletir **como o trabalho é organizado**, e não a ordem em que as abas foram sendo construídas.

## Os três problemas que originaram o epic

Medidos no código pela 46.1, não supostos:

1. **Não havia hierarquia.** "Mautic" (integração de e-mail) e "Meta Ads" (o dashboard onde o operador passa o dia) competiam pelo mesmo peso visual.
2. **Quebrava em várias linhas no mobile.** `<TabsList>` sem `className` herda `flex w-full flex-wrap` abaixo de `sm`. Com 14 gatilhos, três linhas antes do conteúdo começar.
3. **A aba ativa não existia na URL.** Era `useState("meta-ads")` puro — sem `useSearchParams`, `?tab=`, hash ou `localStorage`. Ninguém conseguia mandar "abre aqui" para o time, e todo refresh voltava para Meta Ads.

O item 3 é o que piora ao agrupar: com submenu, o estado a perder deixa de ser um e passa a ser dois (grupo aberto + filho ativo).

## A estrutura alvo

| # | Nível 1 | Submenu | Ao clicar no pai |
|---|---|---|---|
| 1 | **Meta Ads** | `Meta Ads TESTE` (launch + captação paga) — **vazio em perpétuo** desde a 46.2 | carrega o dashboard de Meta Ads |
| 2 | **YouTube Ads** | — | carrega YouTube Ads |
| 3 | **Dados** | `Análise MVP` (perpétuo, 1º filho — 46.2) · `Pesquisas` · `Planilhas` · `Links` · `Lead Scoring` · `Mídias Orgânicas` · `Mautic` · `Analytics` · `NPS` | carrega o primeiro filho elegível |
| 4 | **Inácio** | `Cadeia de CAC` · `Panorama` | carrega Cadeia de CAC |
| 5 | **Relatórios** | — | carrega Relatórios |

**Por que "Relatórios" ficou fora do grupo Inácio:** a aba renderiza `LaunchReportConfigSection` / `PerpetualReportConfigSection` — é o gerador do Resumão (Epic 41), não tem relação com o Inácio. Enterrar o gerador sob um rótulo de expert esconderia a ferramenta de quem a usa.

## Regras não-negociáveis

Vieram das ACs entregues e dos dois gates. Quebrar qualquer uma delas é breaking change:

1. **O `value` de uma aba é contrato de URL.** Uma aba pode mudar de grupo; o `value` nunca muda. Links `?tab=` já compartilhados precisam continuar abrindo. A 46.2 moveu `analise-mvp` de Meta Ads para Dados **sem tocar no `value`**, exatamente por isso.
2. **A elegibilidade não muda junto com a navegação.** Toda story deste epic preserva as condições que decidiam quais abas aparecem — o agrupamento é rearranjo, não regra de negócio nova.
3. **Paridade menu ↔ conteúdo, conferida explicitamente.** A função pura garante que só devolve `value` que está no menu; ela **não** garante que esse `value` tem `<TabsContent>`. Os dois conjuntos precisam ser extraídos e comparados a cada story (na 46.1: união de 15 `value` × 15 `TabsContent`). É a metade do risco que nenhum runner alcança.
4. **O menu não pode crescer em altura.** O motivo de o epic existir é encurtar o menu. Rótulo de pai vai inline; nenhuma linha nova no `flex-col`.
5. **A configuração é dado, não JSX.** As abas vivem em `packages/web/lib/utils/menu-de-abas.ts`, seguindo o padrão que `app/(app)/settings/layout.tsx` já usava. Não inventar padrão novo.
6. **Validação visual é entregável, não formalidade.** Ver § "O que este epic provou".

## Stories

| # | Story | Entrega | Status |
|---|---|---|---|
| 46.1 | O menu de abas vira hierárquico — 14 itens soltos viram 5 grupos | menu de 2 níveis + deep-link `?tab=` | **Done** · gate CONCERNS · `main` `4da6f14b` (PR #661) · em produção |
| 46.2 | A Análise MVP muda do grupo Meta Ads para Dados | 1 linha de config, em perpétuo | **Done** · gate CONCERNS · **PR #666 aberta, não mergeada** |

Arquivos: `docs/stories/46.1.menu-de-abas-hierarquico.md` · `docs/stories/46.2.submenu-visivel-e-analise-mvp-em-dados.md`
Gates: `docs/qa/gates/46.1-menu-de-abas-hierarquico.yml` · `docs/qa/gates/46.2-submenu-visivel-e-analise-mvp-em-dados.yml`

## O que este epic provou

A 46.1 subiu com gate **CONCERNS** por um motivo declarado: a navegação nunca tinha sido exercida numa tela. A validação visual foi feita depois e **passou nos quatro pontos** — mas produziu a 46.2 inteira, sobre algo que nenhum teste automatizado tinha como levantar (uma aba no grupo errado).

O gate estava certo ao recusar o PASS. E a 46.2 repetiu o padrão: subiu para PR sem validação visual (QA-452-01, `medium`). **Segunda story seguida sem tela.**

> **Regra do epic:** nenhuma story de navegação vai a PASS sem validação visual em, no mínimo, perpétuo e lançamento-com-captação-paga. Não é formalidade final — historicamente é onde os achados aparecem.

## Débitos abertos

| ID | Sev | O que é | Onde |
|---|---|---|---|
| **QA-451-01** | medium | Trocar de etapa pela sidebar com aba não-default selecionada: a tela continua na aba antiga e a URL não a descreve. **Está em produção.** Nenhum teste cobre a interação — só a tela prova. Roteiro de 30s no gate da 46.2 | gate 46.1 |
| **QA-452-01** | medium | Validação visual da 46.2 não executada | gate 46.2 |
| QA-451-02 | low | As setas do teclado deixaram de navegar entre abas (perda do roving tabindex ao trocar `TabsTrigger` por `<button>`); `aria-labelledby` do `TabsContent` pendente | gate 46.1 |
| QA-451-04 | low | A AC7.1 é protegida só por comentários — comentário não falha em CI. O runner do web não coleta `.tsx`, e isso é deliberado desde a 29.35 | gate 46.1 |
| — | low | Contraste do filho inativo do submenu (`border-transparent`). Era a AC3 da 46.2; saiu do escopo quando o dono do produto esclareceu que **viu** a aba. Continua real no código, sem urgência | 46.2 |

⚠️ Os IDs `QA-451-*` / `QA-452-*` foram cunhados sob a numeração antiga (45.1 / 45.2). Leia `451` como 46.1 e `452` como 46.2 — ver § "Nota de renumeração".

## Fora do escopo

Redesenho visual do menu, mudança de rotas, mudança de qualquer regra de elegibilidade, e o gerador de Resumão (Epic 41) — que fica top-level e não entra em nenhum grupo.

---

## 🔀 Nota de renumeração — este epic já foi o Epic 45

**Até 2026-08-29 este epic se chamava "Epic 45 — Navegação da etapa", com stories `45.1` e `45.2`.**

### Como a colisão aconteceu

O @sm criou a primeira story em 2026-08-28 abrindo um tema que não pertencia a nenhum epic existente. Numerou como `45.1` por consistência com a convenção do repositório e **registrou na própria story** que criar o epic era atribuição do @pm — sem criá-lo. O número ficou desocupado em `docs/stories/epics/`.

Depois, o **Epic 45 — Construtor de BI** foi numerado e ocupou o 45 de fato, com doc de epic formalizado. O git não conflitou (nomes de arquivo distintos), mas a `main` passou a ter dois `45.1.*` e ia ganhar dois `45.2.*`.

### Por que a navegação renumerou, e não o Construtor de BI

| Critério | Navegação | Construtor de BI |
|---|---|---|
| Stories | **2** | **11** (45.1–45.11) |
| Mergeado | 1 story (#661); a outra em PR aberta | 11 stories, 3 PRs (#665, #667, #668) |
| Linhas na `main` | 1.564 | **12.653**, em 52 arquivos de `packages/` |
| Doc de epic | **nenhum** — nunca formalizou o número | `EPIC-45-CONSTRUTOR-DE-BI.md`, com 12 referências internas a `45.x` |
| Referências cruzadas por número | ~30 | ~90, incluindo a cadeia de dependência 45.1→45.2→…→45.8 escrita story a story |
| Momento | a 46.2 ainda **não** estava mergeada | tudo mergeado e em produção |

**O critério decisivo não foi quem chegou primeiro — foi o que reserva um número neste repositório.** Uma story pode *usar* um número; o que o *ocupa* é o doc de epic em `docs/stories/epics/`. A navegação usou o 45 de forma declaradamente provisória (o próprio @sm escreveu que o doc de epic dependia de o tema ganhar irmãs). O Construtor de BI o formalizou. Provisório perde para formalizado — e, no mesmo sentido, 2 stories perdem para 11.

Como controle: ambos os lados estão em produção, então "o que já rodou" não desempata. O volume desempata, e desempata por 6× em stories e 8× em linhas.

### Por que 46 e não 39

`39` está livre de stories, mas **tem doc de epic** (`epic-39-mcp-methodology-gaps.md`). Reusá-lo criaria a segunda colisão em vez de fechar a primeira. Censo dos números em uso na `main`: **1–38, 40–45**. `46` é o primeiro genuinamente livre — zero ocorrências de "Epic 46" em `docs/`, `.claude/` ou `.aiox/` antes deste documento.

### O que não foi renumerado, e por quê

Não se reescreve história. Estes artefatos citam `45.1` / `45.2` e **continuam citando**:

- Commits `4da6f14b`, `925acfcc`, `73c9a531`, `238d8840`, `db8e7694`, `2ae39408`, `5b1d8c38`, `3aebdf23`
- PRs **#661** (mergeada) e **#666** (aberta)
- Branches `feat/45.1-menu-abas-hierarquico` e `feat/45.2-submenu-visivel`
- A citação da branch em `docs/stories/44.18.criativos-por-etapa-na-api.md:400` — é registro de um fato do git, e a PR #661 ao lado já o desambigua
- Os IDs de achado `QA-451-*` e `QA-452-*` — chaves de rastreio já publicadas em gates mergeados e em memória de agente. Renumerá-las orfanaria mais do que conserta

Cada story renumerada carrega uma tabela § "Nota de renumeração" que liga o número antigo a estes artefatos, para que quem chegar por `4da6f14b` ou pela PR #661 encontre a story.

### O que a renumeração revelou

1. **O gap de processo é real e reincidente.** A ordem `@sm cria story → @pm formaliza epic` deixa uma janela em que o número está usado mas não reservado. Aqui a janela durou 1 dia e custou uma renumeração. **Mitigação:** criar o doc de epic — ainda que mínimo — no mesmo dia da primeira story de um tema novo. É barato; a alternativa é isto.
2. **`docs/stories/` não é uma chave.** Dois arquivos `45.1.*` conviveram sem que git, CI, lint ou build reclamassem. Nenhuma ferramenta do repo detecta prefixo duplicado.
3. **O Construtor de BI é maior do que sua PR sugere.** Não são 9 stories em `#665`: são 11, em três merges (`#665`, `#667`, `#668`), e a `main` avançou de `805770a6` para `50c02fb6` depois.
4. **Divergência de contagem herdada, não introduzida aqui:** a 46.1 fala em "14 abas → 5 grupos" e a 46.2 em "13 itens → 5". As duas estão certas em contextos diferentes — `Meta Ads TESTE` e `Análise MVP` são mutuamente exclusivas, então **a fileira tinha 14 gatilhos declarados e no máximo 13 renderizados por vez**. Fica registrado para não virar "correção" errada mais tarde.

---

*Criado pelo @pm (Morgan) em 2026-08-29 — `*create-epic` + resolução de colisão de numeração.*
