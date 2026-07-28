/**
 * Story 41.9 — leituras do relatório perpétuo (§C.5).
 *
 * A REGRA QUE ORIGINOU O EPIC: nenhum número e nenhum adjetivo comparativo pode
 * ser literal no texto. O caso real documentado no epic é um relatório que
 * continuou afirmando *"a conversão piorou de 1,74% para 1,98%"* depois de uma
 * reclassificação — a conversão tinha MELHORADO, mas a frase estava fixa no
 * template.
 *
 * Por isso aqui não existe string com veredito embutido. Todo verbo
 * (`cobre`/`não cobre`), toda ordenação (melhor/pior) e todo empate saem do dado
 * no momento da geração. O teste de inversão (`perpetual-report-readings.test.ts`)
 * roda os mesmos cenários espelhados e exige que o texto acompanhe.
 */

import type { PerpetualReport, SegmentoRow } from "./perpetual-report-metrics.js";

/** Diferença de ROAS abaixo da qual formato é empate declarado (§C.5, bloco 3). */
export const EMPATE_ROAS = 0.15;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number, casas = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (n: number) => `${num(n * 100, 1)}%`;

/**
 * Gera de 3 a 6 bullets a partir das métricas. Blocos que não se aplicam somem
 * — não viram "sem dados" (§C.4).
 */
export function buildReadings(report: PerpetualReport): string[] {
  const out: string[] = [];
  const { kpis, segmentos, organico } = report;

  // --- 1. Resultado geral (obrigatório) ---
  // O verbo sai do sinal da margem. Não existe "cobre" escrito à mão.
  const cobre = kpis.margem >= 0 ? "cobre" : "não cobre";
  const sobra = kpis.margem >= 0 ? "sobra" : "falta";
  out.push(
    `ROAS de ${kpis.roas === null ? "—" : num(kpis.roas)}. O faturamento bruto ${cobre} ` +
      `o investimento. Depois das taxas ${sobra} ${brl(Math.abs(kpis.margem))}` +
      `${kpis.margemPct === null ? "" : ` (${pct(Math.abs(kpis.margemPct))} do bruto)`}.`,
  );

  // --- 2. Público: derivar qual é melhor, nunca assumir ---
  const publicos = segmentos.quenteFrio.filter((r) => r.roas !== null && r.vendas > 0);
  if (publicos.length >= 2) {
    const [melhor, pior] = [...publicos].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    out.push(
      `${melhor.label} performa melhor: ROAS ${num(melhor.roas!)} contra ${num(pior.roas!)}, ` +
        `com CAC ${melhor.cac === null ? "—" : brl(melhor.cac)} vs ` +
        `${pior.cac === null ? "—" : brl(pior.cac)}. O ${pior.label} leva ` +
        `${pct(pior.pctInvestimento)} do investimento.`,
    );
  }

  // --- 3. Formato: só com split; empate é declarado, não escondido ---
  if (segmentos.formato) {
    const comRoas = segmentos.formato.filter((r) => r.roas !== null && r.investimento > 0);
    if (comRoas.length >= 2) {
      const ordenado = [...comRoas].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
      const [a, b] = ordenado;
      if (Math.abs((a.roas ?? 0) - (b.roas ?? 0)) < EMPATE_ROAS) {
        out.push(
          `${a.label} e ${b.label} praticamente empatam (ROAS ${num(a.roas!)} vs ` +
            `${num(b.roas!)}) — o formato não é a alavanca aqui.`,
        );
      } else {
        out.push(
          `${a.label} entrega ROAS melhor (${num(a.roas!)} vs ${num(b.roas!)}), ` +
            `com CAC ${a.cac === null ? "—" : brl(a.cac)} contra ` +
            `${b.cac === null ? "—" : brl(b.cac)}.`,
        );
      }
    }
  }

  // --- 4. Campanhas no prejuízo ---
  const perdedoras = segmentos.campanhas.filter(
    (c) => c.roas !== null && c.roas < 1 && c.investimento > 0,
  );
  if (perdedoras.length > 0) {
    const soma = perdedoras.reduce((s, c) => s + c.investimento, 0);
    const pctInv = soma / (kpis.investimentoComImposto || 1);
    const lista = perdedoras
      .slice(0, 4)
      .map((c) => c.label)
      .join(", ");
    const resto = perdedoras.length > 4 ? ` e mais ${perdedoras.length - 4}` : "";
    out.push(
      `${perdedoras.length} campanha(s) com ROAS abaixo de 1 consumindo ${brl(soma)} ` +
        `(${pct(pctInv)} do investimento): ${lista}${resto}.`,
    );
  }

  // --- 5. Ponto de equilíbrio (obrigatório — §C.5) ---
  if (kpis.cacBreakeven !== null && kpis.ticketMedio !== null) {
    const posicao =
      kpis.cacVsBreakeven === null
        ? ""
        : kpis.cacVsBreakeven > 0
          ? ` — está ${brl(kpis.cacVsBreakeven)} acima.`
          : ` — está ${brl(Math.abs(kpis.cacVsBreakeven))} abaixo, com folga.`;
    out.push(
      `Com ticket de ${brl(kpis.ticketMedio)} e ${pct(report.fontes.receitaLiquidaPct)} de ` +
        `receita líquida, o CAC precisa ficar abaixo de ${brl(kpis.cacBreakeven)}. ` +
        `Hoje está em ${kpis.cac === null ? "—" : brl(kpis.cac)}${posicao}`,
    );
  }

  // --- 6. Orgânico ---
  if (organico.vendas > 0) {
    out.push(
      `${organico.vendas} venda(s) fora do tráfego pago somando ${brl(organico.faturamento)} — ` +
        `ficam fora de CAC, ROAS e margem.`,
    );
  }

  return out.slice(0, 6);
}

