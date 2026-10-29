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
 * Adapter tích hợp nhà cung cấp CHỢ ĐẦU MỐI (@chodaumoi_bot - dbot.pro.vn)
 */
export const chodaumoiAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ CHỢ ĐẦU MỐI và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/public-api/v1/products"), { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceVnd = Number(item.discount_price ?? item.price ?? 0);
      if (!priceVnd || priceVnd <= 0) continue;

      const priceUsd = toUsd(priceVnd, "VND", usdRate);
      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id),
        name: item.name,
        price_usd: priceUsd,
        price_original: priceVnd,
        currency_original: "VND",
        in_stock: inStockVal,
        category: item.category || undefined,
        delivery_type: item.is_dropship ? "dropship" : (item.is_preorder ? "preorder" : "auto"),
        extra: {
          stock: item.stock,
          emoji: item.emoji,
          is_dropship: item.is_dropship,
          is_preorder: item.is_preorder,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ CHỢ ĐẦU MỐI (mặc định trả về 0 nếu API không cung cấp)
   */
  async fetchBalance(_ctx: AdapterContext): Promise<BalanceResult> {
    return {
      balance: 0,
      currency: "USD",
      balance_original: 0,
      currency_original: "VND"
    };
  },

  /**
   * Đặt mua sản phẩm qua API CHỢ ĐẦU MỐI
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/public-api/v1/orders/create");
    const reqBody = {
      product_id: params.product_id,
      qty: Number(params.quantity) || 1
    };

    const resp = await providerFetch(url, { method: "POST", headers, body: JSON.stringify(reqBody) }, 15000);
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || data?.success === false) {
      return {
        success: false,
        statusCode: resp.status,
        error: data?.message || (typeof data?.error === "string" ? data.error : `Order failed: HTTP ${resp.status}`),
        data
      };
    }

    const providerOrderId = data?.order_code || data?.id || null;
    const delivered = normalizeDelivered(data?.accounts || null);
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
   * Đồng bộ lịch sử đơn hàng từ CHỢ ĐẦU MỐI (API không hỗ trợ danh sách, trả về mảng rỗng)
   */
  async syncOrders(_ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    return [];
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
      const data: any = await providerJson(
        providerUrl(provider.base_url, `/public-api/v1/orders/${encodeURIComponent(orderCode)}`),
        { headers },
        10000
      );
      if (!data || data.success === false) {
        return { success: false, status: "failed", errorMessage: data?.message || "Order not found" };
      }
      return {
        success: true,
        orderCode: data.order_code || orderCode,
        status: data.status || "completed",
        data
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
