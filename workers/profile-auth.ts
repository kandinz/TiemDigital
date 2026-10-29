import { APIError, createAuthEndpoint, freshSessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

export function profileAuth() {
  return {
    id: 'customer-profile',
    endpoints: {
      saveProfile: createAuthEndpoint('/profile', {
        method: 'POST', use: [freshSessionMiddleware],
        body: z.object({
          name: z.string().trim().min(1).max(100),
          username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
          email: z.union([z.email(), z.literal('')]),
        }),
      }, async (ctx) => {
        const { user, session } = ctx.context.session;
        const suppliedEmail = ctx.body.email.toLowerCase();
        if (suppliedEmail.endsWith('@users.invalid')) throw new APIError('BAD_REQUEST', { message: 'Địa chỉ email không hợp lệ.' });
        const email = suppliedEmail || (user.email.endsWith('@users.invalid') ? user.email : `${crypto.randomUUID()}@users.invalid`);
        if (email !== user.email) {
          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          if (existing && existing.user.id !== user.id) throw new APIError('BAD_REQUEST', { message: 'Email đã được sử dụng.' });
        }
        if (!suppliedEmail) {
          const accounts = await ctx.context.internalAdapter.findAccounts(user.id);
          if (!accounts.some(a => a.providerId === 'credential' && a.password) && !user.id.startsWith('telegram:'))
            throw new APIError('BAD_REQUEST', { message: 'Hãy tạo mật khẩu trước khi xóa email đăng nhập.' });
        }
        const updated = await ctx.context.internalAdapter.updateUser(user.id, {
          name: ctx.body.name, username: ctx.body.username,
          ...(email !== user.email ? { email, emailVerified: false } : {}),
        });
        if (!updated) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Chưa lưu được hồ sơ.' });
        await setSessionCookie(ctx, { user: updated, session });
        return ctx.json({ status: true });
      }),
      createPassword: createAuthEndpoint('/password/create', {
        method: 'POST', use: [freshSessionMiddleware],
        body: z.object({ newPassword: z.string().min(8).max(128) }),
      }, async (ctx) => {
        const { user } = ctx.context.session;
        if (!user.username && user.email.endsWith('@users.invalid')) throw new APIError('BAD_REQUEST', { message: 'Hãy lưu username trong hồ sơ trước khi tạo mật khẩu.' });
        const account = await ctx.context.internalAdapter.findCredentialAccount(user.id);
        if (account?.password) throw new APIError('BAD_REQUEST', { message: 'Tài khoản đã có mật khẩu. Vui lòng dùng chức năng đổi mật khẩu.' });
        const password = await ctx.context.password.hash(ctx.body.newPassword);
        if (account) await ctx.context.internalAdapter.updateAccount(account.id, { password });
        else await ctx.context.internalAdapter.linkAccount({ userId: user.id, accountId: user.id, providerId: 'credential', password });
        return ctx.json({ status: true });
      }),
    },
  };
}
