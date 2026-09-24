// ============================================================
// Story 43.1 — nomes de abas de aplicação.
//
// O gráfico "Aplicações por dia" plotava só as planilhas cadastradas à mão em
// `funnel_spreadsheets`. Quando o time subia uma página nova e criava a aba
// dela, o gráfico seguia mostrando as antigas — sem dizer que estava incompleto.
// Foi assim que a Página C do funil `dg-pg04` ficou invisível.
//
// Este módulo é a parte que decide O QUE ENTRA no gráfico, e por isso mora
// separado da rota: é a única peça verificável sem Google e sem banco.
//
// Tudo aqui é função pura. Nenhuma I/O.
// ============================================================

import { utmContentEfetivo } from "../utils/utm-value.js";
import type { CausaSemLink, LinkDoAnuncio } from "./lp-do-anuncio.js";

/**
 * Sufixo de página no fim do nome da aba.
 *
 * Casa `-PaginaB`, `_pagina c`, ` LPA`, `-página D`. O separador é opcional
 * porque nem toda planilha usa hífen.
 *
 * O `$` é essencial: sem ele, `Pesquisa-Aplicacao-Comercial` casaria em
 * "…-Comercia**l**" por conta do `lp`? Não — mas uma aba chamada
 * `LPA-Resultados` casaria no meio e perderia o resto do nome. Ancorar no fim
 * garante que só o sufixo final seja tratado como marcador de página.
 */
const SUFIXO_PAGINA = /[-_ ]?(p[áa]gina|lp)\s*([a-z])$/i;

/**
 * Remove o sufixo de página do nome da aba, devolvendo o prefixo do grupo.
 *
 * `Pesquisa-Aplicacao-Comercial-PaginaB` → `Pesquisa-Aplicacao-Comercial`
 * `Pesquisa-Aplicacao-Comercial`         → `Pesquisa-Aplicacao-Comercial`
 *
 * NÃO usar "maior prefixo comum" no lugar disto: com uma única planilha
 * cadastrada não existe prefixo comum — ele seria o nome inteiro, e nenhuma
 * outra aba começaria com ele. A descoberta acharia zero abas exatamente no
 * caso em que ela mais importa (lançamento novo, uma planilha só).
 */
export function derivarPrefixo(sheetName: string): string {
  const semSufixo = sheetName.replace(SUFIXO_PAGINA, "");
  // Aba chamada só "PaginaB" viraria string vazia, e prefixo vazio casaria com
  // TODA aba do arquivo. Nesse caso o nome original é o prefixo.
  return semSufixo.trim() === "" ? sheetName : semSufixo;
}

/** Conjunto de prefixos (sem repetição) para um grupo de abas cadastradas. */
export function derivarPrefixos(sheetNames: string[]): string[] {
  const out = new Set<string>();
  for (const n of sheetNames) {
    const p = derivarPrefixo(n);
    if (p) out.add(p);
  }
  return [...out];
}

/**
 * O nome (aba ou label) segue a nomenclatura por página?
 *
 * É a porta de entrada do aviso de LP órfã. Nomear as formas por formulário
 * ("form com ticket" / "form sem ticket") é uso suportado e documentado — num
 * funil desses, "a LPA não tem aba" não significa nada, e o aviso acusaria erro
 * onde está tudo certo. Aviso que aparece com tudo certo ensina o time a
 * ignorar avisos.
 */
export function ehNomeDePagina(nome: string): boolean {
  return SUFIXO_PAGINA.test(nome.trim());
}

/**
 * Letra da página no fim do nome, em maiúscula. `null` quando não é página.
 *
 * `Pesquisa-Aplicacao-Comercial-PaginaC` → `C`
 * `PAGINA C`                             → `C`
 * `form com ticket`                      → `null`
 */
export function letraDaPagina(nome: string): string | null {
  const m = nome.trim().match(SUFIXO_PAGINA);
  return m ? m[2].toUpperCase() : null;
}

