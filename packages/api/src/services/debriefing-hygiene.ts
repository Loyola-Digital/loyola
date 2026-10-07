/**
 * Story 49.3 — higiene das vendas do Debriefing (Fase 2 da skill
 * `loyola-debriefing`), em funções PURAS.
 *
 * É o contrato entre o motor de dinheiro e tempo (49.3) e o de público (49.4):
 * a 49.4 importa daqui a normalização de telefone e de e-mail, as chaves
 * anônimas de comprador, a dedup e `aplicarImposto`. Assinaturas estáveis — uma
 * segunda implementação é exatamente a armadilha #9 da skill (Closer 19 num
 * lugar e 22 noutro).
 *
 * O que mora aqui e por quê:
 *
 * - **Leitura de dinheiro da célula crua** (`lerValorMonetario`): os três
 *   `parseNumber*` locais das fontes de linha (`sales-daily-sync.ts`,
 *   `stage-sales-data.ts`, `public-sales-rows.ts`) leem `"4.000"` como 4
 *   (R-49-4). O motor recebe a célula e passa pelo parser único do shared.
 * - **Dedup em duas camadas** (`deduplicarVendas`): camada 1 = a função da 41.10
 *   (`deduplicarPorIdDaVenda`), importada — esta story não redefine a chave;
 *   camada 2 = `(e-mail, produto)`, passo 2 da skill.
 * - **Status** (`filtrarPorStatus`): só `paid` vira receita; a transação com
 *   reembolso na mesma planilha sai inteira (mesma regra do loader do Resumão,
 *   que é o número governante — decisão 1 do dono).
 * - **Data** (`dataBrt`): os quatro formatos de célula do perfil DG §10.7
 *   (epoch-ms, ISO com fuso, `dd/mm/aaaa`, `aaaa-mm-dd`), com o instante
 *   convertido para America/Sao_Paulo.
 * - **Telefone** (`normalizarTelefone`): remove o sufixo de float `.0` ANTES de
 *   tirar os não-dígitos. O `phoneTail` de `utils/lead-origin.ts` lê
 *   `"553175058180.0"` como `50581800` (o `0` do `.0` vira dígito) — ele é usado
 *   pelas telas da jornada e não é alterado aqui (story própria).
 * - **Imposto** (`aplicarImposto`): gross-up "por dentro" uma única vez, com o
 *   mesmo corte de data de `applyMetaTax` (antes de 2026-01-01 não há gross-up,
 *   com ou sem override — resolução 6). Nunca o fator fixo da skill.
 * - **Janela** (`janelaDoDebriefing`, decisão 2A): de `inicioCaptacao` até o
 *   maior entre o fim do carrinho, da reabertura e do downsell.
 * - **Vendas manuais** (`ehManual`, decisão 3A): `manual_sales` entram como
 *   venda da etapa, com a origem marcada.
 * - **UTM em array** (`desembrulharUtm`, regra 9 da skill): `{"qr","qr"}` →
 *   `qr` antes do classificador, para lead e venda.
 *
 * Nada aqui lê banco, planilha, relógio ou `Math.random`.
 */

import { createHash } from "node:crypto";
import { parseValorPlanilha } from "@loyola-x/shared";
import { deduplicarPorIdDaVenda } from "../utils/dedup-por-id-da-venda.js";
import { deduplicarPorPessoaEProduto } from "../utils/dedup-pessoa-produto.js";
import { normalizeEmail } from "../utils/lead-origin.js";
import { META_TAX_EFFECTIVE_DATE } from "../utils/meta-tax.js";
import { toBusinessDayKey } from "../utils/sale-date.js";
import { classifyRefundStatus, isRefundBucket, isRevenueBucket } from "./sales-status.js";
import { resolverColunaPreco, type ColunaPrecoResolvida } from "./launch-report-sales-value.js";
import { inteiroBr } from "./launch-report-narrative.js";

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

export interface ValorLido {
  /** Valor absoluto lido pelo parser único (`parseValorPlanilha`). */
  valor: number;
  /**
   * A célula tinha sinal negativo. `parseValorPlanilha` descarta o sinal
   * (`numero-ptbr.ts`, aviso no próprio código) — sem esta marca um estorno
   * lançado como `-99,00` entraria na soma como `+99`. O motor trata a linha
   * como anomalia e não a soma.
   */
  negativo: boolean;
  /** Célula vazia ou sem número. */
  vazio: boolean;
}

/** `-99`, `R$ -99`, `-R$ 99`, `− 99` (sinal de menos Unicode) e `(99,00)` contábil. */
const SINAL_NEGATIVO = /(^|[^\d])[-−]\s*(r\$\s*)?\d|^\s*\(\s*(r\$\s*)?[\d.,]+\s*\)\s*$/i;

/**
 * Lê uma célula monetária crua. O único parser é o do shared
 * (`parseValorPlanilha` → `parseNumeroPtBr`): `"1.234,56"`, `"1234,56"`,
 * `"29.9"` (decimal US, nunca 299), `"4.000"` (milhar) e `"R$ 1.234,56"`.
 *
 * Limite conhecido do parser, mantido à vista: um ponto seguido de exatamente
 * três dígitos é milhar — `"1.234"` é 1234, não 1,234.
 */
export function lerValorMonetario(celula: string | number | null | undefined): ValorLido {
  if (celula == null) return { valor: 0, negativo: false, vazio: true };
  const texto = String(celula).trim();
  if (!texto || !/\d/.test(texto)) return { valor: 0, negativo: false, vazio: true };
  return { valor: parseValorPlanilha(texto), negativo: SINAL_NEGATIVO.test(texto), vazio: false };
}

/** Real → centavos inteiros. Toda soma de dinheiro do Debriefing é feita em centavos. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Cabeçalhos que o Debriefing nega como valor da venda ALÉM dos do Epic 41
 * (`HEADER_PROIBIDO` de `launch-report-sales-value.ts`, que não muda):
 * `Líquido`/`valor líquido` e `Total com acréscimo` estão na moeda da cobrança
 * e explodem com juros de parcelamento (perfil DG §10.5). Faturamento é BRUTO.
 */
const HEADER_PROIBIDO_DEBRIEFING = /l[íi]quido|total\s*com\s*acr[ée]scimo/i;

