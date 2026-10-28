/**
 * Header chính của Tiệm Digital - Điều hướng, Tìm kiếm, Đổi Theme & Giỏ hàng
 */

import React from 'react';
import { ShoppingBag, Sun, Moon, Search, ShieldCheck, Zap, PackageCheck } from 'lucide-react';
import type { CartItem } from '../types';

interface HeaderProps {
  cartItems: CartItem[];
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenCart: () => void;
  onOpenOrderTracker: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigateSection: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartItems,
  isDark,
  onToggleTheme,
  onOpenCart,
  onOpenOrderTracker,
  searchQuery,
  onSearchChange,
  onNavigateSection,
}) => {
  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-[#090d16]/85 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => onNavigateSection('hero')}>
            <div className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 p-[1.5px] shadow-lg shadow-emerald-500/20 group">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center transition-transform group-hover:scale-95">
                <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
                  Tiệm<span className="text-emerald-500">Digital</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  PRO
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tracking-tight">
                Kho Tài Khoản & Token AI Uy Tín
              </span>
            </div>
          </div>

          {/* Quick Search Bar (Desktop) */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Tìm Claude API, Gemini Pro, Muse AI..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 text-slate-900 dark:text-slate-100 placeholder-slate-400 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <button
              onClick={() => onNavigateSection('products')}
              className="hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
            >
              Sản phẩm
            </button>
            <button
              onClick={() => onNavigateSection('trust')}
              className="hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Cam kết
            </button>
            <button
              onClick={() => onNavigateSection('reviews')}
              className="hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
            >
              Đánh giá
            </button>
            <button
              onClick={() => onNavigateSection('faq')}
              className="hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
            >
              Hỏi đáp
            </button>
          </nav>

          {/* Action Buttons: Order Tracker, Theme Toggle, Cart */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Tra Cứu Đơn Hàng */}
            <button
              onClick={onOpenOrderTracker}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all"
              title="Tra cứu tình trạng đơn hàng"
            >
              <PackageCheck className="w-4 h-4 text-emerald-500" />
              <span>Tra cứu đơn</span>
            </button>

            {/* Dark / Light Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-500/50 transition-all shadow-sm"
              title={isDark ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />}
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative inline-flex items-center gap-2 px-3.5 py-2 sm:py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
              aria-label="Xem Giỏ Hàng"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Giỏ hàng</span>
              {totalCartCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-black rounded-full bg-white text-emerald-600 shadow-sm animate-pulse">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>

        </div>

        {/* Mobile Search Bar (hiện trên màn hình điện thoại) */}
        <div className="pb-3 md:hidden">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm tài khoản AI, Claude, Gemini..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
            />
          </div>
        </div>

      </div>
    </header>
  );
};
