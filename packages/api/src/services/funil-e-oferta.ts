/**
 * Story 29.79 — funil e oferta de cada campanha do perpétuo, e o filtro das
 * vendas por eles.
 *
 * ## A regra, em três passos (AC2)
 *
 * Para cada campanha da ETAPA do funil, cada dimensão sai, nesta ordem:
 *
 * 1. do **nome atual** da campanha — o de HOJE na Meta, lido do cache de nomes
 *    (`meta_entity_names_cache`, a mesma fonte da fila de Legadas). NUNCA do
 *    `name` gravado em `funnel_stages.campaigns`: aquele é o do dia em que a
 *    campanha foi ligada à etapa e não acompanha renomeação — o DG vendeu como
 *    `a01/of01` e hoje gasta como `a02/of03` (R2/PO-04);
 * 2. senão — **só para a dimensão que o nome não traz** — do vínculo da
 *    Nomenclatura (`mapaDeDimensoes`: campanha do gerador com id colado ou
 *    legada classificada). Decisão (i) do Danilo, 2026-09-23: o nome vence;
 * 3. senão, `null` com o motivo.
 *
 * ## As campanhas são as da ETAPA, não as do funil
 *
 * A união de `funnel_stages.campaigns` do funil — a mesma lista que as leituras
 * vizinhas (`hourly`, cliques da análise de origem) usam, e no perpétuo a
 * mesma da tela (`stage.campaigns`). `campanhasDoFunil()` do mapa soma
 * `funnels.campaigns` e divergiria da mídia do painel (PO-02).
 *
 * ## ⚠️ Lista vazia NÃO é "sem filtro" aqui (R1/PO-03)
 *
 * Os leitores de `meta-db-source.ts` tratam `campaignIds = []` como o PROJETO
 * INTEIRO. Com filtro e nenhuma campanha casada, quem chama tem que pular o
 * leitor e devolver zero — nunca repassar `[]`. `FiltroDeCampanhas.campanhas`
 * vazio significa exatamente "nenhuma campanha", e as funções daqui nunca
 * consultam o banco com uma lista vazia.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  FORMATO_DO_CODIGO,
  FORA_CAMPANHA_FORA_DA_ETAPA,
  FORA_MACRO_NAO_RESOLVIDA,
  FORA_PLANILHA_SEM_UTM,
  FORA_SEM_FUNIL,
  FORA_SEM_OFERTA,
  FORA_SEM_UTM_CAMPAIGN,
  MOTIVO_NOME_NAO_SINCRONIZADO,
  MOTIVO_OFERTA_MISTA,
  MOTIVO_SEM_EXPERT,
  OFMIX,
  lerFunilDoNome,
  lerOfertaDoNome,
  type CampanhaComFunilEOferta,
  type CampanhaSemDimensao,
  type CodigoNaoCadastrado,
  type FiltroAplicado,
  type FunilOfertaDoFunil,
  type LeituraDeDimensao,
  type LinhaForaDoFiltro,
  type MotivoForaDoFiltro,
  type MotivoSemDimensao,
  type OpcaoDoDicionario,
  type OrigemDaDimensao,
} from "@loyola-x/shared";
import type { Database } from "../db/client.js";
import {
  funnelStages,
  metaCampaignInsightsDaily,
  metaEntityNamesCache,
  namingExperts,
  namingFunnels,
  namingOffers,
} from "../db/schema.js";
import { applyMetaTax } from "../utils/meta-tax.js";
import { mapaDeDimensoes, type MapaDeDimensoes } from "./nomenclatura/mapa-de-campanhas.js";

export type Dimensao = "funil" | "oferta";

// ── leituras do banco ──────────────────────────────────────────────────

/**
 * Os ids das campanhas das ETAPAS do funil — o mesmo código que vivia copiado
 * na rota `hourly` e nos cliques de `calcularVendasDoPerpetuo`, agora num lugar
 * só: o filtro e a mídia TÊM que sair da mesma lista (R4).
 *
 * Sem deduplicar, como as duas cópias faziam: repetir um id no `in (...)` não
 * muda o resultado, e mudar isto mudaria o SQL das leituras de "Todos".
 */
