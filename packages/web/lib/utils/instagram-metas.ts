/**
 * Meta contra resultado — o que transforma a tela de relatório em tela de
 * decisão.
 *
 * "683 mil de alcance" não é bom nem ruim até alguém dizer o que se esperava.
 * Com a meta ao lado, o número vira pergunta respondível, e a cor diz onde
 * olhar primeiro.
 *
 * ## Mês em curso compara contra o ritmo, não contra a meta inteira
 *
 * No dia 4, ter 13% da meta do mês não é "precisa melhorar": é exatamente o
 * ritmo. Comparar o parcial com o total pinta todo começo de mês de vermelho e
 * ensina o time a ignorar a cor.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { formatoDoPost, interacoesDoPost, interessePorMil, type Formato } from "./instagram-posts";
import { mediana } from "./instagram-sinal";

export type Nivel = "bom" | "atencao" | "ruim";

export const ROTULO_DO_NIVEL: Record<Nivel, string> = {
  bom: "No caminho",
  atencao: "Atenção",
  ruim: "Precisa melhorar",
};

/** Bateu a meta, chegou perto (70%) ou ficou longe. */
export function nivelPor(porcentagem: number): Nivel {
  if (porcentagem >= 100) return "bom";
  if (porcentagem >= 70) return "atencao";
  return "ruim";
}

/** O pior de todos — um formato não está bem se uma das três metas falhou. */
export function piorNivel(niveis: readonly Nivel[]): Nivel {
  if (niveis.includes("ruim")) return "ruim";
  if (niveis.includes("atencao")) return "atencao";
  return "bom";
}

export interface LinhaDeMeta {
  nome: string;
  resultado: number;
  meta: number;
  /** Onde a meta deveria estar hoje, se o mês ainda está em curso. */
  esperadoAteHoje: number | null;
  /** % da meta do mês inteiro — é o número que a tela escreve. */
  pctDaMeta: number;
  nivel: Nivel;
}

/**
 * Quanto do mês já passou, de 0 a 1. `null` para mês fechado.
 *
 * O dia de hoje conta inteiro: às 9h do dia 4, o que existe de resultado é de
 * três dias e um pedaço, e exigir a meta de 4 dias puniria o mês por ele ainda
 * estar acontecendo.
 */
export function progressoDoMes(mes: string, hoje = new Date()): number | null {
  const [ano, m] = mes.split("-").map(Number);
  if (!ano || !m) return null;
  const diasNoMes = new Date(ano, m, 0).getDate();
  const ehOMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === m;
  if (!ehOMesCorrente) return null;
  return Math.min(1, Math.max(0, (hoje.getDate() - 1) / diasNoMes));
}

export function linhaDeMeta(
  nome: string,
  resultado: number,
  meta: number,
  progresso: number | null,
): LinhaDeMeta {
  const esperado = progresso != null && progresso > 0 ? meta * progresso : null;
  const referencia = esperado ?? meta;
  return {
    nome,
    resultado,
    meta,
    esperadoAteHoje: esperado,
    pctDaMeta: meta > 0 ? (resultado / meta) * 100 : 0,
    nivel: nivelPor(referencia > 0 ? (resultado / referencia) * 100 : 0),
  };
}

// ---- Semáforo por formato -------------------------------------------------

export interface MetasDoFormato {
  /** Posts por semana. */
  freq?: number | null;
  /** Alcance mediano por post. */
  alcance?: number | null;
  /** Interesse por mil. */
  interesse?: number | null;
}

export type MetasPorFormato = Partial<Record<Formato, MetasDoFormato>>;

export interface LinhaDoFormatoComMeta {
  formato: Formato;
  posts: number;
  nivel: Nivel;
  medidas: {
    chave: "freq" | "alcance" | "interesse";
    rotulo: string;
    resultado: number | null;
    meta: number | null;
    pct: number | null;
    nivel: Nivel | null;
  }[];
}

const ROTULOS = {
  freq: "Posts por semana",
  alcance: "Alcance mediano por post",
  interesse: "Interesse por mil",
} as const;

/**
 * Como cada formato se sai contra a sua própria meta.
 *
 * Três medidas porque três coisas podem estar erradas e a ação de cada uma é
 * diferente: publicar pouco, publicar e não alcançar, alcançar e não
 * interessar. A cor do formato é a pior das três — não adianta o alcance estar
 * ótimo se ninguém compartilha.
 */
