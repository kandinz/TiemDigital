/**
 * Modal Thanh toán & Đặt hàng chuyên nghiệp với VietQR động của Tiệm Digital
 */

import React, { useState } from 'react';
import { X, QrCode, CreditCard, Send, Copy, Check, ShieldCheck, Mail, Phone, User } from 'lucide-react';
import type { CartItem, CustomerInfo, Order, PaymentMethodType, PromoCode } from '../types';
import { BANK_CONFIG, generateVietQrUrl, saveLocalOrder } from '../services/api';
import { formatVND } from '../utils/formatters';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  promo?: PromoCode;
  discountAmount?: number;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  promo,
  discountAmount = 0,
  onOrderSuccess,
}) => {
  // Form State
  const [customer, setCustomer] = useState<CustomerInfo>({
    fullName: '',
    email: '',
    phone: '',
    note: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('vietqr');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sinh mã đơn hàng cố định cho phiên thanh toán này
  const [orderCode] = useState<string>(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TD${day}${month}${rand}`;
  });

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, i) => acc + i.product.selling_price * i.quantity, 0);
  const total = Math.max(0, subtotal - discountAmount);

  // VietQR image URL
  const qrUrl = generateVietQrUrl(total, orderCode);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!customer.fullName.trim()) errs.fullName = 'Vui lòng nhập họ và tên';
    if (!customer.email.trim()) {
      errs.email = 'Vui lòng nhập email nhận tài khoản';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errs.email = 'Email không đúng định dạng';
    }
    if (!customer.phone.trim()) {
      errs.phone = 'Vui lòng nhập số điện thoại hoặc Zalo';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitOrder = () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    const newOrder: Order = {
      orderId: orderCode,
      createdAt: new Date().toISOString(),
      customer,
      items,
      subtotal,
      discountCode: promo?.code,
      discountAmount,
      total,
      paymentMethod,
      status: 'pending_payment',
    };

    // Lưu vào LocalStorage
    saveLocalOrder(newOrder);

    setTimeout(() => {
      setIsSubmitting(false);
      onOrderSuccess(newOrder);
      onClose();
    }, 800);
  };

  // URL mở Zalo hỗ trợ nhanh
  const zaloSupportMessage = encodeURIComponent(
    `Chào Tiệm Digital, mình muốn thanh toán đơn hàng ${orderCode}.\n` +
    `Sản phẩm: ${items.map(i => `${i.product.name} (x${i.quantity})`).join(', ')}\n` +
    `Tổng tiền: ${formatVND(total)}\n` +
    `Email nhận tài khoản: ${customer.email || 'Chưa điền'}`
  );
  const zaloSupportUrl = `https://zalo.me?text=${zaloSupportMessage}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7 z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-500 font-mono">
                MÃ ĐƠN: #{orderCode}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Chờ thanh toán
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
              Thanh Toán Đơn Hàng
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6">
          
          {/* CỘT TRÁI: Thông tin khách hàng & Phương thức thanh toán (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* 1. Thông tin người nhận */}
            <div className="space-y-3.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-500" />
                <span>1. Thông Tin Nhận Tài Khoản / Key</span>
              </h3>

              <div className="space-y-3">
                {/* Họ tên */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Họ và tên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={customer.fullName}
                    onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                  {errors.fullName && <p className="text-[11px] text-rose-500 mt-1">{errors.fullName}</p>}
                </div>

                {/* Email nhận tài khoản */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Email nhận mã / key <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      placeholder="ban@example.com (Hệ thống gửi tự động vào email này)"
                      value={customer.email}
                      onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  {errors.email && <p className="text-[11px] text-rose-500 mt-1">{errors.email}</p>}
                </div>

                {/* SĐT / Zalo */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Số điện thoại / Zalo <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      placeholder="Số Zalo để hỗ trợ nhanh khi có sự cố"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  {errors.phone && <p className="text-[11px] text-rose-500 mt-1">{errors.phone}</p>}
                </div>

                {/* Ghi chú */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Ghi chú thêm (Tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Cần kích hoạt ngay, hoặc hướng dẫn dùng Cursor..."
                    value={customer.note || ''}
                    onChange={(e) => setCustomer({ ...customer, note: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Chọn hình thức thanh toán */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-500" />
                <span>2. Phương Thức Thanh Toán</span>
              </h3>

              <div className="grid grid-cols-3 gap-2.5">
                {/* VietQR */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('vietqr')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'vietqr'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-xs">Chuyển Khoản QR</span>
                </button>

                {/* MoMo */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('momo')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'momo'
                      ? 'border-pink-500 bg-pink-500/10 text-pink-600 dark:text-pink-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs">Ví MoMo</span>
                </button>

                {/* Zalo / Telegram CSKH */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('contact')}
                  className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'contact'
                      ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Send className="w-5 h-5" />
                  <span className="text-xs">Zalo / CSKH</span>
                </button>
              </div>
            </div>

          </div>

          {/* CỘT PHẢI: Hiển thị VietQR & Chi tiết thanh toán (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
            
            <div className="space-y-4">
              
              {/* VietQR View */}
              {paymentMethod === 'vietqr' && (
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 mb-3 w-48 h-48 flex items-center justify-center">
                    <img
                      src={qrUrl}
                      alt="VietQR Tiệm Digital"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Quét mã bằng app ngân hàng bất kỳ
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Số tiền và nội dung chuyển khoản được điền tự động
                  </span>
                </div>
              )}

              {/* MoMo View */}
              {paymentMethod === 'momo' && (
                <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/20 text-center space-y-2">
                  <div className="text-xs font-bold text-pink-600 dark:text-pink-400">
                    Chuyển tiền qua Ví MoMo
                  </div>
                  <div className="font-mono text-base font-black text-slate-900 dark:text-white">
                    0988 889 999
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Tên ví: <strong>TIEM DIGITAL</strong>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Lời nhắn chuyển tiền: <strong>{orderCode}</strong>
                  </div>
                </div>
              )}

              {/* Contact / Zalo View */}
              {paymentMethod === 'contact' && (
                <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center space-y-3">
                  <div className="text-xs font-bold text-sky-600 dark:text-sky-400">
                    Hỗ trợ thanh toán trực tiếp qua Zalo
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Nhân viên trực chat sẽ xác nhận và gửi thông tin tài khoản qua tin nhắn Zalo ngay cho bạn.
                  </p>
                  <a
                    href={zaloSupportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Mở Zalo Nhắn Tin Ngay</span>
                  </a>
                </div>
              )}

              {/* Bank Account Details with 1-click Copy */}
              <div className="space-y-2 text-xs bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Ngân hàng:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{BANK_CONFIG.bankName}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{BANK_CONFIG.accountNumber}</span>
                    <button
                      onClick={() => handleCopy(BANK_CONFIG.accountNumber, 'stk')}
                      className="p-1 text-slate-400 hover:text-emerald-500"
                      title="Sao chép số tài khoản"
                    >
                      {copiedField === 'stk' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Chủ tài khoản:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{BANK_CONFIG.accountHolder}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Số tiền:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-emerald-500 text-sm">{formatVND(total)}</span>
                    <button
                      onClick={() => handleCopy(String(total), 'amount')}
                      className="p-1 text-slate-400 hover:text-emerald-500"
                      title="Sao chép số tiền"
                    >
                      {copiedField === 'amount' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">Nội dung CK:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-500">{orderCode}</span>
                    <button
                      onClick={() => handleCopy(orderCode, 'code')}
                      className="p-1 text-slate-400 hover:text-emerald-500"
                      title="Sao chép nội dung chuyển khoản"
                    >
                      {copiedField === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security guarantee note */}
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                <span>
                  Sau khi chuyển khoản, vui lòng ấn nút <strong>"Xác Nhận Đã Thanh Toán"</strong> bên dưới. Hệ thống sẽ kiểm tra và gửi tài khoản qua Email ngay lập tức!
                </span>
              </div>

            </div>

            {/* Confirm Payment Action Button */}
            <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitOrder}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white font-bold text-sm shadow-xl shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Đang xử lý đơn...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Tôi Đã Chuyển Khoản {formatVND(total)}</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
