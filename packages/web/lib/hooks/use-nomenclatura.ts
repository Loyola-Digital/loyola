"use client";

/**
 * Story 47.2 — o dicionário da nomenclatura (`/api/nomenclatura/*`, Story 47.1).
 *
 * Um conjunto de hooks por recurso, com a mesma forma: lista (com `usadoEm`
 * por linha), criar, editar, excluir, desativar, reativar, e — onde a API
 * sugere — próximo código. Toda mutação invalida a chave `["nomenclatura"]`
 * inteira: o dicionário é pequeno e as abas se cruzam (desativar um expert
 * muda a lista de produtos), então invalidar por recurso deixaria tela velha.
 *
 * ## Erros
 *
 * A API responde `{ error, campo?, usadoEm?, referencias?, podeDesativar?,
 * sugestao? }`. O `api-client` já guarda o corpo em `err.body`; `erroDaApi()`
 * tipa isso para a tela decidir (409 com `referencias` vira o diálogo de
 * "Desativar em vez de excluir").
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DicionarioSnapshot, ParseResult } from "@loyola-x/shared/src/nomenclatura-de-campanha";
import type { SugestaoDeClassificacao } from "@loyola-x/shared/src/nomenclatura-legado";
import type { TipoDeVariavel, VslParseResult, VslSnapshot } from "@loyola-x/shared/src/nomenclatura-de-vsl";
import type { AdParseResult } from "@loyola-x/shared/src/nomenclatura-de-anuncio";

/** `vsl/variaveis` (Story 47.9) segue o mesmo contrato CRUD, sob o prefixo `/vsl`. */
export type Recurso = "experts" | "produtos" | "funis" | "ofertas" | "lps" | "dicionario" | "vsl/variaveis";
/** `creative_type` e `launch_type` (Story 47.10) são os do nome de anúncio; mesmo CRUD. */
export type TipoDeValor = "year" | "temperature" | "auction" | "format" | "creative_type" | "launch_type";

export interface Referencia {
  tipo: "produto" | "funil" | "oferta" | "lp" | "campanha" | "variavel" | "vsl" | "anuncio";
  id: string;
  rotulo: string;
}

export interface CorpoDeErro {
  error: string;
  campo?: string;
  usadoEm?: number;
  referencias?: Referencia[];
  podeDesativar?: boolean;
  sugestao?: string | null;
}

export interface ErroDaApi {
  status: number;
  mensagem: string;
  corpo: CorpoDeErro | null;
}

/** Tipa o erro que o `api-client` lança. */
export function erroDaApi(e: unknown): ErroDaApi {
  const err = e as { status?: number; message?: string; body?: unknown } | null;
  const corpo = err?.body && typeof err.body === "object" && "error" in (err.body as object) ? (err.body as CorpoDeErro) : null;
  return { status: err?.status ?? 0, mensagem: corpo?.error ?? err?.message ?? "Erro desconhecido", corpo };
}

interface Base {
  id: string;
  active: boolean;
  usadoEm: number;
  createdAt: string;
  updatedAt: string;
}
export interface Expert extends Base {
  code: string;
  name: string;
  /** Story 47.5: projeto do Loyola X que este expert representa (único por projeto). */
  projectId: string | null;
  produtos: number;
  funis: number;
  ofertas: number;
  lps: number;
}
export interface Produto extends Base {
  expertId: string;
  slug: string;
  name: string;
  description: string | null;
}
export interface FunilOuOferta extends Base {
  expertId: string;
  code: string;
  description: string;
  startedAt: string;
  rotulo: string;
}
export interface Lp extends Base {
  expertId: string;
  productId: string;
  funnelId: string;
  offerId: string;
  code: string;
  slug: string;
  url: string | null;
  description: string | null;
  rotulo: string;
}
export interface ValorFixo extends Base {
  type: TipoDeValor;
  value: string;
  description: string | null;
  sortOrder: number;
}
/** Story 47.9: lead · mecanismo do problema · mecanismo da solução, por expert. */
export interface VariavelDeVsl extends Base {
  expertId: string;
  type: TipoDeVariavel;
  code: string;
  description: string;
  rotulo: string;
}

