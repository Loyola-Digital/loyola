/**
 * Story 45.1 — a árvore de abas da etapa, como dado.
 *
 * Antes desta story os 14 gatilhos eram JSX literal dentro de `page.tsx`
 * (`:540-619`), e a única forma de saber quais abas existem numa etapa era ler
 * 80 linhas de `&&` encadeado. Aqui a árvore vira configuração, e a montagem
 * vira uma função pura — que é o que o teste consegue alcançar.
 *
 * ⚠️ Este arquivo é `.ts` e NÃO contém JSX, de propósito. O runner do
 * `packages/web` tem `include: ["lib/utils/**\/*.test.ts"]` — a extensão é
 * `.ts`, não `.tsx`. Se a config carregasse ícone como elemento
 * (`icon: <TrendingUp />`), o módulo e o teste virariam `.tsx`, o vitest não os
 * coletaria, e a suíte ficaria verde sem ter rodado nada. Por isso o ícone é
 * guardado como REFERÊNCIA de componente (`icon: TrendingUp`) e só é
 * instanciado na camada de render.
 */

import {
  BarChart3,
  Brain,
  Database,
  FileBarChart2,
  FileSpreadsheet,
  FlaskConical,
  GitBranch,
  Link2,
  Mail,
  Sparkles,
  Star,
  Table as TableIcon,
  Target,
  TrendingUp,
  Youtube,
  type LucideIcon,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

/** Contadores que aparecem como pílula ao lado do rótulo. */
export type BadgeDeAba = "meta" | "youtube";

export type ItemDeAba = {
  /**
   * Contrato de URL. Escolhido uma vez, não se mexe — a lição do `0870c2a2`,
   * em que o rótulo mudou e o value ficou (por isso "Analytics" é `ga4`).
   */
  value: string;
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
  badge?: BadgeDeAba;
};

export type GrupoDeAbas = {
  id: string;
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
  /**
   * A aba do próprio pai, quando ele tem conteúdo (Meta Ads, YouTube Ads,
   * Relatórios). `null` quando o pai é só rótulo (Dados, Inácio) — nesse caso
   * ativá-lo abre o primeiro filho.
   */
  proprio: ItemDeAba | null;
  filhos: ItemDeAba[];
};

export type ContextoDeAbas = {
  funnelType: string | null | undefined;
  ehCaptacaoPagaStage: boolean;
  /** Resultado de `classificarFamilia(stage.stageType)` — `null` = fora da aba. */
  familiaCadeiaCac: "paga" | "gratuita" | null;
};

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

export const ABA_PADRAO = "meta-ads";

const META_ADS: ItemDeAba = {
  value: "meta-ads",
  label: "Meta Ads",
  icon: TrendingUp,
  badge: "meta",
};

/** Story 29.35 — só no perpétuo; lançamento tem outro dashboard e outra matemática. */
const ANALISE_MVP: ItemDeAba = {
  value: "analise-mvp",
  label: "Análise MVP",
  icon: Target,
  iconClassName: "text-primary",
};

const META_ADS_TESTE: ItemDeAba = {
  value: "meta-ads-teste",
  label: "Meta Ads TESTE",
  icon: FlaskConical,
  iconClassName: "text-cyan-400",
};

const YOUTUBE_ADS: ItemDeAba = {
  value: "youtube-ads",
  label: "YouTube Ads",
  icon: Youtube,
  iconClassName: "text-red-500",
  badge: "youtube",
};

/**
 * As oito fontes que antes disputavam o primeiro nível com o dashboard onde o
 * operador passa o dia. A ordem é a de antes — agrupar não é reordenar.
 */
const ABAS_DE_DADOS: ItemDeAba[] = [
  { value: "surveys", label: "Pesquisas", icon: FileSpreadsheet, iconClassName: "text-green-600" },
  { value: "spreadsheets", label: "Planilhas", icon: TableIcon, iconClassName: "text-blue-600" },
  { value: "switchy-links", label: "Links", icon: Link2, iconClassName: "text-purple-600" },
  { value: "lead-scoring", label: "Lead Scoring", icon: Brain, iconClassName: "text-primary" },
  { value: "organic-media", label: "Mídias Orgânicas", icon: Sparkles, iconClassName: "text-amber-500" },
  { value: "mautic", label: "Mautic", icon: Mail, iconClassName: "text-primary" },
  // "Analytics", e não "GA4": a aba serve as duas fontes, e o projeto que usa
  // Plausible não lê GA4 nenhum. O `value` continua "ga4" — ver ItemDeAba.value.
  { value: "ga4", label: "Analytics", icon: BarChart3, iconClassName: "text-orange-500" },
  { value: "nps", label: "NPS", icon: Star, iconClassName: "text-yellow-500" },
];

const CADEIA_CAC: ItemDeAba = {
  value: "cadeia-cac",
  label: "Cadeia de CAC",
  icon: GitBranch,
  iconClassName: "text-cyan-600",
};

/** Story 45.1 — o único `value` novo. */
const PANORAMA: ItemDeAba = {
  value: "panorama",
  label: "Panorama",
  icon: Target,
  iconClassName: "text-cyan-600",
};

const RELATORIOS: ItemDeAba = {
  value: "relatorios",
  label: "Relatórios",
  icon: FileBarChart2,
  iconClassName: "text-primary",
};

// ─────────────────────────────────────────────────────────────
// Montagem
// ─────────────────────────────────────────────────────────────

/**
 * A árvore de abas desta etapa, já filtrada pela elegibilidade.
 *
 * As três condições preservam, sem mudança de regra, o que o `page.tsx` fazia
 * com `&&` inline: `analise-mvp` só no perpétuo, `meta-ads-teste` só em
 * lançamento de captação paga, `cadeia-cac` só quando a família não é `null`.
 */
export function montarMenuDeAbas(ctx: ContextoDeAbas): GrupoDeAbas[] {
  const filhosDeMetaAds: ItemDeAba[] = [];
  if (ctx.funnelType === "perpetual") filhosDeMetaAds.push(ANALISE_MVP);
  if (ctx.funnelType === "launch" && ctx.ehCaptacaoPagaStage) filhosDeMetaAds.push(META_ADS_TESTE);

  // Story 44.9 — família `null` (lyrio/comercial/debriefing) não ganha aba
  // vazia: não ganha aba. O Panorama vive no mesmo escopo, então o grupo
  // inteiro some junto (o filtro de grupo vazio no fim desta função).
  const filhosDeInacio: ItemDeAba[] = ctx.familiaCadeiaCac !== null ? [CADEIA_CAC, PANORAMA] : [];

  const grupos: GrupoDeAbas[] = [
    {
      id: "meta-ads",
      label: META_ADS.label,
      icon: META_ADS.icon,
      proprio: META_ADS,
      filhos: filhosDeMetaAds,
    },
    {
      id: "youtube-ads",
      label: YOUTUBE_ADS.label,
      icon: YOUTUBE_ADS.icon,
      iconClassName: YOUTUBE_ADS.iconClassName,
      proprio: YOUTUBE_ADS,
      filhos: [],
    },
    {
      id: "dados",
      label: "Dados",
      icon: Database,
      iconClassName: "text-muted-foreground",
      proprio: null,
      filhos: ABAS_DE_DADOS,
    },
    {
      id: "inacio",
      label: "Inácio",
      icon: GitBranch,
      iconClassName: "text-cyan-600",
      proprio: null,
      filhos: filhosDeInacio,
    },
    {
      id: "relatorios",
      label: RELATORIOS.label,
      icon: RELATORIOS.icon,
      iconClassName: RELATORIOS.iconClassName,
      proprio: RELATORIOS,
      filhos: [],
    },
  ];

  // Grupo sem conteúdo próprio E sem filhos elegíveis não é um grupo vazio na
  // tela: é um grupo que não existe. Grupo COM conteúdo próprio e sem filhos
  // permanece — vira aba comum (ver `ehGrupoExpansivel`).
  return grupos.filter((g) => g.proprio !== null || g.filhos.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Derivações
// ─────────────────────────────────────────────────────────────

/** Só mostra afordância de submenu quem tem filho para mostrar. */
export function ehGrupoExpansivel(grupo: GrupoDeAbas): boolean {
  return grupo.filhos.length > 0;
}

/** A aba que o grupo abre quando o pai é ativado (AC3). */
export function abaPadraoDoGrupo(grupo: GrupoDeAbas): string {
  return grupo.proprio?.value ?? grupo.filhos[0].value;
}

/** Todas as abas navegáveis desta etapa, pai e filhos, em ordem de menu. */
export function abasDoMenu(menu: GrupoDeAbas[]): ItemDeAba[] {
  return menu.flatMap((g) => (g.proprio ? [g.proprio, ...g.filhos] : g.filhos));
}

/** O grupo que contém uma aba — usado para saber qual submenu abrir. */
export function grupoDaAba(menu: GrupoDeAbas[], value: string): GrupoDeAbas | null {
  return (
    menu.find((g) => g.proprio?.value === value || g.filhos.some((f) => f.value === value)) ?? null
  );
}

/**
 * Resolve o `?tab=` da URL contra o menu desta etapa (AC5).
 *
 * Valor ausente, desconhecido ou não elegível aqui cai no default sem erro na
 * tela — o caso real é um link de `?tab=cadeia-cac` compartilhado de uma etapa
 * paga e aberto numa etapa `lyrio`.
 *
 * O default também é validado: se nem `meta-ads` existir no menu, cai na
 * primeira aba que existir, porque devolver um value que ninguém renderiza
 * deixaria o `<Tabs>` sem conteúdo.
 */
export function resolverAbaAtiva(menu: GrupoDeAbas[], solicitada: string | null | undefined): string {
  const abas = abasDoMenu(menu);
  if (abas.length === 0) return ABA_PADRAO;
  if (solicitada && abas.some((a) => a.value === solicitada)) return solicitada;
  if (abas.some((a) => a.value === ABA_PADRAO)) return ABA_PADRAO;
  return abas[0].value;
}
