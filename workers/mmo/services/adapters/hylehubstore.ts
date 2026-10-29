import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct, CheckOrderStatusResult } from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

/**
 * Chuẩn hóa dữ liệu tài khoản / key trả về từ nhà cung cấp
 */
function normalizeDelivered(delivered: any): any {
  if (!delivered) return null;
  if (Array.isArray(delivered)) {
    return delivered.map((d: any) => {
      if (typeof d === "object" && d !== null) {
        if (d.email && d.password) return `${d.email} | ${d.password}${d.note ? ` | Note: ${d.note}` : ""}`;
        if (d.user && d.password) return `${d.user} | ${d.password}${d.verifyEmail ? ` | 2FA/Mail: ${d.verifyEmail}` : ""}`;
        if (d.data || d.content) return String(d.data || d.content);
        return JSON.stringify(d);
      }
      return String(d);
    });
  }
  return delivered;
}

/**
 * Adapter tích hợp nhà cung cấp HyleHub Store (@hylehubstore_bot - hypervin.xyz)
 */
export const hylehubstoreAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ HyleHub Store và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/products"), { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceVnd = Number(item.price ?? item.list_price ?? 0);
      if (!priceVnd || priceVnd <= 0) continue;

      const priceUsd = item.price_usdt ? Number(item.price_usdt) : toUsd(priceVnd, "VND", usdRate);
      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: priceUsd,
        price_original: priceVnd,
        currency_original: "VND",
        in_stock: inStockVal,
        delivery_type: item.format || "auto",
        category: item.group || undefined,
        extra: {
          stock: item.stock,
          group: item.group,
          format: item.format,
          requiresEmailActivation: item.format === "invite"
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ HyleHub Store (quy đổi ra USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(
      providerUrl(provider.base_url, "/api/wallet/balance"),
      { method: "POST", headers }
    );
    const rawBal = Number(data.balance ?? 0);
    return {
      balance: toUsd(rawBal, "VND", usdRate),
      currency: "USD",
      balance_original: rawBal,
      currency_original: "VND"
    };
  },

  /**
   * Đặt mua sản phẩm qua API HyleHub Store
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/orders");
    const reqBody: any = {
      product_id: params.product_id,
      quantity: Number(params.quantity) || 1
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
        error: data?.message || data?.error?.message || (typeof data?.error === "string" ? data.error : `Order failed: HTTP ${resp.status}`),
        data
      };
    }

    const providerOrderId = data?.order_id || data?.id || null;
    const delivered = normalizeDelivered(data?.items || data?.accounts || null);
    const status = data?.status || "completed";

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status,
      data
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ HyleHub Store
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/orders?limit=100"), { headers }, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : [];

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.order_id || item.id || "");
      if (!provOrderId) continue;

      const qty = Number(item.quantity) || 1;
      const totalAmountVnd = Number(item.total_price ?? item.price ?? 0);
      const totalPriceUsd = toUsd(totalAmountVnd, "VND", usdRate);
      const unitPriceUsd = qty > 0 ? (totalPriceUsd / qty) : totalPriceUsd;
      const delivered = normalizeDelivered(item.items || item.accounts || null);

      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.product_id || ""),
        product_name: String(item.product_name || `Product #${item.product_id || ""}`),
        quantity: qty,
        unit_price: unitPriceUsd,
        total_price: totalPriceUsd,
        currency: "USD",
        status: item.status || "completed",
        delivered_data: delivered,
        customer_email: item.email || null,
        raw: item
      });
    }
    return result;
  },

  /**
   * Tra cứu trạng thái đơn hàng theo mã đơn
   */
  async checkOrderStatus(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    try {
      const data: any = await providerJson(providerUrl(provider.base_url, `/api/orders/${encodeURIComponent(orderCode)}`), { headers }, 10000);
      const ord = data?.order || data;
      if (!ord) {
        return { success: false, status: "failed", errorMessage: "Order not found" };
      }
      return {
        success: true,
        orderCode: ord.order_id || orderCode,
        status: ord.status || "completed",
        customerEmail: ord.email || null,
        data: ord
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
