interface Env { PLATFORM: Fetcher; ASSETS: Fetcher }
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const authorization = await env.PLATFORM.fetch(request);
  if (!authorization.ok || !authorization.headers.get('content-type')?.includes('text/html')) return authorization;

  // Worker owns authorization; Pages owns the HTML and matching hashed assets of its deployment.
  const path = new URL(request.url).pathname === '/admin/mmo-ui' ? '/mmo/index.html' : '/index.html';
  const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: request.method }));
  await authorization.body?.cancel();
  const headers = new Headers(authorization.headers);
  for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
  headers.set('content-type', asset.headers.get('content-type') ?? 'text/html; charset=utf-8');
  return new Response(asset.body, { status: asset.status, headers });
};