export async function idsDeCampanhaDasEtapas(db: Database, funnelId: string): Promise<string[]> {
  const stages = await db
    .select({ campaigns: funnelStages.campaigns })
    .from(funnelStages)
    .where(eq(funnelStages.funnelId, funnelId));
  return stages
    .flatMap((st) => (Array.isArray(st.campaigns) ? st.campaigns : []))
    .map((c: unknown) => (typeof c === "string" ? c : ((c as { id?: string })?.id ?? "")))
    .filter(Boolean);
}

/** O nome de HOJE de cada campanha, do cache de nomes. Lista vazia não consulta. */
export async function nomesAtuaisDasCampanhas(
  db: Database,
  projectId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await db
    .select({ entityId: metaEntityNamesCache.entityId, entityName: metaEntityNamesCache.entityName })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "campaign"),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );
  const pedidos = new Set(ids);
  return new Map(linhas.filter((l) => pedidos.has(l.entityId)).map((l) => [l.entityId, l.entityName]));
}

/**
 * Investimento de cada campanha na janela, com o imposto Meta aplicado UMA vez
 * por dia (a régua do painel). Lista vazia não consulta — e devolve vazio, não
 * o projeto.
 */
export async function gastoPorCampanha(
  db: Database,
  projectId: string,
  ids: string[],
  since: string,
  until: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const linhas = await db
    .select({
      campaignId: metaCampaignInsightsDaily.campaignId,
      dateStart: metaCampaignInsightsDaily.dateStart,
      spend: metaCampaignInsightsDaily.spend,
    })
    .from(metaCampaignInsightsDaily)
    .where(
      and(
        eq(metaCampaignInsightsDaily.projectId, projectId),
        inArray(metaCampaignInsightsDaily.campaignId, ids),
        gte(metaCampaignInsightsDaily.dateStart, since),
        lte(metaCampaignInsightsDaily.dateStart, until),
      ),
    );
  const pedidos = new Set(ids);
  for (const l of linhas) {
    if (!pedidos.has(l.campaignId)) continue;
    out.set(l.campaignId, (out.get(l.campaignId) ?? 0) + applyMetaTax(Number(l.spend ?? 0), l.dateStart));
  }
  return out;
}

/** O expert do projeto (no máximo um: `uq_naming_experts_project`). */
export async function expertDoProjeto(
  db: Database,
  projectId: string,
): Promise<{ id: string; code: string; name: string } | null> {
  const [e] = await db
    .select({ id: namingExperts.id, code: namingExperts.code, name: namingExperts.name })
    .from(namingExperts)
    .where(eq(namingExperts.projectId, projectId))
    .limit(1);
  return e ?? null;
}

/** Funis e ofertas do dicionário do expert — ativos e inativos (quem decide o que mostrar é o chamador). */
export async function dicionarioDoExpert(
  db: Database,
  expertId: string,
): Promise<{
  funis: { code: string; description: string; active: boolean }[];
  ofertas: { code: string; description: string; active: boolean }[];
}> {
  const [funis, ofertas] = await Promise.all([
    db
      .select({ code: namingFunnels.code, description: namingFunnels.description, active: namingFunnels.active })
      .from(namingFunnels)
      .where(eq(namingFunnels.expertId, expertId)),
    db
      .select({ code: namingOffers.code, description: namingOffers.description, active: namingOffers.active })
      .from(namingOffers)
      .where(eq(namingOffers.expertId, expertId)),
  ]);
  return { funis, ofertas };
}

// ── a regra (pura) ────────────────────────────────────────────────────

export interface DimensaoResolvida {
  codigo: string | null;
  origem: OrigemDaDimensao | null;
  motivo: MotivoSemDimensao | null;
}

/**
 * AC2 — nome atual > vínculo > `null` com motivo.
 *
 * @param doNome    a leitura do nome ATUAL; `null` quando o nome não está no cache
 * @param doVinculo o valor do vínculo da Nomenclatura para esta dimensão, se houver
 *
 * O vínculo só entra quando o nome não deu UM código. Valor de vínculo fora do
 * formato do dicionário é ignorado (nunca chute); `ofmix` vindo do vínculo é
 * `null` com o motivo "oferta mista" — nunca "não cadastrado" (PO-08).
 */
export function resolverDimensao(
  dimensao: Dimensao,
  doNome: LeituraDeDimensao | null,
  doVinculo: string | null | undefined,
): DimensaoResolvida {
  if (doNome?.codigo) return { codigo: doNome.codigo, origem: "nome", motivo: null };
  const v = String(doVinculo ?? "").trim().toLowerCase();
  if (v) {
    if (dimensao === "oferta" && v === OFMIX) return { codigo: null, origem: null, motivo: MOTIVO_OFERTA_MISTA };
    if (FORMATO_DO_CODIGO[dimensao].regex.test(v)) return { codigo: v, origem: "vinculo", motivo: null };
  }
  return { codigo: null, origem: null, motivo: doNome?.motivo ?? MOTIVO_NOME_NAO_SINCRONIZADO };
}

