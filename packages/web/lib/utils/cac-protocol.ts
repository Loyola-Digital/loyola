/**
 * Port TypeScript do `reverse_calculation` do LOYOLA-X-CAC-PROTOCOL v1.0.0.
 *
 * Contrato de autoridade, definido pelo próprio protocolo:
 *   - o YAML manda na SEMÂNTICA (o que cada variável significa);
 *   - `cac_engine.py` manda na ARITMÉTICA (ordem de operações, arredondamento).
 * Este arquivo implementa a segunda; onde divergir do engine, o engine vence.
 *
 * Por que TypeScript e não rodar o Python: Railway e Vercel executam Node. O
 * engine é especificação executável, não dependência de runtime.
 *
 * A regra de ouro do protocolo (GR-01, NO_INFERENCE) é o que molda este
 * módulo: nenhuma função devolve número plausível quando falta dado. Ou o
 * valor tem procedência, ou o resultado é `null` com o motivo nomeado. Não há
 * default em lugar nenhum.
 */

/** Story 29.35: rótulo de procedência exigido por GR-01.e em toda saída. */
export type DerivationStatus =
  | "MEASURED"
  | "DERIVED"
  | "STATED"
  | "PROJECTED"
  | "MISSING"
  | "UNKNOWN";

/**
 * Base do ticket informado. Sem isto o cálculo NÃO roda (RC-01).
 *
 * `NET_OF_REFUNDS` significa que o ticket já está líquido de devoluções —
 * deduzir reembolso de novo seria contar a mesma perda duas vezes, derrubando
 * o CAC alvo e reprovando funis saudáveis no gate de kill/continue.
 */
export type TicketBasis = "GROSS" | "NET_OF_REFUNDS";

export interface TargetCacInputs {
  /** Ticket médio. Derivado de faturamento bruto ÷ vendas — inclui order bumps. */
  ticket: number | null;
  ticketBasis: TicketBasis;
  /** Decimais em (0, 1]. Percentual é coisa de tela, não de fórmula (U-01). */
  margemDesejada: number | null;
  imposto: number | null;
  gatewayPct: number | null;
  /** Parcela fixa do gateway, em reais. */
  /**
   * Story 29.39 — taxa do gateway de PAGAMENTO, como fração do ticket.
   *
   * Era `gatewayFixo` (R$/transação) até a 29.39. O protocolo modela a parcela
   * fixa porque ela existe no mercado; o gateway desta operação não a tem — o
   * custo inteiro varia com o faturamento.
   *
   * Isto NÃO é desvio do LOYOLA-X-CAC-PROTOCOL: o modelo M-DECK já prevê um
   * componente percentual (`gatewayPct`), e aqui há uma segunda fonte percentual,
   * de origem distinta. As duas seguem rastreáveis separadamente no memorial —
   * que é o que o protocolo exige. Quem comparar código e YAML vai ver
   * `gateway_fixo` lá e não aqui: a razão é esta, e não esquecimento.
   */
  gatewayPctVar: number | null;
  cmv: number | null;
  /**
   * Provisões de reembolso/chargeback. No Loyola X ficam em 0 porque essas
   * vendas já saem do faturamento ex-post (`isRefundBucket`) — ver RC-01.
   */
  reembolso: number | null;
  chargeback: number | null;
}

export interface TargetCacLine {
  label: string;
  value: number;
}

export interface TargetCacResult {
  /** `null` quando falta input — nunca um número plausível (GR-01.a). */
  value: number | null;
  /**
   * Valor SEM arredondar. É daqui que sai qualquer derivação posterior — o
   * limiar de kill/continue, por exemplo.
   *
   * Derivar do `value` já arredondado violaria ROUND-01 e produz divergência
   * real: 204,545 × 1,3 = 265,9085 → R$ 265,91, enquanto 204,55 × 1,3 =
   * 265,915 → R$ 265,92. Um centavo, mas é o sintoma de arredondar no meio.
   */
  valueExact: number | null;
  status: DerivationStatus;
  /** Memorial linha a linha. A conta que produziu o número, não só o número. */
  lines: TargetCacLine[];
  /** Nomes dos inputs ausentes. Vazio quando `value` existe. */
  missing: string[];
  /** Expressão literal com os valores substituídos (GR-01, evidence). */
  expression: string | null;
  caveats: string[];
}

/**
 * Aviso de escopo D7 do protocolo. Obrigatório em toda saída de CAC alvo.
 *
 * É o defeito mais caro da fonte: um funil pode passar em todos os testes
 * deste módulo e ainda dar prejuízo, porque equipe, ferramentas e comissão não
 * aparecem em nenhuma linha da equação.
 */
