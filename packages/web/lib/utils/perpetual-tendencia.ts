/**
 * Story 29.54 — ROAS e Margem dos últimos 1, 3 e 7 dias.
 *
 * O card mostra hoje um número só: o do período inteiro filtrado. Num perpétuo
 * que roda há 40 dias esse número carrega o passado — uma campanha que virou
 * nos últimos 3 dias fica invisível atrás dele, e uma que já morreu continua
 * sustentada pelo que rendeu semanas atrás. Quem opera precisa da direção.
 *
 * Em `lib/utils` porque é o único diretório que o runner do pacote executa
 * (`vitest.config.ts`, `environment: node`). A regra é a parte que pode estar
 * errada em silêncio; o JSX em volta dela, não.
 */

/** As três janelas do bloco, da mais curta para a mais longa. */
export const JANELAS_TENDENCIA = [1, 3, 7] as const;

const MS_DIA = 86_400_000;

/**
 * Um dia da série do dashboard.
 *
 * ⚠️ `spend` chega COM o imposto de mídia — é o `spend` de `dailyChartData`,
 * que já passou por `applyMetaTax`. Aplicá-lo de novo aqui repetiria a contagem
 * dupla que a Story 29.27 corrigiu neste exato caminho.
 *
 * `margin` é a margem líquida do dia (`receita × (1 − fee) − investimento`) e é
 * ADITIVA — por isso a margem da janela é a soma dos dias, não uma reconta.
 */
export interface PontoDiario {
  dateIso: string;
  spend: number;
  revenue: number;
  margin: number;
}

export interface JanelaTendencia {
  /** 1, 3, 7 — ou o total de dias, na coluna "Período". */
  dias: number;
  /**
   * Dias do calendário que a janela realmente cobre.
   *
   * Menor que `dias` quando o período filtrado é mais curto que a janela. É o
   * que o AC6 exige declarar: `7d` num range de 4 dias não pode se apresentar
   * como uma semana.
   */
  diasCobertos: number;
  /** AC6: o período é mais curto que a janela. */
  parcial: boolean;
  spend: number;
  revenue: number;
  /** `null` quando não houve investimento — dividir por zero não é "0x". */
  roas: number | null;
  margem: number;
}

export interface Tendencia {
  /** Na ordem de `JANELAS_TENDENCIA`. */
  janelas: JanelaTendencia[];
  /** O período inteiro filtrado — a coluna que ancora a leitura (AC4). */
  periodo: JanelaTendencia;
  /** Último dia COM DADO dentro do range. A âncora de todas as janelas. */
  fim: string;
  /** Dias corridos entre o primeiro e o último dia com dado, inclusive. */
  diasDoPeriodo: number;
}

function somar(pontos: PontoDiario[], dias: number, diasCobertos: number): JanelaTendencia {
  let spend = 0;
  let revenue = 0;
  let margem = 0;
  for (const p of pontos) {
    spend += p.spend;
    revenue += p.revenue;
    margem += p.margin;
  }
  return {
    dias,
    diasCobertos,
    parcial: diasCobertos < dias,
    spend,
    revenue,
    /**
     * AC2 — RAZÃO DE SOMAS, nunca média de médias.
     *
     * `média(roas_dia)` parece equivalente e não é: um dia com R$ 5 de
     * investimento e uma venda produz um ROAS de 100x que sequestra a média da
     * semana inteira. Regra já estabelecida no projeto — a mesma que fez as
     * taxas por criativo serem re-derivadas dos somatórios.
     */
    roas: spend > 0 ? revenue / spend : null,
    margem,
  };
}

/**
 * Calcula as janelas a partir da série diária do dashboard.
 *
 * **AC1 — a âncora é o fim do PERÍODO FILTRADO, não "hoje".** Se ancorasse em
 * hoje, o bloco passaria a contradizer o resto da tela no instante em que o
 * usuário filtrasse um período passado: os cards falariam de julho e a
 * tendência, dos últimos 7 dias de agosto.
 *
 * **Dias corridos, não dias com dado.** A janela `7d` é a semana que termina no
 * último dia com dado — um domingo sem investimento e sem venda continua sendo
 * um dos sete. Contar só os dias com dado faria "7 dias" significar duas
 * semanas num funil que roda em dias alternados, e o denominador do ROAS mudaria
 * de sentido sem nada na tela indicando.
 *
 * Devolve `null` quando não há nenhum dia — nada a mostrar é diferente de zero.
 */
