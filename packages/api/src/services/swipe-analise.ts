/**
 * Lê a referência e sugere como catalogá-la.
 *
 * ## O problema que isto resolve
 *
 * Catalogar dá trabalho e o trabalho é chato: sete campos por referência, e a
 * biblioteca só vale quando dá para procurar depois. Uma referência salva sem
 * marca, nicho e formato é um arquivo perdido numa pasta — existe, mas ninguém
 * acha. O custo de preencher é pago hoje; o benefício, semanas depois. É
 * exatamente o tipo de trabalho que não se faz.
 *
 * ## Sugerir, nunca decidir
 *
 * O que volta daqui **preenche o formulário**, não salva nada. A pessoa vê,
 * corrige e envia. Duas consequências no desenho:
 *
 * 1. **Campo que o modelo não souber fica vazio**, nunca chutado. Uma marca
 *    errada é pior que marca em branco: a busca por ela devolve a referência
 *    errada, e ninguém confere um campo que já veio preenchido.
 * 2. **Plataforma e formato saem de um vocabulário fechado** — o mesmo da tela.
 *    Deixar o modelo inventar "Instagram Reels" ao lado de "Reel" quebraria o
 *    filtro por facetas, que é o que faz a biblioteca funcionar.
 */

import type Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-sonnet-4-6";

/** Os mesmos da tela. Um vocabulário fechado é o que mantém a faceta útil. */
export const PLATAFORMAS = ["Meta", "Google", "TikTok", "YouTube", "Kwai", "Outro"] as const;
export const FORMATOS = [
  "Reel",
  "Feed",
  "Story",
  "Carrossel",
  "VSL",
  "Landing page",
  "E-mail",
  "Criativo estático",
] as const;

/** Tipos que o modelo consegue enxergar. Vídeo não entra — ver `podeAnalisar`. */
export const MIMES_DE_IMAGEM = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export const MIME_PDF = "application/pdf";

/** O mínimo que este módulo pede do cliente — o que o teste precisa simular. */
export interface ClienteDeAnalise {
  messages: {
    stream: (p: Anthropic.MessageCreateParamsNonStreaming) => {
      finalMessage: () => Promise<Anthropic.Message>;
    };
  };
}

export interface SugestaoDeSwipe {
  titulo: string | null;
  anotacoes: string | null;
  marca: string | null;
  nicho: string | null;
  plataforma: string | null;
  formato: string | null;
  tags: string[];
}

const VAZIA: SugestaoDeSwipe = {
  titulo: null,
  anotacoes: null,
  marca: null,
  nicho: null,
  plataforma: null,
  formato: null,
  tags: [],
};

/**
 * Se dá para analisar este arquivo.
 *
 * Vídeo fica de fora: o modelo não recebe vídeo, e extrair um frame exigiria
 * ffmpeg no servidor para adivinhar a partir de uma imagem que pode ser a tela
 * preta do primeiro quadro. Melhor não oferecer do que oferecer errado.
 */
export function podeAnalisar(mime: string | null | undefined): boolean {
  return Boolean(mime && (MIMES_DE_IMAGEM.has(mime) || mime === MIME_PDF));
}

const INSTRUCOES = `Você cataloga referências de anúncio para a biblioteca de um time de marketing brasileiro.

Olhe o material e preencha os campos. O objetivo é que a pessoa ACHE isto de novo daqui a três meses.

REGRAS

1. Campo que você não conseguir determinar com segurança fica VAZIO. Marca errada é pior que marca em branco: a busca por ela devolve o anúncio errado, e ninguém confere um campo que já veio preenchido.
2. \`marca\` é de quem ANUNCIA — o logo, o @ do perfil, o nome que assina a oferta. Não é o nome do produto nem o da agência.
3. \`plataforma\` e \`formato\` só aceitam os valores da lista. Nenhum outro, nem parecido.
4. \`anotacoes\` responde "o que dá para roubar daqui": o gancho, a estrutura, a promessa, a prova. Uma ou duas frases DIRETAS, em português, sobre a técnica — não a descrição do que se vê.
5. \`titulo\` é curto e específico, para dar para reconhecer numa grade de miniaturas. Nada de "Anúncio de marketing digital".
6. \`tags\` são 3 a 6, minúsculas, sem acento nem espaço: o mecanismo (\`prova-social\`, \`antes-depois\`, \`escassez\`), o público, o tipo de oferta.

TOM
Escreva como quem cataloga para si mesmo — objetivo e sem adjetivo de vendedor.`;

