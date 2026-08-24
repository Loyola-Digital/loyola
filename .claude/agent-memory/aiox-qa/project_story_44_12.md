---
name: project-story-44-12
description: Story 44.12 (produtor de CoberturaDiaria) gate CONCERNS — 3 bloqueantes; backfill já rodou em produção antes do deploy da API, o que arma um regresso silencioso
metadata:
  type: project
---

Gate **CONCERNS** em 2026-08-19 · `docs/qa/gates/44.12-produtor-de-cobertura-diaria.yml` · branch `feature/44.12-cobertura-diaria`, 13 commits locais, nada pushado.

**Bloqueantes:** QA-4412-01 (o fio `calcularTetos(..., {coberturaDaEtapa})` sem nenhum teste — ver [[reversao-no-fio-nao-na-biblioteca]]), QA-4412-03 (`leadsSemData` só é declarado quando a série está vazia; no caso misto a guarda roda sobre série truncada em silêncio), QA-4412-05 (8 artefatos `" 2"` commitados em `5a1189be`).

**Why:** duas coisas desta story continuam valendo depois que ela fechar.

1. **O backfill foi rodado contra produção com código que só existe na branch.** Enquanto a API deployada não tiver este código, o sync diário **reescreve** os caches `leads-origin` sem `coberturaDiaria` e desliga a guarda de novo nas 11 etapas. Deploy não é opcional nem pode atrasar.
2. **`funnel_surveys.column_mapping` grava a coluna de data em `timestamp`, e o sync procura `date`.** Antes desta story os dois ramos de pesquisa devolviam `columnMapping: null` — o mapeamento feito pelo painel nunca era lido. Só `timestamp` e `utm_content` passaram a ser promovidos; `email`, `phone`, `utm_source`, `utm_medium` e `utm_term` seguem no alias **de propósito** (mudariam dedup e classificação Pago/Orgânico de caches já publicados).

**How to apply:** ao revisar qualquer story que toque `lead-origin-sync.ts`, lembrar que o payload `leads-origin` é servido **inteiro** pelo endpoint público `GET /api/public/v1/projects/:projectId/stages/:stageId/leads-origin` — mexer em resolução de coluna muda `range`, `topUtm.*` e `columnsResolved.*` num contrato externo. E que só 2 das 5 chaves da fronteira têm teste travando (`utm_source` e `email`); `phone`/`utm_medium`/`utm_term` estão livres.

Duas etapas do BBE seguem em `indisponivel` aguardando mapeamento **pelo painel** (decisão de não escrever direto no banco) — não é débito de código.
