/**
 * Ứng dụng Bán Hàng Trực Tuyến Chuyên Nghiệp - Tiệm Digital
 * Nguồn dữ liệu sản phẩm: Live API https://gumtool.pages.dev/api/mmo/catalog (Swagger)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { CategoryPills } from './components/CategoryPills';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { Footer } from './components/Footer';
import type { CartItem, Order, Product, PromoCode } from './types';
import { fetchProducts } from './services/api';
import { ShoppingBag, Check } from 'lucide-react';

const CART_STORAGE_KEY = 'tiem_digital_cart';
const THEME_STORAGE_KEY = 'tiem_digital_theme';

export const App: React.FC = () => {
  // Theme State (Dark mode default)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved !== null ? saved === 'dark' : true;
  });

  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [catalogError,setCatalogError]=useState('');

  // Filter & Search State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('default');
  const [priceFilter, setPriceFilter] = useState<string>('all');

  // Modals & Panels State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [checkoutPromo, setCheckoutPromo] = useState<PromoCode | undefined>(undefined);
  const [checkoutDiscount, setCheckoutDiscount] = useState<number>(0);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [trackerModalOpen, setTrackerModalOpen] = useState<boolean>(false);
  const [trackerInitialCode, setTrackerInitialCode] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Đồng bộ Theme với DOM
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
    }
  }, [isDark]);

  // Lưu giỏ hàng vào LocalStorage
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // Nạp danh sách sản phẩm từ Swagger API
  const loadCatalog = async () => {
    setIsLoading(true);
    setCatalogError('');
    try {
      const data = await fetchProducts();
      setProducts(data.products);
      setCategories(data.categories);
    } catch (e) {
      console.error('Lỗi nạp sản phẩm', e);
      setCatalogError('Chưa tải được danh mục. Vui lòng thử cập nhật lại.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Hiển thị thông báo Toast nhanh
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Thêm vào giỏ hàng
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    if (!product.in_stock) { showToast("Sản phẩm hiện đã hết hàng."); return; }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { product, quantity }];
    });
    showToast(`Đã thêm "${product.name}" vào giỏ hàng!`);
  };

  // Mua ngay (Thêm vào giỏ & mở Modal thanh toán)
  const handleBuyNow = (product: Product, quantity: number = 1) => {
    if (!product.in_stock) { showToast("Sản phẩm hiện đã hết hàng."); return; }
    handleAddToCart(product, quantity);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  // Cập nhật số lượng trong giỏ
  const handleUpdateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    );
  };

  // Xóa sản phẩm khỏi giỏ
  const handleRemoveFromCart = (productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  // Mở thanh toán từ giỏ hàng
  const handleCheckoutFromCart = (promo?: PromoCode, discountAmount: number = 0) => {
    setCheckoutPromo(promo);
    setCheckoutDiscount(discountAmount);
    setIsCheckoutOpen(true);
  };

  // Xử lý khi đặt hàng thành công
  const handleOrderSuccess = (order: Order) => {
    setSuccessOrder(order);
    setCart([]); // Reset giỏ hàng
  };

  // Điều hướng cuộn mượt
  const handleNavigateSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Lọc và Sắp xếp danh sách sản phẩm
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Lọc theo danh mục
    if (selectedCategory !== 'all') {
      result = result.filter(
        (p) => p.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Lọc theo từ khóa tìm kiếm
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    // Lọc theo khoảng giá
    if (priceFilter === 'under50k') {
      result = result.filter((p) => p.selling_price < 50000);
    } else if (priceFilter === '50k-80k') {
      result = result.filter((p) => p.selling_price >= 50000 && p.selling_price <= 80000);
    } else if (priceFilter === 'over80k') {
      result = result.filter((p) => p.selling_price > 80000);
    }

    // Sắp xếp
    if (sortBy === 'price-asc') {
      result.sort((a, b) => a.selling_price - b.selling_price);
    } else if (sortBy === 'price-desc') {
      result.sort((a, b) => b.selling_price - a.selling_price);
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [products, selectedCategory, searchQuery, priceFilter, sortBy]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      
      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 shadow-2xl animate-slideLeft text-xs font-bold">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <Header
        cartItems={cart}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenOrderTracker={() => {
          setTrackerInitialCode('');
          setTrackerModalOpen(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNavigateSection={handleNavigateSection}
      />

      {/* Products Section */}
      <main id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400 mb-2">Tiệm Digital / Cửa hàng</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Sản phẩm số</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chọn sản phẩm phù hợp với nhu cầu của bạn.</p>
          </div>
          <p className="text-sm text-slate-500" aria-live="polite">{filteredProducts.length} sản phẩm</p>
        </div>

        {/* Filter & Sort Controls */}
        <CategoryPills
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          sortBy={sortBy}
          onSortChange={setSortBy}
          priceFilter={priceFilter}
          onPriceFilterChange={setPriceFilter}
          onRefresh={loadCatalog}
          isLoading={isLoading}
          totalFiltered={filteredProducts.length}
        />

        {/* Product Grid */}
        {catalogError ? <p role="alert" className="text-center text-rose-500 py-12">{catalogError}</p> : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 py-12">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800/50 animate-pulse border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-6 w-24 bg-slate-300 dark:bg-slate-700 rounded-md" />
                  <div className="h-40 bg-slate-300 dark:bg-slate-700/50 rounded-xl" />
                  <div className="h-5 w-3/4 bg-slate-300 dark:bg-slate-700 rounded-md" />
                </div>
                <div className="h-10 bg-slate-300 dark:bg-slate-700 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Không tìm thấy sản phẩm nào
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Không có sản phẩm nào khớp với bộ lọc hoặc từ khóa "{searchQuery}". Bạn hãy thử tìm với từ khóa khác nhé!
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
                setPriceFilter('all');
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-md"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onQuickView={setQuickViewProduct}
                onAddToCart={handleAddToCart}
                onBuyNow={handleBuyNow}
              />
            ))}
          </div>
        )}

      </main>

      <Footer />

      {/* Modals & Drawers */}
      <ProductDetailModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={handleCheckoutFromCart}
      />

      {isCheckoutOpen && <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        promo={checkoutPromo}
        discountAmount={checkoutDiscount}
        onOrderSuccess={handleOrderSuccess}
      />}

      <OrderSuccessModal
        order={successOrder}
        onClose={() => setSuccessOrder(null)}
        onTrackOrder={(code) => {
          setTrackerInitialCode(code);
          setTrackerModalOpen(true);
        }}
      />

      {trackerModalOpen && <OrderTrackerModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        initialCode={trackerInitialCode}
      />}

    </div>
  );
};

export default App;
