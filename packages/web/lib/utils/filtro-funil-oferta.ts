// ============================================================
// Story 29.80 — os filtros de Funil e Oferta do painel do perpétuo.
//
// Tudo o que DECIDE mora aqui, puro e testável (o runner do web só coleta
// `lib/utils/**/*.test.ts`): se os filtros aparecem, o que vai para a API, qual
// lista de campanhas cada bloco Meta recebe, o aviso do que ficou de fora e as
// sinalizações com link para o cadastro. O componente só desenha.
//
// ## O defeito mais provável (R1/PO-02)
//
// Estreitar os `campaignIds` até `[]` e repassar a lista vazia. Para quase todo
// hook de mídia (`useTrafficOverview`, `useAllAdSets`, `useAllAds`,
// `useCamadasDeVideo`), `[]` significa "sem filtro de campanha" — o PROJETO
// INTEIRO; para a tela, `hasCampaigns = false` significa o modo "100 %
// planilha". O filtro que não casa campanha nenhuma (o churrasco em `of01`) cai
// exatamente nos dois. Por isso o resultado vazio é um TIPO próprio
// (`{ tipo: "vazio" }`), sem lista nenhuma para repassar.
// ============================================================

import type {
  CampanhaComFunilEOferta,
  FunilOfertaDoFunil,
  LinhaForaDoFiltro,
  MotivoSemDimensao,
} from "@loyola-x/shared";
// Import de VALOR do shared no web vai por subpath (módulo folha).
import { ehCandidataALegada } from "@loyola-x/shared/src/nomenclatura-legado";
import { hrefDe } from "@/lib/utils/nomenclatura-abas";

export interface FiltroFunilOferta {
  funil: string | null;
  oferta: string | null;
}

export const SEM_FILTRO: FiltroFunilOferta = { funil: null, oferta: null };

export function temFiltro(f: FiltroFunilOferta | null | undefined): f is FiltroFunilOferta {
  return !!f && (f.funil !== null || f.oferta !== null);
}

// ── o estreitamento das campanhas (AC2) ──────────────────────────────────

export type RecorteDeMidia =
  /** Sem filtro: a lista ORIGINAL da etapa, a mesma referência. */
  | { tipo: "todos"; ids: string[] }
  /** Com filtro e campanha casada: só elas. Nunca vazia. */
  | { tipo: "filtrado"; ids: string[] }
  /** Com filtro e NENHUMA campanha: lado Meta zero. Não há lista — de propósito. */
  | { tipo: "vazio" };

/**
 * As campanhas da etapa com o funil/oferta pedido (E). A classificação vem da
 * 29.79 (`campanhas[]`, pelo nome ATUAL da campanha); a ordem é a da etapa.
 *
 * Com filtro e sem a lista classificada, é `vazio`: não se sabe quais casam, e
 * mostrar a mídia da etapa inteira como se fosse a do filtro é o erro que não
 * pode acontecer. (O `planoDoFiltro` só liga o filtro com a lista carregada.)
 */
export function estreitarCampanhas(
  campaignIdsDaEtapa: string[],
  campanhas: readonly CampanhaComFunilEOferta[] | undefined,
  filtro: FiltroFunilOferta | null,
): RecorteDeMidia {
  if (!temFiltro(filtro)) return { tipo: "todos", ids: campaignIdsDaEtapa };
  const casam = new Set(
    (campanhas ?? [])
      .filter((c) => (filtro.funil === null || c.funil === filtro.funil) && (filtro.oferta === null || c.oferta === filtro.oferta))
      .map((c) => c.campaignId),
  );
  const ids = [...new Set(campaignIdsDaEtapa.filter((id) => casam.has(id)))];
  return ids.length > 0 ? { tipo: "filtrado", ids } : { tipo: "vazio" };
}

/** A lista que um bloco Meta recebe: `null` quando não há mídia a ler (nunca `[]`). */
export function idsDaMidia(recorte: RecorteDeMidia): string[] | null {
  return recorte.tipo === "vazio" ? null : recorte.ids;
}

