import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../workers/index';
import type { Env } from '../workers/types';

const origin = 'http://localhost:8787';
const testEnv = { ...env, APP_ORIGIN: origin, ADMIN_ORIGIN: 'https://admin.example.test', ADMIN_AUTH_MODE: 'session', ENVIRONMENT: 'local', BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters' } as Env;
const request = (path: string, cookie = '', body?: unknown, requestOrigin = origin) => worker.fetch(new Request(`${origin}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { cookie, origin: requestOrigin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.230' },
  body: body === undefined ? undefined : JSON.stringify(body),
}), testEnv);

it('opens admin with a granted TiệmDigital session, without Access, and binds rights to immutable user ID', async () => {
  const signup = await request('/api/auth/register', '', { username: 'admin_session_test', password: 'Strong-password-42' });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const me = await (await request('/api/me', cookie)).json() as { id: string };
  // This exact error currently prevents any account from reaching admin on Pages.
  expect((await request('/api/admin/me', cookie)).status).toBe(403);
  await env.DB.prepare('INSERT INTO admin_accounts(user_id,role) VALUES(?,?)').bind(me.id, 'owner').run();
  const admin = await request('/api/admin/me', cookie);
  expect(admin.status).toBe(200);
  expect(await admin.json()).toMatchObject({ role: 'owner', userId: me.id });
  expect((await request('/api/admin/me')).status).toBe(401);
  expect((await worker.fetch(new Request(`${testEnv.ADMIN_ORIGIN}/api/admin/me`, { headers: { cookie } }), testEnv)).status).toBe(403);
  expect((await request('/api/admin/products', cookie, { id: 99 }, 'https://attacker.test')).status).toBe(403);
  expect((await request('/api/auth/profile', cookie, { name: 'Owner renamed', username: 'admin_session_test', email: 'new-admin@example.test' })).status).toBe(200);
  expect((await request('/api/admin/me', cookie)).status).toBe(200);
  await env.DB.prepare('UPDATE customers SET disabled=1 WHERE id=?').bind(me.id).run();
  expect((await request('/api/admin/me', cookie)).status).toBe(403);
});
