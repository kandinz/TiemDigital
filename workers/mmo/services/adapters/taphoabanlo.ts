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
        return JSON.stringify(d);
      }
      return String(d);
    });
  }
  return delivered;
}

/**
 * Adapter tích hợp nhà cung cấp Tạp Hoá Bán Lỗ (@taphoabanlo_bot - taikhoan.app)
 */
export const taphoabanloAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Tạp Hoá Bán Lỗ và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/partner/products"), { headers });
    const items = Array.isArray(resData) ? resData : (Array.isArray(resData.products) ? resData.products : (Array.isArray(resData.data) ? resData.data : []));

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceVnd = Number(item.price ?? item.base_price ?? 0);
      if (!priceVnd || priceVnd <= 0) continue;

      const priceUsd = item.price_usdt ? Number(item.price_usdt) : toUsd(priceVnd, "VND", usdRate);
      const inStockVal = item.stock !== undefined ? Number(item.stock) > 0 : true;

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.public_id || item.id),
        name: item.name,
        price_usd: priceUsd,
        price_original: priceVnd,
        currency_original: "VND",
        in_stock: inStockVal,
        delivery_type: item.manual_input_type || "auto",
        extra: {
          stock: item.stock,
          description: item.description,
          emoji: item.emoji,
          manual_input_type: item.manual_input_type
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ Tạp Hoá Bán Lỗ (quy đổi ra USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/partner/balance"), { headers });
    const rawBal = Number(data.balance ?? 0);
    return {
      balance: toUsd(rawBal, "VND", usdRate),
      currency: "USD",
      balance_original: rawBal,
      currency_original: "VND"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Tạp Hoá Bán Lỗ
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/partner/buy");
    const reqBody: any = {
      product_id: params.product_id,
      quantity: Number(params.quantity) || 1
    };

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

    const orderObj = data?.order || data;
    const providerOrderId = orderObj?.order_code || orderObj?.id || null;
    const delivered = normalizeDelivered(orderObj?.accounts || data?.accounts || null);
    const status = orderObj?.status || "completed";

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status,
      data: orderObj
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ Tạp Hoá Bán Lỗ
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers[provider.auth_key_name || "X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/partner/orders?page=1&per_page=50"), { headers }, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data?.orders) ? data.data.orders : []);

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.order_code || item.id || "");
      if (!provOrderId) continue;

      const qty = Number(item.quantity) || 1;
      const totalAmountVnd = Number(item.amount ?? item.total_price ?? 0);
      const totalPriceUsd = toUsd(totalAmountVnd, "VND", usdRate);
      const unitPriceUsd = qty > 0 ? (totalPriceUsd / qty) : totalPriceUsd;
      const delivered = normalizeDelivered(item.accounts || null);

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
        customer_email: null,
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
      const data: any = await providerJson(providerUrl(provider.base_url, `/api/partner/orders/${encodeURIComponent(orderCode)}`), { headers }, 10000);
      const ord = data?.order || data;
      if (!ord) {
        return { success: false, status: "failed", errorMessage: "Order not found" };
      }
      return {
        success: true,
        orderCode: ord.order_code || orderCode,
        status: ord.status || "completed",
        data: ord
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
