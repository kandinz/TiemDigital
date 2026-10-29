import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Package, Send } from 'lucide-react';
import { Header } from './components/Header';
import { CategoryPills } from './components/CategoryPills';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { SupportButton } from './components/SupportButton';
import type { Purchase, Product } from './types';
import type { PlatformOrder } from './services/platform';
import { fetchProducts } from './services/api';
import { readPurchaseRequest } from './utils/purchase';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [successOrder, setSuccessOrder] = useState<PlatformOrder | null>(null);
  const [accountVersion, setAccountVersion] = useState(0);

  useEffect(() => {
    let stopped = false;
    fetchProducts().then((data) => {
      if (stopped) return;
      setProducts(data.products);
      setCategories(data.categories);
      const request = readPurchaseRequest(window.location.search);
      const product = request && data.products.find((item) => item.id === request.productId && item.in_stock);
      if (product && request) setPurchase({ product, quantity: request.quantity });
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

  function buyNow(product: Product, quantity = 1) {
    if (!product.in_stock) return;
    setPurchase({ product, quantity });
    window.history.replaceState(null, '', `/?buy=${product.id}&quantity=${quantity}`);
  }
  function closeCheckout() {
    setPurchase(null);
    window.history.replaceState(null, '', '/');
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
    <Header refreshKey={accountVersion} />
    <main id="products" className="shop-container catalog">
      <h1 className="sr-only">Sản phẩm</h1>
      <div className="catalog-layout">
        <aside className="catalog-sidebar"><CategoryPills categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} /><a className="shop-button catalog-bot" href="https://t.me/tiemdigital_bot" target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" />Mở bot Telegram</a></aside>
        <section className="catalog-content" aria-label="Danh sách sản phẩm">
        <div className="catalog-tools">
          <div className="catalog-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm sản phẩm…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
          <select aria-label="Sắp xếp sản phẩm" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="default">Mặc định</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option></select>
        </div>
      {isLoading ? <div className="product-grid" role="status" aria-label="Đang tải sản phẩm">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="product-skeleton" />)}</div>
        : catalogError ? <div className="shop-empty"><p role="alert">{catalogError}</p><button className="shop-button" onClick={() => void loadCatalog()}><RefreshCw size={16} />Thử lại</button></div>
        : !filteredProducts.length ? <div className="shop-empty"><Package size={28} /><h2>{products.length ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm'}</h2><p>{products.length ? 'Thử từ khóa hoặc danh mục khác.' : 'Vui lòng quay lại sau hoặc liên hệ hỗ trợ.'}</p>{products.length ? <button className="shop-button" onClick={resetFilters}>Xóa bộ lọc</button> : <a className="shop-button" href="/pages/lien-he">Hỗ trợ</a>}</div>
        : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} onQuickView={setQuickViewProduct} onBuyNow={buyNow} />)}</div>}
        </section>
      </div>
    </main>
    <SupportButton />
    {quickViewProduct && <ProductDetailModal key={quickViewProduct.id} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onBuyNow={buyNow} />}
    {purchase && <CheckoutModal key={purchase.product.id} onClose={closeCheckout} purchase={purchase} onOrderSuccess={(order) => { setSuccessOrder(order); setAccountVersion((value) => value + 1); }} />}
    {successOrder && <OrderSuccessModal order={successOrder} onClose={() => setSuccessOrder(null)} />}
  </div>;
}
