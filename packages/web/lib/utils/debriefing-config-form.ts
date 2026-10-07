// Story 49.6 — lógica PURA do formulário da config do debriefing (49.1) e do
// botão "Gerar debriefing". Módulo folha em `lib/utils` (único diretório que o
// vitest do web coleta): o que não pode errar — o CORPO enviado ao PUT, os
// campos obrigatórios e a leitura do erro — tem teste aqui, não no componente.
//
// Regras herdadas:
//  - 49.11 AC7: a comparação é LISTA ordenada (a 1ª é a principal). Com 0/1
//    item o corpo leva SÓ `lancamentoComparacaoFunnelId` (a API v30 tem corpo
//    `.strict()` e recusaria a chave nova); com 2+, as duas. O 2º item e a
//    pesquisa de captação só com a API ≥ v31 ("front não pode exigir API nova").
//  - UX-002 (49.1): o GET devolve o id de comparação apagado (rastro) e o PUT
//    recusa reenviá-lo — o formulário o tira ANTES de salvar.
//  - CONTRACT-001 (49.11): `GET.lancamentosComparacao` é a lista GRAVADA (com
//    os removidos); a EFETIVA = gravada − `comparacoesRemovidas`.
//  - Princípio da skill "na dúvida, pergunte": nada de padrão por conta própria;
//    campo obrigatório vazio bloqueia o envio e é nomeado.

/** Versão do contrato que aceita a lista de comparação e a pesquisa de captação (49.11). */
export const CONTRATO_DA_LISTA = 31;
/** Versão do contrato que tem a rota de geração (49.6). */
export const CONTRATO_DA_GERACAO = 32;
/** Versão do contrato que aceita o lançamento "em andamento" (49.12). */
export const CONTRATO_DO_EM_ANDAMENTO = 35;
/** Versão do contrato que gera a parcial com o carrinho aberto (49.14; a v35 responde 422 CARRINHO_JA_ABERTO). */
export const CONTRATO_DO_CARRINHO_EM_ANDAMENTO = 36;

/** Story 49.12 (AC1) — "O lançamento terminou?". */
export type SituacaoDoLancamento = "encerrado" | "em-andamento";
/** Story 49.12 (AC2) — fases que aceitam "ainda não aconteceu" (só em andamento). */
export type FaseQuePodeNaoTerAcontecido = "aberturaCarrinho" | "fimCarrinho" | "reabertura" | "downsell" | "fimReabertura" | "fimDownsell";
/** Story 49.14 (REQ-002) — o "fim ainda não aconteceu" de reabertura/downsell abertos (≠ a fase inteira). */
const FIM_AINDA_NAO = { reabertura: "fimReabertura", downsell: "fimDownsell" } as const;
/** Resposta "ainda não aconteceu" de reabertura/downsell no formulário (≠ "não houve"). */
export const AINDA_NAO = "ainda-nao" as const;

export const PAPEIS_DO_DEBRIEFING = [
  "leads-captacao",
  "vendas-captacao",
  "vendas-principal",
  "leads-downsell",
  "vendas-downsell",
  "reabertura",
] as const;
export type PapelDoDebriefing = (typeof PAPEIS_DO_DEBRIEFING)[number];

export const ROTULO_DO_PAPEL: Record<PapelDoDebriefing, string> = {
  "leads-captacao": "Captação — leads",
  "vendas-captacao": "Captação — vendas (ingresso)",
  "vendas-principal": "Produto principal",
  "leads-downsell": "Downsell — leads",
  "vendas-downsell": "Downsell — vendas",
  reabertura: "Reabertura",
};

export const DIMENSOES_DO_CRIATIVO = ["ia-humano", "video-estatico", "nenhuma"] as const;
export type DimensaoDoCriativo = (typeof DIMENSOES_DO_CRIATIVO)[number];

/** Dimensões canônicas da pesquisa (mesma lista da API, `SURVEY_CANONICAL_FIELDS`). */
export const DIMENSOES_DA_PESQUISA = [
  "faixa",
  "idade",
  "sexo",
  "estado_civil",
  "escolaridade",
  "renda",
  "profissao",
  "setor",
  "funcionarios",
  "religiao",
] as const;
export type DimensaoDaPesquisa = (typeof DIMENSOES_DA_PESQUISA)[number];

/** 49.14 (REQ-002): `fim: null` = "fim ainda não aconteceu" (só em andamento, com a resposta em `aindaNaoAconteceu`). */
export type RespostaEtapaExtra = { houve: false } | { houve: true; abertura: string; fim: string | null };

