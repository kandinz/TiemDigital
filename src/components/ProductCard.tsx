/**
 * Card hiển thị từng sản phẩm số trong danh mục của Tiệm Digital
 */

import React from 'react';
import { ShoppingCart, Eye, Zap, Sparkles } from 'lucide-react';
import type { Product } from '../types';
import { extractSpecs, formatVND, getBrandTheme } from '../utils/formatters';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onQuickView,
  onAddToCart,
  onBuyNow,
}) => {
  const specs = extractSpecs(product.name, product.description);
  const theme = getBrandTheme(product.category, product.name);

  // Phân loại hình ảnh mặc định nếu không có image_url từ API
  const renderThumbnail = () => {
    if (product.image_url) {
      return (
        <div className="relative w-full h-44 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-3">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      );
    }

    // Bespoke Brand Artworks khi không có ảnh
    return (
      <div className={`relative w-full h-44 overflow-hidden rounded-xl bg-gradient-to-br ${theme.gradient} border border-slate-200/50 dark:border-slate-800/80 flex flex-col items-center justify-center p-4 text-center select-none`}>
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
          <Sparkles className={`w-7 h-7 ${theme.textBadge}`} />
        </div>
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono tracking-wider uppercase">
          {theme.brandName}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {specs.tokens || specs.duration || product.category}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-sm hover:shadow-xl transition-all duration-300 group">
      
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-md uppercase tracking-wider border ${theme.bgBadge}`}>
            {product.category || 'AI Tool'}
          </span>

          <div className="flex items-center gap-1.5">
            {product.discount_percent && product.discount_percent > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                -{product.discount_percent}%
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Zap className="w-2.5 h-2.5 fill-current" /> {product.in_stock ? "Sẵn hàng" : "Hết hàng"}
            </span>
          </div>
        </div>

        {/* Thumbnail Illustration / Image */}
        {renderThumbnail()}

        {/* Specs highlights */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-2">
          {specs.tokens && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
              ⚡ {specs.tokens}
            </span>
          )}
          {specs.duration && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
              ⏱ {specs.duration}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          onClick={() => onQuickView(product)}
          className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-2 mt-1 mb-2 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors cursor-pointer"
          title={product.name}
        >
          {product.name}
        </h3>

        {/* Short description preview */}
        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
          {product.description.replace(/[#*`_]/g, '')}
        </p>
      </div>

      {/* Pricing & Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
        
        {/* Prices */}
        <div className="flex items-baseline justify-between mb-3.5">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Giá ưu đãi</span>
            <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
              {formatVND(product.selling_price)}
            </span>
          </div>

          {product.original_price && product.original_price > product.selling_price && (
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block line-through">
                {formatVND(product.original_price)}
              </span>
              <span className="text-[10px] font-bold text-emerald-500">
                Tiết kiệm {formatVND(product.original_price - product.selling_price)}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-5 gap-2">
          
          {/* Quick View Button */}
          <button
            onClick={() => onQuickView(product)}
            className="col-span-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
            title="Xem chi tiết & Hướng dẫn sử dụng"
            aria-label="Xem chi tiết"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Add to Cart Button */}
          <button
            onClick={() => onAddToCart(product)}
            disabled={!product.in_stock}
            className="col-span-1 py-2 rounded-xl bg-slate-100 hover:bg-emerald-500/10 dark:bg-slate-800 hover:dark:bg-emerald-500/20 text-slate-700 hover:text-emerald-600 dark:text-slate-200 hover:dark:text-emerald-400 flex items-center justify-center border border-transparent hover:border-emerald-500/30 transition-all"
            title="Thêm vào giỏ hàng"
            aria-label="Thêm vào giỏ"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>

          {/* Buy Now Button */}
          <button
            onClick={() => onBuyNow(product)}
            disabled={!product.in_stock}
            className="col-span-3 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 fill-white" />
            <span>{product.in_stock ? "Mua ngay" : "Hết hàng"}</span>
          </button>

        </div>

      </div>

    </div>
  );
};
