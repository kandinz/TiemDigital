import { env } from "cloudflare:test";
import { beforeAll, expect, it, vi } from "vitest";
import worker from "../workers/index";
import type { Env } from "../workers/types";
import { COMMERCE_SCHEMA_STATEMENTS } from "../workers/commerceSchema";
import { processOutbox } from "../workers/operations";

const origin = "http://localhost:8787";
const runtime = {
  ...env,
  APP_ORIGIN: origin,
  ADMIN_ORIGIN: origin,
  ADMIN_AUTH_MODE: "session",
  ENVIRONMENT: "local",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
  DELIVERY_KEY: btoa("x".repeat(32)),
  TELEGRAM_BOT_TOKEN: undefined,
  EMAIL: undefined,
} as Env;
let owner = "";
let ownerId = "";
let buyer = "";
let buyerId = "";
async function account(username: string) {
  const response = await call("/api/auth/register", "", {
    username,
    password: "Strong-password-42",
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const me = (await (await call("/api/me", cookie)).json()) as { id: string };
  return { cookie, id: me.id };
}
function call(
  path: string,
  cookie = owner,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  return worker.fetch(
    new Request(`${origin}${path}`, {
      method,
      headers: {
        cookie,
        origin,
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
        "cf-connecting-ip": "192.0.2.178",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    runtime,
  );
}
async function body(
  path: string,
  cookie = owner,
  input?: unknown,
  method?: string,
) {
  const response = await call(path, cookie, input, method);
  const result = (await response.json()) as any;
  expect(response.status, JSON.stringify(result)).toBeLessThan(300);
  return result;
}
beforeAll(async () => {
  const admin = await account("unified_owner");
  owner = admin.cookie;
  ownerId = admin.id;
  await env.DB.prepare(
    "INSERT INTO admin_accounts(user_id,role) VALUES(?,'owner')",
  )
    .bind(admin.id)
    .run();
  const customer = await account("unified_buyer");
  buyer = customer.cookie;
  buyerId = customer.id;
  await env.DB.prepare(
    "INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo) VALUES('unified-credit','unified-credit',?,'ADJUSTMENT',5000000,5000000,'adjustments',?,'test')",
  )
    .bind(buyerId, `wallet:${buyerId}`)
    .run();
});

it("configures Telegram notifications, registers bot commands, and skips disabled alerts", async () => {
  const previousToken = runtime.TELEGRAM_BOT_TOKEN;
  const previousSecret = runtime.TELEGRAM_WEBHOOK_SECRET;
  const sent: string[] = [];
  const telegram = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.includes("api.telegram.org")) throw new Error(`Unexpected request: ${url}`);
    sent.push(`${url} ${String(init?.body)}`);
    return Response.json({ ok: true, result: {} });
  });
  runtime.TELEGRAM_BOT_TOKEN = "test-token";
  runtime.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
  try {
    expect((await call("/api/admin/telegram/settings", buyer)).status).toBe(403);
    const original = await body("/api/admin/telegram/settings", owner);
    await body("/api/admin/telegram/settings", owner, {
      adminChatId: "12345",
      orderPaid: false,
      orderDelivered: true,
      orderPartial: true,
      adminAlert: false,
    }, "PUT");
    expect((await body("/api/admin/telegram/settings", owner)).adminAlert).toBe(false);
    await body("/api/admin/telegram/webhook", owner, {});
    await body("/api/admin/telegram/webhook-info", owner);
    await body("/api/admin/telegram/test", owner, {});
    await body("/api/admin/telegram/send", owner, { text: "Thông báo quản trị" });
    expect(sent.some((entry) => entry.includes("setMyCommands"))).toBe(true);
    expect(sent.some((entry) => entry.includes("setWebhook"))).toBe(true);
    expect(sent.some((entry) => entry.includes("getWebhookInfo"))).toBe(true);
    expect(sent.some((entry) => entry.includes("sendMessage") && entry.includes("12345"))).toBe(true);
    const eventId = `telegram-disabled-${crypto.randomUUID()}`;
    await env.DB.prepare("INSERT INTO outbox(id,user_id,kind,body) VALUES(?,?,'ADMIN_ALERT',?)")
      .bind(eventId, buyerId, JSON.stringify({ orderId: "TEST", reason: "TEST" })).run();
    const before = sent.length;
    await processOutbox(runtime, eventId);
    expect(sent.length).toBe(before);
    expect((await env.DB.prepare("SELECT status FROM outbox WHERE id=?").bind(eventId).first<{ status: string }>())?.status).toBe("DONE");
    await body("/api/admin/telegram/settings", owner, original, "PUT");
  } finally {
    runtime.TELEGRAM_BOT_TOKEN = previousToken;
    runtime.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    telegram.mockRestore();
  }
});

it("imports a completed personal supplier purchase into stock once and keeps customer purchases out", async () => {
  for (const id of [88010, 88011]) {
    await body("/api/admin/products", owner, { id, name: `Warehouse ${id}`, source: "stock", selling_price: 50000 });
  }
  await env.DB.prepare(
    "INSERT INTO mmo_orders(id,user_id,provider_id,product_id,product_name,quantity,status,delivered_items,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
  ).bind("manual_fixture", ownerId, "fixture", "sku", "Fixture item", 2, "completed", JSON.stringify(["secret-one", "secret-two"])).run();

  const path = "/api/admin/supplier-purchases/manual_fixture/import";
  expect((await call(path, buyer, { productId: 88010 })).status).toBe(403);
  expect(await body(path, owner, { productId: 88010 })).toMatchObject({ added: 2, total: 2 });
  expect(await body(path, owner, { productId: 88010 })).toMatchObject({ added: 0, total: 2 });
  expect((await call(path, owner, { productId: 88011 })).status).toBe(409);
  const inventory = (await body("/api/admin/products/88010/inventory")).inventory;
  expect(inventory.filter((row: { id: string }) => row.id.startsWith("supplier:manual_fixture:"))).toHaveLength(2);
  const stored = await env.DB.prepare("SELECT payload FROM product_inventory WHERE id='supplier:manual_fixture:0'").first<{ payload: string }>();
  expect(stored?.payload).not.toContain("secret-one");

  await env.DB.prepare("UPDATE mmo_orders SET status='processing' WHERE id='manual_fixture'").run();
  expect((await call(path, owner, { productId: 88010 })).status).toBe(409);
  await env.DB.prepare("UPDATE mmo_orders SET status='completed',user_id=? WHERE id='manual_fixture'").bind(buyerId).run();
  expect((await call(path, owner, { productId: 88010 })).status).toBe(404);

  expect(await body("/api/admin/products/88010", owner, undefined, "DELETE")).toMatchObject({ ok: true });
  const archived = (await body("/api/admin/products")).products.find((p: { id: number }) => p.id === 88010);
  expect(archived.active).toBe(0);
  expect(inventory).toHaveLength(2);
  await env.DB.prepare("INSERT INTO products(id,name,selling_price,updated_at) VALUES(88012,'Legacy product',10000,'2026-10-30')").run();
  await body("/api/admin/products/88012", owner, undefined, "DELETE");
  expect((await body("/api/admin/products")).products.find((p: { id: number }) => p.id === 88012).active).toBe(0);
});

it("uses the configured markup and raises manual sale prices proportionally, once, without lowering them on supplier discounts", async () => {
  await body("/api/admin/mmo/settings", owner, { usd_rate: 10000 }, "PUT");
  await body("/api/admin/mmo/providers", owner, {
    id: "prodseller",
    name: "Supplier",
    base_url: "https://supplier.test",
    api_key: "fixture-secret",
    auth_type: "header",
    auth_key_name: "Authorization",
  });
  let price = 10;
  const mock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      products: [{ id: "sku", name: "Supplier name", price, inStock: true }],
    }),
  );
  try {
    await body("/api/admin/products", owner, {
      id: 88003,
      name: "My edited title",
      source: "provider",
      provider_id: "prodseller",
      provider_product_id: "sku",
      markup_percent: 30,
    });
    let catalog = await body("/api/catalog", buyer);
    expect(
      catalog.products.find((p: any) => p.id === 88003).selling_price,
    ).toBe(130000);
    await body("/api/admin/products", owner, {
      id: 88003,
      name: "My edited title",
      source: "provider",
      provider_id: "prodseller",
      provider_product_id: "sku",
      selling_price: 150000,
    });
    price = 11;
    await Promise.all([
      body("/api/admin/products/sync", owner, {}),
      body("/api/admin/products/sync", owner, {}),
    ]);
    catalog = await body("/api/catalog", buyer);
    expect(catalog.products.find((p: any) => p.id === 88003)).toMatchObject({
      name: "My edited title",
      selling_price: 165000,
    });
    price = 10;
    await body("/api/admin/products/sync", owner, {});
    expect(
      (await body("/api/catalog", buyer)).products.find(
        (p: any) => p.id === 88003,
      ).selling_price,
    ).toBe(165000);
  } finally {
    mock.mockRestore();
  }
});