/**
 * Label de uma aba DESCOBERTA (não cadastrada), dado o prefixo do grupo.
 *
 * `…-PaginaC` + prefixo → `PAGINA C`
 * `…-FormSemTicket` + prefixo → `FormSemTicket` (sufixo que não é página)
 * aba igual ao prefixo → o próprio nome da aba
 *
 * O último caso é o da aba-base descoberta: acontece quando só a variante com
 * sufixo estava cadastrada e a base aparece pela varredura. Usar o `sheet_name`
 * é o que evita improviso diferente em cada ponto do código.
 */
/**
 * Letras de página das formas do gráfico — ou `null` se alguma não puder ser
 * identificada.
 *
 * Cada forma entra como a lista de nomes que podem identificá-la (label e aba).
 * Basta um deles carregar a letra.
 *
 * O `null` é o ponto todo desta função. A aba-base de um grupo — a que não tem
 * sufixo, como `Pesquisa-Aplicacao-Comercial` — não carrega letra em lugar
 * nenhum quando vem pela descoberta: ela é a "Página A" só por convenção do
 * time, e cravar isso no código seria inventar semântica que a planilha não
 * declara.
 *
 * Enquanto existir uma forma não identificável, não dá para afirmar que uma LP
 * está órfã — essa forma pode ser exatamente a página em questão. Devolver
 * `null` faz o chamador silenciar. Silêncio é falso negativo; o contrário seria
 * acusar erro com a página na tela, que é a armadilha que a Story 43.1 existe
 * para não criar.
 */
export function letrasDasFormas(identificadores: string[][]): string[] | null {
  const letras: string[] = [];
  for (const ids of identificadores) {
    const achada = ids.map(letraDaPagina).find((l): l is string => l !== null);
    if (!achada) return null;
    letras.push(achada);
  }
  return letras;
}

/**
 * Decide quais abas do arquivo entram como formas DESCOBERTAS.
 *
 * Uma aba entra quando começa por algum prefixo do grupo e ainda não está
 * cadastrada. Planilha cadastrada à mão sempre vence: seu `label` é o do banco
 * e ela nunca aparece duplicada como descoberta.
 *
 * Mora aqui, e não na rota, porque é a decisão de "o que entra no gráfico" — a
 * única parte verificável sem Google e sem banco.
 */
export function abasParaDescobrir(
  abasDoArquivo: string[],
  jaCadastradas: string[],
  prefixos: string[],
): { aba: string; prefixo: string }[] {
  const cadastradas = new Set(jaCadastradas);
  const out: { aba: string; prefixo: string }[] = [];
  for (const aba of abasDoArquivo) {
    if (cadastradas.has(aba)) continue;
    const prefixo = prefixos.find((p) => aba.startsWith(p));
    if (!prefixo) continue;
    out.push({ aba, prefixo });
  }
  return out;
}

export function labelDaAbaDescoberta(sheetName: string, prefixo: string): string {
  const letra = letraDaPagina(sheetName);
  if (letra) return `PAGINA ${letra}`;

  const sufixo = sheetName.startsWith(prefixo) ? sheetName.slice(prefixo.length) : "";
  const limpo = sufixo.replace(/^[-_ ]+/, "").trim();
  return limpo === "" ? sheetName : limpo;
}

// ============================================================
// Story 43.6 — a página vem do `utm_term`, não do nome da aba.
//
// A 43.1 assumiu 1 aba = 1 página. Na prática existe a ABA-BASE: o formulário
// genérico onde caem todas as páginas que não ganharam aba própria. No
// `dg-pg04` isso fez uma aplicação da Página C ser contada como Página A; no
// `dg-pg02`, quatro LPs virarem uma série só — e em silêncio, porque o label
// dali (`apc`) não parece nome de página e nem o aviso da 43.1 dispara.
// ============================================================

/** Rótulo das linhas cuja página não dá para saber. */
export const SEM_PAGINA = "Sem página identificada";

