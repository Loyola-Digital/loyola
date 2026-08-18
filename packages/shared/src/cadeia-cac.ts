/**
 * Story 44.6 — núcleo de cálculo da aba "Inácio".
 *
 * Fonte única: `docs/stories/epics/epic-44-aba-inacio.md` **v1.1**. Onde este
 * arquivo e a spec divergirem, a spec vence e a divergência é bug daqui.
 *
 * ## Por que isto existe
 *
 * A aba (web) e o agente Inácio (MCP → REST) precisam do MESMO número. Sem um
 * lugar único, eles divergem: o `connectRate` do endpoint público ficou 18 a 35
 * pontos percentuais abaixo do painel por mais de um ano (Story 44.2).
 *
 * Este é um **módulo folha** — não importa nada de dentro do `shared`. O web
 * consome por subpath (`@loyola-x/shared/src/cadeia-cac`), a API por bare
 * import (`@loyola-x/shared`). Ver a tabela em `./index.ts`: os dois caminhos
 * NÃO são intercambiáveis, e trocar derruba o boot sem que `tsc`, `vitest` ou
 * `next build` acusem (Story 19.14).
 *
 * ## A cadeia telescopa — a descoberta que define o desenho
 *
 *     CPC ÷ (Connect × Conv.LP × Conv.Checkout)
 *       = (spend/linkClicks) ÷ ( (lpv/linkClicks) × (ck/lpv) × (vendas/ck) )
 *       = spend ÷ vendas
 *
 * A cadeia completa É `spend ÷ vendas`. Com atribuição parcial de venda ela
 * infla por `1 ÷ cobertura` — medido de 2,0× a 36,3× em produção. Por isso a
 * Conv. Checkout saiu da multiplicação (spec §2.2) e o número principal é o
 * `cacReal`, que não depende de atribuição nenhuma.
 */

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export type Familia = "paga" | "gratuita";

/**
 * Por que um dado não está disponível. Regra 7.4 da spec: ausência é declarada,
 * nunca vira `0` nem estimativa.
 */
export type MotivoIndisponivel =
  | "semDados"
  | "baseInsuficiente"
  | "naoAtribuivel"
  | "coberturaAtipica";

export type Confianca = "alta" | "baixa";

/** Métricas da cadeia. `cpc` é a que abre; `cpm`/`ctr` só monitoram. */
export type Metrica = "cpm" | "cpc" | "ctr" | "connectRate" | "convLP";

/** Um dia de mídia de uma campanha, como o endpoint da 44.1 devolve. */
export interface DiaBruto {
  /** `YYYY-MM-DD`. */
  date: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  /** `actions[].initiate_checkout` — pixel, base completa. */
  checkouts: number;
  /**
   * Leads ÚNICOS do Loyola atribuídos a esta campanha (família gratuita).
   * ⚠️ Base ATRIBUÍDA, ao contrário de `checkouts`. Ver `custoPorLead`.
   */
  leadsAtribuidos?: number;
}

export interface Agregado {
  spend: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  checkouts: number;
  leadsAtribuidos: number;
  /** Dias que entraram na soma — 0 significa `semDados`, não zero legítimo. */
  dias: number;
}

/**
 * ⚠️ **Toda taxa aqui é decimal entre 0 e 1** (spec §2.5). Nunca pontos
 * percentuais. O endpoint público devolve `ctrLink` e `lpRate` já × 100 —
 * normalize na FRONTEIRA com `dePercentual()`, nunca no meio da conta.
 */
export interface Metricas {
  /** Dinheiro absoluto (a única exceção de escala: já é ÷ 1000 por definição). */
  cpm: number | null;
  cpc: number | null;
  /** decimal 0–1 */
  ctr: number | null;
  /** decimal 0–1 */
  connectRate: number | null;
  /** decimal 0–1 */
  convLP: number | null;
}