it("publishes locally configured stock products without exposing stored keys", async () => {
  await body(
    "/api/admin/catalog-config",
    owner,
    { markupPercent: 20, telegramChatId: "12345" },
    "PUT",
  );
  const saved = await body("/api/admin/products", owner, {
    id: 88001,
    name: "Local key",
    description: "Configured here",
    category: "Keys",
    selling_price: 120000,
    in_stock: true,
    source: "stock",
  });
  expect(saved.ok).toBe(true);
  await body("/api/admin/products/88001/inventory", owner, {
    values: ["private-key-one"],
  });
  const catalog = await body("/api/catalog", buyer);
  expect(catalog.products.find((p: any) => p.id === 88001)).toMatchObject({
    name: "Local key",
    selling_price: 120000,
    in_stock: true,
  });
  expect(JSON.stringify(catalog)).not.toContain("private-key-one");
  expect((await call("/api/admin/catalog-config", buyer)).status).toBe(403);
});

it("gives the last key to the first successful payment, delivers partial orders, and never refunds or delivers twice", async () => {
  await body("/api/admin/products", owner, {
    id: 88002,
    name: "Empty stock",
    selling_price: 10000,
    source: "stock",
    in_stock: true,
  });
  const input = {
    items: [
      { productId: 88001, quantity: 1 },
      { productId: 88002, quantity: 1 },
    ],
    customer: { fullName: "Buyer", phone: "" },
  };
  const a = await body("/api/orders", buyer, input);
  const b = await body("/api/orders", buyer, {
    ...input,
    items: [{ productId: 88001, quantity: 1 }],
  });
  expect((await call(`/api/orders/${a.id}/delivery`, buyer)).status).toBe(409);
  await body(`/api/orders/${b.id}/payments/wallet`, buyer, {});
  await body(`/api/orders/${a.id}/payments/wallet`, buyer, {});
  await body("/api/admin/maintenance", owner, {});
  expect((await body(`/api/orders/${b.id}/delivery`, buyer)).value).toContain(
    "private-key-one",
  );
  expect((await body(`/api/orders/${a.id}`, buyer)).fulfillment_status).toBe(
    "REVIEW",
  );
  expect((await call(`/api/orders/${a.id}/delivery`, buyer)).status).toBe(409);
  await body("/api/admin/maintenance", owner, {});
  const alerts = await body("/api/admin/fulfillment-alerts");
  expect(alerts.alerts.filter((v: any) => v.order_id === a.id)).toHaveLength(2);
  const history = await body("/api/me/wallet/transactions", buyer);
  expect(history.transactions.some((v: any) => v.kind === "REFUND")).toBe(
    false,
  );
  expect((await body(`/api/orders/${b.id}/delivery`, buyer)).value).toContain(
    "private-key-one",
  );
});