/** Forma do GET `…/debriefing/config` (49.1 + 49.11 + 49.6). Campos novos opcionais (API antiga). */
export interface DebriefingConfigGet {
  tipoDeFunil: string;
  config: {
    /** 49.12 — ausente = API anterior à 49.12 (só existia o encerrado). */
    situacaoDoLancamento?: SituacaoDoLancamento;
    datasChave: {
      inicioCaptacao: string | null;
      aberturaCarrinho: string | null;
      fimCarrinho: string | null;
      reabertura: RespostaEtapaExtra | null;
      downsell: RespostaEtapaExtra | null;
      /** 49.12 — ausente = API anterior à 49.12. */
      aindaNaoAconteceu?: FaseQuePodeNaoTerAcontecido[];
    };
    lancamentoComparacaoFunnelId: string | null;
    lancamentosComparacao?: string[];
    pesquisaDeCaptacaoPorEtapa?: Record<string, string>;
    etapas: { stageId: string; papel: PapelDoDebriefing }[];
    perguntasConfirmadas: Record<string, Partial<Record<DimensaoDaPesquisa, string | null>>>;
    closerMediums: string[] | null;
    closerPorSellerName: boolean | null;
    ferramentasDeAtendimento: string[] | null;
    dimensaoDeCriativo: DimensaoDoCriativo | null;
    comparacaoRemovida: boolean;
    comparacoesRemovidas?: string[];
    validado: boolean;
    validadoEm: string | null;
    validadoPorNome: string | null;
  } | null;
  bloqueio: { erro: string; detalhe: string; acao: string } | null;
  camposFaltantes: string[];
  avisos: { codigo: string; detalhe: string; acao: string }[];
  combinacaoLiberada: boolean;
  imposto: { valor: number; origem: string };
  perguntasDisponiveis: {
    stageId: string;
    stageName: string;
    status: "ok" | "sem-pesquisa" | "falha";
    perguntas: { key: string; label: string }[];
    motivo?: string;
  }[];
  pesquisasPorEtapa?: Record<string, { id: string; rotulo: string }[]>;
  pesquisasPorEtapaFalha?: string;
  /** 49.12 (AC11) — a parcial da etapa (`null` = nenhuma; ausente = API anterior). */
  parcialAtual?: { debriefingId: string; geradaEm: string; corte: string | null; dMaisN: number | null } | null;
}

/** Estado do formulário. `null` = "não respondido" (nunca um padrão presumido). */
export interface FormDaConfig {
  /** 49.12 (AC1) — `null` = não respondido (config nova não vem pré-marcada). */
  situacao: SituacaoDoLancamento | null;
  inicioCaptacao: string;
  aberturaCarrinho: string;
  fimCarrinho: string;
  /** 49.12 (AC2) — abertura/fim do carrinho "ainda não aconteceu" (vale só em andamento). */
  carrinhoAindaNao: { aberturaCarrinho: boolean; fimCarrinho: boolean };
  /** `houve: "ainda-nao"` = "ainda não aconteceu" (49.12, só em andamento) — ≠ `false` ("não houve"). */
  reabertura: { houve: boolean | typeof AINDA_NAO | null; abertura: string; fim: string; fimAindaNao?: boolean };
  downsell: { houve: boolean | typeof AINDA_NAO | null; abertura: string; fim: string; fimAindaNao?: boolean };
  /** Lista ordenada; a 1ª é a comparação principal. */
  comparacoes: string[];
  /** Papel por etapa do funil; ausente = a etapa não compõe o lançamento. */
  papeis: Record<string, PapelDoDebriefing>;
  /**
   * Perguntas por etapa com pesquisa. `faixa`: chave, `null` = "esta pesquisa
   * não tem faixa" (resposta explícita), ausente = não respondido.
   */
  perguntas: Record<string, Partial<Record<DimensaoDaPesquisa, string | null>>>;
  pesquisaDeCaptacao: Record<string, string>;
  closerMediums: { resposta: "lista" | "nenhum" | null; texto: string };
  closerPorSellerName: boolean | null;
  ferramentas: { resposta: "lista" | "nenhuma" | null; texto: string };
  dimensaoDeCriativo: DimensaoDoCriativo | null;
}

