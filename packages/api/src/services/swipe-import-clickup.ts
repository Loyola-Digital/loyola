/**
 * Traz para o Swipe Files o que já estava no canal de referências do ClickUp.
 *
 * ## O acervo que existia e não dava para procurar
 *
 * Medido no canal `referências-geral`: 245 mensagens, 340 anexos, 1,8 GB. São
 * páginas de vendas salvas, criativos, PDFs de playbook — três anos de time
 * mandando "olha essa página". O material é bom; o problema é que um chat não
 * tem faceta. Procurar "landing de evento presencial" ali é rolar até achar.
 *
 * ## Uma mensagem vira VÁRIOS itens
 *
 * A unidade do chat é a mensagem; a do Swipe Files é o arquivo. Uma mensagem
 * com sete criativos são sete referências distintas — cada uma precisa da sua
 * miniatura e das suas tags. O texto da mensagem é copiado para todas: é ele
 * que carrega o "por que salvamos isto", que nenhuma análise de imagem
 * recupera.
 *
 * ## O link não vira card quando há print junto
 *
 * Metade das mensagens é "olha essa página" + o print dela. Se o link virasse
 * um card e o print outro, a biblioteca teria duas entradas para a mesma coisa.
 * Aqui o link vira a `origem` do print — que é exatamente o campo que o Swipe
 * Files já tem para isso. Link só vira card próprio quando a mensagem não trouxe
 * arquivo nenhum.
 *
 * ## O que não cabe no bucket ainda entra
 *
 * O bucket aceita imagem, vídeo e PDF. Ficam de fora 78 HTMLs — que são
 * justamente as páginas de vendas salvas, o material mais denso do canal — mais
 * uns poucos `.zip`/`.rar`. Esses entram como `link` apontando para o anexo do
 * ClickUp, que é público e não expira. Indexado e buscável vale mais que
 * perfeito e ausente.
 */

/** O que a API v3 do ClickUp devolve, do que aqui interessa. */
export interface MensagemDoClickUp {
  id: string;
  content?: string;
  date?: number;
  user_id?: string;
  respostas?: { content?: string }[];
}

export type TipoDeAsset = "image" | "video" | "pdf" | "link";

export interface ItemParaImportar {
  /**
   * Idempotência.
   *
   * Uma importação de 400 itens vai cair no meio — rede, deploy, timeout. Sem
   * uma chave estável, retomar significa duplicar tudo que já entrou. É a URL
   * do anexo (única por upload no ClickUp) ou `msg:{id}:{url}` para link.
   */
  importKey: string;
  titulo: string;
  notas: string | null;
  kind: TipoDeAsset;
  /** O binário a subir. `null` quando o item é só um link. */
  anexo: { url: string; nome: string; mime: string } | null;
  /** Para onde o card aponta: a página original, ou o próprio anexo. */
  origem: string | null;
  /** Quem mandou no ClickUp — vira o autor do card. */
  autorNoClickUp: string | null;
  /** Quando foi mandado, em ms. */
  data: number | null;
}

/**
 * URLs, com os parênteses escapados que o ClickUp insere.
 *
 * Um arquivo chamado `foto (1).jpg` vira `…%20\(1\).jpg` na URL. Parar no
 * primeiro `)` corta o endereço antes da extensão: o anexo perdia o `.jpg`,
 * era classificado como tipo desconhecido e virava link em vez de imagem.
 * `\\[()]` consome o par contrabarra-parêntese como uma unidade.
 */