export function calcularTendencia(
  pontos: PontoDiario[],
  janelas: readonly number[] = JANELAS_TENDENCIA,
): Tendencia | null {
  const validos = pontos.filter((p) => !!p.dateIso).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  if (validos.length === 0) return null;

  const fim = validos[validos.length - 1]!.dateIso;
  const inicio = validos[0]!.dateIso;
  const fimMs = Date.parse(`${fim}T00:00:00Z`);
  const inicioMs = Date.parse(`${inicio}T00:00:00Z`);
  if (!Number.isFinite(fimMs) || !Number.isFinite(inicioMs)) return null;

  const diasDoPeriodo = Math.round((fimMs - inicioMs) / MS_DIA) + 1;

  const janelasCalculadas = janelas.map((n) => {
    // Aritmética em UTC: `setDate` no fuso local atravessa horário de verão e
    // produziria janela de 6 ou 8 dias uma vez por ano (mesma razão da 29.44).
    const corte = new Date(fimMs - (n - 1) * MS_DIA).toISOString().slice(0, 10);
    const dentro = validos.filter((p) => p.dateIso >= corte);
    return somar(dentro, n, Math.min(n, diasDoPeriodo));
  });

  return {
    janelas: janelasCalculadas,
    periodo: somar(validos, diasDoPeriodo, diasDoPeriodo),
    fim,
    diasDoPeriodo,
  };
}

/**
 * Story 29.54 (AC5) — a mesma tendência, por entidade.
 *
 * Recebe o `byDate` de uma `EntitySeries` (campanha, público ou criativo) e
 * devolve as mesmas janelas do bloco agregado. A agregação é a mesma função:
 * uma segunda implementação "por entidade" divergiria da primeira no dia em que
 * a regra da janela mudasse, e a tela mostraria dois números para a mesma
 * pergunta em alturas diferentes.
 *
 * ⚠️ A âncora é passada de fora (`fimDoPeriodo`), não deduzida dos dias da
 * entidade. Sem isso, uma campanha que parou há duas semanas teria a "janela de
 * 1 dia" ancorada no último dia DELA — e apareceria ao lado de outra ancorada
 * em ontem, como se as duas falassem do mesmo tempo. Entidade sem dado na
 * janela devolve célula vazia (`roas: null`, `spend: 0`), que a UI declara.
 */
export function tendenciaDaEntidade(
  byDate: Record<string, { spend: number | null; revenue: number | null; margin: number | null }>,
  periodo: { inicio: string; fim: string },
  janelas: readonly number[] = JANELAS_TENDENCIA,
): Tendencia | null {
  const pontos: PontoDiario[] = Object.entries(byDate).map(([dateIso, p]) => ({
    dateIso,
    spend: p.spend ?? 0,
    revenue: p.revenue ?? 0,
    margin: p.margin ?? 0,
  }));
  if (pontos.length === 0) return null;

  /**
   * As duas pontas do período entram como dias neutros quando a entidade não
   * tem dado nelas. Zero em tudo não move nenhuma soma, e resolve dois desvios:
   *
   * - **fim**: sem ele, a janela `1d` de uma campanha que parou há duas semanas
   *   ancoraria no último dia DELA e apareceria ao lado de outra ancorada em
   *   ontem, como se as duas falassem do mesmo tempo.
   * - **início**: sem ele, `diasDoPeriodo` sairia do primeiro dia da entidade —
   *   e toda campanha nova exibiria o aviso de janela parcial do AC6, que é
   *   sobre o PERÍODO filtrado ser curto, não sobre a entidade ser recente.
   */
  if (!pontos.some((p) => p.dateIso === periodo.fim)) {
    pontos.push({ dateIso: periodo.fim, spend: 0, revenue: 0, margin: 0 });
  }
  if (!pontos.some((p) => p.dateIso === periodo.inicio)) {
    pontos.push({ dateIso: periodo.inicio, spend: 0, revenue: 0, margin: 0 });
  }
  return calcularTendencia(pontos, janelas);
}

/**
 * A direção de uma janela contra o período — a seta do AC4.
 *
 * Comparar a janela curta com o número do período é o que responde "está
 * melhorando ou piorando?". Empate não vira seta: um delta de zero não é
 * movimento, e pintá-lo de verde ou vermelho inventaria informação.
 *
 * Devolve `null` quando falta uma das pontas (sem investimento na janela, por
 * exemplo) — a célula fica sem seta, não com uma seta neutra que o olho lê como
 * "estável".
 */
export function direcao(valor: number | null, referencia: number | null): "sobe" | "desce" | null {
  if (valor == null || referencia == null) return null;
  if (valor === referencia) return null;
  return valor > referencia ? "sobe" : "desce";
}
