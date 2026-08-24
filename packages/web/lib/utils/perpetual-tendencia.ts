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
 *
 * ## Story 29.57 — a âncora é o último dia FECHADO
 *
 * A 29.54 ancorou as janelas no último dia COM DADO do período, para que
 * filtrar julho não fizesse a tendência falar de agosto. Correto, e incompleto:
 * quando o período inclui HOJE, o último dia com dado é um dia que ainda não
 * terminou.
 *
 * Medido em produção (BBE, 24/08/2026 às 11h):
 *
 * ```
 *   18/08  R$ 1.050,22      22/08  R$   826,77
 *   19/08  R$   859,98      23/08  R$   841,89
 *   20/08  R$   741,55      24/08  R$   308,46   <- hoje, 35% de um dia
 *   21/08  R$   981,43
 * ```
 *
 * A janela de 1 dia lia esses 35% de investimento contra uma receita que a
 * planilha ainda nem tinha recebido — um ROAS estruturalmente pessimista, num
 * quadro cuja função é disparar decisão de corte. As janelas de 3 e 7 dias
 * carregavam o mesmo dia parcial com 1/3 e 1/7 do peso.
 */

/** As três janelas do bloco, da mais curta para a mais longa. */
export const JANELAS_TENDENCIA = [1, 3, 7] as const;

const MS_DIA = 86_400_000;

/**
 * Story 29.57 — o fuso do NEGÓCIO, não o do navegador.
 *
 * Derivar o dia com `getDate()` usa o fuso da máquina de quem abriu a tela. Um
 * gestor viajando, ou um browser configurado em UTC, veria uma tendência
 * diferente da do colega ao lado entre 21h e meia-noite — e nada na tela
 * explicaria. A API já resolveu isso do lado dela (`sale-date.ts`, Story 41.7);
 * esta é a mesma decisão, do lado do web.
 */
export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** `en-CA` formata como `YYYY-MM-DD`, que é exatamente a chave que usamos. */
const formatadorDeDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil de um instante, no fuso do negócio. Independe do `TZ` do processo. */
export function diaDeNegocio(instante: Date): string {
  return formatadorDeDia.format(instante);
}

/** Soma (ou subtrai) dias de uma chave `YYYY-MM-DD`, em aritmética UTC. */
function deslocarDia(dia: string, delta: number): string {
  const ms = Date.parse(`${dia}T00:00:00Z`);
  if (!Number.isFinite(ms)) return dia;
  return new Date(ms + delta * MS_DIA).toISOString().slice(0, 10);
}

/**
 * Story 29.57 (AC1) — o último dia que já terminou, no fuso do negócio.
 *
 * É ONTEM, sempre. Não "hoje se já passou das 23h": a Meta continua reportando
 * entrega do dia corrente depois da meia-noite, e a planilha de vendas chega
 * ainda mais tarde. Um dia só está fechado quando o dia seguinte começou.
 */
export function ultimoDiaFechado(agora: Date = new Date()): string {
  return deslocarDia(diaDeNegocio(agora), -1);
}

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
  /** Último dia COM DADO dentro do range. Define a coluna "Período". */
  fim: string;
  /**
   * Story 29.57 (AC1) — o dia em que as janelas terminam: `min(fim, ontem)`.
   *
   * Igual a `fim` sempre que o período filtrado já acabou. Diferente dele — um
   * dia atrás — quando o filtro inclui o dia corrente, que é o caso do filtro
   * padrão. A UI exibe esta data (AC6): sem ela, a correção seria invisível
   * para quem já desconfiava do número.
   */
  ancora: string;
  /** Dias corridos entre o primeiro e o último dia com dado, inclusive. */
  diasDoPeriodo: number;
  /**
   * Dias corridos entre o primeiro dia e a ÂNCORA, inclusive — o material que
   * as janelas realmente têm. Menor que `diasDoPeriodo` quando o filtro inclui
   * hoje, e é o que faz `7d` se declarar parcial num filtro de 7 dias que
   * termina hoje (AC7): há 7 dias no período, mas só 6 fechados.
   */
  diasFechados: number;
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
 * **AC1 (29.57) — e nunca depois do último dia FECHADO.** A âncora vira
 * `min(fim do período, ontem)`. Quando o período termina no passado nada muda;
 * quando inclui hoje, o dia parcial sai das janelas — mas não da coluna
 * "Período", que representa o que o gestor filtrou (AC3).
 *
 * Devolve `null` quando não há nenhum dia — nada a mostrar é diferente de zero.
 * Também devolve `null` quando o período existe mas não tem nenhum dia fechado
 * (AC5): um filtro só de hoje não tem tendência, e mostrar o dia parcial ali
 * seria exatamente o defeito que esta story corrige.
 */
