/**
 * Story 18.66 / 18.67 — order bump: representatividade, conversão e AOV.
 *
 * ## O que "order bump" marca, e o que ele NÃO marca
 *
 * A configuração (`stage_sales_spreadsheets.order_bump_products`) lista
 * **produtos**. Ela não diz — e não tem como dizer — qual papel aquele produto
 * cumpriu numa venda específica.
 *
 * Medido na Captação Paga do DG & CPDF (2026-08-24, 1.302 linhas):
 *
 * ```
 *   faturamento total ..................... R$ 119.913,00
 *     produto principal ................... R$  65.262,60  (54,4%)
 *     bump ACESSÓRIO (tem principal) ...... R$  31.528,10  (26,3%)
 *     bump AVULSO (sem principal) ......... R$  23.122,30  (19,3%)
 *
 *   compradores só-bump ....................... 111 de 1.115  (10%)
 * ```
 *
 * Os produtos que aparecem sozinhos explicam por quê:
 *
 * ```
 *    76x  Combo 3 em 1: Gravação da Imersão + GPT 5 Para Negócios + Pack…
 *    32x  Gravação da Imersão Super Funcionário
 *     3x  Claude para Negócios + Gravação
 * ```
 *
 * São produtos vendidos **também** sozinhos. Contar todos como bump daria
 * 45,58% de representatividade, e quem lesse concluiria que quase metade do
 * faturamento vem da caixinha do checkout. Não vem: R$ 23 mil não são acréscimo
 * a venda nenhuma.
 *
 * ## Por que a ligação é por e-mail, e não por transação
 *
 * Medido na mesma planilha: apenas **121 de 268** transações de bump coincidem
 * com uma transação de produto principal. 55% dos bumps têm transação própria —
 * agrupar por `transactionId` perderia mais da metade dos vínculos.
 *
 * ## Módulo puro
 *
 * Sem DB, sem rede. A rota monta as linhas e chama; o teste chama direto. A
 * alternativa — deixar a regra dentro do handler — a tornaria testável só
 * levantando o Fastify inteiro, e na prática ela não seria testada.
 */

import { classifyOrigem, classifyTemperatura } from "./lead-origin.js";

/**
 * Story 18.69 (AC1) — os quatro papéis que um produto cumpre numa venda.
 *
 * ```
 *   principal   — o ingresso / produto de entrada
 *   order_bump  — extra marcado no checkout, linha à parte
 *   combo       — SUBSTITUI o principal, com o extra embutido
 *   upsell      — oferta posterior à compra
 * ```
 *
 * O `combo` é o que faltava, e a ausência dele escondia a maior oferta da
 * captação. Medido no `dg-pg02`: 597 combos, R$ 143.156,20 — **65,97% da
 * receita da captação** — que caíam em `principal` e sumiam da análise. O
 * dashboard reportava 6,2% de conversão em order bump enquanto 32,1% dos
 * compradores levavam a MESMA Gravação pelo combo.
 *
 * Provado por três ângulos independentes:
 *   • preço = lote + R$ 197 em 93,1% dos combos do pg02
 *   • 481 de 562 não têm linha de ingresso no checkout
 *   • ZERO order bumps acompanham um combo — quem já tem, não compra de novo
 */
export type TipoDeProdutoNaVenda =
  | "ingresso"
  | "principal"
  | "order_bump"
  | "combo"
  | "upsell";

