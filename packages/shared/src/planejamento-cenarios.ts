/**
 * Motor de cenários do Painel de Planejamento — a parte pura das abas
 * `[2] Leads Orgânicos` e `[3] Leads Pagos` da planilha (Story 48.2).
 *
 * ## O que um bloco é
 *
 * A aba 2 tem seis blocos iguais (um por canal orgânico) e a aba 3 quatro (um
 * por fonte paga). Um bloco recebe a receita necessária do canal/fonte (aba 1,
 * Story 48.1) e alguns parâmetros manuais, e produz:
 *
 *   1. uma série de dez cenários de receita (RN-011);
 *   2. uma escada de níveis de conversão — 8 níveis nos orgânicos, 10 nos
 *      pagos (RN-012);
 *   3. uma grade nível × cenário de vendas e de leads (RN-013, RN-014) e, nos
 *      pagos, de CPL máximo (RN-025);
 *   4. a classificação em quatro faixas de cada célula (RN-015, RN-026).
 *
 * ## Duas cadeias, lado a lado (decisão D10 do epic; PO-01 da story)
 *
 * O Danilo decidiu arredondar vendas e leads PARA CIMA antes de calcular o
 * que depende deles. Isso cria duas cadeias com nomes parecidos e valores
 * diferentes em toda célula:
 *
 *   - **bruta** (`*Bruto`): quociente sobre quociente, sem arredondar — é a
 *     conta da planilha, o que o apêndice A da spec valida e o que um memorial
 *     na tela mostra;
 *   - **do produto** (sem sufixo): cada passo sobre o inteiro anterior
 *     (`vendas = ⌈receita ÷ ticket⌉`, `leads = ⌈vendas ÷ conversão⌉`,
 *     `cpl = captação ÷ leads`) — é o que alimenta conversão, CPL e totais.
 *
 * O bruto NUNCA parte de um valor arredondado, nem o contrário.
 *
 * ## `null` = "sem base" (decisão D3)
 *
 * Denominador zero ou entrada `null` devolve `null`, e a tela mostra "—".
 * Nunca `NaN`, `Infinity`, `0` disfarçado ou exceção. Regra única para
 * orgânicos e pagos — a planilha tratava cada aba de um jeito (DV-007).
 *
 * ## O que NÃO reproduz da planilha (decisões do Danilo, 2026-09-21)
 *
 *   - DV-006: o cenário 3 da Área de Membros dividia por uma célula vazia e
 *     dava sempre zero. Aqui todo cenário divide pelo ticket.
 *   - DV-007: escada dos pagos podia ficar negativa; erro em cascata nos
 *     pagos e zero silencioso nos orgânicos. Aqui piso zero nas duas e `null`.
 *   - DV-010: os blocos frios liam a variação do bloco quente. Aqui cada
 *     bloco usa os próprios parâmetros.
 *
 * E o que reproduz de propósito: o passo da escada é `variação ÷ 100`
 * (DV-004 — "20 %" reduz 0,2 ponto percentual por nível), os multiplicadores
 * das faixas são 2,5 e 5 (DV-005), e a verba de remarketing é só informativa
 * (DV-009).
 *
 * Módulo FOLHA de propósito: sem imports, para poder ser importado por valor
 * dos dois lados (a API por bare specifier, o web por subpath) sem arrastar o
 * resto do pacote para dentro do bundle do Next.
 */

// ------------------------------------------------------------------
// Taxonomia (RN-040; decisão E3 do epic: constantes, não cadastro)
// ------------------------------------------------------------------

/** Os seis canais orgânicos, na ordem usada no simulador inteiro. */
export const CANAIS_ORGANICOS = [
  "whatsapp",
  "email",
  "instagram",
  "telegram",
  "youtube",
  "area_membros",
] as const;
export type CanalOrganico = (typeof CANAIS_ORGANICOS)[number];

/** As quatro fontes pagas: plataforma × público. */
export const FONTES_PAGAS = ["meta_quente", "meta_frio", "google_quente", "google_frio"] as const;
export type FontePaga = (typeof FONTES_PAGAS)[number];

