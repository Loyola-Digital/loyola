/**
 * Story 42.18 — Novos → Trial e Novos → Iniciou POR PLANO, dentro de cada um
 * dos 8 canais da Jornada (42.11), na MESMA coorte e na MESMA janela.
 *
 * O usuário novo não tem produto antes de iniciar: o denominador é o canal
 * (os novos dele), e o plano só reparte o numerador. Por isso, num canal, a
 * soma das linhas é o "iniciou" / "iniciou teste" da Jornada (AC4c).
 *
 * Três peças, cada uma provada onde vive:
 *  1. `produtoDoUsuario` — a regra do produto (AC2a) em TypeScript: o
 *     `product_id` do PRIMEIRO evento que conta como "iniciou" (ou "iniciou
 *     teste"), no tempo (`event_at`). Empate no mesmo instante: o evento COM
 *     produto vence o sem; entre dois produtos, a ordem de bytes do id (a
 *     ordem `COLLATE "C"` do Postgres). É a fonte do SQL; a equivalência é
 *     provada no PGlite.
 *  2. `COLUNAS_DO_PRODUTO` + `consultaDaJornadaPorProduto` — o mesmo, no SQL,
 *     como colunas a mais na redução por usuário da Jornada (AC3d). A classe
 *     sai de `classeDoProdutoNoSql` (42.14), sem uma segunda regra (AC2c).
 *  3. `montarPorProduto` — a contagem por canal × linha.
 *
 * Fica num arquivo à parte porque `pagantes-lyrio.ts` já importa de
 * `jornada-lyrio.ts`: pôr `classeDoProdutoNoSql` dentro da Jornada fecharia
 * um ciclo de módulos.
 *
 * Só contagens e `product_id` (identificador do produto, não da pessoa) saem
 * daqui — nunca `app_user_id`.
 */

import { sql, type SQL } from "drizzle-orm";
import { revenuecatSales } from "../db/schema.js";
import { CANAIS_DA_JORNADA, canalDoUsuario, consultaDaJornada, type CanalDaJornada, type SinaisDoUsuario } from "./jornada-lyrio.js";
import { REGRA_DOS_PLANOS, classeDoProdutoNoSql, type ClasseDoProduto, type PlanoDoLtv } from "./pagantes-lyrio.js";

const c = revenuecatSales;

// ─────────────────────────── as linhas (D18) ───────────────────────────

export type LinhaDoPorProduto = PlanoDoLtv | "outros" | "sem_produto";

const ROTULO_DO_PLANO: Record<PlanoDoLtv, string> = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

/**
 * D18 — os planos na ordem da classificação da 42.14 (`REGRA_DOS_PLANOS`),
 * mais "Outros" (`fora` + `nao_classificado`, PO-01) e "Sem produto" (iniciou,
 * mas o evento não trouxe `product_id`).
 */
export const LINHAS_DO_POR_PRODUTO: readonly { linha: LinhaDoPorProduto; rotulo: string }[] = [
  ...REGRA_DOS_PLANOS.map((r) => ({ linha: r.plano, rotulo: ROTULO_DO_PLANO[r.plano] })),
  { linha: "outros", rotulo: "Outros" },
  { linha: "sem_produto", rotulo: "Sem produto" },
];

/** AC2b — a classe da 42.14 vira linha: `fora` e `nao_classificado` juntos em "Outros"; sem id = "Sem produto". */
export function linhaDoProduto(productId: string | null, classe: ClasseDoProduto | null): LinhaDoPorProduto {
  if (productId == null) return "sem_produto";
  if (classe == null || classe === "fora" || classe === "nao_classificado") return "outros";
  return classe;
}

// ─────────────────────────── 1. a regra (pura) ───────────────────────────

export type MedidaDoInicio = "iniciou" | "teste";

export interface EventoDoUsuario {
  eventType: string | null;
  /** `payload.event.period_type` — não é coluna (PO-01 da 42.11). */
  periodType: string | null;
  eventAt: Date | null;
  productId: string | null;
}

/** As regras da Jornada (`COLUNAS_DA_JORNADA.iniciou` / `.iniciou_teste`), evento a evento. */
export function contaComoInicio(e: Pick<EventoDoUsuario, "eventType" | "periodType">, medida: MedidaDoInicio): boolean {
  if (medida === "teste") return e.eventType === "INITIAL_PURCHASE" && e.periodType === "TRIAL";
  return e.eventType === "INITIAL_PURCHASE" || e.eventType === "NON_RENEWING_PURCHASE";
}

/** A ordem do primeiro início: o instante (sem instante, por último), depois com produto antes de sem, depois os bytes do id. */
function antes(a: EventoDoUsuario, b: EventoDoUsuario): number {
  const ta = a.eventAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const tb = b.eventAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.productId === b.productId) return 0;
  if (a.productId == null) return 1;
  if (b.productId == null) return -1;
  return Buffer.compare(Buffer.from(a.productId, "utf8"), Buffer.from(b.productId, "utf8"));
}

/**
 * AC2a — o produto do usuário para a medida: `undefined` = ele não iniciou;
 * `null` = iniciou, mas o primeiro evento veio sem `product_id`.
 */
