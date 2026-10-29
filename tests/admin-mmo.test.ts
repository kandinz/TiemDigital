import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import worker from '../workers/index';
import type { Env } from '../workers/types';

const origin = 'http://localhost:8787';
const testEnv = { ...env, APP_ORIGIN: origin, ADMIN_ORIGIN: origin, ADMIN_AUTH_MODE: 'session', ENVIRONMENT: 'local', BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters' } as Env;
async function account(username: string, role?: string) {
  const response = await worker.fetch(new Request(`${origin}/api/auth/register`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': `192.0.2.${role ? 233 : 234}` }, body: JSON.stringify({ username, password: 'Strong-password-42' }) }), testEnv);
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const me = await (await worker.fetch(new Request(`${origin}/api/me`, { headers: { cookie } }), testEnv)).json() as { id: string };
  if (role) await env.DB.prepare('INSERT INTO admin_accounts(user_id,role) VALUES(?,?)').bind(me.id, role).run();
  return { cookie, id: me.id };
}
function request(path: string, cookie = '', body?: unknown, method = body === undefined ? 'GET' : 'POST', from = origin) {
  return worker.fetch(new Request(`${origin}/api/admin/mmo${path}`, { method, headers: { cookie, origin: from, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), testEnv);
}

it('keeps every MMO route private, uses TiệmDigital identity, and supports retail, transactions, reports and warranty on real D1', async () => {
  for (const path of ['/providers', '/orders', '/transactions', '/catalog', '/catalog/openapi.json', '/reports/summary']) expect((await request(path)).status).toBe(401);
  const ordinary = await account('mmo_ordinary');
  expect((await request('/providers', ordinary.cookie)).status).toBe(403);
  const support = await account('mmo_support', 'support');
  expect((await request('/providers', support.cookie)).status).toBe(403);
  const owner = await account('mmo_owner', 'owner');
  const frameEnv = { ...testEnv, SITE_ASSETS: { fetch: async (request: Request) => new Response(new URL(request.url).pathname, { headers: { 'content-type': 'text/html' } }) } as Fetcher };
  const frame = await worker.fetch(new Request(`${origin}/admin/mmo-ui`, { headers: { cookie: owner.cookie } }), frameEnv);
  expect(frame.status).toBe(200);
  expect(await frame.text()).toBe('/mmo/index.html');
  expect(frame.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(frame.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  expect(frame.headers.get('cache-control')).toBe('no-store');
  expect((await worker.fetch(new Request(`${origin}/admin/mmo-ui`), frameEnv)).status).toBe(401);
  expect((await request('/settings', owner.cookie, { usd_rate: 26000 }, 'PUT', 'https://attacker.test')).status).toBe(403);
  expect((await request('/settings', owner.cookie, { usd_rate: 26000, categories: [{ name: 'AI', keywords: ['Claude'] }] }, 'PUT')).status).toBe(200);
  expect((await request('/providers', owner.cookie, { id: 'prodseller', name: 'Test provider', base_url: 'https://vendor.test', api_key: 'supplier-secret', auth_type: 'header', auth_key_name: 'Authorization' })).status).toBe(200);
  const providers = await (await request('/providers', owner.cookie)).json();
  expect((await request('/orders', owner.cookie)).headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(providers)).not.toContain('supplier-secret');
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: true, order_id: 'vendor-order-1', keys: ['test-delivery'], status: 'completed' }));
  let purchase: { order_id: string };
  try {
    const bought = await request('/order', owner.cookie, { provider_id: 'prodseller', product_id: 'p1', product_name: 'Test key', quantity: 1, unit_price: 1, total_price: 1 });
    expect(bought.status).toBe(200);
    purchase = await bought.json() as { order_id: string };
    expect(await env.DB.prepare('SELECT user_id FROM mmo_orders WHERE id=?').bind(purchase.order_id).first()).toEqual({ user_id: owner.id });
  } finally { mock.mockRestore(); }
  const sale = await request('/transactions', owner.cookie, { type: 'sale', date: '2026-10-29', product_name: 'Test key', cost_price: 26000, sale_price: 40000, warranty_period: '7d', purchase_order_id: purchase!.order_id });
  expect(sale.status).toBe(200);
  expect((await (await request('/transactions', owner.cookie)).text())).toContain('2026-11-05');
  expect((await request('/reports/summary', owner.cookie)).status).toBe(200);
  expect((await request('/reports/monthly?year=2026', owner.cookie)).status).toBe(200);
  expect((await request('/warranty/lookup?search=Test', owner.cookie)).status).toBe(200);
  expect((await request('/catalog', owner.cookie, { provider_id: 'prodseller', provider_product_id: 'p1', original_name: 'Test key', selling_price: 40000 })).status).toBe(200);
  expect((await (await request('/catalog/admin', owner.cookie)).text())).toContain('Test key');
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM audit WHERE actor=? AND action='MMO_REQUEST'").bind(`user:${owner.id}`).first()).toMatchObject({ count: 5 });
});
