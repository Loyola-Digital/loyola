/**
 * Story 49.20 — o que a story ACRESCENTA ao documento e ao payload, para as
 * provas de "o resto não mudou" (AC3) das suítes que medem SHA:
 *
 * - HTML: o bloco da recompra por origem (seção 11, parcial e final) e o da
 *   pesquisa por pergunta (Resumo macro, parcial e final; seção 12 só na
 *   parcial). Nada mais muda no HTML (sem CSS novo, sem gráfico em `D`).
 * - Payload: `publico.recompraPorOrigem`, `publico.crossLaunch.compradoresNaBaseAnterior`,
 *   `dinheiroTempo.compradores[].frioAdv` e `resumoMacro.pesquisaPorPergunta`.
 *
 * Arquivo à parte de propósito: a fixture da 49.20 roda no commit-base
 * (`f2cf6f1e`) para medir o SHA de antes, e lá estas marcas não existem.
 */

import { MARCA_DA_PESQUISA_POR_PERGUNTA, MARCA_DA_RECOMPRA_POR_ORIGEM } from "../../services/debriefing-render.js";
import type { DebriefingPayload } from "../../services/debriefing-payload.js";

/** Tira do HTML todo `<div …>` que começa com `abertura`, até o `</div>` que o fecha (contando o aninhamento). */
export function tirarDivs(html: string, abertura: string): { html: string; removidos: number } {
  let out = html;
  let removidos = 0;
  for (;;) {
    const ini = out.indexOf(abertura);
    if (ini < 0) return { html: out, removidos };
    const re = /<div\b|<\/div>/g;
    re.lastIndex = ini;
    let prof = 0;
    let fim = -1;
    for (let m = re.exec(out); m; m = re.exec(out)) {
      prof += m[0] === "</div>" ? -1 : 1;
      if (prof === 0) {
        fim = re.lastIndex;
        break;
      }
    }
    if (fim < 0) throw new Error(`tirarDivs: ${abertura} sem fechamento`);
    out = out.slice(0, ini) + out.slice(fim);
    removidos += 1;
  }
}

/** Os blocos da 49.20 no HTML (quantos de cada). */
export function blocosDa4920(html: string): { recompra: number; pesquisaNoResumo: number; pesquisaNaQualificacao: number } {
  return {
    recompra: tirarDivs(html, `<div ${MARCA_DA_RECOMPRA_POR_ORIGEM}>`).removidos,
    pesquisaNoResumo: tirarDivs(html, `<div ${MARCA_DA_PESQUISA_POR_PERGUNTA}="resumo">`).removidos,
    pesquisaNaQualificacao: tirarDivs(html, `<div ${MARCA_DA_PESQUISA_POR_PERGUNTA}="qualificacao">`).removidos,
  };
}

/** O HTML sem os acréscimos da 49.20. */
export function semAcrescimosDa4920(html: string): string {
  return tirarDivs(tirarDivs(html, `<div ${MARCA_DA_RECOMPRA_POR_ORIGEM}>`).html, `<div ${MARCA_DA_PESQUISA_POR_PERGUNTA}=`).html;
}

/** Uma cópia do payload sem os campos novos da 49.20 (a ordem das demais chaves fica). */
export function semCamposDa4920(p: DebriefingPayload): DebriefingPayload {
  const q = structuredClone(p) as DebriefingPayload;
  delete q.publico.recompraPorOrigem;
  delete q.publico.crossLaunch.compradoresNaBaseAnterior;
  for (const c of q.dinheiroTempo.compradores) delete c.frioAdv;
  if (q.resumoMacro) delete q.resumoMacro.pesquisaPorPergunta;
  return q;
}
