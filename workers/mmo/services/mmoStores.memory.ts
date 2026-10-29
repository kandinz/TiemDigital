import { DEFAULT_USD_RATE, type MmoStores, type OrderRow, type ProviderRow } from "./mmoStores.js";
import type { CategoryConfig } from "./productCatalog.js";

interface InMemorySeed {
  providers?: ProviderRow[];
  orders?: OrderRow[];
  categories?: CategoryConfig[];
  usdRate?: number;
  // Makes the next N order inserts throw, to exercise save-failure handling.
  failInsertTimes?: number;
}

export function createInMemoryStores(seed: InMemorySeed = {}): MmoStores {
  const providers = [...(seed.providers || [])];
  const orders = [...(seed.orders || [])];
  const categories = [...(seed.categories || [])];
  let failuresLeft = seed.failInsertTimes ?? 0;

  return {
    providers: {
      async listProviders() {
        return [...providers].sort((a, b) => a.sort_order - b.sort_order);
      },
      async getUsdRate() {
        return seed.usdRate || DEFAULT_USD_RATE;
      },
      async loadSessionConfig(providerId) {
        return {
          provider: providers.find((p) => p.id === providerId) ?? null,
          usdRate: seed.usdRate || DEFAULT_USD_RATE,
          categories: [...categories],
        };
      },
      async saveBalance(providerId, balance) {
        const row = providers.find((p) => p.id === providerId);
        if (row) row.balance_cache = JSON.stringify(balance);
      },
    },
    orders: {
      async listOrders({ providerId, search, page, limit }) {
        const needle = search?.toLowerCase();
        const matched = orders
          .filter((o) => !providerId || o.provider_id === providerId)
          .filter(
            (o) =>
              !needle ||
              [o.product_name, o.provider_order_id, o.customer_email, o.delivered_data].some((v) =>
                String(v ?? "").toLowerCase().includes(needle)
              )
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return { rows: matched.slice((page - 1) * limit, page * limit), total: matched.length };
      },
      async insertOrder(order) {
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error("insert failed");
        }
        orders.push({ ...order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      },
      async findOrder(id) {
        return orders.find((o) => o.id === id) ?? null;
      },
      async hasProviderOrder(providerId, providerOrderId) {
        return orders.some((o) => o.provider_id === providerId && o.provider_order_id === providerOrderId);
      },
      async updateOrder(id, change) {
        const row = orders.find((o) => o.id === id);
        if (row) Object.assign(row, change);
      },
    },
  };
}
