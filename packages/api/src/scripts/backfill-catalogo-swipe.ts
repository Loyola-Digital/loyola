/**
 * Cataloga com IA as referências que entraram sem catalogação.
 *
 * ## Por que este passivo existe
 *
 * A subida em lote grava sem analisar. Foi decisão de projeto — sessenta
 * arquivos analisados em série levariam vinte minutos com a tela aberta — mas
 * o resultado é uma coleção inteira sem tag, marca ou nicho: invisível para os
 * filtros e para a busca, que é o que faz a biblioteca valer.
 *
 * ## O que dá e o que não dá para catalogar
 *
 * | Tipo | Como | Cobertura |
 * |------|------|-----------|
 * | documento | o modelo lê o texto (`textoDoDocumento`) | total |
 * | página HTML | o modelo lê o texto da página | total |
 * | imagem, PDF | o modelo vê o arquivo | total |
 * | vídeo | **não dá** — ninguém assiste o vídeo | nenhuma |
 *
 * Vídeo fica de fora de propósito. Inventar tags a partir do nome do arquivo
 * encheria a busca de palpites que PARECEM catalogação — e uma tag errada é
 * pior que tag nenhuma, porque some da busca certa e aparece na errada. O
 * caminho para vídeo é a transcrição: suba o `.txt` e ele entra como documento.
 *
 * ## Só preenche o que está vazio
 *
 * Campo já preenchido é decisão de alguém, e o modelo não tem por que
 * discordar. Rodar duas vezes não desfaz trabalho manual.
 *
 * ## Uso
 *
 *   pnpm --filter @loyola-x/api exec tsx src/scripts/backfill-catalogo-swipe.ts --dry
 *   pnpm --filter @loyola-x/api exec tsx src/scripts/backfill-catalogo-swipe.ts --limite=10
 *   pnpm --filter @loyola-x/api exec tsx src/scripts/backfill-catalogo-swipe.ts
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import pg from "pg";
import { swipeFiles } from "../db/schema.js";
import type { VocabularioDoAcervo } from "../services/swipe-analise.js";
import {
  aprenderVocabulario,
  camposDaSugestao,
  catalogarItem,
  MAX_BYTES_DE_ANALISE,
  podeCatalogar,
  VOCAB_MAX,
} from "../services/swipe-catalogo.js";

/** Pausa entre itens: a conta tem limite por minuto, e o backfill não tem pressa. */
const PAUSA_MS = 1_000;

