import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, stubVendorRoutes, vendorProvider } from "./mmo.testkit.js";
import { createInMemoryStores } from "../../workers/mmo/services/mmoStores.memory.js";
import type { OrderRow } from "../../workers/mmo/services/mmoStores.js";

afterEach(() => vi.unstubAllGlobals());

function orderRow(overrides: Partial<OrderRow> & { id: string; provider_id: string }): OrderRow {
  return {
    created_at: "2026-10-05 10:00:00",
    product_name: "Product",
    provider_order_id: null,
    customer_email: null,
    delivered_data: null,
    delivered_items: null,
    response_raw: null,
    status: "completed",
    ...overrides,
  };
}

async function listOrders(app: ReturnType<typeof buildApp>) {
  return ((await (await app.request("/mmo/orders")).json()) as any).orders as any[];
}

const checkStatus = (app: ReturnType<typeof buildApp>, id: string) =>
  app.request(`/mmo/orders/${id}/check-status`, { method: "POST" });

describe("Order ledger: history", () => {
  it("lists delivered items, normalized status, error message and status-check support", async () => {
    const stores = createInMemoryStores({
      providers: [vendorProvider("fishymarket"), vendorProvider("prodseller")],
      orders: [
        orderRow({ id: "new", provider_id: "fishymarket", status: "processing", delivered_items: '["A"]', delivered_data: '["A"]', response_raw: '{"order_id":"x"}', created_at: "2026-10-05 12:00:00" }),
        orderRow({ id: "legacy", provider_id: "prodseller", status: "invited", delivered_data: JSON.stringify({ keys: ["L1", "L2"] }), created_at: "2026-10-05 11:00:00" }),
        orderRow({ id: "failed", provider_id: "prodseller", status: "failed", response_raw: '{"errorMessage":"No seat"}' }),
      ],
    });

    const orders = await listOrders(buildApp(stores));
    const byId = Object.fromEntries(orders.map((o) => [o.id, o]));

    expect(byId.new).toMatchObject({ status: "processing", delivered_items: ["A"], can_check_status: true });
    expect(byId.legacy).toMatchObject({ status: "completed", delivered_items: ["L1", "L2"], can_check_status: false });
    expect(byId.failed).toMatchObject({ status: "failed", error_message: "No seat", delivered_items: [] });
    for (const o of orders) {
      expect(o).not.toHaveProperty("delivered_data");
      expect(o).not.toHaveProperty("response_raw");
    }
  });

  it("refreshes a processing order to completed and keeps the original purchase response", async () => {
    stubVendorRoutes({ "/api/telegram-buyer/order/ORD-1/status": { status: "invited", inviteStatus: "invited", orderCode: "ORD-1" } });
    const stores = createInMemoryStores({
      providers: [vendorProvider("fishymarket")],
      orders: [orderRow({ id: "o1", provider_id: "fishymarket", provider_order_id: "ORD-1", status: "processing", response_raw: '{"orderCode":"ORD-1","purchase":"original"}' })],
    });
    const app = buildApp(stores);

    const body: any = await (await checkStatus(app, "o1")).json();

    expect(body).toMatchObject({ success: true, status: "completed", provider_order_id: "ORD-1" });
    expect((await listOrders(app))[0].status).toBe("completed");
    const stored = (await stores.orders.listOrders({ page: 1, limit: 10 })).rows[0];
    const raw = JSON.parse(stored.response_raw as string);
    expect(raw.purchase).toBe("original");
    expect(raw.status_check.status).toBe("invited");
  });

  it("marks an order failed and exposes the vendor error message", async () => {
    stubVendorRoutes({ "/api/telegram-buyer/order/ORD-2/status": { status: "failed", errorMessage: "No seat" } });
    const stores = createInMemoryStores({
      providers: [vendorProvider("fishymarket")],
      orders: [orderRow({ id: "o2", provider_id: "fishymarket", provider_order_id: "ORD-2", status: "processing", response_raw: "{}" })],
    });
    const app = buildApp(stores);

    const body: any = await (await checkStatus(app, "o2")).json();
    const listed = (await listOrders(app))[0];

    expect(body).toMatchObject({ status: "failed", error_message: "No seat" });
    expect(listed).toMatchObject({ status: "failed", error_message: "No seat" });
  });

  it("rejects status checks for unknown orders, orders without vendor id and unsupported vendors", async () => {
    const stores = createInMemoryStores({
      providers: [vendorProvider("fishymarket"), vendorProvider("prodseller")],
      orders: [
        orderRow({ id: "noid", provider_id: "fishymarket" }),
        orderRow({ id: "unsupported", provider_id: "prodseller", provider_order_id: "P-1" }),
      ],
    });
    const app = buildApp(stores);

    expect((await checkStatus(app, "missing")).status).toBe(404);
    expect((await checkStatus(app, "noid")).status).toBe(400);
    const unsupported = await checkStatus(app, "unsupported");
    expect(unsupported.status).toBe(400);
    expect(((await unsupported.json()) as any).message).toContain("does not support");
  });
});