const extra = (r: RespostaEtapaExtra | null | undefined, aindaNao = false, fimAindaNao = false): FormDaConfig["reabertura"] =>
  aindaNao
    ? { houve: AINDA_NAO, abertura: "", fim: "" }
    : r
      ? r.houve
        ? // 49.14 (REQ-002): aberta com o fim "ainda não aconteceu" — a caixa marcada, sem data.
          fimAindaNao && r.fim === null
          ? { houve: true, abertura: r.abertura, fim: "", fimAindaNao: true }
          : { houve: true, abertura: r.abertura, fim: r.fim ?? "" }
        : { houve: false, abertura: "", fim: "" }
      : { houve: null, abertura: "", fim: "" };

/** A lista GRAVADA do GET (com os removidos); API v30 só tem o campo antigo. */
export function listaGravadaDoGet(c: NonNullable<DebriefingConfigGet["config"]>): string[] {
  return c.lancamentosComparacao ?? (c.lancamentoComparacaoFunnelId ? [c.lancamentoComparacaoFunnelId] : []);
}

/**
 * Removidos pelo servidor (funil apagado/fora do projeto). API v30 só diz
 * `comparacaoRemovida` (boolean) — aí o removido é o único item.
 */
export function removidosDoGet(c: NonNullable<DebriefingConfigGet["config"]>): string[] {
  if (c.comparacoesRemovidas) return c.comparacoesRemovidas;
  return c.comparacaoRemovida && c.lancamentoComparacaoFunnelId ? [c.lancamentoComparacaoFunnelId] : [];
}

/** CONTRACT-001: a lista EFETIVA = gravada − removidos. */
export function listaEfetivaDoGet(c: NonNullable<DebriefingConfigGet["config"]>): string[] {
  const fora = new Set(removidosDoGet(c));
  return listaGravadaDoGet(c).filter((id) => !fora.has(id));
}

export function formVazio(): FormDaConfig {
  return {
    situacao: null,
    inicioCaptacao: "",
    aberturaCarrinho: "",
    fimCarrinho: "",
    carrinhoAindaNao: { aberturaCarrinho: false, fimCarrinho: false },
    reabertura: { houve: null, abertura: "", fim: "" },
    downsell: { houve: null, abertura: "", fim: "" },
    comparacoes: [],
    papeis: {},
    perguntas: {},
    pesquisaDeCaptacao: {},
    closerMediums: { resposta: null, texto: "" },
    closerPorSellerName: null,
    ferramentas: { resposta: null, texto: "" },
    dimensaoDeCriativo: null,
  };
}

/** Form a partir do GET. A lista mostra a GRAVADA (os removidos aparecem riscados, AC7). */
export function formDoGet(r: DebriefingConfigGet): FormDaConfig {
  const c = r.config;
  if (!c) return formVazio();
  const lista = (l: string[] | null, vazio: "nenhum" | "nenhuma") =>
    l === null ? { resposta: null, texto: "" } : l.length === 0 ? { resposta: vazio, texto: "" } : { resposta: "lista" as const, texto: l.join(", ") };
  // 49.12 (AC1): config salva sem a resposta (API anterior) = encerrado — sem pedir de novo.
  const ainda = new Set(c.datasChave.aindaNaoAconteceu ?? []);
  return {
    situacao: c.situacaoDoLancamento ?? "encerrado",
    inicioCaptacao: c.datasChave.inicioCaptacao ?? "",
    aberturaCarrinho: c.datasChave.aberturaCarrinho ?? "",
    fimCarrinho: c.datasChave.fimCarrinho ?? "",
    carrinhoAindaNao: { aberturaCarrinho: ainda.has("aberturaCarrinho"), fimCarrinho: ainda.has("fimCarrinho") },
    reabertura: extra(c.datasChave.reabertura, ainda.has("reabertura"), ainda.has("fimReabertura")),
    downsell: extra(c.datasChave.downsell, ainda.has("downsell"), ainda.has("fimDownsell")),
    comparacoes: listaGravadaDoGet(c),
    papeis: Object.fromEntries(c.etapas.map((e) => [e.stageId, e.papel])),
    perguntas: c.perguntasConfirmadas ?? {},
    pesquisaDeCaptacao: c.pesquisaDeCaptacaoPorEtapa ?? {},
    closerMediums: lista(c.closerMediums, "nenhum") as FormDaConfig["closerMediums"],
    closerPorSellerName: c.closerPorSellerName,
    ferramentas: lista(c.ferramentasDeAtendimento, "nenhuma") as FormDaConfig["ferramentas"],
    dimensaoDeCriativo: c.dimensaoDeCriativo,
  };
}