/**
 * Story 18.68 (AC7) — os tipos que ANCORAM um checkout de captação.
 *
 * ## Por que `ingresso` é separado de `principal`
 *
 * Os dois são "o produto que a pessoa veio comprar", mas de etapas diferentes:
 *
 * ```
 *   ingresso   — o que a CAPTAÇÃO vende (Imersão, R$ 39,90)
 *   principal  — o que a etapa de VENDAS vende (Mentoria, R$ 4.500)
 * ```
 *
 * Sem essa separação, o default "não classificado = principal" fazia Mentoria
 * ClaudeLab, Automações e Sistemas e Comunidade entrarem no denominador da
 * captação. Medido no `dg-pg02`: a receita da captação saía R$ 447.523,05 em
 * vez de R$ 216.997,05 — **o dobro** — e a representatividade do order bump
 * caía de 6,39% para 3,10%.
 *
 * ## A compatibilidade
 *
 * `principal` ancora **quando o funil não tem nenhum `ingresso` classificado**.
 * É o que mantém o Perpétuo funcionando: lá o produto vendido é o `principal`
 * e não existe ingresso. Na captação, marcar o ingresso passa a excluir os
 * produtos de outras etapas automaticamente.
 */
export function tiposQueAncoram(linhas: LinhaDeVenda[]): Set<TipoDeProdutoNaVenda> {
  const temIngresso = linhas.some((l) => l.tipo === "ingresso");
  return temIngresso
    ? new Set<TipoDeProdutoNaVenda>(["ingresso", "combo"])
    : new Set<TipoDeProdutoNaVenda>(["principal", "combo"]);
}

/**
 * Story 18.70 (AC7) — o papel que um produto NÃO classificado assume, por etapa.
 *
 * ## Por que não pode ser sempre `ingresso`
 *
 * Numa Captação Paga o default certo é `ingresso`: é o que a etapa vende, e
 * quem não foi classificado provavelmente é isso. Numa etapa de Vendas o mesmo
 * default é veneno, e não só para a linha que ele atinge — `tiposQueAncoram()`
 * decide pelo CONJUNTO: basta UMA linha `ingresso` para que `principal` deixe
 * de ancorar em todas as outras.
 *
 * Medido em produção (2026-08-25), etapa Vendas do `dg-pg02`:
 *
 * ```
 *   62 linhas de planilha, classificadas `principal` pelo gestor
 *    9 vendas manuais (PIX), produto com grafia diferente da planilha:
 *         manual   "Mentoria Claude Lab Basic e Advanced"
 *         planilha "mentoria claudelab | basic e advanced"
 *      → fora do mapa → default `ingresso`
 *
 *   Resultado: temIngresso = true, âncoras = {ingresso, combo},
 *   as 62 `principal` saem do denominador e sobram as 9 manuais.
 *   Denominador devolvido: R$ 31.300,00 — exatamente a soma das manuais,
 *   contra R$ 247.877,40 de faturamento real da etapa.
 * ```
 *
 * O `dg-pg04` reproduziu o mesmo: R$ 6.875,00 de denominador, que é a soma
 * exata das suas 3 vendas manuais.
 *
 * Casar a grafia das manuais resolveria estes dois casos e deixaria a armadilha
 * armada para o próximo produto novo que entrar na planilha antes de alguém
 * classificá-lo. O default é que estava errado para esta etapa.
 */
export function tipoPadraoDaEtapa(stageType: string | null | undefined): TipoDeProdutoNaVenda {
  return stageType === "sales" ? "principal" : "ingresso";
}

/** O mínimo que uma linha de venda precisa expor para entrar na análise. */
export interface LinhaDeVenda {
  /** Já normalizado (trim + lowercase). Vazio = comprador anônimo. */
  email: string;
  /**
   * Story 18.69 — o papel do produto NESTA venda, do mapa de classificação.
   * Produto não classificado é `principal`, o default estabelecido pela 29.49.
   */
  tipo: TipoDeProdutoNaVenda;
  /**
   * Story 18.68 (AC1) — quando a venda aconteceu. É o que forma o CHECKOUT.
   *
   * Sem ela não há como distinguir order bump de recompra, e a análise não
   * sai (AC4). Medido: 20 de 20 planilhas em produção têm a data mapeada, e
   * as duas do n8n trazem hora.
   */
  data: Date | null;
  /**
   * Story 18.68 (AC2) — ID do PEDIDO, quando a planilha o traz.
   *
   * ⚠️ Precisa ser validado antes de usar: no `dg-pg02` o `transactionId` é
   * igual ao ID da linha e agruparia nada, silenciosamente. Ver
   * `transacaoAgrupa`.
   */
  transacaoId?: string | null;
  /** Valor bruto da linha. */
  bruto: number;
  utmSource?: string | null;
  utmTerm?: string | null;
}