it("buys supplier goods only after payment, delivers a mixed order partially, and sends one admin alert through Telegram", async () => {
  await body("/api/admin/products", owner, {
    id: 88004,
    name: "Local delivered half",
    selling_price: 20000,
    source: "stock",
    in_stock: true,
  });
  await body("/api/admin/products/88004/inventory", owner, {
    values: ["partial-local-key"],
  });
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("api.telegram.org"))
        return Response.json({ ok: true, result: {} });
      if (url.endsWith("/products"))
        return Response.json({
          products: [
            { id: "sku", name: "Supplier title", price: 10, inStock: true },
          ],
        });
      if (init?.method === "POST")
        throw new DOMException("Timed out", "TimeoutError");
      throw new Error(`Unexpected outgoing request: ${url}`);
    });
  runtime.TELEGRAM_BOT_TOKEN = "test-token";
  try {
    const order = await body("/api/orders", buyer, {
      items: [
        { productId: 88003, quantity: 1 },
        { productId: 88004, quantity: 1 },
      ],
      customer: { fullName: "Buyer", phone: "" },
    });
    expect(mock).not.toHaveBeenCalled();
    await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
    await body("/api/admin/maintenance", owner, {});
    expect(
      (await body(`/api/orders/${order.id}`, buyer)).fulfillment_status,
    ).toBe("PARTIAL");
    expect(
      (await body(`/api/orders/${order.id}/delivery`, buyer)).value,
    ).toContain("partial-local-key");
    expect(
      mock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/orders") && init?.method === "POST",
      ),
    ).toHaveLength(1);
    const alerts = (await body("/api/admin/fulfillment-alerts")).alerts;
    const alert = alerts.find((v: any) => v.order_id === order.id);
    expect(alert.reason).toBe("NCC_RESULT_UNCERTAIN");
    expect(
      mock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("api.telegram.org") &&
          String(init?.body).includes(order.id),
      ),
    ).toBe(true);
    await body("/api/admin/maintenance", owner, {});
    expect(
      mock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/orders") && init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      (
        await call(
          `/api/admin/fulfillments/${encodeURIComponent(alert.fulfillment_id)}/retry`,
          owner,
          { reason: "Not verified" },
        )
      ).status,
    ).toBe(400);
    await body(
      `/api/admin/fulfillments/${encodeURIComponent(alert.fulfillment_id)}/resolve`,
      owner,
      {
        values: ["confirmed-supplier-key"],
        reason: "Đã đối soát NCC thành công",
        expectedAttempt: alert.attempts,
      },
    );
    expect(
      (await body(`/api/orders/${order.id}`, buyer)).fulfillment_status,
    ).toBe("DELIVERED");
    expect(
      (await body(`/api/orders/${order.id}/delivery`, buyer)).value,
    ).toContain("confirmed-supplier-key");
  } finally {
    mock.mockRestore();
    runtime.TELEGRAM_BOT_TOKEN = undefined;
  }
});

