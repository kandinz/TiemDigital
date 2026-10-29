import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct, CheckOrderStatusResult } from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

/**
 * Chuẩn hóa dữ liệu tài khoản / key / liên kết trả về từ nhà cung cấp Prastyaaneki
 */
function normalizeDelivered(delivered: any): any {
  if (!delivered) return null;
  if (Array.isArray(delivered)) {
    return delivered.map((d: any) => {
      if (typeof d === "object" && d !== null) {
        if (d.email && d.password) return `${d.email} | ${d.password}${d.note ? ` | Note: ${d.note}` : ""}`;
        if (d.user && d.password) return `${d.user} | ${d.password}${d.verifyEmail ? ` | 2FA/Mail: ${d.verifyEmail}` : ""}`;
        if (d.data || d.content || d.key || d.account) return String(d.data || d.content || d.key || d.account);
        return JSON.stringify(d);
      }
      return String(d);
    });
  }
  return delivered;
}

/**
 * Adapter tích hợp nhà cung cấp Prs Digital (@prastyaneki_bot - api.prastyaaneki.biz.id)
 */
export const prastyanekiAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Prs Digital (Rezeki Shop API) và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/v1/products?lang=en");
    const resData: any = await providerJson(url, { headers });
    const items = Array.isArray(resData?.products) ? resData.products : [];

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceIdr = Number(item.price_idr ?? 0);
      if (!priceIdr || priceIdr <= 0) continue;

      const priceUsd = toUsd(priceIdr, "IDR", usdRate);
      const inStockVal = item.availability === "in_stock";
      const deliveryType = item.requires_email ? "preorder" : "instant";

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: String(item.name || "").trim(),
        price_usd: priceUsd,
        price_original: priceIdr,
        currency_original: "IDR",
        in_stock: inStockVal,
        delivery_type: deliveryType,
        extra: {
          description: item.description,
          requires_email: Boolean(item.requires_email),
          availability: item.availability
        }
      });
    }

    return products;
  },

  /**
   * Truy vấn số dư ví của nhà cung cấp Prs Digital (hỗ trợ cả USDT và IDR)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/v1/balance"), { headers });
    const balIdr = Number(data?.balance ?? 0);
    const balUsdt = Number(data?.balance_usdt ?? 0);

    if (balUsdt > 0 && balIdr === 0) {
      return {
        balance: balUsdt,
        currency: "USDT",
        balance_original: balUsdt,
        currency_original: "USDT"
      };
    }

    return {
      balance: toUsd(balIdr, "IDR", usdRate),
      currency: "USD",
      balance_original: balIdr,
      currency_original: "IDR"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Prs Digital
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const qty = Number(params.quantity) || 1;
    const body: Record<string, any> = {
      product_id: String(params.product_id),
      quantity: qty
    };

    if (params.email) {
      if (qty > 1) {
        body.emails = Array(qty).fill(params.email);
      } else {
        body.email = params.email;
      }
    }

    try {
      if (provider.balance_cache) {
        const cache = JSON.parse(provider.balance_cache);
        if (cache.currency === "USDT" || (Number(cache.balance_usdt) > 0 && Number(cache.balance) === 0)) {
          body.currency = "USDT";
        }
      }
    } catch {
      // Ignore JSON parse error
    }

    const url = providerUrl(provider.base_url, "/v1/order");
    const res = await providerFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }, 30000);

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false || (typeof data?.code === "number" && data.code >= 400)) {
      const rawError = data?.error || `Order failed: HTTP ${res.status}`;
      return {
        success: false,
        statusCode: res.status,
        error: rawError,
        data
      };
    }

    const providerOrderId = data?.order_id ? String(data.order_id) : (data?.id ? String(data.id) : null);
    const delivered = normalizeDelivered(data?.delivered_keys || data?.delivered_key);
    const isCompleted = data?.status === "delivered";

    return {
      success: true,
      providerOrderId,
      delivered,
      status: isCompleted ? "completed" : (data?.status || "processing"),
      data
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ Prs Digital
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/v1/orders");
    const resData: any = await providerJson(url, { headers });
    const items = Array.isArray(resData?.orders) ? resData.orders : [];

    return items.map((item: any) => {
      const orderId = String(item.order_id || item.id || "");
      const qty = Number(item.quantity) || 1;
      const totalPrice = Number(item.total_price || item.price || item.price_idr || 0);
      const unitPrice = item.unit_price ? Number(item.unit_price) : (qty > 0 ? totalPrice / qty : totalPrice);
      const isCompleted = item.status === "delivered";
      const isCancelled = item.status === "cancelled";
      const delivered = normalizeDelivered(item.delivered_keys || item.delivered_key);
      const email = item.email || (Array.isArray(item.activation_emails) ? item.activation_emails.join(", ") : null);

      return {
        provider_order_id: orderId,
        product_id: String(item.product_id),
        product_name: String(item.product_name || item.name || item.product_id),
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        currency: item.currency || "IDR",
        status: isCompleted ? "completed" : (isCancelled ? "cancelled" : (item.status || "processing")),
        delivered_data: delivered,
        customer_email: email,
        raw: item
      };
    });
  },

  /**
   * Tra cứu trạng thái và thông tin chi tiết đơn hàng theo mã đơn
   */
  async checkOrderStatus(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    try {
      const url = providerUrl(provider.base_url, `/v1/order/${encodeURIComponent(orderCode)}`);
      const data: any = await providerJson(url, { headers }, 10000);
      if (!data || data.success === false || (typeof data?.code === "number" && data.code >= 400)) {
        return {
          success: false,
          status: "failed",
          errorMessage: data?.error || `Order lookup failed with code ${data?.code}`,
          data
        };
      }

      const isCompleted = data.status === "delivered";
      const isCancelled = data.status === "cancelled";
      const email = data.email || (Array.isArray(data.activation_emails) ? data.activation_emails.join(", ") : null);

      return {
        success: true,
        orderCode: String(data.order_id || orderCode),
        status: isCompleted ? "completed" : (isCancelled ? "cancelled" : (data.status || "processing")),
        customerEmail: email,
        data
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
