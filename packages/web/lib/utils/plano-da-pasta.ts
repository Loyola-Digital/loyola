/**
 * Subir uma pasta inteira para o Swipe Files.
 *
 * Vive no WEB, e não na API: quem tem os arquivos é o navegador. O servidor
 * recebe um upload por vez, já resolvido — mandar a árvore para ele planejar
 * seria uma volta a mais para decidir algo que só o cliente sabe.
 *
 * ## A estrutura de pastas vira uma ÁRVORE de coleções
 *
 * `Black Friday/anúncios/peça-01.png` cria "Black Friday" e, dentro dela,
 * "anúncios". Achatar tudo numa coleção só perderia a arrumação que a pessoa
 * já tinha feito no computador — e refazer essa arrumação à mão depois é
 * exatamente o trabalho que subir a pasta deveria evitar.
 *
 * ## Pasta sem arquivo não vira coleção
 *
 * O navegador entrega o caminho de cada ARQUIVO, então uma pasta intermediária
 * só existe aqui se algo dentro dela subiu. Criar coleção vazia encheria a
 * lista de nomes que não levam a lugar nenhum.
 *
 * ## O que não é referência fica de fora, mas é CONTADO
 *
 * `.DS_Store`, `Thumbs.db`, `.psd`, `.zip` — o que o Swipe Files não sabe
 * mostrar não sobe. Sumir com eles em silêncio faria a pessoa procurar por que
 * "faltaram 12 arquivos"; o relatório diz quantos e por quê.
 */

/** O que o Swipe Files sabe guardar e mostrar. */
const MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "text/html",
]);

/** Extensões que decidem quando o navegador não sabe o mime do arquivo. */
const EXTENSOES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
  html: "text/html",
  htm: "text/html",
};

export interface ArquivoDaPasta {
  /** `webkitRelativePath` — sempre com `/`, mesmo no Windows. */
  caminho: string;
  nome: string;
  /** O que o navegador disse. Vem vazio com frequência. */
  mime: string;
  tamanho: number;
}

export interface ItemPlanejado extends ArquivoDaPasta {
  /** O mime resolvido, já contando com a extensão. */
  mimeFinal: string;
  /** Caminho da coleção onde entra. Vazio = raiz da pasta escolhida. */
  colecao: string[];
}

export interface PlanoDaPasta {
  /** A pasta escolhida — vira a coleção raiz. */
  raiz: string | null;
  /** Todas as coleções a criar, das mais rasas para as mais fundas. */
  colecoes: { caminho: string[]; nome: string }[];
  itens: ItemPlanejado[];
  /** O que não sobe, com o motivo — ver o cabeçalho. */
  ignorados: { nome: string; motivo: string }[];
  bytes: number;
}

/**
 * O mime de um arquivo, contando com a extensão.
 *
 * O navegador manda `application/octet-stream` (ou vazio) com frequência para
 * arquivos vindos do disco, e nesse caso só o nome diz o que é. Sem isto, uma
 * pasta inteira de `.png` seria recusada por "tipo não suportado".
 */
export function mimeDoArquivo(nome: string, mimeDoNavegador: string): string | null {
  const limpo = (mimeDoNavegador ?? "").split(";")[0]!.trim().toLowerCase();
  if (MIMES.has(limpo)) return limpo;
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSOES[ext] ?? null;
}

/** Arquivo escondido do sistema — nunca é referência. */
function ehLixoDoSistema(nome: string): boolean {
  return /^\.|^Thumbs\.db$|^desktop\.ini$/i.test(nome);
}

/**
 * O plano de subida de uma pasta.
 *
 * `raizComoColecao = false` joga tudo solto na biblioteca, sem criar coleção
 * nenhuma — é o "subir em lote" para quem só quer o acervo dentro, sem a
 * arrumação da pasta.
 */
export function planejarPasta(
  arquivos: ArquivoDaPasta[],
  raizComoColecao = true,
): PlanoDaPasta {
  const itens: ItemPlanejado[] = [];
  const ignorados: { nome: string; motivo: string }[] = [];
  let bytes = 0;
  let raiz: string | null = null;

  for (const a of arquivos) {
    const partes = a.caminho.split(/[\\/]/).filter(Boolean);
    const pastas = partes.slice(0, -1);
    if (pastas.length > 0 && raiz === null) raiz = pastas[0]!;

    if (ehLixoDoSistema(a.nome)) {
      // Sem entrar no relatório: `.DS_Store` não é algo que alguém tentou
      // subir, e listá-lo faria o resumo parecer cheio de falhas.
      continue;
    }
    if (a.tamanho === 0) {
      ignorados.push({ nome: a.nome, motivo: "arquivo vazio" });
      continue;
    }
    const mimeFinal = mimeDoArquivo(a.nome, a.mime);
    if (!mimeFinal) {
      ignorados.push({ nome: a.nome, motivo: "formato não suportado" });
      continue;
    }

    bytes += a.tamanho;
    itens.push({
      ...a,
      mimeFinal,
      // Sem coleção, o caminho não importa: tudo cai solto na biblioteca.
      colecao: raizComoColecao ? pastas : [],
    });
  }

  // Só as pastas que têm arquivo, e cada nível como uma coleção própria.
  const caminhos = new Map<string, string[]>();
  if (raizComoColecao) {
    for (const i of itens) {
      for (let n = 1; n <= i.colecao.length; n += 1) {
        const caminho = i.colecao.slice(0, n);
        caminhos.set(caminho.join("/"), caminho);
      }
    }
  }

  const colecoes = [...caminhos.values()]
    // Das rasas para as fundas: a filha precisa da mãe já criada para
    // apontar para ela.
    .sort((a, b) => a.length - b.length || a.join("/").localeCompare(b.join("/"), "pt-BR"))
    .map((caminho) => ({ caminho, nome: caminho[caminho.length - 1]! }));

  return { raiz, colecoes, itens, ignorados, bytes };
}

/** Quantos arquivos de cada tipo — o resumo antes de confirmar a subida. */
export function resumoPorTipo(itens: ItemPlanejado[]): { tipo: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const i of itens) {
    const tipo = i.mimeFinal.startsWith("image/")
      ? "imagem"
      : i.mimeFinal.startsWith("video/")
        ? "vídeo"
        : i.mimeFinal === "application/pdf"
          ? "PDF"
          : "página";
    conta.set(tipo, (conta.get(tipo) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([tipo, n]) => ({ tipo, n }))
    // Empate desfeito pelo nome: sem isso a ordem vem de qual arquivo apareceu
    // primeiro na pasta, e o mesmo lote resume diferente em duas tentativas.
    .sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo, "pt-BR"));
}
