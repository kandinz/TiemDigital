import { Hono } from "hono";
import { vi } from "vitest";
import type { Env, Variables } from "../../workers/mmo/bindings.js";
import { createMmoRoutes } from "../../workers/mmo/routes/mmo.js";
import { createInMemoryStores } from "../../workers/mmo/services/mmoStores.memory.js";
import type { ProviderRow } from "../../workers/mmo/services/mmoStores.js";

export function buildApp(stores: ReturnType<typeof createInMemoryStores>, role = "admin") {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1", username: "tester", displayName: "Tester", role, permissions: ["mmo"] });
    await next();
  });
  app.route("/mmo", createMmoRoutes(() => stores));
  return app;
}

export function vendorProvider(id: string, overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    id,
    name: id,
    base_url: "https://v.example",
    auth_type: "header",
    auth_key_name: "X-Key",
    api_key: "secret",
    is_active: 1,
    sort_order: 1,
    ...overrides,
  };
}

// Answers vendor calls by URL pathname; anything else is a 404.
export function stubVendorRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = routes[new URL(url).pathname];
      return body === undefined ? new Response("not found", { status: 404 }) : Response.json(body);
    })
  );
}

export async function browse(app: ReturnType<typeof buildApp>, providerId: string) {
  const res = await app.request(`/mmo/products?provider_id=${providerId}`);
  return (await res.json()) as any;
}
