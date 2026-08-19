/**
 * Story 44.9 — o que a aba "Inácio" precisa DERIVAR do payload, e só isso.
 *
 * ## Este módulo não recalcula métrica nenhuma
 *
 * Regra 7.6 da spec: o cálculo mora em `@loyola-x/shared`. O payload já chega
 * com `atuais`, `tetos`, `ranking`, `composto`, `benchmarks` e `principal`
 * prontos. O que sobra aqui é **escolher o alvo e montar a linha da tabela** —
 * e mesmo a escolha do selo vem do shared (`sinalizar`), porque comparação com
 * direção é regra, não estilo.
 *
 * ⚠️ **Import de VALOR do shared vai por subpath** (`@loyola-x/shared/src/...`).
 * Bare import de valor quebra o `next build` — o web só consegue `import type`
 * do pacote raiz. `cadeia-cac` é módulo folha, que é a condição para o subpath
 * funcionar.
 *
 * ## Unidades
 *
 * O payload declara `unidadeDasTaxas: "decimal"`. **Nada aqui multiplica por
 * 100** — isso é trabalho da formatação, no componente. Comparar em decimal e
 * exibir em porcento é a ordem certa; o contrário é a fonte nº 1 de erro da
 * spec (§2.5).
 */

import {
  sinalizar,
  alvoVigente,
  type Metrica,
  type Selo,
} from "@loyola-x/shared/src/cadeia-cac";

/** Por que uma linha não tem alvo. Cada motivo pede uma ação diferente. */
export type MotivoSemAlvo =
  | "semTeto"
  | "semBenchmark"
  | "vslNaoRespondido"
  | "semVsl"
  | "semTicket";

export interface LinhaDaCadeia {
  metrica: Metrica;
  atual: number | null;
  /** Teto do grupo, quando existe. */
  teto: number | null;
  /** Por que o teto não existe, quando não existe. */
  motivoDoTeto: string | null;
  /** Benchmark: constante da spec §5 ou mediana do payload. */
  benchmark: number | null;
  /** `"constante"` = alvo de mercado · `"mediana-historica"` = mediana do grupo. */
  origemDoBenchmark: "constante" | "mediana-historica" | null;
  /** Quantas campanhas entraram na mediana. `null` quando o benchmark é constante. */
  campanhasNaMediana: number | null;
  /** Teto quando existe, benchmark quando não (spec §6). */
  alvo: number | null;
  motivoSemAlvo: MotivoSemAlvo | null;
  selo: Selo | null;
}

/**
 * Benchmarks CONSTANTES da spec §5.
 *
 * ⚠️ CPM e CPC **não estão aqui de propósito**: a spec diz que não existe
 * benchmark de mercado para eles, e o alvo é a mediana das campanhas elegíveis
 * — que vem calculada do endpoint (Story 44.8 AC11), porque a elegibilidade usa
 * a régua do gate 44.5 e a aba não tem como re-derivá-la.
 */
export const BENCHMARK_CTR = 0.02;
export const BENCHMARK_CONNECT_RATE = 0.85;
/** Conv. LP com ticket ACIMA de R$147. */
export const BENCHMARK_CONV_LP_TICKET_ALTO = 0.04;
/** Conv. LP com ticket ABAIXO de R$147. */
export const BENCHMARK_CONV_LP_TICKET_BAIXO = 0.075;
export const TICKET_DE_CORTE = 147;

export interface PayloadDaAba {
  familia: "paga" | "gratuita" | null;
  atuais?: Partial<Record<Metrica, number | null>>;
  tetos?: Partial<Record<Metrica, { valor: number | null; motivo?: string }>>;
  benchmarks?: {
    medianas?: Partial<Record<Metrica, number | null>>;
    campanhasElegiveis?: Partial<Record<Metrica, number>>;
  };
  lpTemVsl?: boolean | null;
  ticketMedioManual?: number | null;
}

/**
 * O benchmark de Conv. LP (spec §5), com o motivo quando não se aplica.
 *
 * A spec é explícita: os 4% / 7,5% valem **somente quando a LP tem VSL**. A
 * nota de equivalência explica por quê — a "Conversão da VSL" do deck é
 * matematicamente `checkouts ÷ pageviews`, que é a Conv. LP. Fora de LP com
 * VSL, a linha simplesmente não tem benchmark.
 *
 * ⚠️ `null` e `false` em `lpTemVsl` levam ao mesmo lugar (sem benchmark) por
 * caminhos diferentes, e o motivo distingue: "ninguém respondeu" pede que
 * alguém responda; "não tem VSL" é resposta final.
 */
