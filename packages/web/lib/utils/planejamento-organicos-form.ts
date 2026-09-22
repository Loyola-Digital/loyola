// Story 48.3 — ponte entre o formulário da aba "Leads Orgânicos" e o payload
// da API (`…/planejamento/organicos`), mais as regras de tela que não são
// conta de negócio (cores do atingimento — DV-016; cores das faixas; o
// diagnóstico do que falta na aba 1). Extraída do componente para ser testável
// em `lib/utils` (regra do projeto: testar o CORPO que vai para a API).
//
//   formulário: texto por campo de fração, em PONTOS (4 = 4 %); vazio = "";
//               nível assumido e seleções como `number | null` (radio/select)
//   API:        frações como `number | null` (0.04); nível 1…8; seleção 1…10

import { CANAIS_ORGANICOS, NIVEIS_ORGANICOS, CENARIOS, type CanalOrganico, type Faixa } from "@loyola-x/shared/src/planejamento-cenarios";
import {
  CAMPOS_DO_BLOCO_ORGANICO,
  INDICES_DAS_COMBINACOES,
  BASE_DO_CANAL,
  CANAL_NA_ABA_1,
  type BlocoOrganico,
  type CampoDoBlocoOrganico,
  type OrganicosDoSimulador,
  type SelecoesPorCanal,
} from "@loyola-x/shared/src/planejamento-combinacoes";
import type { DerivadosFinanceiros, InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import { lerNumero } from "@/lib/utils/planejamento-inputs-form";

export { estadoDaTela } from "@/lib/utils/planejamento-inputs-form";

/** Os seis campos de fração do bloco (o sétimo, `nivelAssumido`, é o radio). */
export const CAMPOS_DE_FRACAO_DO_BLOCO = CAMPOS_DO_BLOCO_ORGANICO.filter((c): c is Exclude<CampoDoBlocoOrganico, "nivelAssumido"> => c !== "nivelAssumido");
export type CampoDeFracaoDoBloco = (typeof CAMPOS_DE_FRACAO_DO_BLOCO)[number];

export interface FormularioDoBloco {
  fracoes: Record<CampoDeFracaoDoBloco, string>;
  nivelAssumido: number | null;
}

export interface FormularioDosOrganicos {
  blocos: Record<CanalOrganico, FormularioDoBloco>;
  /** `[k][canal]` com k = 0…4 (índice 1…5). */
  combinacoes: SelecoesPorCanal[];
}

/** Da API (fração) para o formulário (pontos percentuais, texto com vírgula). */
export function paraFormularioOrganicos(dados: OrganicosDoSimulador): FormularioDosOrganicos {
  const blocos = {} as Record<CanalOrganico, FormularioDoBloco>;
  for (const c of CANAIS_ORGANICOS) {
    const b = dados.blocos[c];
    const fracoes = {} as Record<CampoDeFracaoDoBloco, string>;
    for (const k of CAMPOS_DE_FRACAO_DO_BLOCO) {
      const v = b[k];
      // `toFixed(6)` + `Number()`: 0.07 × 100 = 7.000000000000001 viraria "7.000000000000001" no campo (mesma regra da 48.1).
      fracoes[k] = v === null || v === undefined ? "" : String(Number((v * 100).toFixed(6))).replace(".", ",");
    }
    blocos[c] = { fracoes, nivelAssumido: b.nivelAssumido ?? null };
  }
  const combinacoes = INDICES_DAS_COMBINACOES.map((indice) => {
    const sel = dados.combinacoes.find((x) => x.indice === indice)?.selecoes;
    const s = {} as SelecoesPorCanal;
    for (const c of CANAIS_ORGANICOS) s[c] = sel?.[c] ?? null;
    return s;
  });
  return { blocos, combinacoes };
}

/** Do formulário para o payload da API. `NaN` marca campo de fração inválido (texto). */
export function paraPayloadOrganicos(f: FormularioDosOrganicos): OrganicosDoSimulador {
  const blocos = {} as Record<CanalOrganico, BlocoOrganico>;
  for (const c of CANAIS_ORGANICOS) {
    const b = {} as BlocoOrganico;
    for (const k of CAMPOS_DE_FRACAO_DO_BLOCO) {
      const n = lerNumero(f.blocos[c].fracoes[k]);
      // ÷ 100 com arredondamento a 8 casas: "4" → 0.04 exato (mesma regra da 48.1).
      b[k] = n === null ? null : Number.isNaN(n) ? Number.NaN : Number((n / 100).toFixed(8));
    }
    b.nivelAssumido = f.blocos[c].nivelAssumido;
    blocos[c] = b;
  }
  return {
    blocos,
    combinacoes: INDICES_DAS_COMBINACOES.map((indice, i) => ({ indice, selecoes: { ...f.combinacoes[i] } })),
  };
}

export type ErrosDosOrganicos = Partial<Record<CanalOrganico, Partial<Record<CampoDoBlocoOrganico, string>>>>;

/** As mesmas faixas que a API valida (zod), para o botão não mandar o que voltaria 400. */
export function validarOrganicos(p: OrganicosDoSimulador): ErrosDosOrganicos {
  const erros: ErrosDosOrganicos = {};
  const marcar = (c: CanalOrganico, k: CampoDoBlocoOrganico, msg: string) => {
    (erros[c] ??= {})[k] = msg;
  };
  for (const c of CANAIS_ORGANICOS) {
    const b = p.blocos[c];
    for (const k of CAMPOS_DE_FRACAO_DO_BLOCO) {
      const v = b[k];
      if (v === null) continue;
      if (Number.isNaN(v)) marcar(c, k, "Só número");
      else if (v < 0 || v > 1) marcar(c, k, "Entre 0 % e 100 %");
    }
    const n = b.nivelAssumido;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > NIVEIS_ORGANICOS)) marcar(c, "nivelAssumido", `Nível 1…${NIVEIS_ORGANICOS}`);
  }
  return erros;
}

