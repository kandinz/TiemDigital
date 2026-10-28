/**
 * Thanh bộ lọc danh mục, sắp xếp giá và tìm kiếm của Tiệm Digital
 */

import React from 'react';
import { SlidersHorizontal, RefreshCw, ArrowUpDown } from 'lucide-react';

interface CategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  priceFilter: string;
  onPriceFilterChange: (price: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  totalFiltered: number;
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  sortBy,
  onSortChange,
  priceFilter,
  onPriceFilterChange,
  onRefresh,
  isLoading,
  totalFiltered,
}) => {
  return (
    <div className="space-y-4 mb-6">
      
      {/* Top Row: Category Tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        
        {/* Horizontal scrollable pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1">
          <button
            onClick={() => onSelectCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/50'
            }`}
          >
            Tất Cả ({totalFiltered})
          </button>

          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Live Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-500/50 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
          title="Làm mới danh sách từ Swagger API"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
          <span className="hidden sm:inline">Cập nhật Live</span>
        </button>

      </div>

      {/* Bottom Row: Sort & Filter controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Lọc giá:
          </span>

          <select
            value={priceFilter}
            onChange={(e) => onPriceFilterChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Mọi mức giá</option>
            <option value="under50k">Dưới 50.000 ₫</option>
            <option value="50k-80k">Từ 50.000 ₫ - 80.000 ₫</option>
            <option value="over80k">Trên 80.000 ₫</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sắp xếp:
          </span>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="default">Phổ biến nhất</option>
            <option value="price-asc">Giá: Thấp đến Cao</option>
            <option value="price-desc">Giá: Cao đến Thấp</option>
            <option value="name">Tên A - Z</option>
          </select>
        </div>

      </div>

    </div>
  );
};
