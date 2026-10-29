import { Headphones, LayoutGrid, ShoppingBag, UserRound, Wallet } from 'lucide-react';
import type { CartItem } from '../types';

interface HeaderProps {
  cartItems?: CartItem[];
  onOpenCart?: () => void;
}

export function Header({ cartItems = [], onOpenCart }: HeaderProps) {
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const path = window.location.pathname;
  const wallet = path === '/account' && window.location.hash === '#wallet';
  return (
    <header className="shop-header">
      <div className="shop-container shop-header-inner">
        <a href="/" className="shop-wordmark" aria-label="Tiệm Digital, trang sản phẩm">Tiệm<span>Digital</span></a>
        <nav className="shop-nav" aria-label="Điều hướng chính">
          <a href="/" aria-current={path === '/' ? 'page' : undefined}><LayoutGrid size={17} />Sản phẩm</a>
          <a href="/account" aria-current={path === '/account' && !wallet ? 'page' : undefined}><UserRound size={17} />Tài khoản</a>
          <a href="/account#wallet" aria-current={wallet ? 'page' : undefined}><Wallet size={17} />Số dư</a>
          <a href="/pages/lien-he" aria-current={path === '/pages/lien-he' ? 'page' : undefined}><Headphones size={17} />Hỗ trợ</a>
        </nav>
        {onOpenCart && <button className="shop-button primary shop-cart" onClick={onOpenCart} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
          <ShoppingBag size={17} /><span>Giỏ hàng</span>{count > 0 && <span className="cart-count">{count}</span>}
        </button>}
      </div>
    </header>
  );
}
