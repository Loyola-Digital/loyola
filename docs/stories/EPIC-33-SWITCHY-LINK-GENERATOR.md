# Epic 33 — Switchy Link Generator (Gerador de Links UTM em Lote + Encurtador)

**Status:** Draft
**Owner:** @pm (Morgan)
**Criado em:** 2026-06-10
**Estimativa:** 5 stories (33.1 → 33.5)

---

## Goal

Eliminar o trabalho manual de montar, um por um, os links de checkout rastreados (UTM) de cada canal de divulgação de um lançamento e depois encurtá-los à mão no painel do Switchy. Hoje, para cada lançamento, alguém cola a URL crua do checkout, anexa manualmente `utm_campaign/medium/source/term/content`, deriva o `sck`, repete isso para 7+ canais (bio, direct, stories, manychat, chatwoot, email, grupo) e encurta cada URL separadamente no Switchy — processo lento, repetitivo e propenso a erro de digitação no `sck`.

Esta epic cria uma aba **"Switch"** a **nível de PROJETO** onde o usuário cola **1 link de checkout cru** (sem track), escolhe uma **folder do Switchy**, digita o **utm_campaign** (ex: `fzl1`) e, opcionalmente, `utm_term`/`utm_content`. O sistema faz **fan-out** nos presets de canal do projeto (cada preset = um par `utm_medium` + `utm_source`), monta a URL completa de cada canal na ordem exata de params, encurta cada uma via **API REST do Switchy** dentro da folder escolhida (anexando os pixels do projeto), e devolve **N shortlinks** prontos para copiar. O histórico fica persistido no nosso banco.

## Por que agora

1. **A integração Switchy já existe READ-ONLY** — temos GraphQL client (`fetchSwitchyFolders`, `fetchSwitchyLinks`), rotas `GET folders`/`GET links` e hooks (`useSwitchyFolders`, `useSwitchyLinks`). Só falta a metade de **escrita + geração em lote** para fechar o ciclo.
2. **Token global já configurado** — `SWITCHY_API_TOKEN` já está no `.env` da API e exposto em `fastify.config`. Uma conta Switchy serve todos os projetos.
3. **Padrão de UTM já decodificado** — Lucas mapeou o modelo completo (7 presets de exemplo + regra do `sck` + ordem dos params) a partir de links reais de produção. Não há ambiguidade de spec.

## Modelo decodificado (presets + sck)

Base de exemplo: `https://pay.tmbeducacao.com.br/FernandaZapp/Y5B1006856G`

**7 presets de canal (defaults semeados por projeto):**

| Preset (label) | utm_medium | utm_source |
|---|---|---|
| bio | `bio` | `ig` |
| direct | `direct` | `ig` |
| stories | `stories` | `ig` |
| manychat | `automacao` | `manychat` |
| chatwoot | `disparo` | `chatwoot` |
| email | `email` | `mautic` |
| grupo | `grupo` | `whatsapp` |

**Constantes por batch (usuário define 1x):**
- `utm_campaign` — ex: `fzl1` — **OBRIGATÓRIO**, digitado
- `utm_term` — ex: `cpl` — **OPCIONAL**
- `utm_content` — ex: `org` — **OPCIONAL**

**Derivados automáticos:**
- `sck = [campaign, medium, source, term, content].filter(não-vazio).join("_")`
  - ex (bio): `fzl1_bio_ig_cpl_org`
  - ex (manychat): `fzl1_automacao_manychat_cpl_org`
- `vk_source` = sempre presente e **VAZIO**

**Ordem EXATA dos params na URL final:**
`utm_campaign`, `utm_medium`, `utm_source`, `utm_term`, `utm_content`, `sck`, `vk_source`

**Regras de montagem:**
- Se `term`/`content` vazios → **OMITIR** `utm_term`/`utm_content` da URL **E** excluí-los do `sck`.
- Preservar a querystring pré-existente da base (se a base já tem `?`, usar `&`).
- `encodeURIComponent` em todos os valores.