/**
 * Letra da LP dentro de um `utm_term`, **ancorada nas fronteiras**.
 *
 * Por que não reusar `extractLPName` (`lp-campaigns.ts:52`): ele é
 * `/lp([a-z])/i`, sem âncora. Em nome de campanha — curto e controlado — isso
 * basta. Num `utm_term`, que é string longa e livre, **`alpha` casa como LPH**
 * (`a-**lp-h**-a`), e `lph` é uma LP real do `dg-pg04`: o falso positivo sairia
 * plausível demais para alguém desconfiar.
 *
 * Aqui a LP só conta quando vem delimitada, que é como ela de fato aparece:
 * `…--estaticos-escassez--lpc|01_FD-ST…`
 *
 * `extractLPName` NÃO foi alterado — ele é consumido por `lpsSemForma` e pela
 * Story 18.44, e mudar semântica compartilhada não é escopo desta story.
 */
const LP_ANCORADA = /(?:^|[-_|\s])lp([a-z])(?=$|[-_|\s])/i;

export function letraDaLpNoUtmTerm(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = texto.match(LP_ANCORADA);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Índice da coluna que carrega o `utm_term` — a **preenchida**, não a primeira
 * homônima.
 *
 * A aba-base do `dg-pg04` tem TRÊS colunas chamadas `utm_term` (índices 23, 47
 * e 48). Hoje só a 23 tem dados, então `headers.indexOf("utm_term")` acerta —
 * por sorte. No dia em que alguém preencher a 47, ele passa a devolver a coluna
 * errada e o gráfico volta a agrupar errado, sem nenhum sinal.
 *
 * `null` quando nenhuma candidata tem dado: a aba não sabe dizer a página, e o
 * chamador cai no comportamento antigo (aba = série).
 */
export function acharColunaPreenchida(
  headers: string[],
  rows: string[][],
  casa: RegExp,
): number | null {
  const candidatas = headers.map((h, i) => ({ h, i })).filter(({ h }) => casa.test(h.trim()));
  if (!candidatas.length) return null;

  let melhor: { i: number; n: number } | null = null;
  for (const { i } of candidatas) {
    let n = 0;
    for (const r of rows) if ((r[i] ?? "").trim()) n++;
    if (!melhor || n > melhor.n) melhor = { i, n };
  }
  return melhor && melhor.n > 0 ? melhor.i : null;
}

export function acharColunaUtmTerm(headers: string[], rows: string[][]): number | null {
  return acharColunaPreenchida(headers, rows, /utm[_ ]?term/i);
}

/**
 * Story 43.7 — nome e e-mail de quem aplicou.
 *
 * Mesmo problema de homônimas do `utm_term`, e pior: a aba-base do `dg-pg04`
 * tem `name` (16), `Nome` (24) e `name` (40) — só a primeira preenchida. Um
 * `indexOf` acertaria hoje e erraria no dia em que o formulário mudar de versão.
 *
 * Âncoras (`^…$`) de propósito: sem elas, "Nome do produto" ou "email de
 * cobrança" entrariam como se fossem a coluna da pessoa.
 */
export function acharColunaNome(headers: string[], rows: string[][]): number | null {
  return acharColunaPreenchida(headers, rows, /^(nome|name|nome completo|full name)$/i);
}

export function acharColunaEmail(headers: string[], rows: string[][]): number | null {
  return acharColunaPreenchida(headers, rows, /^(e-?mail|e-?mail address|seu e-?mail)$/i);
}

/**
 * Origem declarada da aplicação (`meta`, `ig`, `whatsapp`, `yt`, `mautic`…).
 *
 * É o que a tabela mostra. Não confundir com a fonte da LP: a página continua
 * saindo do `utm_term`, que carrega o nome do anúncio. O `utm_source` diz de
 * qual CANAL a pessoa veio; o `utm_term`, de qual PÁGINA — e trocar um pelo
 * outro na extração faria toda aplicação de Meta virar a mesma página.
 */
export function acharColunaUtmSource(headers: string[], rows: string[][]): number | null {
  return acharColunaPreenchida(headers, rows, /^utm[_ ]?source$/i);
}

/** Linha já reduzida ao que importa para agrupar. */
export interface LinhaParaAgrupar {
  /** Dia já normalizado (YYYY-MM-DD). */
  dia: string;
  /** Texto onde procurar a LP (`utm_term`). Vazio quando a aba não tem a coluna. */
  identificador: string;
}

export interface GrupoDePagina {
  /** Sufixo estável para compor o id da série. */
  chave: string;
  label: string;
  /**
   * A série corresponde a uma página CONHECIDA?
   *
   * É o que alimenta o aviso de LP órfã: uma série que não sabe que página é
   * não pode servir de prova de que a página X tem aplicação — e é justamente
   * essa dúvida que faz o aviso se calar (ver `letrasDasFormas`).
   */
  ehPagina: boolean;
  /**
   * A página desta série foi determinada pelo `utm_term` — e não pelo sufixo da
   * aba?
   *
   * É o sinal de que os números da tela MUDARAM de forma: uma série que antes
   * somava páginas diferentes virou várias. A tela precisa disso para explicar
   * a queda antes que alguém a reporte como regressão (AC4).
   *
   * Distinto de `ehPagina` e de "há órfãs": uma aba-base pode quebrar em três
   * páginas sem sobrar nenhuma linha órfã — e os números mudam do mesmo jeito.
   * Foi o furo QA-43.6-01, onde `aplicacoesSemPagina` estava fazendo este
   * trabalho e falhava exatamente nesse caso.
   */
  veioDoUtmTerm: boolean;
  counts: Map<string, number>;
  total: number;
}

/**
 * Agrupa as linhas de UMA aba nas séries que vão para o gráfico.
 *
 * | Caso | Resultado |
 * |---|---|
 * | aba com sufixo de página (`…-PaginaB`) | uma série só — o nome já declarou a página (AC1) |
 * | aba-base com LP no `utm_term` | uma série por LP + `SEM_PAGINA` para o resto (AC2/AC3) |
 * | aba-base sem nenhuma LP | uma série só, como antes (AC9) |
 *
 * **A porta de entrada da quebra é a presença de LP nas linhas — não a grafia
 * do label.** Usar o nome da aba aqui excluiria o `dg-pg02`, cujo label é
 * `apc` e que roda quatro LPs numa aba-base só: exatamente o caso que esta
 * story existe para corrigir.
 */
export function agruparPorPagina(
  sheetName: string,
  labelDaAba: string,
  linhas: LinhaParaAgrupar[],
): GrupoDePagina[] {
  const soma = (ls: LinhaParaAgrupar[]) => {
    const counts = new Map<string, number>();
    for (const l of ls) counts.set(l.dia, (counts.get(l.dia) ?? 0) + 1);
    return counts;
  };
  const serieUnica = (ehPagina: boolean): GrupoDePagina[] => [
    {
      chave: "todas",
      label: labelDaAba,
      ehPagina,
      // Série única = nada mudou de forma, venha ela do sufixo (AC1) ou da
      // ausência de LP (AC9).
      veioDoUtmTerm: false,
      counts: soma(linhas),
      total: linhas.length,
    },
  ];

  // AC1 — o sufixo da aba é declaração explícita da página. O `utm_term` não
  // sobrepõe: quem criou a aba já disse a que página ela pertence, e as linhas
  // sem UTM dela pertencem a ela também.
  const letraDaAba = letraDaPagina(sheetName);
  if (letraDaAba) return serieUnica(true);

  const porLetra = new Map<string, LinhaParaAgrupar[]>();
  const orfas: LinhaParaAgrupar[] = [];
  for (const l of linhas) {
    const letra = letraDaLpNoUtmTerm(l.identificador);
    if (!letra) orfas.push(l);
    else porLetra.set(letra, [...(porLetra.get(letra) ?? []), l]);
  }

  // AC9 — nenhuma LP identificada: a aba não fala a língua de páginas (ou não
  // tem a coluna). Mantém o gráfico como está, em vez de trocar uma série que
  // funcionava por um "Sem página identificada" solitário.
  //
  // `ehPagina: false` preserva a guarda da 43.1: enquanto uma série não souber
  // que página é, o aviso de LP órfã continua calado.
  if (porLetra.size === 0) return serieUnica(false);

  const grupos: GrupoDePagina[] = [...porLetra.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letra, ls]) => ({
      chave: `LP${letra}`,
      label: `PAGINA ${letra}`,
      ehPagina: true,
      veioDoUtmTerm: true,
      counts: soma(ls),
      total: ls.length,
    }));

  // AC3 — o que não deu para atribuir continua no gráfico. Descartar trocaria
  // um número errado por um número menor e igualmente errado; o total da tela
  // não pode mudar por causa desta story.
  if (orfas.length) {
    grupos.push({
      chave: "sem-pagina",
      label: SEM_PAGINA,
      ehPagina: false,
      // Não é página, então não "veio do utm_term" — quem sinaliza a quebra são
      // as séries de página acima. Esta pode existir sozinha? Não: se nenhuma
      // linha tivesse LP, o AC9 já teria devolvido série única.
      veioDoUtmTerm: false,
      counts: soma(orfas),
      total: orfas.length,
    });
  }
  return grupos;
}

