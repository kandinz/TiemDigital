export interface UnifiedProduct {
  provider_id: string;
  provider_name?: string;
  provider_product_id: string;
  name: string;
  price_usd: number;
  price_original: number;
  currency_original: string;
  in_stock: boolean;
  delivery_type?: string;
  bot_url?: string | null;
  avatar_url?: string | null;
  category?: string;
  extra?: any;
}

export interface ProviderRecord {
  id: string;
  name: string;
  base_url: string;
  auth_type: string;
  auth_key_name: string;
  api_key: string;
  is_active?: number | boolean;
  sort_order?: number;
  bot_url?: string | null;
  avatar_url?: string | null;
  balance_cache?: string | null;
  balance_cached_at?: string | null;
  live_balance?: number;
  live_currency?: string;
}

export interface AdapterContext {
  provider: ProviderRecord;
  usdRate: number;
}

export interface OrderParams {
  product_id: string | number;
  quantity: number;
  email?: string | null;
  product_name?: string;
  unit_price?: number;
  total_price?: number;
}

export interface PlaceOrderResult {
  success: boolean;
  data?: any;
  providerOrderId?: string | null;
  delivered?: any;
  status?: string;
  error?: string;
  statusCode?: number;
}

export interface SyncedOrderItem {
  provider_order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  status: string;
  delivered_data?: any;
  customer_email?: string | null;
  raw: any;
}

export interface BalanceResult {
  balance: number;
  currency: string;
  balance_original?: number;
  currency_original?: string;
}

export interface CheckOrderStatusResult {
  success: boolean;
  orderCode?: string;
  status: string;
  inviteStatus?: string;
  customerEmail?: string | null;
  errorMessage?: string | null;
  data?: any;
}

/**
 * Interface chuẩn cho các nhà cung cấp sản phẩm MMO
 */
export interface ProviderAdapter {
  /**
   * Tải danh mục sản phẩm từ nhà cung cấp và chuẩn hóa dữ liệu
   */
  fetchProducts(ctx: AdapterContext): Promise<UnifiedProduct[]>;

  /**
   * Truy vấn số dư ví hiện tại của nhà cung cấp
   */
  fetchBalance(ctx: AdapterContext): Promise<BalanceResult>;

  /**
   * Thực hiện đặt hàng sản phẩm qua API nhà cung cấp
   */
  placeOrder(ctx: AdapterContext, params: OrderParams): Promise<PlaceOrderResult>;

  /**
   * Đồng bộ danh sách đơn hàng đã mua từ nhà cung cấp
   */
  syncOrders(ctx: AdapterContext): Promise<SyncedOrderItem[]>;

  /**
   * Kiểm tra trạng thái đơn hàng ngầm từ nhà cung cấp
   */
  checkOrderStatus?(ctx: AdapterContext, orderCode: string): Promise<CheckOrderStatusResult>;
}
