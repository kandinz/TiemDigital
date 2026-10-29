import React from 'react';

export const Footer: React.FC = () => <footer className="border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 flex flex-wrap items-center justify-between gap-4">
    <span>© {new Date().getFullYear()} Tiệm Digital</span>
    <nav className="flex gap-5" aria-label="Liên kết cửa hàng"><a href="#products" className="hover:text-emerald-500">Sản phẩm</a><a href="/account" className="hover:text-emerald-500">Tài khoản</a><a href="/pages/lien-he" className="hover:text-emerald-500">Hỗ trợ</a></nav>
  </div>
</footer>;
