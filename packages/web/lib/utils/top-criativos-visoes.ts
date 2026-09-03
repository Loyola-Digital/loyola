/**
 * Story 18.74 — as visões (abas) e a barra de ferramentas do Top Criativos.
 *
 * Até aqui a galeria tinha um `<Select>` de 150px no canto, e trocar de leitura
 * ("quem tem o melhor gancho?" → "quem dá mais retorno?") era reconfigurar tudo
 * de novo. Uma aba passa a carregar o conjunto inteiro — **ordenação + filtros +
 * agrupamento** — e a barra de ferramentas mexe em cada peça sem destruir o
 * preset: quem altera algo vê a aba marcada como modificada e volta ao original
 * com um clique.
 *
 * A lógica mora aqui, e não no componente, porque o runner de teste do `web` só
 * coleta `.test.ts` — um `.test.tsx` ao lado do componente nunca rodaria.
 */

import type { AggregatedCreative } from "@/lib/utils/top-creatives";

// ============================================================
// Tipos
// ============================================================

/** Métricas de ordenação. Nem toda métrica vira aba — ver `VISOES`. */
export type MetricaDeOrdenacao =
  | "cpl"
  | "cplQualified"
  | "leads"
  | "ctr"
  | "spend"
  | "hook"
  | "roas";

export type Agrupamento = "nome" | "anuncio";
export type TipoDeMidia = "todos" | "video" | "estatico";

export interface FiltrosDaGaleria {
  /** Busca por nome do criativo (substring, case-insensitive). */
  busca: string;
  metrica: MetricaDeOrdenacao;
  agrupamento: Agrupamento;
  tipoDeMidia: TipoDeMidia;
  /** `true` desliga o filtro de relevância estatística da 8.9. */
  incluirBaixoGasto: boolean;
}

export interface VisaoDeCriativos {
  id: string;
  label: string;
  /** Descrição curta — vira o `title` da aba. */
  descricao: string;
  preset: FiltrosDaGaleria;
}

const FILTROS_BASE: FiltrosDaGaleria = {
  busca: "",
  metrica: "cpl",
  agrupamento: "nome",
  tipoDeMidia: "todos",
  incluirBaixoGasto: false,
};

/**
 * As seis abas, na ordem pedida pelo gestor.
 *
 * "Todos" é a única que muda o **agrupamento**: é a visão crua, um card por
 * anúncio e sem filtro de relevância. As outras cinco agregam por nome — a
 * unidade que o resto da tela usa.
 */
export const VISOES: VisaoDeCriativos[] = [
  {
    id: "todos",
    label: "Todos",
    descricao: "Um card por anúncio, sem agrupamento e sem filtro de relevância",
    preset: { ...FILTROS_BASE, agrupamento: "anuncio", incluirBaixoGasto: true, metrica: "spend" },
  },
  {
    id: "hook",
    label: "Melhores ganchos",
    descricao: "Maior hook rate primeiro — só vídeos com métrica e volume mínimo",
    preset: { ...FILTROS_BASE, metrica: "hook" },
  },
  {
    id: "cpl",
    label: "CPL",
    descricao: "Menor custo por lead primeiro",
    preset: { ...FILTROS_BASE, metrica: "cpl" },
  },
  {
    id: "roas",
    label: "Maiores ROAS",
    descricao: "Maior retorno sobre investimento primeiro (faturamento da planilha)",
    preset: { ...FILTROS_BASE, metrica: "roas" },
  },
  {
    id: "ctr",
    label: "CTR",
    descricao: "Maior taxa de clique primeiro",
    preset: { ...FILTROS_BASE, metrica: "ctr" },
  },
  {
    id: "spend",
    label: "Investimento",
    descricao: "Maior investimento primeiro",
    preset: { ...FILTROS_BASE, metrica: "spend" },
  },
];

export const VISAO_INICIAL = "cpl";

export function visaoPorId(id: string): VisaoDeCriativos {
  return VISOES.find((v) => v.id === id) ?? VISOES[2];
}

/**
 * A aba foi mexida depois de escolhida?
 *
 * Comparação campo a campo — e não por referência — porque o estado é
 * reconstruído a cada render. Sem isto, toda aba apareceria como modificada.
 */
