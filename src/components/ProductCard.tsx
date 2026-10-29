import { Package, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../types';
import { extractSpecs, formatVND } from '../utils/formatters';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
}

export function ProductCard({ product, onQuickView, onAddToCart, onBuyNow }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const specs = extractSpecs(product.name);
  return <article className="product-card">
    <h2><button className="product-summary" onClick={() => onQuickView(product)} aria-label={`Xem chi tiết ${product.name}`}>
      <span className="product-image">
        {product.image_url && !imageFailed
          ? <img src={product.image_url} alt="" width={56} height={56} loading="lazy" onError={() => setImageFailed(true)} />
          : <Package size={26} strokeWidth={1.5} />}
      </span>
      <span className="product-heading"><span className="product-category">{product.category}</span><span className="product-name">{product.name}</span></span>
    </button></h2>
    <div className="product-specs">{[specs.tokens, specs.duration].filter(Boolean).join(' · ') || product.category}</div>
    <div className="product-price-row"><strong>{formatVND(product.selling_price)}</strong><span className={product.in_stock ? 'stock-label' : 'muted'}>{product.in_stock ? 'Còn hàng' : 'Hết hàng'}</span></div>
    <div className="product-actions">
      <button className="shop-button primary" disabled={!product.in_stock} onClick={() => onBuyNow(product)}>{product.in_stock ? 'Mua ngay' : 'Hết hàng'}</button>
      <button className="shop-button" disabled={!product.in_stock} onClick={() => onAddToCart(product)} aria-label={`Thêm ${product.name} vào giỏ`} title="Thêm vào giỏ"><ShoppingCart size={18} /></button>
    </div>
  </article>;
}