export type LinhaDe<R extends Recurso> = R extends "experts"
  ? Expert
  : R extends "produtos"
    ? Produto
    : R extends "funis" | "ofertas"
      ? FunilOuOferta
      : R extends "lps"
        ? Lp
        : R extends "vsl/variaveis"
          ? VariavelDeVsl
          : ValorFixo;

const BASE = "/api/nomenclatura";

function query(params: Record<string, string | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    q.set(k, v === true ? "1" : v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function useListaDe<R extends Recurso>(
  recurso: R,
  params: { inativos?: boolean; expertId?: string; productId?: string; funnelId?: string; offerId?: string; type?: TipoDeValor | TipoDeVariavel } = {},
  opts: { enabled?: boolean } = {},
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", recurso, params],
    queryFn: () => apiClient<LinhaDe<R>[]>(`${BASE}/${recurso}${query(params)}`),
    enabled: opts.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/** Sugestão de código no escopo (funis/ofertas por expert; lps pela combinação). */
export function useProximoCodigo(
  recurso: "funis" | "ofertas" | "lps" | "vsl/variaveis",
  params: { expertId?: string; productId?: string; funnelId?: string; offerId?: string; type?: TipoDeVariavel },
  enabled: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", recurso, "proximo-codigo", params],
    queryFn: () => apiClient<{ codigo: string | null; slug?: string | null }>(`${BASE}/${recurso}/proximo-codigo${query(params)}`),
    enabled,
    // Sugestão nunca pode vir velha: alguém acabou de cadastrar o lpa.
    staleTime: 0,
  });
}

export function useImpactoDaDesativacao(expertId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "experts", expertId, "impacto"],
    queryFn: () => apiClient<{ produtos: number; funis: number; ofertas: number; lps: number; variaveisDeVsl?: number }>(`${BASE}/experts/${expertId}/impacto-da-desativacao`),
    enabled: Boolean(expertId),
    staleTime: 0,
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["nomenclatura"] });
}

export function useCriar<R extends Recurso>(recurso: R) {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      apiClient<LinhaDe<R>>(`${BASE}/${recurso}`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useEditar<R extends Recurso>(recurso: R) {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Record<string, unknown> }) =>
      apiClient<LinhaDe<R>>(`${BASE}/${recurso}/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useExcluir(recurso: Recurso) {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => apiClient<void>(`${BASE}/${recurso}/${id}`, { method: "DELETE" }),
    onSuccess: invalidar,
  });
}

export function useAlternarAtivo(recurso: Recurso) {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      apiClient<Record<string, unknown>>(`${BASE}/${recurso}/${id}/${ativo ? "reativar" : "desativar"}`, { method: "POST" }),
    onSuccess: invalidar,
  });
}

// ─────────────────── Story 47.3: snapshot, campanhas, validador ───────────────────

export interface Campanha {
  id: string;
  expertId: string;
  productId: string;
  funnelId: string;
  offerId: string | null;
  offerValue: string;
  landingPageId: string | null;
  lpValue: string;
  year: string;
  temperature: string;
  auction: string;
  format: string;
  suffix: string | null;
  name: string;
  publishedAt: string | null;
  metaCampaignId: string | null;
  /** Story 47.5 */
  origin: "gerador" | "legado";
  metaCampaignName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  expertCode: string;
  productSlug: string;
  funnelRotulo: string;
  offerRotulo: string;
  lpSlug: string | null;
}

/** O dicionário por código — o que a prévia e o validador leem. */
export function useSnapshot(inativos = false) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "snapshot", inativos],
    queryFn: () => apiClient<DicionarioSnapshot>(`${BASE}/dicionario/snapshot${query({ inativos })}`),
    staleTime: 30 * 1000,
  });
}

export interface FiltrosDeCampanhas {
  expertId?: string;
  productId?: string;
  funnelId?: string;
  offerId?: string;
  year?: string;
  q?: string;
  publicada?: "1" | "0";
  limit?: number;
  offset?: number;
}

export function useCampanhas(f: FiltrosDeCampanhas = {}) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "campanhas", f],
    queryFn: () =>
      apiClient<{ itens: Campanha[]; total: number }>(
        `${BASE}/campanhas${query({ ...f, limit: f.limit === undefined ? undefined : String(f.limit), offset: f.offset === undefined ? undefined : String(f.offset) })}`,
      ),
    staleTime: 15 * 1000,
  });
}

export function useCampanha(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "campanhas", "uma", id],
    queryFn: () => apiClient<Campanha>(`${BASE}/campanhas/${id}`),
    enabled: Boolean(id),
  });
}

export function useCriarCampanha() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Record<string, unknown>) => apiClient<Campanha>(`${BASE}/campanhas`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useEditarCampanha() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Record<string, unknown> }) =>
      apiClient<Campanha>(`${BASE}/campanhas/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function usePublicarCampanha() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, metaCampaignId }: { id: string; metaCampaignId?: string }) =>
      apiClient<Campanha>(`${BASE}/campanhas/${id}/publicar`, { method: "POST", body: JSON.stringify(metaCampaignId ? { metaCampaignId } : {}) }),
    onSuccess: invalidar,
  });
}

