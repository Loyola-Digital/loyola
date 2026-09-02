/**
 * Busca o preview (Open Graph) das referências que entraram sem ele.
 *
 * A importação do ClickUp gravava direto, sem passar pela busca de preview que
 * o cadastro pela tela já fazia. O resultado é um card de link sem miniatura —
 * um retângulo de texto no meio de uma grade de imagens, e metade do acervo
 * importado é link.
 *
 * ## Nem todo site entrega
 *
 * Instagram e Facebook devolvem OG só para quem está logado; página fora do ar
 * não devolve nada. O script relata a taxa em vez de fingir que resolveu tudo —
 * saber que 30% não têm preview e por quê vale mais que um "pronto".
 *
 * Uso: node --import tsx src/scripts/backfill-swipe-preview.ts [--aplicar]
 */
import "dotenv/config";
import pg from "pg";
import { fetchLinkPreview } from "../services/link-preview.js";

interface Linha {
  id: string;
  title: string;
  source_url: string;
  asset_kind: string;
}

function dominio(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "?";
  }
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows } = await c.query<Linha>(`
    select id, title, source_url, asset_kind
    from swipe_files
    where source_url is not null and og_fetched_at is null
    order by asset_kind, created_at`);

  console.log(`${rows.length} referência(s) sem preview buscado\n`);

  let comImagem = 0;
  let semImagem = 0;
  let falhou = 0;
  const porDominio = new Map<string, { ok: number; nao: number }>();

  for (const r of rows) {
    const d = dominio(r.source_url);
    const acc = porDominio.get(d) ?? { ok: 0, nao: 0 };
    try {
      const og = await fetchLinkPreview(r.source_url);
      if (og.image) {
        comImagem++;
        acc.ok++;
      } else {
        semImagem++;
        acc.nao++;
      }
      porDominio.set(d, acc);

      if (aplicar) {
        await c.query(
          `update swipe_files
             set og_title = $1, og_description = $2, og_image = $3, og_site_name = $4,
                 og_fetched_at = now(), updated_at = now()
           where id = $5`,
          [og.title, og.description, og.image, og.siteName, r.id],
        );
      }
    } catch (e) {
      falhou++;
      acc.nao++;
      porDominio.set(d, acc);
      // `og_fetched_at` fica nulo: uma próxima rodada tenta de novo. O site
      // pode estar fora do ar hoje e responder amanhã.
      console.log(`  falhou  ${r.title.slice(0, 50)}  (${d}) — ${e instanceof Error ? e.message : ""}`);
    }
  }

  console.log(`\ncom imagem de preview: ${comImagem}`);
  console.log(`respondeu sem imagem:  ${semImagem}`);
  console.log(`não respondeu: ....... ${falhou}`);

  const ruins = [...porDominio].filter(([, v]) => v.nao > 0).sort((a, b) => b[1].nao - a[1].nao);
  if (ruins.length) {
    console.log(`\ndomínios que não deram preview:`);
    for (const [d, v] of ruins.slice(0, 15)) console.log(`  ${String(v.nao).padStart(3)}  ${d}`);
  }

  if (!aplicar) console.log("\n(simulação — rode com --aplicar para gravar)");
  await c.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
