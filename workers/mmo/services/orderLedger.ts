import type { PlaceOrderResult } from "./adapters/types.js";
import { openSession, supportsStatusCheck, type ProviderSession } from "./providerSession.js";
import type { MmoStores, OrderListQuery, OrderRow, OrderStore } from "./mmoStores.js";
import { deliveredItemsOfRow, isObject, normalizeDeliveredItems, normalizeStatus, parseJson, type OrderStatus } from "./orderNormalization.js";

export interface PlaceOrderInput {
  provider_id: string;
  product_id: string | number;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  email?: string | null;
}

export type PlaceOrderOutcome =
  | { ok: true; order_id: string; status: OrderStatus; delivered_items: string[]; persisted: boolean; order: unknown }
  | { ok: false; statusCode: number; message: string; details: unknown };

export async function placeOrder(
  session: ProviderSession,
  orders: OrderStore,
  userId: string,
  input: PlaceOrderInput
): Promise<PlaceOrderOutcome> {
  const quantity = Number(input.quantity) || 1;
  const result: PlaceOrderResult = await session.placeOrder({
    product_id: input.product_id,
    quantity,
    email: input.email,
    product_name: input.product_name,
    unit_price: input.unit_price,
    total_price: input.total_price,
  });

  if (!result.success) {
    return { ok: false, statusCode: result.statusCode || 500, message: result.error || "Order failed", details: result.data };
  }

  const status = normalizeStatus(result.status);
  const deliveredItems = normalizeDeliveredItems(result.delivered ?? result.data);
  const orderId = `mmo_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const row = {
    id: orderId,
    user_id: userId,
    provider_id: input.provider_id,
    provider_order_id: result.providerOrderId ? String(result.providerOrderId) : null,
    product_id: String(input.product_id),
    product_name: String(input.product_name || `Product #${input.product_id}`),
    quantity,
    unit_price: Number(input.unit_price) || 0,
    total_price: Number(input.total_price) || 0,
    currency: "USD",
    status,
    delivered_data: result.delivered ? JSON.stringify(result.delivered) : (result.data ? JSON.stringify(result.data) : null),
    delivered_items: JSON.stringify(deliveredItems),
    customer_email: input.email || null,
    response_raw: JSON.stringify(result.data),
  };

  // The vendor already charged us: retry once, then report instead of hiding a lost record.
  let persisted = false;
  for (let attempt = 0; attempt < 2 && !persisted; attempt++) {
    try {
      await orders.insertOrder(row);
      persisted = true;
    } catch (err) {
      if (attempt === 1) {
        console.error("[mmo] Purchase succeeded but order could not be saved", {
          provider_id: input.provider_id,
          provider_order_id: row.provider_order_id,
          total_price: row.total_price,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { ok: true, order_id: orderId, status, delivered_items: deliveredItems, persisted, order: result.data };
}

function errorMessageOf(responseRaw: unknown): string | null {
  const raw = parseJson(responseRaw);
  if (!isObject(raw)) return null;
  const candidates = [raw.status_check?.errorMessage, raw.errorMessage, raw.message, raw.error];
  const found = candidates.find((v) => typeof v === "string" && v);
  return found ?? null;
}

// What the UI receives: no vendor-specific shapes, only normalized fields.
export function toOrderView(row: OrderRow, options?: { includeRaw?: boolean }) {
  const { delivered_data, response_raw, delivered_items: _stored, ...rest } = row;
  const status = normalizeStatus(row.status);
  const linkedTxId = (row.linked_transaction_id as number | undefined) ?? null;
  const view: Record<string, any> = {
    ...rest,
    status,
    linked_transaction_id: linkedTxId,
    is_sold: Boolean(linkedTxId),
    delivered_items: deliveredItemsOfRow(row),
    error_message: status === "failed" ? errorMessageOf(response_raw) : null,
    can_check_status: supportsStatusCheck(row.provider_id),
  };
  if (options?.includeRaw) {
    view.response_raw = response_raw;
    view.delivered_data = delivered_data;
  }
  return view;
}

export function toOrderDetailView(row: OrderRow) {
  return toOrderView(row, { includeRaw: true });
}

export async function listOrders(orders: OrderStore, query: OrderListQuery) {
  const { rows, total } = await orders.listOrders(query);
  return { orders: rows.map((r) => toOrderView(r)), total };
}

// Imports vendor-side orders that the app does not know yet; returns how many were added.
export async function syncProvider(session: ProviderSession, orders: OrderStore): Promise<number> {
  let added = 0;
  for (const item of await session.syncOrders()) {
    if (!item.provider_order_id) continue;
    if (await orders.hasProviderOrder(session.provider.id, item.provider_order_id)) continue;

    await orders.insertOrder({
      id: `mmo_sync_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      user_id: "system_sync",
      provider_id: session.provider.id,
      provider_order_id: item.provider_order_id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      currency: item.currency || "USD",
      status: normalizeStatus(item.status),
      delivered_data: item.delivered_data ? JSON.stringify(item.delivered_data) : null,
      delivered_items: JSON.stringify(normalizeDeliveredItems(item.delivered_data)),
      customer_email: item.customer_email || null,
      response_raw: JSON.stringify(item.raw),
    });
    added++;
  }
  return added;
}

export interface SyncAllResult {
  total_synced: number;
  results: Array<{
    provider_id: string;
    provider_name: string;
    synced_count: number;
    error?: string;
  }>;
}

/**
 * Đồng bộ lịch sử đơn hàng từ tất cả các nhà cung cấp đang kích hoạt và có API key
 */
export async function syncAllProviders(stores: MmoStores): Promise<SyncAllResult> {
  const providers = await stores.providers.listProviders();
  const activeWithKeys = providers.filter(
    (p) => Boolean(p.is_active) && typeof p.api_key === "string" && p.api_key.trim().length > 0
  );

  let total_synced = 0;
  const results: SyncAllResult["results"] = [];

  for (const p of activeWithKeys) {
    try {
      const session = await openSession(stores.providers, p.id);
      const count = await syncProvider(session, stores.orders);
      total_synced += count;
      results.push({ provider_id: p.id, provider_name: p.name, synced_count: count });
    } catch (err: any) {
      results.push({
        provider_id: p.id,
        provider_name: p.name,
        synced_count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { total_synced, results };
}

export type RefreshOutcome =
  | { ok: true; order_id: string; provider_order_id: string; status: OrderStatus; raw_status: string; error_message: string | null; data: unknown }
  | { ok: false; statusCode: 400 | 404; message: string };

// Provider-level problems surface as SessionError from openSession/checkStatus.
export async function refreshStatus(stores: MmoStores, orderId: string): Promise<RefreshOutcome> {
  const order = await stores.orders.findOrder(orderId);
  if (!order) return { ok: false, statusCode: 404, message: "Order not found" };
  if (!order.provider_order_id) return { ok: false, statusCode: 400, message: "Order has no provider order ID to check" };

  const session = await openSession(stores.providers, order.provider_id);
  const result = await session.checkStatus(String(order.provider_order_id));
  const status = normalizeStatus(result.status || order.status);

  // The status payload is added next to the purchase response instead of replacing it.
  const original = parseJson(order.response_raw);
  const merged = { ...(isObject(original) ? original : {}), status_check: result.data ?? result };
  await stores.orders.updateOrder(orderId, { status, response_raw: JSON.stringify(merged) });

  return {
    ok: true,
    order_id: orderId,
    provider_order_id: String(order.provider_order_id),
    status,
    raw_status: result.status,
    error_message: result.errorMessage ?? null,
    data: result.data,
  };
}
