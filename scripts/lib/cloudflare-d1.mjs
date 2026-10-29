import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export async function d1Client(envFile, oauth) {
  const settings = envFile && !oauth ? { ...parseEnv(await readFile(envFile, 'utf8')), ...process.env } : process.env;
  const token = oauth ? (await readFile(oauth.file, 'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1] : settings.CLOUDFLARE_API_TOKEN;
  const account = oauth?.account ?? settings.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('Missing CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID');
  return async function query(database, sql, params = []) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
    });
    const data = await response.json();
    if (!response.ok || !data.success || data.result?.some(result => !result.success)) throw new Error(`D1 query failed (${response.status}): ${data.errors?.map(error => error.message).join(', ') || 'statement failed'}`);
    return data.result;
  };
}