## Decisões travadas (Lucas validou)

| # | Decisão | Escolha | Razão |
|---|---|---|---|
| 1 | Token Switchy | **GLOBAL** (1 conta pra todos) — reusar `fastify.config.SWITCHY_API_TOKEN` | Sem tabela de credencial, sem criptografia, sem multi-conta |
| 2 | O que muda por projeto | **APENAS o PIXEL** — Meta (`platform=facebook`) + GTM (`platform=gtm`) | Guardar `pixels[]` por projeto e injetar em todo link gerado |
| 3 | Presets de canal | **EDITÁVEIS** por projeto, semeados com os 7 padrão (CRUD na aba) | Cada projeto pode ter canais diferentes |
| 4 | Geração | **Em LOTE** com toggles — todos os canais marcados por padrão, usuário pode desmarcar | Fan-out controlável |
| 5 | Aba "Switch" | **NOVA** e a nível de **PROJETO** | A `switchy-links-tab` existente (nível etapa / read-only) fica **intacta** |
| 6 | Histórico | **Persistir** os links gerados no nosso banco | Rastreabilidade + reuso |

## Stories

| # | Story | Resumo (1 linha) | Depende de |
|---|---|---|---|
| 33.1 | Schema + Migration | Cria as 3 tabelas (`project_switchy_settings`, `switchy_channel_presets`, `switchy_shortened_links`) em `schema.ts` + migration manual via node+pg, com FKs/índices/seed dos 7 presets. | — |
| 33.2 | REST client + URL builder | Estende `services/switchy.ts` com `createSwitchyLink` (POST REST `/links/create`, parse defensivo da response) e `buildTrackedCheckoutUrl` (ordem exata de params + `sck` + `vk_source` vazio + regra de omissão). | 33.1 |
| 33.3 | Rotas (settings/presets/generate/history) | Adiciona ao `routes/switchy.ts` (mesmo `fp` plugin) as rotas de settings (GET/PUT), presets (GET/POST/PUT/DELETE), `POST /generate` (fan-out → encurta → persiste, parcial OK) e `GET /links/history`, reusando `getProjectAccess` + guard guest. | 33.1, 33.2 |
| 33.4 | Aba Switch + config pixels + presets manager | Cria a aba "Switch" nível projeto (rota + entrada no nav), o painel de config (pixels Meta/GTM + toggle GDPR + defaults term/content) e o manager de presets (CRUD), estendendo `use-switchy.ts` com os hooks de settings/presets. | 33.3 |
| 33.5 | Generator + Results + Histórico | Cria o formulário gerador (checkout URL, select de folder, campaign obrigatório, term/content opcionais, checkboxes de canais), a tabela de resultados (canal/medium/source/short url/copiar) e a lista de histórico, com `useGenerateSwitchyLinks` + `useSwitchyHistory`. | 33.4 |

## Resumo do modelo de dados (3 tabelas)

Em `packages/api/src/db/schema.ts` (nomes e tipos EXATOS — copiar nas stories, não inventar variações):

**`project_switchy_settings`** (1 row por projeto — config de pixel + defaults)
- `id` uuid pk default `gen_random_uuid()`
- `project_id` uuid NOT NULL **UNIQUE** FK→`projects(id)` ON DELETE cascade
- `pixels` jsonb NOT NULL default `'[]'` — array de `{platform, value, title}`
- `show_gdpr` boolean NOT NULL default `false`
- `default_utm_term` varchar(120)
- `default_utm_content` varchar(120)
- `created_at` timestamptz default `now()` · `updated_at` timestamptz default `now()`
- index `idx_project_switchy_settings_project` em `(project_id)`

