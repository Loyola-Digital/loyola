/**
 * Story 49.17 — o "Resumo macro" do topo do Debriefing (R11-0e), no método da
 * skill `leitura-parcial-lancamento.md` ("Formato da resposta"): tabela de
 * paridade (atual × comparação principal, no mesmo D+N na parcial), maiores
 * diferenças, limitações e pendências de confirmação. Vale para a parcial e
 * para o final (R11-0g). Sem projeção do fechamento (R11-0h).
 *
 * **Puro:** só lê os dois payloads (os números já saíram dos motores — CAC,
 * leads e curva são do Motor I). Os únicos números que nascem aqui são o Δ
 * (absoluto e relativo), como no render. A AÇÃO de cada diferença é texto de IA
 * e fica com a 49.7 (AC9c): até lá, `acao = null` com o rótulo "sem leitura de
 * IA" — nenhuma ação escrita por regra fixa (AC7).
 *
 * A curva acumulada (AC6) NÃO é copiada para cá: cada lado a tem em
 * `dinheiroTempo.curvaAcumulada`; o render alinha os dois pelo D+x.
 */

import type { DebriefingPayload } from "./debriefing-payload.js";
import type { FaseQuePodeNaoTerAcontecido } from "./debriefing-config.js";
import type { AlertaFase12 } from "./debriefing-guards.js";
import { LACUNA_LEADS_UNICOS_SEM_FONTE } from "./debriefing-money-time-engine.js";
import type { DimensaoDePublico, TabelaDaDimensao } from "./debriefing-audience-engine.js";
import { variacaoPct } from "./launch-report-narrative.js";
import { SURVEY_CANONICAL_FIELDS } from "../db/schema.js";

export type ChaveDaParidade =
  | "compradores"
  | "faturamento"
  | "ticket"
  | "tierSuperior"
  | "investimento"
  | "cac"
  | "roasCaptacao"
  | "leads"
  | "taxaLeadComprador"
  | "cpm";

export type UnidadeDaParidade = "inteiro" | "moeda" | "fracao" | "roas";

export interface ValorDaParidade {
  valor: number | null;
  motivo?: string;
}

export interface DeltaDaParidade {
  /** Atual − comparação, na unidade da linha (fração para taxa: o render mostra em pp). */
  absoluto: number;
  /** (atual ÷ comparação − 1) × 100; `null` quando a comparação é 0. */
  relativoPct: number | null;
}

export interface LinhaDaParidade {
  chave: ChaveDaParidade;
  rotulo: string;
  unidade: UnidadeDaParidade;
  /** Custo: subir é piorar (CAC, CPM). */
  menorEhMelhor?: boolean;
  /** Sem avaliação boa/ruim (investimento). */
  neutro?: boolean;
  atual: ValorDaParidade;
  /** `null` = sem comparação (edição única ou parcial sem Δ). */
  comparacao: ValorDaParidade | null;
  /** `null` quando falta o número de um dos lados — nunca Δ inventado (AC2). */
  delta: DeltaDaParidade | null;
  /** O "—" explicado: de que lado falta o número e por quê. */
  notaSemDelta?: string;
}

/** AC7 — uma das maiores diferenças relativas da tabela. A ação é da IA (49.7 AC9c). */
export interface DiferencaDoResumo {
  posicao: number;
  chave: ChaveDaParidade;
  rotulo: string;
  unidade: UnidadeDaParidade;
  atual: number;
  comparacao: number;
  delta: DeltaDaParidade;
  /** Preenchida pela 49.7 (AC9c). Até lá, sempre `null`. */
  acao: null;
  rotuloDaAcao: typeof SEM_LEITURA_DE_IA;
}

