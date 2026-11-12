/**
 * O relatório do mês em texto — a versão que vai para o WhatsApp.
 *
 * O relatório bonito da tela não cola em lugar nenhum: quem precisa mandar o
 * resultado para o cliente acaba digitando tudo de novo, e o que chega lá é
 * sempre um pouco diferente do que a tela mostra. Este texto é a mesma
 * informação, no formato que sobrevive a um colar.
 *
 * Nada aqui é inventado: o que não tem dado não vira linha.
 *
 * ## Mês em curso não compara
 *
 * O relatório abre no último mês fechado, mas o mês em curso continua
 * escolhível. Quando é ele, toda comparação com o mês anterior sai: onze dias
 * contra trinta rendem "−73% de alcance", que é o tamanho do mês e não o
 * resultado dele. Em vez da variação, o cabeçalho diz em que dia o mês está.
 */

import type { ItemDoPlano, MetaDoMes } from "@/lib/hooks/use-instagram-metas";
import type { MesDoOrganico } from "@/lib/hooks/use-instagram-mensal";
import { rotuloDoMes } from "./meses-do-instagram";

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");
const K = (n: number) =>
  n >= 1_000_000 ? `${umaCasa(n / 1_000_000)} mi` : n >= 10_000 ? `${nf(n / 1_000)} mil` : nf(n);

const PRAZO_STATUS: Record<NonNullable<ItemDoPlano["status"]>, string> = {
  "a-fazer": "a fazer",
  "em-andamento": "em andamento",
  concluido: "concluído",
};

function linhaDoPlano(p: ItemDoPlano): string {
  const partes = [p.responsavel, p.prazo, p.status ? PRAZO_STATUS[p.status] : null].filter(Boolean);
  return `• ${p.oQue}${partes.length ? ` (${partes.join(" · ")})` : ""}`;
}

export interface DadosDoRelatorio {
  perfil: string | null;
  mes: string;
  doMes: MesDoOrganico;
  anterior?: MesDoOrganico | null;
  meta?: MetaDoMes | null;
}

/** "+38%" / "4,2×" / "quase igual" — a comparação com o mês anterior. */
function variacao(atual: number, anterior: number | null | undefined): string {
  if (anterior == null || anterior <= 0) return "";
  const r = atual / anterior;
  if (r >= 2) return ` (${umaCasa(r)}× o mês anterior)`;
  const pct = Math.round((r - 1) * 100);
  if (Math.abs(pct) < 3) return " (quase igual ao mês anterior)";
  return ` (${pct > 0 ? "+" : "−"}${Math.abs(pct)}% sobre o mês anterior)`;
}

