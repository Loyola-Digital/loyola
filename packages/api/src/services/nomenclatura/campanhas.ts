/**
 * Story 47.3 — montar uma campanha a partir dos ids escolhidos no gerador.
 *
 * O cliente manda IDs (expert, produto, funil, oferta ou `ofmix`, LP ou
 * `lpmix`/`na`) e os quatro valores fixos. O servidor:
 *
 * 1. carrega cada registro e exige coerência de expert (spec § 5);
 * 2. exige que tudo esteja ATIVO — regra 8: valor fora do dicionário vigente
 *    é erro; código desativado não entra em nome novo;
 * 3. monta o nome com `buildCampaignName` e o revalida com
 *    `parseCampaignName` contra o snapshot só-ativos — a mesma função que a
 *    prévia usou, então tela e servidor não podem discordar;
 * 4. devolve o que vai para `naming_campaigns`: FKs + o TEXTO de cada campo.
 *
 * `name` NUNCA vem do cliente.
 */

import { LPMIX, NA, OFMIX, buildCampaignName, parseCampaignName, type CampaignFields } from "@loyola-x/shared";
import { ErroDeNomenclatura, exigirMesmoExpert } from "./regras.js";
import type { Repositorio } from "./repositorio.js";

export interface EntradaDeCampanha {
  expertId: string;
  productId: string;
  funnelId: string;
  /** `null` = `ofmix`. */
  offerId: string | null;
  /** `null` = `lpValue` decide entre `lpmix` e `na`. */
  landingPageId: string | null;
  lpValue?: typeof LPMIX | typeof NA;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  suffix?: string | null;
}

export interface CampanhaMontada {
  expertId: string;
  productId: string;
  funnelId: string;
  offerId: string | null;
  offerValue: string;
  landingPageId: string | null;
  lpValue: string;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  suffix: string | null;
  name: string;
  fields: CampaignFields;
}

export async function montarCampanha(r: Repositorio, e: EntradaDeCampanha): Promise<CampanhaMontada> {
  const [expert, produto, funil] = await Promise.all([r.porId("experts", e.expertId), r.porId("produtos", e.productId), r.porId("funis", e.funnelId)]);
  if (!expert) throw new ErroDeNomenclatura(404, "expertId: expert não encontrado", { campo: "expertId" });
  exigirMesmoExpert(expert.id, [
    { campo: "productId", expertId: produto?.expertId, rotulo: "produto" },
    { campo: "funnelId", expertId: funil?.expertId, rotulo: "funil" },
  ]);
  const inativo = (campo: string, rotulo: string) =>
    new ErroDeNomenclatura(422, `${campo}: ${rotulo} está inativo — código desativado não entra em nome novo (regra 8)`, { campo });
  if (!expert.active) throw inativo("expertId", expert.code);
  if (!produto!.active) throw inativo("productId", produto!.slug);
  if (!funil!.active) throw inativo("funnelId", funil!.code);

  let offerValue = OFMIX;
  let oferta: Awaited<ReturnType<typeof r.porId<"ofertas">>> | undefined;
  if (e.offerId) {
    oferta = await r.porId("ofertas", e.offerId);
    exigirMesmoExpert(expert.id, [{ campo: "offerId", expertId: oferta?.expertId, rotulo: "oferta" }]);
    if (!oferta!.active) throw inativo("offerId", oferta!.code);
    offerValue = oferta!.code;
  }

  let lpValue: string;
  if (e.landingPageId) {
    const lp = await r.porId("lps", e.landingPageId);
    exigirMesmoExpert(expert.id, [{ campo: "landingPageId", expertId: lp?.expertId, rotulo: "LP" }]);
    if (lp!.productId !== produto!.id || lp!.funnelId !== funil!.id) {
      throw new ErroDeNomenclatura(422, "landingPageId: a LP pertence a outro produto/funil", { campo: "landingPageId" });
    }
    // Com oferta definida a LP tem que ser dela; com ofmix, qualquer oferta do mesmo expert+produto+funil serve (spec § 7).
    if (oferta && lp!.offerId !== oferta.id) {
      throw new ErroDeNomenclatura(422, "landingPageId: a LP pertence a outra oferta", { campo: "landingPageId" });
    }
    if (!lp!.active) throw inativo("landingPageId", lp!.slug);
    lpValue = lp!.code;
  } else {
    if (e.lpValue !== LPMIX && e.lpValue !== NA) {
      throw new ErroDeNomenclatura(400, `lpValue: sem LP escolhida, tem que ser "${LPMIX}" ou "${NA}"`, { campo: "lpValue" });
    }
    lpValue = e.lpValue;
  }

  const fields: CampaignFields = {
    expert: expert.code,
    product: produto!.slug,
    funnel: funil!.code,
    offer: offerValue,
    year: e.year,
    temperature: e.temperature,
    auction: e.auction,
    format: e.format,
    lp: lpValue,
    ...(e.suffix ? { suffix: e.suffix } : {}),
  };

  let name: string;
  try {
    name = buildCampaignName(fields);
  } catch (err) {
    throw new ErroDeNomenclatura(400, (err as Error).message);
  }
  // Snapshot SÓ ATIVOS: é a gravação (regra 8). Os valores fixos são checados aqui.
  const parse = parseCampaignName(name, await r.snapshot(false));
  if (!parse.valid) throw new ErroDeNomenclatura(422, parse.errors.join("; "), { erros: parse.errors });

  return {
    expertId: expert.id,
    productId: produto!.id,
    funnelId: funil!.id,
    offerId: oferta?.id ?? null,
    offerValue,
    landingPageId: e.landingPageId ?? null,
    lpValue,
    year: e.year,
    temperature: e.temperature,
    auction: e.auction,
    format: e.format,
    suffix: e.suffix || null,
    name,
    fields,
  };
}

