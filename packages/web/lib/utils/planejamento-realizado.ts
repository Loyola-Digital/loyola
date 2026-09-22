// Story 48.11 — a camada B da base de referência: o que o lançamento anterior
// de fato ENTREGOU, ao lado do que ele havia PLANEJADO (camada A, Story 48.9).
//
// O rótulo passa a carregar as duas leituras:
//
//     Investimento em Anúncios (base: R$ 100.000,00 · real: R$ 126.373,06)
//
// `base:` é o simulador salvo daquele lançamento; `real:` é o medido. Ver os
// dois lado a lado responde "o meu chute da última vez ficou perto?" — que é a
// pergunta de quem está preenchendo o simulador do próximo.
//
// Como na camada A, **nada é preenchido nem salvo**: referência é leitura.
//
// ## O que tem fonte e o que não tem
//
// Levantado em produção em 2026-09-22. Onde não há fonte, a função devolve
// `null` e a tela declara a ausência — nunca zero, que seria indistinguível de
// uma medição de valor zero:
//
//   ✅ investimento Meta, % quente, ticket médio, conversão dos 5 canais
//      orgânicos nomeados, conversão das fontes pagas por temperatura
//   ❌ Área de Membros (não existe balde em `classifyCanal`), insights do
//      Google (não existe tabela; nenhum lançamento usou), custos variáveis
//      realizados, bases de audiência

import { textoDeReferencia } from "@/lib/utils/planejamento-referencia";
import type { CampoDosInputs } from "@/lib/utils/planejamento-inputs-form";
import type { CanalOrganico, FontePaga } from "@loyola-x/shared/src/planejamento-cenarios";

/** Uma linha de `analiseDeOrigem` — `taxa` vem em PONTOS percentuais (0–100). */
export interface LinhaDeOrigemLida {
  nome: string;
  leads: number;
  compradores: number;
  taxa: number | null;
}

/** O que `GET …/planejamento/realizado` devolve. */
export interface RealizadoDaApi {
  funnelId: string;
  investimentoMeta: {
    total: number;
    quente: number;
    frio: number;
    indefinido: number;
    pctQuente: number | null;
    campanhasVinculadas: number;
    campanhasComSpend: number;
    janela: { de: string | null; ate: string | null };
  };
  etapas: { id: string; nome: string; stageType: string }[];
  google: { temFonte: boolean; campanhasVinculadas?: number; motivo: string };
}

/** Uma etapa candidata a "etapa de vendas da base". */
export interface EtapaDaBase {
  id: string;
  nome: string;
  stageType: string;
}

/**
 * As etapas de venda da base.
 *
 * Existe porque, dos 11 lançamentos reais, **5 não têm nenhuma** e **3 têm
 * duas** (Vendas + Downsell). Somar as duas rebaixaria o ticket médio sem o
 * gestor saber; escolher sozinho erraria em três lançamentos.
 */
export function etapasDeVendas(etapas: readonly EtapaDaBase[] | undefined): EtapaDaBase[] {
  return (etapas ?? []).filter((e) => e.stageType === "sales");
}

/**
 * A etapa pré-selecionada: a que **não** é downsell. Empate ou ausência de
 * pista → a primeira. A tela mostra qual escolheu e deixa trocar (AC7).
 */
export function etapaDeVendasPadrao(etapas: readonly EtapaDaBase[] | undefined): EtapaDaBase | null {
  const vendas = etapasDeVendas(etapas);
  if (vendas.length === 0) return null;
  return vendas.find((e) => !/down\s*sell/i.test(e.nome)) ?? vendas[0];
}

/**
 * `classifyCanal` → canal do simulador.
 *
 * "Área de Membros" **não está aqui de propósito**: `classifyCanal` não tem
 * esse balde e joga esses leads em "Outros". Mapeá-lo para "Outros" faria a
 * tela exibir como medição o que é um agregado de tudo que não foi reconhecido.
 */
