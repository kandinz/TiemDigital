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
}

export interface CartItem {
  product: Product;
  quantity: number;
}
