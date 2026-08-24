/**
 * Confere as vendas da planilha contra as da Kiwify.
 *
 * Hoje a venda chega por webhook numa planilha, e a planilha é lida pelo
 * dashboard. Esse caminho perde venda de três jeitos que ninguém percebe: o
 * webhook falha e a linha nunca existe; a venda é reembolsada depois e a linha
 * continua contando; o reenvio do webhook vira linha duplicada. Nenhum deles
 * dá erro — dá número errado, que é pior.
 *
 * Este módulo não corrige nada: ele COMPARA e diz onde diverge. Trocar a fonte
 * é decisão de outra hora; saber que os números não batem é de agora.
 *
 * A lógica é pura de propósito (recebe as duas listas prontas) para poder ser
 * testada com casos difíceis sem depender de rede nem de planilha real.
 */

/** Uma venda como a planilha registrou. */
export interface VendaDaPlanilha {
  /** Coluna de id da planilha: às vezes o UUID da venda, às vezes o reference. */
  chave: string | null;
  email: string | null;
  /** aaaa-mm-dd */
  data: string | null;
  valor: number;
  produto: string | null;
}

/** Uma venda como a API da Kiwify devolveu. */
export interface VendaDaKiwify {
  id: string;
  reference: string | null;
  email: string | null;
  data: string | null;
  valor: number;
  produto: string | null;
}

export interface Divergencia {
  /** Vendas que a Kiwify tem e a planilha não — o caso do webhook perdido. */
  soNaKiwify: VendaDaKiwify[];
  /** Vendas na planilha sem correspondente na Kiwify — duplicata ou lançamento à mão. */
  soNaPlanilha: VendaDaPlanilha[];
  totalPlanilha: number;
  totalKiwify: number;
  /** Positivo = a Kiwify tem mais. É o número que o aviso mostra. */
  diferenca: number;
  /**
   * Linhas da planilha sem nenhuma chave de cruzamento (sem id e sem e-mail).
   * Elas não podem ser conferidas, e some-las ao "só na planilha" faria
   * parecer erro da Kiwify o que é falha de preenchimento da planilha.
   */
  planilhaSemChave: number;
  bate: boolean;
}

/**
 * Converte a data da planilha para aaaa-mm-dd.
 *
 * As planilhas do time misturam DOIS formatos na mesma etapa — a aba de
 * captação grava ISO (`2026-07-09T22:57:29.686Z`) e a de produto grava
 * brasileiro (`01/08/2026 17:00:48`). Cortar os 10 primeiros caracteres funciona
 * no primeiro e mente no segundo: `"01/08/2026" < "2026-07-01"` é verdadeiro na
 * comparação de texto, então TODAS as linhas ficavam fora da janela e a
 * conferência dava "bate" com zero de cada lado — o pior resultado possível,
 * porque parece sucesso.
 *
 * Devolve `null` quando não reconhece: linha sem data confiável não deve ser
 * silenciosamente incluída nem excluída da janela por acidente.
 */