export interface ResumoMacro {
  versao: 1;
  /** A comparação principal (o 1º da lista efetiva), ou `null`. */
  comparacao: {
    funnelId: string;
    nome: string;
    origem: "recalculada" | "payload-salvo";
    /** O corte da comparação no mesmo D+N (parcial), ou `null`. */
    corte: { dia: string; dMaisN: number } | null;
  } | null;
  /** 49.12 (AC8) — parcial cuja comparação só tem relatório salvo: sem Δ. */
  semDelta: { funnelId: string; nome: string; motivo: string } | null;
  paridade: LinhaDaParidade[];
  maioresDiferencas: DiferencaDoResumo[];
  /** AC8 — lacunas e alertas que afetam a tabela, uma linha cada. */
  limitacoes: string[];
  /** AC8 — "ainda não aconteceu" da config e perguntas de pesquisa sem confirmação. */
  pendencias: string[];
  /**
   * Story 49.20 (AC2, R11-2) — a pesquisa por pergunta, atual × comparação
   * principal, com a cobertura de cada lado. Vai no bloco do resumo (parcial e
   * final) e na seção Qualificação SÓ da parcial. Ausente = payload anterior à
   * 49.20 (aditivo; a versão não sobe).
   */
  pesquisaPorPergunta?: PesquisaPorPergunta;
}

// ---------------------------------------------------------------------------
// Story 49.20 — pesquisa por pergunta, atual × comparação (AC2, R11-2)
// ---------------------------------------------------------------------------

/** [AUTO-DECISION] Respostas por pergunta na tabela — o mesmo teto da Qualificação (resposta livre tem centenas de valores). */
export const MAX_RESPOSTAS_POR_PERGUNTA = 12;

/** Uma resposta num lado: n e % dos respondentes daquele lançamento (percentual, 0–100). */
export interface LadoDaResposta {
  n: number;
  pct: number | null;
}

export interface LinhaDaPergunta {
  /** A grafia do lançamento atual (a da comparação quando a resposta só existe lá). */
  rotulo: string;
  /** `null` = ninguém deu esta resposta neste lado (ou a grafia é outra) — "—", nunca 0 inventado. */
  atual: LadoDaResposta | null;
  comparacao: LadoDaResposta | null;
}

export type PresencaDaPergunta = "nos-dois" | "so-atual" | "so-comparacao";

export interface PerguntaComparada {
  campo: string;
  rotulo: string;
  presenca: PresencaDaPergunta;
  /** Respondentes do lado (pesquisa inteira deduplicada); `null` = a pergunta não existe deste lado. */
  nAtual: number | null;
  nComparacao: number | null;
  /** Até `MAX_RESPOSTAS_POR_PERGUNTA` respostas (faixa A→D; as demais pela maior % entre os dois lados). */
  linhas: LinhaDaPergunta[];
  semResposta: { atual: LadoDaResposta | null; comparacao: LadoDaResposta | null };
  /** Respostas distintas que ficaram fora da tabela (além do teto). */
  respostasForaDaTabela: number;
  /** Pergunta de um lado só: de que lado falta e por quê. */
  nota?: string;
}

/** Cobertura = compradores de captação casados com um respondente ÷ compradores (`publico.taxaDeResposta`). */
export interface CoberturaDaPesquisa {
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
  motivo?: string;
}

export interface PesquisaPorPergunta {
  cobertura: { atual: CoberturaDaPesquisa; comparacao: CoberturaDaPesquisa | null };
  /** Perguntas confirmadas de pelo menos um lado; vazio sem comparação. */
  perguntas: PerguntaComparada[];
  /** Faixa/score que a planilha não calculou: lacuna escrita, nunca reconstruída. */
  lacunasDeFaixa: string[];
  /** Sem comparação principal (edição única, ou parcial cuja comparação só tem relatório salvo): o motivo. */
  semComparacao?: string;
}

const ORDEM_DOS_CAMPOS: readonly string[] = ["faixa", ...SURVEY_CANONICAL_FIELDS.filter((c) => c !== "faixa")];

