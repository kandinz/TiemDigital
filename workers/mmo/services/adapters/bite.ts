import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp Bite Store
 */
export const biteAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Bite Store
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/v1/products?per_page=500"), { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      if (!item.price || item.price <= 0) continue;
      const inStockVal = item.inStock !== false && (item.stock === undefined || Number(item.stock) > 0);

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: item.price,
        price_original: item.price,
        currency_original: "USD",
        in_stock: inStockVal,
        delivery_type: item.deliveryType || "automatic",
        extra: {
          stock: item.stock,
          normalPrice: item.normalPrice,
          promotion: item.promotion,
          emoji: item.emoji,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ Bite Store
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/v1/balance"), { headers });
    const bal = data.balance !== undefined
      ? data.balance
      : (data.points !== undefined ? data.points / (data.pointsPerDollar || 10) : 0);
    return {
      balance: bal,
      currency: data.currency || "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Bite Store
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

    const url = providerUrl(provider.base_url, "/v1/orders");
    const reqBody = {
      productId: String(params.product_id),
      quantity: Number(params.quantity) || 1
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
   * Đồng bộ đơn hàng từ Bite Store
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/v1/transactions?limit=100"), { headers }, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : [];

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.orderId || item.id || "");
      if (!provOrderId) continue;

      const delivered = item.deliveredKeys || item.deliveredFileRef || item.keys || item.items || null;
      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.productId || item.product_id || ""),
        product_name: String(item.productName || item.product_name || item.name || `Product #${item.productId || ""}`),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unitPrice || item.price || (item.quantity && item.amount ? (item.amount / item.quantity) : 0)) || 0,
        total_price: Number(item.amount || item.total_cost || item.total_price || 0),
        currency: "USD",
        status: item.status || "completed",
        delivered_data: delivered,
        customer_email: null,
        raw: item
      });
    }
    return result;
  }
};
