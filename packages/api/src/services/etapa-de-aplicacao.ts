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

/** Rótulo de quem chegou sem origem. Igual ao resto do app, de propósito. */
export const SEM_ORIGEM = "Sem Track";

/** Uma venda já normalizada, do jeito que esta etapa precisa. */
export interface VendaDaAplicacao {
  /** Normalizado (minúsculo, sem espaço). Vazio quando a planilha não traz. */
  email: string;
  valor: number;
  utmSource: string;
  utmMedium: string;
  data: Date | null;
  /** Identidade da venda para deduplicar. Ver `dedupKey`. */
  chave: string;
}

/** Uma aplicação, do jeito que esta etapa precisa. */
export interface AplicacaoDaEtapa {
  email: string;
  data: Date | null;
  utmSource: string;
  utmMedium: string;
}

export interface QuebraPorOrigem {
  origem: string;
  vendas: number;
  valor: number;
  /** Aplicações com esta origem — permite ver conversão por canal. */
  aplicacoes: number;
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
  campo: "vendas" | "aplicacoes",
  valor: number,
): void {
  const atual = mapa.get(origem) ?? { origem, vendas: 0, valor: 0, aplicacoes: 0 };
  atual[campo] += 1;
  atual.valor += valor;
  mapa.set(origem, atual);
}

/** Maior valor primeiro — é a ordem em que se lê uma tabela de origem. */
function ordenar(mapa: Map<string, QuebraPorOrigem>): QuebraPorOrigem[] {
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.vendas - a.vendas);
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

  for (const v of vendas) {
    if (vistas.has(v.chave)) continue;
    vistas.add(v.chave);

    vendasContadas += 1;
    valorTotal += v.valor;
    if (v.email && emailsQueAplicaram.has(v.email)) converteram += 1;

    acumular(porSource, v.utmSource || SEM_ORIGEM, "vendas", v.valor);
    acumular(porMedium, v.utmMedium || SEM_ORIGEM, "vendas", v.valor);
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
