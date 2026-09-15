/**
 * Story 47.10 — montar um anúncio a partir do que o gerador manda.
 *
 * O cliente manda expert (id), tipo de criativo e sigla (VALORES do
 * dicionário), NN do criativo (opcional — o servidor sugere), NN do
 * lançamento, mês/ano `mm-aaaa` e descrição opcional. O servidor:
 *
 * 1. exige expert ativo; tipo e sigla existentes E ativos no dicionário
 *    (regra 8 — valor desativado não entra em nome novo);
 * 2. resolve o NN do criativo: se veio, tem que estar livre no expert
 *    (contando TODOS os anúncios — regra 4, número não se reaproveita); se
 *    não veio, é o menor livre. O UNIQUE do banco fecha a corrida (D22);
 * 3. normaliza a descrição (`normalizarCodigo`, tipo `anuncio`);
 * 4. monta `{ structure, name }` com `buildAdName` e devolve o que vai para
 *    `naming_ads`, com `ad_date` = primeiro dia do mês.
 */

import { buildAdName, ehVideo, normalizarCodigo, primeiroDiaDoMes, type AdFields } from "@loyola-x/shared";
import { ErroDeNomenclatura } from "./regras.js";
import type { Repositorio } from "./repositorio.js";

export interface EntradaDeAnuncio {
  expertId: string;
  creativeType: string;
  /** Opcional: sem ele o servidor usa o próximo livre do expert. */
  creativeSeq?: number | null;
  launchType: string;
  launchSeq: number;
  /** `mm-aaaa`. */
  date: string;
  description?: string | null;
  /** Story 47.13: só em `adv` — valor de `creative_origin`. */
  origin?: string | null;
  /** Story 47.13: só em `adv` — id em `naming_ad_parts` (type hook) DO expert. */
  hookId?: string | null;
  /** Story 47.13: só em `adv` — id em `naming_ad_parts` (type body) DO expert. */
  bodyId?: string | null;
}

export interface AnuncioMontado {
  expertId: string;
  creativeType: string;
  creativeSeq: number;
  launchType: string;
  launchSeq: number;
  adDate: string;
  description: string | null;
  origin: string | null;
  hookId: string | null;
  bodyId: string | null;
  structure: string;
  name: string;
  fields: AdFields;
}

/**
 * Story 47.13 (AC6): em `adv`, origem/hook/body são obrigatórios e validados —
 * origem no dicionário e ativa; hook/body existem, são do TIPO certo, do MESMO
 * expert e ativos (regra 8). Fora de `adv`, qualquer um dos três é 400.
 * `legado`: vídeo do padrão antigo sendo re-gravado (AC7) — os três ficam null.
 */
async function partesDoVideo(r: Repositorio, e: EntradaDeAnuncio, expert: { id: string; code: string }, legado: boolean) {
  const video = ehVideo(e.creativeType);
  const veio = (v: string | null | undefined) => v !== undefined && v !== null && String(v).trim() !== "";
  if (!video || legado) {
    if (veio(e.origin)) throw new ErroDeNomenclatura(400, `origin: origem só existe no vídeo (adv)${legado ? " novo — vídeo do padrão antigo não migra por edição; duplique para criar no v2" : ""}`, { campo: "origin" });
    if (veio(e.hookId)) throw new ErroDeNomenclatura(400, `hookId: hook só existe no vídeo (adv)${legado ? " novo — vídeo do padrão antigo não migra por edição; duplique para criar no v2" : ""}`, { campo: "hookId" });
    if (veio(e.bodyId)) throw new ErroDeNomenclatura(400, `bodyId: body só existe no vídeo (adv)${legado ? " novo — vídeo do padrão antigo não migra por edição; duplique para criar no v2" : ""}`, { campo: "bodyId" });
    return { origin: null, hookId: null, bodyId: null, codes: {} as { origin?: string; hookCode?: string; bodyCode?: string } };
  }
  if (!veio(e.origin)) throw new ErroDeNomenclatura(422, "origin: obrigatória em vídeo (adv) — ia ou h", { campo: "origin" });
  const origem = await r.dicionario.porValor("creative_origin", e.origin!);
  if (!origem) throw new ErroDeNomenclatura(422, `origin: "${e.origin}" não está no dicionário de origem do vídeo`, { campo: "origin" });
  if (!origem.active) throw new ErroDeNomenclatura(422, `origin: ${origem.value} está inativa (regra 8)`, { campo: "origin" });
  const parte = async (campo: "hookId" | "bodyId", tipo: "hook" | "body") => {
    const id = campo === "hookId" ? e.hookId : e.bodyId;
    if (!veio(id)) throw new ErroDeNomenclatura(422, `${campo}: obrigatório em vídeo (adv) — cadastre em Hooks e bodies`, { campo });
    const p = await r.porId("adPartes", id!);
    if (!p) throw new ErroDeNomenclatura(404, `${campo}: ${tipo} não encontrado`, { campo });
    if (p.type !== tipo) throw new ErroDeNomenclatura(422, `${campo}: ${p.code} é ${p.type}, não ${tipo}`, { campo });
    if (p.expertId !== expert.id) throw new ErroDeNomenclatura(422, `${campo}: ${p.code} não é de ${expert.code} — hook e body são do expert do anúncio`, { campo });
    if (!p.active) throw new ErroDeNomenclatura(422, `${campo}: ${p.code} está inativo (regra 8)`, { campo });
    return p;
  };
  const [hook, body] = await Promise.all([parte("hookId", "hook"), parte("bodyId", "body")]);
  return { origin: origem.value, hookId: hook.id, bodyId: body.id, codes: { origin: origem.value, hookCode: hook.code, bodyCode: body.code } };
}