export function temErros(erros: ErrosDosOrganicos): boolean {
  return Object.values(erros).some((e) => e && Object.keys(e).length > 0);
}

/** `gradeOrganica` recebe `Entrada`; um campo inválido (`NaN`) entra como vazio — a tela mostra o erro ao lado. */
export function blocoComoEntradas(b: BlocoOrganico): BlocoOrganico {
  const out = {} as BlocoOrganico;
  for (const k of CAMPOS_DO_BLOCO_ORGANICO) out[k] = Number.isNaN(b[k] as number) ? null : b[k];
  return out;
}

/** Há diferença entre o formulário e o que a API tem? (`NaN` conta como diferente.) */
export function organicosAlterados(atual: OrganicosDoSimulador, salvo: OrganicosDoSimulador): boolean {
  for (const c of CANAIS_ORGANICOS) {
    for (const k of CAMPOS_DO_BLOCO_ORGANICO) if (!Object.is(atual.blocos[c][k], salvo.blocos[c][k])) return true;
  }
  for (const indice of INDICES_DAS_COMBINACOES) {
    const a = atual.combinacoes.find((x) => x.indice === indice)?.selecoes;
    const s = salvo.combinacoes.find((x) => x.indice === indice)?.selecoes;
    for (const c of CANAIS_ORGANICOS) if (!Object.is(a?.[c] ?? null, s?.[c] ?? null)) return true;
  }
  return false;
}

