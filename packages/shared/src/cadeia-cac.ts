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
  /**
   * `null` quando NENHUM dia trouxe o campo — ausência de dado de lead, que é
   * afirmação diferente de "zero leads". Ver `agregar()`.
   */
  leadsAtribuidos: number | null;
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
  /**
   * Story 44.10 (AC4) — quantas janelas a guarda descartou ANTES desta vencer.
   * Ausente quando a guarda não roda; `0` significa que ela rodou e não barrou
   * nada, que é afirmação diferente e a tela precisa distinguir.
   */
  janelasBarradas?: number;
}

export interface TetoAusente {
  metrica: Metrica;
  valor: null;
  motivo: MotivoIndisponivel;
  /** Story 44.10 (AC4) — com `motivo: "coberturaAtipica"`, quantas foram barradas. */
  janelasBarradas?: number;
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
    leadsAtribuidos: null,
    dias: 0,
  };
}

/**
 * Soma os brutos. A divisão vem depois — ver `calcularMetricas`.
 *
 * ⚠️ **`leadsAtribuidos` só vira número se ALGUM dia trouxe o campo** (QA-446-01).
 * `+= d.leadsAtribuidos ?? 0` transformava "a planilha de leads não está ligada"
 * em "zero leads" — e essa distinção não se recupera depois. O estrago não era
 * no custo (que saía `null` de qualquer jeito), era no RANKING: `Conv. LP = 0`
 * contra um teto qualquer dá `quedaReal = 1`, e a etapa sem dado nenhum
 * liderava a lista prometendo eliminar 100% do custo.
 *
 * É o mesmo padrão que a Story 44.1 usou em `videoViews25`/`videoViews100`, que
 * por sua vez veio da QA-26 da 43.3.
 */
