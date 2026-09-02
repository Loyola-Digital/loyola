/**
 * Story 18.72 — de qual planilha a tabela "Leads & vendas por UTM" lê as vendas.
 *
 * ## O defeito
 *
 * O componente procurava a planilha de vendas só em `funnel_spreadsheets`:
 *
 * ```ts
 * const salesSheet = sheets?.spreadsheets.find(s => s.type === "sales" || s.type === "custom");
 * ```
 *
 * Em 6 das 15 etapas com planilha de leads em produção, não existe registro
 * assim — a planilha de vendas da etapa vive em `stage_sales_spreadsheets`, que
 * é a mesma que alimenta os cards e a tabela de Criativos. Resultado: a tabela
 * mostrava `0 vendas · R$ 0` em TODOS os grupos, não só no `meta`, e ninguém
 * percebia porque zero venda é indistinguível de "esse grupo não vendeu".
 *
 * ## Por que num módulo à parte
 *
 * O runner do web só coleta `lib/utils/**` e `lib/bi/**`, e só `.test.ts`. Um
 * teste do componente não roda. A escolha da fonte e a extração do valor moram
 * aqui para poderem ser testadas de verdade — inclusive contra o modo de falha
 * que o gate apontou: ler a planilha certa com o campo de valor errado troca
 * "0 vendas, R$ 0" por "N vendas, R$ 0", e o TypeScript não acusa nada.
 */

/** Uma linha de planilha já enriquecida, no vocabulário comum. */
export interface LinhaComNamed {
  named: Record<string, string | undefined>;
}

export interface FonteDeVendas {
  /** As linhas a agregar. Vazio quando não há planilha de vendas na etapa. */
  linhas: LinhaComNamed[];
  /** De onde vieram — para a UI poder dizer o que está mostrando. */
  origem: "funnel_spreadsheets" | "stage_sales_spreadsheets" | "nenhuma";
  /**
   * Preenchido quando existe planilha mas a leitura falhou. A UI precisa
   * distinguir isto de "não vendeu": nos dois casos a contagem é zero.
   */
  erro?: string;
}

export interface EntradaFonteDeVendas {
  /**
   * Existe planilha `sales`/`custom` CADASTRADA em `funnel_spreadsheets` para
   * esta etapa? Separado das linhas de propósito — ver `escolherFonteDeVendas`.
   */
  temPlanilhaDoFunil: boolean;
  /** Linhas dessa planilha já filtradas pela janela de dias. */
  linhasDoFunil?: LinhaComNamed[] | null;
  /** Retorno de `useStageSalesRows` — uma entrada por planilha da etapa. */
  planilhasDaEtapa?: Array<{ rows: LinhaComNamed[]; erro?: string }> | null;
}

/**
 * Escolhe UMA fonte. Nunca soma as duas.
 *
 * Quando as duas existem (caso do `fz-l2-jun-26`), vence a de
 * `funnel_spreadsheets` — é a que aquela tela já usa hoje, e trocar mudaria um
 * número que ninguém pediu para mudar. A regra é de preservação, não de
 * preferência técnica.
 *
 * ## Por que `temPlanilhaDoFunil` é separado das linhas
 *
 * A primeira versão decidia por `linhasDoFunil.length > 0`, e isso trocava de
 * fonte sozinha sempre que a planilha do funil não tivesse vendas **na janela
 * de dias escolhida** — a tela mudava de número ao mexer no filtro de período,
 * sem nada na interface explicando. Cadastro e conteúdo são perguntas
 * diferentes: quem decide a fonte é o cadastro.
 */
export function escolherFonteDeVendas(entrada: EntradaFonteDeVendas): FonteDeVendas {
  if (entrada.temPlanilhaDoFunil) {
    // Zero linhas aqui significa "não vendeu nesta janela", não "sem fonte".
    return { linhas: entrada.linhasDoFunil ?? [], origem: "funnel_spreadsheets" };
  }

  const daEtapa = entrada.planilhasDaEtapa ?? [];
  if (daEtapa.length > 0) {
    const linhas = daEtapa.flatMap((p) => p.rows ?? []);
    const erros = daEtapa.map((p) => p.erro).filter((e): e is string => !!e);
    // Uma planilha ilegível entre várias ainda é dado faltando: reporta.
    if (erros.length > 0) {
      return { linhas, origem: "stage_sales_spreadsheets", erro: erros.join(" · ") };
    }
    return { linhas, origem: "stage_sales_spreadsheets" };
  }

  return { linhas: [], origem: "nenhuma" };
}

/**
 * Valor monetário de uma linha, em pt-BR ou en-US.
 *
 * O `named.value` chega preenchido pelas duas origens: em
 * `funnel_spreadsheets` é a coluna mapeada como `value`; em
 * `stage_sales_spreadsheets` é `valorBruto` com fallback no `valorLiquido`,
 * traduzido pelo backend. Ler `named.valorBruto` aqui devolveria `undefined` e
 * zeraria o faturamento com a contagem certa.
 */
export function valorDaLinha(linha: LinhaComNamed): number {
  const bruto = (linha.named.value ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!bruto) return 0;
  const temPonto = bruto.includes(".");
  const temVirgula = bruto.includes(",");
  let normalizado = bruto;
  if (temPonto && temVirgula) {
    // O último separador é o decimal.
    normalizado =
      bruto.lastIndexOf(",") > bruto.lastIndexOf(".")
        ? bruto.replace(/\./g, "").replace(",", ".")
        : bruto.replace(/,/g, "");
  } else if (temVirgula) {
    normalizado = bruto.replace(",", ".");
  }
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** Vendas e faturamento de um conjunto de linhas. Uma linha = uma venda. */
export function totalizarVendas(linhas: LinhaComNamed[]): {
  vendas: number;
  faturamento: number;
} {
  let faturamento = 0;
  for (const l of linhas) faturamento += valorDaLinha(l);
  return { vendas: linhas.length, faturamento };
}