export function textoDoRelatorio(d: DadosDoRelatorio): string {
  const { doMes, meta } = d;
  // Mês pela metade não tem base de comparação: sem `anterior`, nenhuma linha
  // ganha variação.
  const anterior = doMes.emCurso ? null : d.anterior;
  const linhas: string[] = [];

  linhas.push(`Instagram — ${rotuloDoMes(d.mes)}${d.perfil ? ` · @${d.perfil}` : ""}`);
  if (doMes.emCurso) {
    linhas.push(
      `Mês em curso: ${doMes.emCurso.dias} de ${doMes.emCurso.de} dias. ` +
        `Sem comparação com o mês anterior, que está fechado.`,
    );
  }

  const resumo = [meta?.resumoOndeEstamos, meta?.resumoAprendizado, meta?.resumoPrioridade].filter(
    (t): t is string => !!t?.trim(),
  );
  if (resumo.length > 0) {
    linhas.push("", "RESUMO");
    for (const r of resumo) linhas.push(r.trim());
  }

  linhas.push("", "RESULTADOS");
  linhas.push(`• Alcance: ${K(doMes.alcance)}${variacao(doMes.alcance, anterior?.alcance)}`);
  if (doMes.views != null) linhas.push(`• Visualizações: ${K(doMes.views)}`);
  linhas.push(
    `• Saldo de seguidores: ${doMes.crescimento >= 0 ? "+" : "−"}${nf(Math.abs(doMes.crescimento))} ` +
      `(${nf(doMes.novosSeguidores)} entraram, ${nf(doMes.unfollows)} saíram)`,
  );
  if (doMes.engajamento != null) linhas.push(`• Engajamento: ${umaCasa(doMes.engajamento)}%`);
  linhas.push(`• Posts publicados: ${doMes.posts}`);

  // A meta só entra quando existe: sem ela, "x% da meta" seria invenção.
  if (meta?.saldoSeguidores != null) {
    const pct = Math.round((doMes.crescimento / meta.saldoSeguidores) * 100);
    linhas.push(`• Meta de saldo: ${nf(meta.saldoSeguidores)} — chegamos a ${pct}%`);
  }
  if (meta?.alcance != null) {
    const pct = Math.round((doMes.alcance / meta.alcance) * 100);
    linhas.push(`• Meta de alcance: ${K(meta.alcance)} — chegamos a ${pct}%`);
  }

  if (doMes.melhorPost) {
    const p = doMes.melhorPost;
    linhas.push(
      "",
      "POST DO MÊS",
      `${p.titulo}${p.formato ? ` (${p.formato})` : ""} — ${nf(p.alcance)} de alcance, ${nf(p.interacoes)} interações`,
    );
    if (p.permalink) linhas.push(p.permalink);
  }

  const plano = (meta?.plano ?? []).filter((p) => p.oQue?.trim());
  if (plano.length > 0) {
    linhas.push("", "PRÓXIMOS PASSOS");
    for (const p of plano) linhas.push(linhaDoPlano(p));
  }

  return linhas.join("\n");
}

export interface CartaoDeResultado {
  rotulo: string;
  valor: string;
  /** A comparação com o mês anterior, já escrita. Vazio quando não há base. */
  variacao: string;
  explicacao: string;
}

/** Os quatro números que o cliente lê primeiro, com a frase que cada um pede. */
export function cartoesDoRelatorio(
  doMes: MesDoOrganico,
  mesAnterior?: MesDoOrganico | null,
): CartaoDeResultado[] {
  // Mês em curso não compara com mês fechado: a variação sai vazia nos quatro.
  const anterior = doMes.emCurso ? null : mesAnterior;
  const saidas =
    doMes.novosSeguidores > 0 ? Math.round((doMes.unfollows / doMes.novosSeguidores) * 100) : null;
  return [
    {
      rotulo: "Alcance",
      valor: K(doMes.alcance),
      variacao: variacao(doMes.alcance, anterior?.alcance).trim(),
      explicacao: "Quantas contas diferentes viram algum conteúdo do perfil no mês.",
    },
    {
      rotulo: "Saldo de seguidores",
      valor: `${doMes.crescimento >= 0 ? "+" : "−"}${nf(Math.abs(doMes.crescimento))}`,
      variacao: anterior ? `era ${anterior.crescimento >= 0 ? "+" : "−"}${nf(Math.abs(anterior.crescimento))}` : "",
      explicacao: `${nf(doMes.novosSeguidores)} entraram e ${nf(doMes.unfollows)} saíram.`,
    },
    {
      rotulo: "Saídas sobre entradas",
      valor: saidas == null ? "—" : `${saidas}%`,
      variacao: "",
      explicacao: "De cada 100 seguidores que entraram, quantos foram embora. Menor é melhor.",
    },
    {
      rotulo: "Engajamento",
      valor: doMes.engajamento == null ? "—" : `${umaCasa(doMes.engajamento)}%`,
      variacao:
        anterior?.engajamento != null && doMes.engajamento != null
          ? `${doMes.engajamento - anterior.engajamento >= 0 ? "+" : "−"}${umaCasa(Math.abs(doMes.engajamento - anterior.engajamento))} pp`
          : "",
      explicacao: "Interações divididas pelo alcance. Cai quando o alcance cresce mais rápido que a reação.",
    },
  ];
}
