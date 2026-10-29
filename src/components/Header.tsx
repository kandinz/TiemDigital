import React from 'react';
import { ShoppingBag, Sun, Moon, Search, UserRound, PackageCheck } from 'lucide-react';
import type { CartItem } from '../types';

interface HeaderProps {
  cartItems: CartItem[]; isDark: boolean; onToggleTheme: () => void;
  onOpenCart: () => void; onOpenOrderTracker: () => void;
  searchQuery: string; onSearchChange: (value: string) => void;
  onNavigateSection: (id: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ cartItems, isDark, onToggleTheme, onOpenCart, onOpenOrderTracker, searchQuery, onSearchChange }) => {
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const search = <div className="relative w-full"><Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input aria-label="Tìm sản phẩm" type="search" placeholder="Tìm sản phẩm..." value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} className="w-full h-10 pl-10 pr-4 text-sm rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>;
  return <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#090d16]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="h-16 sm:h-20 flex items-center gap-3 sm:gap-6">
        <a href="/" className="shrink-0 text-lg sm:text-xl font-black tracking-tight">Tiệm<span className="text-emerald-500">Digital</span><span className="block text-[10px] font-medium tracking-wide text-slate-500">CỬA HÀNG SẢN PHẨM SỐ</span></a>
        <div className="hidden md:block max-w-md flex-1 mx-auto">{search}</div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button onClick={onOpenOrderTracker} title="Đơn hàng" aria-label="Tra cứu đơn hàng" className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><PackageCheck className="w-5 h-5" /></button>
          <a href="/account" aria-label="Tài khoản" title="Tài khoản" className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><UserRound className="w-5 h-5" /></a>
          <button onClick={onToggleTheme} aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">{isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
          <button onClick={onOpenCart} aria-label={`Giỏ hàng, ${count} sản phẩm`} className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2.5 text-sm font-semibold"><ShoppingBag className="w-4 h-4" /><span className="hidden sm:inline">Giỏ hàng</span>{count > 0 && <span>{count}</span>}</button>
        </div>
      </div>
      <div className="md:hidden pb-3">{search}</div>
    </div>
  </header>;
};
