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

import { CATEGORIAS_DO_ANUAL, FAIXAS_DO_ANUAL, FUNIS_DO_ANUAL } from "@loyola-x/shared";

/**
 * As faixas coloridas da lateral. A ordem aqui é a ordem na tela.
 *
 * As três listas vêm do shared: o MCP as usa como `enum` das ferramentas, e
 * uma cópia aqui divergiria no primeiro funil novo.
 */
export const GRUPOS = FAIXAS_DO_ANUAL;
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

export interface GrupoDoAnual {
  id: Grupo;
  rotulo: string;
  cor: string;
}

/**
 * O que a empresa mudou na faixa. Pode não haver linha nenhuma.
 *
 * A tabela guarda só o que alguém personalizou — semear três linhas por
 * empresa faria toda empresa nova carregar cópias do padrão, e mudar o padrão
 * depois não alcançaria nenhuma delas.
 */
export interface PersonalizacaoDeGrupo {
  grupo: string;
  rotulo: string | null;
  cor: string | null;
}

/**
 * Texto do campo → rótulo da faixa. Vazio é ausência, não valor.
 *
 * Apagar o nome RESTAURA o padrão — é o "desfazer" da personalização sem um
 * botão a mais no painel, e evita uma faixa colorida sem nenhum texto, que não
 * diz de que grupo é a linha.
 */
export function limparRotulo(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s.slice(0, 40) : null;
}

/**
 * Cor → `#rrggbb` minúsculo, ou nada.
 *
 * Só hexadecimal: a cor vai direto para `background-color` no navegador de
 * quem abrir, então aceitar texto livre aqui é deixar a tela decidir o que
 * fazer com `red; content: …`. As três letras viram seis para o valor gravado
 * ser sempre comparável ao que o `input[type=color]` devolve.
 */
export function limparCor(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}

/** As três faixas de uma empresa, com o que ela mudou aplicado por cima. */
export function gruposDoProjeto(personalizacoes: PersonalizacaoDeGrupo[]): GrupoDoAnual[] {
  const por = new Map(personalizacoes.map((p) => [p.grupo, p]));
  return GRUPOS.map((g) => {
    const p = por.get(g);
    return {
      id: g,
      rotulo: limparRotulo(p?.rotulo) ?? ROTULO_DO_GRUPO[g],
      cor: limparCor(p?.cor) ?? COR_DO_GRUPO[g],
    };
  });
}

export const CATEGORIAS = CATEGORIAS_DO_ANUAL;

export const FUNIS = FUNIS_DO_ANUAL;

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

// ---------------------------------------------------------------------------
// API pública: o lote de células que o Claude da Ágatha manda.
//
// A tela grava uma célula por vez, inteira. A API recebe várias de uma vez e
// PARCIAIS: campo omitido não muda, `null` limpa. E aceita a esteira pelo
// nome, porque é assim que uma pessoa pede ("Perpétuo Funil de Lucro, na faixa
// Tráfego") — e o modelo não tem o id na cabeça.
// ---------------------------------------------------------------------------

/** Texto para comparar nomes: sem caixa, acento nem espaço sobrando. */
export function chaveDeTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * A faixa de um texto. Aceita o id (`trafego`), o rótulo padrão (`TRÁFEGO`) e
 * o rótulo que a empresa deu (`CAMPANHA` na DG) — é o que a pessoa vê na tela.
 */
export function resolverFaixa(texto: string, grupos: GrupoDoAnual[]): Grupo | null {
  const k = chaveDeTexto(texto);
  for (const g of grupos) {
    if (k === g.id || k === chaveDeTexto(g.rotulo) || k === chaveDeTexto(ROTULO_DO_GRUPO[g.id])) {
      return g.id;
    }
  }
  return null;
}

/** O valor na grafia do vocabulário ("lancamento" → "Lançamento"), ou `null`. */
function noVocabulario(valor: string, lista: readonly string[]): string | null {
  const k = chaveDeTexto(valor);
  return lista.find((v) => chaveDeTexto(v) === k) ?? null;
}

/** Uma célula como a API a mostra: `nota` é o texto curto acima da célula. */
export interface CelulaPublica {
  nota: string | null;
  produto: string | null;
  categoria: string | null;
  funil: string | null;
}

export function celulaPublica(c: CelulaDoAnual): CelulaPublica {
  return { nota: c.frequencia, produto: c.produto, categoria: c.categoria, funil: c.funil };
}

/** O que muda numa célula. Campo omitido (`undefined`) fica; `null` limpa. */
export type PatchDeCelula = Partial<Record<keyof CelulaPublica, string | null>>;

/**
 * Categoria e funil na grafia certa, ou os erros.
 *
 * A tela DESCARTA valor fora da lista em silêncio (`limparCelula`). A API não
 * pode: o modelo acharia que gravou "Webinar" e a célula ficaria vazia.
 */
export function validarPatch(p: PatchDeCelula): { patch: PatchDeCelula; erros: string[] } {
  const erros: string[] = [];
  const patch = { ...p };
  for (const [campo, lista] of [
    ["categoria", CATEGORIAS],
    ["funil", FUNIS],
  ] as const) {
    const v = p[campo];
    if (v == null || v.trim() === "") continue;
    const certo = noVocabulario(v, lista);
    if (certo) patch[campo] = certo;
    else erros.push(`${campo} "${v}" não existe. Opções: ${lista.join(", ")} (ou null para limpar).`);
  }
  return { patch, erros };
}

