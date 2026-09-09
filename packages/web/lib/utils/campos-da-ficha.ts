/**
 * Quais campos da ficha o formulário carrega e devolve.
 *
 * ## Por que uma lista, e não três
 *
 * Antes, os campos apareciam escritos em três lugares: o `setForm` que enche o
 * formulário, o `gravar()` que monta o PUT, e o `<Campo>` na tela. Acrescentar
 * CPF, CNPJ, chave PIX e endereço tocou só o terceiro — o resultado é que a
 * tela mostrava os campos, o botão dizia "Ficha salva", e nada era gravado nem
 * relido. Falhou nos dois sentidos e em silêncio, porque um PUT sem o campo é
 * um PUT válido.
 *
 * Com a lista, acrescentar um campo é uma linha. E o `Assert` no fim quebra o
 * BUILD se alguém acrescentar um campo em `EntradaDaFicha` e esquecer daqui —
 * que é exatamente o erro que isto existe para impedir.
 */

import type { EntradaDaFicha, Ficha } from "@/lib/hooks/use-pessoal";

/** O que a própria pessoa preenche sobre si. */
export const CAMPOS_DA_PESSOA = [
  "nomeCompleto",
  "cargo",
  "nascimento",
  "telefone",
  "emailContato",
  "emergenciaNome",
  "emergenciaTelefone",
  "emergenciaParentesco",
  "cpf",
  "cnpj",
  "chavePix",
  "endereco",
] as const satisfies readonly (keyof EntradaDaFicha)[];

/**
 * O que só o RH mexe.
 *
 * `entradaEm` alimenta o cálculo de férias e `observacoes` são notas SOBRE a
 * pessoa — os dois viram problema se quem é dono da ficha puder gravá-los.
 */
export const CAMPOS_DE_RH = [
  "entradaEm",
  "observacoes",
] as const satisfies readonly (keyof EntradaDaFicha)[];

/**
 * Campos com tratamento próprio, de propósito.
 *
 * `foto` só viaja quando muda (são dezenas de KB) e `ajusteSaldoDias` é número,
 * não texto — nenhum dos dois passa pelo formulário de strings.
 */
type ForaDoFormulario = "foto" | "ajusteSaldoDias";

/**
 * A trava.
 *
 * Se `EntradaDaFicha` ganhar um campo que não está em nenhuma lista acima,
 * `NaoCoberto` deixa de ser `never` e ISTO não compila. É o alarme que não
 * existia quando os quatro campos de pagamento foram esquecidos.
 */
type NaoCoberto = Exclude<
  keyof EntradaDaFicha,
  | (typeof CAMPOS_DA_PESSOA)[number]
  | (typeof CAMPOS_DE_RH)[number]
  | ForaDoFormulario
>;
type Assert<T extends never> = T;
export type TodosOsCamposCobertos = Assert<NaoCoberto>;

/** O formulário preenchido a partir da ficha. Campo ausente vira string vazia. */
export function formularioDaFicha(ficha: Ficha): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of [...CAMPOS_DA_PESSOA, ...CAMPOS_DE_RH]) {
    // `unknown` no meio porque `Ficha` tem campos de tipos diferentes
    // (`ajusteSaldoDias` é número); o acesso por chave é o que a lista
    // torna seguro, e o TS não consegue ver isso sozinho.
    const valor = (ficha as unknown as Record<string, unknown>)[campo];
    saida[campo] = valor == null ? "" : String(valor);
  }
  return saida;
}

/**
 * O que vai no PUT.
 *
 * Campo vazio vira `null`, não `""`: o servidor guarda o que recebe, e uma
 * string vazia faria a tela mostrar um valor em branco como se fosse
 * preenchido. Os campos de RH só entram quando quem edita pode mudá-los —
 * mandá-los sempre funcionaria (o servidor descarta), mas uma requisição que
 * carrega o que vai ser jogado fora esconde a regra de quem lê depois.
 */
export function entradaDoFormulario(
  form: Record<string, string>,
  opcoes: { camposDeRh: boolean },
): EntradaDaFicha {
  const dados: Record<string, string | null> = {};
  const campos = opcoes.camposDeRh
    ? [...CAMPOS_DA_PESSOA, ...CAMPOS_DE_RH]
    : CAMPOS_DA_PESSOA;
  for (const campo of campos) dados[campo] = form[campo]?.trim() || null;
  return dados as EntradaDaFicha;
}
