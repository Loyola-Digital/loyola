/**
 * Atribuição de origem para aplicações que chegaram sem `utm_source`.
 *
 * ## Por que é regra, e não correção
 *
 * As aplicações vivem na planilha do cliente e são lidas a cada request. Não há
 * linha no banco para corrigir, e escrever de volta na planilha seria invasivo
 * (é o arquivo deles) e frágil (a próxima edição do formulário desfaz).
 *
 * Uma regra aplicada na LEITURA resolve os dois lados de uma vez: os leads
 * antigos passam a ter origem na hora, e o lead que chegar amanhã com o mesmo
 * padrão já entra classificado — sem ninguém rodar nada. E é reversível:
 * apagar a regra devolve o dado exatamente ao que a planilha diz.
 *
 * ## A convenção de nome
 *
 * A origem carrega a classificação no próprio nome: `paid_*` é tráfego pago,
 * `organic_*` é orgânico. É frágil por natureza — um erro de digitação vira
 * uma categoria nova e silenciosa. Por isso `montarOrigem` existe: a tela pede
 * só o nome do canal e o prefixo é aplicado aqui, onde não dá para errar.
 */

export type OperadorDeRegra = "igual" | "contem" | "comeca_com" | "vazio";

export interface RegraDeOrigem {
  id: string;
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
  origem: string;
  ordem: number;
  ativa: boolean;
}

/** Uma linha de planilha reduzida ao que a regra observa. */
export type LinhaDeAplicacao = Record<string, string>;

function normalizar(v: string | undefined | null): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * A regra casa esta linha?
 *
 * Comparação sempre normalizada (sem espaço nas pontas, sem caixa): planilha
 * preenchida à mão tem "Instagram", " instagram" e "INSTAGRAM" na mesma coluna,
 * e tratá-los como valores diferentes faria a pessoa criar três regras para o
 * mesmo canal.
 */
export function regraCasa(regra: RegraDeOrigem, linha: LinhaDeAplicacao): boolean {
  const conteudo = normalizar(linha[regra.campo]);
  const alvo = normalizar(regra.valor);

  switch (regra.operador) {
    case "vazio":
      return conteudo === "";
    case "igual":
      return conteudo === alvo;
    case "contem":
      return alvo !== "" && conteudo.includes(alvo);
    case "comeca_com":
      return alvo !== "" && conteudo.startsWith(alvo);
    default:
      return false;
  }
}

export interface OrigemAtribuida {
  origem: string;
  /** Qual regra atribuiu — a tela mostra, para a atribuição não ser mágica. */
  regraId: string;
}

/**
 * A origem que as regras dão a esta linha, ou null.
 *
 * Vence a de MENOR ordem — e a primeira que casa encerra a busca. Sem um
 * critério de desempate declarado, duas regras sobrepostas dariam resultados
 * diferentes conforme a ordem que o banco devolvesse.
 */
export function origemPorRegra(
  regras: RegraDeOrigem[],
  linha: LinhaDeAplicacao,
): OrigemAtribuida | null {
  const ativas = regras.filter((r) => r.ativa).sort((a, b) => a.ordem - b.ordem);
  for (const r of ativas) {
    if (regraCasa(r, linha)) return { origem: r.origem, regraId: r.id };
  }
  return null;
}

export type TipoDeTrafego = "pago" | "organico" | "indefinido";

/**
 * Pago ou orgânico, pelo prefixo do nome.
 *
 * `indefinido` é uma resposta legítima e importante: uma origem que não declara
 * o tipo não pode ser contada como orgânica só porque não diz "paid". Chutar
 * aqui inflaria o orgânico com tudo que estiver fora do padrão.
 */
export function tipoDeTrafego(origem: string | null | undefined): TipoDeTrafego {
  const o = normalizar(origem);
  if (!o) return "indefinido";
  if (o.startsWith("paid_") || o.startsWith("paid-")) return "pago";
  if (o.startsWith("organic_") || o.startsWith("organic-")) return "organico";
  return "indefinido";
}

/**
 * Monta a origem a partir do canal digitado.
 *
 * A tela pede só "instagram"; o prefixo entra aqui. É o que protege a convenção
 * de erro de digitação — e a convenção é o que separa pago de orgânico em todo
 * o resto do sistema.
 */
