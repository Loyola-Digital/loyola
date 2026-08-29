/**
 * O contexto do dashboard aplicado a cada widget.
 *
 * O período é do **dashboard**, não do widget: fica em `dateRange` e é injetado
 * em todo `querySpec` aqui, no servidor. O widget guarda um período só porque
 * nasceu com um — mas quem manda é o do dashboard, senão trocar o filtro no topo
 * não mexeria em nada.
 *
 * Os slicers se **somam** aos filtros do widget. Um widget que já filtra por uma
 * campanha específica continua filtrando; o slicer estreita ainda mais.
 */

import { z } from "zod";
import { campo } from "./catalogo.js";
import { CAMPO_DE_DATA, type QuerySpec } from "./query.js";

export const slicerSchema = z.object({
  /** Chave do catálogo — sempre uma dimensão. */
  field: z.string().min(1).max(120),
  values: z.array(z.string().min(1).max(500)).min(1).max(200),
});

export type Slicer = z.infer<typeof slicerSchema>;

export interface ContextoDoDashboard {
  periodo: { start: string; end: string };
  slicers: Slicer[];
}

/**
 * Devolve o spec com o contexto aplicado, e os avisos do que NÃO coube.
 *
 * Um slicer de campanha não existe em "vendas". Aí ele é ignorado *naquele
 * widget* — mas o aviso sobe junto: um recorte que a pessoa acha que aplicou e
 * não aplicou é um número errado com cara de certo.
 */
export function aplicarContexto(
  spec: QuerySpec,
  ctx: ContextoDoDashboard,
): { spec: QuerySpec; avisos: string[] } {
  const avisos: string[] = [];
  const filters: QuerySpec["filters"] = { ...spec.filters };

  // O período sobrescreve o que o widget carregava.
  filters[CAMPO_DE_DATA[spec.entity]] = {
    operator: "$between",
    value: [ctx.periodo.start, ctx.periodo.end],
  };

  for (const slicer of ctx.slicers) {
    const def = campo(slicer.field);
    if (!def || def.role !== "dimension") continue;
    if (def.entity !== spec.entity) {
      avisos.push(`O filtro "${def.label}" não existe aqui e não foi aplicado.`);
      continue;
    }
    // Somar, não substituir: se o widget já filtrava a mesma dimensão, o
    // resultado precisa ser a interseção — não o recorte mais frouxo.
    const anterior = filters[slicer.field];
    if (anterior && anterior.operator === "$in" && Array.isArray(anterior.value)) {
      const antes = new Set(anterior.value.map(String));
      const cruzado = slicer.values.filter((v) => antes.has(v));
      if (cruzado.length === 0) {
        avisos.push(`O filtro "${def.label}" não cruza com o filtro próprio deste widget.`);
        filters[slicer.field] = { operator: "$in", value: slicer.values };
        continue;
      }
      filters[slicer.field] = { operator: "$in", value: cruzado };
      continue;
    }
    filters[slicer.field] = { operator: "$in", value: slicer.values };
  }

  return { spec: { ...spec, filters }, avisos };
}

/** Lê os slicers guardados no JSONB, descartando o que não tem forma válida. */
export function slicersGuardados(bruto: unknown): Slicer[] {
  const r = z.array(slicerSchema).safeParse(bruto);
  return r.success ? r.data : [];
}
