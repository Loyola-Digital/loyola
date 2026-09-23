/**
 * Story 47.16 (AC9, decisão 5.4) — registrar em `naming_ads` os 6 anúncios do
 * dg que JÁ ESTÃO NO AR no Meta, nomeados à mão antes do gerador (campanha
 * `dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa`, 21–23/09).
 * Sem o registro, o gerador sugeriria `adv01` ao dg — número já publicado.
 *
 * Três travas do @po (PO-05):
 *  (a) NÃO passa por `montarAnuncio`/POST: eles gerariam o v3, e o nome
 *      publicado é v2 (regra 6). Os 6 nomes são LITERAIS, byte a byte do Meta;
 *      `parseAdName` só CONFERE que cada um é v2 válido com os campos certos.
 *  (b) a prova é o SELECT dos 6 `name` byte a byte (`provarRegistro`), com
 *      `creative_seq` 1–6, `launch_seq` NULL, origem `ia` e hook/body
 *      `h0N`/`b0N` do dg — contagem sozinha não discrimina.
 *  (c) NN 1–6 do dg ocupado por OUTRO nome = PARAR e reportar, sem gravar
 *      nada. Um `ON CONFLICT DO NOTHING` esconderia a colisão e ainda daria
 *      "6 linhas".
 *
 * Idempotente: o NN ocupado pelo MESMO nome conta como já registrado — rodar
 * duas vezes grava 6 e depois 0.
 */

import { parseAdName, primeiroDiaDoMes, SIGLA_SEM_NUMERO, TIPO_DE_VIDEO, type AdSnapshot } from "@loyola-x/shared";
import type { Repositorio } from "./repositorio.js";

export const EXPERT_DOS_ANUNCIOS_NO_AR = "dg";
export const ORIGEM_DOS_ANUNCIOS_NO_AR = "ia";
export const MES_DOS_ANUNCIOS_NO_AR = "09-2026";

export interface AnuncioNoAr {
  creativeSeq: number;
  hook: string;
  body: string;
  /** Literal, como está no Meta: v2, `perpetuo` sem número, sem `--`. */
  name: string;
}

/** Os 6 nomes LITERAIS (levantamento de produção, 2026-09-23). Não são montados — são o que está publicado. */
export const ANUNCIOS_DO_DG_NO_AR: readonly AnuncioNoAr[] = [
  { creativeSeq: 1, hook: "h01", body: "b01", name: "adv01_ia_dg_perpetuo_h01_b01_09-2026" },
  { creativeSeq: 2, hook: "h02", body: "b02", name: "adv02_ia_dg_perpetuo_h02_b02_09-2026" },
  { creativeSeq: 3, hook: "h03", body: "b03", name: "adv03_ia_dg_perpetuo_h03_b03_09-2026" },
  { creativeSeq: 4, hook: "h04", body: "b04", name: "adv04_ia_dg_perpetuo_h04_b04_09-2026" },
  { creativeSeq: 5, hook: "h05", body: "b05", name: "adv05_ia_dg_perpetuo_h05_b05_09-2026" },
  { creativeSeq: 6, hook: "h06", body: "b06", name: "adv06_ia_dg_perpetuo_h06_b06_09-2026" },
];

/** O que já ocupa o NN no expert (só o que a decisão precisa). */
export interface NnOcupado {
  creativeSeq: number;
  name: string;
}

export interface PlanoDoRegistro {
  inserir: AnuncioNoAr[];
  /** NN já ocupado pelo MESMO nome — a segunda rodada. */
  jaRegistrados: AnuncioNoAr[];
  /** NN ocupado por OUTRO nome — PARAR (PO-05c). */
  colisoes: { anuncio: AnuncioNoAr; ocupadoPor: string }[];
}

/** Decide, sem tocar em banco, o que gravar. Comparação byte a byte do `name`. */
export function planejarRegistro(ocupados: readonly NnOcupado[], alvo: readonly AnuncioNoAr[] = ANUNCIOS_DO_DG_NO_AR): PlanoDoRegistro {
  const plano: PlanoDoRegistro = { inserir: [], jaRegistrados: [], colisoes: [] };
  for (const a of alvo) {
    const dono = ocupados.find((o) => o.creativeSeq === a.creativeSeq);
    if (!dono) plano.inserir.push(a);
    else if (dono.name === a.name) plano.jaRegistrados.push(a);
    else plano.colisoes.push({ anuncio: a, ocupadoPor: dono.name });
  }
  return plano;
}