export interface CampanhaClassificada {
  campaignId: string;
  nome: string | null;
  funil: DimensaoResolvida;
  oferta: DimensaoResolvida;
}

/**
 * Classifica as campanhas da etapa. Puro: recebe os ids, o nome ATUAL de cada
 * uma e o mapa de vínculos. Deduplica por id, preservando a ordem da etapa.
 */
export function classificarCampanhas(
  ids: string[],
  nomesAtuais: Map<string, string>,
  vinculos: MapaDeDimensoes,
): CampanhaClassificada[] {
  const out: CampanhaClassificada[] = [];
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const nome = nomesAtuais.get(id) ?? null;
    const v = vinculos.get(id);
    out.push({
      campaignId: id,
      nome,
      funil: resolverDimensao("funil", nome === null ? null : lerFunilDoNome(nome), v?.funnel),
      oferta: resolverDimensao("oferta", nome === null ? null : lerOfertaDoNome(nome), v?.offer),
    });
  }
  return out;
}

/** As campanhas da etapa do funil, classificadas (três leituras do banco, nenhuma com lista vazia). */
export async function classificarCampanhasDoFunil(
  db: Database,
  { projectId, funnelId }: { projectId: string; funnelId: string },
): Promise<CampanhaClassificada[]> {
  const ids = await idsDeCampanhaDasEtapas(db, funnelId);
  if (ids.length === 0) return [];
  const [nomes, vinculos] = await Promise.all([
    nomesAtuaisDasCampanhas(db, projectId, [...new Set(ids)]),
    mapaDeDimensoes(db, projectId),
  ]);
  return classificarCampanhas(ids, nomes, vinculos);
}

// ── o filtro das vendas (AC4/AC5) ─────────────────────────────────────

export interface FiltroDeCampanhas {
  funil: string | null;
  oferta: string | null;
  /** As campanhas da etapa que casam o pedido (E). VAZIO = nenhuma — nunca "sem filtro". */
  campanhas: Set<string>;
  /** Todas as campanhas da etapa, classificadas — o motivo de quem ficou fora sai daqui. */
  daEtapa: Map<string, CampanhaClassificada>;
}

export function montarFiltroDeCampanhas(
  classificadas: CampanhaClassificada[],
  pedido: { funil?: string | null; oferta?: string | null },
): FiltroDeCampanhas {
  const funil = pedido.funil ?? null;
  const oferta = pedido.oferta ?? null;
  const campanhas = new Set<string>();
  const daEtapa = new Map<string, CampanhaClassificada>();
  for (const c of classificadas) {
    daEtapa.set(c.campaignId, c);
    if (funil !== null && c.funil.codigo !== funil) continue;
    if (oferta !== null && c.oferta.codigo !== oferta) continue;
    campanhas.add(c.campaignId);
  }
  return { funil, oferta, campanhas, daEtapa };
}

/** O filtro pedido na query, ou `undefined` sem `funil` nem `oferta` — "Todos" nem consulta nada. */
export async function filtroDaQuery(
  db: Database,
  alvo: { projectId: string; funnelId: string },
  query: { funil?: string; oferta?: string },
): Promise<FiltroDeCampanhas | undefined> {
  if (!query.funil && !query.oferta) return undefined;
  const classificadas = await classificarCampanhasDoFunil(db, alvo);
  return montarFiltroDeCampanhas(classificadas, { funil: query.funil, oferta: query.oferta });
}

export function resumoDoFiltro(filtro: FiltroDeCampanhas): FiltroAplicado {
  return { funil: filtro.funil, oferta: filtro.oferta, campanhas: [...filtro.campanhas].sort() };
}

/**
 * As campanhas que o lado Meta deve ler com o filtro — `null` quando o filtro
 * não casou nenhuma (R1): quem recebe `null` NÃO chama o leitor e usa zero.
 * Sem filtro, a lista original, intacta.
 */
export function campanhasParaMidia(ids: string[], filtro: FiltroDeCampanhas | undefined): string[] | null {
  if (!filtro) return ids;
  const alvo = ids.filter((id) => filtro.campanhas.has(id));
  return alvo.length > 0 ? alvo : null;
}