const args = process.argv.slice(2);
const ehSeco = args.includes("--dry");
const limite = Number(
  args.find((a) => a.startsWith("--limite="))?.split("=")[1] ?? 0,
);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  /**
   * Sem catalogação NENHUMA — nem tag, nem marca, nem nicho, nem plataforma,
   * nem formato. Item com um campo só preenchido já teve alguém olhando.
   */
  const semCatalogo = and(
    isNotNull(swipeFiles.fileUrl),
    or(
      sql`${swipeFiles.tags} is null`,
      sql`jsonb_array_length(${swipeFiles.tags}) = 0`,
    ),
    sql`${swipeFiles.brand} is null`,
    sql`${swipeFiles.niche} is null`,
    sql`${swipeFiles.platform} is null`,
    sql`${swipeFiles.format} is null`,
  );

  /**
   * O que o acervo já usa, para o modelo reaproveitar a grafia.
   *
   * Medido antes de existir: catalogando três anúncios do MESMO anunciante, a
   * marca saiu "Gabriel Navarro" em dois e "Navarro" no terceiro. Gravar 67
   * itens assim criaria a fragmentação em massa, e desfazer depois é trabalho
   * manual item a item.
   *
   * Sai do que já está catalogado — por ordem de uso, para o que é comum ter
   * mais peso que o que apareceu uma vez.
   */
  const vocabulario: VocabularioDoAcervo =
    await (async (): Promise<VocabularioDoAcervo> => {
      const porUso = async (coluna: string) =>
        (
          await pool.query<{ v: string }>(
            `select ${coluna} v, count(*) n from swipe_files
           where ${coluna} is not null and ${coluna} <> ''
           group by 1 order by n desc limit ${VOCAB_MAX}`,
          )
        ).rows.map((r) => r.v);
      const tags = (
        await pool.query<{ v: string }>(
          `select t v, count(*) n from swipe_files, jsonb_array_elements_text(tags) t
         group by 1 order by n desc limit ${VOCAB_MAX}`,
        )
      ).rows.map((r) => r.v);
      return {
        marcas: await porUso("brand"),
        nichos: await porUso("niche"),
        tags,
      };
    })();

  console.log(
    `Vocabulário do acervo: ${vocabulario.marcas?.length ?? 0} marcas, ` +
      `${vocabulario.nichos?.length ?? 0} nichos, ${vocabulario.tags?.length ?? 0} tags`,
  );

  const todos = await db
    .select({
      id: swipeFiles.id,
      title: swipeFiles.title,
      assetKind: swipeFiles.assetKind,
      fileUrl: swipeFiles.fileUrl,
      fileMime: swipeFiles.fileMime,
      sourceUrl: swipeFiles.sourceUrl,
    })
    .from(swipeFiles)
    .where(semCatalogo);

  // Vídeo sai aqui, não na query: contá-lo e dizer quantos ficaram é o que
  // impede alguém de rodar de novo achando que faltou algo.
  const videos = todos.filter((f) => f.assetKind === "video");
  const alvos = todos.filter((f) => f.assetKind !== "video");
  const fila = limite > 0 ? alvos.slice(0, limite) : alvos;

  console.log(`Sem catalogação: ${todos.length}`);
  console.log(`  analisáveis: ${alvos.length}`);
  console.log(
    `  vídeos (fora de propósito — suba a transcrição): ${videos.length}`,
  );
  if (limite > 0) console.log(`  desta rodada: ${fila.length}`);
  if (ehSeco) console.log("\n--dry: nada será gravado.\n");

  let ok = 0;
  const falhas: { titulo: string; motivo: string }[] = [];

  for (const [i, f] of fila.entries()) {
    const prefixo = `[${i + 1}/${fila.length}] ${f.title.slice(0, 50)}`;
    try {
      if (!podeCatalogar(f)) {
        falhas.push({
          titulo: f.title,
          motivo: `tipo não analisável (${f.fileMime || "sem mime"})`,
        });
        continue;
      }

      const r = await fetch(f.fileUrl!);
      if (!r.ok) {
        falhas.push({ titulo: f.title, motivo: `download ${r.status}` });
        continue;
      }
      const buffer = Buffer.from(await r.arrayBuffer());
      if (buffer.length > MAX_BYTES_DE_ANALISE) {
        falhas.push({
          titulo: f.title,
          motivo: "maior que o teto da Anthropic (32 MB)",
        });
        continue;
      }

      const sugestao = await catalogarItem(claude, f, buffer, vocabulario);

      const resumo = [
        sugestao.marca && `marca=${sugestao.marca}`,
        sugestao.nicho && `nicho=${sugestao.nicho}`,
        sugestao.formato && `formato=${sugestao.formato}`,
        sugestao.tags.length ? `${sugestao.tags.length} tags` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      console.log(`${prefixo} → ${resumo || "nada sugerido"}`);

      if (!ehSeco) {
        await db
          .update(swipeFiles)
          .set(camposDaSugestao(sugestao))
          .where(eq(swipeFiles.id, f.id));
      }
      aprenderVocabulario(vocabulario, sugestao);
      ok++;
      await espera(PAUSA_MS);
    } catch (e) {
      falhas.push({
        titulo: f.title,
        motivo: e instanceof Error ? e.message : "falhou",
      });
    }
  }

  console.log(
    `\n${ehSeco ? "Analisados (nada gravado)" : "Catalogados"}: ${ok}/${fila.length}`,
  );
  if (falhas.length) {
    console.log(`Falhas: ${falhas.length}`);
    for (const f of falhas.slice(0, 20))
      console.log(`  - ${f.titulo.slice(0, 50)}: ${f.motivo}`);
  }
  if (videos.length) {
    console.log(
      `\n${videos.length} vídeos continuam sem catalogação. A IA não assiste vídeo —` +
        ` suba a transcrição (.txt/.docx) e ela entra como documento.`,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
