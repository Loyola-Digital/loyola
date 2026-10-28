/**
 * Story 42.11 — o que a tabela "Jornada por canal" da etapa Lyrio decide, na
 * forma pura (o vitest do web só coleta `lib/utils/**`; o `.tsx` só desenha).
 *
 *  - o estado do bloco: carregando · OCULTO (a API ainda não tem a rota — 404
 *    "Not Found", o banner de versão explica) · ERRO (qualquer outra falha —
 *    nunca tabela vazia nem zeros, AC6) · pronto;
 *  - as taxas contra Novos (AC1), com denominador 0 = "—";
 *  - as três declarações do AC4, com a data do primeiro evento de assinatura
 *    vinda da API (não fixa aqui).
 */

import { ehApiAtras } from "./mensagem-de-api-atras";

/**
 * Story 42.12 (AC4, PO-07): `campanha` virou `campanha_meta` e `campanha_google`.
 * A chave antiga continua aceita — a API anterior (contrato 40) ainda a manda, e
 * a tabela desenha o `rotulo` que vier.
 */
export type CanalDaJornada =
  | "campanha_meta"
  | "campanha_google"
  | "campanha"
  | "google_gclid"
  | "meta_fbclid"
  | "meta_install"
  | "organico"
  | "sem_ios"
  | "sem_android";

export interface ContagemDaJornada {
  novos: number;
  viuPaywall: number;
  interagiu: number;
  iniciou: number;
  iniciouTeste: number;
  pagou: number;
  receitaUsd: number;
}

/** Espelha a resposta de `GET …/revenuecat/jornada` (`routes/revenuecat.ts`). Só contagens — nenhum id de usuário. */
export interface JornadaDoLyrio {
  days: number;
  /** Início da janela (`AAAA-MM-DD`): o primeiro dia, no fuso de SP (Story 42.13). */
  desde: string;
  /** Primeiro evento de ASSINATURA da etapa (`AAAA-MM-DD`); `null` se ainda não houve. */
  assinaturaDesde: string | null;
  linhas: (ContagemDaJornada & { canal: CanalDaJornada; rotulo: string })[];
  /** Story 42.12 (D7): usuários com campanha da Meta E do Google — fora das linhas, dentro do Total. Ausente na API anterior. */
  conflito?: ContagemDaJornada;
  /** Story 42.12 (AC4): primeiro evento da etapa com `ad_network` ou id de campanha da Meta. Ausente na API anterior. */
  atributosDesde?: string | null;
  total: ContagemDaJornada;
  /** Story 42.18 (AC3): o iniciou de cada canal repartido por plano. Ausente na API anterior (contrato < 60). */
  porProduto?: PorProdutoDaJornada;
}

// ─────────────── Story 42.18 — Por produto × canal ───────────────

export type LinhaDoPorProduto = "mensal" | "trimestral" | "semestral" | "anual" | "outros" | "sem_produto";

export interface CelulaDoPorProduto {
  iniciou: number;
  iniciouTeste: number;
}

/** Espelha `porProduto` de `GET …/revenuecat/jornada` (`utils/jornada-por-produto-lyrio.ts` da API). Só contagens e ids de produto. */
export interface PorProdutoDaJornada {
  /** O denominador: os novos de cada canal, na ordem da Jornada. */
  canais: { canal: CanalDaJornada; rotulo: string; novos: number }[];
  conflito: { novos: number };
  total: { novos: number };
  linhas: {
    linha: LinhaDoPorProduto;
    rotulo: string;
    canais: (CelulaDoPorProduto & { canal: CanalDaJornada })[];
    conflito: CelulaDoPorProduto;
    total: CelulaDoPorProduto;
    /** Os `product_id` que caíram na linha (PO-01). */
    produtos: (CelulaDoPorProduto & { productId: string })[];
  }[];
}

/** AC4d — a dica do cabeçalho, literal da story. */
export const DICA_DO_POR_PRODUTO =
  "Novos do canal na janela que iniciaram este plano ÷ todos os novos do canal. O usuário novo não tem produto antes de iniciar, por isso o denominador é o canal.";

export interface ColunaDoPorProduto {
  /** O `canal` da Jornada, `"conflito"` ou `"total"`. */
  chave: string;
  rotulo: string;
  novos: number;
}