// ============================================================
// Story 18.84 — a página da aplicação é o LINK DO ANÚNCIO (página de vendas).
//
// A 43.6 agrupava pela letra (sufixo da aba ou `lpX` no `utm_term`). A 18.83
// levou a tabela de LPs do lançamento para a URL de destino do anúncio, e a
// 7.7 pediu que as aplicações mudassem junto; a 7.10 decidiu que a página de
// uma aplicação é a página de VENDAS — o link do anúncio de onde ela veio:
// `utm_content → ad_id → meta_ad_creatives_cache → normalizeLpUrl`.
//
// O nome da aba e a letra do `utm_term` deixam de ser chave (PO-01: a regra
// de "sem link" da 7.6, aplicada pela 7.7). Aplicação sem anúncio de origem
// (orgânica, link na bio, vazia, macro) vai para "Sem link resolvido" com a
// causa — nunca somada calada numa página, nunca descartada do total.
// ============================================================

/**
 * A coluna do `utm_content` — a PREENCHIDA (PO-08), como a do `utm_term`: a
 * aba-base do `dg-pg04` tem colunas homônimas. Apelidos do web
 * (`useCrossReferenceLeads`): `utm_content`, `content`, `co=`.
 */
export function acharColunaUtmContent(headers: string[], rows: string[][]): number | null {
  return acharColunaPreenchida(headers, rows, /^(utm[_ ]?content|content|co=)$/i);
}

