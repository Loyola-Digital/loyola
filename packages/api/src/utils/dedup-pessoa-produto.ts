/**
 * Story 41.12 — camada 2 da dedup de vendas: a mesma pessoa (e-mail) não compra
 * duas vezes o mesmo produto.
 *
 * É a regra da skill `loyola-debriefing` (passo 2 da Fase 2) que a 49.3 pôs
 * inline em `services/debriefing-hygiene.ts`, decidida pelo dono na 1A e
 * estendida a todas as pontas pela R5-1 (2026-10-02). Mora aqui, num módulo
 * folha, para que nenhuma ponta redefina a chave — o mesmo desenho da 41.10 com
 * `deduplicarPorIdDaVenda` (camada 1).
 *
 * Quem chama hoje: o debriefing (49.3), o Resumão/Comparativo, os painéis de
 * Captação Paga e Vendas (`sales-data` e `sales-data-daily`) e a réplica
 * `sales-daily-sync`. O perpétuo (fatia B) passará o predicado `isenta`.
 *
 * Contrato:
 * - pura, sem I/O; preserva a ordem de `linhas`;
 * - chave = `normalizeEmail(email)` + `\u0000` + produto (`trim` + minúsculas;
 *   `null` = `""`);
 * - e-mail vazio ou `null` ⇒ a linha **nunca** colapsa;
 * - sobrevive a **primeira** ocorrência; as demais vão para `removidas`;
 * - `isenta(l) === true` ⇒ a linha nunca colapsa e não ocupa a chave (R6-8).
 *
 * Política que é de quem chama, não daqui: a ORDEM das camadas (status →
 * camada 1 → camada 2 → corte de período no lançamento), o escopo das linhas
 * (só as que contam como venda) e a guarda de planilha sem a coluna de produto
 * mapeada (com produto sempre `""`, ingresso e bump da mesma pessoa
 * colapsariam) — que se passa como `isenta`.
 */

import { normalizeEmail } from "./lead-origin.js";

export interface ChavePessoaProduto {
  /** E-mail como veio da fonte; normalizado aqui. */
  email: string | null;
  /** Nome do produto como veio da fonte. `null` vale como `""`. */
  produto: string | null;
}

export interface ResultadoDedupPessoaProduto<T> {
  /** Linhas que contam, na ordem original. */
  mantidas: T[];
  /** Recompras do mesmo produto pela mesma pessoa (2ª em diante), na ordem original. */
  removidas: T[];
}

/**
 * Chave canônica `(pessoa, produto)`, ou `null` quando a linha não tem e-mail
 * (não colapsa). O separador `\u0000` não aparece em célula de planilha.
 */
export function chaveDePessoaEProduto(c: ChavePessoaProduto): string | null {
  const email = normalizeEmail(c.email);
  if (!email) return null;
  const produto = (c.produto ?? "").trim().toLowerCase();
  return `${email}\u0000${produto}`;
}

export function deduplicarPorPessoaEProduto<T>(
  linhas: readonly T[],
  chave: (linha: T) => ChavePessoaProduto,
  isenta?: (linha: T) => boolean,
): ResultadoDedupPessoaProduto<T> {
  const vistas = new Set<string>();
  const mantidas: T[] = [];
  const removidas: T[] = [];

  for (const linha of linhas) {
    if (isenta?.(linha)) {
      mantidas.push(linha);
      continue;
    }
    const k = chaveDePessoaEProduto(chave(linha));
    if (k === null) {
      mantidas.push(linha);
      continue;
    }
    if (vistas.has(k)) {
      removidas.push(linha);
      continue;
    }
    vistas.add(k);
    mantidas.push(linha);
  }

  return { mantidas, removidas };
}
