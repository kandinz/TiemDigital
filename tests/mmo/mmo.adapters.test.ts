import { afterEach, describe, expect, it, vi } from "vitest";
import { browse, buildApp, stubVendorRoutes, vendorProvider } from "./mmo.testkit.js";
import { createInMemoryStores } from "../../workers/mmo/services/mmoStores.memory.js";

afterEach(() => vi.unstubAllGlobals());

interface VendorCase {
  id: string;
  routes: Record<string, unknown>;
  product: { provider_product_id: string; price_usd: number; in_stock: boolean };
  balance: number;
}

const batch1: VendorCase[] = [
  {
    id: "storebat",
    routes: {
      "/api/reseller/products": { products: [{ id: 1, name: "A", price_usd: 5, stock: 3 }] },
      "/api/reseller/me": { wallet_balance: 12.5 },
    },
    product: { provider_product_id: "1", price_usd: 5, in_stock: true },
    balance: 12.5,
  },
  {
    id: "prodseller",
    routes: {
      "/products": { products: [{ id: 2, name: "A", price: 4, inStock: true }] },
      "/balance": { balance: 7 },
    },
    product: { provider_product_id: "2", price_usd: 4, in_stock: true },
    balance: 7,
  },
  {
    id: "aitools",
    routes: {
      "/api/v2/telegram-buyer/products": {
        products: [{ id: 3, name: "A", price: { amount: 5, currency: "USD" }, availability: { available: 0 } }],
      },
      "/api/v2/telegram-buyer/balance": { balanceUsd: 3.11 },
    },
    product: { provider_product_id: "3", price_usd: 5, in_stock: false },
    balance: 3.11,
  },
  {
    id: "tdsreseller",
    routes: {
      "/api/v1/products": { services: [{ service_id: 9, name: "A", price: 2, stock: 5 }] },
      "/api/v1/me": { wallet_balance: 4 },
    },
    product: { provider_product_id: "9", price_usd: 2, in_stock: true },
    balance: 4,
  },
  {
    id: "daiphuc",
    routes: {
      "/v1/products": { data: [{ id: 4, name: "A", price: 51000, stock: 2 }] },
      "/v1/me": { wallet_balance: 255000 },
    },
    product: { provider_product_id: "4", price_usd: 2, in_stock: true },
    balance: 10,
  },
];

describe.each(batch1)("vendor adapter $id", ({ id, routes, product, balance }) => {
  it("maps products and balance through the HTTP seam", async () => {
    stubVendorRoutes(routes);
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.provider_errors).toEqual([]);
    expect(body.products[0]).toMatchObject({ provider_id: id, ...product });
    expect(body.provider_balances[0].balance).toBe(balance);
  });

  it("surfaces a vendor HTTP failure as a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.products).toEqual([]);
    expect(body.provider_errors[0].message).toBe("HTTP 502");
  });
});

describe("VND to USD conversion", () => {
  it("rounds VND-priced products to two decimals (aitools)", async () => {
    stubVendorRoutes({
      "/api/v2/telegram-buyer/products": { products: [{ id: 1, name: "Cheap", price: { amount: 1000, currency: "VND" } }] },
      "/api/v2/telegram-buyer/balance": { balanceUsd: 1 },
    });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("aitools")], usdRate: 25500 }));

    const body = await browse(app, "aitools");

    expect(body.products[0]).toMatchObject({ price_usd: 0.04, price_original: 1000, currency_original: "VND" });
  });
});

const batch2: VendorCase[] = [
  {
    id: "bite",
    routes: {
      "/v1/products": { products: [{ id: 5, name: "A", price: 3, stock: 2 }] },
      "/v1/balance": { balance: 5, currency: "USD" },
    },
    product: { provider_product_id: "5", price_usd: 3, in_stock: true },
    balance: 5,
  },
  {
    id: "aiverse",
    routes: {
      "/api/v1/products": { services: [{ service_id: 6, name: "A", price: 2, stock: 0 }] },
      "/api/v1/me": { wallet_balance: 6 },
    },
    product: { provider_product_id: "6", price_usd: 2, in_stock: false },
    balance: 6,
  },
  {
    id: "primedigital",
    routes: {
      "/api/v1/products": { data: [{ id: 7, name: "A", price: 4 }] },
      "/api/v1/balance": { data: { balance: 8 } },
    },
    product: { provider_product_id: "7", price_usd: 4, in_stock: true },
    balance: 8,
  },
  {
    id: "fatcatstore",
    routes: {
      "/api/products": { products: [{ id: 8, name: "A", price_vnd: 51000, stock: 2 }] },
      "/api/balance": { balance_vnd: 255000 },
    },
    product: { provider_product_id: "8", price_usd: 2, in_stock: true },
    balance: 10,
  },
  {
    id: "fishymarket",
    routes: {
      "/api/telegram-buyer/products": {
        walletCurrency: "VND",
        products: [{ _id: "f1", product_name: "A", pricing: 51000, stats: { available: 3 } }],
      },
      "/api/telegram-buyer/balance": { balance: 255000, walletCurrency: "VND" },
    },
    product: { provider_product_id: "f1", price_usd: 2, in_stock: true },
    balance: 10,
  },
];

