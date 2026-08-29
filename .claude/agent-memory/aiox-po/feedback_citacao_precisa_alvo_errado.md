---
name: citacao-precisa-alvo-errado
description: Uma citação de código pode estar exata e mesmo assim apontar para algo que não faz o que a story diz — conferir o QUE o alvo contém, não só que ele existe
metadata:
  type: feedback
---

Numa story que manda "atualizar o comentário X" ou "seguir o padrão Y", verificar **o conteúdo do alvo**, não apenas se o arquivo/símbolo existe. Referência precisa e alvo errado são coisas diferentes de referência imprecisa.

**Why:** No gate da 46.2 as citações de linha estavam todas certas (`menu-de-abas.ts:165-166`, `stage-tabs-nav.tsx:159` verbatim) e mesmo assim duas instruções eram inexecutáveis:

1. A story mandava atualizar um comentário da 29.35 que dizia "imediatamente à direita de Meta Ads". Esse comentário **foi apagado pela própria story de que a 46.2 depende** (a 46.1 removeu os `TabsTrigger` de `page.tsx`). O que sobrou com o mesmo prefixo "Story 29.35" era sobre montagem condicional, continuava correto, e "atualizá-lo" estragaria doc boa.
2. A AC mandava dar afordância ao estado **inativo** "seguindo a variante `line` do shadcn". A variante existe — mas tudo o que ela define é o **ativo** (`after:opacity-100`); o inativo dela é `bg-transparent`/`border-transparent`, idêntico ao problema. Não havia padrão a copiar.

**How to apply:** Quando a story cita um comentário/padrão/decisão herdada: (a) `grep` pelo texto do comentário, não pelo número da story — o prefixo "Story N.N" reaparece em comentários que falam de outra coisa; (b) se a story depende de outra que mexeu no mesmo arquivo, comparar com `git show {commit-da-dependencia}~1:{path}` para saber se o alvo sobreviveu; (c) abrir a variante/util citada e conferir se ela cobre **o estado específico** que a AC pede. Ver [[ac-meio-impossivel]] e [[line-refs-drift-validation]].
