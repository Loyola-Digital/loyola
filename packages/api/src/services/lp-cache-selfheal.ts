/**
 * Story 29.56 — o cache de LP se cura sozinho.
 *
 * ## O problema
 *
 * A tabela "Desempenho por LP" tem uma linha "Sem link resolvido" que o gestor
 * não consegue eliminar. Medição em produção (BBE, funil `bbe-fc1-mai-26`,
 * 17/07–23/08, 196 pares anúncio×campanha e R$ 15.029,69 brutos):
 *
 * ```
 *   com link ............ 171   R$ 14.981,84   99,7%
 *   cache desatualizado .  24   R$     47,85    0,3%
 *   fora do cache .......   1   R$      0,00    0,0%
 *   sem link na Meta ....   0   R$      0,00    0,0%
 * ```
 *
 * **Nenhum anúncio caiu por falta de dado na Meta.** Os 24 são linhas gravadas
 * antes da 29.40, quando a URL não era perguntada.
 *
 * ## Por que isso não se resolvia sozinho
 *
 * O sync diário (`meta-perf-sync.ts`) só busca criativo de anúncio com gasto no
 * período que está sincronizando:
 *
 * ```ts
 *   const activeAdIds = uniqueStrings(
 *     adRows.filter((r) => parseFloat(r.spend ?? "0") > 0).map((r) => r.ad_id),
 *   );
 * ```
 *
 * Um anúncio que gastou em julho e parou nunca mais entra nessa lista. A linha
 * de cache dele fica congelada na versão do resolver da época — para sempre. É
 * por isso que os 24 são todos de cauda: morreram antes da 29.40 subir.
 *
 * ## A saída
 *
 * O endpoint `/ad-link-urls` é o único lugar do sistema que sabe QUAIS ad_ids
 * do período que alguém está olhando estão velhos — ele já os calcula, para
 * exibir no tooltip. Este módulo transforma esse conhecimento em ação.
 *
 * A alternativa considerada e descartada foi sincronizar criativo de anúncio
 * sem gasto no sync diário: resolveria pela raiz e multiplicaria o fan-out do
 * sync por todo o histórico da conta, todo dia. A cura sob demanda paga o custo
 * só pelo que alguém está olhando.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { metaAdCreativesCache } from "../db/schema.js";
import {
  fetchAdCreatives,
  LINK_URL_RESOLVER_VERSION,
  AD_PERMALINK_RESOLVER_VERSION,
  type MetaAdCreative,
} from "./meta-ads.js";
import { upsertAdCreatives } from "./meta-insights-cache.js";
import type { Database } from "../db/client.js";

/**
 * AC2 — teto por chamada.
 *
 * A regra do projeto desde o estouro de rate limit de 2026-07-16 é lote +
 * cache. Um gestor abrindo a aba com 800 anúncios velhos não pode disparar 800
 * requisições; o excedente fica para a próxima chamada, e em duas ou três
 * aberturas a fila se esvazia.
 */
export const TETO_POR_CURA = 100;

/** AC4 — uma tentativa a cada 10 minutos, por projeto. */
export const COOLDOWN_MS = 10 * 60 * 1000;

/**
 * AC3 — a fila, com `staleInCache` na frente.
 *
 * Cache velho é dado que EXISTE e está errado: o anúncio já foi sincronizado
 * alguma vez, então a chance de a Meta responder é alta — o sync corrigido
 * resolveu 99,03% do que tocou (medição da 29.43). `missingFromCache` é anúncio
 * que o sync nunca viu, e pode ser antigo demais para a Meta responder.
 *
 * Pura e exportada porque é a parte que decide o que a Meta recebe — e a única
 * que dá para provar sem rede.
 */
export function selecionarParaCura(
  staleInCache: string[],
  missingFromCache: string[],
  teto: number = TETO_POR_CURA,
): string[] {
  const vistos = new Set<string>();
  const fila: string[] = [];
  for (const id of [...staleInCache, ...missingFromCache]) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    fila.push(id);
    if (fila.length >= teto) break;
  }
  return fila;
}