export const SCOPE_WARNING_D7 =
  "Este CAC alvo é TETO DE MÍDIA por cliente. Equipe, ferramentas e comissão " +
  "NÃO estão cobertos por nenhuma linha — precisam estar embutidos na margem " +
  "desejada, senão a margem realizada sai abaixo da planejada mesmo com o CAC " +
  "batendo a meta.";

/** Erro de invariante do protocolo. Aborta o cálculo em vez de degradar. */
export class ProtocolViolation extends Error {
  constructor(public readonly rule: string, message: string) {
    super(`${rule}: ${message}`);
    this.name = "ProtocolViolation";
  }
}

/**
 * U-01 — toda taxa vive em (0, 1].
 *
 * Zero também aborta, e isso é deliberado: taxa zero quase sempre significa
 * etapa não medida, não etapa com conversão nula real. Deixar passar tornaria
 * o CAC infinito silenciosamente.
 */
export function assertRate(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new ProtocolViolation("U-01", `${name} não é um número finito.`);
  }
  if (value <= 0 || value > 1) {
    throw new ProtocolViolation(
      "U-01",
      `${name} = ${value} fora de (0, 1]. Provável valor em pontos percentuais — dividir por 100.`,
    );
  }
  return value;
}

/**
 * ROUND-01 — arredondar SOMENTE no valor final.
 *
 * A fonte reporta R$ 204,54 porque arredonda o gateway (32,455 → 32,46) antes
 * de subtrair. Arredondando só no fim dá R$ 204,55. A diferença de R$ 0,01 é
 * esperada, documentada, e o valor correto é o nosso.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * CAC alvo pelo modelo M-DECK — o da fonte, e o mais conservador.
 *
 * M-EXACT (unidade econômica) fica de fora porque exige quatro declarações
 * contratuais que ninguém tem hoje: se o gateway devolve taxa no estorno, se o
 * CMV é recuperado, se o imposto incide sobre receita líquida, e se a margem é
 * sobre bruto ou líquido. Inventar qualquer uma delas violaria GR-01.
 */
export function targetCacDeck(input: TargetCacInputs): TargetCacResult {
  const caveats = [SCOPE_WARNING_D7];

  // GR-01.a — ausência de dado é MISSING, jamais um default.
  const required: Array<[string, number | null]> = [
    ["ticket médio", input.ticket],
    ["margem desejada", input.margemDesejada],
    ["imposto", input.imposto],
    ["gateway da plataforma %", input.gatewayPct],
    ["gateway de pagamento %", input.gatewayPctVar],
    ["CMV", input.cmv],
  ];
  const missing = required.filter(([, v]) => v == null).map(([name]) => name);
  if (missing.length > 0) {
    return { value: null, valueExact: null, status: "MISSING", lines: [], missing, expression: null, caveats };
  }

  const ticket = input.ticket as number;
  const reembolso = input.reembolso ?? 0;
  const chargeback = input.chargeback ?? 0;

  // RC-01 — guarda de dupla dedução. Ticket já líquido de devoluções + provisão
  // de reembolso = a mesma perda contada duas vezes.
  if (input.ticketBasis === "NET_OF_REFUNDS" && (reembolso > 0 || chargeback > 0)) {
    throw new ProtocolViolation(
      "RC-01",
      "ticketBasis = NET_OF_REFUNDS com reembolso ou chargeback > 0. " +
        "O ticket já está líquido de devoluções; deduzir a linha de novo derruba " +
        "o CAC alvo e reprova funis saudáveis.",
    );
  }

  if (!(ticket > 0)) {
    throw new ProtocolViolation("U-02", `ticket médio = ${ticket} não é > 0.`);
  }
  assertRate(input.margemDesejada as number, "margem desejada");
  assertRate(input.imposto as number, "imposto");
  assertRate(input.gatewayPct as number, "gateway da plataforma %");
  assertRate(input.gatewayPctVar as number, "gateway de pagamento %");

  const margem = ticket * (input.margemDesejada as number);
  const imposto = ticket * (input.imposto as number);
  // Duas deduções distintas sobre o mesmo ticket: a taxa da plataforma de vendas
  // e a do gateway de pagamento. Somá-las numa linha só daria o mesmo total e
  // esconderia qual delas mudou — e o memorial existe justamente para isso.
  const gatewayPlataforma = ticket * (input.gatewayPct as number);
  const gatewayPagamento = ticket * (input.gatewayPctVar as number);
  const cmv = input.cmv as number;
  const reembolsoBrl = ticket * reembolso;
  const chargebackBrl = ticket * chargeback;

  const lines: TargetCacLine[] = [
    { label: "Ticket médio", value: ticket },
    { label: "− Margem desejada", value: -margem },
    { label: "− Imposto", value: -imposto },
    { label: "− Gateway plataforma", value: -gatewayPlataforma },
    { label: "− Gateway pagamento", value: -gatewayPagamento },
    { label: "− CMV", value: -cmv },
  ];
  if (reembolsoBrl > 0) lines.push({ label: "− Reembolso", value: -reembolsoBrl });
  if (chargebackBrl > 0) lines.push({ label: "− Chargeback", value: -chargebackBrl });

  // Soma dos termos exatos; o arredondamento acontece uma única vez, no fim.
  const exact = lines.reduce((acc, l) => acc + l.value, 0);

  return {
    value: roundMoney(exact),
    valueExact: exact,
    status: "DERIVED",
    lines,
    missing: [],
    expression:
      `${ticket} − ${margem} − ${imposto} − ${gatewayPlataforma} − ${gatewayPagamento} − ${cmv}` +
      (reembolsoBrl > 0 ? ` − ${reembolsoBrl}` : "") +
      (chargebackBrl > 0 ? ` − ${chargebackBrl}` : "") +
      ` = ${roundMoney(exact)}`,
    caveats,
  };
}

