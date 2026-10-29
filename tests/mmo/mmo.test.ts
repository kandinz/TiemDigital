import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env, Variables } from "../../workers/mmo/bindings.js";
import { createMmoRoutes } from "../../workers/mmo/routes/mmo.js";
import { createInMemoryStores } from "../../workers/mmo/services/mmoStores.memory.js";

function buildApp(stores: ReturnType<typeof createInMemoryStores>, role = "admin") {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "u1", username: "tester", displayName: "Tester", role, permissions: ["mmo"] });
    await next();
  });
  app.route("/mmo", createMmoRoutes(() => stores));
  return app;
}

describe("MMO routes via HTTP seam", () => {
  it("GET /providers returns providers from the injected store with masked keys and cached balance", async () => {
    const stores = createInMemoryStores({
      providers: [
        {
          id: "storebat",
          name: "Storebat",
          base_url: "https://storebat.example",
          auth_type: "header",
          auth_key_name: "Authorization",
          api_key: "secret-key-1234",
          is_active: 1,
          sort_order: 1,
          bot_url: "https://t.me/storebat_bot",
          avatar_url: null,
          badge_color: "indigo",
          balance_cache: JSON.stringify({ balance: 12.5, currency: "USD" }),
          balance_cached_at: "2026-10-05 10:00:00",
        },
      ],
    });

    const res = await buildApp(stores).request("/mmo/providers");
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.providers).toEqual([
      {
        id: "storebat",
        name: "Storebat",
        base_url: "https://storebat.example",
        is_active: true,
        sort_order: 1,
        bot_url: "https://t.me/storebat_bot",
        avatar_url: null,
        badge_color: "indigo",
        api_key_masked: "...1234",
        balance: 12.5,
        balance_currency: "USD",
        balance_cached_at: "2026-10-05 10:00:00",
      },
    ]);
  });

  it("GET /providers hides the key suffix from non-admin users", async () => {
    const stores = createInMemoryStores({
      providers: [
        { id: "bite", name: "Bite", base_url: "https://bite.example", auth_type: "header", auth_key_name: "Authorization", api_key: "abcdefgh", is_active: 1, sort_order: 2 },
      ],
    });

    const res = await buildApp(stores, "user").request("/mmo/providers");
    const body: any = await res.json();

    expect(body.providers[0].api_key_masked).toBe("***");
  });

  it("GET /providers returns the configured exchange rate, or the default when none is set", async () => {
    const configured: any = await (await buildApp(createInMemoryStores({ usdRate: 26000 })).request("/mmo/providers")).json();
    const fallback: any = await (await buildApp(createInMemoryStores()).request("/mmo/providers")).json();

    expect(configured.usd_rate).toBe(26000);
    expect(fallback.usd_rate).toBe(25500);
  });

  it("GET /orders filters by provider, searches, pages, and exposes normalized delivered items from the injected store", async () => {
    const stores = createInMemoryStores({
      orders: [
        { id: "o1", provider_id: "bite", product_name: "ChatGPT Plus", provider_order_id: "P-1", customer_email: null, delivered_data: JSON.stringify(["key-1"]), created_at: "2026-10-05 09:00:00" },
        { id: "o2", provider_id: "storebat", product_name: "Claude Pro", provider_order_id: "P-2", customer_email: null, delivered_data: null, created_at: "2026-10-05 10:00:00" },
      ],
    });
    const app = buildApp(stores);

    const all: any = await (await app.request("/mmo/orders")).json();
    expect(all.total).toBe(2);
    expect(all.orders.map((o: any) => o.id)).toEqual(["o2", "o1"]);

    const filtered: any = await (await app.request("/mmo/orders?provider_id=bite&search=chatgpt")).json();
    expect(filtered.total).toBe(1);
    expect(filtered.orders[0].id).toBe("o1");
    expect(filtered.orders[0].delivered_items).toEqual(["key-1"]);
  });
});

const prodseller = {
  id: "prodseller",
  name: "ProdSeller",
  base_url: "https://prodseller.example",
  auth_type: "header",
  auth_key_name: "X-Key",
  api_key: "k",
  is_active: 1,
  sort_order: 1,
  bot_url: "https://t.me/prod_bot",
};

function stubVendor(products: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/balance")) return Response.json({ balance: 7 });
      if (url.endsWith("/products")) return Response.json({ products });
      return new Response("not found", { status: 404 });
    })
  );
}

