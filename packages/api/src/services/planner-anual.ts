/**
 * O calendário anual do Planner — vocabulário e montagem da matriz.
 *
 * ## O que esta tela é
 *
 * Uma matriz de **esteiras × meses**: cada linha é uma máquina que roda ao
 * longo do ano ("Webinar diário", "Reunião secreta 3x por mês") e cada coluna
 * é um mês. É a escala macro, ao lado da campanha datada que o Planner já
 * tinha — e as duas não se descrevem: um lançamento é um evento com fases, uma
 * esteira é algo que acontece todo mês.
 *
 * ## Por que as células vêm em matriz, e não em lista
 *
 * O banco guarda só as células que alguém preencheu — 84 linhas vazias por
 * empresa/ano seria escrever nada 84 vezes. A tela, porém, precisa das doze
 * colunas sempre, preenchidas ou não. `montarMatriz` faz essa ponte num lugar
 * só, para a tela não ter de decidir a cada render se `undefined` é "mês vazio"
 * ou "dado que não chegou".
 */

/** As faixas coloridas da lateral. A ordem aqui é a ordem na tela. */
export const GRUPOS = ["organico", "trafego", "ascensao"] as const;
export type Grupo = (typeof GRUPOS)[number];

export const ROTULO_DO_GRUPO: Record<Grupo, string> = {
  organico: "ORGÂNICO",
  trafego: "TRÁFEGO",
  ascensao: "ASCENSÃO",
};

/** Aproximadas às da planilha do time: vermelho, verde oliva, azul marinho. */
export const COR_DO_GRUPO: Record<Grupo, string> = {
  organico: "#A32B1F",
  trafego: "#5A7F3C",
  ascensao: "#1F3864",
};

export const CATEGORIAS = ["Back-End", "Front-End"] as const;

export const FUNIS = [
  "Lançamento",
  "DR - VSL",
  "Grupo de Conteúdo",
  "Reunião Secreta",
  "Webinar diário",
  "Time comercial",
] as const;

export function ehGrupo(v: string): v is Grupo {
  return (GRUPOS as readonly string[]).includes(v);
}

export interface CelulaDoAnual {
  frequencia: string | null;
  produto: string | null;
  categoria: string | null;
  funil: string | null;
}

export interface CelulaGravada extends CelulaDoAnual {
  trackId: string;
  ano: number;
  mes: number;
}

export interface EsteiraDoAnual {
  id: string;
  grupo: string;
  nome: string;
  sortOrder: number;
}

export interface EsteiraComMeses extends EsteiraDoAnual {
  /** Sempre 12 posições, índice 0 = Janeiro. Vazia onde ninguém preencheu. */
  meses: CelulaDoAnual[];
}

const VAZIA: CelulaDoAnual = { frequencia: null, produto: null, categoria: null, funil: null };

/**
 * As esteiras com os doze meses completos.
 *
 * Célula que não existe no banco vira uma vazia — a tela desenha o mesmo
 * controle nos dois casos, e quem digita não precisa saber que a linha nasceu
 * naquele instante.
 */
export function montarMatriz(
  esteiras: EsteiraDoAnual[],
  celulas: CelulaGravada[],
): EsteiraComMeses[] {
  const porChave = new Map<string, CelulaDoAnual>();
  for (const c of celulas) {
    porChave.set(`${c.trackId}:${c.mes}`, {
      frequencia: c.frequencia,
      produto: c.produto,
      categoria: c.categoria,
      funil: c.funil,
    });
  }

  return [...esteiras]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((e) => ({
      ...e,
      meses: Array.from({ length: 12 }, (_, i) => porChave.get(`${e.id}:${i + 1}`) ?? { ...VAZIA }),
    }));
}

/**
 * Se a célula ficou sem nada.
 *
 * Serve para APAGAR a linha em vez de guardar quatro nulos: uma célula que
 * existe mas está vazia e uma que nunca existiu são a mesma coisa na tela, e
 * manter as duas formas faz a matriz encher de lixo conforme o time limpa
 * planos que não vão acontecer.
 */
export function celulaVazia(c: CelulaDoAnual): boolean {
  return !c.frequencia && !c.produto && !c.categoria && !c.funil;
}

/** Texto do formulário → o que vai ao banco. `""` é ausência, não valor. */
export function limparCelula(c: Partial<CelulaDoAnual>): CelulaDoAnual {
  const t = (v: string | null | undefined, max: number): string | null => {
    const s = (v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  return {
    frequencia: t(c.frequencia, 120),
    produto: t(c.produto, 160),
    // Fora do vocabulário é DESCARTADO, não normalizado: um "back end" solto ao
    // lado de "Back-End" quebraria qualquer leitura por categoria depois.
    categoria: (CATEGORIAS as readonly string[]).includes((c.categoria ?? "").trim())
      ? (c.categoria ?? "").trim()
      : null,
    funil: (FUNIS as readonly string[]).includes((c.funil ?? "").trim())
      ? (c.funil ?? "").trim()
      : null,
  };
}

/** As esteiras que a empresa ganha quando o calendário é criado do zero. */
export const ESTEIRAS_INICIAIS: { grupo: Grupo; nome: string }[] = [
  { grupo: "organico", nome: "Lançamento" },
  { grupo: "organico", nome: "Grupo de conteúdo" },
  { grupo: "trafego", nome: "Perpétuo" },
  { grupo: "ascensao", nome: "Reunião secreta" },
  { grupo: "ascensao", nome: "Webinar diário" },
  { grupo: "ascensao", nome: "Time comercial" },
];