/**
 * O anúncio de origem da aplicação, ou `null` quando ela não veio de anúncio.
 *
 * `utm_content` de anúncio é o `ad_id` — só dígitos (com o `_` de texto
 * forçado já tirado por `utmContentEfetivo`). O resto é origem sem anúncio:
 * `org`, `link_in_bio`, texto solto, vazio, macro não resolvida (`{{ad.id}}`,
 * que `utmContentEfetivo` já devolve vazia).
 */
export function anuncioDaAplicacao(conteudoCru: string | null | undefined): string | null {
  const id = utmContentEfetivo(conteudoCru);
  return /^\d+$/.test(id) ? id : null;
}

/** Rótulo da série e da coluna das aplicações sem página (mesmo da 18.83). */
export const SEM_LINK_RESOLVIDO = "Sem link resolvido";

/**
 * Por que as aplicações da série "Sem link resolvido" estão ali (AC2/PO-02).
 * As três causas de anúncio são as da 18.83/29.43, cada uma com uma ação; a
 * quarta é própria da aplicação: não veio de anúncio nenhum.
 */
export interface SemLinkDaAplicacao {
  /** Orgânica, link na bio, texto, vazia, macro não resolvida. */
  semAnuncio: number;
  foraDoCache: number;
  cacheDesatualizado: number;
  semLinkNaMeta: number;
}

export type CausaSemLinkDaAplicacao = "sem_anuncio" | CausaSemLink;

export interface LinhaPorLink {
  /** Dia já normalizado (YYYY-MM-DD). */
  dia: string;
  /** `anuncioDaAplicacao` da linha. `null` = sem anúncio de origem. */
  adId: string | null;
}

