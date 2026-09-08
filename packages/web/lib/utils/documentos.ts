/**
 * Máscara e conferência de CPF, CNPJ e chave PIX — no navegador.
 *
 * ## Por que existe uma cópia disto aqui
 *
 * A validação que vale é a do servidor (`packages/api/src/services/documentos.ts`);
 * esta serve para avisar ENQUANTO a pessoa digita. Descobrir que o CPF está
 * errado depois de clicar em Salvar, com o campo já fora da vista, é o que faz
 * alguém desistir de preencher.
 *
 * A duplicação é deliberada e pequena: dez linhas de módulo 11 dos dois lados,
 * em vez de uma chamada de rede por tecla. Se divergirem, o servidor ganha — e
 * o pior caso é a tela dizer "ok" para algo que o Salvar recusa com a mensagem
 * certa.
 *
 * ## Máscara enquanto digita
 *
 * `mascararCpf` formata o que já foi digitado sem esperar o número completo.
 * Só o que a pessoa digitou aparece: mascarar o que ainda não existe encheria
 * o campo de pontos e traços à frente do cursor.
 */

export const soDigitos = (v: string) => v.replace(/\D/g, "");

function digitoModulo11(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * (pesos[i] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** "111.111.111-11" passa no módulo 11 por acidente. É a única que ele não pega. */
const todosIguais = (n: string) => /^(\d)\1+$/.test(n);

export function validarCpf(valor: string): boolean {
  const n = soDigitos(valor);
  if (n.length !== 11 || todosIguais(n)) return false;
  const d1 = digitoModulo11(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return n[9] === String(d1) && n[10] === String(d2);
}

export function validarCnpj(valor: string): boolean {
  const n = soDigitos(valor);
  if (n.length !== 14 || todosIguais(n)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = digitoModulo11(n.slice(0, 12), p1);
  const d2 = digitoModulo11(n.slice(0, 13), [6, ...p1]);
  return n[12] === String(d1) && n[13] === String(d2);
}

/** 529 → "529", 52998 → "529.98", completo → "529.982.247-25" */
export function mascararCpf(valor: string): string {
  const n = soDigitos(valor).slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

/** Vai virando 11.222.333/0001-81 conforme os dígitos entram. */
export function mascararCnpj(valor: string): string {
  const n = soDigitos(valor).slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12)
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export type TipoDaChavePix =
  "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | "desconhecida";

/**
 * Que tipo de chave PIX é esta — o rótulo que a tela mostra.
 *
 * Ver "e-mail" embaixo de um campo onde se quis colar o CNPJ é a forma mais
 * rápida de perceber o engano. A ordem importa: documentos antes de telefone,
 * porque onze dígitos servem para os dois.
 */
export function tipoDaChavePix(valor: string): TipoDaChavePix {
  const v = valor.trim();
  if (!v) return "desconhecida";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    return "aleatoria";
  if (v.includes("@"))
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "email" : "desconhecida";
  const n = soDigitos(v);
  if (n.length === 11 && validarCpf(n)) return "cpf";
  if (n.length === 14 && validarCnpj(n)) return "cnpj";
  if (v.startsWith("+") && (n.length === 12 || n.length === 13))
    return "telefone";
  if (n.length === 10 || n.length === 11) return "telefone";
  return "desconhecida";
}

/** Como a tela nomeia cada tipo de chave. */
export const NOME_DA_CHAVE: Record<TipoDaChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "e-mail",
  telefone: "telefone",
  aleatoria: "chave aleatória",
  desconhecida: "não reconheci o formato",
};
