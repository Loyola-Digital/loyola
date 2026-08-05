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
  gatewayFixo: number | null;
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
    ["gateway %", input.gatewayPct],
    ["gateway fixo", input.gatewayFixo],
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
  assertRate(input.gatewayPct as number, "gateway %");

  const margem = ticket * (input.margemDesejada as number);
  const imposto = ticket * (input.imposto as number);
  const gateway = ticket * (input.gatewayPct as number) + (input.gatewayFixo as number);
  const cmv = input.cmv as number;
  const reembolsoBrl = ticket * reembolso;
  const chargebackBrl = ticket * chargeback;

  const lines: TargetCacLine[] = [
    { label: "Ticket médio", value: ticket },
    { label: "− Margem desejada", value: -margem },
    { label: "− Imposto", value: -imposto },
    { label: "− Gateway", value: -gateway },
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
      `${ticket} − ${margem} − ${imposto} − ${gateway} − ${cmv}` +
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
