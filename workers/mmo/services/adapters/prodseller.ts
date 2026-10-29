import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp ProdSeller
 */
export const prodsellerAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ ProdSeller
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/products"), { headers });
    const items = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      if (!item.price || item.price <= 0) continue;
      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: item.price,
        price_original: item.price,
        currency_original: "USDT",
        in_stock: item.inStock !== false,
        delivery_type: item.delivery?.type,
        extra: {
          stock: typeof item.stock === "number" ? item.stock : (typeof item.quantity === "number" ? item.quantity : undefined),
          requiresEmailActivation: item.requiresEmailActivation,
          publicPrice: item.publicPrice,
          image_url: item.imageUrl,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ ProdSeller
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/balance"), { headers });
    return {
      balance: data.balance || 0,
      currency: "USDT"
    };
  },

  /**
   * Đặt mua sản phẩm qua API ProdSeller
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID()
    };
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/orders");
    const reqBody: any = {
      productId: params.product_id,
      quantity: params.quantity
    };
    if (params.email) {
      reqBody.email = params.email;
    }

    const resp = await providerFetch(url, { method: "POST", headers, body: JSON.stringify(reqBody) }, 15000);

    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        success: false,
        statusCode: resp.status,
        error: data?.message || data?.error?.message || data?.error || `Order failed: HTTP ${resp.status}`,
        data
      };
    }

    const providerOrderId = data?.order_id || data?.id || data?.orderId || data?.data?.id || null;
    const delivered = data?.products || data?.items || data?.delivered_items || data?.keys || data?.deliveredKeys || data?.deliveredFileRef || data?.data?.keys || data?.data?.deliveredKeys || null;

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status: data?.status || "completed",
      data
    };
  },

  /**
   * Đồng bộ đơn hàng từ ProdSeller
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-API-Key"] = provider.api_key;
    }

    try {
      const data: any = await providerJson(providerUrl(provider.base_url, "/orders?limit=100"), { headers }, 10000);
      const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []);

      const result: SyncedOrderItem[] = [];
      for (const item of orderList) {
        const provOrderId = String(item.orderId || item.id || "");
        if (!provOrderId) continue;

        const delivered = item.deliveredKey || item.deliveredKeys || item.products || item.items || null;
        const total = Number(item.amount || item.totalPrice || item.price || 0);
        const qty = Number(item.quantity) || 1;

        result.push({
          provider_order_id: provOrderId,
          product_id: String(item.product?.id || item.productId || ""),
          product_name: String(item.product?.name || item.productName || `Product #${item.productId || ""}`),
          quantity: qty,
          unit_price: qty > 0 ? (total / qty) : total,
          total_price: total,
          currency: "USD",
          status: item.status || "completed",
          delivered_data: delivered,
          customer_email: item.email || item.activation?.emails?.[0] || null,
          raw: item
        });
      }
      return result;
    } catch {
      return [];
    }
  }
};