const itens = (texto: string) =>
  texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Campos obrigatórios sem resposta, NOMEADOS (o formulário não deixa enviar).
 * `etapasComPesquisa` = etapas do lançamento cuja pesquisa existe (status ok).
 */
export function faltantesDoForm(f: FormDaConfig, etapasComPesquisa: readonly { stageId: string; nome: string }[] = []): string[] {
  const falta: string[] = [];
  // 49.12 (AC1/AC2): a lista diz só o que falta DE FATO no modo escolhido.
  if (f.situacao === null) falta.push("O lançamento terminou? (encerrado ou em andamento)");
  const emAndamento = f.situacao === "em-andamento";
  if (!f.inicioCaptacao) falta.push("Início da captação");
  for (const [k, rot] of [["aberturaCarrinho", "Abertura do carrinho"], ["fimCarrinho", "Fim do carrinho"]] as const) {
    if (f[k] || (emAndamento && f.carrinhoAindaNao[k])) continue;
    falta.push(emAndamento ? `${rot} (a data ou "ainda não aconteceu")` : rot);
  }
  for (const [rot, e] of [["Reabertura", f.reabertura], ["Downsell", f.downsell]] as const) {
    if (e.houve === null || (e.houve === AINDA_NAO && !emAndamento)) {
      falta.push(emAndamento ? `${rot}: responda "houve", "não houve" ou "ainda não aconteceu"` : `${rot}: responda "houve" ou "não houve"`);
    } else if (e.houve === true && (!e.abertura || (!e.fim && !(emAndamento && e.fimAindaNao)))) {
      // 49.14 (REQ-002): em andamento, o fim pode ser "ainda não aconteceu".
      falta.push(emAndamento ? `${rot}: data de abertura e o fim (a data ou "fim ainda não aconteceu")` : `${rot}: datas de abertura e fim`);
    }
  }
  if (Object.keys(f.papeis).length === 0) falta.push("Etapas do lançamento (ao menos uma com papel)");
  for (const { stageId, nome } of etapasComPesquisa) {
    if (!f.papeis[stageId]) continue;
    // `faixa: null` é resposta ("não tem faixa"); só a chave AUSENTE falta.
    if (!("faixa" in (f.perguntas[stageId] ?? {}))) {
      falta.push(`Pergunta de faixa da etapa "${nome}" (ou "esta pesquisa não tem faixa")`);
    }
  }
  if (f.closerMediums.resposta === null) falta.push("utm_medium de closer (lista ou \"nenhum\")");
  else if (f.closerMediums.resposta === "lista" && itens(f.closerMediums.texto).length === 0) falta.push("utm_medium de closer: informe ao menos um");
  if (f.closerPorSellerName === null) falta.push("Vendedor (seller_name) marca closer? (sim/não)");
  if (f.ferramentas.resposta === null) falta.push("Ferramentas de atendimento (lista ou \"nenhuma\")");
  else if (f.ferramentas.resposta === "lista" && itens(f.ferramentas.texto).length === 0) falta.push("Ferramentas de atendimento: informe ao menos uma");
  if (f.dimensaoDeCriativo === null) falta.push("Dimensão de criativo");
  return falta;
}

/**
 * O CORPO do PUT. `apiContrato` = `contract` do `/api/health` (ausente em API
 * anterior à 29.46 = trata como antiga). `removidos` saem antes (UX-002).
 */