/**
 * Os cinco públicos (Story 18.67, AC1).
 *
 * Cruzamento de `classifyOrigem` com `classifyTemperatura`, esta última só para
 * os Pagos — a temperatura de um lead orgânico não vem de `utm_term` e inventá-la
 * seria classificação nova.
 *
 * O pedido original falava em três (orgânico, frio, quente). A medição achou
 * cinco, e o balde que faltava — "Sem Track" — tem o MAIOR AOV da tabela
 * (R$ 124,24, o dobro dos demais). Escondê-lo tiraria da tela o público mais
 * rentável.
 */
export type PublicoDeVenda =
  | "Orgânico"
  | "Pago quente"
  | "Pago frio"
  | "Pago indefinido"
  | "Sem Track";

export function classificarPublicoDaVenda(
  utmSource: string | null | undefined,
  utmTerm: string | null | undefined,
): PublicoDeVenda {
  const origem = classifyOrigem(utmSource);
  if (origem === "Orgânico") return "Orgânico";
  if (origem === "Sem Track") return "Sem Track";
  const temp = classifyTemperatura(utmTerm);
  return temp === "quente" ? "Pago quente" : temp === "frio" ? "Pago frio" : "Pago indefinido";
}

/**
 * Story 29.61 (AC3-bis) — piso de compradores para a taxa ser exibida com
 * autoridade normal.
 *
 * 10 separa em dois grupos naturais os quatro baldes medidos no perpétuo do
 * Netão (94 e 13 de um lado; 3 e 2 do outro). Não é um número mágico: é o
 * ponto em que uma conversão a mais deixa de mover a taxa em mais de 10 pontos.
 */
export const PISO_DE_AMOSTRA = 10;

/**
 * Story 18.68 (AC1) — a janela que define "mesmo checkout", em milissegundos.
 *
 * Medido nos exports da Kiwify (2026-08-24/25): a distribuição da distância
 * entre compras consecutivas do mesmo e-mail é BIMODAL, com um vale quase
 * absoluto no meio —
 *
 * ```
 *              pg02   pg04
 *   ≤ 60s       202    186     ← todos entre 0 e 6 segundos
 *   1–5 min       0      0
 *   5–60 min      0      3
 *   > 1 dia     144     82
 * ```
 *
 * e os 388 pares de segundos são **100% de produtos diferentes**, zero
 * repetições. Não é um limiar escolhido: é um vale observado.
 *
 * 60s é folgado de propósito — o maior gap real dentro de um checkout foi 6s
 * (pg04) e 48s num caso isolado do pg02. A folga não captura recompra porque
 * o vale vai até 1 hora.
 */
export const JANELA_DE_CHECKOUT_MS = 60_000;

/**
 * Story 18.68 (AC2) — o `transactionId` desta planilha agrupa um pedido?
 *
 * ⚠️ Nem sempre. No `dg-pg04` ele é o ID do pedido e agrupa 126 pedidos
 * multi-produto; no `dg-pg02` é **igual ao ID da linha** e todos os valores
 * são únicos. Usá-lo lá reportaria zero order bump, em silêncio.
 *
 * O teste é direto: se todo valor aparece uma vez só, não é ID de pedido.
 */
export function transacaoAgrupa(linhas: LinhaDeVenda[]): boolean {
  const vistos = new Map<string, number>();
  for (const l of linhas) {
    const t = (l.transacaoId ?? "").trim();
    if (!t) continue;
    vistos.set(t, (vistos.get(t) ?? 0) + 1);
  }
  if (vistos.size === 0) return false;
  for (const n of vistos.values()) if (n > 1) return true;
  return false;
}

