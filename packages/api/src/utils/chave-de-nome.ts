/**
 * O nome reduzido ao que identifica a coisa.
 *
 * `BBE-Margem 3X`, `BBE Margem 3X` e `BBEMargem3X` são a MESMA campanha
 * escrita por três pessoas diferentes. Hífen, espaço, acento e caixa somem;
 * sobram letras e números.
 *
 * ## Por que mora aqui e não em cada consumidor
 *
 * Já era usada pelo planner e agora pelo SendFlow. Uma segunda cópia começaria
 * a divergir no primeiro ajuste — é assim que telas diferentes passam a mostrar
 * números diferentes para a mesma pergunta.
 *
 * `planner-sync.ts` re-exporta daqui, então quem já importava de lá continua
 * funcionando.
 */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
