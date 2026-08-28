/**
 * Story 44.21 — o que a tela precisa DERIVAR do payload do panorama, e só isso.
 *
 * ## Este módulo não calcula nada (AC8)
 *
 * `spendCurta`, `spendLonga`, `principal`, `gargalo`, `noAr` e `pendencias`
 * chegam prontos da Story 44.20. O que sobra aqui é **escolher o rótulo e montar
 * a linha da tabela**. Se aparecer uma soma ou uma divisão neste arquivo, ela
 * está no lugar errado.
 *
 * O motivo não é estilo: o agente Inácio lê o MESMO payload pela REST
 * (`get_project_panorama`). Uma derivação local faz a tela divergir do que ele
 * reporta — que é a classe de defeito que o Epic 44 inteiro existe para impedir.
 *
 * ## Por que a lógica mora aqui e não no componente
 *
 * O runner de teste do `web` cobre só `lib/utils`, sem jsdom (Story 29.35), e os
 * `.test.tsx` de componente seguem órfãos **de propósito**. Extrair a montagem
 * de linha para cá é o que torna T1–T5 da story testáveis de verdade; testar o
 * componente renderizado não é possível hoje.
 *
 * ## Unidades
 *
 * O payload declara `unidadeDasTaxas: "decimal"`. **Nada aqui multiplica por
 * 100** — isso é formatação, e mora no componente.
 */

/** Uma etapa como o payload da 44.20 a entrega. */
export interface EtapaDoPanorama {
  funnelId: string;
  funnelName: string;
  funnelType: string;
  stageId: string;
  stageName: string;
  stageType: string | null;
  familia: "paga" | "gratuita" | null;
  noAr: boolean;
  spendCurta: number;
  spendLonga: number;
  principal: {
    metrica?: string;
    valor?: number | null;
    motivo?: string;
    message?: string;
    vendasReais?: number;
    leadsUnicos?: number;
  } | null;
  gargalo: {
    metrica: string;
    atual: number | null;
    teto: number | null;
    queda: number | null;
  } | null;
  campanhas: {
    campaignId: string;
    campaignName: string | null;
    spendCurta: number;
    spendLonga: number;
    effectiveStatus: string | null;
    ultimoDiaComSpend: string | null;
  }[];
}

export interface PendenciaDoPanorama {
  stageId: string;
  codigo: string;
  mensagem: string;
  /**
   * ⚠️ AC4: `"cadeia"` é repasse literal do backend, citável como fato apurado
   * lá. `"panorama"` é conclusão do endpoint da 44.20, derivada por comparação.
   * A tela pode renderizar os dois igual, mas não pode atribuir o derivado ao
   * backend — quem procurar a frase no código do backend não vai achar.
   */
  origem: "cadeia" | "panorama";
}

export interface PanoramaPayload {
  projectId: string;
  projectName: string;
  clientName: string;
  janelas: {
    curta: { from: string; to: string; dias: number };
    longa: { from: string; to: string; dias: number };
  };
  spendIncludesMetaTax: boolean;
  unidadeDasTaxas: "decimal";
  etapas: EtapaDoPanorama[];
  campanhasOrfas: { campaignId: string; campaignName: string | null; spendCurta: number }[];
  pendencias: PendenciaDoPanorama[];
  totais: {
    /** Das ETAPAS. O gasto das órfãs vem separado em `spendOrfas`. */
    spendCurta: number;
    spendLonga: number;
    /** QA-4420-02: pronto do backend justamente para a tela não derivar (AC8). */
    spendOrfas: number;
    etapasNoAr: number;
    campanhasComGasto: number;
  };
}

/** A linha da tabela do panorama — cinco colunas, e nada mais (AC3). */
export interface LinhaDoPanorama {
  stageId: string;
  funnelName: string;
  stageName: string;
  /** AC2: a etapa aberta aparece MARCADA, nunca removida. */
  ehAtual: boolean;
  noAr: boolean;
  spendCurta: number;
  spendLonga: number;
  /**
   * O rótulo do Resultado. ⚠️ **Muda com a família** (AC3, mesma regra da 44.17
   * AC1): "CAC" na paga, "CPL" na gratuita, `null` fora da aba. Rótulo fixo
   * mente — chamar o CPL de CAC é o erro que o Epic 44 existe para impedir.
   */
  rotuloDoResultado: "CAC" | "CPL" | null;
  resultado: number | null;
  /** `motivo` do `principal`, quando o número não saiu. Cada um pede uma ação. */
  motivoDoResultado: string | null;
  gargalo: { metrica: string; queda: number | null } | null;
  /** AC5: por que a etapa não tem Resultado nem Gargalo. `null` = tem. */
  motivoForaDaAba: string | null;
}