const ANEXO = /https:\/\/t\d+\.p\.clickup-attachments\.com\/(?:\\[()]|[^\s)"'\]])+/g;
const QUALQUER_URL = /https?:\/\/(?:\\[()]|[^\s)"'\]<>])+/g;

/**
 * URL do jeito que ela aparece DENTRO do texto.
 *
 * O ClickUp encurta link longo no meio com `[…]` — e um deles carregava um
 * `mcp_token` inteiro. Um regex que para no `[` deixa a segunda metade
 * (`]6MTc2…Fnjue9bK`) solta no texto, e ela ia parar na anotação, no banco.
 * Aceitar o `[…]` como parte da URL é o que permite apagar a coisa toda.
 */
const URL_NO_TEXTO = /https?:\/\/(?:\[…\]|[^\s)"'\]<>])+/g;

/** Rótulo que é só o nome de um arquivo — não é frase, é legenda de anexo. */
const ROTULO_DE_ARQUIVO =
  /^[^\n]{1,180}\.(png|jpe?g|webp|gif|avif|mp4|mov|webm|pdf|html?|zip|rar|ts|mkv|m4a|docx?|pptx?|xlsx?)$/i;

/**
 * O aviso que o PRÓPRIO Swipe Files posta neste canal.
 *
 * Toda referência salva vira uma mensagem aqui (ver `swipe-clickup-aviso`).
 * Importar essas mensagens de volta criaria um card chamado "Nova referência no
 * Swipe Files" para cada referência que já está lá dentro — a biblioteca
 * duplicando a si mesma, uma volta por importação.
 */
export function ehAvisoDoProprioSwipe(content: string): boolean {
  return /^\s*\**Nova referência no Swipe Files\**\s*—/i.test(content);
}

/** Extensão → mime, só do que o bucket aceita. O resto vira link. */
const MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
};

const KIND: Record<string, TipoDeAsset> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  avif: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  pdf: "pdf",
};

export function nomeDoAnexo(url: string): string {
  const semQuery = url.split("?")[0] ?? url;
  const ultimo = semQuery.split("/").pop() ?? "";
  try {
    return decodeURIComponent(ultimo);
  } catch {
    // Nome com `%` solto quebra o decode; o cru serve.
    return ultimo;
  }
}

export function extensaoDe(nome: string): string {
  const p = nome.split(".");
  return p.length > 1 ? (p.pop() ?? "").toLowerCase() : "";
}

/**
 * Nomes que não dizem nada.
 *
 * `image.png`, `CleanShot 2026-08-04 at 17.34.56@2x.png` e um UUID são o
 * mesmo caso: usar isso como título deixa a grade com vinte cards
 * indistinguíveis. Quando o nome é genérico, o título sai do texto da mensagem.
 */
export function nomeEhGenerico(nome: string): boolean {
  const base = nome.replace(/\.[^.]+$/, "").trim();
  if (!base) return true;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base) ||
    /^(image|file|undefined|download|unnamed|photo|video|foto)[-_ ]?\d*$/i.test(base) ||
    /^(cleanshot|screenshot|captura de tela|screen shot|img|image|rpreplay|whatsapp|photo)/i.test(base) ||
    /^\d{6,}$/.test(base) ||
    /^screencapture-/i.test(base) ||
    /**
     * Arquivo saído de baixador de anúncio.
     *
     * Importa mais para vídeo do que para imagem: a IA não lê vídeo, então o
     * nome do arquivo é o título DEFINITIVO. Num canal de referência de vídeo
     * isso enche a grade de
     * `SaveClip.App_004F4F9235E8FDCB40D102173B0B7AA0_video_dashinit` — e a
     * frase que a pessoa escreveu junto ("Ícaro - Década, gostei da sucessão
     * de cortes") fica de fora, sendo a única coisa ali que identifica algo.
     */
    /^(saveclip|snaptik|ssstik|savefrom|fbdown|tiktokdownload)/i.test(base) ||
    /_video_dashinit$/i.test(base) ||
    // Hash cru: 16+ dígitos hexadecimais seguidos, sem palavra no meio.
    /^[0-9a-f]{16,}$/i.test(base) ||
    // Id do Facebook/Instagram: `476831031_2845743875604430_8976..._n`.
    /^\d{6,}(_\d{6,})+(_n)?$/i.test(base) ||
    // Token cru, tipo `An9V4EpxVBe4vBaBAdBK-6SmBXHmcl…` (88 caracteres).
    // Trinta e dois seguidos SEM um espaço não é nome que alguém escreveu.
    /^[A-Za-z0-9_-]{32,}$/.test(base)
  );
}

/**
 * O texto da mensagem sem o andaime do ClickUp.
 *
 * O `content` da v3 vem em markdown e mistura três coisas com a frase que a
 * pessoa escreveu: o markdown dos anexos (`![x](url)`), o cartão de preview de
 * link — que repete o domínio e a URL inteira em três linhas — e as menções no
 * formato `[@Fulano](#user_mention#123)`. Copiado cru, o campo de anotação vira
 * uma parede de URL onde havia uma frase de duas linhas.
 */
