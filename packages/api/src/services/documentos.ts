/**
 * CPF, CNPJ e chave PIX — validação e forma de guardar.
 *
 * ## Por que validar, e não só aceitar o que vier
 *
 * Estes campos existem para pagar as pessoas. Um dígito trocado no CPF não dá
 * erro em lugar nenhum hoje: dá erro na emissão da nota, semanas depois, e a
 * essa altura ninguém lembra de onde o número veio. O dígito verificador
 * existe justamente para pegar erro de digitação na hora, e conferi-lo custa
 * dez linhas.
 *
 * O que NÃO fazemos é consultar a Receita: validar o dígito diz que o número é
 * bem-formado, não que existe. Confundir as duas coisas levaria a bloquear
 * gente por indisponibilidade de um serviço externo.
 *
 * ## Guardamos só os dígitos
 *
 * "123.456.789-09" e "12345678909" são o mesmo CPF. Guardar formatado deixaria
 * os dois conviverem na tabela, e qualquer comparação futura falharia em
 * silêncio. A máscara é assunto da tela.
 *
 * ## O mesmo algoritmo existe no web
 *
 * `packages/web/lib/utils/documentos.ts` repete a conferência para avisar
 * enquanto a pessoa digita. Este arquivo é a autoridade: o front pode estar
 * desatualizado, ser contornado ou nem rodar.
 */

/** Só os dígitos. É assim que o número entra no banco. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * O dígito verificador de CPF ou CNPJ.
 *
 * Os dois usam o mesmo módulo 11 com pesos diferentes; separar em duas funções
 * quase idênticas só daria dois lugares para o mesmo erro morar.
 */
function digitoModulo11(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * (pesos[i] ?? 0), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Todos os dígitos iguais.
 *
 * "111.111.111-11" passa no módulo 11 por acidente matemático — a soma
 * ponderada cai certinho. É a fraude mais comum e a única que o algoritmo
 * sozinho não pega.
 */
function todosIguais(n: string): boolean {
  return /^(\d)\1+$/.test(n);
}

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

/** Como a tela mostra: 123.456.789-09 */
export function formatarCpf(valor: string): string {
  const n = soDigitos(valor);
  if (n.length !== 11) return valor;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

/** Como a tela mostra: 12.345.678/0001-95 */
export function formatarCnpj(valor: string): string {
  const n = soDigitos(valor);
  if (n.length !== 14) return valor;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export type TipoDaChavePix =
  "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | "desconhecida";

/**
 * Que tipo de chave PIX é esta.
 *
 * O Banco Central aceita cinco formatos, e a tela usa isto para dizer o que
 * entendeu — "chave aleatória", "e-mail". Ver o rótulo certo é a forma mais
 * rápida de perceber que se colou a coisa errada no campo.
 *
 * A ordem importa: um CPF também é uma sequência de onze dígitos que passaria
 * por telefone sem DDI, então os documentos são testados primeiro.
 */
export function tipoDaChavePix(valor: string): TipoDaChavePix {
  const v = valor.trim();
  if (!v) return "desconhecida";

  // UUID v4 — o formato da chave aleatória. Testado antes dos dígitos porque
  // tem letras e não confunde com nada.
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  ) {
    return "aleatoria";
  }
  if (v.includes("@"))
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "email" : "desconhecida";

  const n = soDigitos(v);
  if (n.length === 11 && validarCpf(n)) return "cpf";
  if (n.length === 14 && validarCnpj(n)) return "cnpj";
  // Telefone no padrão do BC: +55 + DDD + número (12 ou 13 dígitos com o país).
  if (v.startsWith("+") && (n.length === 12 || n.length === 13))
    return "telefone";
  // Sem o +55 ainda é telefone reconhecível — o BC exige o DDI, mas recusar
  // aqui faria a tela dizer "desconhecida" para algo que a pessoa conserta
  // acrescentando dois caracteres.
  if (n.length === 10 || n.length === 11) return "telefone";
  return "desconhecida";
}