**`switchy_channel_presets`** (N por projeto — par medium+source editável; semear os 7 quando vazio)
- `id` uuid pk · `project_id` uuid NOT NULL FK→`projects(id)` ON DELETE cascade
- `label` varchar(120) NOT NULL
- `utm_medium` varchar(120) NOT NULL · `utm_source` varchar(120) NOT NULL
- `sort_order` int NOT NULL default `0` · `enabled` boolean NOT NULL default `true`
- `created_at` · `updated_at`
- index `idx_switchy_presets_project` em `(project_id)`

**`switchy_shortened_links`** (histórico de cada link gerado)
- `id` uuid pk · `project_id` uuid NOT NULL FK→`projects(id)` ON DELETE cascade
- `folder_id` varchar(64) NOT NULL · `folder_name` varchar(500)
- `checkout_base_url` text NOT NULL · `channel_label` varchar(120)
- `utm_campaign` varchar(120) · `utm_medium` varchar(120) · `utm_source` varchar(120)
- `utm_term` varchar(120) · `utm_content` varchar(120)
- `sck` text · `vk_source` text
- `full_url` text NOT NULL · `short_url` text
- `switchy_link_id` varchar(255) · `switchy_uniq` bigint
- `created_at` timestamptz default `now()`
- indexes em `project_id` e `created_at`

## Resumo da API

**Service** (`packages/api/src/services/switchy.ts` — ADICIONAR, mantendo o GraphQL existente):
- REST base = `https://api.switchy.io/v1` · header `Api-Authorization: <token global>` · `Content-Type: application/json`
- `createSwitchyLink(token, payload)` → POST `/links/create`, body `{ link: { url, domain (default hi.switchy.io), folderId(int), pixels:[{platform,value,title}], showGDPR(bool), tags?, note? }, autofill: false }`. Retorna o link criado (short url + uniq/id). **Parse defensivo:** aceitar `{link:{...}}` ou flat; logar raw em caso inesperado.
- `buildTrackedCheckoutUrl({ baseUrl, campaign, medium, source, term, content })` → string com a ordem exata + `sck` + `vk_source` vazio (regra de omissão de term/content).

**Rotas** (`packages/api/src/routes/switchy.ts` — ADICIONAR no mesmo `fp` plugin; reusar `getProjectAccess` + guard guest existentes):

| Método | Rota | Retorno / Ação |
|---|---|---|
| GET | `/api/projects/:projectId/switchy/settings` | `{ pixels, showGdpr, defaultUtmTerm, defaultUtmContent }` |
| PUT | `/api/projects/:projectId/switchy/settings` | upsert (bloquear guest) |
| GET | `/api/projects/:projectId/switchy/presets` | lista (semeia os 7 se vazio) |
| POST | `/api/projects/:projectId/switchy/presets` | cria (bloquear guest) |
| PUT | `/api/projects/:projectId/switchy/presets/:presetId` | atualiza (bloquear guest) |
| DELETE | `/api/projects/:projectId/switchy/presets/:presetId` | remove (bloquear guest) |
| GET | `/api/projects/:projectId/switchy/folders` | **JÁ EXISTE** (reusar) |
| POST | `/api/projects/:projectId/switchy/generate` | body `{ checkoutUrl, folderId, folderName, campaign, term?, content?, channels:[{label,medium,source}] }`; por canal: `buildTrackedCheckoutUrl` → `createSwitchyLink` (pixels do projeto + folderId + showGDPR) → persiste → retorna `{ results:[{label,medium,source,fullUrl,shortUrl,switchyLinkId,error?}] }`. **Falha por-canal não derruba o batch (parcial OK).** |
| GET | `/api/projects/:projectId/switchy/links/history` | últimos links gerados (do nosso banco) |

**Frontend** (`packages/web`):
- Estender `packages/web/lib/hooks/use-switchy.ts`: `useSwitchySettings`/`useSetSwitchySettings`, `useSwitchyPresets` + CRUD, `useGenerateSwitchyLinks`, `useSwitchyHistory` (padrão React Query + `useApiClient`, como já existe no arquivo).
- Componentes em `packages/web/components/switchy/` usando shadcn/ui (Input, Select, Label, Button, Card, Table, Skeleton) + lucide-react + sonner toast.