export function calcularTendencia(
  pontos: PontoDiario[],
  janelas: readonly number[] = JANELAS_TENDENCIA,
  /**
   * Teto da âncora. O default é `ontem`; os testes passam um valor fixo para
   * não depender do relógio, e a UI o injeta para que o bloco agregado e o
   * por-entidade não divirjam se a meia-noite cair entre dois renders.
   */
  ancoraMaxima: string = ultimoDiaFechado(),
): Tendencia | null {
  const validos = pontos.filter((p) => !!p.dateIso).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  if (validos.length === 0) return null;

  const fim = validos[validos.length - 1]!.dateIso;
  const inicio = validos[0]!.dateIso;
  const fimMs = Date.parse(`${fim}T00:00:00Z`);
  const inicioMs = Date.parse(`${inicio}T00:00:00Z`);
  if (!Number.isFinite(fimMs) || !Number.isFinite(inicioMs)) return null;

  const diasDoPeriodo = Math.round((fimMs - inicioMs) / MS_DIA) + 1;

  // AC1 — `min(fim, ontem)`. Comparação lexicográfica: `YYYY-MM-DD` ordena como
  // data, e converter para timestamp só para comparar abriria a porta de fuso
  // que este módulo acabou de fechar.
  const ancora = fim <= ancoraMaxima ? fim : ancoraMaxima;

  // AC5 — período inteiro depois da âncora (o caso típico: filtro só de hoje).
  // Não há dia fechado; não há tendência. `null` é a resposta honesta, e a UI
  // já sabe tratá-la.
  if (ancora < inicio) return null;

  const ancoraMs = Date.parse(`${ancora}T00:00:00Z`);
  if (!Number.isFinite(ancoraMs)) return null;
  const diasFechados = Math.round((ancoraMs - inicioMs) / MS_DIA) + 1;

  const ateAncora = validos.filter((p) => p.dateIso <= ancora);

  const janelasCalculadas = janelas.map((n) => {
    // Aritmética em UTC: `setDate` no fuso local atravessa horário de verão e
    // produziria janela de 6 ou 8 dias uma vez por ano (mesma razão da 29.44).
    const corte = new Date(ancoraMs - (n - 1) * MS_DIA).toISOString().slice(0, 10);
    const dentro = ateAncora.filter((p) => p.dateIso >= corte);
    // AC7 — o teto é o que existe de dia FECHADO, não o tamanho do período.
    return somar(dentro, n, Math.min(n, diasFechados));
  });

  return {
    janelas: janelasCalculadas,
    // AC3 — a coluna "Período" continua sendo o range inteiro, dia parcial
    // incluído. Ela é a referência das setas E o número que precisa bater com
    // os cards; recortá-la faria a tendência contradizer o resto da tela, que é
    // o que a 29.54 tinha acabado de evitar.
    periodo: somar(validos, diasDoPeriodo, diasDoPeriodo),
    fim,
    ancora,
    diasDoPeriodo,
    diasFechados,
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
  /** Story 29.57 (AC4) — a MESMA âncora do bloco agregado, repassada de fora. */
  ancoraMaxima: string = ultimoDiaFechado(),
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
  return calcularTendencia(pontos, janelas, ancoraMaxima);
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