// ── o plano: aparece? ligado? o que vai para a API? (AC1/AC5/AC7) ─────────

export const FRASE_API_SEM_FILTRO = "a API ainda não tem este filtro";
export const FRASE_SEM_EXPERT = "projeto sem expert vinculado";
export const FRASE_NENHUMA_CAMPANHA = "nenhuma campanha com este filtro";

export interface ConsultaDoFunilOferta {
  dados: FunilOfertaDoFunil | undefined;
  carregando: boolean;
  /** Status HTTP do erro, quando houve. `404` = a API não tem a rota da 29.79. */
  erroStatus: number | null;
}

export interface PlanoDoFiltro {
  /** Os dois selects aparecem? Só no funil perpétuo. */
  mostrar: boolean;
  /** Por que estão desabilitados; `null` = habilitados. */
  desabilitado: string | null;
  /** O filtro em vigor; `null` = "Todos". */
  filtro: FiltroFunilOferta | null;
  /**
   * O que vai às leituras de vendas. `{}` sempre que o filtro não vale — e
   * enquanto a API não declarou suporte (AC7): uma API antiga IGNORA o
   * parâmetro calada e devolveria vendas sem filtro ao lado de mídia filtrada.
   */
  recorteDeVendas: RecorteDeVendas;
  /**
   * A planilha EXISTE e não tem `utm_campaign`: as vendas ficam sem filtro,
   * com selo (AC3). Falso sem planilha (as vendas são do pixel, filtrado).
   */
  vendasNaoFiltraveis: boolean;
  midia: RecorteDeMidia;
}

export interface RecorteDeVendas {
  funil?: string;
  oferta?: string;
}

/**
 * Story 29.80 (REQ-001 do gate) — a planilha de vendas do funil, em cinco
 * estados. "Sem planilha" e "planilha sem `utm_campaign`" NÃO são a mesma
 * coisa: sem planilha, as vendas da tela vêm do pixel, que já é filtrado
 * pelas campanhas — o selo "a planilha não tem utm_campaign" seria falso ali.
 */
export type EstadoDaPlanilhaDeVendas =
  /** A consulta ainda não resolveu: não se sabe se o recorte vale. */
  | "carregando"
  /** A consulta falhou sem dado anterior. */
  | "erro"
  /** O funil não tem planilha de vendas (a API devolveu `null`). */
  | "sem-planilha"
  /** Tem planilha, sem a coluna `utm_campaign` mapeada (dg-a1). */
  | "sem-utm-campaign"
  | "com-utm-campaign";

export const FRASE_CARREGANDO_PLANILHA = "carregando a planilha de vendas…";
export const FRASE_ERRO_PLANILHA = "não foi possível carregar a planilha de vendas";

/** O estado da planilha a partir da consulta `usePerpetualSpreadsheet`. */
export function estadoDaPlanilhaDeVendas(consulta: {
  dados: { columnMapping?: { utm_campaign?: string | null } | null } | null | undefined;
  falhou: boolean;
}): EstadoDaPlanilhaDeVendas {
  const { dados, falhou } = consulta;
  if (dados === undefined) return falhou ? "erro" : "carregando";
  if (dados === null) return "sem-planilha";
  return dados.columnMapping?.utm_campaign ? "com-utm-campaign" : "sem-utm-campaign";
}

