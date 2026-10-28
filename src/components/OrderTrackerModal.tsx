/**
 * Modal Tra Cứu Đơn Hàng của Tiệm Digital
 */

import React, { useState } from 'react';
import { X, Search, Package, Clock, ShieldAlert, ExternalLink } from 'lucide-react';
import type { Order } from '../types';
import { findOrderByCode, getLocalOrders } from '../services/api';
import { formatFriendlyDate, formatVND } from '../utils/formatters';

interface OrderTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  isOpen,
  onClose,
  initialCode = '',
}) => {
  const [searchCode, setSearchCode] = useState<string>(initialCode);
  const [foundOrder, setFoundOrder] = useState<Order | null>(() => {
    return initialCode ? findOrderByCode(initialCode) || null : null;
  });
  const [hasSearched, setHasSearched] = useState<boolean>(Boolean(initialCode));

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchCode.replace('#', '').trim();
    if (!clean) return;

    const result = findOrderByCode(clean);
    setFoundOrder(result || null);
    setHasSearched(true);
  };

  const recentOrders = getLocalOrders().slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7 z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
              Tra Cứu Tình Trạng Đơn Hàng
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Box */}
        <form onSubmit={handleSearch} className="my-5 flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Nhập mã đơn hàng (Ví dụ: TD28108921)"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 uppercase font-mono font-bold focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all"
          >
            Tra cứu
          </button>
        </form>

        {/* Search Result Display */}
        {foundOrder ? (
          <div className="space-y-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
            
            {/* Status Header */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Đơn Hàng</span>
                <span className="text-base font-black font-mono text-emerald-500">#{foundOrder.orderId}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Clock className="w-3.5 h-3.5" />
                <span>Đang xử lý kích hoạt</span>
              </div>
            </div>

            {/* Customer info */}
            <div className="text-xs space-y-1 py-2 border-y border-slate-200/70 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <div>Khách hàng: <strong>{foundOrder.customer.fullName}</strong></div>
              <div>Email nhận key: <strong>{foundOrder.customer.email}</strong></div>
              <div>Thời gian tạo: {formatFriendlyDate(foundOrder.createdAt)}</div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Sản phẩm trong đơn:</span>
              {foundOrder.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-xs py-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{i.product.name} (x{i.quantity})</span>
                  <span className="font-mono font-bold text-emerald-500">{formatVND(i.product.selling_price * i.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 flex justify-between items-center text-sm font-bold">
              <span>Tổng thanh toán:</span>
              <span className="text-base font-black font-mono text-emerald-500">{formatVND(foundOrder.total)}</span>
            </div>

            {/* Support link */}
            <a
              href={`https://zalo.me?text=${encodeURIComponent(`Chào Tiệm Digital, mình muốn kiểm tra đơn hàng #${foundOrder.orderId}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-3 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Hỏi Hỗ Trợ Zalo Về Đơn Này</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

          </div>
        ) : hasSearched ? (
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
              Chưa tìm thấy đơn hàng với mã này trên trình duyệt của bạn
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Nếu bạn vừa chuyển khoản hoặc đặt trên thiết bị khác, vui lòng gửi mã chuyển khoản qua Zalo để nhân viên kiểm tra ngay lập tức.
            </p>
          </div>
        ) : null}

        {/* Recent orders on this device */}
        {recentOrders.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-400 block mb-2.5">
              Đơn hàng gần đây của bạn:
            </span>
            <div className="space-y-2">
              {recentOrders.map((ord) => (
                <div
                  key={ord.orderId}
                  onClick={() => {
                    setSearchCode(ord.orderId);
                    setFoundOrder(ord);
                    setHasSearched(true);
                  }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-500">#{ord.orderId}</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {ord.items.map((i) => i.product.name).join(', ')}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                    {formatVND(ord.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
