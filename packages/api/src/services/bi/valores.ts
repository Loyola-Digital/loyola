/**
 * Os valores que cada dimensão realmente tem — para o agente escolher, não inventar.
 *
 * ## Por que existe
 *
 * O agente nunca viu os valores do banco. Ele recebia as CHAVES do catálogo e
 * escrevia o lado direito do filtro de cabeça: "workshops do netão" virou
 * `faturamento.funil $like "netão"`, e nenhum funil do BBE se chama assim. O
 * widget nasceu zerado, a IA respondeu que tinha montado, e a tela não tinha
 * como explicar o zero.
 *
 * Isto carrega, por escopo, os valores distintos de cada dimensão enumerável.
 * Dimensão com valores demais (campanha, criativo) fica de fora: não cabe no
 * prompt e não ajuda. Ficar de fora significa "não dá para conferir", nunca
 * "não existe" — quem valida precisa tratar os dois casos como coisas
 * diferentes, senão o remédio vira o mesmo veneno.
 */

import { CAMPOS } from "./catalogo.js";
import { valoresDaDimensao, type ContextoDaQuery } from "./query.js";

/** Chave da dimensão → valores existentes. A chave ausente = não enumerável. */
export type ValoresConhecidos = Record<string, string[]>;

const VALIDADE_MS = 5 * 60_000;
const cache = new Map<string, { em: number; p: Promise<ValoresConhecidos> }>();

/**
 * Os valores das dimensões enumeráveis do escopo, com cache de 5 minutos.
 *
 * São ~12 consultas `DISTINCT … LIMIT 61`, baratas mas não de graça, e o
 * conjunto não muda entre duas perguntas seguidas. O cache guarda a PROMISE:
 * duas pessoas perguntando junto disparam uma carga só.
 *
 * ponytail: cache em memória do processo; some no deploy e não é dividido entre
 * réplicas. Basta enquanto a API roda numa instância só.
 */
export function valoresConhecidos(ctx: ContextoDaQuery): Promise<ValoresConhecidos> {
  const chave = [...ctx.projectIds].sort().join(",");
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.p;

  const p = (async () => {
    const dimensoes = CAMPOS.filter((c) => c.role === "dimension" && c.semanticType !== "date");
    const saida: ValoresConhecidos = {};
    await Promise.all(
      dimensoes.map(async (d) => {
        try {
          const valores = await valoresDaDimensao(d.key, ctx);
          // Lista vazia também fica de fora: dizer ao modelo "este campo não
          // tem valor nenhum" só o faria recusar a pergunta inteira, quando o
          // certo é montar o widget e ele voltar vazio com o aviso de sempre.
          if (valores && valores.length > 0) saida[d.key] = valores;
        } catch {
          // Uma dimensão que não sabe se enumerar não pode derrubar as outras.
        }
      }),
    );
    return saida;
  })();

  cache.set(chave, { em: Date.now(), p });
  p.catch(() => cache.delete(chave));
  return p;
}

/**
 * O valor do filtro bate com algo que existe?
 *
 * `$like` casa por conteúdo (é o que o SQL vai fazer), o resto por igualdade,
 * ambos sem acento e sem caixa — "Netão" e "netao" são a mesma intenção, e
 * recusar por causa do til seria recusar a resposta certa.
 *
 * Devolve `true` quando a dimensão não é enumerável: aí não há como conferir, e
 * inventar uma recusa seria pior que deixar passar.
 */
export function valorExiste(
  chave: string,
  operador: string,
  valor: string,
  conhecidos: ValoresConhecidos,
): boolean {
  const lista = conhecidos[chave];
  if (!lista) return true;
  const alvo = normalizar(valor);
  if (!alvo) return true;
  if (operador === "$like" || operador === "$nlike") {
    return lista.some((v) => normalizar(v).includes(alvo));
  }
  return lista.some((v) => normalizar(v) === alvo);
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Os valores de uma dimensão, prontos para entrar numa mensagem de erro. */
export function listarParaMensagem(chave: string, conhecidos: ValoresConhecidos): string {
  const lista = conhecidos[chave] ?? [];
  const mostra = lista.slice(0, 20);
  const resto = lista.length - mostra.length;
  return mostra.join(", ") + (resto > 0 ? `, e mais ${resto}` : "");
}