export function aplicarPatch(atual: CelulaDoAnual, p: PatchDeCelula): CelulaDoAnual {
  const ou = <T>(novo: T | undefined, velho: T) => (novo === undefined ? velho : novo);
  return limparCelula({
    frequencia: ou(p.nota, atual.frequencia),
    produto: ou(p.produto, atual.produto),
    categoria: ou(p.categoria, atual.categoria),
    funil: ou(p.funil, atual.funil),
  });
}

export function diffDaCelula(
  antes: CelulaDoAnual,
  depois: CelulaDoAnual,
): Partial<Record<keyof CelulaPublica, { antes: string | null; depois: string | null }>> {
  const a = celulaPublica(antes);
  const d = celulaPublica(depois);
  const saida: Partial<Record<keyof CelulaPublica, { antes: string | null; depois: string | null }>> = {};
  for (const k of Object.keys(a) as (keyof CelulaPublica)[]) {
    if (a[k] !== d[k]) saida[k] = { antes: a[k], depois: d[k] };
  }
  return saida;
}

export interface ItemDoLote extends PatchDeCelula {
  esteira: { id?: string; faixa?: string; nome?: string; criarSeNaoExistir?: boolean };
  mes: number;
}

export interface MudancaNoLote {
  /** `null` quando a esteira ainda vai ser criada. */
  esteiraId: string | null;
  faixa: Grupo;
  esteira: string;
  mes: number;
  antes: CelulaDoAnual;
  depois: CelulaDoAnual;
}

export interface PlanoDoLote {
  erros: { indice: number; erro: string }[];
  /** Esteiras que o lote cria (`criarSeNaoExistir`). */
  novas: { faixa: Grupo; nome: string }[];
  mudancas: MudancaNoLote[];
}

/**
 * O que o lote faria, sem gravar nada — é o `dryRun`, e é também o plano que a
 * gravação executa. Os dois saem da mesma função para o diff mostrado à
 * Ágatha ser exatamente o que vai ao banco.
 *
 * Itens repetidos para a mesma esteira e mês se somam na ordem do lote.
 */
export function planejarLote(
  itens: ItemDoLote[],
  esteiras: (EsteiraDoAnual & { grupo: string })[],
  grupos: GrupoDoAnual[],
  celulas: Map<string, CelulaDoAnual>,
): PlanoDoLote {
  const erros: PlanoDoLote["erros"] = [];
  const novas = new Map<string, { faixa: Grupo; nome: string }>();
  const plano = new Map<string, MudancaNoLote>();
  const opcoesDeFaixa = grupos.map((g) => `${g.id} ("${g.rotulo}")`).join(", ");

  itens.forEach((item, indice) => {
    const { esteira: ref, mes, ...campos } = item;
    const { patch, erros: errosDoPatch } = validarPatch(campos);
    for (const erro of errosDoPatch) erros.push({ indice, erro });

    let esteiraId: string | null = null;
    let faixa: Grupo;
    let nome: string;

    if (ref.id) {
      const e = esteiras.find((x) => x.id === ref.id);
      if (!e) {
        erros.push({ indice, erro: `esteira ${ref.id} não existe nesta empresa.` });
        return;
      }
      esteiraId = e.id;
      faixa = e.grupo as Grupo;
      nome = e.nome;
    } else if (ref.faixa && ref.nome?.trim()) {
      const f = resolverFaixa(ref.faixa, grupos);
      if (!f) {
        erros.push({ indice, erro: `faixa "${ref.faixa}" não existe. Opções: ${opcoesDeFaixa}.` });
        return;
      }
      faixa = f;
      nome = ref.nome.trim();
      const e = esteiras.find((x) => x.grupo === f && chaveDeTexto(x.nome) === chaveDeTexto(nome));
      if (e) {
        esteiraId = e.id;
        nome = e.nome;
      } else if (ref.criarSeNaoExistir) {
        novas.set(`${f}|${chaveDeTexto(nome)}`, { faixa: f, nome });
      } else {
        const irmas = esteiras.filter((x) => x.grupo === f).map((x) => `"${x.nome}"`);
        erros.push({
          indice,
          erro:
            `esteira "${nome}" não existe na faixa ${f}. ` +
            `Existem: ${irmas.join(", ") || "nenhuma"}. Para criar, mande criarSeNaoExistir: true.`,
        });
        return;
      }
    } else {
      erros.push({ indice, erro: "informe esteira.id, ou esteira.faixa + esteira.nome." });
      return;
    }

    const chave = `${esteiraId ?? `nova:${faixa}|${chaveDeTexto(nome)}`}:${mes}`;
    const anterior = plano.get(chave);
    const antes = anterior?.antes ?? (esteiraId ? celulas.get(`${esteiraId}:${mes}`) : undefined) ?? { ...VAZIA };
    const depois = aplicarPatch(anterior?.depois ?? antes, patch);
    plano.set(chave, { esteiraId, faixa, esteira: nome, mes, antes, depois });
  });

  return { erros, novas: [...novas.values()], mudancas: [...plano.values()] };
}