/** Story 18.68 (AC3) — qual sinal governou o agrupamento. */
export type SinalDeCheckout = "transacao" | "janela" | "indisponivel";

/**
 * Agrupa as linhas em CHECKOUTS.
 *
 * ⚠️ Story 18.68 — esta é a mudança central. A regra anterior agrupava por
 * COMPRADOR e ignorava a data, então contava recompra como order bump: 51% do
 * "bump acessório" do `dg-pg02` era de outra data, com mediana de 13 dias.
 *
 * AC5 — a janela agrupa em CADEIA, não em pares: três linhas a 0s, 2s e 4s são
 * UM checkout. Um pedido com principal + bump + upsell existe e precisa ficar
 * inteiro.
 */
export function agruparEmCheckouts(
  linhas: LinhaDeVenda[],
): { checkouts: LinhaDeVenda[][]; sinal: SinalDeCheckout } {
  if (linhas.length === 0) return { checkouts: [], sinal: "indisponivel" };

  // Nível 1 da cascata: o pedido, quando ele existe de verdade.
  if (transacaoAgrupa(linhas)) {
    const porTx = new Map<string, LinhaDeVenda[]>();
    const soltas: LinhaDeVenda[][] = [];
    for (const l of linhas) {
      const t = (l.transacaoId ?? "").trim();
      // Linha sem transação não vira um balde vazio compartilhado — cada uma é
      // o seu próprio checkout, como o comprador anônimo do AC6.
      if (!t) { soltas.push([l]); continue; }
      const atual = porTx.get(t);
      if (atual) atual.push(l);
      else porTx.set(t, [l]);
    }
    return { checkouts: [...porTx.values(), ...soltas], sinal: "transacao" };
  }

  // Nível 2: e-mail + janela. Exige data (AC4).
  const temData = linhas.some((l) => l.data instanceof Date);
  if (!temData) return { checkouts: [], sinal: "indisponivel" };

  const porEmail = new Map<string, LinhaDeVenda[]>();
  const anonimas: LinhaDeVenda[][] = [];
  linhas.forEach((l) => {
    // AC6 — sem e-mail não há como formar checkout: cada linha é a sua.
    if (!l.email) { anonimas.push([l]); return; }
    const atual = porEmail.get(l.email);
    if (atual) atual.push(l);
    else porEmail.set(l.email, [l]);
  });

  const checkouts: LinhaDeVenda[][] = [...anonimas];
  for (const doComprador of porEmail.values()) {
    const comData = doComprador.filter((l) => l.data instanceof Date);
    const semData = doComprador.filter((l) => !(l.data instanceof Date));
    // Linha sem data no meio de um comprador que tem data: não dá para saber a
    // qual checkout pertence. Vira a sua própria, em vez de entrar na cadeia
    // pela ordem do array — que seria arbitrária.
    for (const l of semData) checkouts.push([l]);

    comData.sort((a, b) => a.data!.getTime() - b.data!.getTime());
    let atual: LinhaDeVenda[] = [];
    for (const l of comData) {
      if (atual.length === 0) { atual = [l]; continue; }
      const ultimo = atual[atual.length - 1]!;
      // Compara com a ÚLTIMA linha do grupo, não com a primeira: é o que faz o
      // agrupamento ser em cadeia (AC5).
      if (l.data!.getTime() - ultimo.data!.getTime() <= JANELA_DE_CHECKOUT_MS) atual.push(l);
      else { checkouts.push(atual); atual = [l]; }
    }
    if (atual.length > 0) checkouts.push(atual);
  }
  return { checkouts, sinal: "janela" };
}

