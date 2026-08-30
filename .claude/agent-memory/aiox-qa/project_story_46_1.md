---
name: story-46-1-menu-abas-hierarquico
description: Story 46.1 (menu de abas da etapa em 2 níveis + ?tab= na URL) — gate CONCERNS em 2026-08-29; QA-451-01 aberto e dependente da validação visual
metadata:
  type: project
---

Story 46.1 — os 14 `TabsTrigger` soltos de `stages/[stageId]/page.tsx` viraram config declarativa (`packages/web/lib/utils/menu-de-abas.ts`) + menu de 2 níveis (`components/funnels/stage-tabs-nav.tsx`), com a aba ativa em `?tab=`. Gate **CONCERNS**, Status Done, ClickUp `86ak7x5j0` em `ready to ship`.

**Why:** o dono do produto pediu em 2026-08-28 ("está muito comprida e pouco funcional"). O @po achou 1 bloqueador (AC7.1 — o `<PanoramaDoProjeto>` do early-return `semDados` da 44.21 tinha que FICAR; só o render normal migra) e a armadilha F3 (o vitest do web coleta `.test.ts` e não `.test.tsx`, então ícone como JSX faria o teste nascer morto). As duas foram atendidas.

**How to apply:**
- **QA-451-01 (medium, não reproduzido)** é o único achado vivo: a aba ativa vive em `useState` que sobrevive à troca de `stageId` no App Router, mas o `?tab=` só é lido num `useEffect` com deps `[]`. Navegando entre etapas pela sidebar (`components/layout/project-folder.tsx`), a tela fica na aba antiga e a URL não a descreve. Conserto = deps `[params.stageId]` + zerar o estado do clique. **Confirma ou cai na validação visual, que continua pendente** — não afirme que procede sem ter rodado o roteiro (etapa A → clicar NPS → trocar para B pela sidebar).
- O menu virou `<button>` e não `TabsTrigger` de propósito: dois grupos ("Dados", "Inácio") não têm aba própria, e reusar o `value` do primeiro filho geraria ids duplicados no Radix. Consequência: `aria-labelledby` do `TabsContent` fica pendurado e as setas do teclado não navegam mais. O conserto do NOME do painel é barato (`aria-label` por `TabsContent`) — o Dev Record diz que exigiria reescrita, e isso está exagerado.
- Contrato de URL: os 14 `value` antigos sobreviveram literalmente (`ga4` continua `ga4` com rótulo "Analytics"); o único novo é `panorama`.

Ver [[paridade-funcao-pura-e-render]] para a conferência que fechou a AC5.