/** Menor NN livre de 1 a 99 no expert (inclui tudo — não há "inativo" em anúncio). `null` quando os 99 acabaram. */
export function proximoNnDeAnuncio(usados: readonly number[]): number | null {
  const set = new Set(usados);
  for (let n = 1; n <= 99; n++) if (!set.has(n)) return n;
  return null;
}

export async function montarAnuncio(r: Repositorio, e: EntradaDeAnuncio, opts: { ignorarSeqDe?: string; legado?: boolean } = {}): Promise<AnuncioMontado> {
  const expert = await r.porId("experts", e.expertId);
  if (!expert) throw new ErroDeNomenclatura(404, "expertId: expert não encontrado", { campo: "expertId" });
  if (!expert.active) throw new ErroDeNomenclatura(422, `expertId: ${expert.code} está inativo — código desativado não entra em nome novo (regra 8)`, { campo: "expertId" });

  const [tipo, sigla] = await Promise.all([r.dicionario.porValor("creative_type", e.creativeType), r.dicionario.porValor("launch_type", e.launchType)]);
  if (!tipo) throw new ErroDeNomenclatura(422, `creativeType: "${e.creativeType}" não está no dicionário de tipo de criativo`, { campo: "creativeType" });
  if (!tipo.active) throw new ErroDeNomenclatura(422, `creativeType: ${tipo.value} está inativo (regra 8)`, { campo: "creativeType" });
  if (!sigla) throw new ErroDeNomenclatura(422, `launchType: "${e.launchType}" não está no dicionário de sigla de lançamento`, { campo: "launchType" });
  if (!sigla.active) throw new ErroDeNomenclatura(422, `launchType: ${sigla.value} está inativa (regra 8)`, { campo: "launchType" });

  if (!primeiroDiaDoMes(e.date)) throw new ErroDeNomenclatura(400, `date: "${e.date}" não está em mm-aaaa`, { campo: "date" });

  // NN do criativo: sequência única por expert, reservada na gravação.
  const usados = (await r.anuncios.seqsDoExpert(expert.id)).filter((s) => s.id !== opts.ignorarSeqDe).map((s) => s.creativeSeq);
  const sugestao = proximoNnDeAnuncio(usados);
  let creativeSeq: number;
  if (e.creativeSeq === undefined || e.creativeSeq === null) {
    if (sugestao === null) throw new ErroDeNomenclatura(409, `Sequência de criativos esgotada para ${expert.code} (99).`, { campo: "creativeSeq" });
    creativeSeq = sugestao;
  } else {
    creativeSeq = e.creativeSeq;
    if (usados.includes(creativeSeq)) {
      const dono = (await r.anuncios.porSeq(expert.id, creativeSeq))?.name ?? "?";
      throw new ErroDeNomenclatura(409, `O NN ${String(creativeSeq).padStart(2, "0")} já é de ${dono}.${sugestao ? ` O próximo livre é ${String(sugestao).padStart(2, "0")}.` : ""}`, {
        campo: "creativeSeq",
        sugestao: sugestao === null ? null : String(sugestao).padStart(2, "0"),
      });
    }
  }

  let description: string | null = null;
  if (e.description && e.description.trim()) {
    const n = normalizarCodigo(e.description, "anuncio");
    if (!n.ok) throw new ErroDeNomenclatura(400, `description: ${n.motivo}`, { campo: "description", valor: n.valor });
    description = n.valor;
  }

  const partes = await partesDoVideo(r, e, expert, Boolean(opts.legado));
  const fields: AdFields = { creativeType: tipo.value, creativeSeq, ...partes.codes, expert: expert.code, launchType: sigla.value, launchSeq: e.launchSeq, date: e.date, ...(description ? { description } : {}) };
  let montado: { structure: string; name: string };
  try {
    montado = buildAdName(fields, { legado: Boolean(opts.legado) });
  } catch (err) {
    throw new ErroDeNomenclatura(400, (err as Error).message);
  }
  return { expertId: expert.id, creativeType: tipo.value, creativeSeq, launchType: sigla.value, launchSeq: e.launchSeq, adDate: primeiroDiaDoMes(e.date)!, description, origin: partes.origin, hookId: partes.hookId, bodyId: partes.bodyId, ...montado, fields };
}