export interface ResumoOrderBump {
  /** A etapa tem ao menos um produto marcado como order bump. */
  temConfiguracao: boolean;
  /**
   * Story 29.74 (AC7) — faturamento da ETAPA: a soma de **todas** as linhas de
   * receita do recorte, sem exceção. É o mesmo número que o card imprime
   * (`R$ 57.549,00` no BBE a1, medido em 2026-09-04).
   *
   * ⚠️ Até a 29.74 este campo valia `receitaBase + bumpAcessorio` — sem o bump
   * avulso e sem os checkouts que não ancoram. O resultado era o tooltip deste
   * card dizendo "Faturamento total da etapa: R$ 55.814,00" na mesma tela em
   * que o card do topo dizia R$ 57.549,00. Decisão do gestor: o produto tem UMA
   * definição de faturamento, e é esta.
   *
   * **Não use este campo como denominador de taxa** — para isso existe
   * `receitaCaptacao`, logo abaixo.
   */
  faturamentoTotal: number;
  /**
   * Story 29.74 (AC8) — o denominador das taxas: `receitaBase + bumpAcessorio`.
   *
   * É o valor que `faturamentoTotal` tinha antes, agora com nome próprio. A
   * regra é da Story 18.68 (AC7) e continua intacta: o bump avulso é venda de
   * OUTRA oferta, e mantê-lo aqui dilui a métrica com receita que não é do
   * funil. Medido lá: no dg-pg02 o denominador "total" incluía R$ 252.772 de
   * Mentoria, Automações e Comunidade, e a representatividade saía 2,95% em vez
   * de 6,39%; no pg04, 8,13% em vez de 23,96%.
   */
  receitaCaptacao: number;
  /** Receita de produto NÃO marcado como bump. */
  faturamentoPrincipal: number;
  /** Bump de quem TEM produto principal — o bump de verdade (AC2 da 18.66). */
  bumpAcessorio: number;
  /**
   * Bump de quem NÃO tem principal: venda própria desses produtos (AC3).
   *
   * Story 29.74: passou a CONTAR em `faturamentoTotal` — foi vendido, é
   * faturamento. Continua fora de `receitaCaptacao`, que é outra pergunta.
   */
  bumpAvulso: number;
  /** `bumpAcessorio ÷ receitaCaptacao`. `null` quando não há receita. */
  representatividade: number | null;
  /** Compradores com ao menos um produto principal. */
  compradoresComPrincipal: number;
  /** Destes, quantos levaram ao menos um bump acessório (AC4). */
  compradoresComBump: number;
  /** `compradoresComBump ÷ compradoresComPrincipal`. */
  taxaDeAdesao: number | null;
  /** Compradores que só têm linhas de produto marcado como bump. */
  compradoresSoBump: number;
  /** Story 18.68 (AC3) — qual sinal governou o agrupamento em checkouts. */
  sinalDeCheckout: SinalDeCheckout;
  /** Story 18.69 — receita de produtos do tipo `combo`. */
  comboReceita: number;
  /** `comboReceita ÷ receita da captação`. */
  comboRepresentatividade: number | null;
  compradoresComCombo: number;
  /** `compradoresComCombo ÷ checkouts de captação`. */
  taxaDeCombo: number | null;
  /**
   * AOV geral — valor médio do pedido, com os adicionais somados.
   *
   * `receita da captação ÷ checkouts de captação`.
   *
   * A base é a MESMA da tabela por público (só quem tem produto principal), e
   * por isso o card fecha com a linha "Total" dela. Incluir os compradores
   * só-bump aqui daria um número que não bate com nenhuma linha da tabela logo
   * abaixo — e o leitor tentaria reconciliar os dois.
   *
   * `null` sem compradores: dividir por zero não é "R$ 0,00".
   */
  aovGeral: number | null;
}

