/**
 * Lê um comprovante de pagamento (print ou PDF) e devolve os campos da venda
 * já preenchidos, pra pessoa só conferir e confirmar.
 *
 * Por que multimodal e não OCR + regex: comprovante de PIX não tem formato —
 * cada banco desenha o seu, e print de celular vem torto, cortado e com o valor
 * em qualquer canto. O modelo lê a imagem como um humano leria.
 *
 * O resultado NUNCA é gravado direto: volta pro formulário, a pessoa confirma.
 * Por isso o prompt prefere devolver `null` a chutar — campo vazio a pessoa
 * preenche em 2 segundos; campo errado passa despercebido e entra na base.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** Modelo com visão. Extração é tarefa curta — não precisa do modelo grande. */
const MODELO = "claude-sonnet-4-6";

export const MIMES_IMAGEM = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MIME_PDF = "application/pdf";

export interface DadosComprovante {
  /** Nome de quem pagou. */
  customerName: string | null;
  /** Valor em reais, já como número (1234.56). */
  value: number | null;
  /** Data do pagamento em AAAA-MM-DD. */
  saleDate: string | null;
  /** PIX, Cartão, Dinheiro, Transferência, Boleto… */
  paymentMethod: string | null;
  /** Só dígitos. Comprovante costuma mascarar (***.456.789-**) — nesse caso vem null. */
  customerCpf: string | null;
  /** Só dígitos, com DDD. */
  customerPhone: string | null;
  /**
   * O que o modelo NÃO conseguiu ler com segurança. A UI destaca esses campos
   * pra pessoa preencher, em vez de deixar o buraco passar batido.
   */
  camposNaoEncontrados: string[];
}

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_comprovante",
  description:
    "Registra os dados lidos do comprovante de pagamento. Use null em todo campo que não estiver " +
    "legível ou não aparecer no comprovante — nunca invente ou deduza valores.",
  input_schema: {
    type: "object",
    properties: {
      customerName: {
        type: ["string", "null"],
        description:
          "Nome completo de QUEM PAGOU (pagador/origem). Nunca o nome do recebedor/destinatário.",
      },
      value: {
        type: ["number", "null"],
        description: "Valor pago em reais, como número. Ex.: 1234.56 para R$ 1.234,56.",
      },
      saleDate: {
        type: ["string", "null"],
        description: "Data do pagamento no formato AAAA-MM-DD.",
      },
      paymentMethod: {
        type: ["string", "null"],
        description: "Forma de pagamento: PIX, Cartão de crédito, Cartão de débito, Dinheiro, Transferência ou Boleto.",
      },
      customerCpf: {
        type: ["string", "null"],
        description:
          "CPF/CNPJ do PAGADOR, só dígitos. Se estiver mascarado (ex.: ***.456.789-**), devolva null.",
      },
      customerPhone: {
        type: ["string", "null"],
        description: "Telefone do pagador com DDD, só dígitos.",
      },
      camposNaoEncontrados: {
        type: "array",
        items: { type: "string" },
        description:
          "Nomes dos campos que você não conseguiu ler com segurança, entre: customerName, value, saleDate, paymentMethod, customerCpf, customerPhone.",
      },
    },
    required: ["customerName", "value", "saleDate", "paymentMethod", "customerCpf", "customerPhone", "camposNaoEncontrados"],
  },
};

const INSTRUCOES = `Você lê comprovantes de pagamento brasileiros (PIX, cartão, transferência, boleto) e extrai os dados da venda.

Regras que não podem ser quebradas:
- O nome é o de QUEM PAGOU. Comprovante de PIX mostra pagador e recebedor — se você trocar os dois, a venda entra na base no nome errado.
- Valor em reais como número: "R$ 1.234,56" vira 1234.56. Se houver vários valores (taxa, saldo, total), use o VALOR PAGO na transação.
- Data no formato AAAA-MM-DD. Comprovante em pt-BR usa dd/mm/aaaa — converta.
- CPF mascarado (***.456.789-**) não serve: devolva null.
- Na dúvida sobre qualquer campo, devolva null e liste o campo em camposNaoEncontrados. Um campo vazio custa 2 segundos pra pessoa preencher; um campo errado entra na base sem ninguém perceber.

Chame sempre a ferramenta registrar_comprovante.`;

/** Normaliza o que o modelo devolveu — ele pode mandar string onde esperamos número. */
function soDigitos(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/**
 * CPF (11) ou CNPJ (14) — qualquer outra contagem é descartada.
 *
 * Comprovante de PIX quase sempre mascara o documento ("***.456.789-**"). Sem
 * este filtro, os dígitos visíveis viravam "456789" e entravam na base como se
 * fossem um documento real: errado e difícil de perceber depois.
 */
function documento(v: unknown): string | null {
  const d = soDigitos(v);
  if (!d) return null;
  return d.length === 11 || d.length === 14 ? d : null;
}

/** Telefone só serve com DDD: 10 (fixo) ou 11 (celular) dígitos. */
function telefone(v: unknown): string | null {
  const d = soDigitos(v);
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? d : null;
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    // "1.234,56" (BR) e "1234.56" (US) — decide pelo separador que vem por último.
    const limpo = v.replace(/[^\d,.-]/g, "");
    if (!limpo) return null;
    const brasileiro = limpo.lastIndexOf(",") > limpo.lastIndexOf(".");
    const n = Number(
      brasileiro ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, ""),
    );
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function data(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Rede de segurança: o modelo às vezes devolve dd/mm/aaaa mesmo instruído.
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

export async function extrairComprovante(
  client: Anthropic,
  arquivo: { buffer: Buffer; mimeType: string },
): Promise<DadosComprovante> {
  const base64 = arquivo.buffer.toString("base64");

  // PDF vai como `document` (o modelo lê o PDF nativo, inclusive escaneado);
  // print vai como `image`. Extrair texto do PDF antes perderia o layout, que é
  // justamente o que distingue pagador de recebedor.
  const conteudo: Anthropic.ContentBlockParam[] =
    arquivo.mimeType === MIME_PDF
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }]
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

  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: INSTRUCOES,
    tools: [FERRAMENTA],
    // Força a ferramenta: sem isso o modelo às vezes responde em prosa e a
    // extração vira parsing de texto livre.
    tool_choice: { type: "tool", name: FERRAMENTA.name },
    messages: [
      {
        role: "user",
        content: [...conteudo, { type: "text", text: "Extraia os dados deste comprovante." }],
      },
    ],
  });

  const bloco = resposta.content.find((c) => c.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    throw new Error("O modelo não devolveu os dados estruturados do comprovante");
  }

  const bruto = bloco.input as Record<string, unknown>;
  const dados: DadosComprovante = {
    customerName: texto(bruto.customerName),
    value: numero(bruto.value),
    saleDate: data(bruto.saleDate),
    paymentMethod: texto(bruto.paymentMethod),
    customerCpf: documento(bruto.customerCpf),
    customerPhone: telefone(bruto.customerPhone),
    camposNaoEncontrados: Array.isArray(bruto.camposNaoEncontrados)
      ? bruto.camposNaoEncontrados.filter((c): c is string => typeof c === "string")
      : [],
  };

  // O modelo pode dizer que achou e ainda assim mandar lixo que a normalização
  // derrubou — a lista tem que refletir o que REALMENTE chega na tela.
  const faltando = new Set(dados.camposNaoEncontrados);
  for (const [campo, valor] of Object.entries(dados)) {
    if (campo === "camposNaoEncontrados") continue;
    if (valor === null) faltando.add(campo);
    else faltando.delete(campo);
  }
  dados.camposNaoEncontrados = [...faltando];

  return dados;
}