export interface Teto {
  metrica: Metrica;
  valor: number;
  /** Campanha de origem. */
  campaignId: string;
  /** Primeiro e último dia da janela vencedora, `YYYY-MM-DD`. */
  de: string;
  ate: string;
  /** Base contada NAQUELA janela (impressões, link clicks ou LP views). */
  base: number;
  confianca: Confianca;
  /** De onde o dado veio — a spec §4 exige o rótulo. */
  fonte: "ad-level" | "campaign-level";
  /** Só para `convLP` da família gratuita: cobertura de lead da janela. */
  coberturaJanela?: number;
}

export interface TetoAusente {
  metrica: Metrica;
  valor: null;
  motivo: MotivoIndisponivel;
}

export interface ItemRanking {
  metrica: Metrica;
  atual: number;
  teto: number;
  /** Queda REAL de custo, decimal 0–1. Nunca `teto/atual − 1`. */
  queda: number;
  /** Posição na cadeia, para desempate: menor = mais cedo no funil. */
  posicao: number;
}

// ─────────────────────────────────────────────────────────────
// Fronteira: normalização de unidade
// ─────────────────────────────────────────────────────────────

/**
 * Converte ponto percentual → decimal. Use SÓ na fronteira, ao ler o payload
 * público (`ctrLink`, `lpRate` vêm × 100 de `public-meta.ts`).
 *
 * A fonte nº 1 de erro da spec §2.5 é `2` onde deveria entrar `0,02` — muda o
 * resultado por um fator de 100 e nada na tela avisa.
 */
export function dePercentual(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : v / 100;
}

/** Decimal → ponto percentual. Use SÓ na saída, para exibição. */
export function paraPercentual(v: number | null): number | null {
  return v === null ? null : v * 100;
}

// ─────────────────────────────────────────────────────────────
// Família
// ─────────────────────────────────────────────────────────────

const FAMILIA_PAGA = ["paid", "sales", "event_capture", "event"] as const;
const FAMILIA_GRATUITA = ["free", "cpl"] as const;

/**
 * Classificação PRÓPRIA da aba (spec §1).
 *
 * ⚠️ Não use `ehCaptacaoPaga()` nem irmãos: `ehCaptacaoPaga` = `paid` +
 * `event_capture` (falta `sales` e `event`), `temDashboardDeVendas` = + `sales`
 * (falta `event`). Nenhum produz a família paga desta spec — e estendê-los
 * mexeria no sync diário e no CRM, que é fora da aba.
 *
 * `null` = fora da aba (`lyrio`, `comercial`, `debriefing`, ou tipo novo).
 * Fora da aba é resultado, não erro: a spec manda reportar, não inventar.
 */
