/**
 * Story 42.14 (AC2a, AC3) — o vocabulário de janela dos cards da etapa Lyrio,
 * em UM lugar só, para o Resumo mobile e o Overview do RevenueCat.
 *
 * ## O problema
 *
 * Com o filtro de dias em 90, nenhum card dos dois blocos respondia a ele, e só
 * o Overview dizia a janela de cada número (`ROTULO_DA_JANELA`, Story 42.9). O
 * Resumo dizia "últimos 28 dias" no título, o que não valia para MRR, assinaturas
 * e trials (retratos de agora). Duas declarações diferentes para a mesma pergunta
 * — "a que período este número responde?" — divergem na primeira mudança.
 *
 * ## As quatro naturezas de janela
 *
 *   agora  ............ retrato do momento da consulta (MRR, assinaturas, trials, ARR)
 *   filtro ............ segue o seletor de dias (hoje − (N − 1) até hoje, em SP)
 *   fixa .............. janela própria que NÃO segue o seletor: os CACs de 28
 *                       dias fixos (D5/D9) e as métricas que a API só entrega em 28
 *                       dias (overview do RevenueCat)
 *   serie ............. a série inteira (API anterior a esta story — PO-10)
 *
 * Quem não segue o filtro leva destaque âmbar (D3, PO-D2) e a frase "não segue o
 * filtro de N dias" no memorial; quem segue leva "segue o filtro de N dias"
 * (AC1a). A etiqueta NÃO usa o `period` da API v2 (AC3d): sai daqui, testada.
 *
 * ## O que este módulo nunca faz
 *
 * Afirmar datas de uma janela que não foi verificada (AC1c, P8). Os 28 dias do
 * overview do RevenueCat são contados pela API, em UTC, e a documentação não diz
 * se incluem hoje — então a janela `fixa` de origem `revenuecat` sai SEM datas.
 * As datas só aparecem quando a régua é nossa (dias de calendário em SP).
 */

import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import { diaDeNegocio } from "./perpetual-tendencia";

export type JanelaDoCard =
  /** Retrato do momento da consulta. */
  | { tipo: "agora" }
  /** Segue o seletor de dias da etapa. */
  | { tipo: "filtro" }
  /**
   * Janela própria, que não segue o seletor. `origem` diz quem conta os dias:
   * `regua` = nós, em dias de calendário de SP (datas exatas); `revenuecat` = a
   * API do RevenueCat (sem datas: não verificadas, P8).
   */
  | { tipo: "fixa"; dias: number; origem: "regua" | "revenuecat" }
  /** A série inteira — o que a API anterior à 42.14 devolve em `metricas-derivadas`. */
  | { tipo: "serie" };

export interface ContextoDaJanela {
  /** O N do seletor de dias da etapa. */
  diasDoFiltro: number;
  /** Hoje, `AAAA-MM-DD`, no fuso do negócio (`hojeNoNegocio`). */
  hoje: string;
  /** Início da série de assinaturas (`AAAA-MM-DD`), quando conhecido. */
  serieDesde?: string | null;
}

export interface DeclaracaoDaJanela {
  /** O texto curto debaixo do número: `agora`, `28d fixo`, `últimos 90 dias`, `desde 10/08`… */
  etiqueta: string;
  segueOFiltro: boolean;
  /** Fundo âmbar: todo card que NÃO segue o filtro, e só ele (PO-D2). */
  destaque: boolean;
  /** "segue o filtro de N dias" ou "não segue o filtro de N dias" (AC1a). */
  frase: string;
  /** O `period` do memorial: a janela real, com datas quando a régua é nossa, e a frase. */
  periodo: string;
}

/** Hoje no fuso do negócio (`AAAA-MM-DD`), a régua das janelas da etapa. */
export function hojeNoNegocio(agora: Date = new Date()): string {
  return diaDeNegocio(agora);
}

