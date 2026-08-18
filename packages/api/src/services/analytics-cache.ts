/**
 * Cache do dashboard de analytics por etapa, compartilhado entre as fontes.
 *
 * Mora fora das rotas porque duas coisas o invalidam: trocar a conexão GA4 e
 * trocar o site do Plausible. Quando cada rota tinha o seu, mudar a fonte do
 * projeto deixava a tela servindo o número da fonte antiga por até 10 minutos —
 * exatamente no momento em que alguém está conferindo se a troca funcionou.
 */

import { LRUCache } from "lru-cache";

const TTL_MS = 10 * 60 * 1000;

const cache = new LRUCache<string, object>({ max: 500, ttl: TTL_MS });

/** A chave carrega o projeto no começo — é o que permite invalidar por projeto. */
export function chaveEtapa(projectId: string, stageId: string, days: number): string {
  return `${projectId}:${stageId}:${days}`;
}

export function lerCacheAnalytics(chave: string): object | undefined {
  return cache.get(chave);
}

export function gravarCacheAnalytics(chave: string, valor: object): void {
  cache.set(chave, valor);
}

/** Descarta tudo do projeto — usado ao mudar property GA4 ou site Plausible. */
export function invalidarAnalyticsDoProjeto(projectId: string): void {
  for (const chave of cache.keys()) {
    if (chave.startsWith(`${projectId}:`)) cache.delete(chave);
  }
}
