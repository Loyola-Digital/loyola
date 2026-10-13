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

/** Quantas linhas têm algo nesta coluna. */
function cheias(linhas: string[][], i: number): number {
  return linhas.reduce((n, l) => n + ((l[i] ?? "").trim().length > 0 ? 1 : 0), 0);
}

/**
 * Entre a coluna que o mapeamento aponta e a que a busca por nome acha, qual usar.
 *
 * ## O problema
 *
 * O mapeamento aponta para um CABEÇALHO, e formulário refeito deixa o cabeçalho
 * velho na planilha. Aí `indexOf` acha, a busca por nome nunca roda, e o valor
 * lido é vazio em quase toda linha. Zero erro, zero aviso: só gente faltando na
 * conta.
 *
 * Medido na Captação Paga do dg-pg05-out-26 (13/10/2026): a planilha tem 58
 * colunas e DUAS gerações do formulário. O mapeamento apontava para "Digite o
 * e-mail de compra, por favor:" — preenchida em **2 das 269 linhas** — enquanto
 * o e-mail vivo estava em "Agora seu e-mail de cadastro", preenchida em **267**.
 * Resultado: 267 leads iam ao Meta sem e-mail nem telefone, e o Meta não casa
 * com ninguém.
 *
 * ## Por que a regra é uma RAZÃO, e não "está vazia"
 *
 * "Vazia" não bastava: a coluna morta tinha duas linhas de resíduo, e qualquer
 * teste de "tem algum dado" passa com duas. E um limiar absoluto ("menos de
 * 10% preenchido") descartaria planilha que acabou de começar a receber.
 *
 * Então a mapeada só perde quando está praticamente morta AO LADO da
 * alternativa: a outra precisa ter 5× mais dado. 2 contra 267 é 133× e troca;
 * 100 contra 150 é 1,5× e NÃO troca — porque aí as duas colunas são reais
 * ("e-mail de compra" e "e-mail de cadastro" são perguntas diferentes), e quem
 * configurou sabe algo que a heurística não sabe.
 *
 * Sem `linhas`, o comportamento é o antigo: a mapeada ganha por existir.
 */
function escolherColuna(
  headers: string[],
  mapeada: string | undefined,
  porNome: (headers: string[]) => number,
  linhas?: string[][],
): number {
  const iMapeada = mapeada ? headers.indexOf(mapeada) : -1;
  const iPorNome = porNome(headers);
  if (iMapeada === -1) return iPorNome;
  if (!linhas || linhas.length === 0) return iMapeada;
  if (iPorNome === -1 || iPorNome === iMapeada) return iMapeada;

  const nMapeada = cheias(linhas, iMapeada);
  const nPorNome = cheias(linhas, iPorNome);
  return nPorNome > 0 && nMapeada * 5 < nPorNome ? iPorNome : iMapeada;
}

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
export function acharColunaDeEmail(
  headers: string[],
  mapeada?: string,
  /** As linhas, para a mapeada não vencer estando morta. Ver `escolherColuna`. */
  linhas?: string[][],
): number {
  return escolherColuna(headers, mapeada, (hs) => hs.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("e-mail") || n.includes("email");
  }), linhas);
}

/**
 * A coluna de NOME da pessoa — não a do restaurante, da empresa ou do negócio.
 * "Qual é o nome do seu restaurante" tem "nome" e não serve para casar gente.
 */
export function acharColunaDeNome(
  headers: string[],
  mapeada?: string,
  /** As linhas, para a mapeada não vencer estando morta. Ver `escolherColuna`. */
  linhas?: string[][],
): number {
  return escolherColuna(headers, mapeada, (hs) => hs.findIndex((h) => {
    const n = semAcento(h);
    return (
      n.includes("nome") &&
      !n.includes("restaurante") &&
      !n.includes("empresa") &&
      !n.includes("negocio") &&
      !n.includes("estabelecimento")
    );
  }), linhas);
}

export function acharColunaDeTelefone(
  headers: string[],
  mapeada?: string,
  /** As linhas, para a mapeada não vencer estando morta. Ver `escolherColuna`. */
  linhas?: string[][],
): number {
  return escolherColuna(headers, mapeada, (hs) => hs.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("whatsapp") || n.includes("telefone") || n.includes("celular");
  }), linhas);
}

/**
 * A coluna do tipo de ingresso do participante (VIP, Black, Empreendedor).
 *
 * Cada planilha de participantes chama isso de um jeito: "Ingresso" numa,
 * "Categoria" na do BBE-PR2-OUT/26. Antes só "Ingresso" era lido, e a coluna
 * do outro nome ficava invisível no mapa e no plano.
 */
export function acharColunaDeIngresso(
  headers: string[],
  mapeada?: string,
  /** As linhas, para a mapeada não vencer estando morta. Ver `escolherColuna`. */
  linhas?: string[][],
): number {
  return escolherColuna(headers, mapeada, (hs) => hs.findIndex((h) => {
    const n = semAcento(h);
    return n === "ingresso" || n === "ingressos" || n === "categoria" || n === "tipo de ingresso";
  }), linhas);
}

/**
 * A coluna de FATURAMENTO do negócio na pesquisa.
 *
 * "renda" fica de fora de propósito: o mesmo formulário pergunta as duas
 * coisas ("Qual é o faturamento médio mensal do seu negócio?" e "Qual é a sua
 * renda mensal média pessoal"), e trocar uma pela outra põe na tela um número
 * dez vezes menor sem ninguém notar.
 */
export function acharColunaDeFaturamento(
  headers: string[],
  mapeada?: string,
  /** As linhas, para a mapeada não vencer estando morta. Ver `escolherColuna`. */
  linhas?: string[][],
): number {
  return escolherColuna(headers, mapeada, (hs) => hs.findIndex((h) => {
    const n = semAcento(h);
    return n.includes("faturamento") && !n.includes("renda");
  }), linhas);
}
