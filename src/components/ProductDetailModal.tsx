/**
 * Modal hiển thị chi tiết sản phẩm, tài liệu hướng dẫn và link kích hoạt
 */

import React, { useState } from 'react';
import { X, ShoppingCart, Zap, ExternalLink, Copy, Check, FileText } from 'lucide-react';
import type { Product } from '../types';
import { extractSpecs, extractUrls, formatVND, getBrandTheme } from '../utils/formatters';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  if (!product) return null;

  const specs = extractSpecs(product.name, product.description);
  const theme = getBrandTheme(product.category, product.name);
  const extractedUrls = extractUrls(product.description);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleQtyChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7 z-10 transition-all">
        
        {/* Header & Close button */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-md border ${theme.bgBadge}`}>
                {product.category || 'Sản phẩm'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Zap className="w-2.5 h-2.5 fill-current" /> Sẵn sàng kích hoạt
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
              {product.name}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Specs highlights */}
        <div className="grid grid-cols-3 gap-2 my-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Dung lượng</span>
            <span className="text-xs sm:text-sm font-black font-mono text-emerald-500">
              {specs.tokens || 'Không giới hạn'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Thời hạn</span>
            <span className="text-xs sm:text-sm font-black font-mono text-sky-500">
              {specs.duration || 'Theo gói'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Chính sách</span>
            <span className="text-xs sm:text-sm font-black font-mono text-amber-500 truncate block">
              {specs.warranty}
            </span>
          </div>
        </div>

        {/* Detailed Description with Formatting */}
        <div className="my-5 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>Mô tả chi tiết & Hướng dẫn sử dụng</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {product.description}
          </div>
        </div>

        {/* Quick External Links found in description */}
        {extractedUrls.length > 0 && (
          <div className="my-5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <ExternalLink className="w-4 h-4 text-sky-500" />
              <span>Liên kết & Công cụ kích hoạt nhanh:</span>
            </div>
            <div className="flex flex-col gap-2">
              {extractedUrls.map((url, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 text-xs gap-2"
                >
                  <span className="truncate text-slate-600 dark:text-slate-300 font-mono flex-1">
                    {url}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopy(url)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-sans text-[11px] font-bold flex items-center gap-1"
                      title="Sao chép liên kết"
                    >
                      {copiedUrl === url ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Chép link</span>
                        </>
                      )}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold"
                      title="Mở liên kết"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pricing, Quantity & Action Bottom Bar */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Đơn giá</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-500 font-mono">
                {formatVND(product.selling_price * quantity)}
              </span>
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 p-1">
              <button
                onClick={() => handleQtyChange(-1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm"
              >
                -
              </button>
              <span className="w-8 text-center font-bold text-xs font-mono text-slate-900 dark:text-white">
                {quantity}
              </span>
              <button
                onClick={() => handleQtyChange(1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => {
                onAddToCart(product, quantity);
                onClose();
              }}
              className="flex-1 sm:flex-initial px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Thêm Vào Giỏ</span>
            </button>

            <button
              onClick={() => {
                onBuyNow(product, quantity);
                onClose();
              }}
              className="flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Mua Ngay</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
