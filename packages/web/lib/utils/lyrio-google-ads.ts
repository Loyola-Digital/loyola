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
  | { tipo: "pronto"; vinculadas: C[] }
  /** QA loop (TEST-001): a etapa tem campanhas do Google, mas o projeto não tem conta conectada. */
  | { tipo: "sem_conta" }
  /** A etapa não tem campanha do Google: não há o que medir (investimento 0, seções escondidas). */
  | { tipo: "sem_campanha" };

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

/**
 * A conta Google da etapa, antes de qualquer consulta de campanhas.
 *
 * QA loop da 42.13 (TEST-001): a conta da etapa pode ter sido removida (o
 * vínculo vira `null` e as campanhas continuam marcadas). Antes isso contava
 * como "Google = R$ 0" e as seções sumiam — o ROAS do Resumo saía só com a
 * Meta, calado. Sem conta é estado próprio, com aviso.
 */
export type ContaDoGoogle =
  | { tipo: "sem_campanha" }
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "sem_conta" }
  | { tipo: "conta"; accountId: string };

export function contaDoGoogle(e: {
  temCampanhas: boolean;
  /** `stage.googleAdsAccountId ?? picker.accountId`. */
  accountId: string | null | undefined;
  /** O picker de campanhas do projeto, que diz se há conta conectada. */
  picker: { isLoading: boolean; error: unknown; data?: { accountLinked: boolean } | undefined };
}): ContaDoGoogle {
  if (!e.temCampanhas) return { tipo: "sem_campanha" };
  if (e.accountId) return { tipo: "conta", accountId: e.accountId };
  if (e.picker.error) return { tipo: "erro", mensagem: mensagemDoErroDoGoogle(e.picker.error) };
  if (e.picker.isLoading || !e.picker.data) return { tipo: "carregando" };
  return { tipo: "sem_conta" };
}

/** O estado na janela: a conta decide primeiro; só com conta a consulta de campanhas manda. */
export function estadoDoGoogleNaJanela<C extends CampanhaDoGoogle>(
  conta: ContaDoGoogle,
  q: { isLoading: boolean; error: unknown; data: { campaigns: C[] } | undefined },
  idsVinculados: ReadonlySet<string>,
): EstadoDoGoogle<C> {
  if (conta.tipo !== "conta") return conta;
  return estadoDoGoogle(q, idsVinculados);
}

/** O investimento das vinculadas, ou `null` quando ele não é conhecido (carregando, erro, sem conta). */
export function investimentoDoGoogle(estado: EstadoDoGoogle): number | null {
  if (estado.tipo === "pronto") return estado.vinculadas.reduce((soma, c) => soma + c.spend, 0);
  if (estado.tipo === "sem_entrega" || estado.tipo === "sem_campanha") return 0;
  return null;
}

export const AVISO_SEM_CONTA_DO_GOOGLE =
  "Esta etapa tem campanhas do Google Ads vinculadas, mas o projeto não tem conta Google Ads conectada. Conecte a conta nas configurações do projeto.";

/** O texto do alerta para um estado que não tem número; `null` quando o estado tem (ou ainda vai ter). */
export function avisoDoGoogle(estado: EstadoDoGoogle): { titulo: string; detalhe: string | null; orientacao: string } | null {
  if (estado.tipo === "erro") {
    return { titulo: "Não foi possível buscar os dados do Google Ads.", detalhe: estado.mensagem, orientacao: ORIENTACAO_DO_ERRO_DO_GOOGLE };
  }
  if (estado.tipo === "sem_conta") {
    return { titulo: "Nenhuma conta Google Ads conectada ao projeto.", detalhe: null, orientacao: AVISO_SEM_CONTA_DO_GOOGLE };
  }
  return null;
}

/** Uma linha só, para avisos compactos (Detalhamento). */
export function avisoDoGoogleEmLinha(estado: EstadoDoGoogle): string | null {
  const a = avisoDoGoogle(estado);
  if (!a) return null;
  return [a.titulo, a.detalhe, a.orientacao].filter(Boolean).join(" ");
}

/**
 * O memorial do card "Investimento (Google)" do Resumo quando não há número:
 * diz POR QUE é "—" e que o ROAS e a Margem também ficam "—".
 */
export function memorialDoGoogleSemNumero(
  estado: EstadoDoGoogle,
  periodo: string,
  /** Quem mais fica "—" sem o Google (Story 42.14, QA MNT-001): o texto fala do card que o mostra. */
  dependentes = "o ROAS e a Margem de Contribuição ficam",
) {
  const a = avisoDoGoogle(estado);
  if (!a) return undefined;
  return {
    expression: estado.tipo === "erro" ? "Google Ads API indisponível" : "Sem conta Google Ads conectada",
    values: [
      {
        label: estado.tipo === "erro" ? "Erro" : "Conta",
        value: a.detalhe ?? "nenhuma conectada ao projeto",
        source: estado.tipo === "erro" ? "GET /api/google-ads/analytics/:accountId/campaigns" : "GET /api/projects/:projectId/google-ads-campaigns",
      },
    ],
    result: "—",
    period: periodo,
    note: `${a.orientacao} Enquanto isso, ${dependentes} "—": sem o Google, o investimento total é desconhecido.`,
  };
}