const FERRAMENTA: Anthropic.Tool = {
  name: "catalogar_referencia",
  description: "Preenche os campos de catalogação da referência.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Curto e específico. Vazio se não der." },
      anotacoes: { type: "string", description: "O que dá para roubar: gancho, estrutura, prova." },
      marca: { type: "string", description: "Quem anuncia. VAZIO se não estiver visível." },
      nicho: { type: "string", description: "Ex.: finanças, saúde, educação, estética." },
      plataforma: { type: "string", enum: [...PLATAFORMAS] },
      formato: { type: "string", enum: [...FORMATOS] },
      tags: { type: "array", items: { type: "string" }, maxItems: 6 },
    },
    required: ["tags"],
  },
};

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  // String vazia e "não sei" são a mesma coisa: campo em branco na tela.
  if (!t || /^(n\/a|nao sei|não sei|desconhecid[oa]|indefinid[oa])$/i.test(t)) return null;
  return t.slice(0, max);
}

function daLista(v: unknown, lista: readonly string[]): string | null {
  const t = texto(v, 60);
  if (!t) return null;
  // Comparação sem caixa: o modelo às vezes devolve "meta" por "Meta". O que
  // não estiver na lista é DESCARTADO, não normalizado na marra — inventar um
  // valor próximo é o começo de duas facetas para a mesma coisa.
  return lista.find((x) => x.toLowerCase() === t.toLowerCase()) ?? null;
}

function tags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string") continue;
    const limpa = t
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (limpa.length >= 2 && limpa.length <= 60) vistas.add(limpa);
    if (vistas.size >= 6) break;
  }
  return [...vistas];
}

export class ErroDeAnalise extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroDeAnalise";
  }
}

/** Traduz a falha da API num recado que diz quem resolve. */
export function motivoLegivel(erro: unknown): string {
  const e = erro as { status?: number; message?: string };
  if (/credit balance is too low/i.test(e?.message ?? "")) {
    return "A conta de IA está sem saldo. Preencha os campos à mão por enquanto.";
  }
  if (e?.status === 401 || e?.status === 403) {
    return "A chave da API de IA foi recusada. Fale com quem cuida do servidor.";
  }
  if (e?.status === 429) return "A IA está no limite de uso. Tente em alguns segundos.";
  if (typeof e?.status === "number" && e.status >= 500) {
    return "A IA está sobrecarregada. Tente de novo em instantes.";
  }
  return "Não consegui analisar agora. Preencha à mão — nada se perdeu.";
}

/**
 * Analisa o arquivo e devolve o que preencher.
 *
 * O contexto (nome do arquivo, link de origem) entra junto: uma landing page
 * salva em PDF diz muito mais quando se sabe o domínio de onde veio.
 */
export async function analisarReferencia(
  client: ClienteDeAnalise,
  arquivo: { buffer: Buffer; mimeType: string },
  contexto?: { nomeDoArquivo?: string; origem?: string },
): Promise<SugestaoDeSwipe> {
  if (!podeAnalisar(arquivo.mimeType)) {
    throw new ErroDeAnalise("Só dá para analisar imagem ou PDF.");
  }

  const base64 = arquivo.buffer.toString("base64");
  const conteudo: Anthropic.ContentBlockParam[] =
    arquivo.mimeType === MIME_PDF
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: arquivo.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: base64,
            },
          },
        ];

  const pistas = [
    contexto?.nomeDoArquivo ? `Nome do arquivo: ${contexto.nomeDoArquivo}` : null,
    contexto?.origem ? `Veio de: ${contexto.origem}` : null,
  ].filter(Boolean);

  let resposta: Anthropic.Message;
  try {
    /**
     * `stream` e não `create`, e o motivo é a rede, não a interface.
     *
     * Ler um PDF de alguns megabytes leva de 20 a 60 segundos — medido: 17 s
     * para 0,45 MB. Uma requisição que não manda **nada** nesse tempo é cortada
     * pelo proxy, e a tela fica pendurada sem erro nem resultado. O stream
     * mantém bytes fluindo, então a conexão nunca parece ociosa.
     *
     * `finalMessage()` devolve a mensagem completa, como o `create` faria: o
     * ganho está no meio do caminho, não no fim.
     */
    resposta = await client.messages
      .stream({
        model: MODELO,
        max_tokens: 1024,
        system: INSTRUCOES,
        tools: [FERRAMENTA],
        // Força a ferramenta: sem isso o modelo às vezes responde em prosa, e
        // aí a catalogação vira parsing de texto livre.
        tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [
          {
            role: "user",
            content: [
              ...conteudo,
              {
                type: "text",
                text: pistas.length
                  ? `Catalogue esta referência.\n${pistas.join("\n")}`
                  : "Catalogue esta referência.",
              },
            ],
          },
        ],
      })
      .finalMessage();
  } catch (erro) {
    throw new ErroDeAnalise(motivoLegivel(erro));
  }

  const bloco = resposta.content.find((c) => c.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") return VAZIA;

  const r = bloco.input as Record<string, unknown>;
  return {
    titulo: texto(r.titulo, 200),
    anotacoes: texto(r.anotacoes, 4000),
    marca: texto(r.marca, 120),
    nicho: texto(r.nicho, 120),
    plataforma: daLista(r.plataforma, PLATAFORMAS),
    formato: daLista(r.formato, FORMATOS),
    tags: tags(r.tags),
  };
}