export type DecisaoDaLinha =
  | { dentro: true }
  /** Fora e declarada no aviso, com o motivo. */
  | { dentro: false; motivo: MotivoForaDoFiltro; detalhe: MotivoSemDimensao | null }
  /** Fora porque é de OUTRO funil/oferta conhecido — não é perda, não entra no aviso. */
  | { dentro: false; motivo: null };

/**
 * Onde cai uma linha de venda, pelo seu `utm_campaign` (já passado por
 * `sanitizeUtmValue`).
 *
 * Só vai para o aviso o que NÃO se sabe atribuir: sem `utm_campaign`, macro
 * crua, campanha que não é da etapa, ou campanha da etapa sem a dimensão pedida
 * — desde que nenhuma dimensão conhecida a exclua. Uma venda de `a02` quando o
 * filtro é `a01` pertence ao `a02`; declará-la "fora" faria a soma do aviso
 * passar do que realmente se perdeu.
 */
export function decidirLinhaNoFiltro(
  utmCampaign: string | null,
  filtro: FiltroDeCampanhas,
  temColunaDeCampanha: boolean,
): DecisaoDaLinha {
  if (!temColunaDeCampanha) return { dentro: false, motivo: FORA_PLANILHA_SEM_UTM, detalhe: null };
  if (!utmCampaign) return { dentro: false, motivo: FORA_SEM_UTM_CAMPAIGN, detalhe: null };
  if (utmCampaign.includes("{{")) return { dentro: false, motivo: FORA_MACRO_NAO_RESOLVIDA, detalhe: null };
  if (filtro.campanhas.has(utmCampaign)) return { dentro: true };
  const c = filtro.daEtapa.get(utmCampaign);
  if (!c) return { dentro: false, motivo: FORA_CAMPANHA_FORA_DA_ETAPA, detalhe: null };

  const pedidas: { dim: DimensaoResolvida; codigo: string; motivo: MotivoForaDoFiltro }[] = [];
  if (filtro.funil !== null) pedidas.push({ dim: c.funil, codigo: filtro.funil, motivo: FORA_SEM_FUNIL });
  if (filtro.oferta !== null) pedidas.push({ dim: c.oferta, codigo: filtro.oferta, motivo: FORA_SEM_OFERTA });
  // Uma dimensão CONHECIDA e diferente já decide: a venda é de outro funil/oferta.
  if (pedidas.some((p) => p.dim.codigo !== null && p.dim.codigo !== p.codigo)) return { dentro: false, motivo: null };
  const ausente = pedidas.find((p) => p.dim.codigo === null);
  if (ausente) return { dentro: false, motivo: ausente.motivo, detalhe: ausente.dim.motivo };
  return { dentro: false, motivo: null };
}

/**
 * Soma o que ficou de fora, por motivo. `compradores` são DISTINTOS pela chave
 * do card (quem chama passa `chaveDeComprador`); faturamento é o BRUTO.
 */
export function acumuladorForaDoFiltro() {
  const porMotivo = new Map<
    string,
    { motivo: MotivoForaDoFiltro; detalhe: MotivoSemDimensao | null; compradores: Set<string>; faturamentoBruto: number }
  >();
  return {
    somar(decisao: { motivo: MotivoForaDoFiltro; detalhe: MotivoSemDimensao | null }, comprador: string, bruto: number) {
      const k = `${decisao.motivo}|${decisao.detalhe ?? ""}`;
      const e = porMotivo.get(k) ?? { motivo: decisao.motivo, detalhe: decisao.detalhe, compradores: new Set<string>(), faturamentoBruto: 0 };
      e.compradores.add(comprador);
      e.faturamentoBruto += bruto;
      porMotivo.set(k, e);
    },
    lista(): LinhaForaDoFiltro[] {
      return [...porMotivo.values()]
        .map((e) => ({ motivo: e.motivo, detalhe: e.detalhe, compradores: e.compradores.size, faturamentoBruto: e.faturamentoBruto }))
        .sort((a, b) => b.faturamentoBruto - a.faturamentoBruto || a.motivo.localeCompare(b.motivo));
    },
  };
}

// ── a rota `funil-oferta` (AC3) ───────────────────────────────────────

/**
 * Monta a resposta da rota a partir das campanhas classificadas, do gasto e do
 * dicionário. Pura — as leituras ficam em `carregarFunilOferta`.
 */