## O que já existe (reusar — NÃO recriar)

| Artefato | Caminho | Reuso |
|---|---|---|
| GraphQL client read-only | `packages/api/src/services/switchy.ts` | `fetchSwitchyFolders`, `fetchSwitchyLinks`, tipos `SwitchyFolder/Link/Pixel`. ADICIONAR REST ao lado, não substituir. |
| Rotas read-only | `packages/api/src/routes/switchy.ts` | `GET folders`, `GET links`, helpers `getSwitchyToken()` e `getProjectAccess()`. ADICIONAR no mesmo `fp` plugin. |
| Hooks read-only | `packages/web/lib/hooks/use-switchy.ts` | `useSwitchyFolders`, `useSwitchyLinks`. ESTENDER o arquivo. |
| Tab read-only (nível etapa) | `packages/web/components/funnels/switchy-links-tab.tsx` | Montada em `funnels/[funnelId]/stages/[stageId]/page.tsx`. **Fica INTACTA** — a nova aba é separada. |
| Token global | `packages/api/src/config/env.ts` → `fastify.config.SWITCHY_API_TOKEN` | Reusar; sem nova credencial. |
| Nav de projeto | `packages/web/components/layout/project-folder.tsx` → array `PROJECT_SUBITEMS` (linhas ~94-100) | Adicionar entrada `{ label: "Switch", href: "switch", icon }`; criar rota `packages/web/app/(app)/projects/[id]/switch/page.tsx`. |

## Escopo (OUT — fora desta epic)

- **Analytics/cliques** dos shortlinks (já há `switchy-links-tab` read-only pra isso)
- **Domínios custom/branded** (usa default `hi.switchy.io`)
- **Criação de folder** via API (folder é selecionada de folders existentes)
- **Pixels além de Meta/GTM** — TikTok fica fora (não está no enum documentado)
- **Multi-conta / token por projeto** (token é global)
- Edição/exclusão de shortlinks já gerados no Switchy
- Atualização (sync) do histórico contra o estado real do Switchy

## Dependências externas

- **`SWITCHY_API_TOKEN`** (já no `.env` da API, exposto em `fastify.config`)
- API REST do Switchy: `https://api.switchy.io/v1` (header `Api-Authorization`)
- GraphQL do Switchy: `https://graphql.switchy.io/v1/graphql` (já usado pelo read-only)

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Shape da response do `POST /links/create` não 100% documentado | M | Parse defensivo (`{link:{...}}` ou flat), logar raw quando inesperado, retornar `error` por-canal sem derrubar o batch |
| Erro de montagem do `sck` / ordem de params quebra o tracking | H | Regra travada no `buildTrackedCheckoutUrl` + testes unitários cobrindo omissão de term/content e querystring pré-existente |
| Rate limit / falha do Switchy em batch grande | M | Geração por-canal independente (parcial OK) + erro claro por canal no UI |
| Token global rotacionado / sem permissão de escrita | M | Mensagem de erro clara no UI + erro 502 padronizado nas rotas |
| Guest editar settings/presets/gerar | M | Guard guest já existente reaplicado em todas as rotas de escrita |
| Pixel errado injetado em todos os links | M | Config de pixel por projeto isolada (`project_switchy_settings`), validação de formato (Meta ID numérico, GTM `GTM-XXXX`) no front |

## Métricas de sucesso

- Gerar os 7+ shortlinks de um lançamento em **< 1min** (vs vários minutos manuais)
- **Zero** erro de digitação no `sck` (derivação automática)
- Histórico persistido permite reabrir/copiar links de qualquer lançamento sem voltar ao Switchy
- A aba read-only de cliques (nível etapa) continua funcionando sem regressão

## Change Log

| Data | Quem | Mudança |
|---|---|---|
| 2026-06-10 | @pm Morgan | Epic criado, modelo decodificado e 6 decisões validadas com Lucas; 5 stories definidas |