/**
 * Confere cada nome literal com o parse de produção: v2 válido (com o aviso
 * próprio do v2, sem erro), expert/sigla/origem/hook/body/data/NN esperados e
 * `perpetuo` sem número. Devolve os problemas — vazio = pode seguir.
 */
export function conferirNomes(snapshot: AdSnapshot, alvo: readonly AnuncioNoAr[] = ANUNCIOS_DO_DG_NO_AR): string[] {
  const problemas: string[] = [];
  for (const a of alvo) {
    const r = parseAdName(a.name, snapshot);
    if (!r.valid) {
      problemas.push(`${a.name}: inválido — ${r.errors.join("; ")}`);
      continue;
    }
    const f = r.fields!;
    const esperado = {
      formato: "v2",
      creativeType: TIPO_DE_VIDEO,
      creativeSeq: a.creativeSeq,
      origin: ORIGEM_DOS_ANUNCIOS_NO_AR,
      expert: EXPERT_DOS_ANUNCIOS_NO_AR,
      launchType: SIGLA_SEM_NUMERO,
      launchSeq: undefined,
      hookCode: a.hook,
      bodyCode: a.body,
      date: MES_DOS_ANUNCIOS_NO_AR,
      description: undefined,
    } as const;
    const lido = { formato: r.formato, creativeType: f.creativeType, creativeSeq: f.creativeSeq, origin: f.origin, expert: f.expert, launchType: f.launchType, launchSeq: f.launchSeq ?? undefined, hookCode: f.hookCode, bodyCode: f.bodyCode, date: f.date, description: f.description };
    for (const k of Object.keys(esperado) as (keyof typeof esperado)[]) {
      if (lido[k] !== esperado[k]) problemas.push(`${a.name}: ${k} lido "${String(lido[k])}", esperado "${String(esperado[k])}"`);
    }
  }
  return problemas;
}

/** Uma linha de `naming_ads` do dg, com os códigos de hook/body já resolvidos — o que o SELECT de prova devolve. */
export interface LinhaDeProva {
  creativeSeq: number;
  name: string;
  structure: string;
  launchType: string;
  launchSeq: number | null;
  origin: string | null;
  hookCode: string | null;
  bodyCode: string | null;
}

/** PO-05b — compara as linhas gravadas com os 6 literais, byte a byte. Vazio = provado. */
export function provarRegistro(linhas: readonly LinhaDeProva[], alvo: readonly AnuncioNoAr[] = ANUNCIOS_DO_DG_NO_AR): string[] {
  const divergencias: string[] = [];
  const doAlvo = linhas.filter((l) => alvo.some((a) => a.creativeSeq === l.creativeSeq));
  if (doAlvo.length !== alvo.length) divergencias.push(`esperadas ${alvo.length} linhas com NN ${alvo.map((a) => a.creativeSeq).join(",")}, encontradas ${doAlvo.length}`);
  for (const a of alvo) {
    const l = doAlvo.find((x) => x.creativeSeq === a.creativeSeq);
    if (!l) {
      divergencias.push(`NN ${a.creativeSeq}: ausente`);
      continue;
    }
    const conferir: [string, unknown, unknown][] = [
      ["name", l.name, a.name],
      ["structure", l.structure, a.name + "--"],
      ["launch_type", l.launchType, SIGLA_SEM_NUMERO],
      ["launch_seq", l.launchSeq, null],
      ["origin", l.origin, ORIGEM_DOS_ANUNCIOS_NO_AR],
      ["hook", l.hookCode, a.hook],
      ["body", l.bodyCode, a.body],
    ];
    for (const [campo, lido, esperado] of conferir) {
      if (lido !== esperado) divergencias.push(`NN ${a.creativeSeq} ${campo}: lido ${JSON.stringify(lido)}, esperado ${JSON.stringify(esperado)}`);
    }
  }
  return divergencias;
}

export class ErroDoRegistro extends Error {}

export interface ResultadoDoRegistro {
  plano: PlanoDoRegistro;
  aplicado: boolean;
  inseridos: { id: string; name: string }[];
}