export const CANAL_DO_ROTULO: Readonly<Record<string, CanalOrganico>> = {
  WhatsApp: "whatsapp",
  "E-mail": "email",
  Instagram: "instagram",
  ManyChat: "manychat",
  YouTube: "youtube",
};

/** `"Meta Ads · quente"` → `meta_quente`. */
export const FONTE_DO_ROTULO: Readonly<Record<string, FontePaga>> = {
  "Meta Ads · quente": "meta_quente",
  "Meta Ads · frio": "meta_frio",
  "Google Ads · quente": "google_quente",
  "Google Ads · frio": "google_frio",
};

/**
 * Pontos percentuais (0–100, como vêm de `buyers-origin`) → fração (0–1, como o
 * simulador guarda). 4,12 tem de virar 0,0412 e aparecer como "4,12%".
 */
export function fracaoDaTaxa(taxa: number | null | undefined): number | null {
  if (taxa === null || taxa === undefined || !Number.isFinite(taxa)) return null;
  return taxa / 100;
}

export type ConversaoOrganica = Partial<Record<CanalOrganico, number | null>>;
export type ConversaoPaga = Partial<Record<FontePaga, number | null>>;

/** Conversão lead→venda realizada de cada canal orgânico, em fração. */
export function conversaoPorCanal(linhas: readonly LinhaDeOrigemLida[] | undefined): ConversaoOrganica {
  const out: ConversaoOrganica = {};
  for (const l of linhas ?? []) {
    const canal = CANAL_DO_ROTULO[l.nome];
    if (canal) out[canal] = fracaoDaTaxa(l.taxa);
  }
  return out;
}

/** Conversão lead→venda realizada de cada fonte paga (plataforma × público), em fração. */
export function conversaoPorFontePaga(linhas: readonly LinhaDeOrigemLida[] | undefined): ConversaoPaga {
  const out: ConversaoPaga = {};
  for (const l of linhas ?? []) {
    const fonte = FONTE_DO_ROTULO[l.nome];
    if (fonte) out[fonte] = fracaoDaTaxa(l.taxa);
  }
  return out;
}

/**
 * Quanto dos leads orgânicos ficou FORA dos cinco canais nomeados (Closer,
 * Outros, Sem Track).
 *
 * A tela declara esse número: um balde "Orgânico" que esconde metade da base
 * já custou uma investigação inteira (Stories 18.77/29.68), e a conversão de
 * um canal só vale como parâmetro se dá para ver o tamanho do que sobrou fora.
 */
export function foraDoMapeamento(linhas: readonly LinhaDeOrigemLida[] | undefined): {
  leads: number;
  total: number;
  fracao: number | null;
} {
  let fora = 0;
  let total = 0;
  for (const l of linhas ?? []) {
    total += l.leads;
    if (!CANAL_DO_ROTULO[l.nome]) fora += l.leads;
  }
  return { leads: fora, total, fracao: total > 0 ? fora / total : null };
}

/** Tudo o que a camada B sabe sobre a base escolhida. */
export interface RealizadoDaBase {
  /**
   * `false` quando a rota do realizado não respondeu (API ainda sem ela, erro
   * de rede). É o que separa "não deu para ler" de "não existe" — sem esta
   * distinção a tela diria "esse lançamento não tem etapa de vendas" para uma
   * base que tem, e a falha apareceria como ausência.
   */
  temResposta: boolean;
  investimentoMeta: RealizadoDaApi["investimentoMeta"] | null;
  /** `false` quando o 0 % do Google é declarado, não medido. */
  googleTemFonte: boolean;
  /** Campanhas do Google vinculadas ao lançamento: >0 invalida o "100 % Meta". */
  googleCampanhasVinculadas: number;
  googleMotivo: string | null;
  ticketMedio: number | null;
  conversaoOrganica: ConversaoOrganica;
  conversaoPaga: ConversaoPaga;
  etapaDeVendas: EtapaDaBase | null;
  etapasDeVendasDisponiveis: EtapaDaBase[];
  foraDoMapeamento: { leads: number; total: number; fracao: number | null };
}

