/**
 * Meses para escolher no dashboard do Instagram.
 *
 * O período do dashboard é um par de timestamps; o mês é só um jeito de
 * escolher esse par sem abrir calendário. Fica aqui, sem React, porque é onde
 * mora o erro fácil: mês que termina no futuro, fuso que empurra o dia 1 para
 * o dia 31 do mês anterior.
 */

const NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface MesEscolhivel {
  /** `YYYY-MM`. */
  mes: string;
  rotulo: string;
  since: number;
  until: number;
  /** O mês em curso ainda não fechou — a tela avisa. */
  parcial: boolean;
}

export function rotuloDoMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${NOMES[Number(m) - 1] ?? mes}/${String(ano).slice(2)}`;
}

/**
 * Início e fim do mês, em segundos.
 *
 * O fim nunca passa de agora: pedir insights de dia que ainda não aconteceu
 * faz a Meta responder erro, e o mês em curso ficaria sem dado nenhum.
 */
export function limitesDoMes(mes: string, agora = new Date()): { since: number; until: number } {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = new Date(ano!, m! - 1, 1, 0, 0, 0, 0);
  const fim = new Date(ano!, m!, 0, 23, 59, 59, 0);
  return {
    since: Math.floor(inicio.getTime() / 1000),
    until: Math.floor(Math.min(fim.getTime(), agora.getTime()) / 1000),
  };
}

/** Os últimos `quantos` meses, do mais recente para o mais antigo. */
export function mesesRecentes(quantos = 12, agora = new Date()): MesEscolhivel[] {
  const out: MesEscolhivel[] = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ mes, rotulo: rotuloDoMes(mes), ...limitesDoMes(mes, agora), parcial: i === 0 });
  }
  return out;
}

// ---- Comparar um mês com outro -----------------------------------------

/** O que a tabela mensal devolve por mês (só o que o comparativo usa). */
export interface LinhaDoMes {
  mes: string;
  posts: number;
  alcance: number;
  views: number;
  interacoes: number;
  engajamento: number | null;
  novosSeguidores: number;
  unfollows: number;
  crescimento: number;
  seguidoresNoFim: number | null;
}

export type TipoDaLinha = "contagem" | "taxa" | "saldo";

export interface LinhaComparavel {
  chave: keyof LinhaDoMes;
  rotulo: string;
  dica: string;
  tipo: TipoDaLinha;
}

export const LINHAS_DO_COMPARATIVO: LinhaComparavel[] = [
  { chave: "posts", rotulo: "Publicações", dica: "Quantos posts saíram no mês.", tipo: "contagem" },
  { chave: "alcance", rotulo: "Alcance", dica: "Contas únicas alcançadas no mês (soma dos dias).", tipo: "contagem" },
  { chave: "views", rotulo: "Views", dica: "Visualizações de todo o conteúdo no mês, contando repetições.", tipo: "contagem" },
  { chave: "interacoes", rotulo: "Interações", dica: "Curtidas, comentários, salvamentos e compartilhamentos somados.", tipo: "contagem" },
  { chave: "engajamento", rotulo: "Engajamento", dica: "Interações ÷ alcance do mês. A diferença vai em pontos percentuais (pp).", tipo: "taxa" },
  { chave: "novosSeguidores", rotulo: "Novos seguidores", dica: "Contas que começaram a seguir no mês.", tipo: "contagem" },
  { chave: "unfollows", rotulo: "Unfollows", dica: "Contas que deixaram de seguir no mês.", tipo: "contagem" },
  { chave: "crescimento", rotulo: "Saldo", dica: "Novos seguidores menos unfollows. A diferença vai em pessoas, não em %: saldo negativo faria a porcentagem mentir.", tipo: "saldo" },
  { chave: "seguidoresNoFim", rotulo: "Seguidores no fim", dica: "Total de seguidores no último dia do mês.", tipo: "contagem" },
];

export interface Diferenca {
  valor: number | null;
  /** `pp` = pontos percentuais, `pessoas` = diferença absoluta, `pct` = %. */
  unidade: "pct" | "pp" | "pessoas";
}

/**
 * A diferença entre os dois meses.
 *
 * Taxa compara em PONTOS (4,2% → 5,1% é +0,9 pp, não +21%); saldo compara em
 * PESSOAS (de −932 para +7.040 não tem porcentagem que signifique algo); o
 * resto em %. Base zero devolve null — "+100%" saindo do zero engana mais que
 * o traço.
 */
export function diferencaEntreMeses(
  a: number | null | undefined,
  b: number | null | undefined,
  tipo: TipoDaLinha,
): Diferenca {
  if (a == null || b == null) return { valor: null, unidade: tipo === "taxa" ? "pp" : "pct" };
  if (tipo === "taxa") return { valor: Math.round((a - b) * 10) / 10, unidade: "pp" };
  if (tipo === "saldo") return { valor: a - b, unidade: "pessoas" };
  if (b === 0) return { valor: null, unidade: "pct" };
  return { valor: Math.round(((a - b) / b) * 100), unidade: "pct" };
}
