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

export type RespostaEtapaExtra = { houve: false } | { houve: true; abertura: string; fim: string };

/** Forma do GET `…/debriefing/config` (49.1 + 49.11 + 49.6). Campos novos opcionais (API antiga). */
export interface DebriefingConfigGet {
  tipoDeFunil: string;
  config: {
    datasChave: {
      inicioCaptacao: string | null;
      aberturaCarrinho: string | null;
      fimCarrinho: string | null;
      reabertura: RespostaEtapaExtra | null;
      downsell: RespostaEtapaExtra | null;
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
}

/** Estado do formulário. `null` = "não respondido" (nunca um padrão presumido). */
export interface FormDaConfig {
  inicioCaptacao: string;
  aberturaCarrinho: string;
  fimCarrinho: string;
  reabertura: { houve: boolean | null; abertura: string; fim: string };
  downsell: { houve: boolean | null; abertura: string; fim: string };
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

const extra = (r: RespostaEtapaExtra | null | undefined) =>
  r ? (r.houve ? { houve: true, abertura: r.abertura, fim: r.fim } : { houve: false, abertura: "", fim: "" }) : { houve: null, abertura: "", fim: "" };

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
    inicioCaptacao: "",
    aberturaCarrinho: "",
    fimCarrinho: "",
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
  return {
    inicioCaptacao: c.datasChave.inicioCaptacao ?? "",
    aberturaCarrinho: c.datasChave.aberturaCarrinho ?? "",
    fimCarrinho: c.datasChave.fimCarrinho ?? "",
    reabertura: extra(c.datasChave.reabertura),
    downsell: extra(c.datasChave.downsell),
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
  if (!f.inicioCaptacao) falta.push("Início da captação");
  if (!f.aberturaCarrinho) falta.push("Abertura do carrinho");
  if (!f.fimCarrinho) falta.push("Fim do carrinho");
  for (const [rot, e] of [["Reabertura", f.reabertura], ["Downsell", f.downsell]] as const) {
    if (e.houve === null) falta.push(`${rot}: responda "houve" ou "não houve"`);
    else if (e.houve && (!e.abertura || !e.fim)) falta.push(`${rot}: datas de abertura e fim`);
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
  const resp = (e: FormDaConfig["reabertura"]) => (e.houve ? { houve: true, abertura: e.abertura, fim: e.fim } : { houve: false });
  const corpo: Record<string, unknown> = {
    datasChave: {
      inicioCaptacao: f.inicioCaptacao,
      aberturaCarrinho: f.aberturaCarrinho,
      fimCarrinho: f.fimCarrinho,
      reabertura: resp(f.reabertura),
      downsell: resp(f.downsell),
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

/** O 2º item da lista só com a API que a aceita (49.11 AC7) — com o motivo visível. */
export function motivoSemSegundoItem(apiContrato: number | null | undefined): string | null {
  if (typeof apiContrato === "number" && apiContrato >= CONTRATO_DA_LISTA) return null;
  return "A API em uso ainda não aceita mais de um lançamento de comparação (precisa da versão do contrato 31). Aguarde o deploy da API.";
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
