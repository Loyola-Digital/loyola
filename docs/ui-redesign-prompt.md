# Loyola Digital X — Master UI Prompt for AI Frontend Tools

> Use este prompt no **v0.dev**, **Lovable**, **Bolt** ou similar para gerar o redesign completo da UI.
> Gerado por @ux-design-expert (Uma) em 2026-03-14.

---

## PROMPT (copie tudo abaixo)

```
You are redesigning "Loyola Digital X" — an internal AI platform where employees of a digital marketing agency (Loyola Digital) interact with AI-cloned expert minds (like Alex Hormozi, Gary Vee, etc.) to get strategic advice, analyze ClickUp projects, and delegate tasks.

## TECH STACK (DO NOT CHANGE)
- Next.js 15 (App Router) with React 19
- TypeScript strict mode
- Tailwind CSS v4 (CSS-based config, NOT tailwind.config.ts)
- shadcn/ui (new-york style, Radix UI primitives)
- Lucide React icons
- Zustand for UI state
- TanStack Query v5 for server state
- Clerk for authentication (@clerk/nextjs)
- react-markdown + remark-gfm for chat rendering

## BRAND IDENTITY
- **Company:** Loyola Digital (digital marketing agency)
- **Primary Color (Gold):** hsl(47 98% 54%) light / hsl(47 98% 58%) dark
- **Dark Background:** hsl(0 0% 7%) — premium dark aesthetic
- **Card Background:** hsl(0 0% 10%)
- **Text:** hsl(40 15% 93%) on dark
- **Accent:** Gold tints for highlights, selections, focus rings
- **Logo:** SVG with gold geometric "L" mark + "LOYOLA" text in light gray
- **Aesthetic:** Premium, sophisticated, dark-first. Think Linear, Vercel, Raycast — NOT generic SaaS

## DESIGN SYSTEM TOKENS (already configured in globals.css)
All components MUST use these CSS custom properties, never hardcode colors:
- `--color-primary` / `--color-primary-foreground` (Gold)
- `--color-background` / `--color-foreground`
- `--color-card` / `--color-card-foreground`
- `--color-muted` / `--color-muted-foreground`
- `--color-accent` / `--color-accent-foreground`
- `--color-border`, `--color-input`, `--color-ring`
- `--color-destructive` / `--color-destructive-foreground`
- `--color-brand` / `--color-brand-hover` / `--color-brand-muted`
- `--color-success`, `--color-warning`, `--color-info` + foregrounds
- `--color-sidebar-*` variants
- `--radius: 0.625rem`
- Dark mode is DEFAULT (class="dark" on html)

## APP STRUCTURE & PAGES TO DESIGN

### Page 1: Minds Catalog (`/minds`) — MAIN DASHBOARD
This is the landing page. Shows all available AI minds organized by squad.

**Current state (needs improvement):**
- Basic grid of cards with avatar, name, specialty, tags
- Simple search input at top
- Squads shown as sections with header

**Redesign requirements:**
- Hero section with a compelling headline like "Sua equipe de especialistas em IA" and a subtle gold gradient
- Search bar should be prominent, centered, with keyboard shortcut hint (Cmd+K)
- Mind cards should feel premium: subtle border glow on hover, glass-morphism effect, show mind's avatar (colored circle with initials), name, specialty one-liner, and 2-3 tags
- Squad sections with clear visual hierarchy — squad name, description, mind count
- Empty state for search with helpful suggestions
- Grid: 1 col mobile, 2 cols tablet, 3-4 cols desktop
- Add a "Featured Mind" or "Trending" section at the top
- Smooth hover animations (scale 1.02, border color transition)

### Page 2: Mind Profile (`/minds/[mindId]`)
Detail page for a single mind before starting a conversation.

**Current state (needs improvement):**
- Large avatar, name, squad, specialty
- Bio text block
- Frameworks list, communication style
- Statistics cards
- "Iniciar Conversa" button

**Redesign requirements:**
- Split layout: left side with avatar (large, with gold ring border), name, squad badge, specialty, and CTA button; right side with tabbed content
- Tabs: "Sobre" (bio + frameworks), "Estilo" (communication style, tone, vocabulary), "Stats" (conversation count, artifacts, response time)
- The CTA "Iniciar Conversa" should be the most prominent element — large, gold, with an arrow icon
- Show recent conversations with this mind (if any) below the tabs
- Breadcrumb navigation: Minds > [Squad Name] > [Mind Name]
- Add a "capabilities" section showing what this mind can do (e.g., "Analisa campanhas no ClickUp", "Cria estrategias de conteudo")

### Page 3: Chat Interface (`/minds/[mindId]/chat`) — MOST IMPORTANT PAGE
This is where users spend 80% of their time. Must be world-class.

**Current state (needs improvement):**
- Basic message bubbles (user right, assistant left)
- Simple text input at bottom
- Sidebar with conversation history
- Thinking indicator (steps with spinners)
- Task suggestion cards inline

**Redesign requirements:**
- **Message area:**
  - User messages: right-aligned, gold/primary background, rounded-2xl with tail
  - Assistant messages: left-aligned, card background, with mind avatar (small) next to first message in a group
  - Markdown rendering with syntax highlighting for code blocks
  - Smooth scroll-to-bottom with a "scroll to bottom" floating button when scrolled up
  - Message timestamps on hover (not always visible)
  - Copy button on assistant messages (hover-revealed)

- **Thinking indicator (Chain of Thought):**
  - When the AI is using tools (ClickUp, etc.), show a collapsible "thinking" section
  - Similar to Claude's thinking UI: a subtle container with steps
  - Each step shows: icon (based on tool), label, status (spinner → checkmark)
  - Should auto-collapse when the text response starts arriving
  - Smooth height animation

- **Chat input:**
  - Full-width textarea at the bottom with a premium feel
  - Auto-expanding (max 5 lines)
  - Send button (gold, circular) on the right
  - Placeholder: "Mensagem para [Mind Name]..."
  - Keyboard hint: "Enter para enviar, Shift+Enter para nova linha"
  - File attachment button (future, disabled for now)
  - Character count (subtle, only appears near limit)

- **Chat sidebar (left):**
  - Conversation list grouped by date (Hoje, Ontem, Semana passada, etc.)
  - Each item: title (first message truncated), relative time, message count
  - Active conversation highlighted with gold left border
  - "Nova Conversa" button at top (gold outline)
  - Collapsible on desktop, sheet drawer on mobile
  - Quick actions section at bottom showing recent tasks created from this mind

- **Task suggestion cards:**
  - When the AI detects a task, show a SUBTLE inline card (not a big popup)
  - Small, elegant: task title, priority dot, two small buttons (Create, Dismiss)
  - After creation: show a green checkmark and "Criada no ClickUp" with link
  - Should NOT spam — only appears when AI explicitly suggests via ```json:task block