/**
 * Coluna de preço do Debriefing: a regra do Epic 41 (`resolverColunaPreco`:
 * mapping, salvo "valor oferta"/"valor pago", senão o cabeçalho "Preço") mais a
 * lista negativa acima. Mapping apontando para coluna proibida → procura
 * "Preço" e marca `mappingDivergente`.
 */
export function resolverColunaPrecoDebriefing(
  colunaDoMapping: string | null | undefined,
  headers: readonly string[],
): ColunaPrecoResolvida {
  const doMapping = (colunaDoMapping ?? "").trim() || null;
  if (doMapping && HEADER_PROIBIDO_DEBRIEFING.test(doMapping)) {
    const r = resolverColunaPreco(null, headers);
    return {
      coluna: r.coluna && !HEADER_PROIBIDO_DEBRIEFING.test(r.coluna) ? r.coluna : null,
      origem: r.coluna ? r.origem : "nenhuma",
      mappingDivergente: true,
      colunaDoMapping: doMapping,
    };
  }
  const r = resolverColunaPreco(doMapping, headers);
  if (r.coluna && HEADER_PROIBIDO_DEBRIEFING.test(r.coluna)) {
    return { coluna: null, origem: "nenhuma", mappingDivergente: r.mappingDivergente, colunaDoMapping: doMapping };
  }
  return r;
}

// ---------------------------------------------------------------------------
// Imposto (decisão 2 do dono: regra do Loyola, nunca o fator fixo da skill)
// ---------------------------------------------------------------------------

/**
 * Investimento com imposto de UM dia: `spendBruto ÷ (1 − pct)` a partir de
 * `META_TAX_EFFECTIVE_DATE` (2026-01-01); antes disso o spend volta como veio,
 * com ou sem override (resolução 6 do @sm: a regra de `applyMetaTax`).
 *
 * Consumida também pela 49.4 (custo por tipo de criativo).
 */
export function aplicarImposto(spendBruto: number, diaYmd: string, pct: number): number {
  if (!(pct >= 0 && pct < 1)) {
    throw new RangeError(`aplicarImposto: alíquota fora de [0, 1): ${String(pct)}`);
  }
  if (!(spendBruto > 0)) return spendBruto;
  return diaYmd >= META_TAX_EFFECTIVE_DATE ? spendBruto / (1 - pct) : spendBruto;
}

/** `1 / (1 − pct)` — o fator que o payload declara (`fatorImposto`). */
export function fatorDoImposto(pct: number): number {
  if (!(pct >= 0 && pct < 1)) {
    throw new RangeError(`fatorDoImposto: alíquota fora de [0, 1): ${String(pct)}`);
  }
  return 1 / (1 - pct);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function ymd(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const t = Date.UTC(ano, mes - 1, dia);
  const d = new Date(t);
  // 31/02 vira 03/03 no Date — data inexistente é célula ilegível, não data.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const RE_EPOCH_MS = /^(\d{12,13})(?:\.0+)?$/;
const RE_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+\d{1,2}:\d{2}(?::\d{2})?)?$/;
const RE_ISO_COM_FUSO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})$/i;
const RE_ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;

/**
 * Dia civil de São Paulo (`YYYY-MM-DD`) de uma célula de data, ou `null`.
 *
 * | célula | regra |
 * |---|---|
 * | `1713312000000` (epoch-ms, PG01) | instante → BRT |
 * | `2026-04-17T01:30:00Z` / `...-03:00` (ISO com fuso, n8n) | instante → BRT |
 * | `17/04/2026` (com ou sem hora) | dia escrito, sem conversão |
 * | `2026-04-17` (com ou sem hora, sem fuso) | dia escrito, sem conversão |
 *
 * Qualquer outra coisa é `null`: o motor manda a venda para `foraDaCoorte` em
 * vez de inventar uma data. Não usa `new Date(texto)` solto, que interpretaria
 * "17 Apr 2026" no fuso do processo.
 */
export function dataBrt(celula: string | number | null | undefined): string | null {
  if (celula == null) return null;
  const t = String(celula).trim();
  if (!t) return null;

  const epoch = t.match(RE_EPOCH_MS);
  if (epoch) {
    const d = new Date(Number(epoch[1]));
    return Number.isNaN(d.getTime()) ? null : toBusinessDayKey(d);
  }

  const br = t.match(RE_BR);
  if (br) return ymd(Number(br[3]), Number(br[2]), Number(br[1]));

  const iso = t.match(RE_ISO_COM_FUSO);
  if (iso) {
    const [ano, mes, dia] = iso[1]!.split("-").map(Number) as [number, number, number];
    if (!ymd(ano, mes, dia)) return null;
    const fuso = iso[3]!.toUpperCase() === "Z" ? "Z" : iso[3]!.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(`${iso[1]}T${iso[2]}${fuso}`);
    return Number.isNaN(d.getTime()) ? null : toBusinessDayKey(d);
  }

  const dia = t.match(RE_ISO_DIA);
  if (dia) return ymd(Number(dia[1]), Number(dia[2]), Number(dia[3]));

  return null;
}