/**
 * Rótulo do número principal, a partir da FAMÍLIA — nunca fixo.
 *
 * ⚠️ Ler `principal.metrica` seria a outra opção, e é pior: nos ramos de
 * ausência o `principal` pode nem existir (etapa fora da aba devolve payload
 * truncado), e aí um rótulo derivado dele viraria `undefined` numa etapa que
 * ainda precisa aparecer na tabela. A família está sempre lá.
 */
export function rotuloDoResultado(
  familia: "paga" | "gratuita" | null,
): "CAC" | "CPL" | null {
  if (familia === "paga") return "CAC";
  if (familia === "gratuita") return "CPL";
  return null;
}

/**
 * Monta as linhas da tabela.
 *
 * `stageIdAtual` marca a etapa aberta. Ela **continua na lista** (AC2): removê-la
 * quebraria a comparação — não dá para comparar contra o que não está na tabela
 * — e faria a soma das linhas não fechar com `totais`.
 */
export function montarLinhasDoPanorama(
  payload: PanoramaPayload,
  stageIdAtual: string,
): LinhaDoPanorama[] {
  const motivoPorEtapa = new Map<string, string>();
  for (const p of payload.pendencias) {
    if (p.codigo === "foraDaAba" && !motivoPorEtapa.has(p.stageId)) {
      motivoPorEtapa.set(p.stageId, p.mensagem);
    }
  }

  return payload.etapas.map((e) => ({
    stageId: e.stageId,
    funnelName: e.funnelName,
    stageName: e.stageName,
    ehAtual: e.stageId === stageIdAtual,
    /**
     * ⚠️ AC3: vem MEDIDO por gasto (`spendCurta > 0`), do backend. A tela não
     * re-deriva de `effectiveStatus`: campanha pausada no meio da janela gastou
     * e conta. Em 27/08, 5 das 13 campanhas do BBE com gasto na semana estavam
     * `PAUSED` — a régua do status perderia 6 das 13.
     */
    noAr: e.noAr,
    spendCurta: e.spendCurta,
    spendLonga: e.spendLonga,
    rotuloDoResultado: rotuloDoResultado(e.familia),
    resultado: e.principal?.valor ?? null,
    motivoDoResultado: e.principal?.motivo ?? null,
    /** AC5: etapa fora da aba mostra `—` em Resultado e Gargalo. */
    gargalo:
      e.familia === null || e.gargalo === null
        ? null
        : { metrica: e.gargalo.metrica, queda: e.gargalo.queda },
    motivoForaDaAba: e.familia === null ? (motivoPorEtapa.get(e.stageId) ?? "") : null,
  }));
}

/** Rótulo humano do elo da cadeia. Só apresentação. */
export const NOME_DA_METRICA: Record<string, string> = {
  cpm: "CPM",
  cpc: "CPC",
  ctr: "CTR",
  connectRate: "Connect Rate",
  convLP: "Conv. LP",
};

/**
 * As pendências agrupadas para render, preservando a MENSAGEM ORIGINAL (AC4).
 *
 * ⚠️ Não reescrever: os sete motivos pedem ações diferentes ("não tem fonte
 * conectada" manda configurar; "o cache ainda não foi computado" manda esperar),
 * e colapsá-los foi o defeito do chamado de 2026-08-14 que a Story 36.9 AC5
 * fechou.
 */
export interface PendenciaNaTela extends PendenciaDoPanorama {
  /** Nome da etapa, para a linha fazer sentido fora do contexto dela. */
  stageName: string;
  funnelName: string;
}

export function montarPendencias(payload: PanoramaPayload): PendenciaNaTela[] {
  const nomes = new Map(payload.etapas.map((e) => [e.stageId, e]));
  return payload.pendencias.map((p) => ({
    ...p,
    stageName: nomes.get(p.stageId)?.stageName ?? "—",
    funnelName: nomes.get(p.stageId)?.funnelName ?? "—",
  }));
}
