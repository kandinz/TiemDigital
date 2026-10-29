import { createAuthEndpoint } from 'better-auth/api';
import { APIError } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import type { Env } from './types';
import { now, sha256 } from './http';

export function telegramAuth(env: Env) {
  return {
    id: 'telegram-login',
    endpoints: {
      startTelegramLogin: createAuthEndpoint('/telegram/start', { method: 'POST' }, async (ctx) => {
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_BOT_USERNAME || !/^[a-zA-Z0-9_]+$/.test(env.TELEGRAM_BOT_USERNAME))
          throw new APIError('SERVICE_UNAVAILABLE', { message: 'Đăng nhập Telegram chưa được cấu hình.' });
        const token = crypto.randomUUID().replaceAll('-', '');
        const browser = crypto.randomUUID();
        await env.DB.prepare('DELETE FROM telegram_logins WHERE expires_at<=?').bind(now()).run();
        await env.DB.prepare('INSERT INTO telegram_logins(id,browser_hash,expires_at) VALUES(?,?,?)')
          .bind(await sha256(token), await sha256(browser), now() + 300).run();
        const cookie = ctx.context.createAuthCookie('telegram_login', { maxAge: 300 });
        await ctx.setSignedCookie(cookie.name, browser, ctx.context.secret, cookie.attributes);
        return ctx.json({ token, url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=login_${token}`, expiresAt: now() + 300 });
      }),
      completeTelegramLogin: createAuthEndpoint('/telegram/complete', {
        method: 'POST', body: z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) }),
      }, async (ctx) => {
        const cookie = ctx.context.createAuthCookie('telegram_login', { maxAge: 300 });
        const browser = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        if (!browser) throw new APIError('FORBIDDEN', { message: 'Hãy đăng nhập trên trình duyệt đã tạo yêu cầu.' });
        const id = await sha256(ctx.body.token);
        const browserHash = await sha256(browser);
        const pending = await env.DB.prepare('SELECT user_id,confirmed_at,expires_at FROM telegram_logins WHERE id=? AND browser_hash=?')
          .bind(id, browserHash).first<{ user_id: string | null; confirmed_at: number | null; expires_at: number }>();
        if (!pending || pending.expires_at <= now()) throw new APIError('BAD_REQUEST', { message: 'Yêu cầu đã hết hạn hoặc đã sử dụng. Vui lòng tạo lại.' });
        if (!pending.confirmed_at || !pending.user_id) return ctx.json({ status: 'PENDING' });
        const permitted = await env.DB.prepare('SELECT u.id FROM user u JOIN telegram_links l ON l.user_id=u.id LEFT JOIN customers c ON c.id=u.id WHERE u.id=? AND COALESCE(c.disabled,0)=0 AND l.telegram_id=(SELECT telegram_id FROM telegram_logins WHERE id=?)')
          .bind(pending.user_id, id).first();
        if (!permitted) throw new APIError('FORBIDDEN', { message: 'Tài khoản Telegram không còn khả dụng.' });
        const user = await ctx.context.internalAdapter.findUserById(pending.user_id);
        if (!user) throw new APIError('FORBIDDEN', { message: 'Không tìm thấy tài khoản.' });
        const consumed = await env.DB.prepare('DELETE FROM telegram_logins WHERE id=? AND browser_hash=? AND confirmed_at IS NOT NULL AND expires_at>? RETURNING user_id')
          .bind(id, browserHash, now()).first();
        if (!consumed) throw new APIError('BAD_REQUEST', { message: 'Yêu cầu đã được sử dụng.' });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Chưa tạo được phiên đăng nhập.' });
        await setSessionCookie(ctx, { session, user });
        ctx.setCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 });
        return ctx.json({ status: 'SIGNED_IN' });
      }),
    },
  };
}
