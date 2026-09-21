// Story 48.1 — ponte entre o formulário dos Inputs Financeiros e o payload da
// API. Extraída do componente para ser testável em `lib/utils` (regra do
// projeto: testar o CORPO que vai para a API, não o tipo do hook).
//
//   formulário: texto por campo; percentuais em PONTOS (4 = 4 %); vazio = ""
//   API:        `number | null`; percentuais em FRAÇÃO (0.04); vazio = null

import { CAMPOS_DOS_INPUTS_FINANCEIROS, type InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";

export type CampoDosInputs = (typeof CAMPOS_DOS_INPUTS_FINANCEIROS)[number];
export type FormularioDosInputs = Record<CampoDosInputs, string>;
export type InputsPersistidos = { [K in keyof InputsFinanceiros]: number | null };

export type TipoDoCampo = "pct" | "moeda" | "contagem";

export const TIPO_DO_CAMPO: Record<CampoDosInputs, TipoDoCampo> = {
  pctReembolso: "pct",
  pctMarketplace: "pct",
  pctImposto: "pct",
  pctCustoProduto: "pct",
  pctComissoes: "pct",
  pctOutrosCustos: "pct",
  metaMargemTotal: "moeda",
  pctMargemPagos: "pct",
  ticketMedio: "moeda",
  mcAlvoPagos: "pct",
  investimentoAnuncios: "moeda",
  pctInvestMeta: "pct",
  pctMetaQuente: "pct",
  pctGoogleQuente: "pct",
  pctOrgWhatsapp: "pct",
  pctOrgEmail: "pct",
  pctOrgInstagram: "pct",
  pctOrgTelegram: "pct",
  pctOrgYoutube: "pct",
  pctOrgAreaMembros: "pct",
  baseWhatsapp: "contagem",
  baseEmail: "contagem",
  baseInstagram: "contagem",
  baseTelegram: "contagem",
  baseYoutube: "contagem",
  baseAreaMembros: "contagem",
};

/** Da API (fração/reais/contagem) para o formulário (pontos percentuais/reais/contagem), como texto. */
export function paraFormulario(inputs: InputsPersistidos): FormularioDosInputs {
  const f = {} as FormularioDosInputs;
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) {
    const v = inputs[k];
    if (v === null || v === undefined) f[k] = "";
    // `toFixed(6)` + `Number()`: 0.07 × 100 = 7.000000000000001 viraria "7.000000000000001" no campo.
    else if (TIPO_DO_CAMPO[k] === "pct") f[k] = String(Number((v * 100).toFixed(6)));
    else f[k] = String(v);
  }
  return f;
}

/** Texto do campo → número; vazio → `null`; texto não numérico → `NaN` (para o erro aparecer, não sumir). Aceita vírgula decimal. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Do formulário para o payload da API (fração/reais/contagem). `NaN` marca campo inválido. */
export function paraEntradas(f: FormularioDosInputs): InputsPersistidos {
  const out = {} as InputsPersistidos;
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) {
    const n = lerNumero(f[k]);
    if (n === null) out[k] = null;
    else if (Number.isNaN(n)) out[k] = Number.NaN;
    // ÷ 100 com arredondamento a 8 casas: "4" → 0.04 exato, e "33,333333" não vira 0.33333333000000004.
    else out[k] = TIPO_DO_CAMPO[k] === "pct" ? Number((n / 100).toFixed(8)) : n;
  }
  return out;
}

/** AC11 — as mesmas faixas que a API valida (zod), para o botão não mandar o que voltaria 400. */
export function validarEntradas(e: InputsPersistidos): Partial<Record<CampoDosInputs, string>> {
  const erros: Partial<Record<CampoDosInputs, string>> = {};
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) {
    const v = e[k];
    if (v === null) continue;
    if (Number.isNaN(v)) {
      erros[k] = "Só número";
      continue;
    }
    if (TIPO_DO_CAMPO[k] === "pct" && (v < 0 || v > 1)) erros[k] = "Entre 0 % e 100 %";
    if (TIPO_DO_CAMPO[k] === "moeda" && v < 0) erros[k] = "Não pode ser negativo";
    if (TIPO_DO_CAMPO[k] === "contagem" && (v < 0 || !Number.isInteger(v))) erros[k] = "Inteiro ≥ 0";
  }
  if (e.ticketMedio !== null && !Number.isNaN(e.ticketMedio) && e.ticketMedio <= 0) erros.ticketMedio = "Maior que zero";
  if (e.mcAlvoPagos !== null && !Number.isNaN(e.mcAlvoPagos) && e.mcAlvoPagos <= 0) erros.mcAlvoPagos = "Maior que zero";
  return erros;
}

/** `derivarInputsFinanceiros` recebe `Entrada`; um campo inválido (`NaN`) entra como vazio — a tela mostra o erro ao lado. */
export function comoEntradas(e: InputsPersistidos): InputsFinanceiros {
  const out = {} as InputsFinanceiros;
  for (const k of CAMPOS_DOS_INPUTS_FINANCEIROS) out[k] = Number.isNaN(e[k] as number) ? null : e[k];
  return out;
}

/** Há diferença entre o que está no formulário e o que a API tem? (`NaN` conta como diferente.) */
export function formularioAlterado(atual: InputsPersistidos, salvo: InputsPersistidos): boolean {
  return CAMPOS_DOS_INPUTS_FINANCEIROS.some((k) => !Object.is(atual[k], salvo[k]));
}