export interface LinhaDePublico {
  publico: PublicoDeVenda;
  compradores: number;
  compradoresComBump: number;
  /** `compradoresComBump ÷ compradores` (Story 18.67, AC3). */
  taxaBump: number | null;
  /** Story 18.69 — compradores que levaram um COMBO. */
  compradoresComCombo: number;
  /** `compradoresComCombo ÷ compradores`. */
  taxaCombo: number | null;
  /** Receita de combo do público. */
  receitaCombo: number;
  /** Story 29.61 (AC3) — compradores com ao menos um upsell. */
  compradoresComUpsell: number;
  /** `compradoresComUpsell ÷ compradores`. */
  taxaUpsell: number | null;
  /** Receita de upsell do público. */
  receitaUpsell: number;
  /**
   * Story 29.61 (AC3-bis, gate PO F2) — a amostra é pequena demais para a taxa
   * se apresentar com a mesma autoridade das outras.
   *
   * "Pago frio: 3 compradores, 0,0%" se lê como "esse público não adere ao
   * bump". Significa "três pessoas não aderiram". E o achado que motivou a
   * story — 46,2% no orgânico — vem de 13 compradores e 6 conversões: grande o
   * bastante para investigar, pequeno o bastante para virar por acaso.
   *
   * A linha NÃO some: o balde existe e o AOV dele vale.
   */
  amostraBaixa: boolean;
  /** Receita de produto principal do público. */
  receitaPrincipal: number;
  /** Receita de bump acessório do público. */
  receitaBump: number;
  /** `receitaPrincipal ÷ compradores` (AC4). */
  aovSemBump: number | null;
  /**
   * `(principal + bump + upsell) ÷ compradores` (AC4 das duas stories).
   *
   * ⚠️ O nome fala em "bump" por herança da 18.67 e o cálculo soma TODOS os
   * adicionais — no Perpétuo, upsell inclusive. Renomear quebraria o contrato
   * com a Captação Paga sem ganho: lá `upsell` é sempre zero.
   */
  aovComBump: number | null;
}

/** Um checkout consolidado — a unidade de análise desde a Story 18.68. */
interface Checkout {
  /** Receita de produto `principal` ou `combo` — a base do pedido. */
  base: number;
  bump: number;
  nBumps: number;
  upsell: number;
  nUpsells: number;
  combo: number;
  nCombos: number;
  /** Tem produto `principal` ou `combo` — é um checkout de CAPTAÇÃO (AC7). */
  ehCaptacao: boolean;
  publico: PublicoDeVenda | null;
}

/**
 * Consolida cada checkout.
 *
 * ⚠️ Story 18.68 — a unidade mudou de COMPRADOR para CHECKOUT. Quem compra o
 * ingresso em maio e o mesmo produto avulso em junho tem dois checkouts, e
 * apenas o primeiro pode ter order bump. Antes os dois colapsavam num só e a
 * recompra virava bump.
 */
function consolidar(linhas: LinhaDeVenda[]): { checkouts: Checkout[]; sinal: SinalDeCheckout } {
  const { checkouts: grupos, sinal } = agruparEmCheckouts(linhas);
  const ancoram = tiposQueAncoram(linhas);
  const out: Checkout[] = [];
  for (const g of grupos) {
    const c: Checkout = {
      base: 0, bump: 0, nBumps: 0, upsell: 0, nUpsells: 0,
      combo: 0, nCombos: 0, ehCaptacao: false, publico: null,
    };
    /**
     * Dois passes de propósito.
     *
     * Se o checkout é de captação, TODA linha dele entra na receita — a pessoa
     * pagou junto, no mesmo pedido. Um passe só decidiria isso na ordem do
     * array: um produto não classificado que viesse ANTES do ingresso ficaria
     * de fora, e o mesmo produto depois entraria.
     *
     * Medido: no `dg-pg04` são 25 vendas de "Claude para Negócios"
     * (R$ 1.925,00) dentro de checkouts de captação, sem estar classificadas.
     * A pessoa pagou; o número tem que refletir isso.
     */
    c.ehCaptacao = g.some((l) => ancoram.has(l.tipo));
    for (const l of g) {
      switch (l.tipo) {
        case "order_bump": c.bump += l.bruto; c.nBumps += 1; break;
        case "upsell": c.upsell += l.bruto; c.nUpsells += 1; break;
        case "combo":
          c.combo += l.bruto; c.nCombos += 1;
          c.base += l.bruto;
          // AC2 da 18.67 — o público vem do produto que ANCORA o pedido.
          if (ancoram.has(l.tipo)) c.publico ??= classificarPublicoDaVenda(l.utmSource, l.utmTerm);
          break;
        default:
          // `ingresso` ancora a captação; `principal` só quando o funil não tem
          // ingresso classificado (é o caso do Perpétuo).
          //
          // Produto de outra etapa (Mentoria, Automações) NÃO ancora — mas se
          // cair dentro de um checkout que já é de captação, soma na receita
          // dele: foi pago no mesmo pedido.
          if (c.ehCaptacao) c.base += l.bruto;
          if (ancoram.has(l.tipo)) c.publico ??= classificarPublicoDaVenda(l.utmSource, l.utmTerm);
      }
    }
    out.push(c);
  }
  return { checkouts: out, sinal };
}

