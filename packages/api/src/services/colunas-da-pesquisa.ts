/**
 * Achar e-mail, nome, telefone e ingresso nas planilhas da etapa de evento,
 * pelo CABEÇALHO.
 *
 * ## Por que existe
 *
 * O cruzamento da pesquisa com os participantes depende de uma coluna mapeada
 * à mão na configuração da etapa. Quando esse mapeamento aponta para um
 * cabeçalho que não existe — porque o formulário foi refeito, ou porque alguém
 * digitou "email" e a pergunta chama "Qual é o seu e-mail" — o índice vem `-1`
 * e o casamento por e-mail simplesmente não acontece. Sem erro nenhum: o mapa
 * cai no telefone e no nome, e algumas pessoas somem da conta.
 *
 * Medido na etapa Evento do bbe-pr2-out-26 (23/09/2026): 17 respostas, 26
 * participantes; por e-mail casam 10, e a tela mostrava 9 — o mapeamento dizia
 * `email`, coluna que a planilha não tem.
 *
 * Detectar pelo cabeçalho é o que `findNameIdx`/`findPhoneIdx` já faziam para
 * nome e telefone; o e-mail era o único que dependia só do mapeamento.
 *
 * Módulo puro: sem DB, sem rede.
 */

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * O índice da coluna de e-mail: primeiro o que o mapeamento diz, e só então o
 * primeiro cabeçalho que fala de e-mail. `-1` quando não há nenhuma.
 */
export function acharColunaDeEmail(headers: string[], mapeada?: string): number {
  if (mapeada) {
    const i = headers.indexOf(mapeada);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("e-mail") || n.includes("email");
  });
}

/**
 * A coluna de NOME da pessoa — não a do restaurante, da empresa ou do negócio.
 * "Qual é o nome do seu restaurante" tem "nome" e não serve para casar gente.
 */
export function acharColunaDeNome(headers: string[], mapeada?: string): number {
  if (mapeada) {
    const i = headers.indexOf(mapeada);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => {
    const n = semAcento(h);
    return (
      n.includes("nome") &&
      !n.includes("restaurante") &&
      !n.includes("empresa") &&
      !n.includes("negocio") &&
      !n.includes("estabelecimento")
    );
  });
}

export function acharColunaDeTelefone(headers: string[], mapeada?: string): number {
  if (mapeada) {
    const i = headers.indexOf(mapeada);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("whatsapp") || n.includes("telefone") || n.includes("celular");
  });
}

/**
 * A coluna do tipo de ingresso do participante (VIP, Black, Empreendedor).
 *
 * Cada planilha de participantes chama isso de um jeito: "Ingresso" numa,
 * "Categoria" na do BBE-PR2-OUT/26. Antes só "Ingresso" era lido, e a coluna
 * do outro nome ficava invisível no mapa e no plano.
 */
export function acharColunaDeIngresso(headers: string[], mapeada?: string): number {
  if (mapeada) {
    const i = headers.indexOf(mapeada);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => {
    const n = semAcento(h);
    return n === "ingresso" || n === "ingressos" || n === "categoria" || n === "tipo de ingresso";
  });
}

/**
 * A coluna de FATURAMENTO do negócio na pesquisa.
 *
 * "renda" fica de fora de propósito: o mesmo formulário pergunta as duas
 * coisas ("Qual é o faturamento médio mensal do seu negócio?" e "Qual é a sua
 * renda mensal média pessoal"), e trocar uma pela outra põe na tela um número
 * dez vezes menor sem ninguém notar.
 */
export function acharColunaDeFaturamento(headers: string[], mapeada?: string): number {
  if (mapeada) {
    const i = headers.indexOf(mapeada);
    if (i !== -1) return i;
  }
  return headers.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("faturamento") && !n.includes("renda");
  });
}
