import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp Đại Phúc
 */
export const daiphucAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Đại Phúc
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${provider.api_key}`
    };

    const resData: any = await providerJson(providerUrl(provider.base_url, "/v1/products"), { headers });
    const items = Array.isArray(resData.data)
      ? resData.data
      : (Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []));

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      if (!item.price || item.price <= 0) continue;
      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;
      const priceUsd = toUsd(item.price, "VND", usdRate);

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: priceUsd,
        price_original: item.price,
        currency_original: "VND",
        in_stock: inStockVal,
        delivery_type: item.type || "account",
        extra: {
          stock: item.stock,
          type: item.type,
          duration_months: item.duration_months,
          checkout_schema: item.checkout_schema,
          requiresEmailActivation: Boolean(item.checkout_schema?.required?.includes("emails") || item.type === "add_team")
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ Đại Phúc (quy đổi ra USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${provider.api_key}`
    };

    const data: any = await providerJson(providerUrl(provider.base_url, "/v1/me"), { headers });
    const rawBal = data.wallet_balance !== undefined ? data.wallet_balance : 0;
    return {
      balance: toUsd(rawBal, "VND", usdRate),
      currency: "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Đại Phúc
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${provider.api_key}`,
      "Idempotency-Key": crypto.randomUUID()
    };

    const url = providerUrl(provider.base_url, "/v1/orders");
    const inputs: any = {};
    if (params.email) {
      inputs.emails = [params.email];
    }
    const reqBody = {
      product_id: String(params.product_id),
      quantity: Number(params.quantity) || 1,
      inputs
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
   * Đồng bộ đơn hàng từ Đại Phúc
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${provider.api_key}`
    };

    const data: any = await providerJson(providerUrl(provider.base_url, "/v1/orders?limit=100"), { headers }, 10000);
    const orderList = Array.isArray(data.data)
      ? data.data
      : (Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []));

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.order_id || item.id || "");
      if (!provOrderId) continue;

      const delivered = item.products || item.items || item.keys || item.result || null;
      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.product_id || item.service_id || ""),
        product_name: String(item.product_name || item.name || `Product #${item.product_id || ""}`),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.price) || 0,
        total_price: Number(item.total_cost || item.total_price || item.price) || 0,
        currency: "VND",
        status: item.status || "completed",
        delivered_data: delivered,
        customer_email: item.customer_email || (item.inputs?.emails ? item.inputs.emails.join(", ") : null),
        raw: item
      });
    }
    return result;
  }
};
