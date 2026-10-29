import { useState } from 'react';
import type { Product } from '../types';
import { formatVND } from '../utils/formatters';
import { Dialog } from './Dialog';

export function ProductDetailModal({ product, onClose, onAddToCart, onBuyNow }: {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  return <Dialog title={product.name} onClose={onClose}>
    <p className="muted">{product.category} · {product.in_stock ? 'Còn hàng' : 'Hết hàng'}</p>
    <div className="product-description">{product.description.split(/(https?:\/\/[^\s)\],]+)/g).map((part, index) => /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</div>
    <div className="detail-purchase">
      <label>Số lượng<input type="number" min={1} max={100} step={1} value={quantity} onChange={(event) => setQuantity(Math.min(100, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))} /></label>
      <strong>{formatVND(product.selling_price * quantity)}</strong>
    </div>
    <div className="product-actions">
      <button className="shop-button" disabled={!product.in_stock} onClick={() => { onAddToCart(product, quantity); onClose(); }}>Thêm vào giỏ</button>
      <button className="shop-button primary" disabled={!product.in_stock} onClick={() => { onBuyNow(product, quantity); onClose(); }}>Mua ngay</button>
    </div>
  </Dialog>;
}
