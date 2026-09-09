/**
 * Story 47.3 — o que a tela do gerador decide, na forma pura (spec § 7).
 *
 * A cascata (trocar expert limpa tudo abaixo; trocar produto/funil/oferta
 * limpa a LP), as opções fixas (`ofmix` sempre por último; `lpmix` e `na`
 * sempre por último), o ano padrão, e a prévia — que é `buildCampaignName`
 * do `shared`, a MESMA função do servidor. O `.tsx` só desenha.
 */

import {
  LPMIX,
  NA,
  OFMIX,
  SEPARADOR,
  buildCampaignName,
  pedacosDoNome,
  type BlocoDoNome,
  type CampaignFields,
  type PedacoDoNome,
} from "@loyola-x/shared/src/nomenclatura-de-campanha";

export interface EstadoDoGerador {
  expertId: string;
  productId: string;
  funnelId: string;
  /** id da oferta ou `ofmix`. */
  offerId: string;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  /** id da LP, `lpmix` ou `na`. */
  lpId: string;
  suffix: string;
  notes: string;
}

export const ESTADO_VAZIO: EstadoDoGerador = {
  expertId: "",
  productId: "",
  funnelId: "",
  offerId: "",
  year: "",
  temperature: "",
  auction: "",
  format: "",
  lpId: "",
  suffix: "",
  notes: "",
};

type CampoDoEstado = keyof EstadoDoGerador;

/**
 * Regra de limpeza (spec § 7): trocar o expert limpa TUDO abaixo; trocar
 * produto, funil ou oferta limpa a LP. Ano/temperatura/leilão/formato não
 * limpam nada. Trocar pelo mesmo valor não limpa.
 */
export function aoEscolher(estado: EstadoDoGerador, campo: CampoDoEstado, valor: string): EstadoDoGerador {
  if (estado[campo] === valor) return estado;
  const proximo = { ...estado, [campo]: valor };
  if (campo === "expertId") {
    return { ...proximo, productId: "", funnelId: "", offerId: "", lpId: "" };
  }
  if (campo === "productId" || campo === "funnelId" || campo === "offerId") {
    return { ...proximo, lpId: "" };
  }
  return proximo;
}

export interface Opcao {
  value: string;
  rotulo: string;
  /** Opções fixas (`ofmix`, `lpmix`, `na`) não são registros. */
  fixa?: boolean;
}

/** Ofertas do expert + `ofmix — a campanha carrega mais de uma oferta` POR ÚLTIMO. */
export function opcoesDeOferta(ofertas: { id: string; rotulo: string }[]): Opcao[] {
  return [...ofertas.map((o) => ({ value: o.id, rotulo: o.rotulo })), { value: OFMIX, rotulo: `${OFMIX} — a campanha carrega mais de uma oferta`, fixa: true }];
}

/**
 * LPs cuja combinação bate com a seleção; com `ofmix`, as de todas as ofertas
 * do mesmo expert+produto+funil. `lpmix` e `na` sempre ao fim (spec § 7).
 */
export function opcoesDeLp(
  lps: { id: string; code: string; slug: string; productId: string; funnelId: string; offerId: string }[],
  estado: Pick<EstadoDoGerador, "productId" | "funnelId" | "offerId">,
): Opcao[] {
  const daCombinacao = lps.filter(
    (l) => l.productId === estado.productId && l.funnelId === estado.funnelId && (estado.offerId === OFMIX || l.offerId === estado.offerId),
  );
  return [
    ...daCombinacao.map((l) => ({ value: l.id, rotulo: `${l.code} — ${l.slug}` })),
    { value: LPMIX, rotulo: `${LPMIX} — a LP varia por anúncio`, fixa: true },
    { value: NA, rotulo: `${NA} — sem LP`, fixa: true },
  ];
}

/** Pré-seleciona o ano corrente SE existir no dicionário; senão fica vazio (spec § 7). */
export function anoPadrao(anos: { value: string }[], anoAtual: number): string {
  const alvo = String(anoAtual);
  return anos.some((a) => a.value === alvo) ? alvo : "";
}

export interface Tabelas {
  experts: { id: string; code: string }[];
  produtos: { id: string; slug: string }[];
  funis: { id: string; code: string }[];
  ofertas: { id: string; code: string }[];
  lps: { id: string; code: string }[];
}

