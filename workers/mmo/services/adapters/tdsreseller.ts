import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp TDS Reseller
 */
export const tdsresellerAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ TDS Reseller
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/v1/products"), { headers });
    const items = Array.isArray(resData.services) ? resData.services : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      if (!item.price || item.price <= 0) continue;
      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.service_id),
        name: item.name,
        price_usd: item.price,
        price_original: item.price,
        currency_original: "USD",
        in_stock: inStockVal,
        delivery_type: "Instant Code",
        extra: {
          stock: item.stock
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ TDS Reseller
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/v1/me"), { headers });
    return {
      balance: data.wallet_balance !== undefined ? data.wallet_balance : 0,
      currency: "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API TDS Reseller
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/v1/order");
    const reqBody = {
      service_id: params.product_id,
      quantity: Number(params.quantity),
      idempotency_key: crypto.randomUUID()
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
   * Đồng bộ đơn hàng từ TDS Reseller
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/v1/orders?page=1&limit=100"), { headers }, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []);

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.order_id || item.id || "");
      if (!provOrderId) continue;

      const delivered = item.products || item.items || item.keys || null;
      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.service_id || item.product_id || ""),
        product_name: String(item.product_name || item.name || `Service #${item.service_id || ""}`),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.price) || 0,
        total_price: Number(item.total_cost || item.total_price) || 0,
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