export function classificarFamilia(stageType: string | null | undefined): Familia | null {
  if (!stageType) return null;
  if ((FAMILIA_PAGA as readonly string[]).includes(stageType)) return "paga";
  if ((FAMILIA_GRATUITA as readonly string[]).includes(stageType)) return "gratuita";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Agregação e métricas
// ─────────────────────────────────────────────────────────────

export function agregadoVazio(): Agregado {
  return {
    spend: 0,
    impressions: 0,
    linkClicks: 0,
    landingPageViews: 0,
    checkouts: 0,
    leadsAtribuidos: 0,
    dias: 0,
  };
}

/** Soma os brutos. A divisão vem depois — ver `calcularMetricas`. */
export function agregar(dias: readonly DiaBruto[]): Agregado {
  const a = agregadoVazio();
  for (const d of dias) {
    a.spend += d.spend;
    a.impressions += d.impressions;
    a.linkClicks += d.linkClicks;
    a.landingPageViews += d.landingPageViews;
    a.checkouts += d.checkouts;
    a.leadsAtribuidos += d.leadsAtribuidos ?? 0;
    a.dias += 1;
  }
  return a;
}

/** Divisão guardada: denominador zero devolve `null`, nunca `0` (regra 7.4). */
function div(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null;
}

/**
 * **Razão de somas**, nunca média de médias (spec §2.6).
 *
 * Somar os numeradores e denominadores do período e dividir DEPOIS. Tirar a
 * média das taxas diárias dá outro número — é por isso que o endpoint da 44.1
 * não devolve taxa por dia.
 *
 * ⚠️ `connectRate` divide por `linkClicks`, jamais por `clicks` (cliques totais
 * incluem curtida e clique em perfil). Foi este o bug da 44.2.
 *
 * ⚠️ Regra das bases encadeadas: cada taxa usa como denominador exatamente o
 * numerador da anterior. Duas taxas na mesma base contam a perda duas vezes.
 */
export function calcularMetricas(a: Agregado, familia: Familia): Metricas {
  const cpmBruto = div(a.spend, a.impressions);
  const numeradorConvLP = familia === "paga" ? a.checkouts : a.leadsAtribuidos;
  return {
    cpm: cpmBruto === null ? null : cpmBruto * 1000,
    cpc: div(a.spend, a.linkClicks),
    ctr: div(a.linkClicks, a.impressions),
    connectRate: div(a.landingPageViews, a.linkClicks),
    convLP: div(numeradorConvLP, a.landingPageViews),
  };
}

// ─────────────────────────────────────────────────────────────
// O número principal (spec §2.1)
// ─────────────────────────────────────────────────────────────

/**
 * `CAC real = spend ÷ vendas reais do Loyola`.
 *
 * **Sai mesmo com cobertura de atribuição 0%** — depende do total da etapa, não
 * da atribuição por campanha. Três das dez etapas pagas medidas estão nessa
 * situação e continuam precisando de CAC.
 *
 * ⚠️ Só venda de status PAGO entra (regra 7.1). `purchases`/`revenue` de
 * endpoint Meta são pixel e não substituem.
 */
export function cacReal(spend: number, vendasReais: number): number | null {
  return div(spend, vendasReais);
}

/** `CPL real = spend ÷ leads únicos do Loyola` (total da etapa). Imune a atribuição. */
export function cplReal(spend: number, leadsUnicos: number): number | null {
  return div(spend, leadsUnicos);
}

// ─────────────────────────────────────────────────────────────
// A cadeia de decomposição (spec §2.2)
// ─────────────────────────────────────────────────────────────

/**
 * `CPC ÷ (Connect Rate × Conv. LP)`.
 *
 * ⚠️ **CPM e CTR ficam FORA** (spec §2.4). `CPC = (CPM ÷ 1000) ÷ CTR` é
 * identidade: se os três entrassem, o mesmo ganho contaria duas vezes e o
 * composto inflaria de −25% para −44%. Eles seguem monitorados e servem para
 * decompor o CPC — ver `decomporCPC`.
 *
 * Para a família **paga** o resultado é `custoPorCheckout`, e ele é **imune** a
 * atribuição: telescopa para `spend ÷ checkouts`, e checkout vem do pixel.
 *
 * Para a família **gratuita** é `custoPorLead`, e ele **NÃO é imune**:
 * telescopa para `spend ÷ leadsAtribuídos`, inflado por `1 ÷ coberturaLeads`.
 * Medido em produção: cobertura de 52% a 99% (inflação 1,0× a 1,9×) — duas
 * ordens de grandeza melhor que a de venda, mas não zero. Por isso ele sempre
 * viaja acompanhado da cobertura.
 */
export function custoDaCadeia(m: Metricas): number | null {
  if (m.cpc === null || m.connectRate === null || m.convLP === null) return null;
  const produto = m.connectRate * m.convLP;
  return produto > 0 ? m.cpc / produto : null;
}

/**
 * `1 ÷ produto das taxas` — quantos cliques para uma conversão.
 *
 * Teste de plausibilidade obrigatório (spec §2.5): se der um número absurdo,
 * alguma taxa entrou em pontos percentuais em vez de decimal.
 */
export function cliquesPorConversao(m: Metricas): number | null {
  if (m.connectRate === null || m.convLP === null) return null;
  const produto = m.connectRate * m.convLP;
  return produto > 0 ? 1 / produto : null;
}

// ─────────────────────────────────────────────────────────────
// Janela de 7 dias (spec §4)
// ─────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;

function paraMs(data: string): number {
  return Date.parse(`${data}T00:00:00Z`);
}

export interface Janela {
  de: string;
  ate: string;
  agregado: Agregado;
}

/**
 * Todas as janelas de 7 dias corridos da série, contadas **por DATA**.
 *
 * ⚠️ **`RANGE`, não `ROWS`.** A janela é `[d−6, d]` no calendário, não "as 7
 * linhas anteriores". Medido: 80 de 193 campanhas (41%) têm gap na série, o
 * maior de 14 dias. Numa campanha com buraco, 7 linhas cobrem até 21 dias de
 * calendário — a base infla e a campanha passa o piso sem merecer, corrompendo
 * justamente o número que decide o projeto.
 */
export function janelasDe7Dias(dias: readonly DiaBruto[]): Janela[] {
  if (dias.length === 0) return [];
  const ordenados = [...dias].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: Janela[] = [];
  for (const fim of ordenados) {
    const fimMs = paraMs(fim.date);
    const inicioMs = fimMs - 6 * DIA_MS;
    const dentro = ordenados.filter((d) => {
      const t = paraMs(d.date);
      return t >= inicioMs && t <= fimMs;
    });
    const inicio = new Date(inicioMs).toISOString().slice(0, 10);
    out.push({ de: inicio, ate: fim.date, agregado: agregar(dentro) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Selo de confiança (spec §4.1)
// ─────────────────────────────────────────────────────────────

/** Qual base cada métrica conta para o piso. */
export function baseDaMetrica(metrica: Metrica, a: Agregado): number {
  switch (metrica) {
    case "cpm":
    case "cpc":
    case "ctr":
      return a.impressions;
    case "connectRate":
      return a.linkClicks;
    case "convLP":
      return a.landingPageViews;
  }
}

const PISOS: Record<Metrica, { alto: number; baixo: number }> = {
  cpm: { alto: 30_000, baixo: 10_000 },
  cpc: { alto: 30_000, baixo: 10_000 },
  ctr: { alto: 30_000, baixo: 10_000 },
  connectRate: { alto: 300, baixo: 100 },
  convLP: { alto: 300, baixo: 150 },
};

/**
 * `alta` | `baixa` | `null` (não concorre), sobre a base DA JANELA — não do
 * total da campanha.
 *
 * O selo não é decorativo: o gate da 44.5 mostrou que a maior parte dos tetos
 * nasce em confiança **baixa**. Um teto é um máximo, e máximo de estimativa
 * ruidosa infla sozinho — com 20 eventos e conversão real de 20%, a medição
 * varia de ~11% a ~29% só por sorteio, e entre 15 campanhas assim a "melhor"
 * tende a ser a mais sortuda.
 */
export function selo(metrica: Metrica, base: number): Confianca | null {
  const p = PISOS[metrica];
  if (base >= p.alto) return "alta";
  if (base >= p.baixo) return "baixa";
  return null;
}

/**
 * Guarda extra para o teto de `convLP` da família GRATUITA (@po, 2026-08-18).
 *
 * O piso conta LP views, que é o denominador. Mas o numerador é lead
 * **atribuído**, e a cobertura varia no tempo — medido de 52% a 99% entre
 * etapas. Sem guarda, a "melhor janela" pode ser a semana em que o RASTREIO
 * funcionou melhor, não a de melhor conversão: uma campanha que passou de 52%
 * para 95% de cobertura exibiria um salto de 1,8× sem nada mudar na página.
 *
 * O selo de confiança não pega isso — ele conta volume, não qualidade de
 * atribuição.
 *
 * Janela cuja cobertura fica mais de 20 p.p. ABAIXO da mediana da campanha não
 * concorre. Acima da mediana não é problema: é rastreio melhor, não pior.
 */
export const DESVIO_COBERTURA_MAXIMO = 0.2;

export function coberturaAtipica(
  coberturaDaJanela: number,
  coberturaMedianaDaCampanha: number,
): boolean {
  // ⚠️ Arredondar ANTES de comparar. `0.9 - 0.7` em IEEE754 dá
  // `0.20000000000000007`, que passa de `0.2` por erro de representação — e o
  // corte é estrito, então a janela exatamente no limite seria descartada por
  // ruído de float. Como o mesmo valor lógico pode chegar por caminhos de
  // cálculo diferentes, isso faria a mesma janela concorrer num dia e não no
  // outro. Quatro casas cobrem cobertura com folga (é uma razão de contagens).
  const desvio = Math.round((coberturaMedianaDaCampanha - coberturaDaJanela) * 1e4) / 1e4;
  return desvio > DESVIO_COBERTURA_MAXIMO;
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

// ─────────────────────────────────────────────────────────────
// Ranking (spec §3)
// ─────────────────────────────────────────────────────────────

/** Direção de cada métrica: `menor` = menor é melhor. */
export const DIRECAO: Record<Metrica, "menor" | "maior"> = {
  cpm: "menor",
  cpc: "menor",
  ctr: "maior",
  connectRate: "maior",
  convLP: "maior",
};

/**
 * Posição na cadeia, do início do funil para o fim. Critério de desempate
 * (spec §3): *"consertar o furo de cima e deixar o de baixo não resolve nada"*.
 */
export const POSICAO_NA_CADEIA: Record<Metrica, number> = {
  cpm: 0,
  ctr: 0,
  cpc: 1,
  connectRate: 2,
  convLP: 3,
};

/**
 * Queda REAL de custo ao levar a métrica até o teto.
 *
 * ⚠️ **Não é `teto/atual − 1`** — isso é o aumento da métrica, não a queda do
 * custo. O deck original erra aqui; o ranking sai igual, as magnitudes saem
 * otimistas. A spec §3 manda usar a queda real.
 */
export function quedaReal(metrica: Metrica, atual: number, teto: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(teto)) return null;
  if (DIRECAO[metrica] === "maior") {
    return teto > 0 ? 1 - atual / teto : null;
  }
  return atual > 0 ? 1 - teto / atual : null;
}

/**
 * Ordena decrescente pela queda real; empate desempata pela posição na cadeia,
 * do início do funil para o fim.
 *
 * Métrica já no teto (queda ≤ 0) fica **fora** — recebe o selo "no teto" na
 * apresentação, não uma linha no ranking.
 */
export function ranquear(itens: readonly ItemRanking[]): ItemRanking[] {
  return [...itens]
    .filter((i) => i.queda > 0)
    .sort((a, b) => (b.queda !== a.queda ? b.queda - a.queda : a.posicao - b.posicao));
}

/**
 * Composto: o custo se TODAS as métricas chegarem ao teto.
 *
 * ⚠️ Rotular como **cenário teórico** na apresentação — os tetos vêm de
 * campanhas diferentes, e a spec §3 exige a nota de que multiplicar taxas
 * assume independência entre as etapas, que elas não têm.
 *
 * ⚠️ CPM e CTR **não entram** — só CPC, Connect e Conv. LP.
 */
export function compostoNoTeto(atual: Metricas, teto: Metricas): number | null {
  const a = custoDaCadeia(atual);
  const t = custoDaCadeia(teto);
  if (a === null || t === null || a <= 0) return null;
  return 1 - t / a;
}

/**
 * Decomposição do CPC quando ele lidera o ranking (spec §3).
 *
 * `CPC = (CPM ÷ 1000) ÷ CTR`, então dá para dizer quanto do gap fecha levando
 * só o CTR ao teto, quanto levando só o CPM, e quanto levando os dois.
 */
export function decomporCPC(
  cpmAtual: number,
  cpmTeto: number,
  ctrAtual: number,
  ctrTeto: number,
): { soCtr: number | null; soCpm: number | null; ambos: number | null } | null {
  if (ctrAtual <= 0 || ctrTeto <= 0) return null;
  const cpc = (v: number, taxa: number) => v / 1000 / taxa;
  const base = cpc(cpmAtual, ctrAtual);
  if (base <= 0) return null;
  return {
    soCtr: 1 - cpc(cpmAtual, ctrTeto) / base,
    soCpm: 1 - cpc(cpmTeto, ctrAtual) / base,
    ambos: 1 - cpc(cpmTeto, ctrTeto) / base,
  };
}