/** Dez cenários de receita por bloco (colunas J:S da planilha). */
export const CENARIOS = 10;
/** Níveis da escada de conversão: 8 nos orgânicos, 10 nos pagos (como na planilha). */
export const NIVEIS_ORGANICOS = 8;
export const NIVEIS_PAGOS = 10;
/** Fração do cenário 1 sobre a receita necessária — valor inicial da planilha (D1: parametrizável por bloco). */
export const FRACAO_CENARIO_1_PADRAO = 0.7;
/** Multiplicadores fixos das faixas (D11): `lo = ref × (1 − 2,5f)`, `mid = ref × (1 + 2,5f)`, `hi = ref × (1 + 5f)`. */
export const MULTIPLICADOR_FAIXA_INTERNA = 2.5;
export const MULTIPLICADOR_FAIXA_EXTERNA = 5;

/** Índice da faixa de classificação; `null` quando não há base para classificar. */
export type Faixa = 1 | 2 | 3 | 4;

/** Entrada numérica como chega do formulário: vazia (`null`/`undefined`) vale zero (comportamento V0 da planilha). */
export type Entrada = number | null | undefined;

// ------------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------------

/** Vazio vale zero; `NaN` e `±Infinity` também viram zero para nunca contaminarem a grade. */
function n(v: Entrada): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Divisão que devolve `null` em vez de `Infinity`/`NaN` quando não há base. */
function div(numerador: number | null, denominador: number | null): number | null {
  if (numerador === null || denominador === null) return null;
  if (!(denominador > 0) && !(denominador < 0)) return null; // zero, -0, NaN
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/**
 * Arredonda PARA CIMA ao inteiro (D10), imune ao ruído de ponto flutuante:
 * `68 / 0.04` dá `1700.0000000000002` em IEEE-754, e um `Math.ceil` cru
 * devolveria 1701 — um lead a mais que não existe. Seis casas decimais são a
 * precisão com que a spec expressa os seus casos de teste.
 */
function paraCima(x: number | null): number | null {
  if (x === null) return null;
  return Math.ceil(Number(x.toFixed(6)));
}

// ------------------------------------------------------------------
// Funções por regra
// ------------------------------------------------------------------

/**
 * RN-011 — série de dez cenários de receita.
 * `c1 = fracaoCenario1 × metaReceita`; `cn = c(n−1) × (1 + variacaoReceita)`.
 * Meta vazia → dez zeros; variação vazia → dez iguais. Sem arredondamento.
 * Cada bloco passa a PRÓPRIA variação (D4 — não reproduz DV-010).
 */
export function serieDeReceita(
  metaReceita: Entrada,
  fracaoCenario1: Entrada,
  variacaoReceita: Entrada,
): number[] {
  const meta = n(metaReceita);
  const fracao = n(fracaoCenario1);
  const variacao = n(variacaoReceita);
  const serie: number[] = [fracao * meta];
  for (let i = 1; i < CENARIOS; i++) serie.push(serie[i - 1] * (1 + variacao));
  return serie;
}

/**
 * RN-012 — escada de níveis de conversão.
 * `passo = variacaoConversao ÷ 100` (reproduz DV-004: "20 %" = 0,2 p.p. por nível);
 * `n1 = max(conversaoMedia, 0)`; `ni = max(n(i−1) − passo, 0)`.
 * Piso em zero nas duas abas (D3 — não reproduz DV-007).
 */
export function escadaDeConversao(
  conversaoMedia: Entrada,
  variacaoConversao: Entrada,
  niveis: number,
): number[] {
  const passo = n(variacaoConversao) / 100;
  const escada: number[] = [Math.max(n(conversaoMedia), 0)];
  for (let i = 1; i < niveis; i++) escada.push(Math.max(escada[i - 1] - passo, 0));
  return escada;
}

/** RN-010 — leads esperados por campanha: `taxaCaptacao × base`. Vazio vale zero; sem arredondamento. */
export function leadsEsperados(taxaCaptacao: Entrada, base: Entrada): number {
  return n(taxaCaptacao) * n(base);
}

/**
 * RN-024 — divisão da verba da fonte em captação e remarketing.
 * `remarketing` é só informativo (D14): nenhuma outra função deste módulo o lê.
 */
export function dividirVerba(verba: Entrada, pctCaptacao: Entrada): { captacao: number; remarketing: number } {
  const v = n(verba);
  const captacao = v * n(pctCaptacao);
  // "O que sobra" como subtração, não como `v × (1 − pct)`: em IEEE-754,
  // `32000 × (1 − 0,85)` dá 4800,000000000001 e as duas parcelas deixariam de
  // somar a verba. A subtração fecha a conta por construção.
  return { captacao, remarketing: v - captacao };
}

/** Os três limites de uma faixa (RN-015/RN-026, multiplicadores fixos — D11). `null` sem referência. */
export interface LimitesDaFaixa {
  lo: number;
  mid: number;
  hi: number;
}

export function limitesDaFaixa(referencia: Entrada, faixaVariacao: Entrada): LimitesDaFaixa | null {
  if (referencia === null || referencia === undefined || !Number.isFinite(referencia)) return null;
  const f = n(faixaVariacao);
  return {
    lo: referencia * (1 - MULTIPLICADOR_FAIXA_INTERNA * f),
    mid: referencia * (1 + MULTIPLICADOR_FAIXA_INTERNA * f),
    hi: referencia * (1 + MULTIPLICADOR_FAIXA_EXTERNA * f),
  };
}

/**
 * RN-015 / RN-026 — classifica um valor em quatro faixas em torno da referência
 * (leads esperados, ou CPL médio histórico).
 *
 *   faixa 1: `valor < lo` (estrito)
 *   faixa 2: `lo ≤ valor ≤ mid`   ← no limite `mid` vale a 2 (prioridade da planilha)
 *   faixa 3: `mid < valor ≤ hi`
 *   faixa 4: `valor > hi` (estrito)
 *
 * Devolve só o índice; cor e rótulo são da tela (DV-012 em aberto).
 */
export function faixaDe(valor: number | null, referencia: Entrada, faixaVariacao: Entrada): Faixa | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  const l = limitesDaFaixa(referencia, faixaVariacao);
  if (l === null) return null;
  if (valor < l.lo) return 1;
  if (valor <= l.mid) return 2;
  if (valor <= l.hi) return 3;
  return 4;
}