/**
 * AC4 — o cooldown, em memória do processo.
 *
 * Não vai para o banco de propósito: se a API reiniciar e um refresh a mais
 * acontecer, o custo é uma chamada, não corrupção. Persistir isso exigiria uma
 * tabela e uma migration para proteger contra um dano que não existe.
 *
 * Sem ele, três abas abertas no mesmo dashboard viram três refreshes idênticos,
 * e trocar o filtro de data dispara outro.
 */
const ultimaTentativaPorProjeto = new Map<string, number>();

export function podeTentarCura(projectId: string, agoraMs: number): boolean {
  const ultima = ultimaTentativaPorProjeto.get(projectId);
  return ultima === undefined || agoraMs - ultima >= COOLDOWN_MS;
}

export function registrarTentativaDeCura(projectId: string, agoraMs: number): void {
  ultimaTentativaPorProjeto.set(projectId, agoraMs);
}

/** Só para os testes: o cooldown é global ao processo e vaza entre casos. */
export function limparCooldownDeCura(): void {
  ultimaTentativaPorProjeto.clear();
}

/**
 * AC5 — grava a AUSÊNCIA como fato medido.
 *
 * Um ad_id que a Graph API não devolveu continuaria fora do cache e seria
 * re-agendado em toda abertura da aba, para sempre. Este é o passo que impede a
 * auto-cura de virar um gerador de tráfego perpétuo contra a Meta: sem ele, o
 * cooldown de 10 minutos multiplicado por um dashboard aberto o dia todo dá 48
 * chamadas inúteis por dia, por projeto.
 *
 * A linha vai com o carimbo do resolver ATUAL e `linkUrl: null` — é o que faz o
 * anúncio migrar de "fora do cache" (causa desconhecida) para "sem link na
 * Meta" (fato medido), e sair da fila.
 *
 * ⚠️ `onConflictDoNothing`, não `DoUpdate`: se a linha já existe com um
 * `linkUrl` bom, sobrescrevê-la com `null` apagaria um dado correto porque uma
 * chamada isolada não trouxe o anúncio de volta.
 */
