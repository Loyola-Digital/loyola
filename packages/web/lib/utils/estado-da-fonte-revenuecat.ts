/**
 * Story 42.14 (PO-D4) — o estado de cada fonte da etapa Lyrio que vem do
 * RevenueCat ou das rotas novas desta story, no formato de
 * `estadoDasVendasPorCanal` (42.12):
 *
 *   carregando · OCULTO (404 da rota: API anterior — o banner de versão explica)
 *   · ERRO (com a causa) · pronto
 *
 * ## Por que a causa tem estado próprio
 *
 * O domínio Charts & Metrics do RevenueCat tem limite de 25 requisições por
 * minuto por projeto, compartilhado entre overview, receita e charts (o estouro
 * devolve 429). Antes, a rota do overview trocava qualquer falha pela mesma frase
 * sobre permissão — um 429 aparecia na tela como "falta permissão", e o gestor
 * ia mexer na chave que estava certa. Aqui 429 (limite), 403 (permissão) e o
 * resto são causas diferentes, cada uma com a sua orientação.
 *
 * ## O que nunca acontece
 *
 * Erro virar ausência ou zero. Um card em erro mostra "—" e o memorial diz o
 * porquê (`memorialDoErroDaFonte`); quem depende dele (ROAS, Margem, Conversões)
 * também fica "—", sem cair para outra janela (AC2d).
 */

import type { MetricFormula } from "@/lib/types/metric-formula";
import { ehApiAtras } from "./mensagem-de-api-atras";

export type CausaDoErro = "limite" | "permissao" | "outro";

export type EstadoDaFonte<T> =
  | { tipo: "carregando" }
  | { tipo: "oculto" }
  | { tipo: "erro"; causa: CausaDoErro; mensagem: string }
  | { tipo: "pronto"; dados: T };

interface ErroDaApi {
  status?: number;
  message?: string;
  body?: { error?: unknown; details?: unknown; causa?: unknown } | null;
}

/**
 * A causa de uma falha. A API desta story manda `causa` no corpo; sem ele (rota
 * antiga, ou falha antes da rota) vale o status HTTP e, por último, o status do
 * RevenueCat que o `rcFetch` escreve na mensagem (`RevenueCat 429: …`).
 */
export function causaDoErro(erro: unknown): CausaDoErro {
  const e = (erro ?? {}) as ErroDaApi;
  const declarada = e.body?.causa;
  if (declarada === "limite" || declarada === "permissao" || declarada === "outro") return declarada;
  if (e.status === 429) return "limite";
  const texto = `${e.message ?? ""} ${typeof e.body?.details === "string" ? e.body.details : ""}`;
  if (/RevenueCat 429\b/.test(texto)) return "limite";
  if (e.status === 403 || /RevenueCat 403\b/.test(texto)) return "permissao";
  return "outro";
}

/** A mensagem da API: `error` e, quando vier, o `details` (o status e o corpo do RevenueCat). */
export function mensagemDoErroDaFonte(erro: unknown): string {
  const e = (erro ?? {}) as ErroDaApi;
  const principal = (typeof e.body?.error === "string" && e.body.error) || e.message || "Erro desconhecido";
  const detalhe = typeof e.body?.details === "string" ? e.body.details.trim() : "";
  return detalhe && !principal.includes(detalhe) ? `${principal}: ${detalhe}` : principal;
}

/**
 * O estado de uma consulta. A falha é testada ANTES da ausência (a lição do
 * `RevenuecatOverviewPanel`): uma requisição que falhou também chega sem `data`.
 */
export function estadoDaFonte<T>(q: { isLoading: boolean; error: unknown; data: T | undefined }): EstadoDaFonte<T> {
  if (q.error) {
    const e = q.error as ErroDaApi;
    if (e.status === 404 && ehApiAtras({ status: 404, mensagem: e.message ?? "" })) return { tipo: "oculto" };
    return { tipo: "erro", causa: causaDoErro(q.error), mensagem: mensagemDoErroDaFonte(q.error) };
  }
  if (q.isLoading || q.data === undefined) return { tipo: "carregando" };
  return { tipo: "pronto", dados: q.data };
}

/**
 * Story 42.14 (QA TEST-001, AC10b) — a resposta só vale para a janela que ela
 * ECOA. Pronta com `days` diferente do pedido (ex.: a tela pediu a janela errada)
 * vira ERRO com a explicação — nunca um número de outra janela com a etiqueta
 * do filtro. O mesmo que `daJanela` faz nos pagantes.
 */
export function naJanelaPedida<T extends { days?: number | null }>(estado: EstadoDaFonte<T>, dias: number): EstadoDaFonte<T> {
  if (estado.tipo !== "pronto" || estado.dados.days === dias) return estado;
  return {
    tipo: "erro",
    causa: "outro",
    mensagem: `a resposta veio para ${estado.dados.days ?? "uma janela não informada"} dias, não para os ${dias} do filtro`,
  };
}

/** A orientação de cada causa, para o memorial do card e o aviso do bloco. */
export const ORIENTACAO_DA_CAUSA: Record<CausaDoErro, string> = {
  limite: "Limite de 25 consultas por minuto do RevenueCat (compartilhado entre overview, receita e gráficos); tente de novo em 1 minuto.",
  permissao: "A Secret API Key do RevenueCat não tem a permissão de leitura de métricas (charts_metrics:overview:read). Verifique no painel do RevenueCat.",
  outro: "A chamada falhou. Se persistir, o deploy da API pode estar defasado.",
};

/**
 * PO-D4 (6) — o `retry` das consultas ao RevenueCat: não insiste em 429 (gasta o
 * limite compartilhado e não muda a resposta dentro do minuto) nem em 404 (a rota
 * não passa a existir entre uma tentativa e outra). O resto segue o padrão (2).
 */
export function tentarDeNovoNoRevenuecat(falhas: number, erro: unknown): boolean {
  const status = (erro as { status?: number } | null)?.status;
  if (status === 404 || status === 429) return false;
  if (causaDoErro(erro) === "limite") return false;
  return falhas < 2;
}

/**
 * PO-D4 (3) — o memorial de um card que mostra "—" por erro da fonte: diz a
 * causa, a orientação e, quando houver, quem mais fica "—" por depender dele.
 * `null` quando o estado não é de erro.
 */
export function memorialDoErroDaFonte(
  estado: EstadoDaFonte<unknown>,
  o: { fonte: string; periodo: string; dependentes?: string },
): MetricFormula | null {
  if (estado.tipo !== "erro") return null;
  return {
    expression: estado.causa === "limite" ? "RevenueCat: limite de consultas" : estado.causa === "permissao" ? "RevenueCat: sem permissão" : "Fonte indisponível",
    values: [{ label: "Erro", value: estado.mensagem, source: o.fonte }],
    result: "—",
    period: o.periodo,
    note: `${ORIENTACAO_DA_CAUSA[estado.causa]}${o.dependentes ? ` Enquanto isso, ${o.dependentes} também fica "—": sem este número, a conta não fecha.` : ""}`,
  };
}

/** O aviso `role="alert"` do bloco (PO-D4 (3)); `null` quando o estado não é de erro. */
export function avisoDoErroDaFonte(estado: EstadoDaFonte<unknown>, oQue: string): string | null {
  if (estado.tipo !== "erro") return null;
  return `Não foi possível carregar ${oQue}: ${estado.mensagem}. ${ORIENTACAO_DA_CAUSA[estado.causa]}`;
}