it("keeps paid order prices unchanged and stops a losing purchase while repricing only future orders", async () => {
  const order = await body("/api/orders", buyer, {
    items: [{ productId: 88003, quantity: 1 }],
    customer: { fullName: "Buyer" },
  });
  const originalPrice = order.total;
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      if (init?.method === "POST")
        throw new Error("Must not purchase a losing order");
      return Response.json({
        products: [
          { id: "sku", name: "Supplier name", price: 20, inStock: true },
        ],
      });
    });
  try {
    await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
    await body("/api/admin/maintenance", owner, {});
    expect((await body(`/api/orders/${order.id}`, buyer)).total).toBe(
      originalPrice,
    );
    expect(
      (await body("/api/admin/fulfillment-alerts")).alerts.find(
        (a: any) => a.order_id === order.id,
      ).reason,
    ).toBe("COST_EXCEEDS_PAID_PRICE");
    expect(mock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
    expect(
      (await body("/api/catalog", buyer)).products.find(
        (p: any) => p.id === 88003,
      ).selling_price,
    ).toBe(330000);
  } finally {
    mock.mockRestore();
  }
});

it("automatically purchases and delivers a successful supplier order exactly once", async () => {
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      if (String(input).endsWith("/products"))
        return Response.json({
          products: [
            { id: "sku", name: "Supplier name", price: 20, inStock: true },
          ],
        });
      if (init?.method === "POST")
        return Response.json({
          order_id: "supplier-complete",
          status: "completed",
          keys: ["auto-supplier-key"],
        });
      throw new Error("Unexpected outgoing request");
    });
  try {
    const order = await body("/api/orders", buyer, {
      items: [{ productId: 88003, quantity: 1 }],
      customer: { fullName: "Buyer" },
    });
    await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
    await Promise.all([
      body("/api/admin/maintenance", owner, {}),
      body("/api/admin/maintenance", owner, {}),
    ]);
    expect(
      (await body(`/api/orders/${order.id}/delivery`, buyer)).value,
    ).toContain("auto-supplier-key");
    expect(
      (await body(`/api/orders/${order.id}`, buyer)).fulfillment_status,
    ).toBe("DELIVERED");
    await body("/api/admin/maintenance", owner, {});
    expect(
      mock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/orders") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  } finally {
    mock.mockRestore();
  }
});