export function benchmarkConvLP(
  lpTemVsl: boolean | null | undefined,
  ticketMedio: number | null | undefined,
): { valor: number | null; motivo: MotivoSemAlvo | null } {
  if (lpTemVsl === null || lpTemVsl === undefined) {
    return { valor: null, motivo: "vslNaoRespondido" };
  }
  if (!lpTemVsl) return { valor: null, motivo: "semVsl" };
  if (ticketMedio === null || ticketMedio === undefined || !Number.isFinite(ticketMedio)) {
    return { valor: null, motivo: "semTicket" };
  }
  return {
    valor:
      ticketMedio > TICKET_DE_CORTE
        ? BENCHMARK_CONV_LP_TICKET_ALTO
        : BENCHMARK_CONV_LP_TICKET_BAIXO,
    motivo: null,
  };
}

/**
 * O benchmark de uma métrica: constante da spec ou mediana do payload.
 *
 * ⚠️ A família GRATUITA não usa os 4% / 7,5% de Conv. LP: lá o elo é
 * `Conv. LP→lead`, e a spec §5 manda mediana histórica também. Tratar as duas
 * famílias igual daria à gratuita um alvo de checkout que ela não tem.
 */
export function benchmarkDaMetrica(
  metrica: Metrica,
  p: PayloadDaAba,
): {
  valor: number | null;
  origem: "constante" | "mediana-historica" | null;
  campanhas: number | null;
  motivo: MotivoSemAlvo | null;
} {
  const mediana = p.benchmarks?.medianas?.[metrica] ?? null;
  const campanhas = p.benchmarks?.campanhasElegiveis?.[metrica] ?? null;
  const daMediana = () => ({
    valor: mediana,
    origem: mediana === null ? null : ("mediana-historica" as const),
    campanhas: mediana === null ? null : campanhas,
    motivo: mediana === null ? ("semBenchmark" as const) : null,
  });

  switch (metrica) {
    case "cpm":
    case "cpc":
      return daMediana();
    case "ctr":
      return { valor: BENCHMARK_CTR, origem: "constante", campanhas: null, motivo: null };
    case "connectRate":
      return { valor: BENCHMARK_CONNECT_RATE, origem: "constante", campanhas: null, motivo: null };
    case "convLP": {
      if (p.familia === "gratuita") return daMediana();
      const b = benchmarkConvLP(p.lpTemVsl, p.ticketMedioManual);
      return {
        valor: b.valor,
        origem: b.valor === null ? null : "constante",
        campanhas: null,
        motivo: b.motivo,
      };
    }
  }
}

/** Ordem de exibição: a cadeia, do início do funil para o fim. */
export const ORDEM_DA_TABELA: readonly Metrica[] = [
  "cpm",
  "ctr",
  "cpc",
  "connectRate",
  "convLP",
];

/**
 * Monta UMA linha da tabela: atual, teto, benchmark, alvo vigente e selo.
 *
 * O alvo vigente e o selo vêm do shared — `alvoVigente` implementa o "teto
 * quando existe, benchmark quando não" da §6, e `sinalizar` respeita `DIRECAO`.
 */
export function montarLinha(metrica: Metrica, p: PayloadDaAba): LinhaDaCadeia {
  const atual = p.atuais?.[metrica] ?? null;
  const tetoBruto = p.tetos?.[metrica];
  const teto = tetoBruto?.valor ?? null;
  const b = benchmarkDaMetrica(metrica, p);

  const alvo = alvoVigente(
    { metrica, valor: teto } as Parameters<typeof alvoVigente>[0],
    b.valor,
  );

  return {
    metrica,
    atual,
    teto,
    motivoDoTeto: teto === null ? (tetoBruto?.motivo ?? "semDados") : null,
    benchmark: b.valor,
    origemDoBenchmark: b.origem,
    campanhasNaMediana: b.campanhas,
    alvo,
    motivoSemAlvo: alvo !== null ? null : (b.motivo ?? (teto === null ? "semTeto" : null)),
    selo: sinalizar(metrica, atual, alvo),
  };
}

export function montarTabela(p: PayloadDaAba): LinhaDaCadeia[] {
  return ORDEM_DA_TABELA.map((m) => montarLinha(m, p));
}
