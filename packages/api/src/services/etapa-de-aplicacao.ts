/**
 * A Etapa de Aplicação — do anúncio à aplicação, da aplicação à venda.
 *
 * ## O funil que ela mede
 *
 * A página tem formulário de aplicação: o tráfego traz a pessoa, ela se aplica,
 * e a venda acontece depois — pelo comercial, por WhatsApp, por onde for. As
 * três coisas moram em lugares diferentes:
 *
 * - **Tráfego**: nas tabelas da Meta, como em qualquer captação.
 * - **Aplicações**: numa planilha de pesquisa, lida ao vivo.
 * - **Vendas**: numa planilha de venda JÁ conectada em outra etapa do funil.
 *
 * Ninguém tinha juntado as três, e é isso que a etapa faz.
 *
 * ## Duas contas diferentes, de propósito
 *
 * `vendas` é tudo que a planilha escolhida registrou no período. `converteram`
 * é quantas dessas vendas têm e-mail de alguém que se aplicou. Os dois números
 * respondem perguntas distintas: o primeiro é o resultado do funil, o segundo é
 * a eficácia do formulário. Mostrar só um esconde o outro — quem vende muito
 * por fora do formulário pareceria ter uma taxa péssima, e quem casa bem
 * pareceria vender pouco.
 *
 * ## Por que a comparação de e-mail é normalizada
 *
 * O mesmo humano digita `Joao@Gmail.com ` no formulário e a Kiwify grava
 * `joao@gmail.com`. Sem normalizar, o casamento falha em silêncio e a taxa de
 * conversão aparece perto de zero — o tipo de erro que faz o time desconfiar da
 * tela inteira.
 */

import { ehOrigemMetaDeLead } from "@loyola-x/shared";

/** Rótulo de quem chegou sem origem. Igual ao resto do app, de propósito. */
export const SEM_ORIGEM = "Sem Track";

/** Uma venda já normalizada, do jeito que esta etapa precisa. */
export interface VendaDaAplicacao {
  /** Normalizado (minúsculo, sem espaço). Vazio quando a planilha não traz. */
  email: string;
  valor: number;
  utmSource: string;
  utmMedium: string;
  /**
   * As outras UTMs, para o filtro.
   *
   * Não aparecem na tela — a quebra é por source e medium. Existem porque a
   * marca que separa "venda desta etapa" das outras costuma estar na campanha
   * ou no content, e filtrar por um campo que não foi lido é impossível.
   */
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  data: Date | null;
  /** Identidade da venda para deduplicar. Ver `dedupKey`. */
  chave: string;
}

/** Uma regra do filtro de UTM configurado na etapa. */
export interface RegraDeUtm {
  campo: "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term";
  /**
   * `igual` para id de conjunto, `contem` para pedaço de nome de campanha.
   *
   * Os dois existem porque as duas coisas aparecem: `120247569245860489`
   * precisa bater inteiro, e "pg04" precisa achar
   * `dg-pg04-ago-26--vendas-captacao--...`.
   */
  modo: "igual" | "contem";
  /** Qualquer um serve. Vazio = a regra não filtra nada. */
  valores: string[];
}

/** Uma aplicação, do jeito que esta etapa precisa. */
export interface AplicacaoDaEtapa {
  email: string;
  data: Date | null;
  /**
   * Story 18.96: o dia do calendário (`aaaa-mm-dd`) em que a aplicação cai na
   * tabela "Dados diários". Sai da célula, não do `data` — ver `diaDaCelula`
   * na rota. Ausente (quem monta a aplicação à mão, como os testes antigos) =
   * o dia de `data` em Brasília.
   */
  dia?: string | null;
  utmSource: string;
  utmMedium: string;
}

/**
 * Story 18.96 (P6): a aplicação veio da Meta? (`meta` / `meta-ads`).
 *
 * Não é o `ehOrigemPagaDeLead` de propósito: lá `google-ads` também é pago,
 * mas o investimento desta etapa é só o da Meta. Dividir o gasto da Meta por
 * aplicações do Google faria o custo por aplicação paga parecer menor do que é.
 * A lista mora no shared porque o web refaz a conta com a API antiga (AC9).
 */
export const ehAplicacaoDaMeta = ehOrigemMetaDeLead;

export interface ContagemDeAplicacoes {
  total: number;
  /** Só as da Meta (`ehAplicacaoDaMeta`). */
  pagas: number;
}