it("creates concurrent new products without overwriting either one", async () => {
  const [a, b] = await Promise.all(
    ["Concurrent A", "Concurrent B"].map((name) =>
      body("/api/admin/products", owner, {
        name,
        selling_price: 10000,
        source: "stock",
      }),
    ),
  );
  expect(a.id).not.toBe(b.id);
  const { products } = await body("/api/admin/products");
  expect(products.find((p: any) => p.id === a.id).name).toBe("Concurrent A");
  expect(products.find((p: any) => p.id === b.id).name).toBe("Concurrent B");
});

it("rejects stale retry confirmation after a new supplier attempt has timed out", async () => {
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      if (init?.method === "POST")
        throw new DOMException("timeout", "TimeoutError");
      return Response.json({
        products: [
          { id: "sku", name: "Supplier name", price: 20, inStock: true },
        ],
      });
    });
  try {
    const order = await body("/api/orders", buyer, {
      items: [{ productId: 88003, quantity: 1 }],
      customer: { fullName: "Buyer" },
    });
    await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
    await body("/api/admin/maintenance", owner, {});
    const alert = (await body("/api/admin/fulfillment-alerts")).alerts.find(
      (a: any) => a.order_id === order.id,
    );
    const input = {
      confirmedNoPurchase: true,
      expectedAttempt: alert.attempts,
      reason: "Đã kiểm tra chưa có đơn NCC",
    };
    const path = `/api/admin/fulfillments/${encodeURIComponent(alert.fulfillment_id)}/retry`;
    await body(path, owner, input);
    expect((await call(path, owner, input)).status).toBe(409);
    expect(
      mock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2);
  } finally {
    mock.mockRestore();
  }
});

it("recovers the same allocated stock after a delivery failure without consuming another key", async () => {
  const saved = await body("/api/admin/products", owner, {
    name: "Recoverable stock",
    selling_price: 10000,
    source: "stock",
  });
  await body(`/api/admin/products/${saved.id}/inventory`, owner, {
    values: ["first-recoverable-key"],
  });
  const order = await body("/api/orders", buyer, {
    items: [{ productId: saved.id, quantity: 1 }],
    customer: { fullName: "Buyer" },
  });
  await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
  const validKey = runtime.DELIVERY_KEY;
  runtime.DELIVERY_KEY = btoa("y".repeat(32));
  try {
    await body("/api/admin/maintenance", owner, {});
  } finally {
    runtime.DELIVERY_KEY = validKey;
  }
  const alert = (await body("/api/admin/fulfillment-alerts")).alerts.find(
    (a: any) => a.order_id === order.id,
  );
  expect(alert.reason).toBe("STOCK_DELIVERY_REVIEW");
  await body(`/api/admin/products/${saved.id}/inventory`, owner, {
    values: ["second-unused-key"],
  });
  await body(
    `/api/admin/fulfillments/${encodeURIComponent(alert.fulfillment_id)}/retry`,
    owner,
    {
      confirmedNoPurchase: true,
      expectedAttempt: alert.attempts,
      reason: "Khóa mã hóa đã được khôi phục",
    },
  );
  expect(
    (await body(`/api/orders/${order.id}/delivery`, buyer)).value,
  ).toContain("first-recoverable-key");
  expect(
    (await body("/api/admin/products")).products.find(
      (p: any) => p.id === saved.id,
    ).available,
  ).toBe(1);
});