### Page 4: Conversations List (`/conversations`)
Browse all past conversations across all minds.

**Redesign requirements:**
- List view (not grid) with conversation cards
- Each card: mind avatar, conversation title, mind name, last message preview (truncated), relative time, message count badge
- Filter bar: search + mind filter dropdown
- Empty state: "Nenhuma conversa ainda. Comece conversando com uma mente!"
- Pagination or infinite scroll
- Sort: most recent first

### Page 5: Tasks Dashboard (`/tasks`)
View all tasks created from AI conversations.

**Redesign requirements:**
- Kanban-style board with columns: Pendente, Em Andamento, Revisao, Concluido
- Each task card: title, priority indicator (color dot), mind that suggested it, creation date
- Alternative: list view with status filters as tabs
- Link to ClickUp for each task (external link icon)
- Empty state with illustration
- Filter by status, mind, priority

### Page 6: Auth Pages (`/sign-in`, `/sign-up`)
**Redesign requirements:**
- Centered card layout with Loyola logo above
- Dark background with subtle gold gradient or pattern
- Clerk components styled to match brand (use Clerk's appearance prop)
- "Powered by Loyola Digital" footer text

## LAYOUT & NAVIGATION

### Sidebar (Desktop):
- Width: 240px expanded, 64px collapsed
- Logo at top (full when expanded, icon when collapsed)
- Nav items: Minds (Brain icon), Conversations (MessageSquare), Tasks (CheckSquare)
- Active item: gold left border + accent background
- Collapse toggle button at bottom
- User section at very bottom: small avatar, name (when expanded)
- Background: slightly darker than main content

### Topbar:
- Height: 56px (h-14)
- Left: hamburger menu (mobile only) + breadcrumb or page title
- Right: notification bell (future, disabled), user avatar (Clerk UserButton)
- Subtle bottom border

### Mobile:
- Sidebar becomes a slide-out drawer (Sheet component)
- Bottom navigation bar alternative consideration
- Chat input should be keyboard-aware (push up with virtual keyboard)

## MICRO-INTERACTIONS & POLISH
- All transitions: 200ms ease with Tailwind's transition classes
- Hover effects on cards: scale(1.02), border-color transition to gold
- Focus rings: gold colored (ring-ring)
- Loading skeletons for all data-fetching states
- Smooth page transitions
- Toast notifications for actions (task created, conversation deleted)
- Gold selection highlight on text (already in globals.css)

## ACCESSIBILITY (WCAG AA)
- All interactive elements need proper focus states
- Color contrast ratio >= 4.5:1 for text
- aria-labels on icon-only buttons
- Keyboard navigation for all flows
- Screen reader support for chat messages

## CONSTRAINTS — DO NOT:
- Do NOT change the tech stack
- Do NOT use any colors outside the design token system
- Do NOT create new pages beyond the 6 listed
- Do NOT add backend logic — only UI components
- Do NOT use libraries not in package.json (no framer-motion, no custom icon packs)
- Do NOT use tailwind.config.ts — Tailwind v4 uses CSS-based config
- Keep all components in the following structure:
  - `components/ui/` — atomic shadcn components
  - `components/layout/` — sidebar, topbar
  - `components/minds/` — mind-related components
  - `components/chat/` — chat-related components
  - `components/conversations/` — conversation list components
  - `components/tasks/` — task-related components

## WHAT TO GENERATE
Generate the complete React/TypeScript code for each page and component. For each component:
1. Use "use client" directive when using hooks/interactivity
2. Use shadcn/ui primitives (Button, Card, Badge, etc.)
3. Use Tailwind CSS classes only (no inline styles)
4. Use the cn() utility from @/lib/utils for conditional classes
5. Use Lucide React for all icons
6. Make it fully responsive (mobile-first)
7. Include proper TypeScript types

Start with the Minds Catalog page (/minds) as it's the landing page, then proceed to the Chat interface as it's the most critical page.
```

---

## Como Usar Este Prompt

### Opcao 1: v0.dev (Vercel)
1. Acesse [v0.dev](https://v0.dev)
2. Cole o prompt acima
3. Itere por pagina: comece com `/minds`, depois `/minds/[mindId]/chat`
4. Exporte o codigo gerado

### Opcao 2: Lovable
1. Crie um novo projeto no Lovable
2. Cole o prompt como instrucao inicial
3. Ajuste iterativamente

### Opcao 3: Bolt.new
1. Abra bolt.new
2. Cole o prompt
3. Selecione Next.js como framework

### Depois de Gerar
1. Use `@ux-design-expert *scan` para analisar o artefato gerado
2. Use `@sm *draft` para criar stories de implementacao
3. Use `@dev *develop` para implementar

---

*Gerado por Uma (UX-Design Expert) — desenhando com empatia 💝*