/**
 * Limiar da 2ª pergunta do kill/continue: o funil segue se o CAC realizado
 * ficar a até 30% acima do alvo.
 */
export const KILL_CONTINUE_TOLERANCE = 1.3;

/**
 * Limiar de continuidade. Recebe o CAC alvo EXATO, não o exibido.
 *
 * Derivar do valor já arredondado é o erro que ROUND-01 existe para impedir:
 * 204,545 × 1,3 = 265,9085 → R$ 265,91 (correto, bate com o engine), contra
 * 204,55 × 1,3 = 265,915 → R$ 265,92. O centavo não importa; importa que
 * arredondar no meio da cadeia é um método errado que às vezes acerta.
 */
export function killContinueThreshold(targetCacExact: number | null): number | null {
  return targetCacExact == null ? null : roundMoney(targetCacExact * KILL_CONTINUE_TOLERANCE);
}

export type GapVerdict = "ESCALAR" | "ZONA_DE_TOLERANCIA" | "PAUSAR" | "UNKNOWN";

export interface GapResult {
  verdict: GapVerdict;
  /** Quanto o realizado excede (ou fica abaixo) do alvo, em %. */
  deltaPct: number | null;
  threshold: number | null;
  note: string;
}

/**
 * Compara CAC realizado com o alvo.
 *
 * MTAX-04 — as duas pontas já estão na mesma base (caixa): o realizado carrega
 * o gross-up de 12,15% aplicado no backend, e o alvo é o resíduo da equação de
 * margem, onde "tráfego" é desembolso real. Por isso NÃO existe linha de
 * imposto sobre mídia no CAC alvo: seria dupla contagem.
 */
