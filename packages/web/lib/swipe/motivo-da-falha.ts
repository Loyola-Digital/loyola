/**
 * Por que a capa do PDF não abriu, em uma frase que alguém consegue agir.
 *
 * Separado do componente porque é a única parte com regra de verdade — e
 * porque o pacote web roda os testes em `environment: node`, sem DOM. Uma
 * função pura é testável hoje; o componente exigiria jsdom.
 */

/** A causa, classificada onde ela acontece. */
export type CausaDaFalha =
  | { tipo: "sem-link" }
  | { tipo: "grande-demais" }
  | { tipo: "http"; status: number }
  | { tipo: "prazo" }
  | { tipo: "rede" }
  | { tipo: "pdf" };

/** O que a tela mostra quando não dá para desenhar a capa. */
export function motivoDaFalha(causa: CausaDaFalha): string {
  switch (causa.tipo) {
    // Sem link é sintoma de storage mal configurado no servidor, não de PDF
    // ruim — e quem vê a tela precisa saber que o problema não é o arquivo.
    case "sem-link":
      return "Sem link — storage não configurado";
    case "grande-demais":
      return "Grande demais para pré-visualizar";
    case "http":
      // 400 e 403 do Supabase são a mesma coisa na prática: o objeto existe,
      // mas o bucket não serve para quem não está autenticado.
      if (causa.status === 400 || causa.status === 403) {
        return "Sem permissão — o bucket não é público";
      }
      if (causa.status === 404) return "Arquivo não encontrado no bucket";
      return `O servidor devolveu ${causa.status}`;
    case "prazo":
      return "Demorou demais — o arquivo não respondeu";
    case "rede":
      return "Não consegui alcançar o arquivo";
    case "pdf":
      return "Não consegui abrir este PDF";
  }
}