/**
 * Story 18.96 (AC8): as aplicações dia a dia, para a tabela "Dados diários".
 *
 * `semData` existe porque a linha sem data reconhecível ENTRA no período
 * (`dentroDoPeriodo`) e, portanto, no card "Aplicações" — mas não cai em dia
 * nenhum. Sem esse balde, a soma dos dias nunca fecharia com o card.
 */
export interface DiarioDeAplicacoes {
  dias: Record<string, ContagemDeAplicacoes>;
  semData: ContagemDeAplicacoes;
}

const FUSO_DO_DIA = "America/Sao_Paulo";

/**
 * O dia de um instante em Brasília, `aaaa-mm-dd`.
 *
 * É o fuso em que a Meta entrega o dia das contas do time. O fuso do servidor
 * não serve: em UTC, uma aplicação das 22h de Brasília cairia no dia seguinte e
 * o custo daquele dia sairia errado.
 */
export function diaEmBrasilia(instante: Date): string {
  // en-CA formata como aaaa-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_DO_DIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Story 18.96 (QA REQ-001) — a linha entra na janela do seletor?
 *
 * `inicio` é `inicioDaJanela(days)` — a régua do shared (18.80), a mesma da
 * Meta: `hoje − (days−1)` até hoje. A primeira versão cortava em `hoje − days`
 * e contava N+1 dias de aplicação contra N dias de gasto: o custo por aplicação
 * saía otimista, o mesmo erro que a 18.80 tirou das outras telas.
 *
 * Compara o DIA (`aaaa-mm-dd`), não o instante: assim o corte e a tabela
 * diária leem a mesma coisa, inclusive com célula em UTC (`…Z`). Sem dia, a
 * linha entra — a regra de `dentroDoPeriodo`.
 */
export function entraNaJanela(dia: string | null, inicio: string | null): boolean {
  return !dia || !inicio || dia >= inicio;
}

/**
 * Conta as aplicações por dia e as sem data.
 *
 * Recebe o MESMO array que `resumir` recebe: por construção,
 * Σ `dias[*].total` + `semData.total` = `resumo.aplicacoes`.
 */
export function diarioDeAplicacoes(aplicacoes: AplicacaoDaEtapa[]): DiarioDeAplicacoes {
  const dias: Record<string, ContagemDeAplicacoes> = {};
  const semData: ContagemDeAplicacoes = { total: 0, pagas: 0 };
  for (const a of aplicacoes) {
    const dia = a.dia !== undefined ? a.dia : a.data ? diaEmBrasilia(a.data) : null;
    const balde = dia ? (dias[dia] ??= { total: 0, pagas: 0 }) : semData;
    balde.total += 1;
    if (ehAplicacaoDaMeta(a.utmSource)) balde.pagas += 1;
  }
  return { dias, semData };
}

export interface QuebraPorOrigem {
  origem: string;
  vendas: number;
  valor: number;
  /** Aplicações com esta origem — permite ver conversão por canal. */
  aplicacoes: number;
  /**
   * Aplicações DESTA origem cujo e-mail aparece numa venda.
   *
   * É o numerador certo da conversão por canal. A primeira versão dividia
   * `vendas ÷ aplicações` e produzia coisas como "1 aplicação, 4 vendas,
   * 400%" — o número existia, mas não significava nada: as vendas de uma
   * origem não são necessariamente de quem se aplicou por ela. Uma venda pode
   * chegar por WhatsApp de alguém que se aplicou pelo Meta.
   */
  converteram: number;
}

export interface ResumoDaAplicacao {
  aplicacoes: number;
  vendas: number;
  valorTotal: number;
  /** Vendas cujo e-mail bate com alguém que se aplicou. */
  converteram: number;
  /**
   * `converteram ÷ aplicacoes`, em %. `null` sem aplicação no período — zero
   * ali significaria "ninguém converteu", que é outra coisa.
   */
  taxaDeConversao: number | null;
  porUtmSource: QuebraPorOrigem[];
  porUtmMedium: QuebraPorOrigem[];
}

/**
 * O e-mail comparável.
 *
 * Minúsculo e sem espaço nas pontas — o suficiente para casar o que o humano
 * digitou com o que o gateway gravou. Não removemos pontos do Gmail nem o
 * sufixo `+tag`: são endereços diferentes para todo o resto do sistema, e
 * inventar equivalência aqui faria esta tela discordar das outras.
 */
export function emailComparavel(valor: string | null | undefined): string {
  return (valor ?? "").trim().toLowerCase();
}

/**
 * Limpa o valor de UTM.
 *
 * Planilha alimentada por automação traz `null`, `undefined`, `-` e `n/a` como
 * TEXTO. Deixar passar criaria uma origem chamada "null" ao lado de "Sem
 * Track", partindo o mesmo grupo em dois.
 */
export function sanitizarUtm(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpo = String(valor).trim();
  if (!limpo) return null;
  const minusculo = limpo.toLowerCase();
  if (["null", "undefined", "-", "n/a", "na"].includes(minusculo)) return null;
  return limpo;
}

/**
 * A identidade da venda, para não contar duas vezes.
 *
 * Com `transactionId` mapeado, ele manda: o gateway repete a mesma transação em
 * retry, e duas linhas iguais não são duas vendas. Sem ele, cada linha é uma
 * venda — recompra do mesmo cliente é venda de verdade e não pode colapsar por
 * e-mail.
 */
export function dedupKey(
  planilhaId: string,
  linha: number,
  transactionId: string | null | undefined,
): string {
  const tx = (transactionId ?? "").trim();
  return tx ? `${planilhaId}|tx|${tx}` : `${planilhaId}|linha|${linha}`;
}

/**
 * Parece um id de entidade da Meta?
 *
 * O padrão Loyola põe o `adset_id` no `utm_medium`, então a tabela de origem
 * enche de linhas como `120247234267040489` — que não dizem nada a ninguém. Os
 * ids da Meta são numéricos e longos; 15 dígitos é o piso seguro, e evita
 * confundir com um `utm_medium` legítimo tipo `2026` ou `01`.
 */
export function pareceIdDaMeta(valor: string): boolean {
  return /^\d{15,}$/.test(valor.trim());
}

/**
 * Troca o id pelo nome do conjunto, quando houver.
 *
 * O nome VAI JUNTO com o id quando os dois existem? Não: o nome sozinho é o
 * que se lê, e quem precisa do id já sabe onde encontrá-lo. Poluir a coluna
 * com `01_ig-fb_lal1-bbe (120247569245860489)` desfaria o ganho.
 *
 * Id sem nome no cache fica como está — inventar "Conjunto desconhecido"
 * esconderia qual é, e é justamente o id que permite ir procurar na Meta.
 */
export function comNomeLegivel(
  quebra: QuebraPorOrigem[],
  nomes: Map<string, string>,
): QuebraPorOrigem[] {
  return quebra.map((linha) => {
    if (!pareceIdDaMeta(linha.origem)) return linha;
    const nome = nomes.get(linha.origem);
    return nome ? { ...linha, origem: nome } : linha;
  });
}

/** Os ids da Meta que aparecem numa quebra — o que buscar no cache. */
export function idsDaMeta(...quebras: QuebraPorOrigem[][]): string[] {
  const vistos = new Set<string>();
  for (const q of quebras) {
    for (const l of q) if (pareceIdDaMeta(l.origem)) vistos.add(l.origem);
  }
  return [...vistos];
}

/** Está dentro da janela? Sem data, a venda ENTRA — ver o porquê abaixo. */
export function dentroDoPeriodo(
  data: Date | null,
  de: Date | null,
  ate: Date | null,
): boolean {
  // Linha sem data reconhecível entra na conta. Descartá-la sumiria com receita
  // real por causa de uma célula mal formatada, e o total deixaria de bater com
  // a planilha que o time abre para conferir.
  if (!data) return true;
  if (de && data < de) return false;
  if (ate && data > ate) return false;
  return true;
}

function acumular(
  mapa: Map<string, QuebraPorOrigem>,
  origem: string,
  campo: "vendas" | "aplicacoes" | "converteram",
  valor: number,
): void {
  const atual = mapa.get(origem) ?? {
    origem,
    vendas: 0,
    valor: 0,
    aplicacoes: 0,
    converteram: 0,
  };
  atual[campo] += 1;
  atual.valor += valor;
  mapa.set(origem, atual);
}

/** Maior valor primeiro — é a ordem em que se lê uma tabela de origem. */
function ordenar(mapa: Map<string, QuebraPorOrigem>): QuebraPorOrigem[] {
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.vendas - a.vendas);
}