export interface GrupoDeLink {
  /** Sufixo estável do id da série: a URL normalizada, ou `sem-link`. */
  chave: string;
  /** O que a tela mostra: a URL normalizada (link puro) ou "Sem link resolvido". */
  label: string;
  /** `href` da série. `null` na série sem link. */
  url: string | null;
  /** É página conhecida? Só as de URL — a série sem link não prova nada (AC4). */
  ehPagina: boolean;
  counts: Map<string, number>;
  total: number;
  /** Só na série "Sem link resolvido". */
  semLink?: SemLinkDaAplicacao;
}

/** A causa de UMA aplicação sem página. `null` = ela tem página. */
export function causaDaAplicacao(
  adId: string | null,
  links: Map<string, LinkDoAnuncio>,
): CausaSemLinkDaAplicacao | null {
  if (!adId) return "sem_anuncio";
  const link = links.get(adId);
  if (!link) return "fora_do_cache";
  return link.chave ? null : (link.causa ?? "sem_link_na_meta");
}

/**
 * Agrupa as aplicações pela URL do anúncio de origem (AC1).
 *
 * Invariante (AC5): a soma dos `total` das séries é o número de linhas —
 * nenhuma aplicação some e nenhuma é contada duas vezes.
 */
export function agruparPorLink(
  linhas: LinhaPorLink[],
  links: Map<string, LinkDoAnuncio>,
): GrupoDeLink[] {
  const porUrl = new Map<string, { url: string | null; counts: Map<string, number>; total: number }>();
  const semLink: SemLinkDaAplicacao = { semAnuncio: 0, foraDoCache: 0, cacheDesatualizado: 0, semLinkNaMeta: 0 };
  const semLinkCounts = new Map<string, number>();
  let semLinkTotal = 0;

  for (const l of linhas) {
    const causa = causaDaAplicacao(l.adId, links);
    if (causa) {
      if (causa === "sem_anuncio") semLink.semAnuncio++;
      else if (causa === "fora_do_cache") semLink.foraDoCache++;
      else if (causa === "cache_desatualizado") semLink.cacheDesatualizado++;
      else semLink.semLinkNaMeta++;
      semLinkCounts.set(l.dia, (semLinkCounts.get(l.dia) ?? 0) + 1);
      semLinkTotal++;
      continue;
    }
    const link = links.get(l.adId!)!;
    const chave = link.chave!;
    const g = porUrl.get(chave) ?? { url: link.url, counts: new Map<string, number>(), total: 0 };
    g.counts.set(l.dia, (g.counts.get(l.dia) ?? 0) + 1);
    g.total++;
    porUrl.set(chave, g);
  }

  const grupos: GrupoDeLink[] = [...porUrl.entries()]
    // Maior primeiro; empate pela URL, para a ordem (e a cor) não dançar.
    .sort(([ka, a], [kb, b]) => b.total - a.total || ka.localeCompare(kb))
    .map(([chave, g]) => ({ chave, label: chave, url: g.url, ehPagina: true, counts: g.counts, total: g.total }));

  if (semLinkTotal > 0) {
    grupos.push({
      chave: "sem-link",
      label: SEM_LINK_RESOLVIDO,
      url: null,
      ehPagina: false,
      counts: semLinkCounts,
      total: semLinkTotal,
      semLink,
    });
  }
  return grupos;
}

/**
 * AC4 — páginas com gasto e sem aplicação.
 *
 * `comGasto` são as URLs dos anúncios das campanhas da ETAPA DE VENDAS com
 * gasto nos últimos 30 dias (PO-05); `comAplicacao`, as URLs que têm ao menos
 * uma aplicação. Aplicação sem link não prova forma para página nenhuma (é o
 * `semPagina` de antes) — ela não entra em `comAplicacao`.
 */
export function paginasOrfas(comGasto: Iterable<string>, comAplicacao: Iterable<string>): string[] {
  const tem = new Set(comAplicacao);
  return [...new Set(comGasto)].filter((u) => !tem.has(u)).sort();
}