// ------------------------------------------------------------------
// Grades por bloco
// ------------------------------------------------------------------

/** Parâmetros comuns a um bloco (orgânico ou pago). */
export interface ParametrosDoBloco {
  /** Receita necessária do canal/fonte (aba 1). */
  metaReceita: Entrada;
  /** Ticket médio único do lançamento (aba 1). Zero ou vazio → vendas `null`. */
  ticketMedio: Entrada;
  conversaoMedia: Entrada;
  /** Exibido como %, mas o passo é `÷ 100` (DV-004). */
  variacaoConversao: Entrada;
  variacaoReceita: Entrada;
  /** D1 — fração do cenário 1; ausente = 0,70. */
  fracaoCenario1?: Entrada;
  faixaVariacao: Entrada;
}

export interface ParametrosOrganicos extends ParametrosDoBloco {
  /** Tamanho da base do canal (aba 1). */
  base: Entrada;
  taxaCaptacao: Entrada;
}

export interface ParametrosPagos extends ParametrosDoBloco {
  /** Verba da fonte (aba 1). */
  verba: Entrada;
  pctCaptacao: Entrada;
  cplMedioHistorico: Entrada;
}

/** `[nivel][cenario]`, como a spec (`leads[i][n]`). */
export type Grade<T> = T[][];

export interface GradeOrganica {
  receita: number[];
  escada: number[];
  vendasBruto: (number | null)[];
  vendas: (number | null)[];
  leadsBruto: Grade<number | null>;
  leads: Grade<number | null>;
  /** Referência das faixas (RN-010). */
  leadsEsperados: number;
  limites: LimitesDaFaixa | null;
  /** Faixa de cada célula de `leads` (cadeia do produto). */
  faixas: Grade<Faixa | null>;
}