export function planoDoFiltro(input: {
  tipoDoFunil: string;
  campaignIdsDaEtapa: string[];
  pedido: FiltroFunilOferta;
  consulta: ConsultaDoFunilOferta;
  planilhaDeVendas: EstadoDaPlanilhaDeVendas;
}): PlanoDoFiltro {
  const { tipoDoFunil, campaignIdsDaEtapa, pedido, consulta, planilhaDeVendas } = input;
  const desligado = (mostrar: boolean, desabilitado: string | null): PlanoDoFiltro => ({
    mostrar,
    desabilitado,
    filtro: null,
    recorteDeVendas: {},
    vendasNaoFiltraveis: false,
    midia: { tipo: "todos", ids: campaignIdsDaEtapa },
  });

  // AC1: só no perpétuo. (O Lyrio tem render próprio; o `mobile` não chega aqui.)
  if (tipoDoFunil !== "perpetual") return desligado(false, null);
  // AC7: sem a rota, a tela segue EXATAMENTE como hoje.
  if (!consulta.dados) {
    if (consulta.erroStatus === 404) return desligado(true, FRASE_API_SEM_FILTRO);
    if (consulta.erroStatus !== null) return desligado(true, `não foi possível carregar funis e ofertas (erro ${consulta.erroStatus || "de rede"})`);
    return desligado(true, consulta.carregando ? "carregando funis e ofertas…" : FRASE_API_SEM_FILTRO);
  }
  // AC5: sem expert não há dicionário — filtros desabilitados, com o link para vincular.
  if (!consulta.dados.expert) return desligado(true, FRASE_SEM_EXPERT);
  // REQ-001: enquanto a planilha não resolveu, não se sabe se as vendas
  // filtram — ligar o filtro agora daria mídia filtrada ao lado de vendas
  // que talvez não sejam, e as leituras de vendas seriam pedidas duas vezes.
  if (planilhaDeVendas === "carregando") return desligado(true, FRASE_CARREGANDO_PLANILHA);
  if (planilhaDeVendas === "erro") return desligado(true, FRASE_ERRO_PLANILHA);
  if (!temFiltro(pedido)) return desligado(true, null);

  const filtro = { funil: pedido.funil, oferta: pedido.oferta };
  // Só a planilha SEM a coluna deixa as vendas sem filtro (AC3, dg-a1). Sem
  // planilha, o recorte vai do mesmo jeito: as vendas da tela são do pixel
  // (filtrado pelas campanhas) e o investimento por dia da semana da rota
  // horária também se estreita.
  const vendasNaoFiltraveis = planilhaDeVendas === "sem-utm-campaign";
  const recorteDeVendas: RecorteDeVendas = {};
  if (!vendasNaoFiltraveis) {
    if (filtro.funil) recorteDeVendas.funil = filtro.funil;
    if (filtro.oferta) recorteDeVendas.oferta = filtro.oferta;
  }
  return {
    mostrar: true,
    desabilitado: null,
    filtro,
    recorteDeVendas,
    vendasNaoFiltraveis,
    midia: estreitarCampanhas(campaignIdsDaEtapa, consulta.dados.campanhas, filtro),
  };
}

/** O pedaço de query string das leituras de vendas. `""` sem recorte — a URL de "Todos" não muda. */
export function sufixoDoRecorte(recorte: RecorteDeVendas | undefined): string {
  if (!recorte) return "";
  let s = "";
  if (recorte.funil) s += `&funil=${encodeURIComponent(recorte.funil)}`;
  if (recorte.oferta) s += `&oferta=${encodeURIComponent(recorte.oferta)}`;
  return s;
}

/**
 * A resposta de vendas APLICOU o filtro pedido? A 29.79 ecoa `filtro` quando
 * aplica; uma API que não o conhece devolve sem. Recorte vazio → sempre `true`.
 */
export function vendasRespeitaramORecorte(
  resposta: { filtro?: { funil: string | null; oferta: string | null } } | null | undefined,
  recorte: RecorteDeVendas,
): boolean {
  if (!recorte.funil && !recorte.oferta) return true;
  if (!resposta) return true; // ainda carregando: nada a acusar
  const f = resposta.filtro;
  return !!f && (f.funil ?? undefined) === recorte.funil && (f.oferta ?? undefined) === recorte.oferta;
}

// ── sinalizações com link para o cadastro (AC5) ──────────────────────────

export interface Sinalizacao {
  chave: string;
  texto: string;
  /** O texto do link. */
  acao: string | null;
  /** `null` para guest — o Dicionário é rota global e o middleware o devolveria a `/projects` (PO-03). */
  href: string | null;
}

