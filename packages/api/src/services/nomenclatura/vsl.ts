/**
 * Story 47.9 — montar uma VSL a partir dos ids escolhidos no gerador.
 *
 * Mesmo desenho de `campanhas.ts` (`montarCampanha`): o cliente manda IDs
 * (expert, produto, lead, problema, solução, oferta); o servidor
 *
 * 1. carrega cada registro e exige coerência de expert (spec § 5) — e que
 *    cada variável seja DO TIPO certo (um lead não entra como problema);
 * 2. exige que tudo esteja ATIVO (regra 8);
 * 3. monta o nome com `buildVslName` e revalida com `parseVslName` contra o
 *    snapshot só-ativos — a mesma função da prévia;
 * 4. devolve o que vai para `naming_vsls`: FKs + o TEXTO de cada campo.
 *
 * `name` NUNCA vem do cliente.
 */

import { buildVslName, parseVslName, type TipoDeVariavel, type VslFields } from "@loyola-x/shared";
import { ErroDeNomenclatura, exigirMesmoExpert } from "./regras.js";
import type { Repositorio } from "./repositorio.js";

export interface EntradaDeVsl {
  expertId: string;
  productId: string;
  leadId: string;
  problemId: string;
  solutionId: string;
  offerId: string;
}

export interface VslMontada {
  expertId: string;
  productId: string;
  leadId: string;
  problemId: string;
  solutionId: string;
  offerId: string;
  leadValue: string;
  problemValue: string;
  solutionValue: string;
  offerValue: string;
  name: string;
  fields: VslFields;
}

/** Os campos que compõem o nome (o que o PATCH recalcula). */
export const CAMPOS_DA_VSL_NO_BANCO = ["expertId", "productId", "leadId", "problemId", "solutionId", "offerId"] as const;

const ROTULO: Record<TipoDeVariavel, string> = { lead: "lead", problem: "mecanismo do problema", solution: "mecanismo da solução" };

export async function montarVsl(r: Repositorio, e: EntradaDeVsl): Promise<VslMontada> {
  const [expert, produto, oferta] = await Promise.all([r.porId("experts", e.expertId), r.porId("produtos", e.productId), r.porId("ofertas", e.offerId)]);
  if (!expert) throw new ErroDeNomenclatura(404, "expertId: expert não encontrado", { campo: "expertId" });
  exigirMesmoExpert(expert.id, [
    { campo: "productId", expertId: produto?.expertId, rotulo: "produto" },
    { campo: "offerId", expertId: oferta?.expertId, rotulo: "oferta" },
  ]);
  const inativo = (campo: string, rotulo: string) =>
    new ErroDeNomenclatura(422, `${campo}: ${rotulo} está inativo — código desativado não entra em nome novo (regra 8)`, { campo });
  if (!expert.active) throw inativo("expertId", expert.code);
  if (!produto!.active) throw inativo("productId", produto!.slug);
  if (!oferta!.active) throw inativo("offerId", oferta!.code);

  // As três variáveis: do mesmo expert, do TIPO certo, ativas.
  const variavel = async (campo: "leadId" | "problemId" | "solutionId", id: string, tipo: TipoDeVariavel) => {
    const v = await r.porId("vslVariaveis", id);
    exigirMesmoExpert(expert.id, [{ campo, expertId: v?.expertId, rotulo: ROTULO[tipo] }]);
    if (v!.type !== tipo) throw new ErroDeNomenclatura(422, `${campo}: "${v!.code}" é ${ROTULO[v!.type]}, não ${ROTULO[tipo]}`, { campo });
    if (!v!.active) throw inativo(campo, v!.code);
    return v!;
  };
  const lead = await variavel("leadId", e.leadId, "lead");
  const problem = await variavel("problemId", e.problemId, "problem");
  const solution = await variavel("solutionId", e.solutionId, "solution");

  const fields: VslFields = { expert: expert.code, product: produto!.slug, lead: lead.code, problem: problem.code, solution: solution.code, offer: oferta!.code };
  let name: string;
  try {
    name = buildVslName(fields);
  } catch (err) {
    throw new ErroDeNomenclatura(400, (err as Error).message);
  }
  const parse = parseVslName(name, await r.snapshotDeVsl(false));
  if (!parse.valid) throw new ErroDeNomenclatura(422, parse.errors.join("; "), { erros: parse.errors });

  return {
    expertId: expert.id,
    productId: produto!.id,
    leadId: lead.id,
    problemId: problem.id,
    solutionId: solution.id,
    offerId: oferta!.id,
    leadValue: lead.code,
    problemValue: problem.code,
    solutionValue: solution.code,
    offerValue: oferta!.code,
    name,
    fields,
  };
}