export interface GradePaga {
  receita: number[];
  escada: number[];
  captacao: number;
  /** Só informativo (D14). */
  remarketing: number;
  vendasBruto: (number | null)[];
  vendas: (number | null)[];
  leadsBruto: Grade<number | null>;
  leads: Grade<number | null>;
  cplBruto: Grade<number | null>;
  cpl: Grade<number | null>;
  limites: LimitesDaFaixa | null;
  /** Faixa de cada célula de `cpl` (cadeia do produto). */
  faixas: Grade<Faixa | null>;
}

function fracaoDe(p: ParametrosDoBloco): number {
  return p.fracaoCenario1 === null || p.fracaoCenario1 === undefined ? FRACAO_CENARIO_1_PADRAO : n(p.fracaoCenario1);
}

/** Vendas por cenário, nas duas cadeias (RN-013; D7: todo cenário divide pelo ticket). */
function vendasPorCenario(receita: number[], ticketMedio: Entrada): { bruto: (number | null)[]; arredondado: (number | null)[] } {
  const ticket = n(ticketMedio);
  const bruto = receita.map((c) => div(c, ticket));
  return { bruto, arredondado: bruto.map(paraCima) };
}

/** Leads por nível × cenário, nas duas cadeias (RN-014; conversão zero → `null`). */
function leadsPorCelula(
  escada: number[],
  vendasBruto: (number | null)[],
  vendas: (number | null)[],
): { bruto: Grade<number | null>; arredondado: Grade<number | null> } {
  const bruto = escada.map((conv) => vendasBruto.map((v) => div(v, conv)));
  const arredondado = escada.map((conv) => vendas.map((v) => paraCima(div(v, conv))));
  return { bruto, arredondado };
}

/** Bloco de canal orgânico (aba 2). */
export function gradeOrganica(p: ParametrosOrganicos): GradeOrganica {
  const receita = serieDeReceita(p.metaReceita, fracaoDe(p), p.variacaoReceita);
  const escada = escadaDeConversao(p.conversaoMedia, p.variacaoConversao, NIVEIS_ORGANICOS);
  const v = vendasPorCenario(receita, p.ticketMedio);
  const l = leadsPorCelula(escada, v.bruto, v.arredondado);
  const esperados = leadsEsperados(p.taxaCaptacao, p.base);
  return {
    receita,
    escada,
    vendasBruto: v.bruto,
    vendas: v.arredondado,
    leadsBruto: l.bruto,
    leads: l.arredondado,
    leadsEsperados: esperados,
    limites: limitesDaFaixa(esperados, p.faixaVariacao),
    faixas: l.arredondado.map((linha) => linha.map((x) => faixaDe(x, esperados, p.faixaVariacao))),
  };
}

/** Bloco de fonte paga (aba 3). */
export function gradePaga(p: ParametrosPagos): GradePaga {
  const receita = serieDeReceita(p.metaReceita, fracaoDe(p), p.variacaoReceita);
  const escada = escadaDeConversao(p.conversaoMedia, p.variacaoConversao, NIVEIS_PAGOS);
  const { captacao, remarketing } = dividirVerba(p.verba, p.pctCaptacao);
  const v = vendasPorCenario(receita, p.ticketMedio);
  const l = leadsPorCelula(escada, v.bruto, v.arredondado);
  // RN-025 — CPL máximo = verba de captação ÷ leads; leads zero ou `null` → `null`.
  const cplBruto = l.bruto.map((linha) => linha.map((leads) => div(captacao, leads)));
  const cpl = l.arredondado.map((linha) => linha.map((leads) => div(captacao, leads)));
  const ref = p.cplMedioHistorico;
  return {
    receita,
    escada,
    captacao,
    remarketing,
    vendasBruto: v.bruto,
    vendas: v.arredondado,
    leadsBruto: l.bruto,
    leads: l.arredondado,
    cplBruto,
    cpl,
    limites: limitesDaFaixa(ref, p.faixaVariacao),
    faixas: cpl.map((linha) => linha.map((x) => faixaDe(x, ref, p.faixaVariacao))),
  };
}
