# EPIC-15: Cross-Mind Consultation

## Objetivo

Permitir que um Mind consulte outros Minds durante uma conversa. O usuario digita `/` no chat, seleciona um Mind da lista, e o Mind atual faz uma consulta interna ao Mind selecionado, trazendo a resposta combinada.

## Contexto

Hoje os Minds operam isoladamente — cada conversa é com um Mind especifico. Com cross-mind consultation, o Mind do Netao pode consultar o Mind do Hormozi sobre ofertas, o Mind do Brunson sobre funis, etc, tudo dentro da mesma conversa.

### Fluxo do Usuario

```
1. Usuario esta no chat do Mind "Netao"
2. Digita "/" no input → aparece lista de Minds disponiveis
3. Seleciona "Hormozi" → insere "/hormozi" no texto
4. Envia mensagem: "Como melhorar minha oferta? /hormozi"
5. Backend detecta "/hormozi", consulta o Mind Hormozi internamente
6. Mind Netao recebe a resposta do Hormozi como contexto
7. Netao responde combinando seu conhecimento + insight do Hormozi
8. Na conversa aparece card visual mostrando que Hormozi foi consultado
```

### Arquitetura Tecnica

- **Mind Engine**: ja tem `buildPrompt(mindId, tier)` que monta system prompt de qualquer Mind
- **Claude Service**: ja tem `agentLoop()` com suporte a tools
- **Chat Tools**: adicionar tool `consult_mind` que internamente chama `claude.stream()` com o prompt do Mind consultado
- **Chat Input**: adicionar autocomplete com `/` que lista Minds do registry

## Stories

| # | Story | Descricao | Tamanho |
|---|-------|-----------|---------|
| 15.1 | Backend: tool consult_mind | Nova tool no chat-tools que consulta outro Mind via Mind Engine | L |
| 15.2 | Frontend: / autocomplete no chat input | Detectar `/` no input e mostrar lista filtravel de Minds | M |
| 15.3 | Frontend: card de consulta na conversa | Exibir visualmente quando um Mind foi consultado (nome, resposta resumida) | S |

## Dependencias

- Mind Registry (ja existe — lista todos os Minds)
- Mind Engine / Prompt Builder (ja existe — monta prompts)
- Claude Service (ja existe — agentLoop + stream)
- Chat Tools (ja existe — sistema de tools)

## Status: Draft
