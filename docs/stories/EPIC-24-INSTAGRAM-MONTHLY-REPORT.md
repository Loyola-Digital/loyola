# Epic 24 — Relatório Mensal de Instagram

**Status:** Done
**Owner:** @sm → @po → @dev → @qa → @devops
**Criado em:** 2026-04-29

---

## Objetivo

Disponibilizar relatórios mensais consolidados de performance de Instagram para cada projeto, com botão "Gerar relatório do mês" no dashboard. O relatório agrega métricas de todas as contas IG vinculadas ao projeto em uma página HTML compartilhável (link público dentro do app), com top 5 melhores/piores posts, saldo de seguidores, totais agregados, distribuição por tipo de mídia, gráfico diário, demografia e comparativo automático versus o mês anterior.

Cada execução fica persistida em DB para histórico — o usuário pode reabrir relatórios passados sem precisar re-fetchar da Meta.

---

## Justificativa de Negócio

Hoje o time de mídia precisa abrir o dashboard, trocar PeriodSelector pra "30d", anotar números, comparar manualmente com o mês anterior e montar slides para reportar pra cliente. Isso consome tempo recorrente todo mês e introduz erros.

Um relatório auto-gerado em 1 click resolve:
- Reduz tempo de fechamento mensal de ~1h pra ~30s por conta
- Padroniza o que é reportado (todas as contas seguem o mesmo template)
- Cria histórico consultável (não precisa re-fetchar e re-calcular dados antigos)
- Link compartilhável facilita envio pra clientes/stakeholders externos

---

## Escopo v1

### Inclui
- Botão "Gerar relatório do mês" no dashboard de Instagram (project page + global)
- Endpoint que agrega snapshot de 1 mês completo e persiste em DB
- Página HTML do relatório com link compartilhável
- Listagem de relatórios passados por projeto
- Comparativo automático vs mês anterior
- 1 relatório por projeto (cobre todas as contas IG vinculadas) — cada conta como seção separada dentro do HTML

### Conteúdo do relatório (por conta IG)
- **Top 5 melhores posts** por engagement (likes+comments+saves) ÷ reach × 100
- **Top 5 melhores posts** por alcance (reach absoluto)
- **Top 5 piores posts** (mesmas métricas, ordem inversa)
- **Saldo de seguidores** — gained, lost, net + comparativo vs mês anterior
- **Totais agregados** — alcance total, views, interações, posts publicados
- **Distribuição por tipo de mídia** — Reels vs FEED vs Stories (count + reach)
- **Tendência diária** — gráfico de seguidores ganhos por dia + alcance por dia
- **Demografia da audiência** — idade, gênero, top 5 cidades, top 5 países
- **Comparativo vs mês anterior** — % delta em todas as métricas-chave

### Fora de escopo (v1)
- Stories no relatório — Meta apaga após 24h, exigiria cron diário (fora do escopo)
- Geração automática (cron mensal) — fica pra v2 se necessário
- Export PDF — fica pra v2
- Email/Slack delivery — fica pra v2
- Edição manual do relatório (notas, comentários do gestor) — fica pra v2
- Comparativo com benchmark de mercado — fora de escopo

---

## Stories

| Story | Título | Pontos | Depende de |
|-------|--------|--------|------------|
| 24.1 | Schema & Endpoint de Geração | 5 | — |
| 24.2 | Página HTML do Relatório | 8 | 24.1 |
| 24.3 | Trigger no Dashboard + Listagem de Histórico | 5 | 24.1, 24.2 |

24.2 e 24.3 podem rodar em paralelo após 24.1 estar Done. Total ~18 pts.

### ClickUp Tracking

| Item | Task ID | URL |
|------|---------|-----|
| Epic 24 | `86ah61r2m` | https://app.clickup.com/t/86ah61r2m |
| Story 24.1 | `86ah61r5y` | https://app.clickup.com/t/86ah61r5y |
| Story 24.2 | `86ah61r8v` | https://app.clickup.com/t/86ah61r8v |
| Story 24.3 | `86ah61rbq` | https://app.clickup.com/t/86ah61rbq |

---

## Premissas Técnicas

| Premissa | Implicação |
|----------|------------|
| `getMediaList` enriquece com reach/saved/engagement_rate (Story 23 backend) | Top 5 por engagement/alcance lê dessa fonte sem refetch |
| `follows_and_unfollows` no account-level (já fetchado por overview-cards) | Saldo de seguidores e tendência diária vêm daí |
| `getMediaInsights` pra cada post FEED retorna follows (PR #83 confirmou) | "Top posts por seguidores" é métrica adicional disponível |
| Demografia via `getAudienceDemographics` (já existe no service) | Reaproveitamos sem mudança |
| Snapshot é serializado em `data jsonb` no DB | Permite ler relatórios antigos sem re-fetchar Meta |

---

## Riscos & Mitigações

| Risco | Mitigação |
|-------|-----------|
| Geração demora 30s+ (muitas chamadas Graph API por conta) | Endpoint roda síncrono; UI mostra loading spinner com progresso. Cache 5min por post já existe. Eventualmente migrar pra job background (v2). |
| Rate limit Meta (200 reqs/h) durante geração | Pra projeto com muitas contas + muitos posts, pode estourar. Mitigar com retry exponencial + warning na UI. |
| Demografia pode não estar disponível pra contas com <100 seguidores | Pular seção quando ausente; relatório ainda fica útil sem demografia |
| Comparativo vs mês anterior precisa do relatório anterior persistido | 1ª geração mostra só dados do mês, sem comparativo; subsequentes comparam |
| Posts deletados no IG durante o mês entram com dados parciais | Snapshot guarda o que pegamos no momento da geração; documentar isso |

---

## Definição de Done (Epic-level)

- [ ] Schema migrado em PROD (`instagram_monthly_reports`)
- [ ] Endpoint `POST /reports/instagram/generate` agrega e persiste snapshot
- [ ] Endpoint `GET /reports/instagram/:reportId` retorna dados pra render
- [ ] Endpoint `GET /reports/instagram?projectId=...` lista relatórios passados
- [ ] Botão "Gerar relatório do mês" funcional no dashboard IG (project + global)
- [ ] Página HTML renderiza todas as seções com dados reais
- [ ] Link da página é compartilhável (auth Clerk valida acesso ao projeto)
- [ ] Comparativo vs mês anterior funciona (a partir do 2º relatório gerado)
- [ ] Typecheck + lint passing em api + web + shared
- [ ] Smoke test manual: gerar relatório de Abril/2026 da Fernanda Zapparoli, ver tudo populado