/**
 * AC4a — as colunas, cada uma com as duas taxas: os 8 canais na ordem da
 * Jornada, o conflito (só quando houver, como a linha da tabela de cima) e o
 * Total.
 */
export function colunasDoPorProduto(p: PorProdutoDaJornada): ColunaDoPorProduto[] {
  return [
    ...p.canais.map((c) => ({ chave: c.canal as string, rotulo: c.rotulo, novos: c.novos })),
    ...(p.conflito.novos > 0 ? [{ chave: "conflito", rotulo: "Meta e Google (conflito)", novos: p.conflito.novos }] : []),
    { chave: "total", rotulo: "Total", novos: p.total.novos },
  ];
}

/**
 * AC4a/AC4e — as duas taxas de uma célula, contra os NOVOS DO CANAL (não do
 * plano): 0 novos no canal → `null` ("—"); novos e ninguém no plano → 0.
 */
export function taxasDoPorProduto(linha: PorProdutoDaJornada["linhas"][number], coluna: ColunaDoPorProduto): { trial: number | null; iniciou: number | null } {
  const c = coluna.chave === "total" ? linha.total : coluna.chave === "conflito" ? linha.conflito : linha.canais.find((x) => x.canal === coluna.chave);
  return { trial: taxaDaJornada(c?.iniciouTeste ?? 0, coluna.novos), iniciou: taxaDaJornada(c?.iniciou ?? 0, coluna.novos) };
}

/** AC2b (PO-01) — a dica da linha: os `product_id` que caíram nela, para "Outros" não esconder um plano novo. */
export function dicaDaLinhaDoPorProduto(linha: PorProdutoDaJornada["linhas"][number]): string {
  if (linha.linha === "sem_produto") return "Iniciaram, mas o primeiro evento de início veio sem product_id.";
  if (linha.produtos.length === 0) return "Nenhum produto nesta linha na janela.";
  const itens = linha.produtos.map((p) => `${p.productId} (${p.iniciou.toLocaleString("pt-BR")} iniciaram; ${p.iniciouTeste.toLocaleString("pt-BR")} por trial)`);
  return `Produtos nesta linha: ${itens.join(" · ")}`;
}

const SEM_CONFLITO: ContagemDaJornada = { novos: 0, viuPaywall: 0, interagiu: 0, iniciou: 0, iniciouTeste: 0, pagou: 0, receitaUsd: 0 };

/**
 * AC4c — a paridade, conferida nas CONTAGENS (exatas): para cada canal (e o
 * conflito e o Total), a soma das linhas é o iniciou / iniciou teste da tabela
 * por canal. Devolve as colunas que não fecham (vazio = fecha). As taxas na
 * tela são arredondadas célula a célula (0,1 p.p.): a soma das taxas exibidas
 * de uma coluna pode diferir da taxa do canal exibida em até 0,05 p.p. por
 * linha com valor mais 0,05 p.p. da própria taxa do canal.
 */
export function colunasSemParidade(j: Pick<JornadaDoLyrio, "linhas" | "conflito" | "total" | "porProduto">): string[] {
  const p = j.porProduto;
  if (!p) return [];
  const soma = (pegar: (l: PorProdutoDaJornada["linhas"][number]) => CelulaDoPorProduto | undefined) => ({
    iniciou: p.linhas.reduce((a, l) => a + (pegar(l)?.iniciou ?? 0), 0),
    iniciouTeste: p.linhas.reduce((a, l) => a + (pegar(l)?.iniciouTeste ?? 0), 0),
  });
  const confere = (chave: string, alvo: ContagemDaJornada | undefined, s: CelulaDoPorProduto, novos: number) =>
    alvo && alvo.iniciou === s.iniciou && alvo.iniciouTeste === s.iniciouTeste && alvo.novos === novos ? [] : [chave];
  return [
    ...p.canais.flatMap((c) => confere(c.canal, j.linhas.find((l) => l.canal === c.canal), soma((l) => l.canais.find((x) => x.canal === c.canal)), c.novos)),
    ...confere("conflito", j.conflito ?? SEM_CONFLITO, soma((l) => l.conflito), p.conflito.novos),
    ...confere("total", j.total, soma((l) => l.total), p.total.novos),
  ];
}