/**
 * A porta de entrada do aviso de página órfã no mundo das URLs (substitui a
 * da 43.1, `nomes.some(ehNomeDePagina)`, que era da língua das letras).
 *
 * - Etapa sem campanha vinculada → sem aviso (PO-05). Cair para as campanhas
 *   do funil traria as páginas de CAPTURA de volta, e toda captura seria
 *   acusada a cada abertura.
 * - Nenhuma aplicação com link → sem aviso. A planilha não carrega o anúncio de
 *   origem (ou não tem a coluna), então "a página X não teve aplicação" não é
 *   afirmável: é a mesma dúvida que calava o aviso da 43.1 quando uma forma não
 *   tinha letra. No `dg-pg02` (0 de 49 com link) isto evita acusar todas as
 *   páginas de venda que tiverem gasto.
 */
export function avisoDeOrfasSeAplica(campanhasDaEtapa: number, aplicacoesComLink: number): boolean {
  return campanhasDaEtapa > 0 && aplicacoesComLink > 0;
}

/**
 * As linhas das planilhas de aplicação como objetos crus `coluna → valor`.
 *
 * "Cru" é o ponto: a tela de match de origem deixa escolher QUALQUER coluna
 * para analisar os leads sem origem, então reduzir a linha aos campos que a
 * tabela de aplicações usa (nome, e-mail, utm_term) tiraria justamente as
 * colunas que servem para recuperar a origem — um `utm_medium`, um campo do
 * formulário, o nome da aba.
 *
 * Colunas homônimas seguem a mesma regra do resto do arquivo: a PREENCHIDA
 * vence. Nestas planilhas, três colunas `utm_term` com dado só na primeira é a
 * norma, e um objeto com a última venceria o dado bom.
 */
export interface LinhasBrutas {
  linhas: Record<string, string>[];
  /** Nomes de coluna com algum conteúdo, para o seletor de "analisar por". */
  colunas: string[];
  semPlanilha: boolean;
}

export async function carregarLinhasBrutas(
  fastify: {
    db: {
      select: (...a: never[]) => {
        from: (...a: never[]) => { where: (...a: never[]) => Promise<Record<string, unknown>[]> };
      };
    };
    log: { warn: (o: unknown, m: string) => void };
  },
  funnelId: string,
): Promise<LinhasBrutas> {
  const { funnelSpreadsheets } = await import("../db/schema.js");
  const { and, eq } = await import("drizzle-orm");
  const { readSheetData } = await import("./google-sheets.js");

  const sheets = (await (fastify.db as unknown as {
    select: () => {
      from: (t: unknown) => { where: (c: unknown) => Promise<
        { spreadsheetId: string; sheetName: string; label: string }[]
      > };
    };
  })
    .select()
    .from(funnelSpreadsheets)
    .where(
      and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, "applications")),
    )) as { spreadsheetId: string; sheetName: string; label: string }[];

  if (sheets.length === 0) return { linhas: [], colunas: [], semPlanilha: true };

  const linhas: Record<string, string>[] = [];
  const preenchidas = new Set<string>();

  for (const s of sheets) {
    let data: { headers: string[]; rows: string[][] };
    try {
      data = await readSheetData(s.spreadsheetId, s.sheetName);
    } catch (error) {
      // Uma aba ilegível não pode derrubar o diagnóstico das outras: o número
      // sai menor, e o aviso de planilha já existe na tela de aplicações.
      fastify.log.warn({ err: error, aba: s.sheetName }, "[match-origem] aba ilegível");
      continue;
    }

    for (const row of data.rows) {
      const obj: Record<string, string> = { __aba: s.label };
      data.headers.forEach((h, i) => {
        const nome = (h ?? "").trim();
        if (!nome) return;
        const valor = (row[i] ?? "").trim();
        // Homônimas: só sobrescreve se a nova tiver conteúdo.
        if (valor || obj[nome] === undefined) obj[nome] = valor;
        if (valor) preenchidas.add(nome);
      });
      linhas.push(obj);
    }
  }

  return {
    linhas,
    colunas: ["__aba", ...[...preenchidas].sort()],
    semPlanilha: false,
  };
}
