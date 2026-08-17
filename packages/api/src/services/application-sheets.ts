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