export function corpoDoPut(
  f: FormDaConfig,
  opts: { apiContrato: number | null | undefined; removidos: readonly string[] },
): Record<string, unknown> {
  const fora = new Set(opts.removidos);
  const lista = f.comparacoes.filter((id) => !fora.has(id));
  const apiTemLista = typeof opts.apiContrato === "number" && opts.apiContrato >= CONTRATO_DA_LISTA;
  // 49.12 (AC11): as chaves novas só com a API ≥ 35 (a v34 tem corpo `.strict()`).
  const apiTemEmAndamento = typeof opts.apiContrato === "number" && opts.apiContrato >= CONTRATO_DO_EM_ANDAMENTO;
  const emAndamento = apiTemEmAndamento && f.situacao === "em-andamento";
  const resp = (e: FormDaConfig["reabertura"]) =>
    emAndamento && e.houve === AINDA_NAO
      ? null
      : e.houve === true
        ? { houve: true, abertura: e.abertura, fim: emAndamento && e.fimAindaNao ? null : e.fim }
        : { houve: false };
  const data = (k: "aberturaCarrinho" | "fimCarrinho") => (emAndamento && f.carrinhoAindaNao[k] ? null : f[k]);
  const aindaNao: FaseQuePodeNaoTerAcontecido[] = emAndamento
    ? [
        ...(f.carrinhoAindaNao.aberturaCarrinho ? (["aberturaCarrinho"] as const) : []),
        ...(f.carrinhoAindaNao.fimCarrinho ? (["fimCarrinho"] as const) : []),
        ...(f.reabertura.houve === AINDA_NAO ? (["reabertura"] as const) : []),
        ...(f.downsell.houve === AINDA_NAO ? (["downsell"] as const) : []),
        // 49.14 (REQ-002): reabertura/downsell abertos com o fim "ainda não aconteceu".
        ...(f.reabertura.houve === true && f.reabertura.fimAindaNao ? ([FIM_AINDA_NAO.reabertura] as const) : []),
        ...(f.downsell.houve === true && f.downsell.fimAindaNao ? ([FIM_AINDA_NAO.downsell] as const) : []),
      ]
    : [];
  const corpo: Record<string, unknown> = {
    ...(apiTemEmAndamento ? { situacaoDoLancamento: emAndamento ? "em-andamento" : "encerrado" } : {}),
    datasChave: {
      inicioCaptacao: f.inicioCaptacao,
      aberturaCarrinho: data("aberturaCarrinho"),
      fimCarrinho: data("fimCarrinho"),
      reabertura: resp(f.reabertura),
      downsell: resp(f.downsell),
      ...(apiTemEmAndamento ? { aindaNaoAconteceu: aindaNao } : {}),
    },
    lancamentoComparacaoFunnelId: lista[0] ?? null,
    etapas: Object.entries(f.papeis).map(([stageId, papel]) => ({ stageId, papel })),
    perguntasConfirmadas: Object.fromEntries(Object.entries(f.perguntas).filter(([stageId]) => f.papeis[stageId])),
    closerMediums: f.closerMediums.resposta === "lista" ? itens(f.closerMediums.texto) : [],
    closerPorSellerName: f.closerPorSellerName,
    ferramentasDeAtendimento: f.ferramentas.resposta === "lista" ? itens(f.ferramentas.texto) : [],
    dimensaoDeCriativo: f.dimensaoDeCriativo,
  };
  if (lista.length >= 2) corpo.lancamentosComparacao = lista;
  if (apiTemLista) {
    corpo.pesquisaDeCaptacaoPorEtapa = Object.fromEntries(Object.entries(f.pesquisaDeCaptacao).filter(([stageId, id]) => f.papeis[stageId] && id));
  }
  return corpo;
}

/**
 * Story 49.12 (AC11) — o "em andamento" só com a API que o aceita; contra a
 * API anterior, a opção fica desabilitada com a frase de API atrás da 47.15.
 */
export function motivoSemEmAndamento(apiContrato: number | null | undefined): string | null {
  if (typeof apiContrato === "number" && apiContrato >= CONTRATO_DO_EM_ANDAMENTO) return null;
  return "A API ainda não tem o modo “em andamento” do debriefing — provavelmente está atrás do painel. Veja o aviso de versão no topo.";
}

/** Story 49.12 (AC3/AC11) — ontem (`YYYY-MM-DD`) no fuso de Brasília, para o texto do botão. */
export function ontemEmBrasilia(agora: Date): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const [a, m, d] = hoje.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** As datas de fase que o aviso do AC6 (49.14) lê — `null` = "ainda não aconteceu" (ou sem resposta). */
export interface DatasDasFases {
  aberturaCarrinho: string | null;
  fimCarrinho: string | null;
  reabertura: RespostaEtapaExtra | null;
  downsell: RespostaEtapaExtra | null;
}

/** As datas de fase do formulário, na forma do GET (a caixa "ainda não aconteceu" vira `null`). */
export function datasDasFasesDoForm(f: FormDaConfig): DatasDasFases {
  const data = (k: "aberturaCarrinho" | "fimCarrinho") => (f.carrinhoAindaNao[k] || !f[k] ? null : f[k]);
  const extra = (e: FormDaConfig["reabertura"]): RespostaEtapaExtra | null =>
    e.houve === true
      ? e.abertura && (e.fim || e.fimAindaNao)
        ? { houve: true, abertura: e.abertura, fim: e.fimAindaNao ? null : e.fim }
        : null
      : e.houve === false
        ? { houve: false }
        : null;
  return { aberturaCarrinho: data("aberturaCarrinho"), fimCarrinho: data("fimCarrinho"), reabertura: extra(f.reabertura), downsell: extra(f.downsell) };
}

