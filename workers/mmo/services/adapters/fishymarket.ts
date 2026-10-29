import {
  ProviderAdapter,
  AdapterContext,
  OrderParams,
  PlaceOrderResult,
  SyncedOrderItem,
  BalanceResult,
  UnifiedProduct,
  CheckOrderStatusResult
} from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

function getFishyHeaders(apiKey: string, contentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "ngrok-skip-browser-warning": "true",
    "Accept": "application/json"
  };
  if (contentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/**
 * Adapter tích hợp nhà cung cấp FishyMarket (Canboso Buyer API v1.2.0)
 */
export const fishymarketAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ FishyMarket và chuẩn hóa sang định dạng UnifiedProduct
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const baseUrl = provider.base_url.replace(/\/+$/, "");
    const url = `${baseUrl}/api/telegram-buyer/products?key=${encodeURIComponent(provider.api_key)}`;
    const headers = getFishyHeaders(provider.api_key);

    const resData: any = await providerJson(url, { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const rawPrice = Number(item.pricing ?? item.walletPricing ?? item.price ?? 0);
      const rawCurrency = (resData.walletCurrency || item.walletCurrency || item.currency || "VND").toUpperCase();

      const currencyOrig = rawCurrency;
      const priceUsd = toUsd(rawPrice, rawCurrency, usdRate);

      if (!priceUsd || priceUsd <= 0) continue;

      const inStock = item.stats?.available !== undefined
        ? item.stats.available > 0
        : (item.in_stock !== false);

      const deliveryType = item.requiresCustomerEmail ? "invite" : "auto_asset";

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item._id || item.id),
        name: item.product_name || item.name,
        price_usd: priceUsd,
        price_original: rawPrice,
        currency_original: currencyOrig,
        in_stock: inStock,
        delivery_type: deliveryType,
        extra: {
          stock: item.stats?.available ?? item.stock,
          requiresCustomerEmail: Boolean(item.requiresCustomerEmail),
          description: item.description
        }
      });
    }

    return products;
  },

  /**
   * Truy vấn số dư ví hiện tại từ FishyMarket và quy đổi ra USD
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const baseUrl = provider.base_url.replace(/\/+$/, "");
    const url = `${baseUrl}/api/telegram-buyer/balance?key=${encodeURIComponent(provider.api_key)}`;
    const headers = getFishyHeaders(provider.api_key);

    const data: any = await providerJson(url, { headers });

    const rawBal = Number(data.balance ?? data.balanceVnd ?? 0);
    const currency = (data.walletCurrency || "VND").toUpperCase();
    const balanceUsd = toUsd(rawBal, currency, usdRate);

    return {
      balance: balanceUsd,
      currency: "USD",
      balance_original: rawBal,
      currency_original: currency
    };
  },

  /**
   * Thực hiện đặt hàng sản phẩm qua API FishyMarket (xử lý cả auto_asset và invite)
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const baseUrl = provider.base_url.replace(/\/+$/, "");
    const url = `${baseUrl}/api/telegram-buyer/purchase?key=${encodeURIComponent(provider.api_key)}`;

    const headers = getFishyHeaders(provider.api_key, true);

    const reqBody: Record<string, any> = {
      key: provider.api_key,
      product_id: params.product_id,
      quantity: params.quantity
    };

    if (params.email) {
      reqBody.customer_email = params.email;
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

    const providerOrderId = data?.orderCode || data?.order_id || data?.id || null;
    const delivered = data?.deliveredAccounts || data?.products || data?.items || null;
    const status = data?.workspaceInviteStatus || (delivered ? "completed" : "processing");

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status,
      data
    };
  },

  /**
   * Kiểm tra trạng thái đơn hàng ngầm (invite) từ FishyMarket
   */
  async checkOrderStatus(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult> {
    const { provider } = ctx;
    const baseUrl = provider.base_url.replace(/\/+$/, "");
    const url = `${baseUrl}/api/telegram-buyer/order/${encodeURIComponent(orderCode)}/status?key=${encodeURIComponent(provider.api_key)}`;
    const headers = getFishyHeaders(provider.api_key);

    const resp = await providerFetch(url, { headers }, 15000);
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return {
        success: false,
        orderCode,
        status: "failed",
        errorMessage: data?.message || `HTTP ${resp.status}`,
        data
      };
    }

    const rawStatus = data.status || data.inviteStatus;
    let normalizedStatus = "processing";
    if (rawStatus === "invited") {
      normalizedStatus = "completed";
    } else if (rawStatus === "failed") {
      normalizedStatus = "failed";
    } else if (rawStatus) {
      normalizedStatus = rawStatus;
    }

    return {
      success: data.success !== false,
      orderCode: String(data.orderCode || orderCode),
      status: normalizedStatus,
      inviteStatus: data.inviteStatus,
      customerEmail: data.customerEmail || null,
      errorMessage: data.errorMessage || null,
      data
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ FishyMarket
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "ngrok-skip-browser-warning": "true"
    };

    try {
      const url = `${providerUrl(provider.base_url, "/api/telegram-buyer/orders")}?key=${provider.api_key}`;
      const data: any = await providerJson(url, { headers }, 10000);
      const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []);

      const result: SyncedOrderItem[] = [];
      for (const item of orderList) {
        const provOrderId = String(item.orderCode || item.order_id || item.id || "");
        if (!provOrderId) continue;

        const delivered = item.deliveredAccounts || item.delivery?.accounts || item.deliveredKeys || item.products || item.items || null;
        const total = Number(item.amount || item.totalPrice || item.price || item.total_cost || 0);
        const qty = Number(item.quantity) || 1;

        result.push({
          provider_order_id: provOrderId,
          product_id: String(item.productId || item.product_id || ""),
          product_name: String(item.productName || item.product_name || `Product #${item.productId || ""}`),
          quantity: qty,
          unit_price: qty > 0 ? (total / qty) : total,
          total_price: total,
          currency: "VND",
          status: item.status || "completed",
          delivered_data: delivered,
          customer_email: item.customerEmail || item.customer_email || null,
          raw: item
        });
      }
      return result;
    } catch {
      return [];
    }
  }
};