/** Tira as contrabarras que o ClickUp põe antes de `_`, `[`, `(` e afins. */
function desescapar(s: string): string {
  return s.replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1");
}

export function limparTexto(bruto: string): string {
  let t = bruto;

  // 1. O cartão de preview: `[\n\n dominio \n\n url \n\n](url)`. Some inteiro —
  //    a URL já vai para `origem`, e repetida no texto só ocupa espaço.
  t = t.replace(/\[\s*\n[\s\S]{0,400}?\n\s*\]\([^)]*\)/g, " ");

  // 2. Menções ANTES dos links: `[@Fulano](#user_mention#123)` também casa com
  //    a regra de link nomeado, e ali o nome se perderia.
  t = t.replace(/\[@([^\]]+)\]\(#user_mention#\d+\)/g, "@$1");

  /**
   * 3. Links e imagens, com os escapes respeitados.
   *
   * O ClickUp escapa o markdown do rótulo: um nome vira
   * `245476318\_297726165222484\_n \(1\).jpg` e uma URL encurtada vira
   * `https://…\[…\]w4\_aem\_…`. Um `[^\]]*` ingênuo para no primeiro `\]`
   * escapado e corta o casamento no meio — foi assim que `.jpg)` sobrou solto
   * numa anotação e metade de um fbclid em outra. `(?:\\.|[^\\\]])` consome o
   * par contrabarra-caractere como uma unidade, e aí o colchete escapado deixa
   * de ser um fim de rótulo.
   */
  const LINK = /(!?)\[((?:\\.|[^\\\]])*)\]\(((?:\\.|[^\\)])*)\)/g;
  t = t.replace(LINK, (_todo, bang: string, rotulo: string) => {
    // Imagem embutida é o anexo, que já virou card por conta própria.
    if (bang) return " ";
    const r = desescapar(rotulo).trim();
    // Rótulo que é a própria URL, ou o nome do arquivo, não é frase: o card já
    // tem esse nome no título e a URL já foi para `origem`.
    if (!r || /^https?:\/\//i.test(r) || ROTULO_DE_ARQUIVO.test(r)) return " ";
    return r;
  });

  t = t.replace(/<@[A-Z0-9]+>/g, "");
  t = t.replace(/#user_mention#\d+/g, "");

  t = desescapar(t);

  // 4. URL solta, inclusive a truncada com `[…]` no meio — é onde vinha o token.
  t = t.replace(URL_NO_TEXTO, " ");

  // 5. Nome de arquivo sozinho na linha: sobra de anexo colado sem markdown.
  t = t.replace(
    /^\s*[^\n]{1,180}\.(png|jpe?g|webp|gif|avif|mp4|mov|webm|pdf|html?|zip|rar|ts|mkv|m4a)\s*$/gim,
    " ",
  );

  // 6. Ênfase, citação e restos de colchete vazio que as remoções deixaram.
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/(?<![a-zA-Z0-9])[_*]([^_*\n]+)[_*](?![a-zA-Z0-9])/g, "$1");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/\[\s*\]|\(\s*\)/g, " ");
  t = t.replace(/^\s*[*\-–—]+\s*$/gm, " ");

  return t
    .split("\n")
    .map((l) => l.trim().replace(/^[*\-–—]\s+/, ""))
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A primeira frase aproveitável, para virar título. */
function primeiraFrase(texto: string, max = 90): string | null {
  for (const linha of texto.split("\n")) {
    const l = linha.trim().replace(/^[#>*\-\s]+/, "");
    // Linhas de duas letras ("kk", "rs") não são título de nada.
    if (l.length < 6) continue;
    // Corta na primeira pontuação, MAS só se o que sobra ainda for uma frase.
    // "Ref. produto margem 3X" cortaria em "Ref." — o ponto ali é abreviação,
    // e o título viraria uma palavra que não identifica nada.
    const corte = l.split(/(?<=[.!?:])\s/)[0] ?? l;
    const escolhido = corte.trim().length >= 25 ? corte : l;
    const f = (escolhido.length > max ? `${escolhido.slice(0, max).trimEnd()}…` : escolhido).trim();
    // Sem a pontuação final pendurada: "Página linda:" vira "Página linda".
    return f.replace(/[:,;\-–—]+$/, "").trim() || null;
  }
  return null;
}

/** Mensagens do sistema, que não são referência de nada. */
export function ehRuido(content: string): boolean {
  return /(entrou no canal|saiu do canal|foi adicionad[oa] ao canal|criou este canal)\s*$/i.test(
    content.trim(),
  );
}

/**
 * O plano de importação de uma mensagem.
 *
 * Nada de rede aqui: recebe a mensagem, devolve o que gravar. É o que permite
 * testar a decisão — qual vira card, qual vira origem, que título cada um
 * recebe — sem subir 1,8 GB para descobrir.
 */
export function planejarMensagem(m: MensagemDoClickUp): ItemParaImportar[] {
  const proprio = m.content ?? "";
  if (ehRuido(proprio) || ehAvisoDoProprioSwipe(proprio)) return [];

  // A resposta na thread costuma trazer o contexto ("é a parte 2/5", "esse é o
  // upsell"). Entra na leitura, mas não gera card: quem responde não anexou.
  const tudo = [proprio, ...(m.respostas ?? []).map((r) => r.content ?? "")].join("\n");

  // `desescapar` aqui devolve a URL como ela é de verdade: `\(1\)` → `(1)`.
  const anexos = [
    ...new Set(
      (tudo.match(ANEXO) ?? []).map((u) => desescapar(u).replace(/\?view=open$/, "")),
    ),
  ];
  const externos = [
    ...new Set(
      (tudo.match(QUALQUER_URL) ?? []).map(desescapar).filter((u) => !u.includes("clickup")),
    ),
  ];

  const texto = limparTexto(tudo) || null;
  const doTexto = texto ? primeiraFrase(texto) : null;
  const autor = m.user_id && m.user_id !== "-1" ? m.user_id : null;
  const data = m.date ?? null;

  // A origem é a mesma para todos os cards da mensagem: uma mensagem fala de
  // UMA página, e os anexos são recortes dela.
  const origem = externos[0] ?? null;

  const itens: ItemParaImportar[] = [];

  anexos.forEach((url, i) => {
    const nome = nomeDoAnexo(url);
    const ext = extensaoDe(nome);
    const mime = MIMES[ext] ?? null;
    const kind = KIND[ext] ?? "link";

    // Nome bom vence a frase da mensagem: `Black Friday _ Finclass.html` diz
    // mais que "Parte 1/5", que é o que a pessoa digitou.
    const base = !nomeEhGenerico(nome)
      ? nome.replace(/\.[^.]+$/, "").trim()
      : (doTexto ?? (nome.replace(/\.[^.]+$/, "").trim() || "Referência"));

    itens.push({
      importKey: url,
      // Só numera quando há mais de um E o nome não distingue — numerar
      // `Black Friday _ Finclass` de `BK _ Super Black do Ber` seria mentira.
      titulo: recortar(
        anexos.length > 1 && nomeEhGenerico(nome) ? `${base} (${i + 1}/${anexos.length})` : base,
        200,
      ),
      notas: texto,
      kind,
      anexo: mime ? { url, nome, mime } : null,
      // Sem binário no bucket, o card precisa apontar para algum lugar que
      // abra: a página original se houver, senão o próprio anexo do ClickUp.
      origem: mime ? origem : (origem ?? url),
      autorNoClickUp: autor,
      data,
    });
  });

  // Link vira card só quando a mensagem não trouxe arquivo: com print junto,
  // ele já é a `origem` daquele card.
  if (anexos.length === 0) {
    for (const url of externos) {
      itens.push({
        importKey: `msg:${m.id}:${url}`,
        titulo: recortar(doTexto ?? dominioDe(url) ?? "Referência", 200),
        notas: texto,
        kind: "link",
        anexo: null,
        origem: url,
        autorNoClickUp: autor,
        data,
      });
    }
  }

  return itens;
}

function recortar(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** O plano do canal inteiro, já sem repetido. */
export function planejarImportacao(msgs: MensagemDoClickUp[]): ItemParaImportar[] {
  const porChave = new Map<string, ItemParaImportar>();
  for (const m of msgs) {
    for (const item of planejarMensagem(m)) {
      // O mesmo anexo aparece em duas mensagens quando alguém reencaminha. O
      // primeiro ganha: é onde está o contexto original.
      if (!porChave.has(item.importKey)) porChave.set(item.importKey, item);
    }
  }
  return [...porChave.values()];
}
