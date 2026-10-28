/**
 * Giỏ hàng trượt từ mép phải (Slide-over Cart Drawer) của Tiệm Digital
 */

import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, Tag, Check, Sparkles } from 'lucide-react';
import type { CartItem, PromoCode } from '../types';
import { AVAILABLE_PROMOS } from '../services/api';
import { formatVND } from '../utils/formatters';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: number, quantity: number) => void;
  onRemoveItem: (productId: number) => void;
  onCheckout: (appliedPromo?: PromoCode, discountAmount?: number) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  const [promoInput, setPromoInput] = useState<string>('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.product.selling_price * item.quantity, 0);

  // Tính toán số tiền giảm giá
  let discountAmount = 0;
  if (appliedPromo) {
    if (appliedPromo.type === 'percent') {
      discountAmount = Math.round((subtotal * appliedPromo.value) / 100);
    } else {
      discountAmount = appliedPromo.value;
    }
  }
  const total = Math.max(0, subtotal - discountAmount);

  const handleApplyPromo = () => {
    setPromoError(null);
    const cleanCode = promoInput.trim().toUpperCase();
    if (!cleanCode) return;

    const found = AVAILABLE_PROMOS.find((p) => p.code.toUpperCase() === cleanCode);
    if (!found) {
      setPromoError('Mã giảm giá không tồn tại hoặc đã hết hạn');
      return;
    }

    if (found.minOrder && subtotal < found.minOrder) {
      setPromoError(`Mã này áp dụng cho đơn từ ${formatVND(found.minOrder)} trở lên`);
      return;
    }

    setAppliedPromo(found);
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      {/* Background overlay click to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 animate-slideLeft">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
              Giỏ Hàng ({items.reduce((sum, i) => sum + i.quantity, 0)})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Giỏ hàng của bạn đang trống
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Hãy chọn các gói tài khoản Claude, Gemini Pro hoặc token MMO để thêm vào giỏ nhé!
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20"
              >
                Khám phá sản phẩm
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800"
              >
                {/* Product thumbnail */}
                <div className="w-14 h-14 rounded-xl bg-slate-200 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden shrink-0">
                  {item.product.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt={item.product.name}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Sparkles className="w-6 h-6 text-emerald-500" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {item.product.name}
                  </h4>
                  <div className="text-xs font-mono font-bold text-emerald-500 mt-0.5">
                    {formatVND(item.product.selling_price)}
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-0.5">
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                        className="w-5 h-5 flex items-center justify-center text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                        className="w-5 h-5 flex items-center justify-center text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => onRemoveItem(item.product.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                      title="Xóa khỏi giỏ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Line total */}
                <div className="text-right shrink-0">
                  <span className="text-xs font-black font-mono text-slate-900 dark:text-slate-100">
                    {formatVND(item.product.selling_price * item.quantity)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Promo Code & Checkout */}
        {items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3.5">
            
            {/* Promo Code Input */}
            <div>
              {appliedPromo ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                    <Check className="w-4 h-4" />
                    <span>Mã {appliedPromo.code}: Giảm {appliedPromo.type === 'percent' ? `${appliedPromo.value}%` : formatVND(appliedPromo.value)}</span>
                  </div>
                  <button
                    onClick={handleRemovePromo}
                    className="text-slate-400 hover:text-rose-500 text-[11px] font-bold"
                  >
                    Gỡ bỏ
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Nhập mã: TIEMDIGITAL, WELCOME15K"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 uppercase placeholder-normal font-mono"
                    />
                  </div>
                  <button
                    onClick={handleApplyPromo}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-bold transition-colors"
                  >
                    Áp dụng
                  </button>
                </div>
              )}
              {promoError && (
                <p className="text-[11px] text-rose-500 mt-1 pl-1">{promoError}</p>
              )}
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Tạm tính</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatVND(subtotal)}
                </span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Giảm giá ({appliedPromo?.code})</span>
                  <span className="font-mono font-bold">-{formatVND(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm sm:text-base font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Tổng thanh toán</span>
                <span className="font-mono text-emerald-500">{formatVND(total)}</span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <button
              onClick={() => {
                onCheckout(appliedPromo || undefined, discountAmount);
                onClose();
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-xl shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>Tiến Hành Thanh Toán</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </div>
        )}

      </div>
    </div>
  );
};