/**
 * Story 49.14 (AC6, R9-5) — todas as fases (carrinho, reabertura e downsell)
 * terminaram até `ontem` (`YYYY-MM-DD`): o carrinho com abertura e fim ≤ ontem,
 * e reabertura/downsell "não houve" ou com o fim ≤ ontem. "Ainda não aconteceu"
 * (ou sem resposta) nunca terminou.
 */
export function todasAsFasesTerminaram(d: DatasDasFases, ontem: string): boolean {
  const terminou = (abertura: string | null, fim: string | null) => abertura !== null && fim !== null && abertura <= ontem && fim <= ontem;
  const extra = (r: RespostaEtapaExtra | null) => r !== null && (r.houve === false || terminou(r.abertura, r.fim));
  return terminou(d.aberturaCarrinho, d.fimCarrinho) && extra(d.reabertura) && extra(d.downsell);
}

/**
 * AC6 (49.14) — o aviso, antes do clique, de que todas as fases terminaram e dá
 * para marcar "encerrado". QA 49.14 FE-001: "a parcial sai com os números do
 * final" só com a API ≥ 36 — a v35 responde 422 CARRINHO_JA_ABERTO a essa
 * geração, então o aviso diz que a API está atrás (contrato desconhecido = atrás,
 * como `motivoSemEmAndamento`).
 */
export function avisoDeFasesConcluidas(ontem: string, apiContrato?: number | null): string {
  const terminaram = `Todas as fases (carrinho, reabertura e downsell) terminaram até ${ddmm(ontem)}`;
  if (typeof apiContrato === "number" && apiContrato >= CONTRATO_DO_CARRINHO_EM_ANDAMENTO) {
    return `${terminaram}: a parcial sai com os números do relatório final. Para gerar o relatório final, marque “encerrado” na configuração do debriefing.`;
  }
  return (
    `${terminaram}, mas a API em uso${typeof apiContrato === "number" ? ` (contrato ${apiContrato})` : ""} ainda não gera a parcial com o carrinho aberto ` +
    `(contrato ${CONTRATO_DO_CARRINHO_EM_ANDAMENTO}) — provavelmente está atrás do painel; veja o aviso de versão no topo. ` +
    `Para gerar o relatório final, marque “encerrado” na configuração do debriefing.`
  );
}

/**
 * Story 49.12 (AC11) — o que o botão "Gerar debriefing" deixa claro no modo em
 * andamento: gera uma PARCIAL com dados até ontem e, havendo parcial, que vai
 * substituí-la. `null` = encerrado (o botão de sempre). Story 49.14 (AC6): com
 * todas as fases terminadas até ontem, `fasesConcluidas` avisa que dá para
 * marcar "encerrado" (a geração não é bloqueada).
 */
export function avisoDoBotaoDeGerar(
  cfg: Pick<DebriefingConfigGet, "config" | "parcialAtual"> | null | undefined,
  agora: Date,
  apiContrato?: number | null,
): { rotulo: string; detalhe: string; fasesConcluidas?: string } | null {
  if (cfg?.config?.situacaoDoLancamento !== "em-andamento") return null;
  const ontemDia = ontemEmBrasilia(agora);
  const ontem = ddmm(ontemDia);
  const p = cfg.parcialAtual;
  return {
    rotulo: `Gerar parcial (dados até ${ontem})`,
    detalhe: p
      ? `Lançamento em andamento: gera uma parcial com os dados até ${ontem} e SUBSTITUI a parcial atual${p.corte ? ` (dados até ${ddmm(p.corte)})` : ""} — os comentários ficam; as edições feitas no viewer se perdem.`
      : `Lançamento em andamento: gera uma parcial com os dados até ${ontem} (ontem, no fuso de Brasília).`,
    ...(todasAsFasesTerminaram(cfg.config.datasChave, ontemDia) ? { fasesConcluidas: avisoDeFasesConcluidas(ontemDia, apiContrato) } : {}),
  };
}

/**
 * Story 49.14 — o rótulo do "em andamento": com a API ≥ 36, o carrinho aberto é
 * calculado; com a v35, a geração com o carrinho aberto ainda dá 422.
 */