export function produtoDoUsuario(eventos: readonly EventoDoUsuario[], medida: MedidaDoInicio): string | null | undefined {
  const inicios = eventos.filter((e) => contaComoInicio(e, medida));
  if (inicios.length === 0) return undefined;
  return [...inicios].sort(antes)[0]!.productId;
}

// ─────────────────────────── 2. o SQL ───────────────────────────

const INICIOU = sql`${c.eventType} IN ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')`;
const INICIOU_TESTE = sql`${c.eventType} = 'INITIAL_PURCHASE' AND ${c.payload}->'event'->>'period_type' = 'TRIAL'`;

/**
 * A chave que ordena os eventos como `antes()`, em texto comparado byte a byte
 * (`COLLATE "C"`): o instante em microssegundos com 20 dígitos (sem instante =
 * o maior, por último), depois `0` + o id (com produto) ou `1` (sem produto —
 * `1` > `0`, então o evento com produto vence o empate). O id inteiro vem no
 * fim, então dois ids no mesmo instante se ordenam pelos bytes, como no TS.
 *
 * Por que não `(array_agg(product_id ORDER BY …))[1]`: agregado com ORDER BY
 * não tem agregação parcial, e o Postgres deixou de agregar nos workers — em
 * produção (90 dias, EXPLAIN ANALYZE de 2026-10-27) a consulta foi de 1,47 s
 * para 3,83 s. `min` sobre texto combina em paralelo: 1,81 s no EXPLAIN, e
 * 1,5–1,7 s medidos do cliente contra 1,5–1,8 s da consulta da `main`
 * (Dev Agent Record da 42.18, AC3d).
 *
 * Limites declarados (QA REL-001), os dois fora do dado gravado — o ingestor
 * (`event_timestamp_ms`) e o backfill gravam `event_at` em milissegundos, com
 * os microssegundos sempre 000:
 *  - dois inícios no MESMO milissegundo com microssegundos diferentes: o banco
 *    ordena pelo µs e o TS (`Date`, em ms) os empata e decide pelo id;
 *  - dois instantes ANTES de 1970 com o mesmo número de dígitos no epoch
 *    negativo: em texto, `-1000000` < `-2000000`, e o mais tarde vence.
 * Um instante antes de 1970 contra um depois de 1970 ordena certo (o `-` vem
 * antes dos dígitos), e dois antes de 1970 com tamanhos diferentes também.
 */
const chaveDoInicio = sql`lpad(coalesce((extract(epoch from ${c.eventAt}) * 1000000)::bigint::text, '99999999999999999999'), 20, '0') || CASE WHEN ${c.productId} IS NULL THEN '1' ELSE '0' || ${c.productId} END`;

/** A menor chave entre os eventos que casam — o primeiro início do usuário. Os parênteses deixam o `COLLATE` sobre a chave inteira (QA MNT-001). */
const primeiraChave = (cond: SQL) => sql`min((${chaveDoInicio}) COLLATE "C") FILTER (WHERE ${cond})`;

/** AC3d — as colunas a mais na redução por usuário da Jornada. */
export const COLUNAS_DO_PRODUTO = {
  chave_iniciou: primeiraChave(INICIOU),
  chave_teste: primeiraChave(INICIOU_TESTE),
} as const;

/** O id de volta da chave: depois dos 20 dígitos, `0` + id, ou `1` (sem produto); sem chave (não iniciou), nulo. */
const produtoDaChave = (chave: SQL) => sql`CASE WHEN substr(${chave}, 21, 1) = '0' THEN substr(${chave}, 22) ELSE NULL END`;

/** A classe só quando há id: sem id é "Sem produto", e não o `nao_classificado` que `classeDoProdutoNoSql` daria ao nulo. */
const classeDe = (coluna: SQL) => sql`CASE WHEN ${coluna} IS NULL THEN NULL ELSE ${classeDoProdutoNoSql(coluna)} END`;

/**
 * Uma linha por usuário da coorte: as colunas da Jornada, o produto do
 * primeiro "iniciou" e do primeiro "iniciou teste", e a classe de cada um.
 * Uma consulta só, sem o id (AC3c/d): o `app_user_id` só agrupa, lá dentro.
 */
export function consultaDaJornadaPorProduto(stageId: string, desde: Date): SQL {
  const j = sql.identifier("j");
  const k = sql.identifier("k");
  const comProduto = sql`SELECT ${j}.*, ${produtoDaChave(sql`${j}."chave_iniciou"`)} AS "produto_iniciou", ${produtoDaChave(sql`${j}."chave_teste"`)} AS "produto_teste" FROM (${consultaDaJornada(stageId, desde, COLUNAS_DO_PRODUTO)}) ${j}`;
  return sql`SELECT ${k}.*, ${classeDe(sql`${k}."produto_iniciou"`)} AS "classe_iniciou", ${classeDe(sql`${k}."produto_teste"`)} AS "classe_teste" FROM (${comProduto}) ${k}`;
}

