import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { Env } from './types';
import { HttpError, now, rateLimit, sha256 } from './http';
import { telegramCall } from './telegram';

export function otpAuth(env: Env) {
  async function limit(key: string, max: number, seconds: number) {
    try { await rateLimit(env, key, max, seconds); }
    catch (error) { if (error instanceof HttpError && error.status === 429) throw new APIError('TOO_MANY_REQUESTS', { message: error.message }); throw error; }
  }
  const tokenBody = z.object({ token: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) });
  async function start(identifier: string, purpose: string, channel?: string) {
    await limit(`otp-account:${identifier.toLowerCase()}`, 3, 300);
    const token = crypto.randomUUID();
    const user = await env.DB.prepare('SELECT u.id,u.email,l.chat_id FROM user u LEFT JOIN telegram_links l ON l.user_id=u.id LEFT JOIN customers c ON c.id=u.id WHERE COALESCE(c.disabled,0)=0 AND ((?=\'login\' AND l.telegram_id=?) OR (?=\'reset\' AND (lower(u.username)=? OR lower(u.email)=? OR l.telegram_id=?))) LIMIT 1')
      .bind(purpose, identifier, purpose, identifier.toLowerCase(), identifier.toLowerCase(), identifier).first<{ id: string; email: string; chat_id: string | null }>();
    const destination = purpose === 'login' || channel === 'telegram' ? 'telegram' : channel === 'email' ? 'email' : user?.email.endsWith('@users.invalid') ? 'telegram' : 'email';
    if (!user || (destination === 'telegram' ? !user.chat_id : user.email.endsWith('@users.invalid'))) return { token };
    const bytes = new Uint32Array(1);
    do { crypto.getRandomValues(bytes); } while (bytes[0]! >= 4294000000);
    const otp = String(bytes[0]! % 1000000).padStart(6, '0');
    const value = JSON.stringify({ userId: user.id, hash: await sha256(`${token}:${otp}:${env.BETTER_AUTH_SECRET}`), destination, address: destination === 'telegram' ? user.chat_id : user.email });
    await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
      .bind(token, `customer-otp:${purpose}`, value, (now() + 300) * 1000, Date.now(), Date.now()).run();
    try {
      const text = `Tiệm Digital · Mã ${purpose === 'login' ? 'đăng nhập' : 'đặt lại mật khẩu'}: ${otp}. Hiệu lực 5 phút. Không chia sẻ mã này.`;
      if (destination === 'telegram') await telegramCall(env, 'sendMessage', { chat_id: user.chat_id, text });
      else {
        if (!env.EMAIL || !env.EMAIL_FROM) throw new Error('Email chưa được cấu hình');
        await env.EMAIL.send({ from: env.EMAIL_FROM, to: user.email, subject: 'Mã xác thực Tiệm Digital', text });
      }
    } catch { await env.DB.prepare('DELETE FROM verification WHERE id=?').bind(token).run(); throw new APIError('SERVICE_UNAVAILABLE', { message: 'Chưa gửi được OTP. Vui lòng thử lại sau.' }); }
    return { token };
  }
  async function consume(token: string, otp: string, purpose: string) {
    await limit(`otp-attempt:${token}`, 3, 600);
    const row = await env.DB.prepare('SELECT value FROM verification WHERE id=? AND identifier=? AND expiresAt>?').bind(token, `customer-otp:${purpose}`, Date.now()).first<{ value: string }>();
    if (!row) throw new APIError('BAD_REQUEST', { message: 'OTP không hợp lệ hoặc đã hết hạn.' });
    const data = JSON.parse(row.value) as { userId: string; hash: string; destination: string; address: string };
    if (data.hash !== await sha256(`${token}:${otp}:${env.BETTER_AUTH_SECRET}`)) throw new APIError('BAD_REQUEST', { message: 'OTP không hợp lệ hoặc đã hết hạn.' });
    const permitted = await env.DB.prepare('SELECT u.id FROM user u LEFT JOIN customers c ON c.id=u.id LEFT JOIN telegram_links l ON l.user_id=u.id WHERE u.id=? AND COALESCE(c.disabled,0)=0 AND ((?=\'email\' AND u.email=?) OR (?=\'telegram\' AND l.chat_id=?))').bind(data.userId, data.destination, data.address, data.destination, data.address).first();
    if (!permitted) throw new APIError('FORBIDDEN', { message: 'Tài khoản hoặc liên kết không còn khả dụng.' });
    const deleted = await env.DB.prepare('DELETE FROM verification WHERE id=? AND value=? AND expiresAt>? RETURNING id').bind(token, row.value, Date.now()).first();
    if (!deleted) throw new APIError('BAD_REQUEST', { message: 'OTP đã được sử dụng.' });
    return data.userId;
  }
  return { id: 'customer-otp', endpoints: {
    sendTelegramOtp: createAuthEndpoint('/telegram/otp/start', { method: 'POST', body: z.object({ identifier: z.string().regex(/^\d{1,25}$/) }) }, async ctx => ctx.json(await start(ctx.body.identifier, 'login'))),
    verifyTelegramOtp: createAuthEndpoint('/telegram/otp/complete', { method: 'POST', body: tokenBody }, async ctx => {
      const userId = await consume(ctx.body.token, ctx.body.otp, 'login');
      const user = await ctx.context.internalAdapter.findUserById(userId);
      if (!user) throw new APIError('BAD_REQUEST');
      const session = await ctx.context.internalAdapter.createSession(userId);
      if (!session) throw new APIError('INTERNAL_SERVER_ERROR');
      await setSessionCookie(ctx, { user, session }); return ctx.json({ success: true });
    }),
    requestRecovery: createAuthEndpoint('/recovery/start', { method: 'POST', body: z.object({ identifier: z.string().trim().min(1).max(254), channel: z.enum(['auto','email','telegram']).default('auto') }) }, async ctx => ctx.json(await start(ctx.body.identifier, 'reset', ctx.body.channel))),
    completeRecovery: createAuthEndpoint('/recovery/complete', { method: 'POST', body: tokenBody.extend({ newPassword: z.string().min(8).max(128) }) }, async ctx => {
      const password = await ctx.context.password.hash(ctx.body.newPassword);
      const userId = await consume(ctx.body.token, ctx.body.otp, 'reset');
      const account = await ctx.context.internalAdapter.findCredentialAccount(userId);
      if (account) await ctx.context.internalAdapter.updateAccount(account.id, { password });
      else await ctx.context.internalAdapter.linkAccount({ userId, accountId: userId, providerId: 'credential', password });
      await env.DB.prepare('DELETE FROM session WHERE userId=?').bind(userId).run();
      return ctx.json({ success: true });
    }),
    adminPasswordLogin: createAuthEndpoint('/admin-password', { method: 'POST', body: z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }) }, async ctx => {
      const found = await env.DB.prepare('SELECT u.id FROM user u JOIN admin_accounts a ON a.user_id=u.id LEFT JOIN customers c ON c.id=u.id WHERE (lower(u.username)=? OR lower(u.email)=?) AND COALESCE(c.disabled,0)=0').bind(ctx.body.identifier.toLowerCase(), ctx.body.identifier.toLowerCase()).first<{ id: string }>();
      const account = found ? await ctx.context.internalAdapter.findCredentialAccount(found.id) : null;
      if (!account?.password || !await ctx.context.password.verify({ hash: account.password, password: ctx.body.password })) throw new APIError('UNAUTHORIZED', { message: 'Tài khoản hoặc mật khẩu không đúng.' });
      const user = await ctx.context.internalAdapter.findUserById(found!.id);
      if (!user) throw new APIError('UNAUTHORIZED');
      const session = await ctx.context.internalAdapter.createSession(user.id);
      if (!session) throw new APIError('INTERNAL_SERVER_ERROR');
      await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), `admin-password:${session.id}`, user.id, session.expiresAt.getTime(), Date.now(), Date.now()).run();
      await setSessionCookie(ctx, { user, session }); return ctx.json({ success: true });
    }),
  } };
}