/** Validar um nome existente (spec § 8) — lê o snapshot COM inativos no servidor. */
export function useValidarNome() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (name: string) => apiClient<ParseResult>(`${BASE}/validar-nome`, { method: "POST", body: JSON.stringify({ name }) }),
  });
}

// ─────────────────── Story 47.9: VSLs ───────────────────

export interface Vsl {
  id: string;
  expertId: string;
  productId: string;
  leadId: string;
  problemId: string;
  solutionId: string;
  offerId: string;
  leadValue: string;
  problemValue: string;
  solutionValue: string;
  offerValue: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  expertCode: string;
  productSlug: string;
  leadRotulo: string;
  problemRotulo: string;
  solutionRotulo: string;
  offerRotulo: string;
}

export function useSnapshotDeVsl(inativos = false) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "vsl", "snapshot", inativos],
    queryFn: () => apiClient<VslSnapshot>(`${BASE}/vsl/snapshot${query({ inativos })}`),
    staleTime: 30 * 1000,
  });
}

export function useVsls(f: { expertId?: string; productId?: string; offerId?: string; q?: string; limit?: number; offset?: number } = {}) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "vsl", "vsls", f],
    queryFn: () =>
      apiClient<{ itens: Vsl[]; total: number }>(`${BASE}/vsl/vsls${query({ ...f, limit: f.limit === undefined ? undefined : String(f.limit), offset: f.offset === undefined ? undefined : String(f.offset) })}`),
    staleTime: 15 * 1000,
  });
}

export function useVsl(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "vsl", "vsls", "uma", id],
    queryFn: () => apiClient<Vsl>(`${BASE}/vsl/vsls/${id}`),
    enabled: Boolean(id),
  });
}