describe.each(batch2)("vendor adapter $id", ({ id, routes, product, balance }) => {
  it("maps products and balance through the HTTP seam", async () => {
    stubVendorRoutes(routes);
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.provider_errors).toEqual([]);
    expect(body.products[0]).toMatchObject({ provider_id: id, ...product });
    expect(body.provider_balances[0].balance).toBe(balance);
  });

  it("surfaces a vendor HTTP failure as a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.products).toEqual([]);
    expect(body.provider_errors[0].message).toContain("HTTP 502");
  });
});

describe("VND to USD conversion for the remaining vendors", () => {
  it("rounds fatcatstore prices and balance to two decimals", async () => {
    stubVendorRoutes({
      "/api/products": { products: [{ id: 1, name: "Cheap", price_vnd: 1000, stock: 1 }] },
      "/api/balance": { balance_vnd: 1000 },
    });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("fatcatstore")], usdRate: 25500 }));

    const body = await browse(app, "fatcatstore");

    expect(body.products[0]).toMatchObject({ price_usd: 0.04, price_original: 1000, currency_original: "VND" });
    expect(body.provider_balances[0]).toMatchObject({ balance: 0.04, balance_original: 1000, currency_original: "VND" });
  });

  it("rounds fishymarket prices to two decimals", async () => {
    stubVendorRoutes({
      "/api/telegram-buyer/products": {
        walletCurrency: "VND",
        products: [{ _id: "f", product_name: "Cheap", pricing: 1000, stats: { available: 1 } }],
      },
      "/api/telegram-buyer/balance": { balance: 1000, walletCurrency: "VND" },
    });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("fishymarket")], usdRate: 25500 }));

    const body = await browse(app, "fishymarket");

    expect(body.products[0].price_usd).toBe(0.04);
    expect(body.provider_balances[0].balance).toBe(0.04);
  });
});

const batch3: VendorCase[] = [
  {
    id: "taphoabanlo",
    routes: {
      "/api/partner/products": [{ id: "tp1", public_id: "tp1", name: "A", price: 51000, stock: 5 }],
      "/api/partner/balance": { success: true, balance: 255000 },
    },
    product: { provider_product_id: "tp1", price_usd: 2, in_stock: true },
    balance: 10,
  },
  {
    id: "hylehubstore",
    routes: {
      "/api/products": { success: true, products: [{ id: "h1", name: "A", price: 51000, stock: 3, group: "G", format: "auto" }] },
      "/api/wallet/balance": { success: true, balance: 255000 },
    },
    product: { provider_product_id: "h1", price_usd: 2, in_stock: true },
    balance: 10,
  },
  {
    id: "chodaumoi",
    routes: {
      "/public-api/v1/products": { success: true, products: [{ id: "c1", name: "A", price: 51000, stock: 4, category: "C" }] },
    },
    product: { provider_product_id: "c1", price_usd: 2, in_stock: true },
    balance: 0,
  },
  {
    id: "shopnguyenanh",
    routes: {
      "/api/partner/products": { success: true, data: [{ id: 12, name: "A", price: 51000, stock: 2 }] },
      "/api/partner/balance": { success: true, data: { balance: 255000, currency: "VND" } },
    },
    product: { provider_product_id: "12", price_usd: 2, in_stock: true },
    balance: 10,
  },
  {
    id: "kaigubai",
    routes: {
      "/api/partner/v1/products": { success: true, data: [{ product_id: "k1", name: "A", price: 51000, stock: 10, is_available: true }] },
      "/api/partner/v1/balance": { success: true, data: { balance: 255000, currency: "VND" } },
    },
    product: { provider_product_id: "k1", price_usd: 2, in_stock: true },
    balance: 10,
  },
  {
    id: "digitalcore",
    routes: {
      "/api/user/products": [{ id: "gemini_pro", name: "Gemini Pro", price: 0.95, stock: 10, description: "desc" }],
      "/api/user/me": { balance: 14.5, total_orders: "5" },
    },
    product: { provider_product_id: "gemini_pro", price_usd: 0.95, in_stock: true },
    balance: 14.5,
  },
  {
    id: "pandoradigital",
    routes: {
      "/api/v1/products": { items: [{ id: "p1", name: "Pandora Prod", unit_price: "4.5", available_stock: 10 }] },
      "/api/v1/balance": { available_balance: "22.5", currency: "USD" },
    },
    product: { provider_product_id: "p1", price_usd: 4.5, in_stock: true },
    balance: 22.5,
  },
  {
    id: "prastyaneki",
    routes: {
      "/v1/products": { code: 200, success: true, count: 1, products: [{ id: "p1", name: "PRS Prod", price_idr: 16000, availability: "in_stock" }] },
      "/v1/balance": { code: 200, success: true, balance: 32000, currency: "IDR", balance_usdt: 0 },
    },
    product: { provider_product_id: "p1", price_usd: 1, in_stock: true },
    balance: 2,
  },
];

describe.each(batch3)("vendor adapter $id", ({ id, routes, product, balance }) => {
  it("maps products and balance through the HTTP seam", async () => {
    stubVendorRoutes(routes);
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.provider_errors).toEqual([]);
    expect(body.products[0]).toMatchObject({ provider_id: id, ...product });
    expect(body.provider_balances[0].balance).toBe(balance);
  });

  it("surfaces a vendor HTTP failure as a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider(id)] }));

    const body = await browse(app, id);

    expect(body.products).toEqual([]);
    expect(body.provider_errors[0].message).toContain("HTTP 502");
  });
});
