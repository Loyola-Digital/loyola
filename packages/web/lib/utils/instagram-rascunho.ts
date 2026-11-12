/**
 * O rascunho do resumo do mês e as metas sugeridas — tudo dos números.
 *
 * ## Por que existe
 *
 * O relatório abria com "nenhuma frase escrita para este mês" e a aba Decisões
 * abria sem semáforo, porque semáforo sem meta não existe. Os dois pediam que
 * alguém começasse de uma folha em branco, e folha em branco não é preenchida:
 * em produção as três frases, os próximos passos e as metas estão todos
 * vazios desde que a tela existe.
 *
 * Daqui sai o primeiro rascunho. Ele é determinístico, sai dos mesmos números
 * que os cartões e NUNCA é gravado sozinho: aparece marcado como rascunho até
 * alguém editar e salvar. O julgamento continua sendo de gente — o que mudou é
 * que agora há de onde partir.
 *
 * ## Média, não mediana, nas metas
 *
 * O resto da tela usa mediana de propósito, para um post viral não puxar um
 * agrupamento. Aqui são três meses só: a mediana de três é o mês do meio, que
 * joga fora a tendência inteira. Uma meta tem de olhar para onde a conta está
 * indo, e com três pontos a média é quem faz isso.
 */

import type { MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");
const K = (n: number) =>
  n >= 1_000_000 ? `${umaCasa(n / 1_000_000)} mi` : n >= 10_000 ? `${nf(n / 1_000)} mil` : nf(n);

export interface RascunhoDoResumo {
  onde: string;
  aprendizado: string | null;
  prioridade: string | null;
}

/** "+38%", "4,2× o mês anterior", "quase igual" — ou nada, sem base. */
function contra(atual: number, anterior: number | null | undefined): string | null {
  if (anterior == null || anterior <= 0) return null;
  const r = atual / anterior;
  if (r >= 2) return `${umaCasa(r)}× o mês anterior`;
  const pct = Math.round((r - 1) * 100);
  if (Math.abs(pct) < 3) return "quase igual ao mês anterior";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% sobre o mês anterior`;
}

/**
 * As três frases do relatório, montadas dos números do mês.
 *
 * `anterior` só entra quando o mês está FECHADO: comparar um mês pela metade
 * com um mês inteiro produz a queda que não existe, e o rascunho é o texto que
 * o cliente lê.
 */
export function rascunhoDoResumo(
  doMes: MesDoOrganico,
  anterior?: MesDoOrganico | null,
): RascunhoDoResumo {
  const base = doMes.emCurso ? null : anterior;

  const partes: string[] = [`Alcançamos ${K(doMes.alcance)} contas`];
  const vsAlcance = contra(doMes.alcance, base?.alcance);
  if (vsAlcance) partes[0] += ` (${vsAlcance})`;
  partes.push(
    `o saldo de seguidores foi de ${doMes.crescimento >= 0 ? "+" : "−"}${nf(Math.abs(doMes.crescimento))}` +
      ` (${nf(doMes.novosSeguidores)} entraram, ${nf(doMes.unfollows)} saíram)`,
  );
  if (doMes.engajamento != null) {
    partes.push(`e o engajamento ficou em ${umaCasa(doMes.engajamento)}%`);
  }
  const onde = `${partes.join(", ")}, com ${doMes.posts} publicaç${doMes.posts === 1 ? "ão" : "ões"}.`;

  // O aprendizado sai do melhor post, que é o único "o que funcionou" que o
  // número sabe dizer. Sem melhor post, não há o que afirmar.
  const p = doMes.melhorPost;
  const aprendizado = p
    ? `O post que mais reagiu foi "${p.titulo}"${p.formato ? ` (${p.formato.toLowerCase()})` : ""}: ` +
      `${nf(p.alcance)} de alcance e ${nf(p.interacoes)} interações` +
      `${p.engajamento != null ? `, ${umaCasa(p.engajamento)}% de engajamento` : ""}.`
    : null;

  // A prioridade é o aperto do mês, e só sai quando um número aponta um.
  const saidas =
    doMes.novosSeguidores > 0 ? (doMes.unfollows / doMes.novosSeguidores) * 100 : null;
  const quedaDeEngajamento =
    base?.engajamento != null && doMes.engajamento != null
      ? doMes.engajamento - base.engajamento
      : null;

  let prioridade: string | null = null;
  if (saidas != null && saidas >= 70) {
    prioridade =
      `De cada 100 seguidores que entraram, ${Math.round(saidas)} foram embora no mesmo mês — ` +
      `é o aperto do período: o conteúdo que traz não é o que segura.`;
  } else if (quedaDeEngajamento != null && quedaDeEngajamento <= -1) {
    prioridade =
      `O engajamento caiu ${umaCasa(Math.abs(quedaDeEngajamento))} ponto(s) contra o mês anterior ` +
      `enquanto o alcance ${vsAlcance?.startsWith("−") ? "também caiu" : "se manteve ou cresceu"} — ` +
      `a entrega está chegando a quem reage menos.`;
  } else if (base != null && doMes.posts < base.posts) {
    prioridade =
      `Publicamos ${base.posts - doMes.posts} post(s) menos que no mês anterior ` +
      `(${doMes.posts} contra ${base.posts}) — a frequência é a alavanca mais direta do alcance.`;
  }

  return { onde, aprendizado, prioridade };
}

export interface MetasSugeridas {
  saldoSeguidores: number | null;
  alcance: number | null;
  posts: number | null;
  /** Quais meses entraram na conta — a tela diz de onde veio o número. */
  mesesUsados: string[];
}

/** Quantos meses fechados a sugestão de meta olha para trás. */
export const MESES_DA_SUGESTAO = 3;

/**
 * As metas sugeridas: a média dos últimos meses FECHADOS.
 *
 * Mês em curso fica fora — ele está pela metade e puxaria a meta para baixo.
 * Mês sem dado também: a média de um zero falso viraria meta de verdade.
 */
export function metasSugeridas(meses: readonly MesDoOrganico[]): MetasSugeridas {
  const fechados = meses
    .filter((m) => !m.semDados && m.emCurso == null)
    .slice(-MESES_DA_SUGESTAO);
  if (fechados.length === 0) {
    return { saldoSeguidores: null, alcance: null, posts: null, mesesUsados: [] };
  }
  const media = (f: (m: MesDoOrganico) => number) =>
    Math.round(fechados.reduce((s, m) => s + f(m), 0) / fechados.length);

  return {
    saldoSeguidores: media((m) => m.crescimento),
    alcance: media((m) => m.alcance),
    posts: media((m) => m.posts),
    mesesUsados: fechados.map((m) => m.mes),
  };
}