it("edits and disables a provider through the actual D1 route", async () => {
  await body(
    "/api/admin/mmo/providers/prodseller",
    owner,
    { name: "Edited supplier", is_active: false },
    "PUT",
  );
  expect(
    (await body("/api/admin/mmo/providers")).providers.find(
      (p: any) => p.id === "prodseller",
    ).is_active,
  ).toBe(false);
  await body(
    "/api/admin/mmo/providers/prodseller",
    owner,
    { is_active: true },
    "PUT",
  );
});

it("imports legacy retail products idempotently without ID collisions or duplicating an already linked supplier product", async () => {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO products(id,name,selling_price,updated_at) VALUES(5,'Preserved existing product',10000,'2026-10-29'),(6,'Preserved supplier product',20000,'2026-10-29')",
    ),
    env.DB.prepare(
      "INSERT INTO product_sources(product_id,source,provider_id,provider_product_id) VALUES(6,'provider','legacy-vendor','already-linked')",
    ),
    env.DB.prepare(
      "INSERT INTO mmo_retail_products(id,provider_id,provider_product_id,name,original_name,selling_price,created_at,updated_at) VALUES(5,'legacy-vendor','new-sku','Imported legacy product','Imported legacy product',30000,'2026-10-29','2026-10-29'),(6,'legacy-vendor','already-linked','Duplicate alias must not be created','Original supplier title',40000,'2026-10-29','2026-10-29')",
    ),
  ]);
  for (const statement of COMMERCE_SCHEMA_STATEMENTS)
    await env.DB.prepare(statement).run();
  let catalog = (await body("/api/admin/products")).products;
  expect(catalog.find((p: any) => p.id === 5).name).toBe(
    "Preserved existing product",
  );
  expect(catalog.find((p: any) => p.id === 6).name).toBe(
    "Preserved supplier product",
  );
  const imported = catalog.find(
    (p: any) => p.name === "Imported legacy product",
  );
  expect(imported.id).not.toBe(5);
  expect(imported.source).toBe("provider");
  expect(
    catalog.some((p: any) => p.name === "Duplicate alias must not be created"),
  ).toBe(false);
  for (const statement of COMMERCE_SCHEMA_STATEMENTS)
    await env.DB.prepare(statement).run();
  catalog = (await body("/api/admin/products")).products;
  expect(
    catalog.filter((p: any) => p.name === "Imported legacy product"),
  ).toHaveLength(1);
  expect(
    catalog.find((p: any) => p.name === "Imported legacy product").id,
  ).toBe(imported.id);
});