describe("GET /products flat list", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a flat products array with categories, raw descriptions and ordered category names", async () => {
    stubVendor([
      { id: 1, name: "Claude Pro 1 Month", price: 20, inStock: true, description: "Line A<br>Line B" },
      { id: 2, name: "Claude Pro 3 Months", price: 55, inStock: true },
      { id: 3, name: "Mystery Tool", price: 5, inStock: false },
    ]);
    const stores = createInMemoryStores({
      providers: [prodseller],
      categories: [
        { name: "Claude", keywords: ["anthropic"] },
        { name: "Google", keywords: ["gemini"] },
      ],
    });

    const res = await buildApp(stores).request("/mmo/products?provider_id=prodseller");
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.groups).toBeUndefined();
    expect(body.products.map((p: any) => [p.name, p.category, p.provider_name])).toEqual([
      ["Claude Pro 1 Month", "Claude", "ProdSeller"],
      ["Claude Pro 3 Months", "Claude", "ProdSeller"],
      ["Mystery Tool", "Kh\u00e1c", "ProdSeller"],
    ]);
    expect(body.products[0].extra.description).toBe("Line A<br>Line B");
    expect(body.products[0].bot_url).toBe("https://t.me/prod_bot");
    expect(body.categories).toEqual(["Claude", "Google"]);
    expect(body.provider_balances[0]).toMatchObject({ provider_id: "prodseller", balance: 7 });
  });

  it("puts every product under the fallback category when no categories are configured", async () => {
    stubVendor([{ id: 1, name: "Claude Pro 1 Month", price: 20 }]);
    const stores = createInMemoryStores({ providers: [prodseller] });

    const body: any = await (await buildApp(stores).request("/mmo/products?provider_id=prodseller")).json();

    expect(body.products[0].category).toBe("Kh\u00e1c");
    expect(body.categories).toEqual([]);
  });
});

describe("provider session via HTTP", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a products request without provider_id", async () => {
    const res = await buildApp(createInMemoryStores({ providers: [prodseller] })).request("/mmo/products");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).success).toBe(false);
  });

  it("returns 404 for an unknown provider", async () => {
    const res = await buildApp(createInMemoryStores()).request("/mmo/products?provider_id=nope");
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).message).toBe("Provider not found");
  });

  it("skips a provider without API key quietly and reports its cached balance", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const stores = createInMemoryStores({
      providers: [{ ...prodseller, api_key: "", balance_cache: JSON.stringify({ balance: 3, currency: "USD" }) }],
    });

    const res = await buildApp(stores).request("/mmo/products?provider_id=prodseller");
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toEqual([]);
    expect(body.provider_errors).toEqual([]);
    expect(body.provider_balances[0]).toMatchObject({ provider_id: "prodseller", balance: 3, currency: "USD" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a missing adapter as a provider error without failing the request", async () => {
    const stores = createInMemoryStores({ providers: [{ ...prodseller, id: "ghost" }] });

    const body: any = await (await buildApp(stores).request("/mmo/products?provider_id=ghost")).json();

    expect(body.success).toBe(true);
    expect(body.provider_errors).toEqual([
      { provider_id: "ghost", error: true, message: "No adapter registered for provider: ghost" },
    ]);
  });

  it("reports a vendor HTTP failure as a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const stores = createInMemoryStores({ providers: [prodseller] });

    const body: any = await (await buildApp(stores).request("/mmo/products?provider_id=prodseller")).json();

    expect(body.products).toEqual([]);
    expect(body.provider_errors[0]).toMatchObject({ provider_id: "prodseller", message: "HTTP 500" });
  });

  it("caches the live balance so the providers list shows it afterwards", async () => {
    stubVendor([{ id: 1, name: "Item", price: 2 }]);
    const app = buildApp(createInMemoryStores({ providers: [prodseller], usdRate: 26000 }));

    const products: any = await (await app.request("/mmo/products?provider_id=prodseller")).json();
    const providers: any = await (await app.request("/mmo/providers")).json();

    expect(products.usd_rate).toBe(26000);
    expect(providers.providers[0]).toMatchObject({ balance: 7, balance_currency: "USDT" });
  });

  it("sync-balance returns and caches the balance, with clear errors for bad providers", async () => {
    stubVendor([]);
    const app = buildApp(
      createInMemoryStores({ providers: [prodseller, { ...prodseller, id: "nokey", api_key: "" }] })
    );
    const post = (id: string) => app.request(`/mmo/providers/${id}/sync-balance`, { method: "POST" });

    const ok: any = await (await post("prodseller")).json();
    expect(ok).toMatchObject({ success: true, balance: 7, currency: "USDT" });

    const noKey = await post("nokey");
    expect(noKey.status).toBe(400);
    expect(((await noKey.json()) as any).message).toBe("API key is empty");

    const missing = await post("zzz");
    expect(missing.status).toBe(404);
  });
});