/** A mesma normalização das respostas do Motor II (`normalizarResposta`): minúsculas, sem acento, espaços colapsados. */
function chaveDaResposta(raw: string): string {
  return raw.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function coberturaDe(pp: DebriefingPayload): CoberturaDaPesquisa {
  const t = pp.publico.taxaDeResposta;
  return { valor: t.valor, numerador: t.numerador ?? null, denominador: t.denominador ?? null, ...(t.motivo ? { motivo: t.motivo } : {}) };
}

/** Por que a pergunta não está num lado: o motivo da dimensão (ou da faixa) daquele payload. */
function motivoDaAusencia(pp: DebriefingPayload, campo: string): string {
  const nc = pp.publico.dimensoesNaoConfirmadas.find((d) => d.campo === campo);
  if (campo === "faixa" && !pp.publico.faixa.aplicavel && pp.publico.faixa.motivo) return `faixa não calculada (${pp.publico.faixa.motivo})`;
  if (nc) return MOTIVO_DA_DIMENSAO[nc.motivo] ?? nc.motivo;
  if (pp.publico.pesquisa.linhasLidas === 0 && pp.publico.dimensoes.length === 0) return "sem pesquisa conectada";
  return "pergunta não confirmada na configuração";
}

function ladoDe(t: TabelaDaDimensao | null, chave: string): LadoDaResposta | null {
  const v = t?.valores.find((x) => chaveDaResposta(x.rotulo) === chave);
  return v ? { n: v.n, pct: v.pct.valor } : null;
}

/**
 * AC2 — puro. Uma pergunta confirmada que existe nos dois lançamentos sai lado a
 * lado (% dos respondentes de cada um, a tabela `total` do Motor II); a que só
 * existe de um lado sai só desse lado, com a nota. Faixa que a planilha não
 * calculou vira lacuna — o motor não tem score para reconstruir e aqui não se
 * inventa. Nenhum número novo: os n e % são os de `publico.dimensoes`.
 */
export function montarPesquisaPorPergunta(e: Pick<EntradaDoResumoMacro, "payload" | "nomeAtual" | "comparacao" | "comparacaoSemDelta">): PesquisaPorPergunta {
  const p = e.payload;
  const comp = e.comparacao;
  const lacunaDaFaixa = (pp: DebriefingPayload, nome: string): string[] =>
    pp.publico.faixa.aplicavel
      ? []
      : [`${nome}: faixa (lead score) não calculada pela planilha — ${pp.publico.faixa.motivo ?? "sem pergunta de faixa"}; lacuna, não reconstruída.`];
  if (!comp) {
    return {
      cobertura: { atual: coberturaDe(p), comparacao: null },
      perguntas: [],
      lacunasDeFaixa: lacunaDaFaixa(p, e.nomeAtual),
      semComparacao: e.comparacaoSemDelta
        ? `a comparação ${e.comparacaoSemDelta.nome} só tem relatório salvo (totais fechados), que não pode ser cortado no mesmo D+N desta parcial`
        : "edição única — sem lançamento de comparação na configuração",
    };
  }
  const cp = comp.payload;
  const dimA = new Map(p.publico.dimensoes.map((d) => [d.campo as string, d]));
  const dimC = new Map(cp.publico.dimensoes.map((d) => [d.campo as string, d]));
  const campos = [...new Set([...dimA.keys(), ...dimC.keys()])].sort((a, b) => {
    const ia = ORDEM_DOS_CAMPOS.indexOf(a);
    const ib = ORDEM_DOS_CAMPOS.indexOf(b);
    return (ia < 0 ? ORDEM_DOS_CAMPOS.length : ia) - (ib < 0 ? ORDEM_DOS_CAMPOS.length : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  const perguntas: PerguntaComparada[] = campos.map((campo) => {
    const a: DimensaoDePublico | undefined = dimA.get(campo);
    const c: DimensaoDePublico | undefined = dimC.get(campo);
    const presenca: PresencaDaPergunta = a && c ? "nos-dois" : a ? "so-atual" : "so-comparacao";
    const ta = a?.total ?? null;
    const tc = c?.total ?? null;
    // A união das respostas, alinhadas pela grafia normalizada.
    const rotuloPorChave = new Map<string, string>();
    for (const v of [...(ta?.valores ?? []), ...(tc?.valores ?? [])]) {
      const k = chaveDaResposta(v.rotulo);
      if (!rotuloPorChave.has(k)) rotuloPorChave.set(k, v.rotulo);
    }
    const todas: LinhaDaPergunta[] = [...rotuloPorChave.entries()].map(([k, rotulo]) => ({ rotulo, atual: ladoDe(ta, k), comparacao: ladoDe(tc, k) }));
    const maior = (l: LinhaDaPergunta) => Math.max(l.atual?.pct ?? -1, l.comparacao?.pct ?? -1);
    const ordenadas =
      campo === "faixa"
        ? todas.sort((x, y) => (x.rotulo < y.rotulo ? -1 : x.rotulo > y.rotulo ? 1 : 0))
        : todas.sort((x, y) => maior(y) - maior(x) || (x.rotulo < y.rotulo ? -1 : x.rotulo > y.rotulo ? 1 : 0));
    const linhas = ordenadas.slice(0, MAX_RESPOSTAS_POR_PERGUNTA);
    const semResp = (t: TabelaDaDimensao | null): LadoDaResposta | null => (t ? { n: t.semResposta.n, pct: t.semResposta.pct.valor } : null);
    const nota =
      presenca === "so-atual"
        ? `Só em ${e.nomeAtual}: em ${comp.nome}, ${motivoDaAusencia(cp, campo)}.`
        : presenca === "so-comparacao"
          ? `Só em ${comp.nome}: em ${e.nomeAtual}, ${motivoDaAusencia(p, campo)}.`
          : undefined;
    return {
      campo,
      rotulo: ROTULO_DO_CAMPO[campo] ?? campo,
      presenca,
      nAtual: ta ? ta.n : null,
      nComparacao: tc ? tc.n : null,
      linhas,
      semResposta: { atual: semResp(ta), comparacao: semResp(tc) },
      respostasForaDaTabela: ordenadas.length - linhas.length,
      ...(nota ? { nota } : {}),
    };
  });
  return {
    cobertura: { atual: coberturaDe(p), comparacao: coberturaDe(cp) },
    perguntas,
    lacunasDeFaixa: [...lacunaDaFaixa(cp, comp.nome), ...lacunaDaFaixa(p, e.nomeAtual)],
  };
}

/** AC7 — rótulo do item sem a ação da IA (até a 49.7). */
export const SEM_LEITURA_DE_IA = "sem leitura de IA" as const;

/** [AUTO-DECISION] Quantas diferenças o bloco lista (as maiores diferenças relativas). */
export const MAX_MAIORES_DIFERENCAS = 5;

const ROTULO_DA_FASE: Readonly<Record<FaseQuePodeNaoTerAcontecido, string>> = {
  aberturaCarrinho: "Abertura do carrinho",
  fimCarrinho: "Fim do carrinho",
  reabertura: "Reabertura",
  downsell: "Downsell",
  fimReabertura: "Fim da reabertura",
  fimDownsell: "Fim do downsell",
};

const ROTULO_DO_CAMPO: Readonly<Record<string, string>> = {
  faixa: "faixa (lead score)",
  idade: "idade",
  sexo: "sexo",
  estado_civil: "estado civil",
  escolaridade: "escolaridade",
  renda: "renda",
  profissao: "profissão",
  setor: "setor",
  funcionarios: "funcionários",
  religiao: "religião",
};

const MOTIVO_DA_DIMENSAO: Readonly<Record<string, string>> = {
  "nao-confirmada": "pergunta não confirmada na configuração",
  "ausente-na-pesquisa": "a pergunta não existe na pesquisa",
  "coluna-100pct-vazia": "a coluna da pergunta está vazia",
};

/**
 * As lacunas do payload que mexem em linhas da tabela de paridade (AC8), com
 * as linhas afetadas. `LEADS_DO_PAINEL` não entra: é o "# Leads" oficial do
 * Debriefing diário, outra contagem (49.17 AC4).
 */
export const LACUNAS_QUE_AFETAM_A_PARIDADE: Readonly<Record<string, string>> = {
  PRECO_ORIGINAL_NAO_MAPEADO: "faturamento, ticket e ROAS",
  DEDUP_POR_ID_NAO_APLICADA: "compradores, faturamento, ticket, CAC e ROAS",
  FONTE_EM_MAIS_DE_UMA_ETAPA: "compradores e faturamento",
  [LACUNA_LEADS_UNICOS_SEM_FONTE]: "leads únicos e taxa lead → comprador",
};

/**
 * QA 49.17 REQ-002 — as pendências do Motor I que tiram venda ou mídia da conta
 * da captação (ou deixam venda fora de ingresso/combo/order bump).
 */
export const PENDENCIAS_QUE_AFETAM_A_PARIDADE: Readonly<Record<string, string>> = {
  MIDIA_DE_ETAPA_FORA_DA_CONFIG: "investimento, CAC, ROAS e CPM",
  VENDA_DE_ETAPA_FORA_DA_CONFIG: "compradores, faturamento, ticket, CAC e ROAS",
  TIPO_INESPERADO_NA_CAPTACAO: "faturamento da captação e ticket",
};

/** Os alertas das guardas que afetam a tabela (o WF3 é a mesma coisa que a lacuna de preço). */
const ALERTAS_QUE_AFETAM_A_PARIDADE: Readonly<Record<string, string>> = {
  WF2: "faturamento e ticket",
};

const PAYLOAD_ANTERIOR = "o payload é anterior à Story 49.17 (sem este número)";

const m = (x: { valor: number | null; motivo?: string } | null | undefined): ValorDaParidade => ({
  valor: x?.valor ?? null,
  ...(x?.motivo ? { motivo: x.motivo } : {}),
});

interface DefinicaoDaLinha {
  chave: ChaveDaParidade;
  rotulo: string;
  unidade: UnidadeDaParidade;
  menorEhMelhor?: boolean;
  neutro?: boolean;
  ler: (p: DebriefingPayload) => ValorDaParidade;
}

/**
 * AC2 — as linhas da tabela, na ordem do método (compradores · faturamento ·
 * ticket · tier superior · investimento · CAC · ROAS · leads · CPM), com a
 * taxa lead → comprador (AC4) logo depois dos leads. Investimento, CAC, ROAS e
 * CPM são da CAPTAÇÃO — a mesma base (o CAC divide o investimento do ROAS de
 * captação, decisão do @po no AC3).
 */
export const LINHAS_DA_PARIDADE: readonly DefinicaoDaLinha[] = [
  {
    chave: "compradores",
    rotulo: "Compradores de captação (únicos)",
    unidade: "inteiro",
    ler: (p) =>
      p.dinheiroTempo.captacao.aplicavel
        ? { valor: p.dinheiroTempo.ingressosUnicos }
        : { valor: null, ...(p.dinheiroTempo.captacao.motivo ? { motivo: p.dinheiroTempo.captacao.motivo } : {}) },
  },
  { chave: "faturamento", rotulo: "Faturamento da captação s/ TMB", unidade: "moeda", ler: (p) => m(p.dinheiroTempo.captacao.faturamentoCaptacao) },
  { chave: "ticket", rotulo: "Ticket médio da captação", unidade: "moeda", ler: (p) => m(p.dinheiroTempo.captacao.ticketCaptacao) },
  { chave: "tierSuperior", rotulo: "Tier superior (% c/ combo ou order bump)", unidade: "fracao", ler: (p) => m(p.dinheiroTempo.captacao.comTierSuperior) },
  {
    chave: "investimento",
    rotulo: "Investimento de captação (c/ imposto)",
    unidade: "moeda",
    neutro: true,
    menorEhMelhor: true,
    ler: (p) => ({ valor: p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto }),
  },
  {
    chave: "cac",
    rotulo: "CAC (investimento ÷ compradores)",
    unidade: "moeda",
    menorEhMelhor: true,
    ler: (p) => (p.dinheiroTempo.cac ? m(p.dinheiroTempo.cac) : { valor: null, motivo: PAYLOAD_ANTERIOR }),
  },
  { chave: "roasCaptacao", rotulo: "ROAS de captação", unidade: "roas", ler: (p) => m(p.dinheiroTempo.roasCaptacao) },
  {
    chave: "leads",
    rotulo: "Leads únicos",
    unidade: "inteiro",
    ler: (p) => (p.dinheiroTempo.leads ? m(p.dinheiroTempo.leads.unicos) : { valor: null, motivo: PAYLOAD_ANTERIOR }),
  },
  {
    chave: "taxaLeadComprador",
    rotulo: "Taxa lead → comprador",
    unidade: "fracao",
    ler: (p) => (p.dinheiroTempo.leads ? m(p.dinheiroTempo.leads.taxaLeadComprador) : { valor: null, motivo: PAYLOAD_ANTERIOR }),
  },
  { chave: "cpm", rotulo: "CPM — captação", unidade: "moeda", menorEhMelhor: true, ler: (p) => m(p.dinheiroTempo.midia.porGrupo.captacao.cpm) },
];

export interface EntradaDoResumoMacro {
  payload: DebriefingPayload;
  /** Nome do lançamento atual (para as notas do "—"). */
  nomeAtual: string;
  comparacao: {
    funnelId: string;
    nome: string;
    payload: DebriefingPayload;
    origem: { tipo: "recalculada" } | { tipo: "payload-salvo"; salvoEm: string };
  } | null;
  comparacaoSemDelta?: { funnelId: string; nome: string; salvoEm: string } | null;
  alertas: readonly AlertaFase12[];
  /** QA 49.17 REQ-002 — os alertas das guardas sobre o payload da comparação. */
  alertasDaComparacao?: readonly AlertaFase12[];
}

/** Δ de dois números (atual − comparação). */
export function deltaDe(atual: number, comparacao: number): DeltaDaParidade {
  return { absoluto: atual - comparacao, relativoPct: variacaoPct(comparacao, atual) };
}

/** Monta o resumo macro a partir dos dois payloads. Puro (sem relógio). */
export function montarResumoMacro(e: EntradaDoResumoMacro): ResumoMacro {
  const p = e.payload;
  const comp = e.comparacao;
  const paridade: LinhaDaParidade[] = LINHAS_DA_PARIDADE.map((d) => {
    const atual = d.ler(p);
    const linha: LinhaDaParidade = {
      chave: d.chave,
      rotulo: d.rotulo,
      unidade: d.unidade,
      ...(d.menorEhMelhor ? { menorEhMelhor: true } : {}),
      ...(d.neutro ? { neutro: true } : {}),
      atual,
      comparacao: null,
      delta: null,
    };
    if (!comp) return linha;
    const c = d.ler(comp.payload);
    linha.comparacao = c;
    if (atual.valor !== null && c.valor !== null) {
      linha.delta = deltaDe(atual.valor, c.valor);
    } else {
      const faltas = [
        ...(c.valor === null ? [`${comp.nome}${c.motivo ? ` (${c.motivo})` : ""}`] : []),
        ...(atual.valor === null ? [`${e.nomeAtual}${atual.motivo ? ` (${atual.motivo})` : ""}`] : []),
      ];
      linha.notaSemDelta = `Δ “—”: sem o número de ${faltas.join(" e de ")}`;
    }
    return linha;
  });

  const maioresDiferencas: DiferencaDoResumo[] = paridade
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.delta !== null && l.delta.relativoPct !== null && l.delta.relativoPct !== 0)
    .sort((a, b) => Math.abs(b.l.delta!.relativoPct!) - Math.abs(a.l.delta!.relativoPct!) || a.i - b.i)
    .slice(0, MAX_MAIORES_DIFERENCAS)
    .map(({ l }, i) => ({
      posicao: i + 1,
      chave: l.chave,
      rotulo: l.rotulo,
      unidade: l.unidade,
      atual: l.atual.valor!,
      comparacao: l.comparacao!.valor!,
      delta: l.delta!,
      acao: null,
      rotuloDaAcao: SEM_LEITURA_DE_IA,
    }));

  return {
    versao: 1,
    comparacao: comp
      ? {
          funnelId: comp.funnelId,
          nome: comp.nome,
          origem: comp.origem.tipo,
          corte: comp.payload.dinheiroTempo.janela.corte
            ? { dia: comp.payload.dinheiroTempo.janela.corte.dia, dMaisN: comp.payload.dinheiroTempo.janela.corte.dMaisN }
            : null,
        }
      : null,
    semDelta: e.comparacaoSemDelta
      ? {
          funnelId: e.comparacaoSemDelta.funnelId,
          nome: e.comparacaoSemDelta.nome,
          motivo: "a comparação só tem relatório salvo (totais fechados), que não pode ser cortado no mesmo D+N desta parcial",
        }
      : null,
    paridade,
    maioresDiferencas,
    limitacoes: limitacoesDoResumo(e, paridade),
    pendencias: pendenciasDoResumo(p),
    pesquisaPorPergunta: montarPesquisaPorPergunta(e),
  };
}

/** AC8 — as limitações da tabela, uma linha cada. */
function limitacoesDoResumo(e: EntradaDoResumoMacro, paridade: readonly LinhaDaParidade[]): string[] {
  const out: string[] = [];
  const lados: [string | null, DebriefingPayload][] = [[null, e.payload], ...(e.comparacao ? [[e.comparacao.nome, e.comparacao.payload] as [string, DebriefingPayload]] : [])];
  for (const [nome, pp] of lados) {
    for (const l of pp.lacunas) {
      const afeta = LACUNAS_QUE_AFETAM_A_PARIDADE[l.codigo];
      if (afeta) out.push(`${nome ? `${nome}: ` : ""}${l.codigo} — ${l.motivo}${l.detalhe ? ` (${l.detalhe})` : ""}; afeta ${afeta}`);
    }
    for (const pe of pp.dinheiroTempo.pendencias) {
      const afeta = PENDENCIAS_QUE_AFETAM_A_PARIDADE[pe.codigo];
      if (afeta) out.push(`${nome ? `${nome}: ` : ""}${pe.codigo} — ${pe.detalhe}; afeta ${afeta}`);
    }
  }
  const alertasDosLados: [string | null, readonly AlertaFase12[]][] = [
    [null, e.alertas],
    ...(e.comparacao ? [[e.comparacao.nome, e.alertasDaComparacao ?? []] as [string, readonly AlertaFase12[]]] : []),
  ];
  for (const [nome, alertas] of alertasDosLados) {
    for (const a of alertas) {
      const afeta = ALERTAS_QUE_AFETAM_A_PARIDADE[a.codigo];
      if (afeta) out.push(`${nome ? `${nome}: ` : ""}${a.codigo} — ${a.mensagem}; afeta ${afeta}`);
    }
  }
  for (const l of paridade) if (l.notaSemDelta) out.push(`${l.rotulo}: ${l.notaSemDelta}`);
  if (e.comparacao?.origem.tipo === "payload-salvo") {
    out.push(`A comparação ${e.comparacao.nome} vem do último relatório salvo dele (${e.comparacao.origem.salvoEm.slice(0, 10)}), não de um recálculo — números de antes da Story 49.17 ficam “—”.`);
  }
  if (e.comparacaoSemDelta) {
    out.push(`Sem Δ contra ${e.comparacaoSemDelta.nome}: ele só tem relatório salvo (totais fechados), que não pode ser cortado no mesmo D+N desta parcial.`);
  } else if (!e.comparacao) {
    out.push("Edição única: sem lançamento de comparação na configuração — a tabela mostra só este lançamento.");
  }
  return out;
}

/** AC8 — pendências de confirmação: "ainda não aconteceu" e perguntas de pesquisa sem confirmação. */
function pendenciasDoResumo(p: DebriefingPayload): string[] {
  const out: string[] = [];
  const aindaNao = p.config.situacaoDoLancamento === "em-andamento" ? p.config.aindaNaoAconteceu : [];
  for (const f of aindaNao) {
    out.push(`${ROTULO_DA_FASE[f] ?? f}: ainda não aconteceu — informar a data na configuração do debriefing quando acontecer.`);
  }
  // Uma linha por motivo, com as perguntas (a faixa primeiro: é a "a planilha calcula a FAIXA?" do método).
  const porMotivo = new Map<string, string[]>();
  const dims = [...p.publico.dimensoesNaoConfirmadas].sort((a, b) => Number(b.campo === "faixa") - Number(a.campo === "faixa"));
  for (const d of dims) {
    const campos = porMotivo.get(d.motivo) ?? [];
    const rot = ROTULO_DO_CAMPO[d.campo] ?? d.campo;
    if (!campos.includes(rot)) campos.push(rot);
    porMotivo.set(d.motivo, campos);
  }
  for (const [motivo, campos] of porMotivo) {
    out.push(`Pergunta(s) da pesquisa sem confirmação — ${campos.join(", ")}: ${MOTIVO_DA_DIMENSAO[motivo] ?? motivo}.`);
  }
  return out;
}
