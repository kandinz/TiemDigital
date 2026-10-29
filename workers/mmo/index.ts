import { Hono } from 'hono';
import type { Admin, Env } from '../types';
import type { Variables } from './bindings';
import mmo from './routes/mmo';
import catalog from './routes/mmoCatalog';

const app = new Hono<{ Bindings: Env & { MMO_ADMIN: Admin }; Variables: Variables }>().basePath('/api/admin/mmo');
app.use('*', async (c, next) => {
  const admin = c.env.MMO_ADMIN;
  c.set('user', { id: admin.userId ?? admin.email, username: admin.email, displayName: admin.email, role: 'admin', permissions: ['mmo'] });
  await next();
});
app.route('/catalog', catalog);
app.route('/', mmo);

export function mmoApi(request: Request, env: Env, admin: Admin) {
  return app.fetch(request, { ...env, MMO_ADMIN: admin });
}