export function montarOrigem(tipo: "pago" | "organico", canal: string): string {
  const limpo = canal
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${tipo === "pago" ? "paid" : "organic"}_${limpo}`;
}

export interface DiagnosticoDeOrigem {
  total: number;
  /** Tinham `utm_source` na planilha. */
  comOrigem: number;
  /** Não tinham, e nenhuma regra alcançou. */
  semOrigem: number;
  /** Não tinham, mas uma regra atribuiu. */
  recuperadas: number;
  pago: number;
  organico: number;
  /** Origem preenchida que não segue a convenção `paid_`/`organic_`. */
  indefinido: number;
}

/**
 * O quadro do rastreamento.
 *
 * Separa `semOrigem` de `recuperadas` de propósito: juntas, elas viram um
 * "tem origem" que esconde quanto do resultado depende de regra escrita à mão —
 * e é exatamente isso que alguém precisa saber antes de confiar no número.
 */
export function diagnosticar(
  linhas: LinhaDeAplicacao[],
  campoDaOrigem: string,
  regras: RegraDeOrigem[],
): DiagnosticoDeOrigem {
  const d: DiagnosticoDeOrigem = {
    total: linhas.length,
    comOrigem: 0,
    semOrigem: 0,
    recuperadas: 0,
    pago: 0,
    organico: 0,
    indefinido: 0,
  };

  for (const linha of linhas) {
    const declarada = (linha[campoDaOrigem] ?? "").trim();
    let origem = declarada;
    if (declarada) d.comOrigem += 1;
    else {
      const atribuida = origemPorRegra(regras, linha);
      if (atribuida) {
        d.recuperadas += 1;
        origem = atribuida.origem;
      } else {
        d.semOrigem += 1;
      }
    }
    if (!origem) continue;
    const t = tipoDeTrafego(origem);
    if (t === "pago") d.pago += 1;
    else if (t === "organico") d.organico += 1;
    else d.indefinido += 1;
  }

  return d;
}

export interface GrupoDeOrfaos {
  valor: string;
  /** Rótulo para o vazio, que é um grupo legítimo e costuma ser o maior. */
  label: string;
  quantidade: number;
  exemplos: string[];
}

/**
 * Quebra os órfãos pelos valores de um campo qualquer.
 *
 * É o passo que transforma "46 leads sem origem" em "31 vieram do
 * utm_medium=stories" — de um número que não sugere ação para um grupo que
 * pode ser atribuído de uma vez.
 */
export function agruparOrfaos(
  linhas: LinhaDeAplicacao[],
  campoDaOrigem: string,
  campoDeAnalise: string,
  regras: RegraDeOrigem[],
  maxExemplos = 3,
): GrupoDeOrfaos[] {
  const grupos = new Map<string, GrupoDeOrfaos>();

  for (const linha of linhas) {
    if ((linha[campoDaOrigem] ?? "").trim()) continue;
    if (origemPorRegra(regras, linha)) continue;

    const bruto = (linha[campoDeAnalise] ?? "").trim();
    const chave = bruto.toLowerCase();
    const atual = grupos.get(chave);
    if (atual) {
      atual.quantidade += 1;
      if (atual.exemplos.length < maxExemplos && linha.email) atual.exemplos.push(linha.email);
    } else {
      grupos.set(chave, {
        valor: bruto,
        label: bruto || "(em branco)",
        quantidade: 1,
        exemplos: linha.email ? [linha.email] : [],
      });
    }
  }

  // Maior primeiro: é o grupo que mais muda o número se for atribuído.
  return [...grupos.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export interface GrupoParaClassificar {
  /** O valor como a regra vai casar (normalizado). */
  valor: string;
  /** Como aparece na planilha — a grafia mais frequente. */
  label: string;
  quantidade: number;
  /** As grafias encontradas, quando há mais de uma. */
  variacoes: string[];
}

/**
 * As origens que existem mas não dizem se são pagas ou orgânicas.
 *
 * Medido nas planilhas reais: 115 de 119 aplicações têm `utm_source`
 * preenchido — `meta`, `whatsapp`, `ig`, `yt` — e nenhuma segue a convenção
 * `paid_`/`organic_`. Ou seja, o problema aqui não é o lead sem origem (são
 * quatro): é a origem que existe e não classifica.
 *
 * Agrupa por valor NORMALIZADO de propósito: `whatsapp` e `WhatsApp` são o
 * mesmo canal contado duas vezes, e classificá-los separado seria repetir a
 * fragmentação em vez de resolvê-la. As grafias vão em `variacoes` para a tela
 * poder mostrar que a unificação aconteceu.
 */
export function agruparParaClassificar(
  linhas: LinhaDeAplicacao[],
  campoDaOrigem: string,
  regras: RegraDeOrigem[],
): GrupoParaClassificar[] {
  const grupos = new Map<string, { quantidade: number; grafias: Map<string, number> }>();

  for (const linha of linhas) {
    const declarada = (linha[campoDaOrigem] ?? "").trim();
    const origem = declarada || origemPorRegra(regras, linha)?.origem || "";
    if (!origem) continue;
    if (tipoDeTrafego(origem) !== "indefinido") continue;

    const chave = normalizar(origem);
    const atual = grupos.get(chave) ?? { quantidade: 0, grafias: new Map() };
    atual.quantidade += 1;
    atual.grafias.set(origem, (atual.grafias.get(origem) ?? 0) + 1);
    grupos.set(chave, atual);
  }

  return [...grupos.entries()]
    .map(([valor, { quantidade, grafias }]) => {
      const ordenadas = [...grafias.entries()].sort((a, b) => b[1] - a[1]);
      return {
        valor,
        // A grafia mais frequente vira o rótulo: é a que a pessoa reconhece.
        label: ordenadas[0][0],
        quantidade,
        variacoes: ordenadas.length > 1 ? ordenadas.map(([g]) => g) : [],
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
}