/** Notas de dado (§C.4) — alertas em linguagem de quem lê, não código de erro. */
export function buildDataNotes(report: PerpetualReport): string[] {
  const notas: string[] = [];

  notas.push(
    `Investimento com gross-up de imposto de ${pct(report.fontes.impostoPct)} sobre a mídia.`,
  );
  notas.push(
    `Margem calculada sobre ${pct(report.fontes.receitaLiquidaPct)} de receita líquida — ` +
      `memorial completo acima.`,
  );

  for (const a of report.alertas) notas.push(a.mensagem);

  if (!report.segmentos.formato) {
    notas.push(
      "Split de vídeos/estáticos não se aplica a este funil — a seção foi omitida, não zerada.",
    );
  }
  if (!report.segmentos.publicos) {
    notas.push("Quebra por público indisponível: as vendas não trazem o ID do conjunto.");
  }
  if (!report.segmentos.criativos) {
    notas.push("Quebra por criativo indisponível: as vendas não trazem o ID do anúncio.");
  }
  if (report.reconciliacao.sobreposicao > 0) {
    notas.push(
      `${report.reconciliacao.sobreposicao} comprador(es) aparecem em mais de uma campanha — ` +
        `por isso a soma das campanhas passa do total de vendas.`,
    );
  }

  return notas;
}

/** Rótulo da direção de uma métrica de tendência, derivado do sinal (§C.4). */
export function trendLabel(
  deltaPct: number | null,
  menorEhMelhor: boolean,
): { texto: string; sentido: "melhora" | "piora" | "estavel" } {
  if (deltaPct === null) return { texto: "—", sentido: "estavel" };
  if (Math.abs(deltaPct) < 1) return { texto: "estável", sentido: "estavel" };
  const subiu = deltaPct > 0;
  // No CAC, cair é melhorar — é a única métrica com sinal invertido (§C.4).
  const melhorou = menorEhMelhor ? !subiu : subiu;
  return {
    texto: `${subiu ? "+" : ""}${num(deltaPct, 1)}%`,
    sentido: melhorou ? "melhora" : "piora",
  };
}

export function formatSegmentoLabel(row: SegmentoRow): string {
  return row.label;
}
