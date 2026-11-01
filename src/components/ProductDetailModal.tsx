import { useState } from 'react';
import type { Product } from '../types';
import { formatVND } from '../utils/formatters';
import { ProductDescription } from './ProductDescription';

export function ProductDetailModal({ product, onClose, onBuyNow }: {
  product: Product;
  onClose: () => void;
  onBuyNow: (product: Product, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  return <main className="shop-container product-detail-page">
    <button className="shop-button" onClick={onClose}>Trở lại danh sách</button>
    <h1>{product.name}</h1>
    <p className="muted">{product.category} · {product.in_stock ? 'Còn hàng' : 'Hết hàng'}</p>
    <ProductDescription text={product.description} />
    <div className="detail-purchase">
      <label>Số lượng<input type="number" min={1} max={20} step={1} value={quantity} onChange={(event) => setQuantity(Math.min(20, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))} /></label>
      <strong>{formatVND(product.selling_price * quantity)}</strong>
    </div>
    <div className="product-actions">
      <button className="shop-button primary" disabled={!product.in_stock} onClick={() => onBuyNow(product, quantity)}>Mua ngay</button>
    </div>
  </main>;
}
