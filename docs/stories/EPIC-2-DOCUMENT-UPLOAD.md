# EPIC-2: Upload de Documentos como Contexto no Chat

> Permitir que usuários anexem documentos (.txt, .docx, .pdf) às mensagens do chat, fornecendo contexto rico para as minds.

**Status:** Active
**Created:** 2026-03-16
**Author:** Morgan (PM Agent)
**Product:** Loyola Digital X
**Parent:** EPIC-1

---

## Epic Goal

Permitir que usuários da Loyola Digital X anexem documentos de texto às conversas com minds, extraindo automaticamente o conteúdo e injetando como contexto. Os documentos ficam salvos na conversa para referência futura.

## Business Value

- Usuários não precisam copiar/colar documentos manualmente
- Minds recebem contexto completo para análises mais precisas
- Casos de uso: briefings, contratos, relatórios, referências técnicas

## Epic Scope

**In Scope (MVP):**
- Upload de `.txt`, `.docx`, `.pdf` via chat input
- Extração de texto no backend (mammoth para docx, pdf-parse para pdf)
- Texto extraído salvo como parte da mensagem na conversa
- Preview do arquivo anexado antes de enviar
- Limite: 1 arquivo por mensagem, max 200KB de texto extraído
- Google Docs: via export manual como .docx

**Out of Scope (Fase 2+):**
- Upload de imagens/screenshots (vision API)
- Google Docs API direta (OAuth)
- Múltiplos arquivos simultâneos
- OCR de PDFs escaneados
- Storage permanente de arquivos (S3/R2)
- Busca semântica em documentos

## Technical Approach

### Backend
- `@fastify/multipart` para receber arquivos via multipart/form-data
- Novo endpoint `POST /api/upload` que extrai texto e retorna
- Libs: `mammoth` (docx→text), `pdf-parse` (pdf→text)
- Texto extraído retornado ao frontend, que envia junto com a mensagem no chat

### Frontend
- Botão paperclip no `chat-input.tsx`
- Input file hidden com accept=".txt,.docx,.pdf"
- Preview chip mostrando nome + tamanho do arquivo
- Ao enviar: POST /api/upload → texto extraído → POST /api/chat com texto prefixado

### Database
- Campo `metadata` da tabela `messages` já suporta jsonb — adicionar `attachments` array
- Cada attachment: `{ filename, mimeType, textLength, extractedPreview }`
- Texto completo do documento fica no `content` da mensagem (prefixado)

## Stories

| ID | Título | Escopo |
|----|--------|--------|
| 2.1.1 | Upload endpoint + text extraction | Backend: multipart, mammoth, pdf-parse |
| 2.1.2 | Chat input com file attachment UI | Frontend: botão clip, preview, integração |

## Success Metrics

- Usuário consegue anexar .txt/.docx/.pdf e mind responde com contexto do documento
- Texto extraído aparece na mensagem salva (referência futura)
- Upload + extração < 3 segundos para arquivos até 200KB

## Dependencies

- EPIC-1 Stories 1.2.2 (Chat SSE) e 1.5.1 (Chat UI) — já implementadas
- Novas dependências npm: `@fastify/multipart`, `mammoth`, `pdf-parse`