export function resumirOrderBump(
  linhas: LinhaDeVenda[],
  temConfiguracao: boolean,
): ResumoOrderBump {
  const { checkouts, sinal } = consolidar(linhas);
  let receitaBase = 0, bumpAcessorio = 0, bumpAvulso = 0, comboReceita = 0;
  let nCaptacao = 0, comBump = 0, comCombo = 0, soBump = 0;

  for (const c of checkouts) {
    if (c.ehCaptacao) {
      nCaptacao += 1;
      receitaBase += c.base;
      bumpAcessorio += c.bump;
      comboReceita += c.combo;
      if (c.nBumps > 0) comBump += 1;
      if (c.nCombos > 0) comCombo += 1;
    } else {
      // Checkout sem produto de captação: o bump dali é venda própria daquele
      // produto, não acréscimo a venda nenhuma (Story 18.66, AC1).
      soBump += 1;
      bumpAvulso += c.bump;
    }
  }

  /**
   * Story 18.68 (AC7) — o denominador é a receita da CAPTAÇÃO.
   *
   * A regra anterior usava "o faturamento total da etapa", o que só funciona
   * quando a planilha tem apenas vendas de captação. A do DG & CPDF não tem:
   * 54% do que está lá é Mentoria (R$ 130.500), Automações (R$ 142.700) e
   * Comunidade — de outras etapas. Um punhado de vendas de R$ 4.500 desloca o
   * denominador mais que centenas de ingressos de R$ 39,90.
   *
   * Medido: a representatividade do order bump no pg02 sai de 2,95% para
   * 6,39%, e a do pg04 de 8,13% para 23,96%.
   *
   * ⚠️ Gate PO (F1): "checkout de captação" é definido por TIPO
   * (`principal` ou `combo`), nunca por nome de produto. Exigir o "produto de
   * entrada" excluiria os 597 checkouts de combo do pg02 — 68% do denominador.
   */
  const receitaCaptacao = receitaBase + bumpAcessorio;

  /**
   * Story 29.74 (AC7) — o faturamento da etapa sai das LINHAS, não dos
   * checkouts consolidados.
   *
   * `consolidar()` só soma `c.base` quando o checkout ancora, então derivar o
   * total dali deixaria de fora o bump avulso e as linhas de checkouts que não
   * ancoram — que é justamente o que fazia este número divergir do card.
   * Somando as linhas, ele passa a ser, por construção, o mesmo valor que a
   * rota calcula: no Perpétuo `Σ dedupMap` e no Lançamento `totalBruto` somam
   * exatamente estas linhas.
   */
  const faturamentoDaEtapa = linhas.reduce((s, l) => s + l.bruto, 0);

  return {
    temConfiguracao,
    sinalDeCheckout: sinal,
    faturamentoTotal: faturamentoDaEtapa,
    receitaCaptacao,
    faturamentoPrincipal: receitaBase,
    bumpAcessorio,
    bumpAvulso,
    representatividade: receitaCaptacao > 0 ? bumpAcessorio / receitaCaptacao : null,
    comboReceita,
    comboRepresentatividade: receitaCaptacao > 0 ? comboReceita / receitaCaptacao : null,
    compradoresComCombo: comCombo,
    taxaDeCombo: nCaptacao > 0 ? comCombo / nCaptacao : null,
    compradoresComPrincipal: nCaptacao,
    compradoresComBump: comBump,
    taxaDeAdesao: nCaptacao > 0 ? comBump / nCaptacao : null,
    compradoresSoBump: soBump,
    aovGeral: nCaptacao > 0 ? receitaCaptacao / nCaptacao : null,
  };
}

