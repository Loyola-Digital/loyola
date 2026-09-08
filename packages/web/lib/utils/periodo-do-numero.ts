/**
 * Story 44.31 — a frase que declara de QUE PERÍODO é o número da tela.
 *
 * ## O defeito que ela fecha
 *
 * `bbe-pr2-ago-26 / Captação Paga`, no mesmo dia e com o mesmo investimento:
 *
 * ```
 * aba Cadeia de CAC : 23 vendas → CAC R$ 743,58
 * Panorama          : 20 vendas → CAC R$ 855,11
 * ```
 *
 * Os dois estão certos. A aba chama a rota **sem** `from`/`to` (histórico
 * inteiro, decisão da Story 44.8) e o Panorama recorta 30 dias. **Nenhuma das
 * duas telas dizia qual.** Quem comparava concluía que uma estava quebrada.
 *
 * No `fz-a1` a diferença é de 2,4× no mesmo campo com o mesmo rótulo:
 * R$ 35.520,56 de histórico contra R$ 15.087,96 em 90 dias. BBE e PP "batiam"
 * por coincidência — o histórico deles é menor que 90 dias.
 *
 * ## Por que é função pura, e não texto dentro do JSX
 *
 * O `vitest.config` do web só coleta `lib/utils/**\/*.test.ts`: um
 * `.test.tsx` de componente **nunca roda**, e o teste passaria a existir sem
 * nunca ter executado. A regra mora aqui para poder ser testada de verdade; o
 * componente só a renderiza.
 */

export interface EntradaDoPeriodo {
  /** O que o CHAMADOR pediu. `null` nos dois campos = não pediu nada. */
  range: { from: string | null; to: string | null };
  /** O intervalo REAL dos dias somados. `null`/ausente = não houve série. */
  serie?: { de: string; ate: string } | null;
  /** Dias COM dado. Pode ser menor que o vão entre as datas. */
  dias?: number | null;
}

export interface PeriodoDeclarado {
  /** `true` quando o número é do histórico inteiro — a tela precisa dizer. */
  historico: boolean;
  /** `"13/03 a 07/09"`, ou `null` quando não há período a declarar. */
  intervalo: string | null;
  /** `"179 dias com dado"`, ou `null`. */
  cobertura: string | null;
  /** A frase pronta, ou `null` quando não há nada a declarar. */
  texto: string | null;
}

/** `2026-09-08` → `08/09`. O ano só atrapalha num rótulo curto. */
export function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return mes && dia ? `${dia}/${mes}` : iso;
}

export function periodoDoNumero(e: EntradaDoPeriodo): PeriodoDeclarado {
  const pediuJanela = e.range.from != null && e.range.to != null;
  const vazio: PeriodoDeclarado = {
    historico: false,
    intervalo: null,
    cobertura: null,
    texto: null,
  };

  // Sem janela pedida E sem série não há período — e inventar um seria pior que
  // omitir. O componente não renderiza nada neste caso.
  if (!pediuJanela && !e.serie) return vazio;

  const intervalo = pediuJanela
    ? `${diaEMes(e.range.from!)} a ${diaEMes(e.range.to!)}`
    : e.serie
      ? `${diaEMes(e.serie.de)} a ${diaEMes(e.serie.ate)}`
      : null;

  /**
   * ⚠️ "dias com dado" e o vão entre as datas **não são o mesmo número**.
   *
   * Um funil parado três semanas tem menos dias com dado que dias de
   * calendário. Rotular só como "dias" convidaria a dividir investimento por
   * ele e achar um diário que não existe.
   */
  const cobertura =
    e.dias != null && e.dias > 0 ? `${e.dias} ${e.dias === 1 ? "dia" : "dias"} com dado` : null;

  const partes = [
    // AC2: sem janela pedida, a tela DIZ que é o histórico. Não inventa um
    // período nem deixa supor que é o do seletor da aba ao lado.
    !pediuJanela ? "Todo o histórico" : null,
    intervalo,
    cobertura,
  ].filter(Boolean);

  return {
    historico: !pediuJanela,
    intervalo,
    cobertura,
    texto: partes.length > 0 ? partes.join(" · ") : null,
  };
}