export function rotuloDoEmAndamento(apiContrato: number | null | undefined): { rotulo: string; dica: string } {
  const comCarrinho = typeof apiContrato === "number" && apiContrato >= CONTRATO_DO_CARRINHO_EM_ANDAMENTO;
  return comCarrinho
    ? {
        rotulo: "Em andamento",
        dica:
          "Em andamento: o debriefing sai PARCIAL, com os dados até ontem (fuso de Brasília), e a próxima geração substitui a parcial. " +
          "Carrinho, reabertura e downsell aceitam “ainda não aconteceu”; com o carrinho aberto, o que já aconteceu entra até ontem, marcado como parcial.",
      }
    : {
        rotulo: "Em andamento (captação aberta)",
        dica:
          "Em andamento: o debriefing sai PARCIAL, com os dados até ontem (fuso de Brasília), e a próxima geração substitui a parcial. " +
          "Carrinho, reabertura e downsell aceitam “ainda não aconteceu”.",
      };
}

/** O 2º item da lista só com a API que a aceita (49.11 AC7) — com o motivo visível. */
export function motivoSemSegundoItem(apiContrato: number | null | undefined): string | null {
  if (typeof apiContrato === "number" && apiContrato >= CONTRATO_DA_LISTA) return null;
  return "A API em uso ainda não aceita mais de um lançamento de comparação (precisa da versão do contrato 31). Aguarde o deploy da API.";
}

// ---------------------------------------------------------------------------
// Funis da comparação (49.13) — ativos E arquivados
// ---------------------------------------------------------------------------

/**
 * Escopo da busca de funis do formulário (2º argumento de `useFunnels`). O
 * padrão do hook é `"false"` (só ativos); a lista de comparação pede `"all"`
 * porque o servidor aceita funil arquivado como comparação (49.13 AC1/AC4).
 * Vale SÓ para este formulário (AC5): o hook continua com o padrão de hoje.
 */
export const ESCOPO_DOS_FUNIS_DA_COMPARACAO = "all" as const;

/** O pedaço do `Funnel` que a lista de comparação usa. */
export interface FunilDaComparacao {
  id: string;
  name: string;
  archivedAt?: string | null;
}

/** Nome com o sufixo " (arquivado)" — mesmo rótulo de `funnels/[funnelId]/page.tsx`. */
export function rotuloDoFunilDaComparacao(f: FunilDaComparacao): string {
  return f.archivedAt ? `${f.name} (arquivado)` : f.name;
}

/**
 * Opções do seletor "+ adicionar lançamento de comparação…": todos os funis
 * do projeto menos o próprio e os que já estão na lista; ativos primeiro,
 * arquivados depois (ordem estável dentro de cada grupo).
 */
export function opcoesDaComparacao(
  funis: readonly FunilDaComparacao[],
  funnelId: string,
  jaNaLista: readonly string[],
): { id: string; rotulo: string }[] {
  return funis
    .filter((x) => x.id !== funnelId && !jaNaLista.includes(x.id))
    .sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0))
    .map((x) => ({ id: x.id, rotulo: rotuloDoFunilDaComparacao(x) }));
}

