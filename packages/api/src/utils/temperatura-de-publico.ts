// ============================================================
// Story 29.62 — a temperatura (quente/frio) de cada entidade da Meta.
//
// ## Por que não dá para reusar `classifyTemperatura` direto
//
// `classifyTemperatura` (`lead-origin.ts:72`) lê o `utm_term` da VENDA. É o que
// a tabela por público usa, e está certo lá. Mas o Detalhamento é de entidades
// da Meta — campanha, conjunto, anúncio — e ali não existe `utm_term`. O
// reconhecimento de `hot|quente` / `cold|frio` é o mesmo; o que muda é o texto
// em que ele é aplicado.
//
// ## De qual nome, e por quê a cascata
//
// Medido em produção (2026-08-25), sobre `meta_entity_names_cache`:
//
// ```
//    campanha    1.524 entidades →  68,2% trazem a temperatura no nome
//    conjunto    3.305           →  16,9%
//    anúncio    16.093           →   0,0%   ← nenhum
// ```
//
// Nenhum anúncio traz a temperatura no próprio nome. Filtrar a dimensão
// Anúncio pelo nome do anúncio devolveria a tabela vazia — daí a cascata.
//
// Nos 2.231 anúncios COM entrega (`meta_ad_insights_daily`):
//
// ```
//    pelo nome do anúncio ......      0   (0,0%)
//    pelo nome do conjunto .....     23   (1,0%)
//    pelo nome da campanha .....  2.225  (99,7%)
//    ── cascata ad → conjunto → campanha ...  2.225  (99,7%)
//
//    conjunto e campanha DISCORDAM em ....... 0 anúncios
// ```
//
// A cascata é segura porque os níveis nunca se contradizem. A ordem (mais
// específico primeiro) importa para o dia em que passarem a se contradizer: o
// nome mais próximo da entidade é o que descreve melhor o que ela é.
// ============================================================

/** Quente, frio, ou não dá para saber pelo nome. */
export type TemperaturaDePublico = "quente" | "frio";

/** De qual nível da hierarquia a temperatura veio (AC5). */
export type NivelDaTemperatura = "anuncio" | "conjunto" | "campanha";

export interface ClassificacaoDeEntidade {
  temperatura: TemperaturaDePublico;
  /** O nível que decidiu — a tela declara isto para o gestor. */
  nivel: NivelDaTemperatura;
}

/**
 * A regra de reconhecimento, idêntica à de `classifyTemperatura`.
 *
 * Duplicada de propósito? Não: aquela recebe `utmTerm` e vive num módulo de
 * origem de LEAD; esta recebe um nome de entidade. Mantê-las com o mesmo corpo
 * é o que faz as duas telas concordarem — se a convenção mudar, as duas mudam
 * juntas, e um teste aqui trava a equivalência.
 */
export function temperaturaDoNome(nome: string | null | undefined): TemperaturaDePublico | null {
  const n = (nome ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("hot") || n.includes("quente")) return "quente";
  if (n.includes("cold") || n.includes("frio")) return "frio";
  return null;
}

/** Uma linha de insight, com a hierarquia que `meta_ad_insights_daily` já traz. */
export interface LinhaComHierarquia {
  adId: string;
  adName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
}

/**
 * Classifica UMA entidade pela cascata: o próprio nome, depois o do conjunto,
 * depois o da campanha.
 */
export function classificarPelaCascata(
  linha: LinhaComHierarquia,
): ClassificacaoDeEntidade | null {
  const doAnuncio = temperaturaDoNome(linha.adName);
  if (doAnuncio) return { temperatura: doAnuncio, nivel: "anuncio" };
  const doConjunto = temperaturaDoNome(linha.adsetName);
  if (doConjunto) return { temperatura: doConjunto, nivel: "conjunto" };
  const daCampanha = temperaturaDoNome(linha.campaignName);
  if (daCampanha) return { temperatura: daCampanha, nivel: "campanha" };
  return null;
}

export interface MapasDeTemperatura {
  /** `campaignId` → classificação. */
  campaign: Record<string, ClassificacaoDeEntidade>;
  /** `adsetId` → classificação. */
  adset: Record<string, ClassificacaoDeEntidade>;
  /** `adId` → classificação. */
  ad: Record<string, ClassificacaoDeEntidade>;
}

/**
 * Monta os três mapas a partir das linhas de insight.
 *
 * Campanha e conjunto são classificados pelo PRÓPRIO nome — a cascata só existe
 * para descer, nunca para subir. Uma campanha sem `cold`/`hot` no nome não vira
 * fria porque um de seus conjuntos é: o conjunto é parte dela, não o contrário.
 */
export function montarMapasDeTemperatura(linhas: LinhaComHierarquia[]): MapasDeTemperatura {
  const out: MapasDeTemperatura = { campaign: {}, adset: {}, ad: {} };

  for (const l of linhas) {
    if (l.campaignId) {
      const t = temperaturaDoNome(l.campaignName);
      if (t) out.campaign[l.campaignId] = { temperatura: t, nivel: "campanha" };
    }
    if (l.adsetId) {
      // O conjunto herda da campanha quando o próprio nome não diz — é o mesmo
      // motivo do anúncio: 16,9% dos conjuntos trazem a temperatura.
      const propria = temperaturaDoNome(l.adsetName);
      if (propria) out.adset[l.adsetId] = { temperatura: propria, nivel: "conjunto" };
      else {
        const daCampanha = temperaturaDoNome(l.campaignName);
        if (daCampanha) out.adset[l.adsetId] = { temperatura: daCampanha, nivel: "campanha" };
      }
    }
    if (l.adId) {
      const c = classificarPelaCascata(l);
      if (c) out.ad[l.adId] = c;
    }
  }

  return out;
}