type Porta = Pick<Repositorio, "experts" | "dicionario" | "adPartes" | "anuncios" | "snapshotDeAnuncios" | "inserir">;

/**
 * Executa o registro. `aplicar: false` só planeja (nada é gravado). Chamar
 * DENTRO de uma transação: qualquer `ErroDoRegistro` antes do primeiro INSERT
 * não grava nada; depois dele, o rollback da transação desfaz.
 */
export async function registrarAnunciosNoAr(r: Porta, opts: { aplicar: boolean; alvo?: readonly AnuncioNoAr[] }): Promise<ResultadoDoRegistro> {
  const alvo = opts.alvo ?? ANUNCIOS_DO_DG_NO_AR;
  const expert = await r.experts.porCode(EXPERT_DOS_ANUNCIOS_NO_AR);
  if (!expert) throw new ErroDoRegistro(`expert "${EXPERT_DOS_ANUNCIOS_NO_AR}" não está cadastrado`);

  const [tipo, sigla, origem] = await Promise.all([
    r.dicionario.porValor("creative_type", TIPO_DE_VIDEO),
    r.dicionario.porValor("launch_type", SIGLA_SEM_NUMERO),
    r.dicionario.porValor("creative_origin", ORIGEM_DOS_ANUNCIOS_NO_AR),
  ]);
  const faltam = [!tipo && `creative_type ${TIPO_DE_VIDEO}`, !sigla && `launch_type ${SIGLA_SEM_NUMERO}`, !origem && `creative_origin ${ORIGEM_DOS_ANUNCIOS_NO_AR}`].filter(Boolean);
  if (faltam.length) throw new ErroDoRegistro(`faltam no dicionário: ${faltam.join(", ")}`);

  const problemas = conferirNomes(await r.snapshotDeAnuncios(true), alvo);
  if (problemas.length) throw new ErroDoRegistro(`os nomes não conferem com o parse:\n  ${problemas.join("\n  ")}`);

  const partes = await Promise.all(
    alvo.map(async (a) => ({ a, hook: await r.adPartes.porCode(expert.id, "hook", a.hook), body: await r.adPartes.porCode(expert.id, "body", a.body) })),
  );
  const semParte = partes.flatMap((p) => [!p.hook && `${p.a.hook} (hook)`, !p.body && `${p.a.body} (body)`].filter(Boolean));
  if (semParte.length) throw new ErroDoRegistro(`hook/body não cadastrados para ${expert.code}: ${semParte.join(", ")}`);

  const ocupados: NnOcupado[] = [];
  for (const a of alvo) {
    const dono = await r.anuncios.porSeq(expert.id, a.creativeSeq);
    if (dono) ocupados.push({ creativeSeq: dono.creativeSeq, name: dono.name });
  }
  const plano = planejarRegistro(ocupados, alvo);
  if (plano.colisoes.length) {
    throw new ErroDoRegistro(`NN já ocupado por OUTRO nome no ${expert.code} — nada foi gravado (PO-05c):\n  ${plano.colisoes.map((c) => `${c.anuncio.name} × ${c.ocupadoPor}`).join("\n  ")}`);
  }
  if (!opts.aplicar) return { plano, aplicado: false, inseridos: [] };

  const adDate = primeiroDiaDoMes(MES_DOS_ANUNCIOS_NO_AR)!;
  const inseridos: { id: string; name: string }[] = [];
  for (const a of plano.inserir) {
    const p = partes.find((x) => x.a.creativeSeq === a.creativeSeq)!;
    const linha = await r.inserir(
      "anuncios",
      {
        expertId: expert.id,
        creativeType: TIPO_DE_VIDEO,
        creativeSeq: a.creativeSeq,
        launchType: SIGLA_SEM_NUMERO,
        launchSeq: null,
        origin: ORIGEM_DOS_ANUNCIOS_NO_AR,
        hookId: p.hook!.id,
        bodyId: p.body!.id,
        adDate,
        description: null,
        // AC4 (opção B): o nome do Meta, sem `--`; a estrutura do designer, com.
        structure: a.name + "--",
        name: a.name,
        notes: "Story 47.16 (AC9): registrado do Meta — nomeado à mão e no ar antes do gerador.",
        createdBy: null,
      },
      null,
    );
    inseridos.push({ id: linha.id, name: linha.name });
  }
  return { plano, aplicado: true, inseridos };
}
