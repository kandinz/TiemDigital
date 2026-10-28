/**
 * Định nghĩa các kiểu dữ liệu cốt lõi cho Tiệm Digital
 */

export interface Product {
  id: number;
  name: string;
  description: string;
  selling_price: number;
  category: string;
  image_url: string | null;
  in_stock: boolean;
  updated_at: string;
  // Computed & display properties
  original_price?: number;
  discount_percent?: number;
  badge?: string;
  tags?: string[];
}

export interface CatalogResponse {
  success: boolean;
  products: Product[];
  categories: string[];
  total: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CustomerInfo {
  fullName: string;
  email: string;
  phone: string;
  note?: string;
}

export type PaymentMethodType = 'vietqr' | 'momo' | 'contact';

export interface Order {
  orderId: string;
  createdAt: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethodType;
  status: 'pending_payment' | 'processing' | 'completed';
}

export interface BankConfig {
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  vietQrUrl: string;
}

export interface PromoCode {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  description: string;
  minOrder?: number;
}
