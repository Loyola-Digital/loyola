/**
 * Do alcance ao lead — o caminho que uma pessoa faz, em etapas.
 *
 * Alcance, visitas ao perfil e cliques na bio costumam ser lidos como três
 * números independentes. Em fila, com a taxa de passagem entre eles, viram uma
 * pergunta só: onde as pessoas param? Alcance enorme com visita minúscula é
 * conteúdo que entretém e não convida; visita alta com clique baixo é bio ou
 * oferta, não conteúdo.
 *
 * A última etapa — quantos viraram lead — fica declarada e vazia de propósito.
 * Esconder o buraco faria o funil parecer completo e o time concluir que o
 * caminho termina no clique.
 */

export interface EtapaDoFunil {
  nome: string;
  valor: number | null;
  /** % de quem chegou na etapa anterior. `null` na primeira e no que falta medir. */
  taxa: number | null;
  explicacao: string;
  /** Etapa que o sistema ainda não sabe medir. */
  faltaLigar?: boolean;
}

export function funilDoPeriodo(entrada: {
  alcance: number;
  visitasAoPerfil: number;
  cliquesNaBio: number;
}): EtapaDoFunil[] {
  const { alcance, visitasAoPerfil, cliquesNaBio } = entrada;
  const taxa = (atual: number, anterior: number) => (anterior > 0 ? (atual / anterior) * 100 : null);

  return [
    {
      nome: "Viram algum conteúdo",
      valor: alcance,
      taxa: null,
      explicacao: "Contas diferentes alcançadas no período.",
    },
    {
      nome: "Abriram o perfil",
      valor: visitasAoPerfil,
      taxa: taxa(visitasAoPerfil, alcance),
      explicacao: "Gostaram o bastante do conteúdo para procurar quem publicou.",
    },
    {
      nome: "Clicaram no link da bio",
      valor: cliquesNaBio,
      taxa: taxa(cliquesNaBio, visitasAoPerfil),
      explicacao: "Saíram do Instagram pelo caminho que leva à lista, ao grupo ou à oferta.",
    },
    {
      nome: "Viraram lead",
      valor: null,
      taxa: null,
      faltaLigar: true,
      explicacao:
        "Ainda não medido: exige link rastreado na bio para casar o clique com as etapas de lead do funil.",
    },
  ];
}

/**
 * Largura da barra, de 0 a 1, em escala logarítmica.
 *
 * Em escala linear a primeira etapa ocupa a barra inteira e as outras viram
 * fios: 683 mil contra 668 não cabem no mesmo eixo. O log mantém a queda
 * visível sem esconder as etapas pequenas — e por isso a tela diz que a escala
 * é logarítmica, senão alguém compara as larguras como se fossem proporção.
 */
export function larguraLog(valor: number, maior: number): number {
  if (valor <= 0 || maior <= 0) return 0;
  return Math.log10(valor + 1) / Math.log10(maior + 1);
}