/** Nome exibido de um item da lista salva; o id só quando o funil não existe mais. */
export function nomeDoFunilDaComparacao(funis: readonly FunilDaComparacao[] | undefined, id: string): string {
  const f = funis?.find((x) => x.id === id);
  return f ? rotuloDoFunilDaComparacao(f) : id;
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

export const PASSOS_DA_GERACAO = [
  "Lendo vendas…",
  "Calculando mídia e canais…",
  "Validando invariantes…",
  "Montando o relatório…",
] as const;

export interface ErroDaGeracao {
  titulo: string;
  codigo: string | null;
  detalhe: string;
  acao: string;
  violacoes?: { codigo: string; detalhe: string }[];
}

const TITULOS: Record<string, string> = {
  ETAPA_NAO_E_DEBRIEFING: "Esta etapa não é do tipo Debriefing",
  TIPO_DE_FUNIL_NAO_SUPORTADO: "Tipo de funil não suportado",
  COMBINACAO_NAO_VALIDADA: "Combinação não validada",
  CONFIG_INCOMPLETA: "Configuração incompleta",
  COMPARACAO_SEM_CONFIG: "Lançamento de comparação sem configuração",
  DADO_INDISPONIVEL: "Falta dado para gerar",
  INVARIANTE_VIOLADO: "Os números não fecham",
  CONFERENCIA_EXTERNA: "Investimento diverge do oficial",
  TEXTO_IA_INDISPONIVEL: "Textos da IA indisponíveis",
  // Story 49.12 — lançamento em andamento
  SEM_DIA_FECHADO: "Ainda não há dia fechado para analisar",
  // A API v35 (49.12) ainda responde este 422; a v36 (49.14) calcula o carrinho aberto.
  CARRINHO_JA_ABERTO: "O carrinho já abriu",
  MIDIA_DO_CORTE_NAO_SINCRONIZADA: "Mídia do dia de corte não sincronizada",
  COMPARACAO_EM_ANDAMENTO: "Lançamento de comparação em andamento",
  TEXTO_IA_REPROVADO: "Textos da IA reprovados",
};

/**
 * Lê o erro da geração para a tela (persistente, AC11). API atrás (rota que
 * não existe → 404 "Not Found") vira a frase padrão da 47.15 — nunca o
 * "Not Found" cru; nenhum erro vira "sem dado".
 */
export function erroDaGeracao(e: unknown): ErroDaGeracao {
  const err = e as { status?: number; message?: string; body?: Record<string, unknown> } | null;
  const body = (err?.body ?? null) as Record<string, unknown> | null;
  const status = err?.status ?? 0;
  if (status === 404 && /^not found$/i.test(String(body?.error ?? err?.message ?? "").trim())) {
    return {
      titulo: "API atrás do painel",
      codigo: null,
      detalhe: "A API ainda não tem a rota de geração do debriefing — provavelmente está atrás do painel. Veja o aviso de versão no topo.",
      acao: "Aguardar o deploy da API (contrato 34) e tentar de novo",
    };
  }
  if (body && typeof body.erro === "string") {
    const codigo = typeof body.codigo === "string" ? body.codigo : null;
    const base = TITULOS[body.erro] ?? body.erro;
    return {
      titulo: codigo ? `${base} (${codigo})` : base,
      codigo: codigo ?? body.erro,
      detalhe: String(body.detalhe ?? ""),
      acao: String(body.acao ?? ""),
      ...(Array.isArray(body.violacoes) ? { violacoes: body.violacoes as { codigo: string; detalhe: string }[] } : {}),
    };
  }
  if (status === 413) {
    return { titulo: "Relatório grande demais", codigo: "PAYLOAD_TOO_LARGE", detalhe: "O HTML passou de 5 MB.", acao: "Avisar o time — o documento não pode ser truncado" };
  }
  if (status === 403) return { titulo: "Acesso negado", codigo: null, detalhe: "Convidados não geram debriefing.", acao: "Entrar com um usuário do time" };
  return {
    titulo: "Não foi possível gerar o debriefing",
    codigo: status ? `HTTP ${status}` : null,
    detalhe: String(body?.error ?? err?.message ?? "erro desconhecido"),
    acao: "Tentar de novo; se repetir, avisar o time com este código",
  };
}

/**
 * QA 49.6 UX-496-2 — o erro de "Marcar combinação como validada" vai para a
 * TELA (bloco do gate no formulário), com código, detalhe e ação, como o da
 * geração — nunca toast que some. 422 do gate da 49.1 (corpo `erro/detalhe/
 * acao`) reaproveita `erroDaGeracao`; o resto ganha o título da validação.
 */
export function erroDaValidacao(e: unknown): ErroDaGeracao {
  const err = e as { status?: number; message?: string; body?: Record<string, unknown> } | null;
  const body = (err?.body ?? null) as Record<string, unknown> | null;
  const status = err?.status ?? 0;
  if (body && typeof body.erro === "string") return erroDaGeracao(e);
  const cru = String(body?.error ?? err?.message ?? "").trim();
  if (status === 404 && /^not found$/i.test(cru)) {
    return {
      titulo: "API atrás do painel",
      codigo: null,
      detalhe: "A API ainda não tem a rota de validação da combinação — provavelmente está atrás do painel. Veja o aviso de versão no topo.",
      acao: "Aguardar o deploy da API e tentar de novo",
    };
  }
  if (status === 403) return { titulo: "Acesso negado", codigo: null, detalhe: "Convidados não validam a combinação.", acao: "Entrar com um usuário do time" };
  return {
    titulo: "Não foi possível marcar a combinação como validada",
    codigo: status ? `HTTP ${status}` : null,
    detalhe: cru || "erro desconhecido",
    acao: status === 404 ? "Salvar a config do debriefing e validar de novo" : "Tentar de novo; se repetir, avisar o time com este código",
  };
}