it("keeps successful supplier delivery when its ledger write fails and lets admin acknowledge the alert without buying again", async () => {
  await env.DB.prepare(
    "CREATE TRIGGER fixture_supplier_ledger_failure BEFORE INSERT ON mmo_orders WHEN NEW.provider_order_id='fixture-ledger-failure' BEGIN SELECT RAISE(ABORT,'fixture write failure'); END",
  ).run();
  const mock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      if (String(input).endsWith("/products"))
        return Response.json({
          products: [
            { id: "sku", name: "Supplier name", price: 20, inStock: true },
          ],
        });
      if (init?.method === "POST")
        return Response.json({
          order_id: "fixture-ledger-failure",
          status: "completed",
          keys: ["durable-delivery-key"],
        });
      throw new Error("Unexpected request");
    });
  try {
    const order = await body("/api/orders", buyer, {
      items: [{ productId: 88003, quantity: 1 }],
      customer: { fullName: "Buyer" },
    });
    await body(`/api/orders/${order.id}/payments/wallet`, buyer, {});
    await body("/api/admin/maintenance", owner, {});
    expect(
      (await body(`/api/orders/${order.id}/delivery`, buyer)).value,
    ).toContain("durable-delivery-key");
    const alert = (await body("/api/admin/fulfillment-alerts")).alerts.find(
      (a: any) => a.order_id === order.id,
    );
    expect(alert).toMatchObject({
      reason: "NCC_LEDGER_REVIEW",
      status: "DELIVERED",
    });
    await body(
      `/api/admin/fulfillment-alerts/${encodeURIComponent(alert.id)}/acknowledge`,
      owner,
      { reason: "Đã đối soát bản ghi đơn NCC" },
    );
    expect(
      (await body("/api/admin/fulfillment-alerts")).alerts.some(
        (a: any) => a.order_id === order.id,
      ),
    ).toBe(false);
    await body("/api/admin/maintenance", owner, {});
    expect(
      mock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/orders") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  } finally {
    mock.mockRestore();
    await env.DB.prepare("DROP TRIGGER fixture_supplier_ledger_failure").run();
  }
});

