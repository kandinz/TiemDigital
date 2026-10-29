import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct, CheckOrderStatusResult } from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

/**
 * Adapter tích hợp nền tảng Canboso Buyer API v2
 * Dùng chung cho các đối tác / nhà cung cấp chạy trên Canboso (AITools, shotix1shop...)
 */
export const canbosoAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Canboso
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const url = `${providerUrl(provider.base_url, "/api/v2/telegram-buyer/products")}?${provider.auth_key_name || "key"}=${provider.api_key}`;
    const resData: any = await providerJson(url);
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const rawPrice = item.price?.amount ?? item.pricing ?? item.price;
      const rawCurrency = item.price?.currency ?? item.walletCurrency ?? item.currency ?? "VND";

      const currencyOrig = rawCurrency === "USD" ? "USD" : "VND";
      const priceUsd = currencyOrig === "USD" ? rawPrice : (item.price_usd || toUsd(rawPrice, currencyOrig, usdRate));
      if (!priceUsd || priceUsd <= 0) continue;

      const inStockVal = (item.availability && item.availability.available !== undefined)
        ? item.availability.available > 0
        : (item.stats && item.stats.available !== undefined)
          ? item.stats.available > 0
          : (item.in_stock !== false);

      products.push({
        provider_id: provider.id,
        provider_product_id: String(item.id || item.productId || item._id),
        name: item.name || item.product_name,
        price_usd: priceUsd,
        price_original: rawPrice,
        currency_original: currencyOrig,
        in_stock: inStockVal,
        delivery_type: item.productType || item.type,
        extra: {
          stock: item.availability?.available ?? item.stats?.available ?? item.stock ?? item.quantity,
          productType: item.productType,
          purchaseRequirements: item.purchaseRequirements,
          requiresCustomerEmail: item.requiresCustomerEmail,
          image_url: item.image ? (item.image.startsWith('/') ? provider.base_url + item.image : item.image) : undefined,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ Canboso
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const url = `${providerUrl(provider.base_url, "/api/v2/telegram-buyer/balance")}?${provider.auth_key_name || "key"}=${provider.api_key}`;
    const data: any = await providerJson(url);
    return {
      balance: data.balanceUsd !== undefined ? data.balanceUsd : (data.balanceVnd !== undefined ? data.balanceVnd : (data.balance || 0)),
      currency: data.balanceUsd !== undefined ? "USD" : (data.walletCurrency || "VND"),
      balance_original: data.balance ?? data.balanceVnd ?? data.balanceUsd ?? 0,
      currency_original: data.walletCurrency || "VND"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Canboso
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID()
    };

    const url = providerUrl(provider.base_url, "/api/v2/telegram-buyer/purchase");
    const reqBody: any = {
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

    const providerOrderId = data?.order?.orderCode || data?.order_id || data?.id || data?.orderId || data?.data?.id || null;
    let delivered = data?.delivery?.accounts || data?.delivery?.keys || data?.products || data?.items || data?.delivered_items || data?.keys || data?.deliveredKeys || data?.deliveredFileRef || data?.data?.keys || data?.data?.deliveredKeys || null;

    if (Array.isArray(delivered)) {
      delivered = delivered.map((d: any) => {
        if (typeof d === "object" && d !== null) {
          if (d.user && d.password) return `${d.user} | ${d.password}${d.verifyEmail ? ` | 2FA/Mail: ${d.verifyEmail}` : ""}`;
          return JSON.stringify(d);
        }
        return String(d);
      });
    }

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status: data?.order?.status || data?.status || "completed",
      data
    };
  },

  /**
   * Đồng bộ đơn hàng từ Canboso
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider } = ctx;
    const url = `${providerUrl(provider.base_url, "/api/v2/telegram-buyer/orders")}?${provider.auth_key_name || "key"}=${provider.api_key}`;
    const data: any = await providerJson(url, {}, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : (Array.isArray(data) ? data : []);

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.orderCode || item.order_id || item.id || "");
      if (!provOrderId) continue;

      let currency = "VND";
      let totalPrice = 0;
      if (item.payment) {
        if (item.payment.currency === "USD" || (item.payment.amountUsd !== null && item.payment.amountUsd !== undefined)) {
          currency = "USD";
          totalPrice = Number(item.payment.amountUsd || item.payment.amount || 0);
        } else {
          currency = "VND";
          totalPrice = Number(item.payment.amountVnd || item.payment.amount || 0);
        }
      } else {
        totalPrice = Number(item.total_cost || item.price || item.total_price || 0);
        currency = item.currency === "USD" ? "USD" : "VND";
      }

      const qty = Number(item.quantity) || 1;
      const unitPrice = qty > 0 ? (totalPrice / qty) : totalPrice;

      let delivered = item.delivery?.accounts || item.delivery?.keys || item.deliveredKeys || item.products || item.items || null;
      if (Array.isArray(delivered)) {
        delivered = delivered.map((d: any) => {
          if (typeof d === "object" && d !== null) {
            if (d.user && d.password) return `${d.user} | ${d.password}${d.verifyEmail ? ` | 2FA/Mail: ${d.verifyEmail}` : ""}`;
            return JSON.stringify(d);
          }
          return String(d);
        });
      }

      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.productId || item.product_id || item._id || ""),
        product_name: String(item.productName || item.product_name || item.name || `Product #${item.productId || ""}`),
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        currency,
        status: item.status || "completed",
        delivered_data: delivered,
        customer_email: item.customerEmail || item.customer_email || null,
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
    const url = `${providerUrl(provider.base_url, "/api/v2/telegram-buyer/orders")}?${provider.auth_key_name || "key"}=${provider.api_key}&orderCode=${encodeURIComponent(orderCode)}`;
    try {
      const data: any = await providerJson(url, {}, 10000);
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const ord = orders.find((o: any) => (o.orderCode || o.id) === orderCode) || orders[0];
      if (!ord) {
        return { success: false, status: "failed", errorMessage: "Order not found" };
      }
      return {
        success: true,
        orderCode: ord.orderCode || orderCode,
        status: ord.status || "completed",
        inviteStatus: ord.fulfillmentStatus || ord.status,
        customerEmail: ord.customerEmail || null,
        data: ord
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};

export const aitoolsAdapter = canbosoAdapter;