export function montarFunilOferta(input: {
  classificadas: CampanhaClassificada[];
  gasto: Map<string, number>;
  expert: { id: string; code: string; name: string } | null;
  dicionario: {
    funis: { code: string; description: string; active: boolean }[];
    ofertas: { code: string; description: string; active: boolean }[];
  } | null;
  janela: { since: string; until: string };
}): FunilOfertaDoFunil {
  const { classificadas, gasto, expert, dicionario, janela } = input;

  const campanhas: CampanhaComFunilEOferta[] = classificadas.map((c) => ({
    campaignId: c.campaignId,
    nome: c.nome,
    funil: c.funil.codigo,
    oferta: c.oferta.codigo,
    origemFunil: c.funil.origem,
    origemOferta: c.oferta.origem,
    ...(c.funil.motivo ? { motivoSemFunil: c.funil.motivo } : {}),
    ...(c.oferta.motivo ? { motivoSemOferta: c.oferta.motivo } : {}),
    gasto: gasto.get(c.campaignId) ?? 0,
  }));

  const semDimensao = (d: Dimensao): CampanhaSemDimensao[] =>
    classificadas
      .filter((c) => c[d].codigo === null)
      .map((c) => ({
        campaignId: c.campaignId,
        nome: c.nome,
        gasto: gasto.get(c.campaignId) ?? 0,
        motivo: c[d].motivo ?? MOTIVO_NOME_NAO_SINCRONIZADO,
      }))
      .sort((a, b) => b.gasto - a.gasto);

  const usados = (d: Dimensao) => {
    const m = new Map<string, { campaignId: string; nome: string | null }[]>();
    for (const c of classificadas) {
      const codigo = c[d].codigo;
      if (!codigo) continue;
      const lista = m.get(codigo) ?? [];
      lista.push({ campaignId: c.campaignId, nome: c.nome });
      m.set(codigo, lista);
    }
    return m;
  };

  const opcoesDe = (d: Dimensao, cadastro: { code: string; description: string; active: boolean }[]): OpcaoDoDicionario[] => {
    const emUso = usados(d);
    return cadastro
      // Ativos sempre; inativos só se aparecem em campanha — código com gasto nunca some (PO-09).
      .filter((x) => x.active || emUso.has(x.code))
      .map((x) => ({ codigo: x.code, descricao: x.description, ativo: x.active }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  };

  const naoCadastradosDe = (d: Dimensao, cadastro: { code: string }[]): CodigoNaoCadastrado[] => {
    const existe = new Set(cadastro.map((x) => x.code));
    return [...usados(d).entries()]
      .filter(([codigo]) => !existe.has(codigo))
      .map(([codigo, campanhasDoCodigo]) => ({ dimensao: d, codigo, campanhas: campanhasDoCodigo }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  };

  return {
    expert,
    motivoSemExpert: expert ? null : MOTIVO_SEM_EXPERT,
    opcoes: dicionario
      ? { funis: opcoesDe("funil", dicionario.funis), ofertas: opcoesDe("oferta", dicionario.ofertas) }
      : { funis: [], ofertas: [] },
    campanhas,
    // Sem expert não há dicionário contra o qual comparar: a tela pede o vínculo
    // do expert primeiro, em vez de acusar todo código de "não cadastrado".
    naoCadastrados: dicionario
      ? [...naoCadastradosDe("funil", dicionario.funis), ...naoCadastradosDe("oferta", dicionario.ofertas)]
      : [],
    semFunil: semDimensao("funil"),
    semOferta: semDimensao("oferta"),
    janela,
  };
}

export async function carregarFunilOferta(
  db: Database,
  { projectId, funnelId, since, until }: { projectId: string; funnelId: string; since: string; until: string },
): Promise<FunilOfertaDoFunil> {
  const [classificadas, expert] = await Promise.all([
    classificarCampanhasDoFunil(db, { projectId, funnelId }),
    expertDoProjeto(db, projectId),
  ]);
  const ids = classificadas.map((c) => c.campaignId);
  const [gasto, dicionario] = await Promise.all([
    gastoPorCampanha(db, projectId, ids, since, until),
    expert ? dicionarioDoExpert(db, expert.id) : Promise.resolve(null),
  ]);
  return montarFunilOferta({ classificadas, gasto, expert, dicionario, janela: { since, until } });
}
