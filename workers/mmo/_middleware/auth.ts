import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../bindings';

// Identity comes only from TiệmDigital's administrator(), before this router is invoked.
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  if (!c.get('user')) return c.json({ success: false, message: 'Vui lòng đăng nhập quản trị' }, 401);
  await next();
};
export const authenticate = requireAuth;
export const requireAdmin: typeof requireAuth = async (c, next) => {
  if (c.get('user')?.role !== 'admin') return c.json({ success: false, message: 'Không đủ quyền MMO' }, 403);
  await next();
};
export const requireModuleAccess = (module: string): typeof requireAuth => async (c, next) => {
  const user = c.get('user');
  if (!user || (user.role !== 'admin' && !user.permissions.includes(module))) return c.json({ success: false, message: 'Không đủ quyền MMO' }, 403);
  await next();
};