const comLinkOuNao = (comLink: boolean, href: string) => (comLink ? href : null);

/**
 * O que falta cadastrar para o filtro funcionar: expert do projeto, funis e
 * ofertas do expert, e códigos que aparecem nas campanhas e não estão no
 * Dicionário.
 */
export function sinalizacoesDoCadastro(dados: FunilOfertaDoFunil, comLink: boolean): Sinalizacao[] {
  if (!dados.expert) {
    return [
      {
        chave: "sem-expert",
        texto: "Este projeto não tem expert vinculado: funis e ofertas vêm do Dicionário do expert.",
        acao: "Vincular o expert a este projeto",
        href: comLinkOuNao(comLink, hrefDe("dicionario", "experts")),
      },
    ];
  }
  const { id: expertId, code, name } = dados.expert;
  const out: Sinalizacao[] = [];
  if (dados.opcoes.funis.length === 0) {
    out.push({
      chave: "sem-funis",
      texto: `Nenhum funil cadastrado para ${code}.`,
      acao: `Cadastrar funis do ${name}`,
      href: comLinkOuNao(comLink, hrefDe("dicionario", "funis", { expertId })),
    });
  }
  if (dados.opcoes.ofertas.length === 0) {
    out.push({
      chave: "sem-ofertas",
      texto: `Nenhuma oferta cadastrada para ${code}.`,
      acao: `Cadastrar ofertas do ${name}`,
      href: comLinkOuNao(comLink, hrefDe("dicionario", "ofertas", { expertId })),
    });
  }
  for (const n of dados.naoCadastrados) {
    const qtd = n.campanhas.length;
    out.push({
      chave: `nao-cadastrado-${n.dimensao}-${n.codigo}`,
      texto: `${n.codigo} aparece em ${qtd} campanha${qtd === 1 ? "" : "s"} e não está no Dicionário`,
      acao: "cadastrar",
      href: comLinkOuNao(comLink, hrefDe("dicionario", n.dimensao === "funil" ? "funis" : "ofertas", { expertId })),
    });
  }
  return out;
}

/**
 * A campanha sem funil/oferta identificado. Link para Campanhas › Legadas SÓ
 * se ela entra na fila (`ehCandidataALegada`): um `[FZA1]…` sem `perpetuo` não
 * aparece lá (29.79 R3) — o link mandaria a pessoa procurar o que não existe
 * (PO-08).
 */
export function sinalizacaoDaCampanhaSemDimensao(
  campanha: { campaignId: string; nome: string | null },
  comLink: boolean,
): Sinalizacao {
  if (ehCandidataALegada(campanha.nome)) {
    return {
      chave: `legada-${campanha.campaignId}`,
      texto: "Classificável na fila de Legadas.",
      acao: "Classificar em Campanhas › Legadas",
      href: comLinkOuNao(comLink, hrefDe("campanhas", "legadas")),
    };
  }
  return {
    chave: `fora-da-fila-${campanha.campaignId}`,
    texto: "Não entra na fila de Legadas (o nome não tem `perpetuo` nem a1/a2 separado) — hoje não há onde classificá-la.",
    acao: null,
    href: null,
  };
}

// ── o aviso detalhado do que ficou de fora (AC4) ─────────────────────────

export const REGRA_TUDO_SEPARADO =
  "Cada filtro conta só as compras feitas nas suas campanhas: quem comprou em dois funis aparece nos dois. " +
  "Por isso a soma dos compradores dos filtros pode passar a de \"Todos\"; a do faturamento, não.";

export const UNIDADES_DO_AVISO =
  "Vendas fora: compradores distintos e faturamento bruto, só de vendas pagas — a mesma unidade dos cards, no período inteiro.";

export interface CampanhaDoAviso {
  campaignId: string;
  nome: string;
  gasto: number;
  /** "sem funil identificado — sem código no nome", por exemplo. */
  motivo: string;
  sinalizacao: Sinalizacao;
}

