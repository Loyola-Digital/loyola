# POC — Zoom Meeting Participants (retenção)

**Status:** Ready
**Tipo:** Proof of Concept (descartável se não validar)
**Estimate:** XS

---

## Objetivo

Validar end-to-end que conseguimos:
1. Autenticar via Server-to-Server OAuth da Zoom
2. Buscar participantes de uma reunião encerrada
3. Mostrar nome / email / join time / leave time / duração (retenção)

Sem criar tabelas no DB nem persistir credenciais — POC pura. Se funcionar e o time aprovar, viramos epic formal com schema + integração no padrão Loyola (Meta/Google/Instagram).

---

## Escopo

**IN:**
- 1 rota backend `POST /api/zoom-poc/participants` que recebe credenciais + meetingId no body, gera token e retorna lista
- 1 página frontend `/zoom-poc` com formulário (Account ID, Client ID, Client Secret, Meeting UUID) + tabela de resultado
- Tratamento de erros (auth fail, meeting não existe, rate limit)

**OUT:**
- Schema/persistência de credenciais
- Listagem de reuniões (só consulta uma específica por UUID)
- Webinar Reports (só meetings nessa POC)
- Polls / Q&A
- Vínculo a etapas de funil

---

## Acceptance Criteria

1. Rota `POST /api/zoom-poc/participants` aceita body `{ accountId, clientId, clientSecret, meetingId }` e retorna `{ participants: ZoomParticipant[] }` ou erro 4xx/5xx legível
2. Token OAuth é gerado a cada request (sem cache nessa POC)
3. Tela `/zoom-poc` tem formulário + tabela; ao submeter, chama a rota e exibe resultado
4. Duração é formatada em formato humano (ex: "1h 23min" em vez de "5012 segundos")
5. Erro de rate limit / auth / meeting-not-found mostra toast/mensagem clara
6. Funciona com **meeting UUID válido de uma conta Zoom Pro+**

---

## Tasks

- [ ] Backend: `packages/api/src/routes/zoom-poc.ts` com POST de participants
- [ ] Registrar rota em `packages/api/src/app.ts`
- [ ] Frontend: `packages/web/app/(app)/zoom-poc/page.tsx` com form + tabela
- [ ] Typecheck + lint OK
- [ ] Testar manual com credenciais reais (Lucas tem conta Zoom?)

---

## Decisão técnica

- **Server-to-Server OAuth** (sem refresh token, sem user consent)
- Token gerado via `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=X` com Basic Auth `client_id:client_secret`
- Endpoint Zoom: `GET /v2/report/meetings/{meetingUUID}/participants`
- URL-encode 2x do meetingUUID se contém `/` ou `==`

## Change Log
- 2026-05-09: POC criada e implementada por @sm + @dev em modo full-auto