export function agregar(dias: readonly DiaBruto[]): Agregado {
  const a = agregadoVazio();
  for (const d of dias) {
    a.spend += d.spend;
    a.impressions += d.impressions;
    a.linkClicks += d.linkClicks;
    a.landingPageViews += d.landingPageViews;
    a.checkouts += d.checkouts;
    if (d.leadsAtribuidos !== undefined) {
      a.leadsAtribuidos = (a.leadsAtribuidos ?? 0) + d.leadsAtribuidos;
    }
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
  // ⚠️ QA-446-01: numerador AUSENTE devolve `null`, não `0`. Só a família
  // gratuita chega aqui com ausência possível — na paga, `checkouts` é
  // obrigatório em `DiaBruto`, então um zero ali é zero legítimo.
  const numeradorConvLP = familia === "paga" ? a.checkouts : a.leadsAtribuidos;
  return {
    cpm: cpmBruto === null ? null : cpmBruto * 1000,
    cpc: div(a.spend, a.linkClicks),
    ctr: div(a.linkClicks, a.impressions),
    connectRate: div(a.landingPageViews, a.linkClicks),
    convLP: numeradorConvLP === null ? null : div(numeradorConvLP, a.landingPageViews),
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
  const ms = ordenados.map((d) => paraMs(d.date));
  const n = ordenados.length;

  // Último índice que compartilha a data de cada posição. Uma passada, O(n).
  //
  // ⚠️ QA-447-01: sem isto, `slice(inicio, fim + 1)` para no índice corrente e
  // a primeira janela de uma data com DUAS linhas agrega só um pedaço do dia —
  // que então concorre ao teto sozinho. Medido: numa campanha com dois anúncios
  // por dia, o teto de CPC saía 0,20 em vez de 0,92 (4,6× inflado), vindo de um
  // anúncio isolado. A versão O(n²) não tinha o defeito porque filtrava por
  // data e apanhava o dia inteiro; a AC8 manda trocar a implementação SEM
  // mudar o comportamento.
  const ultimoDaData = new Array<number>(n);
  for (let i = n - 1, bloco = n - 1; i >= 0; i -= 1) {
    if (ordenados[i]!.date !== ordenados[bloco]!.date) bloco = i;
    ultimoDaData[i] = bloco;
  }

  const out: Janela[] = [];
  // Dois ponteiros sobre a série ordenada (Story 44.7 AC8). A versão anterior
  // filtrava a série inteira a cada dia — O(n²), medido em 30ms para 365 dias e
  // 101ms para 730. O comportamento é idêntico: a janela continua sendo
  // `[fim − 6 dias, fim]` por DATA, e uma janela é emitida por LINHA (duas
  // linhas na mesma data emitem duas janelas iguais, como antes).
  let inicio = 0;
  for (let fim = 0; fim < n; fim += 1) {
    const inicioMs = ms[fim]! - 6 * DIA_MS;
    while (ms[inicio]! < inicioMs) inicio += 1;
    out.push({
      de: new Date(inicioMs).toISOString().slice(0, 10),
      ate: ordenados[fim]!.date,
      agregado: agregar(ordenados.slice(inicio, ultimoDaData[fim]! + 1)),
    });
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
 * Cobertura de rastreio de UM DIA, no nível da ETAPA.
 *
 * ⚠️ Story 44.7 AC3(b): a cobertura é da **etapa**, não da campanha. Cobertura
 * por campanha não tem denominador — "leads atribuídos à campanha X ÷ o quê?".
 * O que é bem definido, e o que a guarda quer medir, é a qualidade do rastreio
 * no período: de todos os leads que entraram, quantos carregavam um
 * `utm_content` que resolve para algum anúncio.
 *
 * Vêm as CONTAGENS, não a fração já dividida, porque a cobertura da janela é
 * razão de somas — dividir por dia e tirar média daria outro número, que é o
 * mesmo erro que a regra da §2.6 proíbe.
 */
export interface CoberturaDiaria {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Leads únicos da ETAPA no dia que resolveram para algum anúncio. */
  leadsAtribuidos: number;
  /** Leads únicos da ETAPA no dia. */
  leadsTotais: number;
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
 * Janela cuja cobertura fica mais de 20 p.p. ABAIXO da mediana da etapa não
 * concorre. Acima da mediana não é problema: é rastreio melhor, não pior.
 */
export const DESVIO_COBERTURA_MAXIMO = 0.2;

export function coberturaAtipica(
  coberturaDaJanela: number,
  coberturaMedianaDaEtapa: number,
): boolean {
  // ⚠️ Arredondar ANTES de comparar. `0.9 - 0.7` em IEEE754 dá
  // `0.20000000000000007`, que passa de `0.2` por erro de representação — e o
  // corte é estrito, então a janela exatamente no limite seria descartada por
  // ruído de float. Como o mesmo valor lógico pode chegar por caminhos de
  // cálculo diferentes, isso faria a mesma janela concorrer num dia e não no
  // outro. Quatro casas cobrem cobertura com folga (é uma razão de contagens).
  const desvio = Math.round((coberturaMedianaDaEtapa - coberturaDaJanela) * 1e4) / 1e4;
  return desvio > DESVIO_COBERTURA_MAXIMO;
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

// ─────────────────────────────────────────────────────────────
// Composição do teto (Story 44.7 · spec §4)
// ─────────────────────────────────────────────────────────────

/**
 * A série de UMA campanha, com a fonte de onde ela veio.
 *
 * ⚠️ Story 44.7 AC1: a `fonte` é propriedade da **série**, não do dia. Uma
 * campanha inteira vem de ad-level ou de campaign-level, nunca misturada dia a
 * dia — misturar seria o defeito que a 44.1 mediu: as duas tabelas divergem em
 * `spend` em 21 de 164 campanhas, com diferença de até R$ 24.424,85.
 *
 * Sem este invólucro, `Teto.fonte` não é preenchível: `DiaBruto` não tem campo
 * de origem nenhum.
 */
export interface SerieDeCampanha {
  campaignId: string;
  fonte: "ad-level" | "campaign-level";
  dias: readonly DiaBruto[];
}

export interface OpcoesTeto {
  /**
   * Cobertura de rastreio da ETAPA, por dia. Só é usada para o teto de `convLP`
   * da família gratuita — nas demais métricas o numerador e o denominador vêm
   * ambos do pixel, e não há o que a atribuição possa distorcer.
   *
   * Ausente = a guarda não roda, e o teto sai sem `coberturaJanela`.
   */
  coberturaDaEtapa?: readonly CoberturaDiaria[];
}

/** Todo o resultado do teto de um grupo (projeto + família). */
export type TetosDoGrupo = Record<Metrica, Teto | TetoAusente>;

const METRICAS: readonly Metrica[] = ["cpm", "cpc", "ctr", "connectRate", "convLP"];

/** Cobertura de uma janela: razão de somas, nunca média das frações diárias. */
function coberturaDaJanela(
  cobertura: readonly CoberturaDiaria[],
  de: string,
  ate: string,
): number | null {
  let atrib = 0;
  let total = 0;
  for (const c of cobertura) {
    if (c.date >= de && c.date <= ate) {
      atrib += c.leadsAtribuidos;
      total += c.leadsTotais;
    }
  }
  return total > 0 ? atrib / total : null;
}

function melhorPelaDirecao(metrica: Metrica, a: number, b: number): number {
  return DIRECAO[metrica] === "menor" ? Math.min(a, b) : Math.max(a, b);
}

/**
 * Escolhe o teto de cada métrica para um grupo (projeto + família).
 *
 * ## A ordem importa (AC2)
 *
 * Filtrar **antes** de escolher o melhor. Escolher o máximo e depois checar o
 * piso devolveria a campanha mais sortuda com o selo errado — e um teto é um
 * máximo, então máximo de estimativa ruidosa infla sozinho.
 *
 * ## O que sai quando não há teto
 *
 * Nunca um número inventado. `TetoAusente` com o motivo que descreve o que
 * aconteceu, para o consumidor poder dizer *por que* a coluna está vazia:
 *
 * - `semDados` — nenhuma campanha do grupo tem série
 * - `baseInsuficiente` — há série, mas nenhuma janela atinge o piso baixo
 * - `coberturaAtipica` — só `convLP` gratuita: toda janela elegível foi barrada
 *   pela guarda de rastreio
 */
export function calcularTetos(
  campanhas: readonly SerieDeCampanha[],
  familia: Familia,
  opts: OpcoesTeto = {},
): TetosDoGrupo {
  const cobertura = opts.coberturaDaEtapa;

  // A mediana de referência da guarda é da ETAPA e é uma só — não varia por
  // campanha (AC3b). Calculada sobre as coberturas de cada dia com lead.
  const medianaEtapa =
    cobertura && cobertura.length
      ? mediana(
          cobertura
            .filter((c) => c.leadsTotais > 0)
            .map((c) => c.leadsAtribuidos / c.leadsTotais),
        )
      : null;

  const out = {} as TetosDoGrupo;

  for (const metrica of METRICAS) {
    const aplicaGuarda = familia === "gratuita" && metrica === "convLP" && medianaEtapa !== null;

    let melhor: Teto | null = null;
    let houveJanela = false;
    // Story 44.10 (AC4): CONTA, não sinaliza. A 44.12 só precisava saber SE
    // alguma janela foi barrada, para escolher o motivo; a AC5 daquela story
    // pedia o NÚMERO e ficou adiada até a `convLP` ter numerador.
    let janelasBarradas = 0;

    for (const camp of campanhas) {
      for (const janela of janelasDe7Dias(camp.dias)) {
        houveJanela = true;

        const base = baseDaMetrica(metrica, janela.agregado);
        const confianca = selo(metrica, base);
        if (confianca === null) continue; // não atinge nem o piso baixo

        const valor = calcularMetricas(janela.agregado, familia)[metrica];
        if (valor === null) continue; // denominador zero, ou lead ausente

        let cobJanela: number | undefined;
        if (aplicaGuarda) {
          const c = coberturaDaJanela(cobertura!, janela.de, janela.ate);
          if (c === null) continue; // sem lead na janela: não dá para julgar
          if (coberturaAtipica(c, medianaEtapa!)) {
            janelasBarradas += 1;
            continue;
          }
          cobJanela = c;
        }

        // Empate no valor desempata pela MAIOR base. Uma campanha de desempenho
        // constante produz N janelas com o mesmo valor, e ficar com a primeira
        // escolheria a janela de 1 dia em vez da de 7 — o teto viraria "o melhor
        // valor visto num dia" em vez de "sustentado por uma semana", que é o
        // que a régua de 7 dias existe para exigir. Base maior também tende a
        // trazer selo melhor.
        const substituir =
          melhor === null ||
          (valor !== melhor.valor && melhorPelaDirecao(metrica, valor, melhor.valor) === valor) ||
          (valor === melhor.valor && base > melhor.base);
        if (substituir) {
          melhor = {
            metrica,
            valor,
            campaignId: camp.campaignId,
            de: janela.de,
            ate: janela.ate,
            base,
            confianca,
            fonte: camp.fonte,
            ...(cobJanela !== undefined ? { coberturaJanela: cobJanela } : {}),
          };
        }
      }
    }

    if (melhor) {
      // A contagem só entra quando a guarda rodou — `aplicaGuarda` falso deixa
      // o campo ausente, que não é o mesmo que zero.
      out[metrica] = aplicaGuarda ? { ...melhor, janelasBarradas } : melhor;
    } else {
      const motivo: MotivoIndisponivel = !houveJanela
        ? "semDados"
        : janelasBarradas > 0
          ? "coberturaAtipica"
          : "baseInsuficiente";
      out[metrica] =
        motivo === "coberturaAtipica" ? { metrica, valor: null, motivo, janelasBarradas } : { metrica, valor: null, motivo };
    }
  }

  return out;
}

/** Só as métricas que têm teto resolvido — açúcar para o consumidor. */
export function tetosResolvidos(tetos: TetosDoGrupo): Teto[] {
  return METRICAS.map((m) => tetos[m]).filter((t): t is Teto => t.valor !== null);
}

// ─────────────────────────────────────────────────────────────
// Benchmark de referência (spec §5) — Story 44.8 AC11
// ─────────────────────────────────────────────────────────────

/**
 * Mediana das campanhas ELEGÍVEIS do grupo, por métrica.
 *
 * ## Por que isto mora aqui e não na aba
 *
 * A spec §5 dá alvo constante para CTR (≥2%) e Connect Rate (>85%), mas para
 * CPM e CPC diz que *"não existe benchmark de mercado → mediana das campanhas
 * elegíveis do grupo, rotulada explicitamente como mediana histórica"*. Isso é
 * cálculo, e cálculo mora no `shared` (regra 7.6).
 *
 * O argumento decisivo (@po, 2026-08-19) não é a duplicação de fórmula —
 * `mediana()` já era exportada, então quem chamasse chamaria a mesma. São dois
 * outros:
 *
 * 1. **O agente Inácio nunca vê a aba.** Ele consome a REST direto. Benchmark
 *    só na aba deixaria o agente sem alvo nenhum exatamente no caso para o qual
 *    a §5 foi escrita — grupo sem teto elegível (2 de 10 no gate da 44.5).
 * 2. **`TetosDoGrupo` só expõe a campanha VENCEDORA.** A elegibilidade por
 *    campanha morre dentro de `calcularTetos`. Para a aba tirar a mediana das
 *    elegíveis, teria que re-derivar a régua do gate 44.5 — essa sim seria a
 *    violação da 7.6.
 *
 * ## O que "elegível" quer dizer aqui, e por que
 *
 * Mesma régua do teto, aplicada ao **agregado do período da campanha** em vez
 * de a uma janela: a campanha entra na mediana da métrica `m` se
 * `selo(m, baseDaMetrica(m, agregado)) !== null` — isto é, se cruza pelo menos
 * o piso BAIXO — e se a métrica tem valor (denominador > 0).
 *
 * A régua é a mesma do teto de propósito. Se o benchmark admitisse campanha que
 * o teto rejeita, a coluna "alvo" trocaria de população conforme houvesse teto
 * ou não, e a comparação entre etapas deixaria de significar a mesma coisa.
 *
 * ⚠️ **Mediana, não média.** Uma campanha de teste com 3 dias e CPC absurdo
 * puxaria a média; a mediana não se move. É o mesmo motivo pelo qual a guarda
 * de cobertura usa mediana (`calcularTetos`).
 *
 * ⚠️ **É referência, nunca alvo prescritivo.** A spec manda rotular como
 * *mediana histórica* na apresentação: é "o típico do grupo", não "o saudável".
 */
export interface ReferenciasDoGrupo {
  /** Mediana por métrica. `null` = nenhuma campanha elegível. */
  medianas: Record<Metrica, number | null>;
  /** Quantas campanhas entraram em cada mediana — sem isto o número não é auditável. */
  campanhasElegiveis: Record<Metrica, number>;
  /**
   * Mediana do custo da cadeia (custo por checkout na paga, por lead na
   * gratuita). Só entram campanhas elegíveis nos TRÊS elos (`cpc`,
   * `connectRate`, `convLP`) — o custo é o produto delas, e admitir uma
   * campanha frágil num elo contaminaria o número inteiro.
   */
  medianaCustoDaCadeia: number | null;
  campanhasElegiveisCustoDaCadeia: number;
  /** Campanhas do grupo com pelo menos um dia de série. O denominador honesto. */
  campanhasComSerie: number;
}

export function referenciasDoGrupo(
  campanhas: readonly SerieDeCampanha[],
  familia: Familia,
): ReferenciasDoGrupo {
  const valores: Record<Metrica, number[]> = {
    cpm: [],
    cpc: [],
    ctr: [],
    connectRate: [],
    convLP: [],
  };
  const custos: number[] = [];
  let comSerie = 0;

  const ELOS: readonly Metrica[] = ["cpc", "connectRate", "convLP"];

  for (const camp of campanhas) {
    if (camp.dias.length === 0) continue;
    comSerie += 1;

    const agregado = agregar(camp.dias);
    const metricas = calcularMetricas(agregado, familia);

    const elegivel = (m: Metrica) =>
      selo(m, baseDaMetrica(m, agregado)) !== null && metricas[m] !== null;

    for (const m of METRICAS) {
      if (elegivel(m)) valores[m].push(metricas[m]!);
    }

    if (ELOS.every(elegivel)) {
      const custo = custoDaCadeia(metricas);
      if (custo !== null) custos.push(custo);
    }
  }

  const medianas = {} as Record<Metrica, number | null>;
  const campanhasElegiveis = {} as Record<Metrica, number>;
  for (const m of METRICAS) {
    medianas[m] = mediana(valores[m]);
    campanhasElegiveis[m] = valores[m].length;
  }

  return {
    medianas,
    campanhasElegiveis,
    medianaCustoDaCadeia: mediana(custos),
    campanhasElegiveisCustoDaCadeia: custos.length,
    campanhasComSerie: comSerie,
  };
}

/**
 * As métricas que podem ser LINHA do ranking.
 *
 * ⚠️ CPM e CTR ficam de fora (spec §2.4). `CPC = (CPM/1000) / CTR` é
 * identidade, não coincidência: a queda do CPC já CONTÉM a do CPM e a do CTR.
 * Listar os três daria *"duas oportunidades onde há uma só"* — no cenário
 * dourado da §8, CTR (−33,33%) e CPM (−25%) se enfiavam entre o CPC e o
 * Connect Rate e empurravam o Connect de 3º para 5º (QA-447-02).
 *
 * Eles continuam com teto calculado: `decomporCPC` precisa dos dois para dizer
 * quanto do gap do CPC fecha por cada lado — que é o papel que a spec lhes dá.
 */
const METRICAS_RANQUEAVEIS: readonly Metrica[] = ["cpc", "connectRate", "convLP"];

/**
 * Monta os itens de ranking a partir dos tetos resolvidos e das métricas atuais
 * (AC7). Métrica sem teto **não entra** — compete só contra benchmark.
 */
export function montarRanking(tetos: TetosDoGrupo, atuais: Metricas): ItemRanking[] {
  const itens: ItemRanking[] = [];
  for (const teto of tetosResolvidos(tetos)) {
    if (!METRICAS_RANQUEAVEIS.includes(teto.metrica)) continue;
    const atual = atuais[teto.metrica];
    if (atual === null) continue;
    const queda = quedaReal(teto.metrica, atual, teto.valor);
    if (queda === null) continue;
    itens.push({
      metrica: teto.metrica,
      atual,
      teto: teto.valor,
      queda,
      posicao: POSICAO_NA_CADEIA[teto.metrica],
    });
  }
  return ranquear(itens);
}

/** As métricas de teto num `Metricas`, para alimentar `compostoNoTeto`. */
export function metricasDoTeto(tetos: TetosDoGrupo): Metricas {
  const valor = (m: Metrica) => (tetos[m].valor !== null ? (tetos[m] as Teto).valor : null);
  return {
    cpm: valor("cpm"),
    cpc: valor("cpc"),
    ctr: valor("ctr"),
    connectRate: valor("connectRate"),
    convLP: valor("convLP"),
  };
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

// ─────────────────────────────────────────────────────────────
// Sinalização (spec §6) — Story 44.9 AC6
// ─────────────────────────────────────────────────────────────

export type Selo = "verde" | "amarelo" | "vermelho";

/** Tolerância antes do vermelho: 15% de distância do alvo (spec §6). */
export const TOLERANCIA_DO_ALVO = 0.15;

/**
 * Selo da métrica contra o **alvo vigente** — teto quando existe, benchmark
 * quando não existe (spec §6).
 *
 * ## Por que isto NÃO é apresentação
 *
 * `[decisão @po 2026-08-19]` A spec §6 escreve a regra assim:
 *
 *     🟢 ≥ alvo · 🟡 até 15% abaixo · 🔴 mais de 15% abaixo
 *
 * Isso só vale para métrica em que **maior é melhor**. `DIRECAO` marca `cpm` e
 * `cpc` como `"menor"` — aplicada ao pé da letra, a regra pintaria de VERDE um
 * CPC acima do alvo (que é ruim) e de vermelho um CPC ótimo. Duas das cinco
 * métricas invertidas, e o erro é invisível: a tela fica plausível.
 *
 * Comparação com direção e limiar é **regra**, não estilo — e o agente Inácio
 * consome a REST direto, sem ver a aba. Se a regra morasse no front, ele e a
 * tela classificariam a mesma etapa de formas diferentes. É o mesmo motivo que
 * levou a mediana para cá na Story 44.8.
 *
 * ## O limiar de 15% também inverte
 *
 * Para `maior`, "15% abaixo do alvo" é `atual >= alvo × 0,85`.
 * Para `menor`, o equivalente é `atual <= alvo × 1,15` — **não** `× 0,85`.
 * Usar o mesmo fator dos dois lados aperta o critério do CPC em vez de afrouxar.
 *
 * `null` = não dá para classificar (falta `atual`, falta alvo, ou o alvo é
 * zero/negativo). Regra 7.4: ausência é declarada, nunca vira verde por acaso.
 */
export function sinalizar(
  metrica: Metrica,
  atual: number | null | undefined,
  alvo: number | null | undefined,
): Selo | null {
  if (atual === null || atual === undefined || !Number.isFinite(atual)) return null;
  if (alvo === null || alvo === undefined || !Number.isFinite(alvo)) return null;
  if (alvo <= 0) return null;

  // ⚠️ Arredondar ANTES de comparar, como `coberturaAtipica` faz: a mesma razão
  // pode chegar por caminhos de cálculo diferentes e diferir na 15ª casa, o que
  // faria a mesma etapa mudar de cor entre duas telas.
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const a = r(atual);

  if (DIRECAO[metrica] === "maior") {
    if (a >= r(alvo)) return "verde";
    return a >= r(alvo * (1 - TOLERANCIA_DO_ALVO)) ? "amarelo" : "vermelho";
  }
  // menor é melhor: estar ACIMA do alvo é que é ruim.
  if (a <= r(alvo)) return "verde";
  return a <= r(alvo * (1 + TOLERANCIA_DO_ALVO)) ? "amarelo" : "vermelho";
}

/**
 * O alvo vigente de uma métrica: **teto quando existe, benchmark quando não**
 * (spec §6). `null` quando nenhum dos dois existe — e aí não há selo.
 */
export function alvoVigente(
  teto: Teto | TetoAusente,
  benchmark: number | null | undefined,
): number | null {
  if (teto.valor !== null) return teto.valor;
  return benchmark === null || benchmark === undefined || !Number.isFinite(benchmark)
    ? null
    : benchmark;
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

// -------------------------------------------------------------
// Story 44.11 - o bloco de criativos
//
// A cadeia diz QUAL metrica atacar. Este bloco diz EM QUAL CRIATIVO, com a
// regua da propria etapa: o teto que a aba ja calcula, nao benchmark externo.

/** Uma linha crua de criativo, por `adId`, ja agregada no periodo. */
export interface CriativoBruto {
  adId: string;
  /** `null` quando o nome nao veio - a tela mostra o id e diz que e id. */
  adName: string | null;
  spend: number;
  impressions: number;
  linkClicks: number;
  /**
   * `actions[].video_view` (Story 43.3). `null` = nao e video. Atencao: `0` e
   * afirmacao diferente - e video e ninguem passou de 3s.
   */
  views3s: number | null;
  /** `video_p75_watched_actions`. `null` pelo mesmo motivo. */
  p75: number | null;
}

export interface CriativoDaAba {
  /** Nome do anuncio, ou o `adId` quando nao resolveu. */
  nome: string;
  /** `true` quando `nome` e um id - a tela precisa dizer isso, nao fingir nome. */
  ehId: boolean;
  /** Um Ad Name agrupa N Ad IDs. Todos os que entraram nesta linha. */
  adIds: string[];
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number | null;
  cpc: number | null;
  /** `null` quando nenhum id do grupo e video. */
  hookRate: number | null;
  holdRate: number | null;
}

export interface DistribuicaoHook {
  /** MEDIANA, nao media: a media e arrastada pelo criativo de maior volume. */
  mediana: number;
  melhor: { nome: string; valor: number };
  pior: { nome: string; valor: number };
  /** Quantos criativos estao abaixo de metade da mediana - "mato quantos?". */
  abaixoDeMetadeDaMediana: number;
  /** Quantos criativos de video entraram na conta. */
  criativosDeVideo: number;
}

/**
 * Normaliza o nome do anuncio para agrupar copias.
 *
 * A Meta cria `Nome - Copy`, `Nome - Copia` e `Nome (1)` ao duplicar um
 * anuncio; sao o mesmo criativo com ids diferentes. Agrupar e o que faz a
 * tabela responder "qual criativo" em vez de "qual id".
 */
export function normalizarNomeDeCriativo(nome: string): string {
  return nome
    .trim()
    .replace(/\s*[-—–]\s*(c[oó]pia|copy)\s*\d*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
}

/**
 * Agrupa criativos por nome e RE-DERIVA as taxas dos somatorios.
 *
 * Nunca media de medias. Um Ad ID com 10 impressoes e CTR de 50% nao pode
 * puxar o CTR de um grupo que tem 100.000 impressoes - a taxa do grupo e
 * `sum(cliques) / sum(impressoes)`. Regra do projeto, ja violada antes.
 */
export function agruparCriativos(brutos: CriativoBruto[]): CriativoDaAba[] {
  const grupos = new Map<string, { nome: string; ehId: boolean; itens: CriativoBruto[] }>();
  for (const b of brutos) {
    const bruto = b.adName?.trim();
    const ehId = !bruto;
    const nome = ehId ? b.adId : normalizarNomeDeCriativo(bruto);
    const chave = `${ehId ? "id" : "nome"} ${nome.toLowerCase()}`;
    const g = grupos.get(chave) ?? { nome, ehId, itens: [] };
    g.itens.push(b);
    grupos.set(chave, g);
  }

  return [...grupos.values()]
    .map(({ nome, ehId, itens }) => {
      const spend = itens.reduce((s, x) => s + x.spend, 0);
      const impressions = itens.reduce((s, x) => s + x.impressions, 0);
      const linkClicks = itens.reduce((s, x) => s + x.linkClicks, 0);
      // Video so existe se ALGUM id do grupo tem a metrica. Um grupo misto
      // (video + imagem com o mesmo nome) soma so o que e video.
      const comVideo = itens.filter((x) => x.views3s !== null);
      const views3s = comVideo.length > 0 ? comVideo.reduce((s, x) => s + (x.views3s ?? 0), 0) : null;
      const p75 = comVideo.length > 0 ? comVideo.reduce((s, x) => s + (x.p75 ?? 0), 0) : null;
      // Denominador do Hook e a impressao DOS IDS DE VIDEO, nao a do grupo:
      // misturar imagem no denominador afundaria o Hook de um video bom.
      const impressoesDeVideo = comVideo.reduce((s, x) => s + x.impressions, 0);
      return {
        nome,
        ehId,
        adIds: itens.map((x) => x.adId),
        spend,
        impressions,
        linkClicks,
        ctr: div(linkClicks, impressions),
        cpc: div(spend, linkClicks),
        hookRate: views3s === null ? null : div(views3s, impressoesDeVideo),
        holdRate: p75 === null || views3s === null ? null : div(p75, views3s),
      };
    })
    .sort((a, b) => b.spend - a.spend); // onde o dinheiro esta
}

/**
 * A distribuicao do Hook Rate (@po, 44.11 AC4).
 *
 * Uma etapa com Hook medio de 25% pode ter todos os criativos em 25%, ou
 * metade em 45% e metade em 5%. As acoes sao opostas - na primeira o problema
 * e a oferta, na segunda e matar metade dos criativos. Uma media sozinha nao
 * distingue os dois casos, e por isso nao atende a AC.
 */
export function distribuicaoDoHook(criativos: CriativoDaAba[]): DistribuicaoHook | null {
  const comHook = criativos.filter(
    (c): c is CriativoDaAba & { hookRate: number } => c.hookRate !== null,
  );
  if (comHook.length === 0) return null;

  const med = mediana(comHook.map((c) => c.hookRate));
  if (med === null) return null;
  const ordenado = [...comHook].sort((a, b) => b.hookRate - a.hookRate);
  return {
    mediana: med,
    melhor: { nome: ordenado[0].nome, valor: ordenado[0].hookRate },
    pior: { nome: ordenado[ordenado.length - 1].nome, valor: ordenado[ordenado.length - 1].hookRate },
    abaixoDeMetadeDaMediana: comHook.filter((c) => c.hookRate < med / 2).length,
    criativosDeVideo: comHook.length,
  };
}
