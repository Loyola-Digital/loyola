# Team Members & Scopes

Este documento define os integrantes do time que trabalham neste repositório e o **escopo** (áreas do código) em que cada um está autorizado a fazer alterações.

A IA do AIOX (Claude Code) consulta este arquivo automaticamente no início de cada sessão para identificar o usuário via `git config user.email` e aplicar as restrições de escopo conforme as regras em `.claude/rules/team-scopes.md`.

---

## Convenções

- **email:** identificador único (match exato com `git config user.email`)
- **scope:** `full` (sem restrição) ou `restricted` (lista de paths permitidos)
- **allowed_paths:** array de glob patterns — o usuário só pode editar arquivos que batam com esses padrões
- **readonly_paths:** (opcional) paths que o usuário pode LER mas não editar — omitido significa "pode ler tudo, editar só o allowed"

---

## Members

### Lucas Vital — Founder / Full-stack

- **email:** `lucasvitalsilva17@gmail.com`
- **role:** Fundador da Loyola Digital, responsável por todo o produto
- **scope:** `full`
- **allowed_paths:** `**/*` (sem restrição)

### Danilo — Traffic Specialist

- **email:** `danilo@bonsaitrafegopago.com.br`
- **role:** Especialista em tráfego pago (Meta Ads, Google Ads, YouTube Ads) — trabalha exclusivamente nos dashboards de tráfego
- **scope:** `restricted`
- **allowed_paths:**
  - `packages/web/app/(app)/traffic/**`
  - `packages/web/app/(app)/projects/[id]/traffic/**`
  - `packages/web/app/(app)/settings/traffic/**`
  - `packages/web/components/funnels/**`
  - `packages/web/lib/hooks/use-traffic-analytics.ts`
  - `packages/web/lib/formulas/meta-ads.ts`
  - `packages/web/lib/formulas/funnels.ts`
  - `packages/web/lib/formulas/youtube-ads.ts`
  - `packages/api/src/routes/traffic-analytics.ts`
  - `packages/api/src/routes/meta-ads.ts`
  - `packages/api/src/services/traffic-analytics.ts`
  - `packages/api/src/services/meta-ads.ts`
  - `docs/stories/*traffic*.md`
  - `docs/stories/*meta-ads*.md`
  - `docs/stories/*youtube*.md`
  - `docs/stories/*funnel*.md`
  - `docs/qa/gates/*traffic*.yml`
  - `docs/qa/gates/*meta*.yml`
  - `docs/qa/gates/*funnel*.yml`
  - `docs/qa/gates/*youtube*.yml`
- **notes:**
  - Pode ler todo o repositório (necessário pra entender dependências)
  - Se precisar tocar arquivo fora do scope, deve pedir autorização explícita ao Lucas e documentar o motivo no commit
  - Para criação de story/epic nova relacionada a tráfego: OK criar em `docs/stories/`
  - Git push e PR creation seguem fluxo normal via @devops