it("supports complete admin CRUD for warehouse inventory, product lifecycle, synced supplier orders, customers, orders, approvals, and pages", async () => {
  const created = await body("/api/admin/products", owner, {
    name: "CRUD Stock Product",
    category: "Test",
    source: "stock",
    selling_price: 45000,
    active: true,
    in_stock: true,
  });
  const pid = created.id as number;

  await body(`/api/admin/products/${pid}/inventory`, owner, {
    values: ["crud-key-1", "crud-key-2"],
  });
  const invList = await body(`/api/admin/products/${pid}/inventory`, owner);
  expect(invList.items).toHaveLength(2);
  expect(invList.items.map((i: any) => i.value)).toEqual(
    expect.arrayContaining(["crud-key-1", "crud-key-2"]),
  );

  const firstItem = invList.items[0];
  await body(
    `/api/admin/products/${pid}/inventory/${firstItem.id}`,
    owner,
    { value: "crud-key-1-edited" },
    "PUT",
  );
  const afterEdit = await body(`/api/admin/products/${pid}/inventory`, owner);
  expect(afterEdit.items.find((i: any) => i.id === firstItem.id)?.value).toBe(
    "crud-key-1-edited",
  );

  for (const item of afterEdit.items) {
    await body(
      `/api/admin/products/${pid}/inventory/${item.id}`,
      owner,
      undefined,
      "DELETE",
    );
  }
  expect(
    (await body(`/api/admin/products/${pid}/inventory`, owner)).items,
  ).toHaveLength(0);

  await body(`/api/admin/products/${pid}`, owner, undefined, "DELETE");
  await body(
    `/api/admin/products/${pid}/status`,
    owner,
    { active: true, in_stock: true },
    "PATCH",
  );
  await body(
    `/api/admin/products/${pid}?permanent=1`,
    owner,
    undefined,
    "DELETE",
  );
  expect(
    (await body("/api/admin/products", owner)).products.some(
      (p: any) => p.id === pid,
    ),
  ).toBe(false);

  const syncStock = await body("/api/admin/products", owner, {
    name: "Sync Target Stock",
    source: "stock",
    selling_price: 55000,
  });
  await env.DB.prepare(
    "INSERT INTO mmo_orders(id,user_id,provider_id,provider_order_id,product_id,product_name,quantity,unit_price,total_price,currency,status,delivered_items,created_at,updated_at) VALUES('mmo_sync_test','system_sync','prodseller','ps-sync-1','sku','Synced SKU',1,1,1,'USD','completed',?,datetime('now'),datetime('now'))",
  )
    .bind(JSON.stringify(["synced-key-alpha"]))
    .run();
  const importedSync = await body(
    "/api/admin/supplier-purchases/mmo_sync_test/import",
    owner,
    { productId: syncStock.id },
  );
  expect(importedSync).toMatchObject({ added: 1, total: 1 });

  const custDetail = await body(`/api/admin/customers/${buyerId}`, owner);
  expect(custDetail.customer.id).toBe(buyerId);
  await body(
    `/api/admin/customers/${buyerId}`,
    owner,
    { name: "Updated Buyer Name", phone: "0912345678" },
    "PUT",
  );
  const custSearch = await body(
    "/api/admin/customers?q=0912345678",
    owner,
  );
  expect(custSearch.customers.some((c: any) => c.id === buyerId)).toBe(true);

  const unpaidOrder = await body("/api/orders", buyer, {
    items: [{ productId: syncStock.id, quantity: 1 }],
    customer: { fullName: "Unpaid Buyer" },
  });
  expect(
    (await body(`/api/admin/orders?q=${unpaidOrder.id}&status=UNPAID`, owner))
      .orders,
  ).toHaveLength(1);
  await body(
    `/api/admin/orders/${unpaidOrder.id}`,
    owner,
    undefined,
    "DELETE",
  );
  expect(
    (await body(`/api/admin/orders?q=${unpaidOrder.id}`, owner)).orders,
  ).toHaveLength(0);

  const pendingApproval = await body("/api/admin/approvals", owner, {
    kind: "WALLET_ADJUSTMENT",
    userId: buyerId,
    delta: 20000,
    reason: "Test cancel approval",
  });
  await body(
    `/api/admin/approvals/${pendingApproval.id}`,
    owner,
    undefined,
    "DELETE",
  );
  expect(
    (await body("/api/admin/approvals", owner)).approvals.some(
      (a: any) => a.id === pendingApproval.id,
    ),
  ).toBe(false);

  await body("/api/admin/pages", owner, {
    slug: "trang-thu-nghiem",
    title: "Trang thử nghiệm",
    description: "Mô tả",
    blocks: [{ type: "text", heading: "H1", text: "Nội dung" }],
  });
  expect(
    (await call("/api/admin/pages/trang-chu", owner, undefined, "DELETE"))
      .status,
  ).toBe(409);
  await body(
    "/api/admin/pages/trang-thu-nghiem",
    owner,
    undefined,
    "DELETE",
  );
  expect(
    (await body("/api/admin/pages", owner)).pages.some(
      (p: any) => p.slug === "trang-thu-nghiem",
    ),
  ).toBe(false);

  const currentPayCfg = await body("/api/admin/payment-config", owner);
  const updatedPayCfg = await body(
    "/api/admin/payment-config",
    owner,
    {
      config: {
        enabled: false,
        provider: "sepay",
        bankBin: "970416",
        bankName: "ACB",
        accountNumber: "88889999",
        accountHolder: "NGUYEN VAN OWNER",
        minTopup: 20000,
        maxTopup: 5000000,
        intentTtl: 900,
      },
      expectedVersion: currentPayCfg.version,
    },
    "PUT",
  );
  expect(updatedPayCfg.accountNumber).toBe("88889999");
  expect(updatedPayCfg.version).toBe(currentPayCfg.version + 1);

  const beforeWallet = (await body(`/api/admin/customers/${buyerId}`, owner))
    .customer.balance;
  await body("/api/admin/wallet-adjustments", owner, {
    userId: buyerId,
    delta: 50000,
    reason: "Owner direct wallet credit",
  });
  const afterWallet = (await body(`/api/admin/customers/${buyerId}`, owner))
    .customer.balance;
  expect(afterWallet).toBe(beforeWallet + 50000);
});
