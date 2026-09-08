import dotenv from 'dotenv'; import pg from 'pg';
dotenv.config({ path: '.env' });
const VAZIO = `(tags is null or jsonb_array_length(tags)=0) and brand is null and niche is null and platform is null and format is null`;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
let anterior = -1, estavel = 0;
for (;;) {
  const r = await c.query(`select count(*) n from swipe_files where ${VAZIO} and asset_kind <> 'video'`);
  const n = Number(r.rows[0].n);
  if (n === anterior) { estavel++; } else { estavel = 0; anterior = n; }
  // Parou de cair por 3 leituras seguidas, ou zerou: acabou.
  if (n === 0 || estavel >= 3) { console.log('faltam ' + n + ' analisaveis'); break; }
  await new Promise(r => setTimeout(r, 20000));
}
await c.end();
