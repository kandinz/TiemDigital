import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, stubVendorRoutes, vendorProvider } from "./mmo.testkit.js";
import { createInMemoryStores } from "../../workers/mmo/services/mmoStores.memory.js";

afterEach(() => vi.unstubAllGlobals());

const order = { provider_id: "prodseller", product_id: "p1", product_name: "Claude Pro", quantity: 1, unit_price: 5, total_price: 5 };

function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.request("/mmo/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function storedOrders(app: ReturnType<typeof buildApp>) {
  return ((await (await app.request("/mmo/orders")).json()) as any).orders as any[];
}

describe("Order ledger: placing orders via HTTP", () => {
  it("returns delivered items as plain lines and stores one normalized order", async () => {
    stubVendorRoutes({ "/orders": { order_id: "P-1", keys: ["K1", "K2"], status: "completed" } });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")] }));

    const res = await post(app, order);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: "completed", persisted: true, delivered_items: ["K1", "K2"] });
    const rows = await storedOrders(app);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider_order_id: "P-1", status: "completed", user_id: "u1", product_name: "Claude Pro" });
    expect(rows[0].delivered_items).toEqual(["K1", "K2"]);
  });

  it.each([
    ["objects become JSON lines", { items: [{ user: "a", pass: "b" }] }, ['{"user":"a","pass":"b"}']],
    ["nested data.keys", { data: { keys: ["N1"] } }, ["N1"]],
    ["single file reference", { deliveredFileRef: "file-1" }, ["file-1"]],
    ["no delivered data", { order_id: "x" }, []],
  ])("normalizes delivered items: %s", async (_name, vendorBody, expected) => {
    stubVendorRoutes({ "/orders": vendorBody });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")] }));

    const body: any = await (await post(app, order)).json();

    expect(body.delivered_items).toEqual(expected);
  });

  it.each([
    ["success", "completed"],
    ["invited", "completed"],
    ["pending", "processing"],
    ["processing", "processing"],
    ["refunded", "failed"],
    ["something-new", "processing"],
  ])("maps vendor status %s to %s", async (vendorStatus, expected) => {
    stubVendorRoutes({ "/orders": { order_id: "S", keys: ["K"], status: vendorStatus } });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")] }));

    const body: any = await (await post(app, order)).json();

    expect(body.status).toBe(expected);
    expect((await storedOrders(app))[0].status).toBe(expected);
  });

  it("returns the vendor failure and stores nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Out of stock" }, { status: 409 })));
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")] }));

    const res = await post(app, order);
    const body: any = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ success: false, message: "Out of stock" });
    expect(await storedOrders(app)).toEqual([]);
  });

  it("retries a failed save once and still reports the order as persisted", async () => {
    stubVendorRoutes({ "/orders": { order_id: "P-2", keys: ["K"] } });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")], failInsertTimes: 1 }));

    const body: any = await (await post(app, order)).json();

    expect(body).toMatchObject({ success: true, persisted: true });
    expect(await storedOrders(app)).toHaveLength(1);
  });

  it("flags the order as not persisted after the retry fails, but still returns the delivered items", async () => {
    stubVendorRoutes({ "/orders": { order_id: "P-3", keys: ["KEEP-ME"] } });
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")], failInsertTimes: 2 }));

    const res = await post(app, order);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, persisted: false, delivered_items: ["KEEP-ME"] });
    expect(await storedOrders(app)).toEqual([]);
    expect(JSON.stringify(logSpy.mock.calls)).toContain("P-3");
    logSpy.mockRestore();
  });

  it("rejects purchases from a disabled vendor but keeps balance sync working", async () => {
    stubVendorRoutes({ "/orders": { order_id: "P-4" }, "/balance": { balance: 9 } });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller", { is_active: 0 })] }));

    const res = await post(app, order);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).message).toBe("Provider is inactive");

    const sync: any = await (await app.request("/mmo/providers/prodseller/sync-balance", { method: "POST" })).json();
    expect(sync).toMatchObject({ success: true, balance: 9 });
  });

  it("returns clear errors for missing fields, unknown providers and missing keys", async () => {
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller", { api_key: "" })] }));

    expect((await post(app, { provider_id: "prodseller" })).status).toBe(400);
    expect((await post(app, { ...order, provider_id: "ghost" })).status).toBe(404);

    const noKey = await post(app, order);
    expect(noKey.status).toBe(400);
    expect(((await noKey.json()) as any).message).toBe("API key is empty");
  });

  it("updates order status manually via PATCH /orders/:id/status", async () => {
    stubVendorRoutes({ "/orders": { order_id: "P-5", keys: ["K5"], status: "pending" } });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("prodseller")] }));

    const created: any = await (await post(app, order)).json();
    expect(created.status).toBe("processing");

    const patchRes = await app.request(`/mmo/orders/${created.order_id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody: any = await patchRes.json();
    expect(patchBody).toMatchObject({ success: true, status: "completed" });

    const rows = await storedOrders(app);
    expect(rows[0].status).toBe("completed");

    const detailRes = await app.request(`/mmo/orders/${created.order_id}`);
    expect(detailRes.status).toBe(200);
    const detailBody: any = await detailRes.json();
    expect(detailBody.order.status).toBe("completed");
    expect(detailBody.order.response_raw).toBeDefined();
  });

  it.each([
    ["data.order.order_id", { order: { order_id: "SB-101", status: "success" } }, "SB-101"],
    ["data.order.id", { order: { id: "SB-102", status: "success" } }, "SB-102"],
    ["data.order_id", { order_id: "SB-103", status: "completed" }, "SB-103"],
    ["data.id", { id: "SB-104", status: "completed" }, "SB-104"],
    ["items[0].id", { items: [{ id: "SB-105" }] }, "SB-105"],
  ])("extracts providerOrderId for Storebat from %s", async (_desc, vendorBody, expectedId) => {
    stubVendorRoutes({ "/api/reseller/orders": vendorBody });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("storebat")] }));

    const res = await post(app, {
      provider_id: "storebat",
      product_id: "sb1",
      product_name: "Storebat Item",
      quantity: 1,
      unit_price: 1,
      total_price: 1,
    });
    const body: any = await res.json();
    expect(body.success).toBe(true);
    const rows = await storedOrders(app);
    expect(rows[0].provider_order_id).toBe(expectedId);
  });
});

