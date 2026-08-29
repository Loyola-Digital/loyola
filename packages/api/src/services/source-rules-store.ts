/**
 * As regras de origem do projeto, para quem lê aplicações.
 *
 * ## O problema que este arquivo resolve
 *
 * As regras nasceram dentro da tela que as cria, e ficaram só lá. Classificar
 * uma origem na aba Origem não mudava nada na tabela de aplicações, nem no BI,
 * nem na captação — o trabalho de classificar não chegava a lugar nenhum.
 *
 * Aqui elas viram um serviço que **qualquer** leitura consulta. É por isso que o
 * escopo é o projeto e não a etapa: a mesma linha da mesma planilha é lida pela
 * captação, pela venda e pelo BI, e as três precisam dizer a mesma coisa sobre
 * ela.
 *
 * ## O cache
 *
 * Regra muda uma vez por mês; aplicação é lida várias vezes por minuto. Sessenta
 * segundos é curto o bastante para a classificação aparecer "na hora" para quem
 * acabou de criar a regra, e longo o bastante para não consultar o banco a cada
 * linha de planilha.
 */

import { asc, eq } from "drizzle-orm";
import { projectSourceRules } from "../db/schema.js";
import { origemPorRegra, type LinhaDeAplicacao, type RegraDeOrigem } from "./source-rules.js";

export const VALIDADE_DO_CACHE_MS = 60_000;

/** A coluna que carrega a origem nas planilhas de aplicação. */
export const CAMPO_DA_ORIGEM = "utm_source";

interface Entrada {
  em: number;
  regras: RegraDeOrigem[];
}

const cache = new Map<string, Entrada>();

/** Esquece o que está guardado. Chamado quando uma regra é criada ou apagada. */
export function invalidarRegras(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}

type Db = {
  select: (f: unknown) => {
    from: (t: unknown) => {
      where: (c: unknown) => { orderBy: (...o: unknown[]) => Promise<RegraDeOrigem[]> };
    };
  };
};

/** As regras ativas do projeto, na ordem em que devem ser testadas. */
export async function regrasDoProjeto(db: Db, projectId: string): Promise<RegraDeOrigem[]> {
  const guardado = cache.get(projectId);
  if (guardado && Date.now() - guardado.em < VALIDADE_DO_CACHE_MS) return guardado.regras;

  const regras = (await db
    .select({
      id: projectSourceRules.id,
      campo: projectSourceRules.campo,
      operador: projectSourceRules.operador,
      valor: projectSourceRules.valor,
      origem: projectSourceRules.origem,
      ordem: projectSourceRules.ordem,
      ativa: projectSourceRules.ativa,
    })
    .from(projectSourceRules)
    .where(eq(projectSourceRules.projectId, projectId))
    .orderBy(asc(projectSourceRules.ordem), asc(projectSourceRules.createdAt))) as RegraDeOrigem[];

  cache.set(projectId, { em: Date.now(), regras });
  return regras;
}

/**
 * A origem de uma linha, já com as regras aplicadas.
 *
 * O que a planilha diz **vence** a regra: a regra existe para preencher o que
 * está vazio ou para classificar o que não se classifica, nunca para reescrever
 * um dado que veio da fonte.
 */
export function origemDaLinha(
  linha: LinhaDeAplicacao,
  regras: RegraDeOrigem[],
  campoDaOrigem = CAMPO_DA_ORIGEM,
): string {
  const daPlanilha = (linha[campoDaOrigem] ?? "").trim();
  if (daPlanilha) return daPlanilha;
  return origemPorRegra(regras, linha)?.origem ?? "";
}
