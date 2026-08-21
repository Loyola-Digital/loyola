/**
 * Backfill das miniaturas de criativos.
 *
 *   tsx src/scripts/backfill-creative-thumbnails.ts [--project=Nome]
 *
 * Baixa e guarda a imagem dos criativos que já estão em
 * `meta_ad_creatives_cache`. Só funciona para URLs ainda válidas — as assinadas
 * da Meta expiram, e criativo antigo já vem com link morto. Esses são
 * recuperados sozinhos no próximo sync, que agora guarda a imagem na hora.
 */
import "dotenv/config";
import { Pool } from "pg";

const PARALELO = 5;

function caminhoDaUrl(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).pathname; } catch { return url; }
}

async function main() {
  const alvo = process.argv.find((a) => a.startsWith("--project="))?.split("=")[1];
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: criativos } = await pool.query(
    `select c.project_id, c.ad_id, c.creative->>'thumbnailUrl' as url, p.name as projeto,
            t.source_url as ja_temos
       from meta_ad_creatives_cache c
       join projects p on p.id = c.project_id
       left join meta_creative_thumbnails t
              on t.project_id = c.project_id and t.ad_id = c.ad_id
      where c.creative->>'thumbnailUrl' is not null
        ${alvo ? "and p.name = $1" : ""}
      order by c.last_synced_at desc`,
    alvo ? [alvo] : [],
  );

  const pendentes = criativos.filter((c) => caminhoDaUrl(c.ja_temos) !== caminhoDaUrl(c.url));
  console.log(`${criativos.length} criativos com URL; ${pendentes.length} pendentes\n`);

  let ok = 0, expirados = 0, erros = 0, bytes = 0;
  for (let i = 0; i < pendentes.length; i += PARALELO) {
    await Promise.all(
      pendentes.slice(i, i + PARALELO).map(async (c) => {
        try {
          const res = await fetch(c.url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) { expirados++; return; }
          const tipo = res.headers.get("content-type") ?? "image/jpeg";
          if (!tipo.startsWith("image/")) { expirados++; return; }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length === 0) { expirados++; return; }
          await pool.query(
            `insert into meta_creative_thumbnails (project_id, ad_id, mime_type, byte_size, conteudo, source_url)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (project_id, ad_id) do update
               set mime_type=$3, byte_size=$4, conteudo=$5, source_url=$6, fetched_at=now()`,
            [c.project_id, c.ad_id, tipo, buf.length, buf, c.url],
          );
          ok++; bytes += buf.length;
        } catch { erros++; }
      }),
    );
    process.stdout.write(`\r  ${Math.min(i + PARALELO, pendentes.length)}/${pendentes.length}`);
  }

  console.log(`\n\nguardadas: ${ok}  (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`URL expirada na origem: ${expirados}   erros de rede: ${erros}`);
  const { rows: fim } = await pool.query(
    `select p.name, count(*)::int n, pg_size_pretty(sum(byte_size)::bigint) tam
       from meta_creative_thumbnails t join projects p on p.id=t.project_id group by p.name order by n desc`);
  console.table(fim);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
