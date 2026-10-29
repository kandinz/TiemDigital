import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { d1Client } from './lib/cloudflare-d1.mjs';
import { MMO_SCHEMA_STATEMENTS } from '../workers/mmo/schema.ts';

export const tables = ['mmo_providers', 'mmo_settings', 'mmo_categories', 'mmo_orders', 'mmo_transactions', 'mmo_retail_products'];
export const quote = value => value === null ? 'NULL' : typeof value === 'number' && Number.isFinite(value) ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
export const mapOwner = (table, row, userId) => ['mmo_orders', 'mmo_transactions'].includes(table) ? { ...row, user_id: userId } : row;
export function digest(rows, columns) {
  const normalized = rows.map(row => JSON.stringify(columns.map(column => row[column] ?? null))).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export const stableColumns = (table, columns) => table === 'mmo_providers' ? columns.filter(column => !['balance_cache', 'balance_cached_at'].includes(column)) : columns;
export function compatibleSubset(table, destination, source, columns) {
  const key = table === 'mmo_settings' ? 'key' : 'id';
  const expected = new Map(source.map(row => [row[key], row]));
  return destination.every(row => expected.has(row[key]) && digest([row], stableColumns(table, columns)) === digest([expected.get(row[key])], stableColumns(table, columns)));
}

async function main() {
  const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const sourceRoot = option('source');
  const username = option('owner');
  const targetAccount = option('target-account');
  const oauthFile = option('target-oauth');
  const targetEnv = option('env');
  const apply = process.argv.includes('--apply');
  const catchUp = process.argv.includes('--catch-up');
  if (!sourceRoot || !/^[a-zA-Z0-9_.]{3,30}$/.test(username ?? '') || !['production', 'staging'].includes(targetEnv))
    throw new Error('Usage: node scripts/migrate-mmo.mjs --source="D:/Project/Gum Tool" --owner=khanhdq --env=production [--target-account=<id> --target-oauth=<wrangler-config>] [--apply]');
  const config = JSON.parse(await readFile(new URL('../wrangler.worker.jsonc', import.meta.url), 'utf8'));
  const targetDb = config.env[targetEnv].d1_databases.find(db => db.binding === 'DB').database_id;
  const sourceDb = (await readFile(resolve(sourceRoot, 'wrangler.toml'), 'utf8')).match(/database_id\s*=\s*"([^"]+)"/)?.[1];
  if (!sourceDb || sourceDb === targetDb) throw new Error('Source and target databases must exist and differ');
  const source = await d1Client(resolve(sourceRoot, '.env'));
  const target = await d1Client(resolve('.env'), oauthFile ? { file: oauthFile, account: targetAccount } : undefined);
  const rows = async (query, db, sql, params = []) => (await query(db, sql, params))[0].results;
  const owners = await rows(target, targetDb, 'SELECT id,username FROM user WHERE username=? COLLATE NOCASE', [username]);
  if (owners.length !== 1) throw new Error('Create the named TiệmDigital account before migrating');
  const owner = owners[0];
  const existing = new Set((await rows(target, targetDb, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'mmo_%'")).map(row => row.name));
  const snapshot = {};
  for (const table of tables) {
    snapshot[table] = await rows(source, sourceDb, `SELECT * FROM ${table}`);
    if (existing.has(table)) {
      const destination = await rows(target, targetDb, `SELECT * FROM ${table}`);
      if (destination.length) {
        const mapped = snapshot[table].map(row => mapOwner(table, row, owner.id));
        const columns = Object.keys(mapped[0] ?? {});
        if (catchUp ? !compatibleSubset(table, destination, mapped, columns) : digest(destination, columns) !== digest(mapped, columns)) throw new Error(`Target ${table} contains different data; no overwrite performed`);
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', owner: owner.username, counts: Object.fromEntries(tables.map(table => [table, snapshot[table].length])) }));
  if (!apply) return;
  const directory = resolve('.wrangler', 'mmo-migration', new Date().toISOString().replaceAll(':', '-'));
  await mkdir(directory, { recursive: true });
  // Snapshot includes supplier secrets and delivered items. Never commit this ignored directory.
  await writeFile(resolve(directory, 'source.json'), JSON.stringify(snapshot), { mode: 0o600 });
  await target(targetDb, MMO_SCHEMA_STATEMENTS.join(';\n'));
  await target(targetDb, "CREATE TABLE IF NOT EXISTS admin_accounts(user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN('owner','finance','support','editor','auditor')))");
  for (const table of tables) {
    const mapped = snapshot[table].map(row => mapOwner(table, row, owner.id));
    const columns = Object.keys(mapped[0] ?? {});
    let batch = '';
    for (const row of mapped) {
      const statement = `INSERT OR IGNORE INTO ${table}(${columns.join(',')}) VALUES(${columns.map(column => quote(row[column])).join(',')});\n`;
      if (batch && batch.length + statement.length > 60000) { await target(targetDb, batch); batch = ''; }
      batch += statement;
    }
    if (batch) await target(targetDb, batch);
    const copied = await rows(target, targetDb, `SELECT * FROM ${table}`);
    const comparedColumns = catchUp ? stableColumns(table, columns) : columns;
    if (copied.length !== mapped.length || digest(copied, comparedColumns) !== digest(mapped, comparedColumns)) throw new Error(`Verification failed for ${table}`);
    console.log(`${table}: ${copied.length} verified`);
  }
  // Detect a moving source before granting access; rerun only after reconciling any changed records.
  for (const table of tables) {
    const current = await rows(source, sourceDb, `SELECT * FROM ${table}`);
    const columns = Object.keys(snapshot[table][0] ?? {});
    const comparedColumns = catchUp ? stableColumns(table, columns) : columns;
    if (digest(current, comparedColumns) !== digest(snapshot[table], comparedColumns)) throw new Error(`Source ${table} changed during migration; reconcile before cutover`);
  }
  await target(targetDb, "INSERT INTO admin_accounts(user_id,role) VALUES(?,'owner') ON CONFLICT(user_id) DO UPDATE SET role='owner'", [owner.id]);
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify({ owner: owner.username, completedAt: new Date().toISOString(), counts: Object.fromEntries(tables.map(table => [table, snapshot[table].length])) }, null, 2));
  console.log('Migration verified; Owner granted. Source database unchanged.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
