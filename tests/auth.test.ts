import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../workers/index';
import type { Env } from '../workers/types';
import { now, sha256 } from '../workers/http';

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

  it('logs in to the existing bot account only after explicit Telegram confirmation, without merging its wallet', async () => {
    client++;
    const telegramId = '87654321';
    const userId = `telegram:${telegramId}`;
    await env.DB.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)').bind(userId, 'Bot customer', `telegram-${telegramId}@users.invalid`, Date.now(), Date.now()).run();
    await env.DB.prepare('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES(?,?,?)').bind(userId, telegramId, telegramId).run();
    await env.DB.prepare("INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo) VALUES(?,?,?,'TOPUP',50000,50000,'test-bank',?,'test fixture')").bind(crypto.randomUUID(), crypto.randomUUID(), userId, `wallet:${userId}`).run();
    const started = await request('/api/auth/telegram/start', {});
    expect(started.status).toBe(200);
    const startCookie = cookies(started);
    const challenge = await started.json() as { token: string; url: string };
    expect(challenge.url).toBe(`https://t.me/tiemdigital_bot?start=login_${challenge.token}`);
    expect((await request('/api/auth/telegram/complete', { token: challenge.token })).status).toBe(403);
    expect(await (await request('/api/auth/telegram/complete', { token: challenge.token }, startCookie)).json()).toMatchObject({ status: 'PENDING' });
    const sent: { text?: string; reply_markup?: { inline_keyboard: { callback_data: string }[][] } }[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (!String(input).startsWith('https://api.telegram.org/botauth-test-bot-token/')) throw new Error('Unexpected external request');
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, result: {} });
    });
    let updateId = 700000;
    async function update(text: string, callback = false, sender = Number(telegramId), secret = testEnv.TELEGRAM_WEBHOOK_SECRET!) {
      updateId++;
      const from = { id: sender, first_name: 'Bot customer' }, chat = { id: sender, type: 'private' };
      return worker.fetch(new Request(`${testEnv.APP_ORIGIN}/webhooks/telegram`, { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret, 'content-type': 'application/json' }, body: JSON.stringify({ update_id: updateId, ...(callback ? { callback_query: { id: String(updateId), from, data: text, message: { chat } } } : { message: { from, chat, text } }) }) }), testEnv);
    }
    try {
      expect((await update(`/start login_${challenge.token}`, false, Number(telegramId), 'forged')).status).toBe(401);
      expect((await update(`/start login_${challenge.token}`)).status).toBe(200);
      expect(await (await request('/api/auth/telegram/complete', { token: challenge.token }, startCookie)).json()).toMatchObject({ status: 'PENDING' });
      const button = sent.find((message) => message.reply_markup)?.reply_markup?.inline_keyboard[0][0].callback_data;
      expect(button).toBe(`web-login:${challenge.token}`);
      await update(button!, true, Number(telegramId) + 1);
      expect(await (await request('/api/auth/telegram/complete', { token: challenge.token }, startCookie)).json()).toMatchObject({ status: 'PENDING' });
      await update(button!, true);
      const completed = await request('/api/auth/telegram/complete', { token: challenge.token }, startCookie);
      expect(completed.status).toBe(200);
      expect(await completed.json()).toMatchObject({ status: 'SIGNED_IN' });
      const cookie = cookies(completed);
      expect(await (await request('/api/me', undefined, cookie)).json()).toMatchObject({ id: userId, email: '' });
      expect(await (await request('/api/me/wallet', undefined, cookie)).json()).toMatchObject({ balance: 50000 });
      expect((await request('/api/auth/telegram/complete', { token: challenge.token }, startCookie)).status).toBe(400);
      expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM telegram_links WHERE telegram_id=?').bind(telegramId).first()).toMatchObject({ count: 1 });
      const blockedStart = await request('/api/auth/telegram/start', {});
      const blocked = await blockedStart.json() as { token: string };
      await env.DB.prepare('UPDATE telegram_logins SET user_id=?,telegram_id=?,confirmed_at=? WHERE id=?').bind(userId, telegramId, now(), await sha256(blocked.token)).run();
      await env.DB.prepare('UPDATE customers SET disabled=1 WHERE id=?').bind(userId).run();
      try {
        expect((await request('/api/auth/telegram/complete', { token: blocked.token }, cookies(blockedStart))).status).toBe(403);
        expect((await request('/api/me/wallet', undefined, cookie)).status).toBe(403);
      } finally { await env.DB.prepare('UPDATE customers SET disabled=0 WHERE id=?').bind(userId).run(); }
    } finally { fetchMock.mockRestore(); }
  });

  it('rejects expired and browser-mismatched Telegram login requests', async () => {
    client++;
    const first = await request('/api/auth/telegram/start', {});
    const cookie = cookies(first), challenge = await first.json() as { token: string };
    const second = await request('/api/auth/telegram/start', {});
    expect((await request('/api/auth/telegram/complete', { token: challenge.token }, cookies(second))).status).toBe(400);
    await env.DB.prepare('UPDATE telegram_logins SET expires_at=? WHERE id=?').bind(now() - 1, await sha256(challenge.token)).run();
    expect((await request('/api/auth/telegram/complete', { token: challenge.token }, cookie)).status).toBe(400);
  });
});