describe("Order ledger: sync from vendor", () => {
  const vendorOrders = { orders: [{ order_id: "T1", service_id: 1, name: "X", price: 2, quantity: 1, status: "success", keys: ["K"] }] };

  it("imports vendor orders once and never duplicates them", async () => {
    stubVendorRoutes({ "/api/v1/orders": vendorOrders });
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("tdsreseller", { name: "TDS" })] }));
    const sync = () => app.request("/mmo/orders/sync-provider/tdsreseller", { method: "POST" });

    const first: any = await (await sync()).json();
    const second: any = await (await sync()).json();
    const orders = await listOrders(app);

    expect(first).toMatchObject({ success: true, synced_count: 1, message: "Synced 1 orders from TDS" });
    expect(second.synced_count).toBe(0);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ provider_order_id: "T1", status: "completed", delivered_items: ["K"], user_id: "system_sync" });
  });

  it("does not re-import an order that was already bought through the app", async () => {
    stubVendorRoutes({ "/api/v1/orders": vendorOrders });
    const stores = createInMemoryStores({
      providers: [vendorProvider("tdsreseller")],
      orders: [orderRow({ id: "bought", provider_id: "tdsreseller", provider_order_id: "T1" })],
    });

    const body: any = await (await buildApp(stores).request("/mmo/orders/sync-provider/tdsreseller", { method: "POST" })).json();

    expect(body.synced_count).toBe(0);
  });

  it("reports vendor and configuration failures clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const app = buildApp(createInMemoryStores({ providers: [vendorProvider("tdsreseller"), vendorProvider("bite", { api_key: "" })] }));

    const failed = await app.request("/mmo/orders/sync-provider/tdsreseller", { method: "POST" });
    expect(failed.status).toBe(500);
    expect(((await failed.json()) as any).message).toBe("Sync failed: HTTP 500");

    expect((await app.request("/mmo/orders/sync-provider/bite", { method: "POST" })).status).toBe(400);
    expect((await app.request("/mmo/orders/sync-provider/ghost", { method: "POST" })).status).toBe(404);
  });

  it("syncs all active providers with keys and reports cumulative total", async () => {
    stubVendorRoutes({
      "/api/v1/orders": vendorOrders,
      "/v1/transactions": { orders: [{ orderId: "B1", productId: "p2", amount: 10, status: "completed" }] },
    });
    const app = buildApp(
      createInMemoryStores({
        providers: [
          vendorProvider("tdsreseller", { name: "TDS", is_active: 1, api_key: "k1" }),
          vendorProvider("bite", { name: "Bite", is_active: 1, api_key: "k2" }),
          vendorProvider("prodseller", { name: "Disabled", is_active: 0, api_key: "k3" }),
          vendorProvider("aiverse", { name: "NoKey", is_active: 1, api_key: "" }),
        ],
      })
    );

    const res = await app.request("/mmo/orders/sync-all", { method: "POST" });
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      total_synced: 2,
    });
    expect(body.results).toHaveLength(2);
    const orders = await listOrders(app);
    expect(orders).toHaveLength(2);
  });

  it("sync-all is resilient and continues syncing remaining providers when one fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url).includes("tds.example")) {
          return new Response("server error", { status: 500 });
        }
        return Response.json({ orders: [{ orderId: "B2", productId: "p3", amount: 5, status: "completed" }] });
      })
    );

    const app = buildApp(
      createInMemoryStores({
        providers: [
          vendorProvider("tdsreseller", { name: "TDS", base_url: "https://tds.example", is_active: 1, api_key: "k1" }),
          vendorProvider("bite", { name: "Bite", base_url: "https://bite.example", is_active: 1, api_key: "k2" }),
        ],
      })
    );

    const res = await app.request("/mmo/orders/sync-all", { method: "POST" });
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      total_synced: 1,
    });
    const tdsRes = body.results.find((r: any) => r.provider_id === "tdsreseller");
    const biteRes = body.results.find((r: any) => r.provider_id === "bite");
    expect(tdsRes.error).toBeDefined();
    expect(biteRes.synced_count).toBe(1);
  });
});
