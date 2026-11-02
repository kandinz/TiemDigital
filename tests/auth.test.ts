import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../workers/index';
import type { Env } from '../workers/types';

const testEnv = { ...env, APP_ORIGIN: 'http://localhost:8787', ADMIN_ORIGIN: 'http://localhost:8787', ENVIRONMENT: 'local', BETTER_AUTH_SECRET: 'test-secret-with-at-least-thirty-two-characters', TELEGRAM_BOT_TOKEN: 'auth-test-bot-token', TELEGRAM_WEBHOOK_SECRET: 'auth-test-webhook-secret', TELEGRAM_BOT_USERNAME: 'tiemdigital_bot' } as Env;
let client = 50;
const password = 'Correct-password-42';
const cookies = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
function request(path: string, body?: unknown, cookie = '', origin = testEnv.APP_ORIGIN) {
  return worker.fetch(new Request(`${testEnv.APP_ORIGIN}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { origin, cookie, 'cf-connecting-ip': `192.0.2.${client}`, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) }), testEnv);
}

describe('password and Telegram authentication', () => {
  it('registers without email and signs in by normalized username using a hashed password', async () => {
    client++;
    const signup = await request('/api/auth/register', { username: 'NoEmail_User', password });
    expect(signup.status).toBe(200);
    const cookie = cookies(signup);
    const me = await (await request('/api/me', undefined, cookie)).json() as { id: string; username: string; email: string };
    expect(me).toMatchObject({ username: 'noemail_user', email: '' });
    const credential = await env.DB.prepare("SELECT password FROM account WHERE userId=? AND providerId='credential'").bind(me.id).first<{ password: string }>();
    expect(credential?.password).toBeTruthy(); expect(credential?.password).not.toBe(password);
    expect((await request('/api/me/wallet', undefined, cookie)).status).toBe(200);
    const signedIn = await request('/api/auth/sign-in/username', { username: 'NOEMAIL_USER', password });
    expect(signedIn.status).toBe(200);
    expect((await (await request('/api/me', undefined, cookies(signedIn))).json() as { id: string }).id).toBe(me.id);
    expect((await request('/api/auth/sign-in/username', { username: 'noemail_user', password: 'wrong-password' })).status).toBe(401);
    expect((await request('/api/auth/register', { username: 'noemail_user', password })).status).toBe(400);
  });

  it('supports email/password on the same account and rejects invalid registration or origin', async () => {
    client++;
    const signup = await request('/api/auth/register', { username: 'Mail_User', password, email: 'Auth-Email@Example.com' });
    expect(signup.status).toBe(200);
    const me = await (await request('/api/me', undefined, cookies(signup))).json() as { id: string; email: string };
    expect(me.email).toBe('auth-email@example.com');
    const login = await request('/api/auth/sign-in/email', { email: 'auth-email@example.com', password });
    expect(login.status).toBe(200);
    expect((await (await request('/api/me', undefined, cookies(login))).json() as { id: string }).id).toBe(me.id);
    expect((await request('/api/auth/register', { username: 'ab', password })).status).toBe(400);
    expect((await request('/api/auth/register', { username: 'short_password', password: '123' })).status).toBe(400);
    expect((await request('/api/auth/register', { username: 'internal_mail', password, email: 'telegram-1@users.invalid' })).status).toBe(400);
    expect((await request('/api/auth/sign-up/email', { name: 'Bypass', email: 'bypass@example.com', password })).status).toBe(404);
    expect((await request('/api/auth/register', { username: 'cross_origin', password }, '', 'https://attacker.example')).status).toBe(403);
  });

  it('updates profile and login identifiers without changing ownership or trusting the new email', async () => {
    client++;
    const signup = await request('/api/auth/register', { username: 'Profile_Before', email: 'profile-before@example.com', password });
    const cookie = cookies(signup);
    const before = await (await request('/api/me', undefined, cookie)).json() as { id: string };
    await env.DB.prepare('UPDATE user SET emailVerified=1 WHERE id=?').bind(before.id).run();
    const profile = { name: 'Tên mới', username: 'Profile_After', email: 'PROFILE@Example.com' };
    expect((await request('/api/auth/profile', profile)).status).toBe(401);
    expect((await request('/api/auth/profile', profile, cookie, 'https://attacker.example')).status).toBe(403);
    expect((await request('/api/auth/profile', profile, cookie)).status).toBe(200);
    expect(await (await request('/api/me', undefined, cookie)).json()).toMatchObject({ id: before.id, name: 'Tên mới', username: 'profile_after', email: 'profile@example.com', hasPassword: true });
    expect(await env.DB.prepare('SELECT emailVerified FROM user WHERE id=?').bind(before.id).first()).toMatchObject({ emailVerified: 0 });
    expect((await request('/api/auth/sign-in/username', { username: 'Profile_After', password })).status).toBe(200);
    expect((await request('/api/auth/sign-in/email', { email: 'profile@example.com', password })).status).toBe(200);
    expect((await request('/api/auth/sign-in/username', { username: 'Profile_Before', password })).status).toBe(401);
    expect((await request('/api/auth/profile', { ...profile, email: '' }, cookie)).status).toBe(200);
    expect(await (await request('/api/me', undefined, cookie)).json()).toMatchObject({ id: before.id, email: '' });
    expect((await request('/api/auth/sign-in/username', { username: 'profile_after', password })).status).toBe(200);
    await env.DB.prepare('UPDATE session SET createdAt=0 WHERE userId=?').bind(before.id).run();
    expect((await request('/api/auth/profile', profile, cookie)).status).toBe(403);
  });

  it('rejects duplicate and invalid profile fields without partially saving other fields', async () => {
    client++;
    await request('/api/auth/register', { username: 'Profile_Taken', email: 'taken-profile@example.com', password });
    const signup = await request('/api/auth/register', { username: 'Profile_Owner', password });
    const cookie = cookies(signup);
    const profile = { name: 'Must not save', username: 'profile_owner', email: '' };
    expect((await request('/api/auth/profile', { ...profile, username: 'PROFILE_TAKEN' }, cookie)).status).toBe(400);
    expect((await request('/api/auth/profile', { ...profile, email: 'taken-profile@example.com' }, cookie)).status).toBe(400);
    expect((await request('/api/auth/profile', { ...profile, email: 'fake@users.invalid' }, cookie)).status).toBe(400);
    expect((await request('/api/auth/profile', { ...profile, username: 'ab' }, cookie)).status).toBe(400);
    expect(await (await request('/api/me', undefined, cookie)).json()).toMatchObject({ name: 'Profile_Owner', username: 'profile_owner', email: '' });
  });

  it('requires the current password and replaces it while keeping the same account and rejecting old sessions', async () => {
    client++;
    const signup = await request('/api/auth/register', { username: 'Password_Change', password });
    const cookie = cookies(signup);
    const before = await (await request('/api/me', undefined, cookie)).json() as { id: string };
    const newPassword = 'Updated-password-42';
    expect((await request('/api/auth/change-password', { currentPassword: 'wrong-password', newPassword }, cookie)).status).toBe(400);
    expect((await request('/api/auth/change-password', { currentPassword: password, newPassword: 'short' }, cookie)).status).toBe(400);
    expect((await request('/api/auth/password/create', { newPassword }, cookie)).status).toBe(400);
    const changed = await request('/api/auth/change-password', { currentPassword: password, newPassword, revokeOtherSessions: true }, cookie);
    expect(changed.status).toBe(200);
    expect((await request('/api/me', undefined, cookie)).status).toBe(401);
    expect(await (await request('/api/me', undefined, cookies(changed))).json()).toMatchObject({ id: before.id });
    expect((await request('/api/auth/sign-in/username', { username: 'password_change', password })).status).toBe(401);
    const login = await request('/api/auth/sign-in/username', { username: 'password_change', password: newPassword });
    expect(login.status).toBe(200);
    expect(await (await request('/api/me', undefined, cookies(login))).json()).toMatchObject({ id: before.id, hasPassword: true });
  });

  it('authenticates Telegram OTP once and resets passwords through linked email or Telegram', async () => {
    client++;
    const signup = await request('/api/auth/register', { username: 'otp_customer', email: 'otp@example.test', password });
    const oldCookie = cookies(signup);
    const me = await (await request('/api/me', undefined, oldCookie)).json() as { id: string };
    await env.DB.prepare('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES(?,?,?)').bind(me.id, '87654321', '87654321').run();
    let code = '';
    const send = vi.fn(async (message: { text: string }) => { code = message.text.match(/: (\d{6})/)![1]!; });
    testEnv.EMAIL = { send }; testEnv.EMAIL_FROM = 'sender@example.test';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_input, init) => {
      const message = JSON.parse(init!.body as string) as { text: string };
      code = message.text.match(/: (\d{6})/)![1]!;
      return Response.json({ ok: true, result: {} });
    }) as typeof fetch;
    try {
      const begin = await request('/api/auth/telegram/otp/start', { identifier: '87654321' });
      expect(begin.status).toBe(200);
      const challenge = await begin.json() as { token: string };
      expect(code).toMatch(/^\d{6}$/);
      expect((await request('/api/auth/recovery/complete', { ...challenge, otp: code, newPassword: password })).status).toBe(400);
      const login = await request('/api/auth/telegram/otp/complete', { ...challenge, otp: code });
      expect(login.status).toBe(200);
      expect(await (await request('/api/me', undefined, cookies(login))).json()).toMatchObject({ id: me.id });
      expect((await request('/api/auth/telegram/otp/complete', { ...challenge, otp: code })).status).toBe(400);
      await env.DB.prepare("INSERT INTO admin_accounts(user_id,role) VALUES(?,'owner')").bind(me.id).run();
      const sessionEnv = { ...testEnv, ADMIN_AUTH_MODE: 'session' as const };
      expect((await worker.fetch(new Request(`${testEnv.APP_ORIGIN}/api/admin/me`, { headers: { cookie: cookies(login) } }), sessionEnv)).status).toBe(401);
      for (const channel of ['email', 'telegram']) {
        client++;
        const recovery = await request('/api/auth/recovery/start', { identifier: 'otp_customer', channel });
        expect(recovery.status).toBe(200);
        const reset = await recovery.json() as { token: string };
        const nextPassword = `New-password-${channel}-42`;
        expect((await request('/api/auth/recovery/complete', { ...reset, otp: code, newPassword: nextPassword })).status).toBe(200);
        expect((await request('/api/me', undefined, oldCookie)).status).toBe(401);
        expect((await request('/api/auth/sign-in/username', { username: 'otp_customer', password: nextPassword })).status).toBe(200);
      }
      expect(send).toHaveBeenCalledOnce();
    } finally { globalThis.fetch = originalFetch; delete testEnv.EMAIL; delete testEnv.EMAIL_FROM; }
  });
  it('rejects unknown, expired, and repeatedly incorrect OTPs without disclosing unknown accounts', async () => {
    client++;
    const unknown = await request('/api/auth/telegram/otp/start', { identifier: '98765432' });
    expect(unknown.status).toBe(200);
    const challenge = await unknown.json() as { token: string };
    expect((await request('/api/auth/telegram/otp/complete', { ...challenge, otp: '123456' })).status).toBe(400);
    const token = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(token, 'customer-otp:login', '{}', Date.now()-1, Date.now(), Date.now()).run();
    expect((await request('/api/auth/telegram/otp/complete', { token, otp: '123456' })).status).toBe(400);
    for (let i=0;i<2;i++) expect((await request('/api/auth/telegram/otp/complete', { ...challenge, otp: '123456' })).status).toBe(400);
    expect((await request('/api/auth/telegram/otp/complete', { ...challenge, otp: '123456' })).status).toBe(429);
    expect((await request('/api/auth/telegram/start', {})).status).toBe(404);
  });
});
