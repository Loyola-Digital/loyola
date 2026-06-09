// Backfill do cache de nomes Meta (meta_entity_names_cache).
//
// Em vez de resolver ID-por-ID (que estoura o rate limit no tier development),
// puxa a LISTA COMPLETA de ads/adsets/campaigns de cada conta via os edges
// /act_<id>/ads, /act_<id>/adsets, /act_<id>/campaigns (paginado, poucas
// chamadas) e faz upsert no cache pra cada projeto vinculado à conta.
//
// Uso:
//   node scripts/backfill-meta-names.mjs              # todas as contas
//   node scripts/backfill-meta-names.mjs 2863980937018503   # só uma conta (meta_account_id)

import pg from 'pg';
import { createDecipheriv } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GRAPH = 'https://graph.facebook.com/v21.0';
const onlyAccount = process.argv[2] || null;
const PAGE_LIMIT = 500;
const THROTTLE_MS = 400; // entre páginas/edges — conservador pro tier development

function decrypt(enc, iv) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const [ct, tag] = enc.split('.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return d.update(ct, 'base64', 'utf8') + d.final('utf8');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Puxa todos os objetos de um edge, paginado. Inclui arquivados/pausados via
// filtering em effective_status (senão a Meta esconde campanhas/ads antigos).
async function fetchAllEdge(accountId, edge, token) {
  const out = [];
  const filtering = encodeURIComponent(JSON.stringify([
    { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DISAPPROVED', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES'] },
  ]));
  let url = `${GRAPH}/act_${accountId}/${edge}?fields=id,name&limit=${PAGE_LIMIT}&filtering=${filtering}&access_token=${token}`;
  let pages = 0;
  while (url) {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) {
      const usage = res.headers.get('x-business-use-case-usage') || '';
      throw new Error(`${edge} HTTP ${res.status}: ${JSON.stringify(body?.error || body)} | usage=${usage.slice(0, 200)}`);
    }
    for (const o of body.data ?? []) if (o.id && o.name) out.push({ id: o.id, name: o.name });
    pages++;
    url = body.paging?.next ?? null;
    if (url) await sleep(THROTTLE_MS);
  }
  return { rows: out, pages };
}

async function upsert(client, projectId, entityType, rows) {
  if (rows.length === 0) return 0;
  // upsert em lotes via unnest
  const ids = rows.map((r) => r.id);
  const names = rows.map((r) => r.name);
  await client.query(
    `INSERT INTO meta_entity_names_cache (project_id, entity_type, entity_id, entity_name, last_synced_at)
     SELECT $1, $2, t.id, t.name, now()
     FROM unnest($3::text[], $4::text[]) AS t(id, name)
     ON CONFLICT (project_id, entity_type, entity_id)
     DO UPDATE SET entity_name = EXCLUDED.entity_name, last_synced_at = EXCLUDED.last_synced_at`,
    [projectId, entityType, ids, names],
  );
  return rows.length;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const accSql = onlyAccount
    ? `SELECT id, meta_account_id, access_token_encrypted, access_token_iv FROM meta_ads_accounts WHERE meta_account_id = $1`
    : `SELECT id, meta_account_id, access_token_encrypted, access_token_iv FROM meta_ads_accounts`;
  const accs = await client.query(accSql, onlyAccount ? [onlyAccount] : []);
  console.log(`Contas a processar: ${accs.rows.length}\n`);

  for (const a of accs.rows) {
    // projetos vinculados a essa conta
    const links = await client.query(
      `SELECT project_id FROM meta_ads_account_projects WHERE account_id = $1`,
      [a.id],
    );
    if (links.rows.length === 0) {
      console.log(`act_${a.meta_account_id}: sem projeto vinculado — pulando`);
      continue;
    }
    let token;
    try { token = decrypt(a.access_token_encrypted, a.access_token_iv); }
    catch (e) { console.log(`act_${a.meta_account_id}: decrypt falhou (${e.message}) — pulando`); continue; }

    console.log(`=== act_${a.meta_account_id} (${links.rows.length} projeto(s)) ===`);
    let edges;
    try {
      const ads = await fetchAllEdge(a.meta_account_id, 'ads', token); await sleep(THROTTLE_MS);
      const adsets = await fetchAllEdge(a.meta_account_id, 'adsets', token); await sleep(THROTTLE_MS);
      const campaigns = await fetchAllEdge(a.meta_account_id, 'campaigns', token);
      edges = { ad: ads, adset: adsets, campaign: campaigns };
    } catch (e) {
      console.log(`  ⚠️  falhou ao puxar edges: ${e.message}`);
      continue;
    }
    console.log(`  Meta retornou: ${edges.ad.rows.length} ads (${edges.ad.pages}p), ${edges.adset.rows.length} adsets (${edges.adset.pages}p), ${edges.campaign.rows.length} campaigns (${edges.campaign.pages}p)`);

    for (const link of links.rows) {
      const na = await upsert(client, link.project_id, 'ad', edges.ad.rows);
      const ns = await upsert(client, link.project_id, 'adset', edges.adset.rows);
      const nc = await upsert(client, link.project_id, 'campaign', edges.campaign.rows);
      console.log(`  ✅ projeto ${link.project_id}: upsert ${na} ads, ${ns} adsets, ${nc} campaigns`);
    }
  }

  const total = await client.query(`SELECT entity_type, COUNT(*) AS n FROM meta_entity_names_cache GROUP BY entity_type ORDER BY entity_type`);
  console.log('\nCache agora:');
  for (const r of total.rows) console.log(`  ${r.entity_type}: ${r.n}`);
} catch (e) {
  console.error('\n💥 Erro:', e);
  process.exit(1);
} finally {
  await client.end();
}