/**
 * A venda pertence a esta etapa?
 *
 * ## Como as regras se combinam
 *
 * Valores dentro da mesma regra são OU — "utm_source é meta OU google".
 * Regras diferentes são E — "utm_source é meta E utm_campaign contém pg04".
 * É a combinação que as pessoas esperam de um filtro, e a única que permite
 * dizer "só o tráfego pago desta campanha" sem escrever uma expressão.
 *
 * ## Sem regras, tudo entra
 *
 * O padrão é não filtrar. Uma etapa recém-criada mostra o que a planilha tem,
 * e a pessoa aperta o filtro quando descobre que veio venda demais — não o
 * contrário, que exigiria configurar antes de ver qualquer coisa.
 *
 * ## Campo ausente NÃO passa
 *
 * Venda sem `utm_campaign` não casa com uma regra de campanha. É o oposto do
 * que fizemos com data (venda sem data entra), e de propósito: ali a ausência
 * era erro de formatação, aqui é a evidência de que a venda não veio por onde
 * a regra descreve.
 */
export function pertenceAEtapa(venda: VendaDaAplicacao, regras: RegraDeUtm[]): boolean {
  if (regras.length === 0) return true;

  const valorDe = (campo: RegraDeUtm["campo"]): string => {
    switch (campo) {
      case "utm_source":
        return venda.utmSource;
      case "utm_medium":
        return venda.utmMedium;
      case "utm_campaign":
        return venda.utmCampaign ?? "";
      case "utm_content":
        return venda.utmContent ?? "";
      case "utm_term":
        return venda.utmTerm ?? "";
    }
  };

  for (const regra of regras) {
    const procurados = regra.valores.map((v) => v.trim().toLowerCase()).filter(Boolean);
    // Regra sem valor não é regra: ignorá-la é melhor que zerar a tela porque
    // alguém deixou um campo em branco no formulário de configuração.
    if (procurados.length === 0) continue;

    const atual = valorDe(regra.campo).trim().toLowerCase();
    if (!atual) return false;

    const casou = procurados.some((p) => (regra.modo === "contem" ? atual.includes(p) : atual === p));
    if (!casou) return false;
  }

  return true;
}

