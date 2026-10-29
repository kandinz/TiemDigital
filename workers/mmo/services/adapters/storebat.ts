import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp StoreBat
 */
export const storebatAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ StoreBat
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/reseller/products"), { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      if (!item.price_usd || item.price_usd <= 0) continue;
      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: item.price_usd,
        price_original: item.price_usd,
        currency_original: "USD",
        in_stock: item.stock !== 0,
        delivery_type: item.delivery_type,
        extra: {
          stock: item.stock,
          price_tiers: item.price_tiers,
          image_url: item.image_url,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ StoreBat
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/reseller/me"), { headers });
    return {
      balance: data.wallet_balance || 0,
      currency: "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API StoreBat
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/reseller/orders");
    const reqBody = {
      product_id: params.product_id,
      quantity: params.quantity
    };

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

    const providerOrderId =
      data?.order?.order_id ||
      data?.order?.id ||
      data?.order_id ||
      data?.id ||
      data?.orderId ||
      data?.data?.id ||
      data?.data?.order_id ||
      (Array.isArray(data?.products) && data.products[0]?.id ? data.products[0].id : null) ||
      (Array.isArray(data?.items) && data.items[0]?.id ? data.items[0].id : null) ||
      null;
    const delivered = data?.order?.delivery?.items || data?.order?.items || data?.products || data?.items || data?.delivered_items || data?.keys || data?.deliveredKeys || data?.deliveredFileRef || data?.data?.keys || data?.data?.deliveredKeys || null;

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status: data?.status || "completed",
      data
    };
  },

  /**
   * Đồng bộ đơn hàng từ StoreBat
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-Reseller-Key"] = provider.api_key;
    }

    try {
      const data: any = await providerJson(providerUrl(provider.base_url, "/api/reseller/orders?limit=100"), { headers }, 10000);
      const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []));

      const result: SyncedOrderItem[] = [];
      for (const item of orderList) {
        const provOrderId = String(item.order_id || item.id || "");
        if (!provOrderId) continue;

        const delivered = item.delivery?.items || item.items || item.keys || item.deliveredKeys || null;
        const total = Number(item.total_usdt || item.total_cost || item.price_usdt || item.amount || 0);
        const qty = Number(item.quantity) || 1;

        result.push({
          provider_order_id: provOrderId,
          product_id: String(item.product_id || item.code || ""),
          product_name: String(item.product_name || item.name || `Product #${item.product_id || ""}`),
          quantity: qty,
          unit_price: qty > 0 ? (total / qty) : total,
          total_price: total,
          currency: "USD",
          status: item.status || "completed",
          delivered_data: delivered,
          customer_email: item.activation_identifier || null,
          raw: item
        });
      }
      return result;
    } catch {
      return [];
    }
  }
};

