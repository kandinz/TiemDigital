import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct, CheckOrderStatusResult } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_API_KEY: "Missing API Key",
  INVALID_API_KEY: "Invalid API Key",
  INSUFFICIENT_BALANCE: "Insufficient Balance in Telegram Bot",
  OUT_OF_STOCK: "Product is out of stock",
  ID_REQUIRED: "Product ID is required",
  INVALID_COUNT: "Invalid quantity count",
  MAX_COUNT_EXCEEDED: "Max purchase quantity exceeded (max 1,000)",
  PRODUCT_NOT_FOUND: "Product not found or hidden",
  ORDER_NOT_FOUND: "Order not found"
};

/**
 * Chuẩn hóa dữ liệu tài khoản / key / liên kết trả về từ nhà cung cấp
 */
function normalizeDelivered(delivered: any): any {
  if (!delivered) return null;
  if (Array.isArray(delivered)) {
    return delivered.map((d: any) => {
      if (typeof d === "object" && d !== null) {
        if (d.email && d.password) return `${d.email} | ${d.password}${d.note ? ` | Note: ${d.note}` : ""}`;
        if (d.user && d.password) return `${d.user} | ${d.password}${d.verifyEmail ? ` | 2FA/Mail: ${d.verifyEmail}` : ""}`;
        if (d.account || d.key || d.data || d.content) return String(d.account || d.key || d.data || d.content);
        return JSON.stringify(d);
      }
      return String(d);
    });
  }
  return delivered;
}

/**
 * Adapter tích hợp nhà cung cấp DigitalCore Store (@DCoreStoreBot - digitalcore.top)
 */
export const digitalcoreAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ DigitalCore Store và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "Api-Key"] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/user/products"), { headers });
    const items = Array.isArray(resData)
      ? resData
      : (Array.isArray(resData?.products) ? resData.products : (Array.isArray(resData?.data) ? resData.data : []));

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceUsd = Number(item.price ?? item.priceFrom ?? 0);
      if (!priceUsd || priceUsd <= 0) continue;

      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: priceUsd,
        price_original: priceUsd,
        currency_original: "USD",
        in_stock: inStockVal,
        delivery_type: "instant",
        extra: {
          stock: item.stock,
          description: item.description,
          priceFrom: item.priceFrom,
          tiers: item.tiers
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví Telegram bot từ DigitalCore Store (USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "Api-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/user/me"), { headers });
    const rawBal = Number(data?.balance ?? 0);
    return {
      balance: rawBal,
      currency: "USD",
      balance_original: rawBal,
      currency_original: "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API DigitalCore Store
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers[provider.auth_key_name || "Api-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/user/buy");
    const reqBody = {
      id: String(params.product_id),
      count: Number(params.quantity) || 1
    };

    const resp = await providerFetch(url, { method: "POST", headers, body: JSON.stringify(reqBody) }, 15000);
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data?.success === false) {
      const rawError = data?.msg || data?.message || data?.error || `Order failed: HTTP ${resp.status}`;
      const friendlyError = ERROR_MESSAGES[rawError] ? `${ERROR_MESSAGES[rawError]} (${rawError})` : rawError;
      return {
        success: false,
        statusCode: resp.status,
        error: friendlyError,
        data
      };
    }

    const providerOrderId = data?.order_id ? String(data.order_id) : null;
    const delivered = normalizeDelivered(data?.items);

    return {
      success: true,
      providerOrderId,
      delivered,
      status: "completed",
      data
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ DigitalCore Store
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "Api-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/user/history?page=1"), { headers }, 10000);
    const orderList = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : (Array.isArray(data?.data) ? data.data : []));

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.id || item.order_id || "");
      if (!provOrderId) continue;

      const qty = Number(item.quantity) || 1;
      const totalPriceUsd = Number(item.total_amount ?? item.total_price ?? item.price ?? 0);
      const unitPriceUsd = qty > 0 ? (totalPriceUsd / qty) : totalPriceUsd;
      const delivered = normalizeDelivered(item.items || item.accounts || null);

      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.product_id || item.id || ""),
        product_name: String(item.product_name || item.name || `Order #${provOrderId}`),
        quantity: qty,
        unit_price: unitPriceUsd,
        total_price: totalPriceUsd,
        currency: "USD",
        status: "completed",
        delivered_data: delivered,
        customer_email: null,
        raw: item
      });
    }
    return result;
  },

  /**
   * Tra cứu thông tin và chi tiết đơn hàng theo mã đơn
   */
  async checkOrderStatus(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "Api-Key"] = provider.api_key;
    }

    try {
      const data: any = await providerJson(
        providerUrl(provider.base_url, `/api/user/order?id=${encodeURIComponent(orderCode)}`),
        { headers },
        10000
      );
      if (!data || data.success === false) {
        return { success: false, status: "failed", errorMessage: data?.msg || "Order not found", data };
      }
      return {
        success: true,
        orderCode: String(data.order_id || orderCode),
        status: "completed",
        data
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
