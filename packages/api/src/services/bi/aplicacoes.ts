/**
 * A entidade `aplicacoes` — a única que não mora no banco.
 *
 * As respostas de formulário são lidas **ao vivo** da planilha, aba por aba, por
 * funil. Isso muda três coisas em relação às outras entidades:
 *
 * 1. **Filtro e agregação acontecem em memória**, não em SQL.
 * 2. **O limite é menor**: o custo aqui é chamada de rede ao Google, não
 *    varredura de índice.
 * 3. **Há cache curto**: um dashboard com três widgets de aplicações leria as
 *    mesmas abas três vezes por atualização, e a leitura é a parte cara.
 *
 * As colunas da planilha não têm nome fixo — cada funil monta o formulário do
 * seu jeito. Por isso data e origem saem de heurística sobre os cabeçalhos, com
 * o resultado sempre explicável: quando não dá para achar a data, a consulta
 * recusa dizendo isso, em vez de devolver zero aplicações.
 */

import { eq } from "drizzle-orm";
import { funnels, projects } from "../../db/schema.js";
import { carregarLinhasBrutas } from "../application-sheets.js";
import { origemDaLinha, regrasDoProjeto } from "../source-rules-store.js";
import type { RegraDeOrigem } from "../source-rules.js";
import { ErroDeQuery, type QuerySpec } from "./query.js";

/** Teto de linhas da entidade de planilha — menor que o do banco, de propósito. */
export const TETO_DE_APLICACOES = 2_000;

/** Quanto tempo a leitura das abas vale. Curto: o dado é ao vivo. */
export const VALIDADE_DO_CACHE_MS = 60_000;

export interface AplicacaoNormalizada {
  /** Data ISO (`YYYY-MM-DD`) da resposta. */
  date: string;
  /** Origem já classificada — o mesmo vocabulário do resto do app. */
  origem: string;
  /** Nome do projeto de onde a planilha veio, para o escopo consolidado. */
  projeto: string;
}

interface Entrada {
  em: number;
  linhas: AplicacaoNormalizada[];
  avisos: string[];
}

const cache = new Map<string, Entrada>();

/** Zera o cache. Existe para o teste não depender de relógio. */
export function limparCacheDeAplicacoes(): void {
  cache.clear();
}

// ============================================================
// Normalização
// ============================================================

const CABECALHOS_DE_DATA = [
  "carimbo de data/hora",
  "carimbo",
  "timestamp",
  "data",
  "data de envio",
  "created_at",
  "submitted at",
];

const CABECALHOS_DE_ORIGEM = ["utm_source", "origem", "source", "canal", "utm source"];

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** O cabeçalho que melhor corresponde a uma das opções, ou `null`. */
export function acharCabecalho(colunas: string[], opcoes: string[]): string | null {
  const normalizadas = colunas.map((c) => [c, semAcento(c)] as const);
  for (const opcao of opcoes) {
    const alvo = semAcento(opcao);
    const exata = normalizadas.find(([, n]) => n === alvo);
    if (exata) return exata[0];
  }
  // Só depois de esgotar as correspondências exatas: "data de nascimento" não
  // pode vencer "data" por acaso de ordem.
  for (const opcao of opcoes) {
    const alvo = semAcento(opcao);
    const parcial = normalizadas.find(([, n]) => n.includes(alvo));
    if (parcial) return parcial[0];
  }
  return null;
}

/**
 * Converte o que a planilha escreveu como data para ISO.
 *
 * Aceita `DD/MM/AAAA` (o formato do Google Forms em pt-BR) e ISO. Não passa por
 * `new Date(texto)`: o parser do navegador lê `01/02/2026` como janeiro nos
 * Estados Unidos e como fevereiro aqui — e o erro só aparece em relatório de
 * fim de mês.
 */
export function dataParaIso(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (br) {
    const dia = br[1]!.padStart(2, "0");
    const mes = br[2]!.padStart(2, "0");
    if (Number(mes) > 12 || Number(dia) > 31) return null;
    return `${br[3]}-${mes}-${dia}`;
  }
  return null;
}

/**
 * Normaliza as linhas de uma planilha em `{date, origem, projeto}`.
 *
 * As regras de origem do projeto entram AQUI, e não numa tela: é o que faz a
 * classificação feita uma vez valer no BI, na tabela de aplicações e na
 * captação — em vez de ficar presa onde foi criada.
 */
