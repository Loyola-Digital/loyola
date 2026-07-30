/**
 * Story 41.2 — funções puras do pipeline §2 do Resumão.
 *
 * Normalização de nome (§2.1), classificação de fase (§2.2), origem (§2.6),
 * público quente/frio (§2.7) e extração de ad name do `utm_term`.
 *
 * Sem I/O: tudo aqui é entrada → saída, testável isoladamente. O motor
 * (`launch-report-engine.ts`) depende destas funções, não o contrário.
 *
 * Origem e temperatura **reusam** `utils/lead-origin.ts` — duas implementações
 * do mesmo classificador seriam duas verdades, e os números de vendas do
 * dashboard já saem de lá.
 */

import {
  classifyOrigem as classifyOrigemBase,
  classifyTemperatura,
  type Origem,
} from "../utils/lead-origin.js";

// ---------------------------------------------------------------------------
// §2.1 — Normalização de nome
// ---------------------------------------------------------------------------

/**
 * Em-dash (U+2014) usado no lugar do separador `--` da convenção de nomes.
 *
 * Verificado no dado de produção em 2026-07-30: 66 das 162 campanhas
 * vinculadas a etapas usam `—`, e ele aparece em **posições diferentes** —
 * antes do hot/cold (`...2026-04-17—cold--cbo--videos`) e antes do próprio
 * prefixo de fase (`dg-pg02-abr-26—vendas-downsell-2026-06-03—hot...`).
 * Nenhum outro caractere não-ASCII aparece nos nomes.
 *
 * Consequência: normalizar é pré-requisito de **qualquer** match por segmento,
 * não só do match de prefixo. Sem isso, ~46 campanhas de um lançamento real
 * não bateram com nenhum prefixo (caso documentado na spec §2.1).
 */
const EM_DASH = /—/g;

/** `nome.replace(/—/g, "--").toLowerCase()` — §2.1, aplicado antes de todo match. */
export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? "").replace(EM_DASH, "--").toLowerCase();
}

// ---------------------------------------------------------------------------
// §2.2 — Classificação de fase da campanha
// ---------------------------------------------------------------------------

/**
 * Os 5 prefixos de fase da convenção Loyola.
 *
 * Confirmados por varredura de `funnel_stages.campaigns` em produção
 * (2026-07-30): `vendas-captacao` 100×, `leads-captacao` 5×, `leads-downsell`
 * 5×, `vendas-downsell` 4×, `vendas-principal` 3×.
 *
 * ⚠️ Ordem importa: os mais específicos primeiro. `leads-downsell` tem de ser
 * testado antes de `leads-captacao` para que um nome contendo os dois caia no
 * mais restritivo, e o mesmo vale para o par de `vendas-`.
 */
export const FASES_CAMPANHA = [
  "leads-downsell",
  "leads-captacao",
  "vendas-downsell",
  "vendas-captacao",
  "vendas-principal",
] as const;

export type FaseCampanha = (typeof FASES_CAMPANHA)[number];

/** Fase não reconhecida. Nunca descartada em silêncio — vai para `pendencias[]`. */
export const FASE_NAO_PADRAO = "NAO_PADRAO" as const;

export type FaseClassificada = FaseCampanha | typeof FASE_NAO_PADRAO;

/**
 * Classifica a fase por **substring em qualquer posição** do nome normalizado
 * (§2.2) — não por prefixo literal, porque o nome real começa com o código do
 * lançamento (`dg-pg02-abr-26--vendas-captacao--...`).
 *
 * Recebe o nome cru e normaliza internamente: assim não existe caminho em que
 * alguém esqueça de normalizar antes de chamar.
 */
export function classificarFase(nomeCampanha: string | null | undefined): FaseClassificada {
  const n = normalizarNome(nomeCampanha);
  if (!n) return FASE_NAO_PADRAO;
  for (const fase of FASES_CAMPANHA) {
    if (n.includes(fase)) return fase;
  }
  return FASE_NAO_PADRAO;
}

// ---------------------------------------------------------------------------
// §2.6 — Origem (Pago / Orgânico / Sem Track)
// ---------------------------------------------------------------------------

/** Reexporta o classificador canônico — ver `utils/lead-origin.ts`. */
export const classificarOrigem = classifyOrigemBase;
export type { Origem };

// ---------------------------------------------------------------------------
// §2.7 — Público quente / frio
// ---------------------------------------------------------------------------

/**
 * Rótulos do público na saída do motor. Diferem do `Temperatura` de
 * `lead-origin.ts` (lowercase) porque a spec §3 e o render §4 usam Capitalizado.
 */
export type Publico = "Quente" | "Frio" | "Indefinido";

const PUBLICO_POR_TEMPERATURA: Record<ReturnType<typeof classifyTemperatura>, Publico> = {
  quente: "Quente",
  frio: "Frio",
  indefinido: "Indefinido",
};

/**
 * Classifica público a partir de qualquer string que carregue hot/cold —
 * nome de campanha normalizado (§2.2) ou `utm_term` de venda (§2.7).
 *
 * A busca é por substring em **qualquer posição**: o `utm_term` real chega como
 * `Instagram_Feed_<campaign_name>|<adset_name>|<ad_name>`, com o hot/cold no
 * meio da string.
 *
 * Delega em `classifyTemperatura` para não divergir dos números de vendas.
 */
export function classificarPublico(texto: string | null | undefined): Publico {
  return PUBLICO_POR_TEMPERATURA[classifyTemperatura(normalizarNome(texto))];
}

// ---------------------------------------------------------------------------
// Ad name a partir do utm_term
// ---------------------------------------------------------------------------

/**
 * Último segmento do `utm_term` quando ele tem ao menos 3 partes separadas por
 * `|` — o formato é `<prefixo>_<campaign_name>|<adset_name>|<ad_name>`.
 *
 * Devolve `null` quando o formato não bate: melhor ausência explícita do que um
 * nome inventado a partir de um `utm_term` de outro formato. Quem chama trata o
 * `null` como "ad name não resolvido" e alimenta o alerta W6 (41.3).
 *
 * ⚠️ Preserva o texto **original** (não normalizado) do segmento: o ad name é
 * exibido no relatório e cruzado com o cache de nomes da Meta, que guarda o
 * nome como a Meta devolve.
 */
export function adNameDoTerm(utmTerm: string | null | undefined): string | null {
  const bruto = (utmTerm ?? "").trim();
  if (!bruto) return null;
  const partes = bruto.split("|");
  if (partes.length < 3) return null;
  const ultimo = partes[partes.length - 1]?.trim();
  return ultimo ? ultimo : null;
}