async function gravarAusencias(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<number> {
  if (adIds.length === 0) return 0;
  const now = new Date();
  await db
    .insert(metaAdCreativesCache)
    .values(
      adIds.map((adId) => ({
        projectId,
        adId,
        creative: {
          imageUrl: null,
          thumbnailUrl: null,
          videoId: null,
          title: null,
          body: null,
          linkUrl: null,
          ctaType: null,
          objectType: null,
          linkUrlResolver: LINK_URL_RESOLVER_VERSION,
          adPermalinkUrl: null,
          adPermalinkResolver: AD_PERMALINK_RESOLVER_VERSION,
        },
        lastSyncedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [metaAdCreativesCache.projectId, metaAdCreativesCache.adId],
    });
  return adIds.length;
}

/**
 * AC5 (segunda metade) — o mesmo carimbo para quem JÁ está no cache velho e a
 * Meta continuou não devolvendo.
 *
 * `gravarAusencias` não alcança esse caso: a linha existe, então
 * `onConflictDoNothing` a preserva — inclusive o `linkUrlResolver` antigo, que
 * a mantém eternamente em `staleInCache`. Aqui o carimbo é atualizado sem tocar
 * no resto do criativo, que continua sendo o dado bom que já estava lá.
 */
async function carimbarStaleNaoResolvido(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<number> {
  if (adIds.length === 0) return 0;
  await db
    .update(metaAdCreativesCache)
    .set({
      creative: sql`jsonb_set(${metaAdCreativesCache.creative}, '{linkUrlResolver}', ${sql.raw(
        `'${LINK_URL_RESOLVER_VERSION}'::jsonb`,
      )}, true)`,
      lastSyncedAt: new Date(),
    })
    .where(
      and(
        eq(metaAdCreativesCache.projectId, projectId),
        inArray(metaAdCreativesCache.adId, adIds),
      ),
    );
  return adIds.length;
}

export interface ParamsDaCura {
  db: Database;
  projectId: string;
  metaAccountId: string;
  accessToken: string;
  staleInCache: string[];
  missingFromCache: string[];
  /** Injetável nos testes — o resto do projeto usa o relógio de verdade. */
  agoraMs?: number;
  /** Injetável nos testes; em produção é a Graph API. */
  buscarCriativos?: typeof fetchAdCreatives;
  /**
   * Injetável nos testes. `upsertAdCreatives` baixa miniaturas do CDN da Meta
   * como efeito colateral — um teste que o chamasse de verdade dependeria de
   * rede para provar uma regra de seleção que não tem nada a ver com isso.
   */
  gravarCriativos?: typeof upsertAdCreatives;
}

export interface ResultadoDaCura {
  /** Quantos ad_ids foram enviados à Meta. Zero = cooldown ou fila vazia. */
  agendados: number;
  /** Quantos voltaram com criativo e foram gravados. */
  resolvidos: number;
  /** Quantos foram carimbados como ausência medida (AC5). */
  carimbados: number;
}

/**
 * Executa uma rodada de cura. **Não lança** — o chamador é uma rota de leitura.
 *
 * Ver `curarCacheDeLpEmSegundoPlano` para o uso correto a partir da rota.
 */
export async function curarCacheDeLp(p: ParamsDaCura): Promise<ResultadoDaCura> {
  const vazio: ResultadoDaCura = { agendados: 0, resolvidos: 0, carimbados: 0 };
  const agora = p.agoraMs ?? Date.now();

  if (!podeTentarCura(p.projectId, agora)) return vazio;

  const fila = selecionarParaCura(p.staleInCache, p.missingFromCache);
  if (fila.length === 0) return vazio;

  // Registra ANTES de chamar a Meta. Registrar depois deixaria uma janela em
  // que duas requisições simultâneas passam as duas pelo cooldown — que é
  // exatamente o cenário de "três abas abertas" que o AC4 descreve.
  registrarTentativaDeCura(p.projectId, agora);

  const buscar = p.buscarCriativos ?? fetchAdCreatives;
  let criativos: MetaAdCreative[] = [];
  try {
    criativos = await buscar(p.metaAccountId, p.accessToken, fila);
  } catch {
    // Falha de rede ou rate limit: a próxima abertura da aba tenta de novo,
    // depois do cooldown. Nada é carimbado — não sabemos se a Meta tem ou não
    // a URL, e carimbar aqui gravaria "a Meta não tem" a partir de um timeout.
    return vazio;
  }

  const gravar = p.gravarCriativos ?? upsertAdCreatives;
  const resolvidos = await gravar(p.db, p.projectId, criativos);

  // O que a Meta não devolveu. Separado em dois caminhos porque a linha existir
  // ou não muda a escrita — ver os comentários das duas funções.
  const voltaram = new Set(criativos.map((c) => c.adId));
  const naoVoltaram = fila.filter((id) => !voltaram.has(id));
  const staleSet = new Set(p.staleInCache);
  const carimbados =
    (await gravarAusencias(
      p.db,
      p.projectId,
      naoVoltaram.filter((id) => !staleSet.has(id)),
    )) +
    (await carimbarStaleNaoResolvido(
      p.db,
      p.projectId,
      naoVoltaram.filter((id) => staleSet.has(id)),
    ));

  return { agendados: fila.length, resolvidos, carimbados };
}

/**
 * AC1 — dispara a cura sem prender a resposta.
 *
 * ⚠️ O `.catch` não é decoração. Uma promise rejeitada e não tratada derruba o
 * processo em Node — e este é o mesmo processo que atende o dashboard inteiro.
 * `curarCacheDeLp` já engole os erros dela, mas o `catch` aqui protege contra
 * quem mexer nela depois.
 */
export function curarCacheDeLpEmSegundoPlano(
  p: ParamsDaCura,
  aoFalhar: (erro: unknown) => void,
): void {
  void curarCacheDeLp(p).catch(aoFalhar);
}