/** `AAAA-MM-DD` → `dd/mm`. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "último dia" para N = 1; "últimos N dias" para o resto. */
export function ultimosNDias(dias: number): string {
  return dias === 1 ? "último dia" : `últimos ${dias.toLocaleString("pt-BR")} dias`;
}

/** O intervalo `dd/mm a dd/mm` de N dias terminando em `hoje`, inclusive. */
export function intervaloDaJanela(dias: number, hoje: string): string {
  return `${diaMes(inicioDaJanela(dias, hoje))} a ${diaMes(hoje)}`;
}

export function fraseDoFiltro(segue: boolean, diasDoFiltro: number): string {
  return `${segue ? "segue" : "não segue"} o filtro de ${diasDoFiltro.toLocaleString("pt-BR")} ${diasDoFiltro === 1 ? "dia" : "dias"}`;
}

/**
 * A declaração completa de um card. Pura: o mesmo par (janela, contexto) dá
 * sempre o mesmo texto — é o que os dois blocos leem.
 */
export function declararJanela(janela: JanelaDoCard, ctx: ContextoDaJanela): DeclaracaoDaJanela {
  const n = ctx.diasDoFiltro;
  const naoSegue = (etiqueta: string, descricao: string): DeclaracaoDaJanela => {
    const frase = fraseDoFiltro(false, n);
    return { etiqueta, segueOFiltro: false, destaque: true, frase, periodo: `${descricao} · ${frase}` };
  };

  switch (janela.tipo) {
    case "agora":
      return naoSegue("agora", "agora — retrato no momento da consulta");
    case "serie": {
      const desde = ctx.serieDesde ? ` (${diaMes(ctx.serieDesde)})` : "";
      return naoSegue("desde o início da série", `desde o início da série${desde} até hoje`);
    }
    case "fixa": {
      // CAC de 28 dias fixos: a régua é nossa, as datas são exatas.
      if (janela.origem === "regua") {
        return naoSegue(
          `${janela.dias}d fixo`,
          `${ultimosNDias(janela.dias)} (${intervaloDaJanela(janela.dias, ctx.hoje)}), janela fixa`,
        );
      }
      // A API conta os dias (UTC, P8): sem datas, porque ninguém verificou quais são.
      return naoSegue(
        ultimosNDias(janela.dias),
        `${ultimosNDias(janela.dias)} contados pelo RevenueCat (em UTC; a API não informa se inclui hoje)`,
      );
    }
    case "filtro": {
      const frase = fraseDoFiltro(true, n);
      const inicio = inicioDaJanela(n, ctx.hoje);
      const intervalo = `${ultimosNDias(n)} (${intervaloDaJanela(n, ctx.hoje)})`;
      // A janela começa antes da série: o período EFETIVO é desde o início dela (AC3c).
      if (ctx.serieDesde && inicio < ctx.serieDesde) {
        return {
          etiqueta: `desde ${diaMes(ctx.serieDesde)}`,
          segueOFiltro: true,
          destaque: false,
          frase,
          periodo: `${intervalo}; a série de assinaturas só existe desde ${diaMes(ctx.serieDesde)}, então o período efetivo é ${diaMes(ctx.serieDesde)} a ${diaMes(ctx.hoje)} · ${frase}`,
        };
      }
      return { etiqueta: ultimosNDias(n), segueOFiltro: true, destaque: false, frase, periodo: `${intervalo} · ${frase}` };
    }
  }
}

/**
 * AC3b — o título do Resumo mobile declara a janela do FILTRO, com N e datas
 * dinâmicos na régua de SP: `Resumo mobile · últimos 90 dias (19/07 a 16/10)`.
 * Os cards que não seguem o filtro levam etiqueta própria, para o título não
 * valer por engano para eles.
 */
export function tituloDoResumo(diasDoFiltro: number, hoje: string): string {
  return `Resumo mobile · ${ultimosNDias(diasDoFiltro)} (${intervaloDaJanela(diasDoFiltro, hoje)})`;
}