export function useCriarVsl() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Record<string, unknown>) => apiClient<Vsl>(`${BASE}/vsl/vsls`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useEditarVsl() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Record<string, unknown> }) =>
      apiClient<Vsl>(`${BASE}/vsl/vsls/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useValidarNomeDeVsl() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (name: string) => apiClient<VslParseResult>(`${BASE}/vsl/validar-nome`, { method: "POST", body: JSON.stringify({ name }) }),
  });
}

// ─────────────────── Story 47.10: anúncios ───────────────────

export interface Anuncio {
  id: string;
  expertId: string;
  creativeType: string;
  creativeSeq: number;
  launchType: string;
  launchSeq: number;
  /** `AAAA-MM-01` */
  adDate: string;
  description: string | null;
  structure: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  expertCode: string;
}

export function useProximoNnDeAnuncio(expertId: string, launchType?: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "ads", "proximo", expertId, launchType ?? ""],
    queryFn: () => apiClient<{ creativeSeq: number | null; creativeSeqTexto: string | null; launchSeqSugerido: number | null }>(`${BASE}/ads/proximo${query({ expertId, launchType })}`),
    enabled: Boolean(expertId),
    // Nunca velho: alguém acabou de reservar o 03.
    staleTime: 0,
  });
}

export function useAnuncios(f: { expertId?: string; creativeType?: string; launchType?: string; de?: string; ate?: string; q?: string; limit?: number; offset?: number } = {}) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "ads", "lista", f],
    queryFn: () =>
      apiClient<{ itens: Anuncio[]; total: number }>(`${BASE}/ads${query({ ...f, limit: f.limit === undefined ? undefined : String(f.limit), offset: f.offset === undefined ? undefined : String(f.offset) })}`),
    staleTime: 15 * 1000,
  });
}

export function useAnuncio(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "ads", "um", id],
    queryFn: () => apiClient<Anuncio>(`${BASE}/ads/${id}`),
    enabled: Boolean(id),
  });
}

export function useCriarAnuncio() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Record<string, unknown>) => apiClient<Anuncio>(`${BASE}/ads`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useEditarAnuncio() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Record<string, unknown> }) =>
      apiClient<Anuncio>(`${BASE}/ads/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useValidarNomeDeAnuncio() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (name: string) => apiClient<AdParseResult>(`${BASE}/ads/validar-nome`, { method: "POST", body: JSON.stringify({ name }) }),
  });
}

// ─────────────────── Story 47.5: legadas ───────────────────

export type FilaDeLegadas = "pendentes" | "ignoradas" | "classificadas" | "todas";

export interface Legada {
  projectId: string;
  projeto: string;
  campaignId: string;
  nome: string;
  statusMeta: string | null;
  expert: { id: string; code: string; name: string; active: boolean } | null;
  gasto: number;
  de: string | null;
  ate: string | null;
  decisao: { tipo: "classificada" | "ignorada"; namingCampaignId: string | null; reason: string | null; em: string } | null;
  sugestao: SugestaoDeClassificacao;
}

export interface RespostaDeLegadas {
  itens: Legada[];
  resumo: { total: number; pendentes: number; gastoPendente: number };
}

export function useLegadas(f: { projectId?: string; fila?: FilaDeLegadas; q?: string } = {}) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["nomenclatura", "legadas", f],
    queryFn: () => apiClient<RespostaDeLegadas>(`${BASE}/legadas${query(f)}`),
    staleTime: 15 * 1000,
  });
}

export function useClassificarLegada() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ projectId, campaignId, dados }: { projectId: string; campaignId: string; dados: Record<string, unknown> }) =>
      apiClient<Campanha>(`${BASE}/legadas/${projectId}/${encodeURIComponent(campaignId)}/classificar`, { method: "POST", body: JSON.stringify(dados) }),
    onSuccess: invalidar,
  });
}

export function useIgnorarLegada() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ projectId, campaignId, reason }: { projectId: string; campaignId: string; reason?: string }) =>
      apiClient<unknown>(`${BASE}/legadas/${projectId}/${encodeURIComponent(campaignId)}/ignorar`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }),
    onSuccess: invalidar,
  });
}

export function useDesfazerDecisao() {
  const apiClient = useApiClient();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ projectId, campaignId }: { projectId: string; campaignId: string }) =>
      apiClient<void>(`${BASE}/legadas/${projectId}/${encodeURIComponent(campaignId)}/decisao`, { method: "DELETE" }),
    onSuccess: invalidar,
  });
}