// ============================================================
// Catalogar sem ver a peça
// ============================================================

/**
 * O que se sabe de um link sem abri-lo.
 *
 * Vem de três lugares que se completam: o Open Graph da página (título,
 * descrição), a URL em si (o domínio costuma ser a marca) e o que a pessoa
 * escreveu ao salvar — que é a única fonte que diz POR QUE aquilo foi salvo.
 */
export interface DadosDoLink {
  url: string;
  titulo?: string | null;
  descricao?: string | null;
  siteName?: string | null;
  /** O texto de quem salvou. No acervo importado, a mensagem do ClickUp. */
  notas?: string | null;
}

/**
 * Instruções para quem NÃO está vendo a peça.
 *
 * Precisam ser mais duras que as da análise visual, e por um motivo concreto:
 * com uma imagem na frente, "formato: Reel" é observação; com só uma URL, é
 * chute. E um chute preenchido é pior que um campo vazio, porque a faceta
 * passa a mentir e ninguém confere o que já veio preenchido.
 */
const INSTRUCOES_DE_LINK = `${INSTRUCOES}

ATENÇÃO — VOCÊ NÃO ESTÁ VENDO A PEÇA

Recebeu só o endereço e o que a página diz de si mesma. Isso muda o que dá para afirmar:

- \`formato\` só quando o endereço ou o texto disserem. Uma landing page de vendas é "Landing page"; um post do Instagram sem mais nada NÃO diz se é Reel, Feed ou Carrossel — deixe VAZIO.
- \`plataforma\` é onde o anúncio RODOU, não onde a página está hospedada. Um link de landing page normalmente não revela isso: deixe vazio em vez de escrever "Outro" por escrever.
- \`marca\` costuma estar no domínio ou no nome do site. Não invente a partir do assunto.
- \`anotacoes\` descreve o que a página parece ser e por que foi salva, a partir do que você tem. Não descreva um criativo que você não viu.

Vazio não é falha — é a resposta certa para o que o texto não sustenta.`;

/**
 * Cataloga um link a partir do texto, e da imagem de preview quando houver.
 *
 * A imagem do Open Graph de uma landing page costuma ser a própria dobra
 * inicial: quando ela existe, o modelo vê o design e para de depender só do
 * endereço. Quando não existe, o texto ainda dá marca e nicho, que é o que faz
 * a referência ser encontrada de novo.
 */
export async function analisarLink(
  client: ClienteDeAnalise,
  dados: DadosDoLink,
  imagem?: { buffer: Buffer; mimeType: string },
): Promise<SugestaoDeSwipe> {
  const linhas = [
    `Endereço: ${dados.url}`,
    dados.siteName ? `Site: ${dados.siteName}` : null,
    dados.titulo ? `Título da página: ${dados.titulo}` : null,
    dados.descricao ? `Descrição da página: ${dados.descricao}` : null,
    dados.notas ? `Anotação de quem salvou: ${dados.notas.slice(0, 1200)}` : null,
  ].filter(Boolean);

  const conteudo: Anthropic.ContentBlockParam[] = [];
  if (imagem && MIMES_DE_IMAGEM.has(imagem.mimeType)) {
    conteudo.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imagem.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
        data: imagem.buffer.toString("base64"),
      },
    });
    conteudo.push({
      type: "text",
      // Dizer O QUE é a imagem evita que ela seja lida como o criativo em si:
      // a imagem de preview é escolhida pelo site, não pelo anunciante.
      text: "A imagem acima é o preview que a própria página publica.",
    });
  }
  conteudo.push({ type: "text", text: `Catalogue esta referência.\n${linhas.join("\n")}` });

  let resposta: Anthropic.Message;
  try {
    resposta = await client.messages
      .stream({
        model: MODELO,
        max_tokens: 1024,
        system: INSTRUCOES_DE_LINK,
        tools: [FERRAMENTA],
        tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [{ role: "user", content: conteudo }],
      })
      .finalMessage();
  } catch (erro) {
    throw new ErroDeAnalise(motivoLegivel(erro));
  }

  const bloco = resposta.content.find((c) => c.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") return VAZIA;

  const r = bloco.input as Record<string, unknown>;
  return {
    titulo: texto(r.titulo, 200),
    anotacoes: texto(r.anotacoes, 4000),
    marca: texto(r.marca, 120),
    nicho: texto(r.nicho, 120),
    plataforma: daLista(r.plataforma, PLATAFORMAS),
    formato: daLista(r.formato, FORMATOS),
    tags: tags(r.tags),
  };
}