export function semaforoPorFormato(
  posts: readonly InstagramMedia[],
  metas: MetasPorFormato,
  diasDoPeriodo: number,
): LinhaDoFormatoComMeta[] {
  const formatos: Formato[] = ["reels", "carrossel", "estatico"];
  const out: LinhaDoFormatoComMeta[] = [];

  for (const formato of formatos) {
    const doFormato = posts.filter((p) => formatoDoPost(p) === formato);
    if (doFormato.length === 0) continue;
    const meta = metas[formato] ?? {};

    const valores = {
      freq: diasDoPeriodo > 0 ? (doFormato.length / diasDoPeriodo) * 7 : null,
      alcance: mediana(doFormato.map((p) => p.reach).filter((v): v is number => v != null && v > 0)),
      interesse: mediana(doFormato.map(interessePorMil).filter((v): v is number => v != null)),
    };

    const medidas = (["freq", "alcance", "interesse"] as const).map((chave) => {
      const resultado = valores[chave];
      const alvo = meta[chave] ?? null;
      const pct = resultado != null && alvo != null && alvo > 0 ? (resultado / alvo) * 100 : null;
      return {
        chave,
        rotulo: ROTULOS[chave],
        resultado,
        meta: alvo,
        pct,
        nivel: pct == null ? null : nivelPor(pct),
      };
    });

    out.push({
      formato,
      posts: doFormato.length,
      nivel: piorNivel(medidas.map((m) => m.nivel).filter((n): n is Nivel => n != null)),
      medidas,
    });
  }
  return out;
}

/**
 * O gancho explica o alcance dos Reels?
 *
 * Compara o alcance mediano dos Reels que seguraram os 3 primeiros segundos
 * com o dos que não seguraram. Quando a diferença é grande, a ação deixa de
 * ser "publicar mais Reels" e passa a ser "testar o começo antes de gravar" —
 * conclusões opostas a partir do mesmo número de alcance.
 */
export function ganchoExplicaOAlcance(
  posts: readonly InstagramMedia[],
  corte = 62,
): { forte: { n: number; alcance: number | null }; fraco: { n: number; alcance: number | null } } | null {
  const reels = posts.filter((p) => formatoDoPost(p) === "reels" && p.skip_rate != null);
  if (reels.length < 6) return null;
  const gancho = (p: InstagramMedia) => 100 - (p.skip_rate ?? 0);
  const alcanceDe = (lista: InstagramMedia[]) =>
    mediana(lista.map((p) => p.reach).filter((v): v is number => v != null && v > 0));

  const forte = reels.filter((p) => gancho(p) >= corte);
  const fraco = reels.filter((p) => gancho(p) < corte);
  if (forte.length < 2 || fraco.length < 2) return null;
  return {
    forte: { n: forte.length, alcance: alcanceDe(forte) },
    fraco: { n: fraco.length, alcance: alcanceDe(fraco) },
  };
}

// ---- Simulador ------------------------------------------------------------

export interface Simulacao {
  /** Saldo de seguidores projetado. */
  saldo: number;
  pctDaMeta: number;
  nivel: Nivel;
  /** Posts que seriam necessários mantendo as saídas de hoje. `null` se nem assim. */
  postsNecessarios: number | null;
  /** Saídas que seriam necessárias mantendo os posts de hoje. `null` se nem com zero. */
  saidasNecessariasPct: number | null;
}

/**
 * E se publicássemos mais? E se menos gente fosse embora?
 *
 * A conta é deliberadamente simples — cada post traz os mesmos seguidores que
 * trouxe na média do mês, e a saída é uma porcentagem fixa. Serve para mostrar
 * a ordem de grandeza da resposta: quase sempre ela revela que "publicar mais"
 * sozinho pediria um número absurdo de posts, e que o aperto está na saída.
 */
export function simularSaldo(entrada: {
  novosPorPost: number;
  posts: number;
  saidasPct: number;
  meta: number;
}): Simulacao {
  const { novosPorPost, posts, saidasPct, meta } = entrada;
  const retencao = 1 - saidasPct / 100;
  const saldo = Math.round(novosPorPost * posts * retencao);
  const pctDaMeta = meta > 0 ? (saldo / meta) * 100 : 0;

  const porPostLiquido = novosPorPost * retencao;
  const postsNecessarios =
    porPostLiquido > 0 ? Math.ceil(meta / porPostLiquido) : null;

  // Mesmo sem nenhuma saída, este número de posts dá para a meta?
  const tetoSemSaidas = novosPorPost * posts;
  const saidasNecessariasPct =
    tetoSemSaidas >= meta && tetoSemSaidas > 0 ? (1 - meta / tetoSemSaidas) * 100 : null;

  return { saldo, pctDaMeta, nivel: nivelPor(pctDaMeta), postsNecessarios, saidasNecessariasPct };
}

/** Quantos seguidores, em média, cada post trouxe no mês. */
export function novosPorPost(novosSeguidores: number, posts: number): number {
  return posts > 0 ? novosSeguidores / posts : 0;
}

/** Engajamento mediano dos posts — usado nos cartões por formato. */
export function engajamentoMediano(posts: readonly InstagramMedia[]): number | null {
  return mediana(
    posts
      .map((p) => (p.reach && p.reach > 0 ? (interacoesDoPost(p) / p.reach) * 100 : null))
      .filter((v): v is number => v != null),
  );
}
