/**
 * Story 42.13 (AC1) — o estado dos blocos do Google Ads na etapa Lyrio.
 *
 * Antes, `GoogleAdsKpis` só olhava `data`: com a consulta em erro (502 — o
 * refresh token da conta recusado com `invalid_grant`), a lista de vinculadas
 * ficava vazia e a tela dizia "não tiveram entrega". O mesmo erro virava R$ 0
 * de investimento no Resumo e entrava calado no ROAS. Erro é erro: aqui ele
 * tem estado próprio, com a mensagem que a API mandou.
 */

export interface CampanhaDoGoogle {
  id: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export type EstadoDoGoogle<C extends CampanhaDoGoogle = CampanhaDoGoogle> =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "sem_entrega" }
  | { tipo: "pronto"; vinculadas: C[] };

/** A mensagem do erro da API: `error` e, quando vier, o `details` do 502 (ex.: "invalid_grant"). */
export function mensagemDoErroDoGoogle(erro: unknown): string {
  const e = erro as { message?: string; body?: { error?: unknown; details?: unknown } } | null;
  const principal = (typeof e?.body?.error === "string" && e.body.error) || e?.message || "Erro desconhecido";
  const detalhe = typeof e?.body?.details === "string" ? e.body.details.trim() : "";
  return detalhe && !principal.includes(detalhe) ? `${principal}: ${detalhe}` : principal;
}

export const ORIENTACAO_DO_ERRO_DO_GOOGLE =
  "Se o erro fala em token (invalid_grant), reconecte a conta Google Ads nas configurações do projeto.";

export function estadoDoGoogle<C extends CampanhaDoGoogle>(
  q: { isLoading: boolean; error: unknown; data: { campaigns: C[] } | undefined },
  idsVinculados: ReadonlySet<string>,
): EstadoDoGoogle<C> {
  if (q.error) return { tipo: "erro", mensagem: mensagemDoErroDoGoogle(q.error) };
  if (q.isLoading || !q.data) return { tipo: "carregando" };
  const vinculadas = q.data.campaigns.filter((c) => idsVinculados.has(c.id));
  return vinculadas.length === 0 ? { tipo: "sem_entrega" } : { tipo: "pronto", vinculadas };
}

/** O investimento das vinculadas, ou `null` quando ele não é conhecido (carregando ou erro). */
export function investimentoDoGoogle(estado: EstadoDoGoogle): number | null {
  if (estado.tipo === "pronto") return estado.vinculadas.reduce((soma, c) => soma + c.spend, 0);
  if (estado.tipo === "sem_entrega") return 0;
  return null;
}