/**
 * Story 47.8 (AC5, T5) — recalcula `name` das campanhas NÃO publicadas com o
 * template vigente. Idempotente: quem já está no padrão não é tocada. Publicada
 * nunca muda (regra 6) — nem passa por aqui, o repositório só devolve as sem
 * `published_at`.
 *
 * Reconstrói a partir do que a linha guarda (FKs → código; valores fixos e
 * `offerValue`/`lpValue` são texto na própria linha). Só formato: NÃO revalida
 * contra o dicionário vigente, porque a campanha já existe — se um valor foi
 * desativado depois, o nome continua reconstruível (spec § 4.7) e é isso que
 * se quer preservar. Cada mudança deixa `before`/`after` no changelog.
 */
export async function recalcularNomesNaoPublicados(r: Repositorio, author: string | null): Promise<{ examinadas: number; renomeadas: { id: string; de: string; para: string }[]; ignoradas: { id: string; motivo: string }[] }> {
  const campanhas = await r.campanhas.naoPublicadas();
  const renomeadas: { id: string; de: string; para: string }[] = [];
  const ignoradas: { id: string; motivo: string }[] = [];
  for (const c of campanhas) {
    const [expert, produto, funil] = await Promise.all([r.porId("experts", c.expertId), r.porId("produtos", c.productId), r.porId("funis", c.funnelId)]);
    if (!expert || !produto || !funil) {
      ignoradas.push({ id: c.id, motivo: "expert, produto ou funil não encontrado" });
      continue;
    }
    let name: string;
    try {
      name = buildCampaignName({
        expert: expert.code,
        product: produto.slug,
        funnel: funil.code,
        offer: c.offerValue,
        year: c.year,
        temperature: c.temperature,
        auction: c.auction,
        format: c.format,
        lp: c.lpValue,
        ...(c.suffix ? { suffix: c.suffix } : {}),
      });
    } catch (err) {
      ignoradas.push({ id: c.id, motivo: (err as Error).message });
      continue;
    }
    if (name === c.name) continue;
    await r.atualizar("campanhas", c, { name } as never, author, "update");
    renomeadas.push({ id: c.id, de: c.name, para: name });
  }
  return { examinadas: campanhas.length, renomeadas, ignoradas };
}

/** Os campos que congelam depois de publicada (spec § 3, regra 6). */
export const CAMPOS_DO_NOME = ["expertId", "productId", "funnelId", "offerId", "landingPageId", "lpValue", "year", "temperature", "auction", "format", "suffix"] as const;
