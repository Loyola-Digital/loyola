/**
 * Story 47.1 — as regras de negócio do dicionário, na forma PURA.
 *
 * Aqui não há banco: cada função recebe o que a consulta trouxe e devolve a
 * decisão (mensagem, status HTTP, payload). É o que se testa sem mock e sem
 * dúvida — a consulta em si é testada à parte, olhando o predicado que o
 * Drizzle monta (`repositorio.ts`).
 *
 * Origem de cada regra: spec § 3 e § 5 (`docs/stories/epics/
 * epic-47-especificacao-nomenclatura.md`).
 */

import {
  normalizarCodigo,
  proximoCodigoDeLp,
  proximoCodigoNumerado,
  type TipoDeCodigo,
} from "@loyola-x/shared";

/** Erro de domínio com o status HTTP que o handler devolve (AC15). */
export class ErroDeNomenclatura extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 422,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
  corpo(): Record<string, unknown> {
    return { error: this.message, ...this.extra };
  }
}

/** Papéis do repo: `copywriter · strategist · manager · admin · guest`. */
export function podeAcessar(role: string | undefined): boolean {
  return Boolean(role) && role !== "guest";
}

/**
 * Normaliza e valida um código; erro `400` nomeando o campo (spec § 5).
 * `"Churrasco Premium"` → `churrasco-premium`; `"churrasco_premium"` → 400.
 */
export function codigoValidado(entrada: string, tipo: TipoDeCodigo, campo: string): string {
  const r = normalizarCodigo(entrada, tipo);
  if (!r.ok) {
    throw new ErroDeNomenclatura(400, `${campo}: ${r.motivo}`, { campo, valor: r.valor });
  }
  return r.valor;
}

/**
 * Mensagem de conflito de código (spec § 5): diz O QUE já ocupa aquele código
 * e sugere o próximo — `of02 já existe para bbe: "oferta com ticket médio de
 * R$ 297". Use of03.`
 */
export function conflitoDeCodigo(args: {
  codigo: string;
  escopo: string;
  descricaoExistente: string | null;
  sugestao: string | null;
  campo: string;
}): ErroDeNomenclatura {
  const desc = args.descricaoExistente ? `: "${args.descricaoExistente}"` : "";
  const use = args.sugestao ? ` Use ${args.sugestao}.` : "";
  return new ErroDeNomenclatura(409, `${args.codigo} já existe para ${args.escopo}${desc}.${use}`, {
    campo: args.campo,
    sugestao: args.sugestao,
  });
}

/** Sugestão de código por escopo (spec § 5): funil/oferta por expert, LP por combinação. */
export function sugerirCodigo(
  tipo: "funil" | "oferta" | "lp",
  existentes: readonly string[],
): string | null {
  if (tipo === "lp") return proximoCodigoDeLp(existentes);
  return proximoCodigoNumerado(tipo === "funil" ? "a" : "of", existentes);
}

/**
 * Imutabilidade depois de uso (spec § 5, regra 5): o código de um registro
 * referenciado por campanha não muda. `409` com `usadoEm`.
 */
export function exigirNaoUsado(usadoEm: number, campo: string): void {
  if (usadoEm > 0) {
    throw new ErroDeNomenclatura(
      409,
      `Usado em ${usadoEm} campanha(s). Para mudar o significado, crie um código novo.`,
      { campo, usadoEm },
    );
  }
}

export interface Referencia {
  tipo: "produto" | "funil" | "oferta" | "lp" | "campanha" | "variavel" | "vsl";
  id: string;
  rotulo: string;
}

/**
 * Exclusão (spec § 5): hard delete só quando NADA referencia. Com referência,
 * `409` com a lista e `podeDesativar: true` — é o que a tela usa para oferecer
 * "Desativar" no lugar.
 */
export function exigirSemReferencias(referencias: readonly Referencia[]): void {
  if (referencias.length === 0) return;
  const porTipo = new Map<string, number>();
  for (const r of referencias) porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1);
  const resumo = [...porTipo.entries()].map(([t, n]) => `${n} ${t}${n > 1 ? "s" : ""}`).join(", ");
  throw new ErroDeNomenclatura(409, `Não dá para excluir: referenciado por ${resumo}. Desative em vez de excluir.`, {
    referencias,
    podeDesativar: true,
  });
}

/**
 * Coerência de expert (spec § 5): em LP e campanha, produto, funil e oferta
 * têm que ser do mesmo expert. `422` nomeando o campo errado.
 */
export function exigirMesmoExpert(
  expertId: string,
  partes: { campo: string; expertId: string | null | undefined; rotulo: string }[],
): void {
  for (const p of partes) {
    if (!p.expertId) throw new ErroDeNomenclatura(404, `${p.campo}: ${p.rotulo} não encontrado`, { campo: p.campo });
    if (p.expertId !== expertId) {
      throw new ErroDeNomenclatura(422, `${p.campo}: ${p.rotulo} pertence a outro expert`, { campo: p.campo });
    }
  }
}

/** Rótulo dos selects de funil e oferta em qualquer tela (spec § 6). */
export function rotuloDe(code: string, description: string): string {
  return `${code} — ${description}`;
}
