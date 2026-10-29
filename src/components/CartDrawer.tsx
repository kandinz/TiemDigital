import { Minus, Plus, Trash2 } from 'lucide-react';
import type { CartItem } from '../types';
import { formatVND } from '../utils/formatters';
import { Dialog } from './Dialog';

export function CartDrawer({ onClose, items, onUpdateQuantity, onRemoveItem, onCheckout }: {
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: number, quantity: number) => void;
  onRemoveItem: (id: number) => void;
  onCheckout: () => void;
}) {
  const total = items.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
  return <Dialog title="Giỏ hàng" onClose={onClose} drawer>
    {!items.length ? <div className="shop-empty"><p>Giỏ hàng đang trống.</p><button className="shop-button primary" onClick={onClose}>Chọn sản phẩm</button></div> : <>
      <div className="cart-items">{items.map(({ product, quantity }) => <article className="cart-item" key={product.id}>
        <h3>{product.name}</h3>
        <strong>{formatVND(product.selling_price * quantity)}</strong>
        <div className="cart-item-actions">
          <div className="quantity-control">
            <button className="shop-icon-button" onClick={() => onUpdateQuantity(product.id, quantity - 1)} aria-label={`Giảm số lượng ${product.name}`}><Minus size={15} /></button>
            <span aria-live="polite">{quantity}</span>
            <button className="shop-icon-button" disabled={quantity >= 100} onClick={() => onUpdateQuantity(product.id, quantity + 1)} aria-label={`Tăng số lượng ${product.name}`}><Plus size={15} /></button>
          </div>
          <button className="shop-icon-button" onClick={() => onRemoveItem(product.id)} aria-label={`Xóa ${product.name}`}><Trash2 size={17} /></button>
        </div>
      </article>)}</div>
      <div className="cart-total"><span>Tạm tính</span><strong>{formatVND(total)}</strong></div>
      <button className="shop-button primary cart-checkout" onClick={onCheckout}>Thanh toán</button>
    </>}
  </Dialog>;
}