/**
 * Junta as três leituras. Qualquer uma ausente (API antiga, etapa inexistente,
 * planilha não conectada) apenas deixa aquele pedaço `null` — a camada A segue
 * inteira (AC9).
 */
export function montarRealizado(args: {
  api: RealizadoDaApi | null | undefined;
  etapaEscolhida: EtapaDaBase | null;
  ticketMedioBruto: number | null | undefined;
  fontesOrganicas: readonly LinhaDeOrigemLida[] | undefined;
  fontesPagasPorTemperatura: readonly LinhaDeOrigemLida[] | undefined;
}): RealizadoDaBase {
  return {
    temResposta: !!args.api,
    investimentoMeta: args.api?.investimentoMeta ?? null,
    googleTemFonte: args.api?.google?.temFonte ?? false,
    // Ausente no payload (API anterior à contagem) → 0, que é o estado medido
    // hoje nos 11 lançamentos.
    googleCampanhasVinculadas: args.api?.google?.campanhasVinculadas ?? 0,
    googleMotivo: args.api?.google?.motivo ?? null,
    // Ticket médio zero não é medição de ticket: é planilha sem venda.
    ticketMedio: args.ticketMedioBruto && Number.isFinite(args.ticketMedioBruto) ? args.ticketMedioBruto : null,
    conversaoOrganica: conversaoPorCanal(args.fontesOrganicas),
    conversaoPaga: conversaoPorFontePaga(args.fontesPagasPorTemperatura),
    etapaDeVendas: args.etapaEscolhida,
    etapasDeVendasDisponiveis: etapasDeVendas(args.api?.etapas),
    foraDoMapeamento: foraDoMapeamento(args.fontesOrganicas),
  };
}

/**
 * O valor REALIZADO de um campo da aba 1.
 *
 * Só quatro dos 26 campos têm fonte medida. `pctInvestMeta` devolve 1 (100 %)
 * quando a API declara que não há fonte de Google — e a tela põe o motivo ao
 * lado, porque um "100 %" sem justificativa é indistinguível de dado faltando.
 */
export function realizadoDoInput(real: RealizadoDaBase | null, campo: CampoDosInputs): string | null {
  if (!real) return null;
  const inv = real.investimentoMeta;
  switch (campo) {
    case "investimentoAnuncios":
      return inv && inv.campanhasComSpend > 0 ? textoDeReferencia(inv.total, "moeda") : null;
    case "pctInvestMeta":
      // 100 % Meta: verdadeiro por AUSÊNCIA de Google, não por medição — e só
      // enquanto nenhuma campanha do Google estiver vinculada. Com uma que
      // seja, a divisão deixa de ser conhecida e o campo fica sem `real:`.
      return inv && inv.campanhasComSpend > 0 && !real.googleTemFonte && real.googleCampanhasVinculadas === 0
        ? textoDeReferencia(1, "pct")
        : null;
    case "pctMetaQuente":
      return textoDeReferencia(inv?.pctQuente ?? null, "pct");
    case "ticketMedio":
      return textoDeReferencia(real.ticketMedio, "moeda");
    default:
      // Os demais 22 campos não têm medição — inclusive `pctGoogleQuente`.
      return null;
  }
}

/** O valor REALIZADO da "Conversão média em vendas" de um canal orgânico. */
export function realizadoDaConversaoOrganica(real: RealizadoDaBase | null, canal: CanalOrganico): string | null {
  if (!real) return null;
  return textoDeReferencia(real.conversaoOrganica[canal] ?? null, "pct");
}

/** O valor REALIZADO da "Conversão média em vendas" de uma fonte paga. */
export function realizadoDaConversaoPaga(real: RealizadoDaBase | null, fonte: FontePaga): string | null {
  if (!real) return null;
  return textoDeReferencia(real.conversaoPaga[fonte] ?? null, "pct");
}