export function normalizar(
  linhas: Record<string, string>[],
  colunas: string[],
  projeto = "",
  regras: RegraDeOrigem[] = [],
): { linhas: AplicacaoNormalizada[]; avisos: string[] } {
  const avisos: string[] = [];
  const colunaData = acharCabecalho(colunas, CABECALHOS_DE_DATA);
  const colunaOrigem = acharCabecalho(colunas, CABECALHOS_DE_ORIGEM);

  if (!colunaData) {
    // Sem data não há como aplicar o período — e o período é obrigatório.
    return {
      linhas: [],
      avisos: [
        "Não achei uma coluna de data nesta planilha de aplicações (procurei por carimbo, data, timestamp).",
      ],
    };
  }
  if (!colunaOrigem) {
    avisos.push("Sem coluna de origem na planilha — as aplicações ficam agrupadas como 'sem origem'.");
  }

  const saida: AplicacaoNormalizada[] = [];
  let semData = 0;
  for (const linha of linhas) {
    const date = dataParaIso(linha[colunaData] ?? "");
    if (!date) {
      semData += 1;
      continue;
    }
    // A planilha primeiro; a regra só preenche o que ela deixou vazio.
    const bruta = colunaOrigem
      ? origemDaLinha(linha, regras, colunaOrigem)
      : origemDaLinha(linha, regras);
    // "sem origem" e não string vazia: o grupo precisa de nome para aparecer na
    // legenda do gráfico em vez de virar uma fatia anônima.
    saida.push({ date, origem: bruta || "sem origem", projeto });
  }

  if (semData > 0) {
    // Linha descartada precisa aparecer: um total menor sem explicação parece
    // queda de captação.
    avisos.push(`${semData} resposta(s) sem data legível ficaram de fora.`);
  }

  return { linhas: saida, avisos };
}

// ============================================================
// Carregamento
// ============================================================

type Fastify = {
  db: unknown;
  log: { warn: (o: unknown, m: string) => void };
};

/**
 * Carrega e normaliza as aplicações de todos os funis dos projetos pedidos.
 *
 * O cache é por PROJETO, não pela lista: no escopo consolidado a lista muda
 * conforme quem olha, e uma chave composta faria cada pessoa reler as mesmas
 * abas do zero.
 */
export async function carregarAplicacoes(
  fastify: Fastify,
  projectIds: string[],
): Promise<{ linhas: AplicacaoNormalizada[]; avisos: string[] }> {
  const linhas: AplicacaoNormalizada[] = [];
  const avisos = new Set<string>();

  for (const projectId of projectIds) {
    const guardado = cache.get(projectId);
    if (guardado && Date.now() - guardado.em < VALIDADE_DO_CACHE_MS) {
      linhas.push(...guardado.linhas);
      guardado.avisos.forEach((a) => avisos.add(a));
      continue;
    }

    const doProjeto = await funisComNome(fastify, projectId);
    const regras = await regrasDoProjeto(fastify.db as never, projectId);
    const doCache: AplicacaoNormalizada[] = [];
    const avisosDoProjeto = new Set<string>();

    for (const funil of doProjeto) {
      const bruto = await carregarLinhasBrutas(fastify as never, funil.id);
      if (bruto.semPlanilha) continue;
      const r = normalizar(bruto.linhas, bruto.colunas, funil.projeto, regras);
      doCache.push(...r.linhas);
      r.avisos.forEach((a) => avisosDoProjeto.add(a));
    }

    cache.set(projectId, { em: Date.now(), linhas: doCache, avisos: [...avisosDoProjeto] });
    linhas.push(...doCache);
    avisosDoProjeto.forEach((a) => avisos.add(a));
  }

  return { linhas, avisos: [...avisos] };
}

/** Os funis do projeto, já com o nome do projeto para a dimensão consolidada. */
async function funisComNome(
  fastify: Fastify,
  projectId: string,
): Promise<{ id: string; projeto: string }[]> {
  const db = fastify.db as {
    select: (f: unknown) => {
      from: (t: unknown) => {
        innerJoin: (t: unknown, c: unknown) => {
          where: (c: unknown) => Promise<{ id: string; projeto: string }[]>;
        };
      };
    };
  };
  return db
    .select({ id: funnels.id, projeto: projects.name })
    .from(funnels)
    .innerJoin(projects, eq(projects.id, funnels.projectId))
    .where(eq(funnels.projectId, projectId));
}

// ============================================================
// Execução
// ============================================================

const CAMPO = {
  "aplicacoes.date": "date",
  "aplicacoes.origem": "origem",
  "aplicacoes.projeto": "projeto",
} as const;

/** Aplica um filtro do spec sobre um valor de texto já normalizado. */
function passa(valor: string, filtro: QuerySpec["filters"][string]): boolean {
  const v = filtro.value;
  const lista = Array.isArray(v) ? v.map(String) : [];
  const escalar = Array.isArray(v) ? "" : String(v ?? "");

  switch (filtro.operator) {
    case "$eq":
      return valor === escalar;
    case "$neq":
      return valor !== escalar;
    case "$gt":
      return valor > escalar;
    case "$gte":
      return valor >= escalar;
    case "$lt":
      return valor < escalar;
    case "$lte":
      return valor <= escalar;
    case "$in":
      return lista.includes(valor);
    case "$nin":
      return !lista.includes(valor);
    case "$like":
      return valor.toLowerCase().includes(escalar.replace(/%/g, "").toLowerCase());
    case "$ncontains":
      return !valor.toLowerCase().includes(escalar.toLowerCase());
    case "$between":
      return lista.length === 2 && valor >= lista[0]! && valor <= lista[1]!;
    case "$isnull":
      return valor === "";
    case "$isnotnull":
      return valor !== "";
    default:
      return true;
  }
}


