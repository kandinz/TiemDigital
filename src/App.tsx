import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { Header } from './components/Header';
import { CategoryPills } from './components/CategoryPills';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { Footer } from './components/Footer';
import type { CartItem, Product } from './types';
import type { PlatformOrder } from './services/platform';
import { fetchProducts } from './services/api';

const CART_STORAGE_KEY = 'tiem_digital_cart';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter((item): item is CartItem =>
        item?.product && Number.isInteger(item.product.id) && typeof item.product.name === 'string' &&
        Number.isFinite(item.product.selling_price) && item.product.selling_price > 0 &&
        Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100) : [];
    } catch { return []; }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [successOrder, setSuccessOrder] = useState<PlatformOrder | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch { /* Giỏ hàng vẫn dùng được trong phiên hiện tại. */ }
  }, [cart]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let stopped = false;
    fetchProducts().then((data) => {
      if (stopped) return;
      setProducts(data.products);
      setCategories(data.categories);
    }).catch(() => {
      if (!stopped) setCatalogError('Chưa tải được sản phẩm. Vui lòng thử lại.');
    }).finally(() => { if (!stopped) setIsLoading(false); });
    return () => { stopped = true; };
  }, [catalogVersion]);
  function loadCatalog() {
    setIsLoading(true);
    setCatalogError('');
    setCatalogVersion((value) => value + 1);
  }

  function showToast(message: string) {
    clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2500);
  }
  function addToCart(product: Product, quantity = 1) {
    if (!product.in_stock) return;
    setCart((previous) => {
      const existing = previous.find((item) => item.product.id === product.id);
      return existing
        ? previous.map((item) => item.product.id === product.id ? { product, quantity: Math.min(100, item.quantity + quantity) } : item)
        : [...previous, { product, quantity }];
    });
    showToast('Đã thêm vào giỏ hàng.');
  }
  function buyNow(product: Product, quantity = 1) {
    if (!product.in_stock) return;
    addToCart(product, quantity);
    setIsCheckoutOpen(true);
  }
  function resetFilters() { setSelectedCategory('all'); setSearchQuery(''); setSortBy('default'); }

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('vi');
    const result = products.filter((product) =>
      (selectedCategory === 'all' || product.category === selectedCategory) &&
      (!query || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase('vi').includes(query)));
    if (sortBy === 'price-asc') result.sort((a, b) => a.selling_price - b.selling_price);
    if (sortBy === 'price-desc') result.sort((a, b) => b.selling_price - a.selling_price);
    return result;
  }, [products, selectedCategory, searchQuery, sortBy]);

  return <div className="shop-shell">
    <Header cartItems={cart} onOpenCart={() => setIsCartOpen(true)} />
    {toastMessage && <div className="shop-toast" role="status"><Check size={17} />{toastMessage}</div>}
    <main id="products" className="shop-container catalog">
      <div className="catalog-heading"><h1>Sản phẩm <span aria-live="polite">{isLoading ? '…' : catalogError ? '' : filteredProducts.length}</span></h1>
        <div className="catalog-tools">
          <div className="catalog-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm sản phẩm…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
          <select aria-label="Sắp xếp sản phẩm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="default">Mặc định</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option></select>
        </div>
      </div>
      <CategoryPills categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
      {isLoading ? <div className="product-grid" role="status" aria-label="Đang tải sản phẩm">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="product-skeleton" />)}</div>
        : catalogError ? <div className="shop-empty"><p role="alert">{catalogError}</p><button className="shop-button" onClick={() => void loadCatalog()}><RefreshCw size={16} />Thử lại</button></div>
        : !filteredProducts.length ? <div className="shop-empty"><ShoppingBag size={28} /><h2>{products.length ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm'}</h2><p>{products.length ? 'Thử từ khóa hoặc danh mục khác.' : 'Vui lòng quay lại sau hoặc liên hệ hỗ trợ.'}</p>{products.length ? <button className="shop-button" onClick={resetFilters}>Xóa bộ lọc</button> : <a className="shop-button" href="/pages/lien-he">Hỗ trợ</a>}</div>
        : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onQuickView={setQuickViewProduct} onAddToCart={addToCart} onBuyNow={buyNow} />)}</div>}
    </main>
    <Footer />
    {quickViewProduct && <ProductDetailModal key={quickViewProduct.id} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAddToCart={addToCart} onBuyNow={buyNow} />}
    {isCartOpen && <CartDrawer onClose={() => setIsCartOpen(false)} items={cart} onUpdateQuantity={(id, quantity) => setCart((previous) => quantity <= 0 ? previous.filter((item) => item.product.id !== id) : previous.map((item) => item.product.id === id ? { ...item, quantity: Math.min(100, quantity) } : item))} onRemoveItem={(id) => setCart((previous) => previous.filter((item) => item.product.id !== id))} onCheckout={() => { setIsCartOpen(false); setIsCheckoutOpen(true); }} />}
    {isCheckoutOpen && <CheckoutModal isOpen onClose={() => setIsCheckoutOpen(false)} items={cart} onOrderSuccess={(order) => { setSuccessOrder(order); setCart([]); }} />}
    {successOrder && <OrderSuccessModal order={successOrder} onClose={() => setSuccessOrder(null)} />}
  </div>;
}
