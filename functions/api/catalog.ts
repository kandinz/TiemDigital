interface Env { PLATFORM: Fetcher }
export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  env.PLATFORM.fetch(request);