export function presetModificado(
  filtros: FiltrosDaGaleria,
  preset: FiltrosDaGaleria,
): boolean {
  return (
    filtros.busca.trim() !== preset.busca.trim() ||
    filtros.metrica !== preset.metrica ||
    filtros.agrupamento !== preset.agrupamento ||
    filtros.tipoDeMidia !== preset.tipoDeMidia ||
    filtros.incluirBaixoGasto !== preset.incluirBaixoGasto
  );
}

// ============================================================
// Chips de filtro ativo
// ============================================================

export interface ChipDeFiltro {
  /** Qual campo o chip remove ao ser fechado. */
  campo: keyof FiltrosDaGaleria;
  /** Texto do chip — diz o VALOR, não só o nome do filtro. */
  texto: string;
}

/**
 * Um chip por filtro que está de fato agindo. "Agindo" é medido contra o
 * **padrão da galeria**, não contra o preset da aba: a aba "Todos" liga
 * `incluirBaixoGasto` de propósito, e isso precisa aparecer — é o que explica
 * por que ela mostra mais cards que as outras.
 */
export function chipsDeFiltro(filtros: FiltrosDaGaleria): ChipDeFiltro[] {
  const chips: ChipDeFiltro[] = [];
  if (filtros.busca.trim()) {
    chips.push({ campo: "busca", texto: `Busca: ${filtros.busca.trim()}` });
  }
  if (filtros.tipoDeMidia === "video") {
    chips.push({ campo: "tipoDeMidia", texto: "Só vídeo" });
  } else if (filtros.tipoDeMidia === "estatico") {
    chips.push({ campo: "tipoDeMidia", texto: "Só estático" });
  }
  if (filtros.incluirBaixoGasto) {
    chips.push({ campo: "incluirBaixoGasto", texto: "Incluindo baixo gasto" });
  }
  if (filtros.agrupamento === "anuncio") {
    chips.push({ campo: "agrupamento", texto: "Por anúncio (sem agrupar)" });
  }
  return chips;
}

/** Volta um campo ao padrão da galeria — o que o "x" do chip faz. */
export function limparCampo(
  filtros: FiltrosDaGaleria,
  campo: keyof FiltrosDaGaleria,
): FiltrosDaGaleria {
  switch (campo) {
    case "busca":
      return { ...filtros, busca: "" };
    case "tipoDeMidia":
      return { ...filtros, tipoDeMidia: "todos" };
    case "incluirBaixoGasto":
      return { ...filtros, incluirBaixoGasto: false };
    case "agrupamento":
      return { ...filtros, agrupamento: "nome" };
    default:
      return filtros;
  }
}

// ============================================================
// Busca e filtro de mídia
// ============================================================

/**
 * `VIDEO` no `objectType` da Meta → vídeo; qualquer outro valor → estático;
 * ausente → **indefinido**, que fica fora dos dois filtros.
 *
 * É a mesma regra da coluna "Tipo" do Detalhamento do Perpétuo. Tratar ausente
 * como estático encheria o filtro "Só estático" de criativos que ninguém
 * classificou.
 */
export function ehVideo(objectType: string | null | undefined): boolean | null {
  if (objectType == null || objectType === "") return null;
  return objectType.toUpperCase().includes("VIDEO");
}

export function aplicarBuscaEMidia<
  T extends { name: string; creative?: { objectType?: string | null } | null },
>(criativos: T[], filtros: FiltrosDaGaleria): T[] {
  const termo = filtros.busca.trim().toLowerCase();
  return criativos.filter((c) => {
    if (termo && !c.name.toLowerCase().includes(termo)) return false;
    if (filtros.tipoDeMidia !== "todos") {
      const video = ehVideo(c.creative?.objectType);
      if (video === null) return false;
      if (filtros.tipoDeMidia === "video" && !video) return false;
      if (filtros.tipoDeMidia === "estatico" && video) return false;
    }
    return true;
  });
}

// ============================================================
// Identidade do criativo
// ============================================================

