import { expect, it, vi } from 'vitest';
import { onRequest } from '../functions/admin/[[path]]';

it.each(['/admin', '/admin/mmo', '/admin/mmo-ui'])('serves %s from the same Pages deployment as its JS assets after Worker authorization', async path => {
  const platform = vi.fn(async () => new Response('<script src="/mmo/assets/worker-old.js"></script>', { headers: { 'content-type': 'text/html', 'content-security-policy': "frame-ancestors 'self'", 'cache-control': 'no-store', etag: 'worker-old' } }));
  const assets = vi.fn(async () => new Response('<script src="/mmo/assets/pages-current.js"></script>', { headers: { 'content-type': 'text/html' } }));
  const response = await onRequest({ request: new Request(`https://tiemdigital.pages.dev${path}`), env: { PLATFORM: { fetch: platform }, ASSETS: { fetch: assets } } } as unknown as Parameters<typeof onRequest>[0]);
  expect(await response.text()).toContain('pages-current.js');
  expect(platform).toHaveBeenCalledOnce();
  expect(new URL(assets.mock.calls[0][0].url).pathname).toBe(path === '/admin/mmo-ui' ? '/mmo/index.html' : '/index.html');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
  expect(response.headers.has('etag')).toBe(false);
});

it('preserves denied admin responses and redirects without serving private UI assets', async () => {
  for (const status of [401, 403, 302]) {
    const assets = vi.fn();
    const response = await onRequest({ request: new Request('https://tiemdigital.pages.dev/admin/mmo-ui'), env: { PLATFORM: { fetch: async () => new Response('denied', { status }) }, ASSETS: { fetch: assets } } } as unknown as Parameters<typeof onRequest>[0]);
    expect(response.status).toBe(status);
    expect(assets).not.toHaveBeenCalled();
  }
});