/** Do estado (ids) para os CÓDIGOS que entram no nome. */
export function camposDoNome(estado: EstadoDoGerador, t: Tabelas): Partial<CampaignFields> {
  const acha = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id);
  return {
    expert: acha(t.experts, estado.expertId)?.code,
    product: acha(t.produtos, estado.productId)?.slug,
    funnel: acha(t.funis, estado.funnelId)?.code,
    offer: estado.offerId === OFMIX ? OFMIX : acha(t.ofertas, estado.offerId)?.code,
    year: estado.year || undefined,
    temperature: estado.temperature || undefined,
    auction: estado.auction || undefined,
    format: estado.format || undefined,
    lp: estado.lpId === LPMIX || estado.lpId === NA ? estado.lpId : acha(t.lps, estado.lpId)?.code,
    suffix: estado.suffix || undefined,
  };
}

export interface Previa {
  pedacos: PedacoDoNome[];
  /** O nome completo, ou `null` enquanto faltar campo. */
  nome: string | null;
  /** Texto para exibir: o nome, ou o parcial com `…` no lugar do que falta. */
  texto: string;
  tamanho: number;
  completo: boolean;
  /** Erro de formato (sufixo errado etc.) — com campos completos e nome nulo. */
  erro: string | null;
}

/** A prévia (spec § 7): parcial com `…`, contador, Salvar só quando completo. */
export function previaDoNome(campos: Partial<CampaignFields>): Previa {
  const pedacos = pedacosDoNome(campos);
  const completo = pedacos.every((p) => !p.faltando);
  let nome: string | null = null;
  let erro: string | null = null;
  if (completo) {
    try {
      nome = buildCampaignName(campos as CampaignFields);
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  const texto = nome ?? pedacos.map((p) => (p.faltando ? "…" : p.valor)).join(SEPARADOR);
  return { pedacos, nome, texto, tamanho: nome?.length ?? 0, completo: completo && nome !== null, erro };
}

/** Classes de cor por bloco — só tokens que existem em `globals.css`. */
export const CLASSE_DO_BLOCO: Record<BlocoDoNome | "sufixo", string> = {
  identidade: "text-brand",
  ano: "text-warning",
  segmentacao: "text-info",
  sufixo: "text-foreground",
};

export const LEGENDA_DOS_BLOCOS: { bloco: BlocoDoNome; rotulo: string; descricao: string }[] = [
  { bloco: "identidade", rotulo: "Identidade", descricao: "o que está sendo vendido e por qual máquina — soma ao longo do tempo" },
  { bloco: "ano", rotulo: "Ano", descricao: "em que ano a campanha foi publicada" },
  { bloco: "segmentacao", rotulo: "Segmentação", descricao: "como o orçamento está fatiado — compara entre campanhas do mesmo funil" },
];

/** O corpo que a API espera, a partir do estado. */
export function corpoDaCampanha(estado: EstadoDoGerador) {
  const ehOfmix = estado.offerId === OFMIX;
  const lpEspecial = estado.lpId === LPMIX || estado.lpId === NA;
  return {
    expertId: estado.expertId,
    productId: estado.productId,
    funnelId: estado.funnelId,
    offerId: ehOfmix ? null : estado.offerId,
    landingPageId: lpEspecial ? null : estado.lpId,
    lpValue: lpEspecial ? (estado.lpId as typeof LPMIX | typeof NA) : undefined,
    year: estado.year,
    temperature: estado.temperature,
    auction: estado.auction,
    format: estado.format,
    suffix: estado.suffix || null,
    notes: estado.notes.trim() || null,
  };
}

/** De uma campanha gravada para o estado do gerador (Editar e Duplicar). */
export function estadoDeCampanha(c: {
  expertId: string;
  productId: string;
  funnelId: string;
  offerId: string | null;
  landingPageId: string | null;
  lpValue: string;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  suffix: string | null;
  notes: string | null;
}): EstadoDoGerador {
  return {
    expertId: c.expertId,
    productId: c.productId,
    funnelId: c.funnelId,
    offerId: c.offerId ?? OFMIX,
    year: c.year,
    temperature: c.temperature,
    auction: c.auction,
    format: c.format,
    lpId: c.landingPageId ?? c.lpValue,
    suffix: c.suffix ?? "",
    notes: c.notes ?? "",
  };
}