export function compareToTarget(realizedCac: number | null, targetCac: number | null): GapResult {
  const threshold = killContinueThreshold(targetCac);
  if (realizedCac == null || targetCac == null || threshold == null) {
    return {
      verdict: "UNKNOWN",
      deltaPct: null,
      threshold,
      note:
        realizedCac == null
          ? "CAC realizado indisponível — sem vendas no período ou sem fonte de vendas conectada."
          : "CAC alvo indisponível — preencher os inputs do produto.",
    };
  }
  const deltaPct = ((realizedCac - targetCac) / targetCac) * 100;
  if (realizedCac <= targetCac) {
    return { verdict: "ESCALAR", deltaPct, threshold, note: "CAC realizado dentro do teto de mídia." };
  }
  if (realizedCac <= threshold) {
    return {
      verdict: "ZONA_DE_TOLERANCIA",
      deltaPct,
      threshold,
      note: `Acima do alvo, mas dentro dos ${Math.round((KILL_CONTINUE_TOLERANCE - 1) * 100)}% de tolerância do kill/continue.`,
    };
  }
  return {
    verdict: "PAUSAR",
    deltaPct,
    threshold,
    note: "CAC realizado acima da tolerância — o funil não paga a margem planejada.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Story 29.36 — cadeia de conversão e CAC decomposto
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma taxa da cadeia, com a proveniência que o protocolo exige.
 *
 * `windowStart`/`windowEnd` não são enfeite: `AGG-01` e `ST-07` exigem que
 * TODAS as taxas de uma cadeia venham da mesma janela. Um play rate medido em
 * janeiro multiplicado por um CTR de ontem produz um número sem significado —
 * e o protocolo manda abortar, não avisar em rodapé.
 */
export interface ChainRate {
  key: string;
  label: string;
  /** Semântica das bases — é o que CHAIN-01 valida. */
  numerator: string;
  denominator: string;
  /** `null` = não medido. NUNCA vira 1,0 (GR-01.d). */
  value: number | null;
  status: DerivationStatus;
  /** Sistema + tela + coluna. "VTurb" sozinho é insuficiente. */
  source: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** Quando o valor foi transcrito — para o usuário ver que envelheceu. */
  measuredAt: string | null;
}

export interface DecomposedCac {
  /** `null` quando alguma etapa está sem medição — jamais um número otimista. */
  cac: number | null;
  status: DerivationStatus;
  /** Produto das taxas. `null` se qualquer uma faltar. */
  chainProduct: number | null;
  /** 1 ÷ produto — a leitura que denuncia erro de unidade. */
  entriesPerSale: number | null;
  /** Etapas sem valor, por label. */
  unmeasured: string[];
  expression: string | null;
}

/**
 * CHAIN-01 / ST-05 — as bases precisam encadear.
 *
 * O denominador de cada etapa tem que ser textualmente o numerador da
 * anterior. Duas taxas na mesma base contam a mesma perda duas vezes (CAC
 * superestimado); um salto de base faz uma perda inteira sumir (CAC
 * subestimado). Os dois erros são silenciosos — o número sai plausível.
 */
export function assertChainIntegrity(rates: ChainRate[]): void {
  for (let i = 0; i < rates.length - 1; i++) {
    const cur = rates[i];
    const next = rates[i + 1];
    if (next.denominator !== cur.numerator) {
      throw new ProtocolViolation(
        "CHAIN-01",
        `bases não encadeiam entre "${cur.label}" e "${next.label}": ` +
          `o numerador de "${cur.label}" é "${cur.numerator}" mas o denominador de ` +
          `"${next.label}" é "${next.denominator}". Uma perda está sendo contada ` +
          `duas vezes ou desaparecendo.`,
      );
    }
  }
}

/**
 * AGG-01 / ST-07 — janela e atribuição homogêneas.
 *
 * Só considera etapas COM janela declarada. Etapa sem janela não é comparada
 * (seria falso positivo), mas também não passa por medida: `ST-08` a pega
 * antes, porque etapa sem medição bloqueia o CAC decomposto de qualquer forma.
 */
export function assertHomogeneousWindow(rates: ChainRate[]): void {
  const declared = rates.filter((r) => r.windowStart && r.windowEnd);
  if (declared.length < 2) return;
  const first = declared[0];
  const divergent = declared.filter(
    (r) => r.windowStart !== first.windowStart || r.windowEnd !== first.windowEnd,
  );
  if (divergent.length > 0) {
    const janelas = [...new Set(declared.map((r) => `${r.windowStart}..${r.windowEnd}`))];
    throw new ProtocolViolation(
      "ST-07",
      `INCOMPATIBLE_MEASUREMENT_BASIS — a cadeia mistura ${janelas.length} janelas: ` +
        `${janelas.join(" · ")}. O produto das taxas não tem significado quando os ` +
        `fatores medem períodos diferentes.`,
    );
  }
}

/**
 * ST-06 — numerador único.
 *
 * Se a entrada é CPC, o CTR SAI da cadeia: o custo do clique já embute a taxa
 * de clique. Manter os dois conta o mesmo custo duas vezes.
 */
export function assertSingleNumerator(entry: EntryCostKind, rates: ChainRate[]): void {
  const hasCtr = rates.some((r) => r.key.toUpperCase() === "CTR");
  if (entry === "CPM" && !hasCtr) {
    throw new ProtocolViolation("ST-06", "entrada por CPM exige CTR na cadeia.");
  }
  if ((entry === "CPC" || entry === "CPL") && hasCtr) {
    throw new ProtocolViolation(
      "ST-06",
      `entrada por ${entry} com CTR na cadeia: o mesmo custo é contado duas vezes.`,
    );
  }
}

export type EntryCostKind = "CPM" | "CPC" | "CPL";

/**
 * Custo de UMA entrada.
 *
 * U-04 — CPM entra SEMPRE dividido por 1000. É a única exceção de escala do
 * protocolo: CPM é cotado por mil impressões e a equação precisa de uma.
 */
export function entryCostPerUnit(kind: EntryCostKind, value: number): number {
  return kind === "CPM" ? value / 1000 : value;
}

/**
 * E1/E2 — `CAC = custo_da_entrada ÷ ∏(taxas)`.
 *
 * DIVISÃO, não multiplicação. O deck original escrevia com `×`, o que daria
 * CAC menor que um único clique. É identidade exata em modo diagnóstico —
 * desde que as bases encadeiem e a janela seja a mesma.
 */
export function decomposeCac(
  entry: { kind: EntryCostKind; value: number },
  rates: ChainRate[],
): DecomposedCac {
  assertSingleNumerator(entry.kind, rates);
  assertChainIntegrity(rates);
  assertHomogeneousWindow(rates);

  // GR-01.d — etapa existente e não medida torna o resultado UNKNOWN. Nunca
  // se preenche com 1,0 ("assumindo 100%"), que faria o CAC parecer melhor.
  const unmeasured = rates.filter((r) => r.value == null).map((r) => r.label);
  if (unmeasured.length > 0) {
    return {
      cac: null,
      status: "UNKNOWN",
      chainProduct: null,
      entriesPerSale: null,
      unmeasured,
      expression: null,
    };
  }

  for (const r of rates) assertRate(r.value as number, r.label);

  const product = rates.reduce((acc, r) => acc * (r.value as number), 1);
  const cost = entryCostPerUnit(entry.kind, entry.value);
  const cac = cost / product;

  return {
    cac,
    status: "DERIVED",
    chainProduct: product,
    entriesPerSale: 1 / product,
    unmeasured: [],
    expression:
      `${cost} ÷ (${rates.map((r) => r.value).join(" × ")}) = ${cost} ÷ ${product} = ${cac.toFixed(2)}`,
  };
}

export type SanityVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface SanityResult {
  id: string;
  name: string;
  verdict: SanityVerdict;
  detail: string;
}

/**
 * ST-02 — bandas do produto das taxas. Calibradas SÓ para `vsl_direct`.
 *
 * Arquitetura com número diferente de etapas tem produto em outra ordem de
 * grandeza por construção — aplicar esta banda a um quiz produziria FAIL
 * espúrio. Por isso o teste sai INCONCLUSIVE, não FAIL, fora dela.
 */
const SANITY_BANDS: Record<string, { low: number; high: number }> = {
  "vsl_direct:CPM": { low: 0.00005, high: 0.0004 },
  "vsl_direct:CPC": { low: 0.002, high: 0.015 },
};

/**
 * ST-01 a ST-08 — rodam TODOS antes de qualquer resultado ser emitido.
 *
 * Qualquer FAIL bloqueia a emissão. INCONCLUSIVE não bloqueia: significa que o
 * teste não se aplica àquele contexto, o que é diferente de reprovar.
 */
export function runSanityTests(
  architecture: string,
  entry: { kind: EntryCostKind; value: number },
  rates: ChainRate[],
  decomposed: DecomposedCac,
): SanityResult[] {
  const out: SanityResult[] = [];
  const measured = rates.filter((r) => r.value != null);

  // ST-01 — toda taxa em (0, 1]
  const bad = measured.filter((r) => !((r.value as number) > 0 && (r.value as number) <= 1));
  out.push({
    id: "ST-01",
    name: "Taxas em (0, 1]",
    verdict: bad.length === 0 ? "PASS" : "FAIL",
    detail: bad.length === 0
      ? `${measured.length} taxa(s) dentro do intervalo`
      : `fora do intervalo: ${bad.map((r) => r.label).join(", ")} — provável valor em pontos percentuais`,
  });

  // ST-02 — banda do produto
  const band = SANITY_BANDS[`${architecture}:${entry.kind}`];
  if (!band || decomposed.chainProduct == null) {
    out.push({
      id: "ST-02",
      name: "Produto na banda esperada",
      verdict: "INCONCLUSIVE",
      detail: band
        ? "produto indisponível — há etapa não medida"
        : `sem banda calibrada para ${architecture} com entrada por ${entry.kind}; só vsl_direct tem`,
    });
  } else {
    const ok = decomposed.chainProduct >= band.low && decomposed.chainProduct <= band.high;
    out.push({
      id: "ST-02",
      name: "Produto na banda esperada",
      verdict: ok ? "PASS" : "FAIL",
      detail: `produto = ${decomposed.chainProduct} vs banda [${band.low}, ${band.high}]`,
    });
  }

  // ST-03 — leitura de volume plausível
  if (decomposed.entriesPerSale == null) {
    out.push({ id: "ST-03", name: "Volume por venda plausível", verdict: "INCONCLUSIVE", detail: "cadeia incompleta" });
  } else {
    const ok = decomposed.entriesPerSale >= 10;
    out.push({
      id: "ST-03",
      name: "Volume por venda plausível",
      verdict: ok ? "PASS" : "FAIL",
      detail: `${Math.round(decomposed.entriesPerSale)} entradas por venda` +
        (ok ? "" : " — número baixo demais, provável erro de unidade"),
    });
  }

  // ST-04 — colapsada = aberta. Sem conversão total medida de forma
  // independente, o teste não roda: seria comparar o número consigo mesmo.
  out.push({
    id: "ST-04",
    name: "Colapsada = aberta",
    verdict: "INCONCLUSIVE",
    detail: "exige conversão total medida independentemente da cadeia — não disponível hoje",
  });

  // ST-05 / ST-06 / ST-07 — já validados por exceção em decomposeCac. Chegar
  // aqui significa que passaram.
  out.push({ id: "ST-05", name: "Bases encadeadas (CHAIN-01)", verdict: "PASS", detail: "denominadores batem com o numerador anterior" });
  out.push({ id: "ST-06", name: "Numerador único", verdict: "PASS", detail: `entrada por ${entry.kind}, sem dupla contagem de custo` });
  out.push({
    id: "ST-07",
    name: "Janela homogênea",
    verdict: "PASS",
    detail: measured.some((r) => r.windowStart)
      ? "todas as etapas com janela declarada compartilham o mesmo período"
      : "nenhuma etapa declarou janela — nada a comparar",
  });

  // ST-08 — cobertura de etapas
  out.push({
    id: "ST-08",
    name: "Cobertura de etapas",
    verdict: decomposed.unmeasured.length === 0 ? "PASS" : "FAIL",
    detail: decomposed.unmeasured.length === 0
      ? `${rates.length} etapa(s) medida(s)`
      : `sem medição: ${decomposed.unmeasured.join(", ")} — CAC decomposto é UNKNOWN, nunca preenchido com 100%`,
  });

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Story 29.37 — método do teto, ranking e efeito composto
// ═══════════════════════════════════════════════════════════════════════════

/** Numerador (custo, menor é melhor) ou denominador (taxa, maior é melhor). */
export type VarRole = "numerator" | "denominator";

/**
 * De onde veio o teto. `CEIL-01` — teto é INPUT com procedência, nunca
 * inferido. "Estimativa do analista" e "extrapolação da tendência" não são
 * fontes aceitas: um teto inventado contamina todo o ranking.
 */
export type CeilingSource =
  | "benchmark_outro_funil"
  | "melhor_historico"
  | "benchmark_fonte"
  | "teto_fisico";

export interface CeilingRow {
  key: string;
  label: string;
  role: VarRole;
  current: number;
  /** `null` = sem teto declarado. Sai UNKNOWN e NÃO entra no ranking. */
  ceiling: number | null;
  ceilingSource: CeilingSource | null;
  chainPosition: number;
  /**
   * Contagens absolutas da etapa. Sem elas o modo STATISTICAL não roda —
   * intervalo de confiança precisa de volume, e o protocolo não estima volume.
   */
  successes: number | null;
  trials: number | null;
}

/**
 * Fator pelo qual o CAC é multiplicado ao levar a variável ao teto.
 *
 * Taxa: `atual ÷ teto` (subir a taxa divide o CAC).
 * Custo: `teto ÷ atual` (baixar o custo multiplica).
 */
export function retentionFactor(row: CeilingRow): number | null {
  if (row.ceiling == null || row.ceiling === 0 || row.current === 0) return null;
  return row.role === "numerator" ? row.ceiling / row.current : row.current / row.ceiling;
}

/**
 * Queda REAL do CAC. Negativa quando o CAC cai.
 *
 * D2 — o deck calcula `teto/atual − 1` para taxas, que é o ganho da MÉTRICA,
 * não a queda do CAC. Para o numerador as duas contas coincidem, e é daí que
 * nasce a distorção: misturar custo e taxa num ranking pelo método do deck
 * pode INVERTER a ordem. Existe contraexemplo no teste.
 */
export function realDrop(row: CeilingRow): number | null {
  const f = retentionFactor(row);
  return f == null ? null : f - 1;
}

/** Como o deck rotula. Só nota de rodapé — nunca ordena. */
export function deckLabel(row: CeilingRow): number | null {
  if (row.ceiling == null || row.current === 0) return null;
  return row.role === "numerator"
    ? row.ceiling / row.current - 1
    : 1 - row.ceiling / row.current;
}

/**
 * Quantis da normal padrão, bicaudais. TABELADOS de propósito.
 *
 * Nível fora desta tabela ABORTA em vez de aproximar: um z inventado produz
 * intervalo errado, e intervalo errado muda quem empata com quem — ou seja,
 * muda a ordem do ranking sem ninguém perceber.
 */
const Z_TABLE: Record<string, number> = {
  "0.8": 1.2815515655446004,
  "0.9": 1.6448536269514722,
  "0.95": 1.959963984540054,
  "0.98": 2.3263478740408408,
  "0.99": 2.5758293035489004,
};

export const DEFAULT_CONFIDENCE = 0.95;

export function zFor(confidence: number): number {
  const z = Z_TABLE[String(confidence)];
  if (z === undefined) {
    throw new ProtocolViolation(
      "RANK-01",
      `nível de confiança ${confidence} não tabelado. Disponíveis: ${Object.keys(Z_TABLE).join(", ")}. ` +
        `O protocolo não aproxima o quantil.`,
    );
  }
  return z;
}

/**
 * Intervalo de Wilson para uma proporção.
 *
 * Escolhido em vez do intervalo normal porque as taxas deste funil são
 * frequentemente extremas (connect ~0,9, checkout ~0,15) e medidas com n
 * pequeno no fim da cadeia — regime em que o normal produz limites fora de
 * [0,1].
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z: number = zFor(DEFAULT_CONFIDENCE),
): [number, number] {
  if (trials <= 0) {
    throw new ProtocolViolation("RANK-01", "intervalo de confiança exige denominador > 0.");
  }
  if (successes < 0 || successes > trials) {
    throw new ProtocolViolation("RANK-01", `successes=${successes} fora de [0, ${trials}].`);
  }
  const n = trials;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** IC do `real_drop`, propagado do IC da taxa. Custo não é proporção → null. */
export function realDropInterval(
  row: CeilingRow,
  confidence: number = DEFAULT_CONFIDENCE,
): [number, number] | null {
  if (row.role === "numerator" || row.successes == null || row.trials == null || row.ceiling == null) {
    return null;
  }
  const [lo, hi] = wilsonInterval(row.successes, row.trials, zFor(confidence));
  return [lo / row.ceiling - 1, hi / row.ceiling - 1];
}

export type RankingMode = "STATISTICAL" | "LEXICOGRAPHIC" | "PARETO";

export interface RankingResult {
  ordered: CeilingRow[];
  modeRequested: RankingMode;
  modeUsed: RankingMode;
  confidence: number;
  tieGroups: string[][];
  withoutInterval: string[];
  excluded: string[];
  notes: string[];
  degraded: boolean;
}

/**
 * Ranking de prioridades.
 *
 * `STATISTICAL` é o PADRÃO. A ordem NUNCA é fixa — sai dos dados, em dois
 * níveis: os valores de `real_drop` variam, e o próprio conjunto de empates
 * varia com o volume medido. Funil com pouco tráfego tem muitos empates (e
 * C2 decide bastante); com volume alto, quase nenhum.
 *
 * RANK-00 — C1 (queda de CAC) é o único critério na unidade do objetivo. A
 * equação é simétrica em posição, então C2 não mede impacto: mede velocidade
 * de aprendizado (amostra maior no topo) e correlação entre etapas (melhorar
 * o topo arrasta as seguintes). Por isso C2 desempata, não compete.
 *
 * RANK-02 — sem contagens, degrada para LEXICOGRAPHIC. A degradação precisa
 * aparecer no TOPO da saída: quem pediu o modo estatístico acreditaria estar
 * usando-o.
 */
export function rank(
  rows: CeilingRow[],
  mode: RankingMode = "STATISTICAL",
  funnelState: "VALIDATED" | "NOT_VALIDATED" = "VALIDATED",
  confidence: number = DEFAULT_CONFIDENCE,
): RankingResult {
  const notes: string[] = [];

  // CEIL-01 — sem teto com procedência, a variável não entra no ranking.
  const excluded = rows
    .filter((r) => r.ceiling == null || r.ceilingSource == null)
    .map((r) => r.label);
  const eligible = rows.filter((r) => r.ceiling != null && r.ceilingSource != null);
  if (excluded.length > 0) {
    notes.push(
      `fora do ranking por falta de teto com procedência: ${excluded.join(", ")} — ` +
        `CEIL-01 rejeita estimativa do analista e extrapolação de tendência`,
    );
  }

  // Override: em funil não validado, C2 é SUSPENSO. Contraintuitivo, mas é o
  // que a fonte registra como testado — consertar gargalo interno primeiro.
  const useC2 = funnelState !== "NOT_VALIDATED";
  if (!useC2) {
    notes.push("funil NÃO VALIDADO: critério C2 (posição no funil) suspenso");
  }

  // C3 (esforço) está indisponível — a fonte não define escala (U5).
  const opKey = (r: CeilingRow) => (useC2 ? r.chainPosition : 0);

  if (mode === "STATISTICAL") {
    zFor(confidence); // falha cedo se o nível não for tabelado
    const withoutInterval = eligible
      .filter((r) => realDropInterval(r, confidence) == null)
      .map((r) => r.label);

    if (withoutInterval.length === eligible.length) {
      notes.push(
        "STATISTICAL indisponível: nenhuma etapa tem contagem absoluta. Degradado para " +
          "LEXICOGRAPHIC — o empate estatístico NÃO foi avaliado. O protocolo não estima volume.",
      );
      const res = rank(rows, "LEXICOGRAPHIC", funnelState, confidence);
      return { ...res, modeRequested: "STATISTICAL", withoutInterval, notes: [...notes, ...res.notes], degraded: true };
    }
    if (withoutInterval.length > 0) {
      notes.push(
        `sem contagem, entram como ponto (sem IC): ${withoutInterval.join(", ")} — ` +
          `custo de entrada não é proporção`,
      );
    }

    // Agrupa por sobreposição de IC, varrendo em ordem de C1. Variável sem IC
    // nunca sustenta empate: abre grupo próprio. Ausência de dado não vira
    // evidência de empate.
    const byC1 = [...eligible].sort((a, b) => (realDrop(a) ?? 0) - (realDrop(b) ?? 0));
    const groups: CeilingRow[][] = [];
    for (const r of byC1) {
      if (groups.length === 0) {
        groups.push([r]);
        continue;
      }
      const iv = realDropInterval(r, confidence);
      let overlaps = false;
      if (iv) {
        for (const m of groups[groups.length - 1]) {
          const mv = realDropInterval(m, confidence);
          if (mv && iv[0] <= mv[1] && mv[0] <= iv[1]) {
            overlaps = true;
            break;
          }
        }
      }
      if (overlaps) groups[groups.length - 1].push(r);
      else groups.push([r]);
    }

    const ordered = groups.flatMap((g) => [...g].sort((a, b) => opKey(a) - opKey(b)));
    const tieGroups = groups.filter((g) => g.length > 1).map((g) => g.map((r) => r.label));
    notes.push(
      tieGroups.length > 0
        ? `empates estatísticos em C1 (IC ${confidence * 100}% sobreposto), desempatados por C2: ${tieGroups.map((g) => g.join("/")).join(" · ")}`
        : `nenhum empate estatístico em IC ${confidence * 100}%: C1 decidiu sozinho`,
    );
    return {
      ordered, modeRequested: mode, modeUsed: mode, confidence,
      tieGroups, withoutInterval, excluded, notes, degraded: false,
    };
  }

  if (mode === "LEXICOGRAPHIC") {
    const ordered = [...eligible].sort(
      (a, b) => (realDrop(a) ?? 0) - (realDrop(b) ?? 0) || opKey(a) - opKey(b),
    );
    notes.push(
      "empate em C1 é EXATO neste modo; com números reais quase nunca ocorre, então C2 raramente atua",
    );
    return {
      ordered, modeRequested: mode, modeUsed: mode, confidence,
      tieGroups: [], withoutInterval: [], excluded, notes, degraded: false,
    };
  }

  // PARETO — devolve a fronteira e NÃO ordena dentro dela. Com C3
  // indisponível (U5), a dominância em três critérios é indeterminável.
  notes.push(
    "C3 (esforço) indisponível — a fonte não define escala. A fronteira tende a conter quase tudo",
  );
  const front = eligible.filter(
    (r) =>
      !eligible.some(
        (o) =>
          o !== r &&
          (realDrop(o) ?? 0) <= (realDrop(r) ?? 0) &&
          opKey(o) <= opKey(r) &&
          ((realDrop(o) ?? 0) < (realDrop(r) ?? 0) || opKey(o) < opKey(r)),
      ),
  );
  return {
    ordered: front, modeRequested: mode, modeUsed: mode, confidence,
    tieGroups: [], withoutInterval: [], excluded, notes, degraded: false,
  };
}

export const PROJECTION_DISCLAIMER =
  "Projeção sob premissa de independência entre etapas — premissa sabidamente falsa. " +
  "Tratar como limite superior otimista, não como previsão.";

/**
 * Efeito de levar TODAS as variáveis ao teto: PRODUTO dos fatores de retenção.
 *
 * D3 — somar as quedas individuais é aritmeticamente impossível: com os
 * números do protocolo daria 178,8%, e nada cai mais que 100%.
 */
export function compositeEffect(rows: CeilingRow[]): number | null {
  let p = 1;
  for (const r of rows) {
    const f = retentionFactor(r);
    if (f == null) return null;
    p *= f;
  }
  return p;
}

/**
 * GR-01.b — intervalo roda nas DUAS pontas, nunca no ponto médio.
 *
 * Devolve (pior caso, melhor caso) da queda de CAC quando atual e teto vêm
 * como faixa.
 */
export function cacDropInterval(
  currentLow: number,
  currentHigh: number,
  ceilingLow: number,
  ceilingHigh: number,
): [number, number] {
  return [1 - currentHigh / ceilingLow, 1 - currentLow / ceilingHigh];
}