/**
 * Chave estável de um item da lista — **e a razão de ela existir**.
 *
 * No agrupamento por nome, o nome é único e serve. Na visão "Todos"
 * (agrupamento por anúncio) o MESMO nome aparece N vezes, uma por `ad_id`: um
 * mapa chaveado por nome guardaria um valor só, e os N cards leriam o do
 * último — todos com o ROAS de um anúncio que não é o deles.
 *
 * Achado do gate de QA da 18.74, reproduzido em teste.
 */
export function chaveDoCriativo(
  c: { name: string; ids: string[] },
  agrupamento: Agrupamento,
): string {
  return agrupamento === "anuncio" ? (c.ids[0] ?? c.name) : c.name;
}

/**
 * O preset da aba, ajustado ao default da tela.
 *
 * O Perpétuo abre com o filtro de relevância desligado (29.8). Sem este ajuste,
 * a aba nasceria marcada como modificada (`•`) sem que ninguém tivesse tocado
 * em nada — e o marcador que deveria significar "você mexeu aqui" viraria
 * enfeite permanente.
 */
export function presetEfetivo(
  visao: VisaoDeCriativos,
  defaultShowAll: boolean,
): FiltrosDaGaleria {
  return {
    ...visao.preset,
    incluirBaixoGasto: visao.preset.incluirBaixoGasto || defaultShowAll,
  };
}

// ============================================================
// ROAS
// ============================================================

/**
 * ROAS do criativo = faturamento atribuído ÷ investimento.
 *
 * `null` — e não `0` — quando não há investimento: um criativo com faturamento
 * e gasto zero apareceria no topo do ranking, o que é o oposto do que a aba
 * promete. Faturamento zero com gasto positivo **é** ROAS zero, e esse entra.
 */
export function roasDoCriativo(
  faturamento: number | null | undefined,
  spend: number,
): number | null {
  if (!Number.isFinite(spend) || spend <= 0) return null;
  if (faturamento == null) return null;
  return faturamento / spend;
}

// ============================================================
// Ordenação
// ============================================================

/**
 * Ordena pela métrica da aba. `roasPorNome` só é consultado na métrica `roas` —
 * as outras não precisam do cruzamento com a planilha.
 *
 * Regra geral de ausência: quem não tem a métrica vai para o **fim**, nunca
 * para o topo. Um `null` tratado como `0` num ranking de "menor CPL" põe o
 * criativo sem dado em primeiro lugar.
 */
export function ordenarPorMetrica(
  criativos: AggregatedCreative[],
  metrica: MetricaDeOrdenacao,
  /** Mapa chaveado por `chaveDoCriativo` — **não** por nome. */
  roasPorChave?: Map<string, number | null>,
  agrupamento: Agrupamento = "nome",
): AggregatedCreative[] {
  const ordenado = [...criativos];
  const menorPrimeiro = (a: number | null, b: number | null) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - b;
  };
  const maiorPrimeiro = (a: number | null, b: number | null) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  };

  switch (metrica) {
    case "cpl":
      ordenado.sort((a, b) => menorPrimeiro(a.cplPago, b.cplPago));
      break;
    case "cplQualified":
      ordenado.sort((a, b) => menorPrimeiro(a.cplQualified, b.cplQualified));
      break;
    case "leads":
      ordenado.sort((a, b) => b.leadsPagos - a.leadsPagos);
      break;
    case "spend":
      ordenado.sort((a, b) => b.spend - a.spend);
      break;
    case "hook":
      // Story 29.65 (AC3): quem não tem a métrica é filtrado ANTES de chegar
      // aqui — o sort só ordena o que sobrou.
      ordenado.sort((a, b) => (b.hookRate ?? 0) - (a.hookRate ?? 0));
      break;
    case "roas":
      ordenado.sort((a, b) =>
        maiorPrimeiro(
          roasPorChave?.get(chaveDoCriativo(a, agrupamento)) ?? null,
          roasPorChave?.get(chaveDoCriativo(b, agrupamento)) ?? null,
        ),
      );
      break;
    default:
      // CTR agora é de link e pode ser `null` (métrica ausente). Sem este
      // tratamento, `null` seria coagido a 0 e o criativo sem medição
      // apareceria como o pior CTR do funil — uma acusação falsa.
      ordenado.sort((a, b) => maiorPrimeiro(a.ctr, b.ctr));
  }
  return ordenado;
}