export interface ProdutoDoUsuario {
  produtoIniciou: string | null;
  classeIniciou: ClasseDoProduto | null;
  produtoTeste: string | null;
  classeTeste: ClasseDoProduto | null;
}

const CLASSES: readonly string[] = [...REGRA_DOS_PLANOS.map((r) => r.plano), "fora", "nao_classificado"];

export function lerProdutoDaJornada(r: Record<string, unknown>): ProdutoDoUsuario {
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  const classe = (v: unknown) => (typeof v === "string" && CLASSES.includes(v) ? (v as ClasseDoProduto) : null);
  return {
    produtoIniciou: texto(r.produto_iniciou),
    classeIniciou: classe(r.classe_iniciou),
    produtoTeste: texto(r.produto_teste),
    classeTeste: classe(r.classe_teste),
  };
}

// ─────────────────────────── 3. a montagem ───────────────────────────

export interface CelulaDoPorProduto {
  iniciou: number;
  iniciouTeste: number;
}

export interface ProdutoDaLinha extends CelulaDoPorProduto {
  productId: string;
}

export interface LinhaPorProduto {
  linha: LinhaDoPorProduto;
  rotulo: string;
  canais: (CelulaDoPorProduto & { canal: CanalDaJornada })[];
  /** O balde de conflito da Jornada (D7 da 42.12): fora dos canais, dentro do Total. */
  conflito: CelulaDoPorProduto;
  total: CelulaDoPorProduto;
  /** AC2b (PO-01) — os `product_id` que caíram na linha, para a dica. "Sem produto" não tem nenhum. */
  produtos: ProdutoDaLinha[];
}

export interface PorProdutoDaJornada {
  /** O denominador: os novos de cada canal, na ordem da Jornada. */
  canais: { canal: CanalDaJornada; rotulo: string; novos: number }[];
  conflito: { novos: number };
  total: { novos: number };
  linhas: LinhaPorProduto[];
}

const celula = (): CelulaDoPorProduto => ({ iniciou: 0, iniciouTeste: 0 });

/**
 * AC3a — a contagem por canal × linha, com a coorte e o canal da Jornada
 * (`montarJornada`/`canalDoUsuario`): entra quem teve o primeiro evento na
 * janela, cada usuário num canal só (ou no conflito). As 6 linhas e os 8
 * canais saem sempre, na ordem, mesmo zerados.
 */
export function montarPorProduto(usuarios: readonly (SinaisDoUsuario & ProdutoDoUsuario)[], desde: Date): PorProdutoDaJornada {
  const novos = new Map<CanalDaJornada, number>(CANAIS_DA_JORNADA.map((x) => [x.canal, 0]));
  let novosConflito = 0;
  let novosTotal = 0;
  const linhas = new Map(
    LINHAS_DO_POR_PRODUTO.map(({ linha }) => [
      linha,
      { porCanal: new Map<CanalDaJornada, CelulaDoPorProduto>(CANAIS_DA_JORNADA.map((x) => [x.canal, celula()])), conflito: celula(), total: celula(), produtos: new Map<string, CelulaDoPorProduto>() },
    ]),
  );
  const contar = (canal: CanalDaJornada | "conflito", productId: string | null, classe: ClasseDoProduto | null, campo: keyof CelulaDoPorProduto) => {
    const l = linhas.get(linhaDoProduto(productId, classe))!;
    (canal === "conflito" ? l.conflito : l.porCanal.get(canal)!)[campo] += 1;
    l.total[campo] += 1;
    if (productId != null) {
      const p = l.produtos.get(productId) ?? celula();
      p[campo] += 1;
      l.produtos.set(productId, p);
    }
  };
  for (const u of usuarios) {
    if (!u.primeiroEvento || u.primeiroEvento.getTime() < desde.getTime()) continue;
    const canal = canalDoUsuario(u);
    if (canal === "conflito") novosConflito += 1;
    else novos.set(canal, novos.get(canal)! + 1);
    novosTotal += 1;
    if (u.iniciou) contar(canal, u.produtoIniciou, u.classeIniciou, "iniciou");
    if (u.iniciouTeste) contar(canal, u.produtoTeste, u.classeTeste, "iniciouTeste");
  }
  return {
    canais: CANAIS_DA_JORNADA.map(({ canal, rotulo }) => ({ canal, rotulo, novos: novos.get(canal)! })),
    conflito: { novos: novosConflito },
    total: { novos: novosTotal },
    linhas: LINHAS_DO_POR_PRODUTO.map(({ linha, rotulo }) => {
      const l = linhas.get(linha)!;
      return {
        linha,
        rotulo,
        canais: CANAIS_DA_JORNADA.map(({ canal }) => ({ canal, ...l.porCanal.get(canal)! })),
        conflito: l.conflito,
        total: l.total,
        produtos: [...l.produtos.entries()]
          .map(([productId, n]) => ({ productId, ...n }))
          .sort((a, b) => b.iniciou - a.iniciou || b.iniciouTeste - a.iniciouTeste || Buffer.compare(Buffer.from(a.productId), Buffer.from(b.productId))),
      };
    }),
  };
}