/** Trunca a data para a granularidade pedida, em texto ISO. */
function truncar(iso: string, granularidade: QuerySpec["date_granularity"]): string {
  if (granularidade === "day") return iso;
  if (granularidade === "month") return `${iso.slice(0, 7)}-01`;
  // Semana começando na segunda, como o `date_trunc('week')` do Postgres — as
  // duas entidades precisam concordar sobre o que é "a semana de 3 de agosto".
  const [a, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(a!, m! - 1, d!);
  const diaDaSemana = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - diaDaSemana * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Confere que o spec só pede o que a planilha sabe entregar.
 *
 * Separada da execução para poder rodar sem dados — é ela que o teste dos
 * presets usa para provar que um preset de aplicações realmente funciona.
 */
export function validarSpecDeAplicacoes(spec: QuerySpec): void {
  for (const key of spec.metrics) {
    if (key !== "aplicacoes.count") {
      throw new ErroDeQuery(`Ainda não sei calcular "${key}" a partir da planilha.`, key);
    }
  }
  for (const key of [...spec.dimensions, ...Object.keys(spec.filters)]) {
    if (!(key in CAMPO)) {
      throw new ErroDeQuery(`A planilha de aplicações não tem "${key}".`, key);
    }
  }
}

/**
 * Executa um spec de `aplicacoes` sobre as linhas já carregadas.
 *
 * Separado do carregamento porque é função pura: dá para testar o recorte e a
 * agregação sem tocar em Google Sheets nenhum.
 */
export function executarSobreLinhas(
  spec: QuerySpec,
  linhas: AplicacaoNormalizada[],
): { columns: { key: string; label: string; semanticType: string }[]; rows: Record<string, string | number | null>[]; avisos: string[] } {
  const avisos: string[] = [];
  validarSpecDeAplicacoes(spec);

  const filtradas = linhas.filter((l) =>
    Object.entries(spec.filters).every(([chave, filtro]) => {
      const campo = CAMPO[chave as keyof typeof CAMPO];
      if (!campo) {
        // Filtro sobre campo que a planilha não tem: erro, nunca ignorado — um
        // recorte que não acontece devolve mais linhas do que se pediu.
        throw new ErroDeQuery(`Ainda não sei filtrar aplicações por "${chave}".`, chave);
      }
      return passa(l[campo], filtro);
    }),
  );

  if (spec.dimensions.length === 0) {
    return {
      columns: [{ key: "aplicacoes.count", label: "Aplicações", semanticType: "number" }],
      rows: [{ "aplicacoes.count": filtradas.length }],
      avisos,
    };
  }

  const grupos = new Map<string, { chaves: string[]; n: number }>();
  for (const l of filtradas) {
    const chaves = spec.dimensions.map((d) => {
      const campo = CAMPO[d as keyof typeof CAMPO];
      if (!campo) throw new ErroDeQuery(`Ainda não sei agrupar aplicações por "${d}".`, d);
      return campo === "date" ? truncar(l.date, spec.date_granularity) : l[campo];
    });
    const chave = chaves.join(" ");
    const atual = grupos.get(chave);
    if (atual) atual.n += 1;
    else grupos.set(chave, { chaves, n: 1 });
  }

  let rows = [...grupos.values()].map((g) => {
    const linha: Record<string, string | number | null> = {};
    spec.dimensions.forEach((d, i) => (linha[d] = g.chaves[i] ?? null));
    linha["aplicacoes.count"] = g.n;
    return linha;
  });

  const ordem = spec.order_by[0] ?? { field: "aplicacoes.count", direction: "desc" as const };
  rows.sort((a, b) => {
    const x = a[ordem.field];
    const y = b[ordem.field];
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return ordem.direction === "asc" ? cmp : -cmp;
  });

  const limite = Math.min(spec.limit, TETO_DE_APLICACOES);
  if (rows.length > limite) {
    avisos.push(`Resultado cortado em ${limite} linhas.`);
    rows = rows.slice(0, limite);
  }

  const ROTULO: Record<string, string> = {
    "aplicacoes.date": "Data da aplicação",
    "aplicacoes.origem": "Origem",
    "aplicacoes.projeto": "Projeto",
  };
  const columns = [
    ...spec.dimensions.map((d) => ({
      key: d,
      label: ROTULO[d] ?? d,
      semanticType: d === "aplicacoes.date" ? "date" : "text",
    })),
    { key: "aplicacoes.count", label: "Aplicações", semanticType: "number" },
  ];

  return { columns, rows, avisos };
}
