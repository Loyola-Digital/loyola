// ============================================================
// Story 29.50 — as premissas do relatório propostas a partir da classificação
// de produtos da planilha (29.49).
//
// ## O defeito que isto fecha
//
// `perpetual-report-config-section.tsx` pede o produto principal e os order
// bumps DIGITADOS à mão — os bumps num campo de texto separado por vírgula.
// O gestor redigita nomes que já estão na planilha, e qualquer divergência
// (acento, espaço, caixa, produto renomeado na plataforma) faz o relatório
// calcular sobre um produto que não existe, **sem erro visível**.
//
// Com a 29.49 esse dado passa a existir classificado, vindo da própria
// planilha. Continuar digitando manteria duas fontes de verdade para a mesma
// informação — e a errada é sempre a que o humano digitou de novo.
//
// ## Por que é função pura em `lib/utils`
//
// É o único diretório que o runner executa. E a regra aqui tem três casos que
// precisam estar presos por teste: não sobrescrever o que já foi salvo, não
// escolher sozinho quando há ambiguidade, e detectar divergência sem bloquear.
// ============================================================

import { productKey } from "./perpetual-product-types";
import type { PerpetualProduct } from "@loyola-x/shared";

export interface PremissasAtuais {
  /** O que já está salvo na config. `null`/vazio = nunca preenchido. */
  produto: string | null;
  produtosOrderBump: string[];
}

export interface PropostaPremissas {
  /**
   * Produto principal sugerido. `null` quando não há classificação **ou**
   * quando há mais de um candidato — ver `candidatosPrincipal`.
   */
  produto: string | null;
  /** Todos os classificados como principal. Mais de um = a UI precisa perguntar. */
  candidatosPrincipal: string[];
  /** Classificados como order bump, na ordem em que a API os devolveu. */
  produtosOrderBump: string[];
  /** `true` quando há mais de um principal: a tela pede a escolha (AC1). */
  ambiguo: boolean;
}

/**
 * Deriva a proposta a partir dos produtos classificados.
 *
 * **Não escolhe sozinho** com mais de um principal. Pegar o primeiro produziria
 * um relatório certo na aparência e errado no número — e o gestor não teria
 * como saber que houve uma escolha.
 */
export function proporPremissas(produtos: PerpetualProduct[]): PropostaPremissas {
  const principais = produtos.filter((p) => p.type === "principal").map((p) => p.name);
  const bumps = produtos.filter((p) => p.type === "order_bump").map((p) => p.name);
  return {
    produto: principais.length === 1 ? principais[0] : null,
    candidatosPrincipal: principais,
    produtosOrderBump: bumps,
    ambiguo: principais.length > 1,
  };
}

/**
 * O que aplicar ao formulário, respeitando o que já foi preenchido.
 *
 * **Só age em campo vazio** (AC4). Uma premissa ajustada de propósito pelo
 * gestor não pode ser sobrescrita pela chegada desta story — e "campo vazio" é
 * o único critério em que o automático não destrói decisão humana.
 */
export function aplicarProposta(
  atual: PremissasAtuais,
  proposta: PropostaPremissas,
): { produto: string | null; produtosOrderBump: string[]; preencheuProduto: boolean; preencheuBumps: boolean } {
  const produtoVazio = !atual.produto || atual.produto.trim() === "";
  const bumpsVazio = atual.produtosOrderBump.length === 0;

  const preencheuProduto = produtoVazio && proposta.produto !== null;
  const preencheuBumps = bumpsVazio && proposta.produtosOrderBump.length > 0;

  return {
    produto: preencheuProduto ? proposta.produto : atual.produto,
    produtosOrderBump: preencheuBumps ? proposta.produtosOrderBump : atual.produtosOrderBump,
    preencheuProduto,
    preencheuBumps,
  };
}

export interface Divergencia {
  produto: boolean;
  bumps: boolean;
}

/**
 * Compara o que está digitado com o que está classificado na planilha (AC2).
 *
 * Comparação pela chave canônica — a mesma do backend e da 29.49. Divergência
 * de acento ou caixa **não** é divergência real, e sinalizá-la treinaria o
 * gestor a ignorar o aviso.
 *
 * Campo vazio nunca diverge: vazio é ausência, não discordância.
 */
export function detectarDivergencia(
  atual: PremissasAtuais,
  proposta: PropostaPremissas,
): Divergencia {
  const produtoDiverge =
    !!atual.produto?.trim() &&
    proposta.candidatosPrincipal.length > 0 &&
    !proposta.candidatosPrincipal.some((c) => productKey(c) === productKey(atual.produto!));

  const bumpsAtuais = atual.produtosOrderBump.map(productKey).sort();
  const bumpsPropostos = proposta.produtosOrderBump.map(productKey).sort();
  const bumpsDivergem =
    bumpsAtuais.length > 0 &&
    (bumpsAtuais.length !== bumpsPropostos.length ||
      bumpsAtuais.some((b, i) => b !== bumpsPropostos[i]));

  return { produto: produtoDiverge, bumps: bumpsDivergem };
}
