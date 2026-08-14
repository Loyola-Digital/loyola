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