/**
 * Story 18.67 — a tabela por público.
 *
 * Só compradores **com produto principal** entram: quem só tem bump não tem
 * público (a linha do bump não carrega `utm_term` em 54% dos casos), e
 * inventá-lo seria atribuir venda a uma origem que não se sabe.
 *
 * Balde sem comprador **não vira linha** (AC6) — some, em vez de aparecer com
 * zeros que o olho lê como "esse público não converte".
 */
export function tabelaPorPublico(linhas: LinhaDeVenda[]): LinhaDePublico[] {
  const { checkouts } = consolidar(linhas);
  const acc = new Map<PublicoDeVenda, LinhaDePublico>();

  for (const c of checkouts) {
    // Só checkout de captação tem público: quem levou apenas um produto de
    // bump, sem principal nem combo, não tem origem conhecida (54% das linhas
    // de bump não trazem `utm_term`), e inventá-la seria atribuir venda a uma
    // origem que não se sabe.
    if (!c.ehCaptacao || !c.publico) continue;
    let e = acc.get(c.publico);
    if (!e) {
      e = {
        publico: c.publico, compradores: 0,
        compradoresComBump: 0, taxaBump: null,
        compradoresComCombo: 0, taxaCombo: null, receitaCombo: 0,
        compradoresComUpsell: 0, taxaUpsell: null, receitaUpsell: 0,
        amostraBaixa: false,
        receitaPrincipal: 0, receitaBump: 0,
        aovSemBump: null, aovComBump: null,
      };
      acc.set(c.publico, e);
    }
    e.compradores += 1;
    // AC3 — COMPRADORES, não linhas. Quem leva dois bumps é uma conversão.
    if (c.nBumps > 0) e.compradoresComBump += 1;
    if (c.nCombos > 0) e.compradoresComCombo += 1;
    if (c.nUpsells > 0) e.compradoresComUpsell += 1;
    // `base` já inclui o combo — é a receita que ancora o pedido.
    e.receitaPrincipal += c.base;
    e.receitaBump += c.bump;
    e.receitaCombo += c.combo;
    e.receitaUpsell += c.upsell;
  }

  return [...acc.values()]
    .map((e) => ({
      ...e,
      taxaBump: e.compradores > 0 ? e.compradoresComBump / e.compradores : null,
      taxaCombo: e.compradores > 0 ? e.compradoresComCombo / e.compradores : null,
      taxaUpsell: e.compradores > 0 ? e.compradoresComUpsell / e.compradores : null,
      amostraBaixa: e.compradores < PISO_DE_AMOSTRA,
      aovSemBump: e.compradores > 0 ? e.receitaPrincipal / e.compradores : null,
      aovComBump:
        e.compradores > 0
          ? (e.receitaPrincipal + e.receitaBump + e.receitaUpsell) / e.compradores
          : null,
    }))
    // AC7 — por compradores, decrescente. Ordenar por taxa poria um balde de 3
    // pessoas no topo, e três pessoas não sustentam uma taxa.
    .sort((a, b) => b.compradores - a.compradores);
}
