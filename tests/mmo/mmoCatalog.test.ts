import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env, Variables } from "../../workers/mmo/bindings.js";
import mmoCatalog from "../../workers/mmo/routes/mmoCatalog.js";

function createMockDb(initialRows: any[] = []) {
  const rows = [...initialRows];

  return {
    prepare: (sql: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...params: any[]) => {
          boundParams = params;
          return stmt;
        },
        all: async <T = any>() => {
          if (sql.includes("SELECT DISTINCT category")) {
            const cats = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));
            return { results: cats.map((c) => ({ category: c })) as T[] };
          }
          if (sql.includes("FROM mmo_retail_products")) {
            let res = rows.filter((r) => (sql.includes("is_active = 1") ? r.is_active === 1 : true));
            if (boundParams.length > 0 && sql.includes("category = ?")) {
              res = res.filter((r) => r.category === boundParams[0]);
            }
            return { results: res as T[] };
          }
          return { results: [] as T[] };
        },
        first: async <T = any>() => {
          if (sql.includes("WHERE id = ?")) {
            const found = rows.find((r) => r.id === boundParams[0]);
            return (found || null) as T | null;
          }
          return null as T | null;
        },
        run: async () => {
          return { success: true };
        },
      };
      return stmt;
    },
    batch: async () => [],
  };
}

describe("MMO Catalog subrouter", () => {
  it("GET /catalog returns active public products and strictly hides provider_id and original cost", async () => {
    const mockDb = createMockDb([
      {
        id: 1,
        provider_id: "secret_vendor_1",
        provider_product_id: "vendor_prod_99",
        name: "Netflix Premium",
        description: "Tài khoản xem phim 4K",
        original_price_usd: 2.5,
        original_price: 65000,
        original_currency: "USD",
        selling_price: 90000,
        category: "Giải trí",
        image_url: null,
        in_stock: 1,
        is_active: 1,
        sort_order: 1,
        updated_at: "2026-10-25T10:00:00Z",
      },
      {
        id: 2,
        provider_id: "secret_vendor_2",
        provider_product_id: "hidden_item",
        name: "Inactive Item",
        description: "Item not on shelf",
        original_price_usd: 1.0,
        original_price: 25000,
        selling_price: 40000,
        category: "Khác",
        in_stock: 1,
        is_active: 0,
        updated_at: "2026-10-25T10:00:00Z",
      },
    ]);

    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route("/catalog", mmoCatalog);

    const res = await app.fetch(new Request("http://localhost/catalog"), { DB: mockDb as any } as any);
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.products).toHaveLength(1);

    const publicProduct = data.products[0];
    expect(publicProduct.name).toBe("Netflix Premium");
    expect(publicProduct.selling_price).toBe(90000);

    // SECURITY CHECK: Tuyệt đối không để lộ provider_id hay giá vốn vendor ra API public
    expect(publicProduct.provider_id).toBeUndefined();
    expect(publicProduct.provider_product_id).toBeUndefined();
    expect(publicProduct.original_price).toBeUndefined();
    expect(publicProduct.original_price_usd).toBeUndefined();

    // Categories list for filters
    expect(data.categories).toContain("Giải trí");
  });

  it("POST /catalog validates required fields before adding to retail shelf", async () => {
    const mockDb = createMockDb();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: "u1", username: "admin", displayName: "Admin", role: "admin", permissions: ["mmo"] });
      await next();
    });
    app.route("/catalog", mmoCatalog);

    // Missing provider_id
    const res1 = await app.fetch(
      new Request("http://localhost/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_product_id: "p1", original_name: "Test", selling_price: 50000 }),
      }),
      { DB: mockDb as any } as any
    );
    expect(res1.status).toBe(400);

    // Missing selling price
    const res2 = await app.fetch(
      new Request("http://localhost/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "v1", provider_product_id: "p1", original_name: "Test" }),
      }),
      { DB: mockDb as any } as any
    );
    expect(res2.status).toBe(400);
  });

  it("GET /catalog/openapi.json returns valid OpenAPI 3.0 specification for products", async () => {
    const mockDb = createMockDb();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route("/catalog", mmoCatalog);

    const res = await app.fetch(new Request("http://localhost/catalog/openapi.json"), { DB: mockDb as any } as any);
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toContain("MMO Product");
    expect(spec.paths["/mmo/catalog"]).toBeDefined();
    expect(spec.paths["/mmo/catalog"].get).toBeDefined();
    expect(spec.paths["/mmo/catalog/admin"].get).toBeDefined();
  });
});