/** Dias de calendário de `de` até `ate` (`YYYY-MM-DD`); negativo se `ate < de`. */
export function diasEntre(de: string, ate: string): number {
  const p = (s: string) => {
    const [a, m, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((p(ate) - p(de)) / 86_400_000);
}

/** `YYYY-MM-DD` + n dias. */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Janela do debriefing (decisão 2A do dono, 2026-10-02)
// ---------------------------------------------------------------------------

/** Qual data fechou a janela. `corte` = Story 49.12 (o dia de corte veio antes do fim da regra 2A). */
export type FimDaJanelaPor = "fimCarrinho" | "reabertura.fim" | "downsell.fim" | "corte";

/**
 * Story 49.12 — por que a janela tem um corte:
 * - `lancamento-em-andamento`: a geração parcial (R8-2: ontem em Brasília);
 * - `comparacao-no-mesmo-d-mais-n`: o lançamento de comparação cortado no
 *   mesmo D+N do atual (R8-3).
 */
export type MotivoDoCorte = "lancamento-em-andamento" | "comparacao-no-mesmo-d-mais-n";

/** Story 49.12 — o corte de uma janela: NADA depois de `dia` entra em número nenhum. */
export interface CorteDaJanela {
  /** Último dia (BRT, inclusive) que entra na conta. Entrada do motor, nunca relógio. */
  dia: string;
  motivo: MotivoDoCorte;
  /** O motivo do fim por extenso (AC5): "corte do lançamento em andamento" / "comparação cortada no mesmo D+N". */
  texto: string;
  /** D+N = `dia − inicioCaptacao`, em dias (AC3). */
  dMaisN: number;
  /** O carrinho do principal já tinha aberto até o corte (abertura informada e ≤ `dia`). */
  carrinhoAberto: boolean;
  /**
   * Story 49.14 (AC2) — o estado de cada fase no corte (concluída / em curso /
   * não começou; "não houve" para reabertura/downsell que não existiram).
   * Ausente = janela de antes da 49.14.
   */
  fases?: FasesNoCorte;
  /**
   * Story 49.14 (AC6, R9-5) — todas as fases concluídas até o corte: no
   * lançamento em andamento, a janela termina no fim da regra 2A (os números
   * do relatório final), não no corte.
   */
  todasAsFasesConcluidas?: boolean;
}

// ---------------------------------------------------------------------------
// Story 49.14 — o estado de cada fase no corte (AC2)
// ---------------------------------------------------------------------------

/**
 * AC2 — cada fase (carrinho, reabertura, downsell) no dia de corte:
 * - `concluida`: fim informado e ≤ corte;
 * - `em-curso`: abertura ≤ corte, e fim depois do corte ou "ainda não aconteceu";
 * - `nao-comecou`: "ainda não aconteceu", ou abertura depois do corte;
 * - `nao-houve`: reabertura/downsell respondidos "não houve" (a fase não existe —
 *   ≠ "ainda não aconteceu", 49.12 AC2).
 */
export type EstadoDaFase = "concluida" | "em-curso" | "nao-comecou" | "nao-houve";

export interface FaseNoCorte {
  estado: EstadoDaFase;
  /** `null` = "ainda não aconteceu" (ou "não houve"). */
  abertura: string | null;
  fim: string | null;
}

export interface FasesNoCorte {
  carrinho: FaseNoCorte;
  reabertura: FaseNoCorte;
  downsell: FaseNoCorte;
}

/** A resposta de reabertura/downsell que a janela lê (`null` = "ainda não aconteceu", 49.12). */
export type RespostaDaFase = { houve: false } | { houve: true; abertura: string; fim: string } | null;

/** AC2 — o estado de UMA fase no corte (fronteiras: abertura = corte → em curso; fim = corte → concluída). */
export function estadoDaFase(abertura: string | null, fim: string | null, corte: string): EstadoDaFase {
  if (abertura === null || abertura > corte) return "nao-comecou";
  if (fim !== null && fim <= corte) return "concluida";
  return "em-curso";
}

/** AC2 — as três fases no corte, a partir das datas-chave (encerrado ou em andamento). */
export function fasesNoCorte(
  d: { aberturaCarrinho: string | null; fimCarrinho: string | null; reabertura: RespostaDaFase; downsell: RespostaDaFase },
  corte: string,
): FasesNoCorte {
  const extra = (r: RespostaDaFase): FaseNoCorte =>
    r === null
      ? { estado: "nao-comecou", abertura: null, fim: null }
      : r.houve
        ? { estado: estadoDaFase(r.abertura, r.fim, corte), abertura: r.abertura, fim: r.fim }
        : { estado: "nao-houve", abertura: null, fim: null };
  return {
    carrinho: { estado: estadoDaFase(d.aberturaCarrinho, d.fimCarrinho, corte), abertura: d.aberturaCarrinho, fim: d.fimCarrinho },
    reabertura: extra(d.reabertura),
    downsell: extra(d.downsell),
  };
}

/** AC6 — toda fase terminou até o corte ("não houve" conta como terminada: a fase não existe). */
export function todasConcluidas(f: FasesNoCorte): boolean {
  return [f.carrinho, f.reabertura, f.downsell].every((x) => x.estado === "concluida" || x.estado === "nao-houve");
}

const ORDINAL = (n: number) => `${n}º`;

/**
 * AC5 — em que fase o lançamento estava no corte, por extenso (ex.: "3º dia de
 * carrinho"; "carrinho encerrado · 2º dia de downsell"; "captação — carrinho
 * ainda não abriu"; "todas as fases encerradas").
 */
export function textoDaFaseNoCorte(f: FasesNoCorte, corte: string): string {
  const dia = (x: FaseNoCorte) => ORDINAL(diasEntre(x.abertura as string, corte) + 1);
  if (f.carrinho.estado === "nao-comecou") return "captação — carrinho ainda não abriu";
  if (f.carrinho.estado === "em-curso") return `${dia(f.carrinho)} dia de carrinho`;
  const partes = ["carrinho encerrado"];
  for (const [nome, x] of [["reabertura", f.reabertura], ["downsell", f.downsell]] as const) {
    if (x.estado === "em-curso") partes.push(`${dia(x)} dia de ${nome}`);
    else if (x.estado === "nao-comecou") partes.push(`${nome} ainda não começou`);
  }
  return partes.length === 1 ? "todas as fases encerradas" : partes.join(" · ");
}

export interface JanelaDoDebriefing {
  /** `datasChave.inicioCaptacao` (BRT, inclusive). */
  inicio: string;
  /** O maior entre `fimCarrinho`, `reabertura.fim` e `downsell.fim` (BRT, inclusive) — ou o corte (49.12). */
  fim: string;
  fimPor: FimDaJanelaPor;
  regra: string;
  /** Story 49.12 — só existe quando a geração tem data de corte (parcial ou comparação em D+N). */
  corte?: CorteDaJanela;
}

export const REGRA_DA_JANELA =
  "de inicioCaptacao até o maior entre fimCarrinho, reabertura.fim e downsell.fim (decisão 2A do dono, 2026-10-02) — corta vendas e mídia";

const RE_YMD = /^\d{4}-\d{2}-\d{2}$/;

/** As datas da config da 49.1 que fecham a janela. */
export interface DatasDaJanela {
  inicioCaptacao: string;
  fimCarrinho: string;
  reabertura: { houve: false } | { houve: true; fim: string };
  downsell: { houve: false } | { houve: true; fim: string };
}

/**
 * A janela que corta vendas e mídia do debriefing — UMA regra, usada pelo
 * loader (leitura da mídia) e pelo motor (corte de vendas e mídia): de
 * `inicioCaptacao` até o MAIOR entre o fim do carrinho, o da reabertura e o do
 * downsell (as duas últimas só quando houve). Empate fica com o fim do
 * carrinho. Data fora de `YYYY-MM-DD` ou fim antes do início lança — janela
 * inventada seria número errado sem aviso.
 */
export function janelaDoDebriefing(d: DatasDaJanela): JanelaDoDebriefing {
  let fim = d.fimCarrinho;
  let fimPor: FimDaJanelaPor = "fimCarrinho";
  if (d.reabertura.houve && d.reabertura.fim > fim) {
    fim = d.reabertura.fim;
    fimPor = "reabertura.fim";
  }
  if (d.downsell.houve && d.downsell.fim > fim) {
    fim = d.downsell.fim;
    fimPor = "downsell.fim";
  }
  for (const [campo, v] of [
    ["inicioCaptacao", d.inicioCaptacao],
    [fimPor, fim],
  ] as const) {
    if (!RE_YMD.test(v ?? "")) throw new RangeError(`janelaDoDebriefing: ${campo} não é YYYY-MM-DD: ${String(v)}`);
  }
  if (fim < d.inicioCaptacao) {
    throw new RangeError(`janelaDoDebriefing: fim (${fim}, ${fimPor}) antes de inicioCaptacao (${d.inicioCaptacao})`);
  }
  return { inicio: d.inicioCaptacao, fim, fimPor, regra: REGRA_DA_JANELA };
}

// ---------------------------------------------------------------------------
// Story 49.12 — janela com data de corte (lançamento em andamento / comparação em D+N)
// ---------------------------------------------------------------------------

export const REGRA_DA_JANELA_EM_ANDAMENTO =
  "de inicioCaptacao até a data de corte (ontem em Brasília, R8-2) — corte do lançamento em andamento; corta vendas, leads, pesquisa e mídia (a mesma regra única da decisão 2A, com o fim trocado pelo corte)";
export const REGRA_DA_JANELA_COMPARACAO_EM_D_MAIS_N =
  "de inicioCaptacao até o menor entre o fim da regra 2A e inicioCaptacao + N (o mesmo D+N do lançamento atual, R8-3) — comparação cortada no mesmo D+N; corta vendas, leads, pesquisa e mídia";

const TEXTO_DO_CORTE: Readonly<Record<MotivoDoCorte, string>> = {
  "lancamento-em-andamento": "corte do lançamento em andamento",
  "comparacao-no-mesmo-d-mais-n": "comparação cortada no mesmo D+N",
};

export const REGRA_DA_JANELA_EM_ANDAMENTO_FASES_CONCLUIDAS =
  "de inicioCaptacao até o maior entre fimCarrinho, reabertura.fim e downsell.fim (decisão 2A do dono) — lançamento em andamento com TODAS as fases concluídas até o corte (R9-5): a janela é a do relatório final, não o corte; corta vendas e mídia";

/** Story 49.14 (AC6) — o motivo do fim quando todas as fases terminaram até o corte. */
export const TEXTO_FIM_PELA_REGRA_2A = "fim da regra 2A — todas as fases concluídas até o corte (R9-5)";

/** Reabertura/downsell respondidos no encerrado (a 49.1: sempre com abertura e fim quando houve). */
type RespostaFechada = { houve: false } | { houve: true; abertura: string; fim: string };

/**
 * O que a janela precisa da config (a união da 49.1/49.12): encerrado (as
 * datas da regra 2A, todas presentes) ou em andamento (só o início é certo;
 * `null` = "ainda não aconteceu"). `corte` é ENTRADA — quem orquestra o
 * calcula; o motor nunca lê relógio.
 */
export type ConfigDaJanela =
  | {
      situacaoDoLancamento?: "encerrado";
      datasChave: { inicioCaptacao: string; aberturaCarrinho: string; fimCarrinho: string; reabertura: RespostaFechada; downsell: RespostaFechada };
      corte?: string;
    }
  | {
      situacaoDoLancamento: "em-andamento";
      datasChave: { inicioCaptacao: string; aberturaCarrinho: string | null; fimCarrinho: string | null; reabertura: RespostaDaFase; downsell: RespostaDaFase };
      corte?: string;
    };

function exigirDia(campo: string, v: string | undefined): string {
  if (!RE_YMD.test(v ?? "")) throw new RangeError(`janelaDaGeracao: ${campo} não é YYYY-MM-DD: ${String(v)}`);
  return v as string;
}

/**
 * A janela de UMA geração — a única porta de loaders e motores (49.12):
 * - encerrado sem corte → `janelaDoDebriefing` (a regra 2A), o MESMO objeto
 *   de antes (o encerrado não muda — AC1, AC13 a);
 * - em andamento → `inicioCaptacao` até o corte (AC5); sem corte, lança
 *   (janela inventada seria número errado sem aviso). Story 49.14: o corte
 *   leva o estado de cada fase (AC2); com TODAS as fases concluídas até o
 *   corte, a janela é a da regra 2A — os números do relatório final (AC6, R9-5);
 * - encerrado COM corte (a comparação em D+N, AC8) → o fim é o menor entre o
 *   da regra 2A e o corte; dentro dela, as regras de sempre (decisão 7 inclusa).
 */
export function janelaDaGeracao(c: ConfigDaJanela): JanelaDoDebriefing {
  if (c.situacaoDoLancamento === "em-andamento") {
    const d = c.datasChave;
    const inicio = exigirDia("inicioCaptacao", d.inicioCaptacao);
    if (c.corte === undefined) {
      throw new RangeError("janelaDaGeracao: o modo em andamento exige a data de corte como entrada (ontem em Brasília) — o motor não lê relógio");
    }
    const corte = exigirDia("corte", c.corte);
    if (corte < inicio) throw new RangeError(`janelaDaGeracao: corte (${corte}) antes de inicioCaptacao (${inicio})`);
    const fases = fasesNoCorte(d, corte);
    const todas = todasConcluidas(fases);
    const dadosDoCorte = {
      dia: corte,
      motivo: "lancamento-em-andamento" as const,
      dMaisN: diasEntre(inicio, corte),
      carrinhoAberto: fases.carrinho.estado !== "nao-comecou",
      fases,
      todasAsFasesConcluidas: todas,
    };
    if (todas) {
      // AC6 (R9-5): todas concluídas → a janela da regra 2A (a do final); o corte fica como rótulo.
      const j = janelaDoDebriefing({ inicioCaptacao: inicio, fimCarrinho: d.fimCarrinho as string, reabertura: d.reabertura!, downsell: d.downsell! });
      return { ...j, regra: REGRA_DA_JANELA_EM_ANDAMENTO_FASES_CONCLUIDAS, corte: { ...dadosDoCorte, texto: TEXTO_FIM_PELA_REGRA_2A } };
    }
    return {
      inicio,
      fim: corte,
      fimPor: "corte",
      regra: REGRA_DA_JANELA_EM_ANDAMENTO,
      corte: { ...dadosDoCorte, texto: TEXTO_DO_CORTE["lancamento-em-andamento"] },
    };
  }
  const j = janelaDoDebriefing(c.datasChave);
  if (c.corte === undefined) return j;
  const corte = exigirDia("corte", c.corte);
  if (corte < j.inicio) throw new RangeError(`janelaDaGeracao: corte (${corte}) antes de inicioCaptacao (${j.inicio})`);
  const cortou = corte < j.fim;
  const fases = fasesNoCorte(c.datasChave, corte);
  return {
    inicio: j.inicio,
    fim: cortou ? corte : j.fim,
    fimPor: cortou ? "corte" : j.fimPor,
    regra: REGRA_DA_JANELA_COMPARACAO_EM_D_MAIS_N,
    corte: {
      dia: corte,
      motivo: "comparacao-no-mesmo-d-mais-n",
      texto: TEXTO_DO_CORTE["comparacao-no-mesmo-d-mais-n"],
      dMaisN: diasEntre(j.inicio, corte),
      carrinhoAberto: c.datasChave.aberturaCarrinho <= corte,
      fases,
      todasAsFasesConcluidas: todasConcluidas(fases),
    },
  };
}

/**
 * Até que dia entram leads e respostas da pesquisa (49.12 AC5), ou `null` (sem
 * corte: as de sempre). Story 49.14 (AC6, R9-5): no lançamento em andamento com
 * todas as fases concluídas, nada é cortado além do que o final corta — os
 * números saem iguais aos do relatório final.
 */
export function diaDoCorteDeLeadsEPesquisa(janela: Pick<JanelaDoDebriefing, "corte">): string | null {
  const c = janela.corte;
  if (!c) return null;
  if (c.motivo === "lancamento-em-andamento" && c.todasAsFasesConcluidas === true) return null;
  return c.dia;
}

/**
 * Decisão 7 com o carrinho que ainda não abriu (49.12): abertura `null`
 * ("ainda não aconteceu") = toda venda datada é anterior à abertura.
 */
export function anteriorAAbertura(dia: string, abertura: string | null): boolean {
  return abertura === null || dia < abertura;
}

/** Código da lacuna do que depende do carrinho, quando ele não abriu até o corte (49.12 AC6). */
export const LACUNA_CARRINHO_AINDA_NAO_ABRIU = "CARRINHO_AINDA_NAO_ABRIU" as const;

/** O corte que deixa o carrinho de fora (AC6), ou `null` quando tudo é calculado. */
export function corteSemCarrinho(janela: Pick<JanelaDoDebriefing, "corte">): CorteDaJanela | null {
  return janela.corte && !janela.corte.carrinhoAberto ? janela.corte : null;
}

// ---------------------------------------------------------------------------
// Story 49.14 — carrinho aberto: fases em curso / não começadas (AC2–AC4)
// ---------------------------------------------------------------------------

/** AC3 — a coorte do principal com o carrinho em curso: vendas só até o corte. */
export const LACUNA_COORTE_INCOMPLETA = "COORTE_INCOMPLETA" as const;
/** AC4 — a reabertura não começou até o corte (o carrinho já abriu). */
export const LACUNA_REABERTURA_AINDA_NAO_COMECOU = "REABERTURA_AINDA_NAO_COMECOU" as const;
/** AC4 — o downsell não começou até o corte (o carrinho já abriu). */
export const LACUNA_DOWNSELL_AINDA_NAO_COMECOU = "DOWNSELL_AINDA_NAO_COMECOU" as const;

/**
 * As fases no corte quando o carrinho JÁ abriu (49.14) — `null` sem corte, sem
 * fases (janela anterior à 49.14) ou com o carrinho fechado (aí vale a lacuna
 * do carrinho da 49.12, que já cobre reabertura e downsell).
 */
export function fasesComCarrinhoAberto(janela: Pick<JanelaDoDebriefing, "corte">): { corte: CorteDaJanela; fases: FasesNoCorte } | null {
  const c = janela.corte;
  if (!c || !c.fases || !c.carrinhoAberto) return null;
  return { corte: c, fases: c.fases };
}

const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** AC3/AC4 — "parcial — carrinho aberto, dados até 06/10 (D+6)"; "parcial — downsell em curso, …". */
export function textoDaFaseEmCurso(fase: "carrinho" | "reabertura" | "downsell", corte: Pick<CorteDaJanela, "dia" | "dMaisN">): string {
  const o = fase === "carrinho" ? "carrinho aberto" : `${fase} em curso`;
  return `parcial — ${o}, dados até ${ddmm(corte.dia)} (D+${corte.dMaisN})`;
}

/** AC2/AC4 — "downsell ainda não começou — dados até 06/10, D+6" (a lacuna escrita, nunca zero). */
export function textoDaFaseQueNaoComecou(fase: "reabertura" | "downsell", corte: Pick<CorteDaJanela, "dia" | "dMaisN">): string {
  return `${fase} ainda não começou — dados até ${ddmm(corte.dia)}, D+${corte.dMaisN}`;
}

/** AC3 — "coorte incompleta — vendas do principal até 06/10 (D+6); leads recentes ainda não tiveram tempo de comprar". */
export function textoDaCoorteIncompleta(corte: Pick<CorteDaJanela, "dia" | "dMaisN">): string {
  return `coorte incompleta — vendas do principal até ${ddmm(corte.dia)} (D+${corte.dMaisN}); leads recentes ainda não tiveram tempo de comprar`;
}

/** "carrinho ainda não abriu — dados até 06/10, D+6" (AC6) — a lacuna escrita, nunca zero. */
export function textoDaLacunaDoCarrinho(corte: Pick<CorteDaJanela, "dia" | "dMaisN">): string {
  const [, m, d] = corte.dia.split("-");
  return `carrinho ainda não abriu — dados até ${d}/${m}, D+${corte.dMaisN}`;
}

// ---------------------------------------------------------------------------
// Identidade: e-mail, telefone e chaves anônimas (decisão 11 — sem PII)
// ---------------------------------------------------------------------------

/** E-mail normalizado (`trim` + minúsculas); `""` quando vazio. Mesma regra de `normalizeEmail`. */
export function normalizarEmail(email: string | null | undefined): string {
  return normalizeEmail(email);
}

/**
 * Últimos 8 dígitos do telefone, ou `null` com menos de 8.
 *
 * O sufixo de float (`553175058180.0`, célula numérica exportada como texto)
 * sai ANTES de tirar os não-dígitos — senão o `0` do `.0` vira o último dígito
 * e o telefone não casa (armadilha DG §10.1).
 */
export function normalizarTelefone(telefone: string | number | null | undefined): string | null {
  if (telefone == null) return null;
  const semFloat = String(telefone).trim().replace(/\.0+$/, "");
  const digitos = semFloat.replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-8) : null;
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/**
 * Chave anônima de e-mail: `sha256(e-mail normalizado)` — a mesma de
 * `hashEmail` (`routes/public-sales-rows.ts`), para casar com o cross-launch.
 */
export function hashDeEmail(email: string | null | undefined): string | null {
  const e = normalizarEmail(email);
  return e ? sha256(e) : null;
}

/** Chave anônima de telefone: `sha256("tel:" + últimos 8 dígitos)`. */
export function hashDeTelefone(telefone: string | number | null | undefined): string | null {
  const t = normalizarTelefone(telefone);
  return t ? sha256(`tel:${t}`) : null;
}

/** Identidade de uma linha de venda para chave de comprador. Nunca sai no payload. */
export interface IdentidadeDaLinha {
  emailCru: string | null;
  telefoneCru: string | null;
  /** Escopo da linha sem identificador (vira comprador próprio, como no Resumão). */
  planilhaId: string;
  linha: number;
}

export type CriterioDeUnico = "porEmail" | "porEmailOuTelefone";

/**
 * Chave de comprador de cada linha, nos dois critérios (mesma ordem de `linhas`).
 *
 * - `porEmail`: `e:<sha256 do e-mail>`; linha sem e-mail é um comprador
 *   próprio, `a:<sha256(planilha|linha)>` (o Resumão conta o avulso sem e-mail).
 * - `porEmailOuTelefone`: união por QUALQUER das chaves (e-mail ou últimos 8
 *   dígitos), como `dedupKeys` documenta em `lead-origin.ts`; a chave do grupo
 *   é a menor (ordem lexicográfica) entre as chaves do grupo — determinística.
 *
 * Todas são hashes: nenhum e-mail ou telefone cru sai daqui.
 */
export function chavesDeComprador(linhas: readonly IdentidadeDaLinha[]): {
  porEmail: string[];
  porEmailOuTelefone: string[];
} {
  const anonima = (l: IdentidadeDaLinha) => `a:${sha256(`${l.planilhaId}|${l.linha}`)}`;
  const porEmail = linhas.map((l) => {
    const h = hashDeEmail(l.emailCru);
    return h ? `e:${h}` : anonima(l);
  });

  // União (union-find) sobre os nós `e:`/`t:`/`a:` de cada linha.
  const pai = new Map<string, string>();
  const achar = (x: string): string => {
    let r = x;
    while (pai.get(r) !== r) r = pai.get(r)!;
    let y = x;
    while (pai.get(y) !== r) {
      const prox = pai.get(y)!;
      pai.set(y, r);
      y = prox;
    }
    return r;
  };
  const unir = (a: string, b: string) => {
    const ra = achar(a);
    const rb = achar(b);
    if (ra === rb) return;
    // A raiz é sempre a menor chave — é ela que vira a chave do grupo.
    if (ra < rb) pai.set(rb, ra);
    else pai.set(ra, rb);
  };
  const nosDaLinha = linhas.map((l) => {
    const nos: string[] = [];
    const e = hashDeEmail(l.emailCru);
    if (e) nos.push(`e:${e}`);
    const t = hashDeTelefone(l.telefoneCru);
    if (t) nos.push(`t:${t}`);
    if (nos.length === 0) nos.push(anonima(l));
    for (const n of nos) if (!pai.has(n)) pai.set(n, n);
    for (let i = 1; i < nos.length; i++) unir(nos[0]!, nos[i]!);
    return nos;
  });
  const porEmailOuTelefone = nosDaLinha.map((nos) => achar(nos[0]!));
  return { porEmail, porEmailOuTelefone };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface ExcluidasPorStatus {
  refunded: number;
  chargeback: number;
  /** Recusada, pendente, aguardando pagamento — não é receita nem reembolso. */
  other: number;
  /** Linha paga cuja transação tem reembolso na mesma planilha (sai inteira). */
  pareadaComReembolso: number;
}

/**
 * Só `paid` segue (`isRevenueBucket(classifyRefundStatus(...))`). Planilha sem
 * coluna de status: tudo é `paid` (comportamento legado de `classifyRefundStatus`).
 *
 * Transação reembolsada sai inteira: a linha paga com o MESMO ID da venda de
 * uma linha reembolsada/chargeback na mesma planilha também sai — mesma regra
 * do loader do Resumão (`launch-report-loader.ts`, passe 1), que é o número
 * governante (decisão 1 do dono).
 */
export function filtrarPorStatus<T>(
  linhas: readonly T[],
  acesso: {
    planilhaId: (l: T) => string;
    statusCru: (l: T) => string | null;
    idDaVenda: (l: T) => string | null;
    temColunaStatus: (planilhaId: string) => boolean;
  },
): { pagas: T[]; excluidasPorStatus: ExcluidasPorStatus } {
  const excluidas: ExcluidasPorStatus = { refunded: 0, chargeback: 0, other: 0, pareadaComReembolso: 0 };
  const bucket = (l: T) => classifyRefundStatus(acesso.statusCru(l), acesso.temColunaStatus(acesso.planilhaId(l)));

  const reembolsadas = new Set<string>();
  for (const l of linhas) {
    const id = (acesso.idDaVenda(l) ?? "").trim();
    if (id && isRefundBucket(bucket(l))) reembolsadas.add(`${acesso.planilhaId(l)}\u0000${id}`);
  }

  const pagas: T[] = [];
  for (const l of linhas) {
    const b = bucket(l);
    if (!isRevenueBucket(b)) {
      if (b === "refunded" || b === "chargeback" || b === "other") excluidas[b] += 1;
      continue;
    }
    const id = (acesso.idDaVenda(l) ?? "").trim();
    if (id && reembolsadas.has(`${acesso.planilhaId(l)}\u0000${id}`)) {
      excluidas.pareadaComReembolso += 1;
      continue;
    }
    pagas.push(l);
  }
  return { pagas, excluidasPorStatus: excluidas };
}

// ---------------------------------------------------------------------------
// Dedup em duas camadas (armadilha #1)
// ---------------------------------------------------------------------------

export interface ContagemDedup {
  antes: number;
  depois: number;
  removidas: number;
}

export interface DedupPorIdNaoAplicada {
  planilhaId: string;
  planilha: string;
  /** O que falta mapeado (ou aponta para cabeçalho inexistente) na planilha. */
  faltando: ("transactionId" | "productName")[];
}

export interface PlanilhaParaDedup {
  planilhaId: string;
  nome: string;
  /** `mapping.transactionId` aponta para uma coluna que existe. */
  temColunaId: boolean;
  /** `mapping.productName` aponta para uma coluna que existe. */
  temColunaProduto: boolean;
  /**
   * A camada 2 age nas linhas desta planilha — `camada2ValeNaEtapa` do tipo da
   * etapa dela (Story 41.12, R7-4/R7-5: só captação, fora o evento presencial).
   * `false` = as linhas não colapsam nem ocupam a vaga, como no painel e no
   * Resumão da mesma etapa.
   */
  camada2Vale: boolean;
}

export interface ResultadoDedupVendas<T> {
  mantidas: T[];
  removidasCamada1: T[];
  removidasCamada2: T[];
  camada1: ContagemDedup;
  camada2: ContagemDedup;
  /** Planilhas em que a camada 1 não rodou (lacuna `DEDUP_POR_ID_NAO_APLICADA`). */
  dedupNaoAplicada: DedupPorIdNaoAplicada[];
}

/**
 * Camada 1 — `(ID da venda, produto)` POR PLANILHA, chamando
 * `deduplicarPorIdDaVenda` da 41.10 (a chave não é redefinida aqui). O "ID da
 * venda" é a célula da coluna `mapping.transactionId`. Planilha sem a coluna de
 * ID ou de produto não passa por ela (política de quem chama, fixada na 41.10):
 * `removidas = 0` ali e a planilha volta em `dedupNaoAplicada`.
 *
 * Camada 2 — `(e-mail normalizado, produto normalizado)` sobre todas as
 * planilhas (passo 2 da skill: um e-mail não compra 2× o mesmo produto), pela
 * função única `deduplicarPorPessoaEProduto` (Story 41.12 — a chave não é
 * redefinida aqui; o Resumão, os painéis e a réplica diária chamam a mesma). Produtos
 * distintos do mesmo e-mail (ingresso + combo + bump) não colapsam; linha sem
 * e-mail nunca colapsa. Pega a dobra `PURCHASE_APPROVED` + `PURCHASE_COMPLETE`
 * (perfil DG §10.3), que tem IDs diferentes.
 *
 * A camada 2 só age nas planilhas com `camada2Vale` (escopo por tipo de etapa,
 * R7-4/R7-5 — o mesmo ponto único dos painéis e do Resumão).
 *
 * Nas duas, sobrevive a PRIMEIRA ocorrência; a ordem de `linhas` é preservada.
 */
export function deduplicarVendas<T>(
  linhas: readonly T[],
  acesso: {
    planilhaId: (l: T) => string;
    idDaVenda: (l: T) => string | null;
    produto: (l: T) => string | null;
    emailCru: (l: T) => string | null;
  },
  planilhas: ReadonlyMap<string, PlanilhaParaDedup>,
): ResultadoDedupVendas<T> {
  // ---- Camada 1 ----
  const porPlanilha = new Map<string, T[]>();
  for (const l of linhas) {
    const id = acesso.planilhaId(l);
    const lista = porPlanilha.get(id);
    if (lista) lista.push(l);
    else porPlanilha.set(id, [l]);
  }
  const removidas1 = new Set<T>();
  const dedupNaoAplicada: DedupPorIdNaoAplicada[] = [];
  for (const [planilhaId, daPlanilha] of porPlanilha) {
    const p = planilhas.get(planilhaId);
    const faltando: DedupPorIdNaoAplicada["faltando"] = [];
    if (!p?.temColunaId) faltando.push("transactionId");
    if (!p?.temColunaProduto) faltando.push("productName");
    if (faltando.length > 0) {
      dedupNaoAplicada.push({ planilhaId, planilha: p?.nome ?? planilhaId, faltando });
      continue;
    }
    const { removidas } = deduplicarPorIdDaVenda(daPlanilha, (l) => ({
      idDaVenda: acesso.idDaVenda(l),
      produto: acesso.produto(l),
    }));
    for (const r of removidas) removidas1.add(r);
  }
  const depois1 = linhas.filter((l) => !removidas1.has(l));
  const removidasCamada1 = linhas.filter((l) => removidas1.has(l));

  // ---- Camada 2 ---- (Story 41.12: a chave mora em `utils/dedup-pessoa-produto.ts`)
  // Só as linhas de planilha cuja etapa está no escopo (`camada2Vale`) disputam
  // a vaga; as demais passam inteiras e na mesma posição.
  const noEscopo = depois1.filter((l) => planilhas.get(acesso.planilhaId(l))?.camada2Vale === true);
  const { removidas: removidasCamada2 } = deduplicarPorPessoaEProduto(noEscopo, (l) => ({
    email: acesso.emailCru(l),
    produto: acesso.produto(l),
  }));
  const saem2 = new Set<T>(removidasCamada2);
  const mantidas = depois1.filter((l) => !saem2.has(l));

  return {
    mantidas,
    removidasCamada1,
    removidasCamada2,
    camada1: { antes: linhas.length, depois: depois1.length, removidas: removidasCamada1.length },
    camada2: { antes: depois1.length, depois: mantidas.length, removidas: removidasCamada2.length },
    dedupNaoAplicada,
  };
}

// ---------------------------------------------------------------------------
// TMB
// ---------------------------------------------------------------------------

/**
 * Subtype da planilha que marca TMB (`public-sales-rows.ts`: `plataforma =
 * sheet.subtype`). É o ÚNICO lugar onde "tmb" é decidido no Debriefing.
 */
export const PLATAFORMA_TMB = "tmb";

/** TMB conta a venda e tem o valor excluído de todo faturamento e ticket. */
export function ehTmb(plataforma: string | null | undefined): boolean {
  return (plataforma ?? "").trim().toLowerCase() === PLATAFORMA_TMB;
}

/**
 * O texto de sinalização que acompanha toda métrica afetada por TMB. Inteiros
 * em pt-BR ("2.293 vendas"): o texto vai pronto para o payload e o documento o
 * repassa (QA 49.6 FMT-496-1 — o PG02 real saía "2293 vendas").
 */
export function textoTmb(vendas: number, viaTmb: number): string {
  return `${inteiroBr(vendas)} vendas, ${inteiroBr(viaTmb)} via TMB (valor não considerado)`;
}

// ---------------------------------------------------------------------------
// Vendas manuais (decisão 3A do dono, 2026-10-02)
// ---------------------------------------------------------------------------

/**
 * Plataforma das vendas lançadas à mão (`manual_sales`). É o mesmo rótulo que
 * `sales-daily-sync.ts` dá a elas (`plataforma: "manual"`). O loader as entrega
 * como uma "planilha" a mais da etapa, com esta plataforma; o motor marca a
 * origem `fonte: "manual"` na auditoria a partir daqui.
 */
export const PLATAFORMA_MANUAL = "manual";

export function ehManual(plataforma: string | null | undefined): boolean {
  return (plataforma ?? "").trim().toLowerCase() === PLATAFORMA_MANUAL;
}

/** De onde veio a linha de venda — para a auditoria (3A). */
export type FonteDaVenda = "planilha" | "manual";

// ---------------------------------------------------------------------------
// UTM em array do Postgres (regra 9 de higiene da skill: `{"qr","qr"}` → `qr`)
// ---------------------------------------------------------------------------

/**
 * Como a célula de UTM foi lida:
 * - `texto`: célula comum (ou que só parece array e não é), devolvida aparada;
 * - `array`: array do Postgres cujos elementos não vazios são TODOS iguais —
 *   desembrulhado para esse valor (ou `null` se não sobrou nenhum);
 * - `array-ambiguo`: array com valores DISTINTOS — fica como o texto cru.
 */
export type FormatoDaUtm = "texto" | "array" | "array-ambiguo";

export interface UtmDesembrulhada {
  valor: string | null;
  formato: FormatoDaUtm;
}

/** `{{ad.id}}` — macro do Meta não resolvida; não é array (fica como texto). */
const MACRO_DO_META = /^\{\{.*\}\}$/;

/**
 * Elementos de um literal de array do Postgres (`{"a","b"}`, `{a,b}`, `{a}`,
 * `{"a \"b\"",NULL}`), ou `null` quando o texto não tem essa forma (JSON com
 * `:`, chaves desbalanceadas, aspas abertas). `NULL` sem aspas vira `""`.
 */
function elementosDoArrayPostgres(texto: string): string[] | null {
  if (!texto.startsWith("{") || !texto.endsWith("}") || MACRO_DO_META.test(texto)) return null;
  const corpo = texto.slice(1, -1);
  if (corpo.trim() === "") return [];
  const elementos: string[] = [];
  let i = 0;
  while (i <= corpo.length) {
    while (corpo[i] === " ") i++;
    let el = "";
    if (corpo[i] === '"') {
      i++;
      let fechou = false;
      while (i < corpo.length) {
        const ch = corpo[i]!;
        if (ch === "\\" && i + 1 < corpo.length) {
          el += corpo[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          fechou = true;
          i++;
          break;
        }
        el += ch;
        i++;
      }
      if (!fechou) return null;
      while (corpo[i] === " ") i++;
    } else {
      const ini = i;
      while (i < corpo.length && corpo[i] !== ",") {
        if (corpo[i] === '"' || corpo[i] === "{" || corpo[i] === "}" || corpo[i] === ":") return null;
        i++;
      }
      el = corpo.slice(ini, i).trim();
      if (el.toUpperCase() === "NULL") el = "";
    }
    elementos.push(el);
    if (i >= corpo.length) break;
    if (corpo[i] !== ",") return null;
    i++;
  }
  return elementos;
}

/**
 * Uma célula de UTM (source/medium/campaign/term) depois da regra 9 de higiene
 * da skill (`config/coding-standards.md`; `insights-recorrentes.md`: "UTMs em
 * array `{"x","x"}` (webhook n8n/Postgres) precisam de unwrap antes de
 * classificar"). Pura, nunca lança.
 *
 * | célula | valor | formato |
 * |---|---|---|
 * | `qr` / ` qr ` | `qr` | texto |
 * | `{"qr"}` / `{"qr","qr"}` / `{qr,qr,qr}` | `qr` | array |
 * | `{"qr",""}` / `{qr,NULL}` | `qr` | array |
 * | `{}` / `{"",""}` | `null` | array |
 * | `{"fb","ig"}` (valores distintos) | o texto cru | array-ambiguo |
 * | `{"co":"123"}` (JSON), `{{ad.id}}` (macro), `{qr` | o texto cru | texto |
 * | vazio / nulo | `null` | texto |
 *
 * Valores DISTINTOS ficam como o texto cru — mesma regra de
 * `utmContentEfetivo` (`shared/src/utm-value.ts`, Story 18.71): escolher um
 * deles seria inventar atribuição. A linha fica visível como o dado estranho
 * que é (o classificador a põe em "Outros orgânicos") e o motor a conta em
 * `higiene.utmsEmArray.ambiguas`.
 */
export function desembrulharUtm(celula: string | null | undefined): UtmDesembrulhada {
  const texto = (celula ?? "").trim();
  if (!texto) return { valor: null, formato: "texto" };
  const elementos = elementosDoArrayPostgres(texto);
  if (elementos === null) return { valor: texto, formato: "texto" };
  const distintos = [...new Set(elementos.map((e) => e.trim()).filter((e) => e !== ""))];
  if (distintos.length === 0) return { valor: null, formato: "array" };
  if (distintos.length === 1) return { valor: distintos[0]!, formato: "array" };
  return { valor: texto, formato: "array-ambiguo" };
}