/** AC4c — a frase do arredondamento, declarada abaixo da tabela. */
export const ARREDONDAMENTO_DO_POR_PRODUTO =
  "Cada taxa é arredondada a 0,1 ponto percentual. Somando as linhas de uma coluna, chega-se à taxa do canal na tabela de cima; a soma do que aparece pode diferir dela em até 0,05 ponto por linha com valor, mais 0,05 do arredondamento da própria taxa do canal.";

export type EstadoDoBloco = { tipo: "carregando" } | { tipo: "oculto" } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; dados: JornadaDoLyrio };

/**
 * AC6 (PO-07): 404 DA ROTA (a API anterior à 42.11 não a tem) → o bloco some e
 * o banner de versão declara a defasagem; um 404 de DOMÍNIO ("Etapa não
 * encontrada") e qualquer outra falha → erro no bloco. Nunca "sem dados".
 */
export function estadoDoBlocoDaJornada(q: { isLoading: boolean; error: unknown; data: JornadaDoLyrio | undefined }): EstadoDoBloco {
  if (q.error) {
    const e = q.error as { status?: number; message?: string } | null;
    const lido = { status: e?.status ?? 0, mensagem: e?.message ?? "" };
    if (lido.status === 404 && ehApiAtras(lido)) return { tipo: "oculto" };
    return { tipo: "erro", mensagem: lido.mensagem || "Erro desconhecido" };
  }
  if (q.isLoading || !q.data) return { tipo: "carregando" };
  return { tipo: "pronto", dados: q.data };
}

/** `retry` do hook: um 404 não vira outra coisa entre tentativas (padrão de `use-perpetual-sales-data`). */
export function tentarDeNovoAJornada(falhas: number, erro: unknown): boolean {
  if ((erro as { status?: number } | null)?.status === 404) return false;
  return falhas < 2;
}

/** AC1: taxa contra Novos; denominador 0 = `null` ("—"). */
export function taxaDaJornada(parte: number, novos: number): number | null {
  return novos > 0 ? parte / novos : null;
}

export function formatarTaxa(t: number | null): string {
  if (t === null) return "—";
  return `${(t * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * AC4 — o que a tabela declara, numa linha acima dela: (a) desde quando há
 * evento de assinatura (a jornada de uma janela que começa antes é
 * incompleta); (b) os últimos 7 dias sempre baixos em "Pagou" (o teste dura 7
 * dias); (c) campanha individual não é identificável hoje. A referência interna
 * da (c) — item 3.1 das decisões de 23/09 — não aparece na tela (PO-05).
 */
export function declaracoesDaJornada(j: Pick<JornadaDoLyrio, "assinaturaDesde" | "desde" | "atributosDesde">): string[] {
  const a = j.assinaturaDesde
    ? `Eventos de assinatura só existem desde ${dataBr(j.assinaturaDesde)}${j.desde < j.assinaturaDesde ? " — esta janela começa antes disso, então a jornada está incompleta" : " — janela que começa antes disso mostra a jornada incompleta"}.`
    : "Ainda não há eventos de assinatura nesta etapa — a jornada vai só até o paywall.";
  return [
    a,
    "Os últimos 7 dias sempre aparecem baixos em “Pagou”: o teste grátis dura 7 dias.",
    // Story 42.12 (AC4): a (c) passa a valer só para o Google — a Meta é identificável desde a data do dado.
    j.atributosDesde
      ? `A campanha da Meta é identificada desde ${dataBr(j.atributosDesde)}; a do Google ainda não — o app manda só o canal.`
      : "Campanha individual ainda não é identificável — aguarda correção de configuração no app.",
  ];
}

/** Story 42.12 (D7) — "impossível; se acontecer, sinalize". `null` sem conflito (ou com a API anterior). */
export function avisoDeConflitoDaJornada(j: Pick<JornadaDoLyrio, "conflito">): string | null {
  const n = j.conflito?.novos ?? 0;
  if (n <= 0) return null;
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? "usuário tem" : "usuários têm"} campanha da Meta e do Google ao mesmo tempo — possível falha na integração. ${n === 1 ? "Aparece" : "Aparecem"} na linha “Meta e Google (conflito)”.`;
}