export function diaNormalizado(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim();
  if (!bruto) return null;

  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/aaaa (e dd-mm-aaaa). Ano de dois dígitos não entra: "01/08/26" é
  // ambíguo demais para chutar o século numa conferência de dinheiro.
  const br = bruto.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

/** E-mail comparável: caixa e espaços não distinguem pessoa. */
function normEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** Chave comparável: a planilha às vezes guarda com espaço ou caixa diferente. */
function normChave(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Cruza as duas listas.
 *
 * O casamento tenta, nesta ordem: id da venda, `reference`, e por fim e-mail.
 * Os três porque a coluna de id da planilha não é consistente — na planilha real
 * do BBE convivem UUID (`5515df94-…`) e reference (`OMR7BXV`) na mesma coluna.
 * Cruzar só por um deles marcaria como divergência metade das vendas certas.
 *
 * E-mail é o último critério e casa UMA vez: quem compra duas vezes tem duas
 * vendas, e casar as duas com a mesma linha esconderia uma venda faltando.
 */
export function conciliar(
  planilha: VendaDaPlanilha[],
  kiwify: VendaDaKiwify[],
): Divergencia {
  const semChave = planilha.filter((p) => !normChave(p.chave) && !normEmail(p.email));
  const conferiveis = planilha.filter((p) => normChave(p.chave) || normEmail(p.email));

  const porChave = new Map<string, VendaDaPlanilha[]>();
  const porEmail = new Map<string, VendaDaPlanilha[]>();
  for (const linha of conferiveis) {
    const chave = normChave(linha.chave);
    if (chave) {
      const lista = porChave.get(chave) ?? [];
      lista.push(linha);
      porChave.set(chave, lista);
    }
    const email = normEmail(linha.email);
    if (email) {
      const lista = porEmail.get(email) ?? [];
      lista.push(linha);
      porEmail.set(email, lista);
    }
  }

  const usadas = new Set<VendaDaPlanilha>();
  const soNaKiwify: VendaDaKiwify[] = [];

  /** Pega a primeira linha ainda não usada de uma lista de candidatas. */
  const primeiraLivre = (lista: VendaDaPlanilha[] | undefined): VendaDaPlanilha | null => {
    for (const linha of lista ?? []) {
      if (!usadas.has(linha)) return linha;
    }
    return null;
  };

  for (const venda of kiwify) {
    const candidata =
      primeiraLivre(porChave.get(normChave(venda.id))) ??
      primeiraLivre(porChave.get(normChave(venda.reference))) ??
      primeiraLivre(porEmail.get(normEmail(venda.email)));

    if (candidata) usadas.add(candidata);
    else soNaKiwify.push(venda);
  }

  const soNaPlanilha = conferiveis.filter((p) => !usadas.has(p));

  return {
    soNaKiwify,
    soNaPlanilha,
    totalPlanilha: planilha.length,
    totalKiwify: kiwify.length,
    diferenca: kiwify.length - planilha.length,
    planilhaSemChave: semChave.length,
    bate: soNaKiwify.length === 0 && soNaPlanilha.length === 0,
  };
}

// ============================================================
// Quantos ingressos uma venda representa
// ============================================================

/**
 * Ingressos de uma venda, a partir do preço base.
 *
 * A Kiwify **não expõe quantidade**: procurei `quantity`, `qty`, `items`,
 * `tickets` e `seats` nos campos da venda, em `/sales/{id}` e nos endpoints
 * `/items` e `/orders` (404 nos dois). Uma compra de 3 ingressos chega como UMA
 * venda — que é exatamente o furo relatado: o dashboard mostra 1 onde entraram 3.
 *
 * O que a API dá é `payment.product_base_price`, e ele **já embute a
 * quantidade**. Medido na conta do Netão, produto "BBE Escala - 2ª Ed":
 *
 * | base      | ÷ 1097 | ingressos |
 * |-----------|--------|-----------|
 * | R$ 3291   | 3.000  | **3**     |
 * | R$ 1097   | 1.000  | 1         |
 * | R$ 1000   | 0.912  | 1         |
 * | R$ 797    | 0.727  | 1         |
 *
 * Duas decisões que sustentam isso:
 *
 * **Usa o preço BASE, não o cobrado.** `charge_amount` inclui juros de
 * parcelamento — na mesma amostra havia razões de 1.05, 1.09, 1.20 e 1.24 sobre
 * o base. Dividir pelo cobrado transformaria parcelamento caro em "1,24
 * ingresso", e um combo parcelado em quantidade errada.
 *
 * **Só conta múltiplo quando a divisão é exata.** Preço promocional e valor
 * negociado (797, 1000) não são fração de ingresso — são um ingresso mais
 * barato. Sem essa trava, arredondar 0,73 daria 1 por sorte, e 1,6 daria 2 por
 * engano.
 */
export function quantidadeDeIngressos(
  precoBase: number,
  precoUnitario: number | null | undefined,
  /** Folga para centavos de arredondamento da própria Kiwify. */
  tolerancia = 0.01,
): number {
  if (!precoUnitario || precoUnitario <= 0 || !Number.isFinite(precoBase) || precoBase <= 0) return 1;
  const razao = precoBase / precoUnitario;
  const inteiro = Math.round(razao);
  if (inteiro < 2) return 1;
  return Math.abs(razao - inteiro) <= tolerancia ? inteiro : 1;
}
