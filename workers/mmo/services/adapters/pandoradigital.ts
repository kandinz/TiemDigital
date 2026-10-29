import { ProviderAdapter, AdapterContext, OrderParams, PlaceOrderResult, SyncedOrderItem, BalanceResult, UnifiedProduct, CheckOrderStatusResult } from "./types.js";
import { providerFetch, providerJson, providerUrl } from "../providerHttp.js";

const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Insufficient Balance in Pandora Digital account",
  OUT_OF_STOCK: "Product or variant is out of stock",
  PRICE_CHANGED: "Product price changed, please refresh catalog",
  PRODUCT_NOT_FOUND: "Product not found",
  PRODUCT_UNAVAILABLE: "Product currently unavailable",
  PURCHASING_DISABLED: "Purchasing is temporarily disabled",
  QUANTITY_NOT_ALLOWED: "Quantity not allowed",
  PER_ORDER_LIMIT_EXCEEDED: "Per-order limit exceeded",
  INVALID_API_KEY: "Invalid or revoked API key",
  RATE_LIMITED: "Rate limit exceeded, please wait and retry",
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
 * Adapter tích hợp nhà cung cấp Pandora Digital Store (@Pandora_Digital_bot - api.pandoradigital.shop)
 */
export const pandoradigitalAdapter: ProviderAdapter = {
  /**
   * Tải danh mục sản phẩm từ Pandora Digital Store và chuẩn hóa dữ liệu
   */
  async fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers["Authorization"] = provider.api_key.startsWith("Bearer ")
        ? provider.api_key
        : `Bearer ${provider.api_key}`;
    }

    const products: UnifiedProduct[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 5;

    do {
      pageCount++;
      const url = providerUrl(
        provider.base_url,
        `/api/v1/products?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
      );
      const resData: any = await providerJson(url, { headers });
      const items = Array.isArray(resData?.items) ? resData.items : [];

      for (const item of items) {
        const unitPriceUsd = Number(item.unit_price ?? 0);
        if (!unitPriceUsd || unitPriceUsd <= 0) continue;

        const inStockVal = item.available_stock !== undefined && item.available_stock !== null
          ? Number(item.available_stock) > 0
          : true;

        const prodId = item.variant_id ? `${item.id}:${item.variant_id}` : String(item.id);
        const displayName = item.variant_name ? `${item.name} (${item.variant_name})` : item.name;

        products.push({
          provider_id: provider.id,
          provider_product_id: prodId,
          name: displayName,
          price_usd: unitPriceUsd,
          price_original: unitPriceUsd,
          currency_original: "USD",
          in_stock: inStockVal,
          delivery_type: item.delivery_type || "instant",
          extra: {
            id: item.id,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            available_stock: item.available_stock,
            minimum_quantity: item.minimum_quantity,
            maximum_quantity: item.maximum_quantity,
            description: item.description,
            updated_at: item.updated_at
          }
        });
      }

      cursor = resData?.next_cursor || null;
    } while (cursor && pageCount < maxPages);

    return products;
  },

  /**
   * Truy vấn số dư ví khả dụng từ Pandora Digital Store (USD)
   */
  async fetchBalance(ctx: AdapterContext): Promise<BalanceResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers["Authorization"] = provider.api_key.startsWith("Bearer ")
        ? provider.api_key
        : `Bearer ${provider.api_key}`;
    }

    const data: any = await providerJson(providerUrl(provider.base_url, "/api/v1/balance"), { headers });
    const rawBal = Number(data?.available_balance ?? 0);
    return {
      balance: rawBal,
      currency: "USD",
      balance_original: rawBal,
      currency_original: "USD"
    };
  },

  /**
   * Đặt mua sản phẩm qua API Pandora Digital Store (Lấy quote xác thực giá trước khi tạo đơn)
   */
  async placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (provider.api_key) {
      headers["Authorization"] = provider.api_key.startsWith("Bearer ")
        ? provider.api_key
        : `Bearer ${provider.api_key}`;
    }

    let productId = String(params.product_id);
    let variantId: string | undefined = undefined;
    if (productId.includes(":")) {
      const parts = productId.split(":");
      productId = parts[0];
      variantId = parts[1];
    }
    const qty = Number(params.quantity) || 1;

    const quoteUrl = providerUrl(provider.base_url, "/api/v1/quotes");
    const quoteBody: any = {
      product_id: productId,
      quantity: qty
    };
    if (variantId) quoteBody.variant_id = variantId;

    const quoteResp = await providerFetch(quoteUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(quoteBody)
    }, 15000);

    const quoteData: any = await quoteResp.json().catch(() => ({}));
    if (!quoteResp.ok || quoteData?.error) {
      const err = quoteData?.error;
      const rawError = err?.code || err?.message || `Quote failed: HTTP ${quoteResp.status}`;
      const friendlyError = ERROR_MESSAGES[rawError] ? `${ERROR_MESSAGES[rawError]} (${rawError})` : (err?.message || rawError);
      return {
        success: false,
        statusCode: quoteResp.status,
        error: friendlyError,
        data: quoteData
      };
    }

    const expectedUnitPrice = quoteData.unit_price;
    const priceVersion = quoteData.price_version;

    const orderUrl = providerUrl(provider.base_url, "/api/v1/orders");
    const orderHeaders: Record<string, string> = {
      ...headers,
      "Idempotency-Key": crypto.randomUUID()
    };
    const orderBody: any = {
      product_id: productId,
      quantity: qty,
      expected_unit_price: expectedUnitPrice,
      price_version: priceVersion,
      client_order_reference: `gum_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    };
    if (variantId) orderBody.variant_id = variantId;

    const orderResp = await providerFetch(orderUrl, {
      method: "POST",
      headers: orderHeaders,
      body: JSON.stringify(orderBody)
    }, 15000);

    const orderData: any = await orderResp.json().catch(() => ({}));
    if (!orderResp.ok || orderData?.error) {
      const err = orderData?.error;
      const rawError = err?.code || err?.message || `Order failed: HTTP ${orderResp.status}`;
      const friendlyError = ERROR_MESSAGES[rawError] ? `${ERROR_MESSAGES[rawError]} (${rawError})` : (err?.message || rawError);
      return {
        success: false,
        statusCode: orderResp.status,
        error: friendlyError,
        data: orderData
      };
    }

    const providerOrderId = orderData?.id ? String(orderData.id) : null;
    const delivered = normalizeDelivered(orderData?.delivery?.items);
    const isCompleted = orderData?.status === "delivered";

    return {
      success: true,
      providerOrderId,
      delivered,
      status: isCompleted ? "completed" : (orderData?.status || "processing"),
      data: orderData
    };
  },

  /**
   * Đồng bộ lịch sử đơn hàng từ Pandora Digital Store (API không hỗ trợ danh sách, trả về mảng rỗng)
   */
  async syncOrders(_ctx: AdapterContext): Promise<SyncedOrderItem[]> {
    return [];
  },

  /**
   * Tra cứu thông tin và chi tiết đơn hàng theo mã đơn
   */
  async checkOrderStatus(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult> {
    const { provider } = ctx;
    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers["Authorization"] = provider.api_key.startsWith("Bearer ")
        ? provider.api_key
        : `Bearer ${provider.api_key}`;
    }

    try {
      const data: any = await providerJson(
        providerUrl(provider.base_url, `/api/v1/orders/${encodeURIComponent(orderCode)}`),
        { headers },
        10000
      );
      if (!data || data?.error) {
        return {
          success: false,
          status: "failed",
          errorMessage: data?.error?.message || data?.error?.code || "Order not found",
          data
        };
      }
      return {
        success: true,
        orderCode: String(data.id || orderCode),
        status: data.status === "delivered" ? "completed" : (data.status || "processing"),
        data
      };
    } catch (err: any) {
      return { success: false, status: "failed", errorMessage: err.message };
    }
  }
};
