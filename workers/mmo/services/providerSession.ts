import { getAdapter } from "./adapters/index.js";
import type { BalanceResult, CheckOrderStatusResult, OrderParams, PlaceOrderResult, ProviderAdapter, SyncedOrderItem, UnifiedProduct } from "./adapters/types.js";
import { categorizeProduct, type CategoryConfig } from "./productCatalog.js";
import type { ProviderRow, ProviderStore } from "./mmoStores.js";

export type SessionErrorCode = "not_found" | "no_key" | "no_adapter" | "inactive" | "no_status_check";

export class SessionError extends Error {
  constructor(readonly code: SessionErrorCode, message: string) {
    super(message);
  }

  get status(): 404 | 400 {
    return this.code === "not_found" ? 404 : 400;
  }
}

export interface ProviderSession {
  provider: ProviderRow;
  usdRate: number;
  categories: CategoryConfig[];
  hasKey: boolean;
  fetchProducts(): Promise<UnifiedProduct[]>;
  fetchBalance(): Promise<BalanceResult>;
  placeOrder(params: OrderParams): Promise<PlaceOrderResult>;
  syncOrders(): Promise<SyncedOrderItem[]>;
  checkStatus(orderCode: string): Promise<CheckOrderStatusResult>;
}

// Whether the vendor integration can inspect background (invite) order status.
export function supportsStatusCheck(providerId: string): boolean {
  return typeof getAdapter(providerId)?.checkOrderStatus === "function";
}

// Opens a vendor session bound to its adapter, exchange rate and category config.
export async function openSession(store: ProviderStore, providerId: string): Promise<ProviderSession> {
  const { provider, usdRate, categories } = await store.loadSessionConfig(providerId);
  if (!provider) throw new SessionError("not_found", "Provider not found");

  const hasKey = Boolean(provider.api_key);
  const ctx = { provider, usdRate };

  const ready = (): ProviderAdapter => {
    if (!hasKey) throw new SessionError("no_key", "API key is empty");
    const adapter = getAdapter(provider.id);
    if (!adapter) throw new SessionError("no_adapter", `No adapter registered for provider: ${provider.id}`);
    return adapter;
  };

  return {
    provider,
    usdRate,
    categories,
    hasKey,
    async fetchProducts() {
      const products = await ready().fetchProducts(ctx);
      for (const p of products) {
        p.provider_name = provider.name;
        p.bot_url = provider.bot_url || null;
        p.avatar_url = provider.avatar_url || null;
        p.category = categorizeProduct(p.name, categories);
      }
      return products;
    },
    async fetchBalance() {
      const balance = await ready().fetchBalance(ctx);
      // A failed cache write must not hide a balance that was fetched successfully.
      await store.saveBalance(provider.id, balance).catch(() => undefined);
      return balance;
    },
    async placeOrder(params) {
      // Only new purchases are blocked for disabled vendors; reads and settlement stay available.
      if (provider.is_active === 0) throw new SessionError("inactive", "Provider is inactive");
      return ready().placeOrder(ctx, params);
    },
    async syncOrders() {
      return ready().syncOrders(ctx);
    },
    async checkStatus(orderCode) {
      const adapter = ready();
      if (!adapter.checkOrderStatus) {
        throw new SessionError("no_status_check", `Provider ${provider.id} does not support order status inspection`);
      }
      return adapter.checkOrderStatus(ctx, orderCode);
    },
  };
}
