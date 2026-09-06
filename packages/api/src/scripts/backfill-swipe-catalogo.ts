/**
 * Cataloga as referências que entraram sem marca, nicho, formato nem tag.
 *
 * ## Quem ficou de fora e por quê
 *
 * A análise da importação só olhava o ARQUIVO, e o modelo lê imagem e PDF.
 * Link não tem arquivo; vídeo ele não lê. Resultado medido no acervo: 82
 * imagens com 80 catalogadas, contra 56 links e 21 vídeos com os cinco campos
 * vazios — existem na biblioteca e não aparecem em nenhum filtro.
 *
 * Aqui a catalogação vem do texto: o Open Graph da página, o endereço e a
 * anotação de quem salvou. Quando o preview tem imagem, ela entra junto.
 *
 * ## Não sobrescreve o que já foi preenchido
 *
 * Entra quem está sem marca E sem tags, ou sem DESCRIÇÃO — mas cada campo é
 * gravado com `coalesce`, então o que já existe fica. Uma referência que
 * alguém catalogou à mão não pode ser reescrita por um palpite de máquina.
 *
 * A descrição entrou no critério quando a busca por contexto passou a ler dela:
 * medido, 40 das 291 não tinham texto nenhum além do título, e ficariam
 * invisíveis para qualquer busca que não fosse pelo nome do arquivo.
 *
 * Uso: node --import tsx src/scripts/backfill-swipe-catalogo.ts [--aplicar] [--limite=N]
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";
import { analisarLink } from "../services/swipe-analise.js";

interface Linha {
  id: string;
  title: string;
  asset_kind: string;
  source_url: string | null;
  file_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_site_name: string | null;
  og_image: string | null;
  notes: string | null;
}

const VISIVEIS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function preview(url: string | null) {
  if (!url) return undefined;
  try {
    const r = await fetch(url, { redirect: "follow" });
    const mime = (r.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!r.ok || !VISIVEIS.has(mime)) return undefined;
    const buffer = Buffer.from(await r.arrayBuffer());
    return buffer.length > 0 && buffer.length <= 5 * 1024 * 1024
      ? { buffer, mimeType: mime }
      : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const arg = process.argv.find((a) => a.startsWith("--limite="));
  const limite = arg ? Number(arg.split("=")[1]) : 500;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows } = await c.query<Linha>(
    `select id, title, asset_kind, source_url, file_url, og_title, og_description,
            og_site_name, og_image, notes
       from swipe_files
      where (brand is null and jsonb_array_length(tags) = 0)
         -- Sem DESCRIÇÃO também entra: é dela que a busca por contexto lê.
         -- Uma referência sem texto nenhum é invisível para qualquer busca
         -- que não seja pelo título, e o título às vezes é "IMG_2043".
         or coalesce(length(btrim(notes)), 0) < 25
      order by asset_kind, created_at
      limit $1`,
    [limite],
  );

  console.log(`${rows.length} referência(s) sem catalogação\n`);

  let feitas = 0;
  let semNada = 0;
  let falhou = 0;

  for (const r of rows) {
    // Sem endereço nem anotação não há do que catalogar — e inventar a partir
    // do nome do arquivo é exatamente o palpite que enche a faceta de lixo.
    const alvo = r.source_url ?? r.file_url;
    if (!alvo && !r.notes) {
      semNada++;
      continue;
    }

    try {
      const s = await analisarLink(
        client as never,
        {
          url: alvo ?? r.title,
          titulo: r.og_title ?? r.title,
          descricao: r.og_description,
          siteName: r.og_site_name,
          notas: r.notes,
        },
        await preview(r.og_image),
      );

      const util = s.marca || s.nicho || s.plataforma || s.formato || s.tags.length > 0;
      if (!util) {
        semNada++;
        console.log(`  vazio   [${r.asset_kind}] ${r.title.slice(0, 60)}`);
        continue;
      }

      feitas++;
      console.log(
        `  ok      [${r.asset_kind}] ${(s.marca ?? "—").padEnd(20).slice(0, 20)} ` +
          `${(s.nicho ?? "—").padEnd(18).slice(0, 18)} ${s.formato ?? "—"}`,
      );

      if (aplicar) {
        await c.query(
          `update swipe_files
              set brand = coalesce(brand, $1),
                  niche = coalesce(niche, $2),
                  platform = coalesce(platform, $3),
                  format = coalesce(format, $4),
                  tags = case when jsonb_array_length(tags) = 0 then $5::jsonb else tags end,
                  notes = coalesce(nullif(notes, ''), $6),
                  updated_at = now()
            where id = $7`,
          [s.marca, s.nicho, s.plataforma, s.formato, JSON.stringify(s.tags), s.anotacoes, r.id],
        );
      }
    } catch (e) {
      falhou++;
      console.log(`  falhou  [${r.asset_kind}] ${r.title.slice(0, 50)} — ${e instanceof Error ? e.message : ""}`);
    }
  }

  console.log(`\ncatalogadas: ${feitas} · sem material: ${semNada} · falharam: ${falhou}`);
  if (!aplicar) console.log("\n(simulação — rode com --aplicar para gravar)");
  await c.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