/** Valor do `<select>` de cenário → seleção; "" = vazio. Fora de 1…10 → `null` (o seletor é fechado; cinto). */
export function lerSelecao(valor: string): number | null {
  if (valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= CENARIOS ? n : null;
}

// ------------------------------------------------------------------
// DV-016 (A) — cores do atingimento da meta
// ------------------------------------------------------------------

/** Limiares da planilha (formatação condicional de Y3): verde ≥ 100 %, vermelho ≤ 70 %. Constantes da tela, não do banco. */
export const LIMIAR_VERDE = 1;
export const LIMIAR_VERMELHO = 0.7;

export type EstadoDoAtingimento = "verde" | "vermelho" | "neutro";

/** `null` quando não há atingimento (meta zero). Reproduz DV-016 = A: verde ≥ 100 %, vermelho ≤ 70 %, neutro entre os dois. */
export function estadoDoAtingimento(atingimento: number | null): EstadoDoAtingimento | null {
  if (atingimento === null || !Number.isFinite(atingimento)) return null;
  if (atingimento >= LIMIAR_VERDE) return "verde";
  if (atingimento <= LIMIAR_VERMELHO) return "vermelho";
  return "neutro";
}

/** Largura da barra de atingimento em 0…100 (a "█" de Y3 virou componente — AR-005): `min(atingimento, 1)`, piso 0. */
export function larguraDaBarra(atingimento: number | null): number {
  if (atingimento === null || !Number.isFinite(atingimento)) return 0;
  return Math.round(Math.min(Math.max(atingimento, 0), 1) * 100);
}

// ------------------------------------------------------------------
// Faixas de leads (RN-015, spec §2.2 "Formatação condicional") — 1 azul … 4 vermelho
// ------------------------------------------------------------------

export const CLASSE_DA_FAIXA: Record<Faixa, string> = {
  1: "bg-sky-100 dark:bg-sky-900/40",
  2: "bg-emerald-100 dark:bg-emerald-900/40",
  3: "bg-amber-100 dark:bg-amber-900/40",
  4: "bg-red-100 dark:bg-red-900/40",
};

export function classeDaFaixa(faixa: Faixa | null): string {
  return faixa === null ? "" : CLASSE_DA_FAIXA[faixa];
}

/**
 * UX-001 (gate da 48.3; nota 2 do gate da 48.2): a faixa só tem sentido com
 * REFERÊNCIA — leads esperados por campanha > 0 (taxa de captação × base).
 * Com referência zero o motor reproduz a planilha (`limites = {0,0,0}`,
 * toda célula > 0 cai na faixa 4) e a grade inteira ficaria vermelha com a
 * legenda "# Leads > 0" — "sem base" lido como "tudo ruim". A tela não pinta
 * e diz que falta a referência; o motor fica intocado.
 */
export function temReferenciaDeFaixa(leadsEsperados: number): boolean {
  return Number.isFinite(leadsEsperados) && leadsEsperados > 0;
}

/** Classe da célula de leads: a cor da faixa só quando há referência (UX-001). */
export function classeDaCelulaDeLeads(faixa: Faixa | null, leadsEsperados: number): string {
  return temReferenciaDeFaixa(leadsEsperados) ? classeDaFaixa(faixa) : "";
}

/**
 * REQ-001 (gate da 48.3): meta de receita `null` na 48.1 (margem-alvo sem
 * base) é "sem base", e a AC13 manda mostrar "—" na grade. O motor da 48.2
 * devolve zeros para meta vazia (regra dele: meta vazia → dez zeros), então a
 * tradução para "—" é da tela: um valor da grade vira `null` quando a META
 * é `null` — não quando é zero (zero é zero).
 */
export function valorDaGrade(valor: number | null, metaReceita: number | null): number | null {
  return metaReceita === null ? null : valor;
}

// ------------------------------------------------------------------
// AC13 — o que falta na aba 1 para a aba 2 ter base
// ------------------------------------------------------------------

export const ROTULO_DO_CANAL: Record<CanalOrganico, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram",
  telegram: "Telegram",
  youtube: "YouTube",
  area_membros: "Área de Membros",
};

/**
 * Lista, em texto, os inputs da aba 1 que deixam a aba 2 sem base — para a
 * tela dizer QUAL input falta em vez de mostrar "—" sem explicação (padrão
 * "erro ≠ ausência"). Vazia quando nada falta.
 */
export function diagnosticoDaAba1(entradas: InputsFinanceiros, derivados: DerivadosFinanceiros): string[] {
  const faltas: string[] = [];
  const vazio = (v: number | null | undefined) => v === null || v === undefined || !Number.isFinite(v) || v === 0;
  if (vazio(entradas.metaMargemTotal)) faltas.push("Meta de Margem de Contribuição Total");
  if (vazio(entradas.ticketMedio)) faltas.push("Ticket Médio (sem ele, vendas e leads não têm base)");
  if (derivados.mcAlvoOrganicos <= 0) faltas.push("Custos variáveis somam 100 % ou mais — a margem-alvo dos orgânicos não tem base");
  for (const c of CANAIS_ORGANICOS) {
    if (derivados.canais[CANAL_NA_ABA_1[c]].pct === 0) faltas.push(`% da meta — ${ROTULO_DO_CANAL[c]}`);
    if (vazio(entradas[BASE_DO_CANAL[c]])) faltas.push(`Base ${ROTULO_DO_CANAL[c]}`);
  }
  return faltas;
}
