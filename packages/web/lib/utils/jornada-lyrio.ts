/**
 * Story 42.11 — o que a tabela "Jornada por canal" da etapa Lyrio decide, na
 * forma pura (o vitest do web só coleta `lib/utils/**`; o `.tsx` só desenha).
 *
 *  - o estado do bloco: carregando · OCULTO (a API ainda não tem a rota — 404
 *    "Not Found", o banner de versão explica) · ERRO (qualquer outra falha —
 *    nunca tabela vazia nem zeros, AC6) · pronto;
 *  - as taxas contra Novos (AC1), com denominador 0 = "—";
 *  - as três declarações do AC4, com a data do primeiro evento de assinatura
 *    vinda da API (não fixa aqui).
 */

import { ehApiAtras } from "./mensagem-de-api-atras";

export type CanalDaJornada = "campanha" | "google_gclid" | "meta_fbclid" | "meta_install" | "organico" | "sem_ios" | "sem_android";

export interface ContagemDaJornada {
  novos: number;
  viuPaywall: number;
  interagiu: number;
  iniciou: number;
  iniciouTeste: number;
  pagou: number;
  receitaUsd: number;
}

/** Espelha a resposta de `GET …/revenuecat/jornada` (`routes/revenuecat.ts`). Só contagens — nenhum id de usuário. */
export interface JornadaDoLyrio {
  days: number;
  /** Início da janela (`AAAA-MM-DD`, UTC). */
  desde: string;
  /** Primeiro evento de ASSINATURA da etapa (`AAAA-MM-DD`); `null` se ainda não houve. */
  assinaturaDesde: string | null;
  linhas: (ContagemDaJornada & { canal: CanalDaJornada; rotulo: string })[];
  total: ContagemDaJornada;
}

export type EstadoDoBloco = { tipo: "carregando" } | { tipo: "oculto" } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; dados: JornadaDoLyrio };

/**
 * AC6 (PO-07): 404 DA ROTA (a API anterior à 42.11 não a tem) → o bloco some e
 * o banner de versão declara a defasagem; um 404 de DOMÍNIO ("Etapa não
 * encontrada") e qualquer outra falha → erro no bloco. Nunca "sem dados".
 */
export function estadoDoBlocoDaJornada(q: { isLoading: boolean; error: unknown; data: JornadaDoLyrio | undefined }): EstadoDoBloco {
  if (q.error) {
    const e = q.error as { status?: number; message?: string } | null;
    const lido = { status: e?.status ?? 0, mensagem: e?.message ?? "" };
    if (lido.status === 404 && ehApiAtras(lido)) return { tipo: "oculto" };
    return { tipo: "erro", mensagem: lido.mensagem || "Erro desconhecido" };
  }
  if (q.isLoading || !q.data) return { tipo: "carregando" };
  return { tipo: "pronto", dados: q.data };
}

/** `retry` do hook: um 404 não vira outra coisa entre tentativas (padrão de `use-perpetual-sales-data`). */
export function tentarDeNovoAJornada(falhas: number, erro: unknown): boolean {
  if ((erro as { status?: number } | null)?.status === 404) return false;
  return falhas < 2;
}

/** AC1: taxa contra Novos; denominador 0 = `null` ("—"). */
export function taxaDaJornada(parte: number, novos: number): number | null {
  return novos > 0 ? parte / novos : null;
}

export function formatarTaxa(t: number | null): string {
  if (t === null) return "—";
  return `${(t * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * AC4 — o que a tabela declara, numa linha acima dela: (a) desde quando há
 * evento de assinatura (a jornada de uma janela que começa antes é
 * incompleta); (b) os últimos 7 dias sempre baixos em "Pagou" (o teste dura 7
 * dias); (c) campanha individual não é identificável hoje. A referência interna
 * da (c) — item 3.1 das decisões de 23/09 — não aparece na tela (PO-05).
 */
export function declaracoesDaJornada(j: Pick<JornadaDoLyrio, "assinaturaDesde" | "desde">): string[] {
  const a = j.assinaturaDesde
    ? `Eventos de assinatura só existem desde ${dataBr(j.assinaturaDesde)}${j.desde < j.assinaturaDesde ? " — esta janela começa antes disso, então a jornada está incompleta" : " — janela que começa antes disso mostra a jornada incompleta"}.`
    : "Ainda não há eventos de assinatura nesta etapa — a jornada vai só até o paywall.";
  return [
    a,
    "Os últimos 7 dias sempre aparecem baixos em “Pagou”: o teste grátis dura 7 dias.",
    "Campanha individual ainda não é identificável — aguarda correção de configuração no app.",
  ];
}