/**
 * Junta aplicações e vendas num resumo.
 *
 * Função pura: recebe as duas listas já lidas e devolve os números. É onde mora
 * toda a regra, e é o que os testes cobrem — ler planilha é I/O e fica na rota.
 */
export function resumir(
  aplicacoes: AplicacaoDaEtapa[],
  vendas: VendaDaAplicacao[],
): ResumoDaAplicacao {
  const vistas = new Set<string>();
  const emailsQueAplicaram = new Set(
    aplicacoes.map((a) => a.email).filter((e) => e.length > 0),
  );

  const porSource = new Map<string, QuebraPorOrigem>();
  const porMedium = new Map<string, QuebraPorOrigem>();

  // As aplicações entram na quebra primeiro: assim uma origem que trouxe
  // aplicação e nenhuma venda continua aparecendo na tabela, em vez de sumir.
  // Origem que só gera aplicação e nunca venda é justamente o que se procura.
  for (const a of aplicacoes) {
    acumular(porSource, a.utmSource || SEM_ORIGEM, "aplicacoes", 0);
    acumular(porMedium, a.utmMedium || SEM_ORIGEM, "aplicacoes", 0);
  }

  let vendasContadas = 0;
  let valorTotal = 0;
  let converteram = 0;
  const emailsQueCompraram = new Set<string>();

  for (const v of vendas) {
    if (vistas.has(v.chave)) continue;
    vistas.add(v.chave);

    vendasContadas += 1;
    valorTotal += v.valor;
    if (v.email && emailsQueAplicaram.has(v.email)) {
      converteram += 1;
      emailsQueCompraram.add(v.email);
    }

    acumular(porSource, v.utmSource || SEM_ORIGEM, "vendas", v.valor);
    acumular(porMedium, v.utmMedium || SEM_ORIGEM, "vendas", v.valor);
  }

  /**
   * A conversão vai na origem da APLICAÇÃO, não na da venda.
   *
   * A pergunta do canal é "este tráfego traz gente que compra?", e quem
   * responde isso é onde a pessoa ENTROU. A origem da venda diz por onde ela
   * pagou — outra informação, útil, mas que não mede o canal.
   */
  for (const a of aplicacoes) {
    if (!a.email || !emailsQueCompraram.has(a.email)) continue;
    acumular(porSource, a.utmSource || SEM_ORIGEM, "converteram", 0);
    acumular(porMedium, a.utmMedium || SEM_ORIGEM, "converteram", 0);
  }

  return {
    aplicacoes: aplicacoes.length,
    vendas: vendasContadas,
    valorTotal,
    converteram,
    // Sem aplicação no período não há taxa. Zero diria "ninguém converteu",
    // que é uma afirmação diferente de "não houve base para calcular".
    taxaDeConversao: aplicacoes.length > 0 ? (converteram / aplicacoes.length) * 100 : null,
    porUtmSource: ordenar(porSource),
    porUtmMedium: ordenar(porMedium),
  };
}
