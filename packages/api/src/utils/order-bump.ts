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

/** O mínimo que uma linha de venda precisa expor para entrar na análise. */
export interface LinhaDeVenda {
  /** Já normalizado (trim + lowercase). Vazio = comprador anônimo. */
  email: string;
  /** `true` quando o produto está na lista de order bumps da etapa. */
  isOrderBump: boolean;
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

/** Um comprador consolidado — todas as linhas dele, principais e bumps. */
interface Comprador {
  principal: number;
  bump: number;
  nBumps: number;
  temPrincipal: boolean;
  /**
   * Público do PRIMEIRO produto principal do período.
   *
   * Story 18.67 (AC2): não vem da linha do bump — **149 das 275 linhas de bump
   * (54%) não têm `utm_term`**. Classificar a linha do bump isoladamente jogaria
   * mais da metade em "indefinido" e destruiria a tabela.
   *
   * Quando o comprador tem mais de um principal, vale o primeiro. Arbitrário e
   * declarado: o caso é raro e qualquer regra aqui é convenção, não verdade.
   */
  publico: PublicoDeVenda | null;
}

export interface ResumoOrderBump {
  /** A etapa tem ao menos um produto marcado como order bump. */
  temConfiguracao: boolean;
  faturamentoTotal: number;
  /** Receita de produto NÃO marcado como bump. */
  faturamentoPrincipal: number;
  /** Bump de quem TEM produto principal — o bump de verdade (AC2 da 18.66). */
  bumpAcessorio: number;
  /** Bump de quem NÃO tem principal: venda própria desses produtos (AC3). */
  bumpAvulso: number;
  /** `bumpAcessorio ÷ faturamentoTotal`. `null` quando não há faturamento. */
  representatividade: number | null;
  /** Compradores com ao menos um produto principal. */
  compradoresComPrincipal: number;
  /** Destes, quantos levaram ao menos um bump acessório (AC4). */
  compradoresComBump: number;
  /** `compradoresComBump ÷ compradoresComPrincipal`. */
  taxaDeAdesao: number | null;
  /** Compradores que só têm linhas de produto marcado como bump. */
  compradoresSoBump: number;
}

export interface LinhaDePublico {
  publico: PublicoDeVenda;
  compradores: number;
  compradoresComBump: number;
  /** `compradoresComBump ÷ compradores` (Story 18.67, AC3). */
  taxaBump: number | null;
  /** Receita de produto principal do público. */
  receitaPrincipal: number;
  /** Receita de bump acessório do público. */
  receitaBump: number;
  /** `receitaPrincipal ÷ compradores` (AC4). */
  aovSemBump: number | null;
  /** `(receitaPrincipal + receitaBump) ÷ compradores` (AC4). */
  aovComBump: number | null;
}

/**
 * Consolida as linhas por comprador. É o passo que separa acessório de avulso e
 * de onde tudo o mais é derivado.
 *
 * Compradores **sem e-mail** entram como indivíduos distintos (chave sintética
 * por índice) em vez de colapsarem num balde único — colapsá-los faria N
 * anônimos virarem um comprador com receita somada, e o AOV do público deles
 * explodiria. Mesmo raciocínio de `chaveDeComprador` na 29.53.
 */
function consolidar(linhas: LinhaDeVenda[]): Map<string, Comprador> {
  const compradores = new Map<string, Comprador>();
  linhas.forEach((l, i) => {
    const chave = l.email || `__anonimo_${i}__`;
    let c = compradores.get(chave);
    if (!c) {
      c = { principal: 0, bump: 0, nBumps: 0, temPrincipal: false, publico: null };
      compradores.set(chave, c);
    }
    if (l.isOrderBump) {
      c.bump += l.bruto;
      c.nBumps += 1;
    } else {
      c.principal += l.bruto;
      c.temPrincipal = true;
      // AC2 — o público vem do PRIMEIRO principal, e só dele.
      c.publico ??= classificarPublicoDaVenda(l.utmSource, l.utmTerm);
    }
  });
  return compradores;
}

/** Story 18.66 — o card de representatividade. */
export function resumirOrderBump(
  linhas: LinhaDeVenda[],
  temConfiguracao: boolean,
): ResumoOrderBump {
  const compradores = consolidar(linhas);
  let faturamentoPrincipal = 0;
  let bumpAcessorio = 0;
  let bumpAvulso = 0;
  let comPrincipal = 0;
  let comBump = 0;
  let soBump = 0;

  for (const c of compradores.values()) {
    faturamentoPrincipal += c.principal;
    if (c.temPrincipal) {
      comPrincipal += 1;
      bumpAcessorio += c.bump;
      if (c.nBumps > 0) comBump += 1;
    } else {
      soBump += 1;
      bumpAvulso += c.bump;
    }
  }

  const faturamentoTotal = faturamentoPrincipal + bumpAcessorio + bumpAvulso;
  return {
    temConfiguracao,
    faturamentoTotal,
    faturamentoPrincipal,
    bumpAcessorio,
    bumpAvulso,
    // AC2 — o denominador é o faturamento TOTAL. A pergunta é "que fatia do que
    // entrou veio do bump"; trocar o denominador pelo do principal inflaria o
    // número de 26,3% para 48,3% sem nada na tela avisando.
    representatividade: faturamentoTotal > 0 ? bumpAcessorio / faturamentoTotal : null,
    compradoresComPrincipal: comPrincipal,
    compradoresComBump: comBump,
    taxaDeAdesao: comPrincipal > 0 ? comBump / comPrincipal : null,
    compradoresSoBump: soBump,
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
  const compradores = consolidar(linhas);
  const acc = new Map<PublicoDeVenda, LinhaDePublico>();

  for (const c of compradores.values()) {
    if (!c.temPrincipal || !c.publico) continue;
    let e = acc.get(c.publico);
    if (!e) {
      e = {
        publico: c.publico,
        compradores: 0,
        compradoresComBump: 0,
        taxaBump: null,
        receitaPrincipal: 0,
        receitaBump: 0,
        aovSemBump: null,
        aovComBump: null,
      };
      acc.set(c.publico, e);
    }
    e.compradores += 1;
    // AC3 — COMPRADORES, não linhas. Quem leva dois bumps é uma conversão, não
    // duas; contar linhas infla o público que compra combo.
    if (c.nBumps > 0) e.compradoresComBump += 1;
    e.receitaPrincipal += c.principal;
    e.receitaBump += c.bump;
  }

  return [...acc.values()]
    .map((e) => ({
      ...e,
      taxaBump: e.compradores > 0 ? e.compradoresComBump / e.compradores : null,
      aovSemBump: e.compradores > 0 ? e.receitaPrincipal / e.compradores : null,
      aovComBump: e.compradores > 0 ? (e.receitaPrincipal + e.receitaBump) / e.compradores : null,
    }))
    // AC7 — por compradores, decrescente. Ordenar por taxa poria um balde de 3
    // pessoas no topo, e três pessoas não sustentam uma taxa.
    .sort((a, b) => b.compradores - a.compradores);
}