export interface AvisoDoFiltro {
  vendas: { rotulo: string; compradores: number; faturamentoBruto: number }[];
  totalCompradoresFora: number;
  totalFaturamentoFora: number;
  campanhas: CampanhaDoAviso[];
  gastoSemDimensao: number;
  regra: string;
  unidades: string;
}

const rotuloDaLinha = (l: LinhaForaDoFiltro) => (l.detalhe ? `${l.motivo} — ${l.detalhe}` : l.motivo);

/**
 * Monta o aviso a partir do `foraDoFiltro` de `sales-data` (período inteiro,
 * comprador deduplicado) e do gasto das campanhas sem a dimensão pedida.
 *
 * Só entra a campanha que PODERIA ser do filtro: a de `a02` quando o filtro é
 * `a01` já tem dono, e o gasto dela não é perda do `a01` — mesma regra da API
 * para as vendas.
 */
export function montarAvisoDoFiltro(input: {
  filtro: FiltroFunilOferta;
  foraDoFiltro: LinhaForaDoFiltro[] | undefined;
  campanhas: readonly CampanhaComFunilEOferta[];
  comLink: boolean;
}): AvisoDoFiltro {
  const { filtro, foraDoFiltro, campanhas, comLink } = input;
  const vendas = (foraDoFiltro ?? []).map((l) => ({
    rotulo: rotuloDaLinha(l),
    compradores: l.compradores,
    faturamentoBruto: l.faturamentoBruto,
  }));

  const semDimensao: CampanhaDoAviso[] = [];
  for (const c of campanhas) {
    const pedidas: { dim: "funil" | "oferta"; codigo: string | null; motivo: MotivoSemDimensao | undefined }[] = [];
    if (filtro.funil !== null) pedidas.push({ dim: "funil", codigo: c.funil, motivo: c.motivoSemFunil });
    if (filtro.oferta !== null) pedidas.push({ dim: "oferta", codigo: c.oferta, motivo: c.motivoSemOferta });
    const pedido = (d: "funil" | "oferta") => (d === "funil" ? filtro.funil : filtro.oferta);
    if (pedidas.some((p) => p.codigo !== null && p.codigo !== pedido(p.dim))) continue; // é de outro funil/oferta
    const ausentes = pedidas.filter((p) => p.codigo === null);
    if (ausentes.length === 0) continue; // casa o filtro
    semDimensao.push({
      campaignId: c.campaignId,
      nome: c.nome ?? c.campaignId,
      gasto: c.gasto,
      motivo: ausentes
        .map((p) => `sem ${p.dim === "funil" ? "funil" : "oferta"} identificad${p.dim === "funil" ? "o" : "a"}${p.motivo ? ` — ${p.motivo}` : ""}`)
        .join(" · "),
      sinalizacao: sinalizacaoDaCampanhaSemDimensao(c, comLink),
    });
  }
  semDimensao.sort((a, b) => b.gasto - a.gasto);

  return {
    vendas,
    totalCompradoresFora: vendas.reduce((s, v) => s + v.compradores, 0),
    totalFaturamentoFora: vendas.reduce((s, v) => s + v.faturamentoBruto, 0),
    campanhas: semDimensao,
    gastoSemDimensao: semDimensao.reduce((s, c) => s + c.gasto, 0),
    regra: REGRA_TUDO_SEPARADO,
    unidades: UNIDADES_DO_AVISO,
  };
}

// ── os blocos que o filtro NÃO alcança (AC3) ─────────────────────────────

export const NAO_FILTRADO = {
  ascensao: "a planilha de Ascensão não tem a campanha da venda (utm_campaign)",
  comparativo: "o comparativo lê o outro funil inteiro",
  vendasDaEtapa: "esta seção lê as vendas da etapa por outra rota, que não recebe o filtro",
  planilhaSemUtm: "a planilha de vendas não tem a coluna utm_campaign — as vendas não têm como ser filtradas",
} as const;
