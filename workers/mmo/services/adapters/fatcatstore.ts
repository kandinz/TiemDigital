import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct } from "./types.js";
import { providerFetch, providerJson, providerUrl, toUsd } from "../providerHttp.js";

/**
 * Adapter tích hợp nhà cung cấp FatCat Store (api.fatcatstore.click)
 */
export const fatcatstoreAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ FatCat Store và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_type === "header" && provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-API-Key"] = provider.api_key;
    }

    const resData: any = await providerJson(providerUrl(provider.base_url, "/api/products"), { headers });
    const items = Array.isArray(resData.products) ? resData.products : (Array.isArray(resData) ? resData : []);

    const products: UnifiedProduct[] = [];
    for (const item of items) {
      const priceVnd = Number(item.price_vnd);
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
        delivery_type: "Instant / Automatic",
        extra: {
          stock: item.stock,
          price_vnd: item.price_vnd,
          regular_price_vnd: item.regular_price_vnd,
          sale_qty: item.sale_qty,
          max_quantity: item.max_quantity,
          description: item.description
        }
      });
    }
    return products;
  },

  /**
   * Truy vấn số dư ví từ FatCat Store (quy đổi ra USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/balance"), { headers });
    const rawBal = Number(data.balance_vnd ?? data.balance ?? 0);
    return {
      balance: toUsd(rawBal, "VND", usdRate),
      currency: "USD",
      balance_original: rawBal,
      currency_original: "VND"
    };
  },

  /**
   * Đặt mua sản phẩm qua API FatCat Store
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-API-Key"] = provider.api_key;
    }

    const url = providerUrl(provider.base_url, "/api/buy");
    const reqBody = {
      product_id: Number(params.product_id),
      quantity: Number(params.quantity) || 1,
      request_id: `gum_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
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
    const providerOrderId = orderObj?.id || data?.id || null;
    const delivered = orderObj?.items || data?.items || null;
    const status = (orderObj?.fulfillment === "complete" ? "completed" : orderObj?.fulfillment) || "completed";

    return {
      success: true,
      providerOrderId: providerOrderId ? String(providerOrderId) : null,
      delivered,
      status,
      data: orderObj
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ FatCat Store
   */
  async syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    const { provider, usdRate } = ctx;
    const headers: Record<string, string> = {};
    if (provider.auth_key_name && provider.api_key) {
      headers[provider.auth_key_name] = provider.api_key;
    } else if (provider.api_key) {
      headers["X-API-Key"] = provider.api_key;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/orders?limit=100"), { headers }, 10000);
    const orderList = Array.isArray(data.orders) ? data.orders : [];

    const result: SyncedOrderItem[] = [];
    for (const item of orderList) {
      const provOrderId = String(item.id || item.order_id || "");
      if (!provOrderId) continue;

      const unitPriceVnd = item.price && item.quantity ? (item.price / item.quantity) : 0;
      const unitPriceUsd = toUsd(unitPriceVnd, "VND", usdRate);
      const totalPriceUsd = toUsd(item.price || 0, "VND", usdRate);

      result.push({
        provider_order_id: provOrderId,
        product_id: String(item.product_id || ""),
        product_name: String(item.product || `Product #${item.product_id || ""}`),
        quantity: Number(item.quantity) || 1,
        unit_price: unitPriceUsd,
        total_price: totalPriceUsd,
        currency: "USD",
        status: item.status === "paid" ? "completed" : (item.status || "completed"),
        delivered_data: item.items || null,
        customer_email: null,
        raw: item
      });
    }
    return result;
  }
};
