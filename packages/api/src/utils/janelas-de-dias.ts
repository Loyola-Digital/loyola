/**
 * Fatia "os últimos N dias" em janelas contíguas de até `tamanho` dias.
 *
 * Mora aqui, e não dentro do script de backfill, porque é a parte que erra em
 * silêncio: a primeira versão parava em `hoje - 5` e deixava os cinco dias mais
 * recentes de fora. O backfill rodou, disse ter gravado 12 mil linhas, e os dias
 * que mais importavam continuaram zerados — o tipo de defeito que só um teste de
 * fronteira pega.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface JanelaDeDias {
  /** `YYYY-MM-DD`, o lado antigo. */
  since: string;
  /** `YYYY-MM-DD`, o lado novo. */
  until: string;
}

/**
 * As janelas que cobrem `[hoje - (dias - 1), hoje]`, da mais antiga para a mais
 * nova, sem lacuna entre elas e sem passar de hoje.
 *
 * `dias` conta HOJE: `dias = 1` devolve uma janela de hoje a hoje.
 */
export function janelasDeDias(
  dias: number,
  tamanho: number,
  agora: Date = new Date(),
): JanelaDeDias[] {
  if (dias < 1 || tamanho < 1) return [];
  const hoje = agora.getTime();
  const dia = (offset: number) => new Date(hoje - offset * DIA_MS).toISOString().slice(0, 10);

  const saida: JanelaDeDias[] = [];
  for (let maisAntigo = dias - 1; maisAntigo >= 0; maisAntigo -= tamanho) {
    // O lado novo da janela é `tamanho - 1` dias à frente do antigo, com piso em
    // hoje — é esse piso que faz a última janela chegar até o fim.
    const maisNovo = Math.max(maisAntigo - tamanho + 1, 0);
    saida.push({ since: dia(maisAntigo), until: dia(maisNovo) });
  }
  return saida;
}
