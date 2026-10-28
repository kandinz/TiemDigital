/**
 * Modal chúc mừng đặt hàng thành công kèm hiệu ứng pháo hoa Confetti của Tiệm Digital
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Copy, Check, MessageSquare, Mail, ShieldCheck } from 'lucide-react';
import type { Order } from '../types';

interface OrderSuccessModalProps {
  order: Order | null;
  onClose: () => void;
  onTrackOrder: (code: string) => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  order,
  onClose,
  onTrackOrder,
}) => {
  const [copied, setCopied] = React.useState<boolean>(false);

  useEffect(() => {
    if (order) {
      // Bắn pháo hoa Confetti ăn mừng
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 300);
    }
  }, [order]);

  if (!order) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(order.orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const zaloUrl = `https://zalo.me?text=${encodeURIComponent(
    `Chào Tiệm Digital, mình vừa đặt đơn hàng #${order.orderId}. Nhờ hỗ trợ kiểm tra và gửi mã kích hoạt giúp mình!`
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      {/* Container */}
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-center animate-scaleUp">
        
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-500 mx-auto flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
          Đặt Hàng Thành Công!
        </h2>
        
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          Cảm ơn bạn đã lựa chọn <strong>Tiệm Digital</strong>. Thông tin tài khoản và hướng dẫn đang được chuẩn bị gửi tới bạn.
        </p>

        {/* Order Code Box */}
        <div className="my-5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Mã Đơn Hàng</span>
            <span className="font-mono text-base font-black text-emerald-500">#{order.orderId}</span>
          </div>

          <button
            onClick={handleCopyCode}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </>
            )}
          </button>
        </div>

        {/* Step-by-step next actions */}
        <div className="text-left space-y-2.5 my-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <span>
              Kiểm tra hộp thư <strong>{order.customer.email}</strong> (cả mục Spam/Quảng cáo) trong 1 - 3 phút để nhận Key và tài liệu kích hoạt.
            </span>
          </div>

          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span>
              Đơn hàng được bảo hành 1 đổi 1. Nếu cần hỗ trợ cấu hình Cursor, VS Code hoặc 9Router, kỹ thuật viên luôn sẵn sàng.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <a
            href={zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Nhắn Zalo Nhận Hỗ Trợ Kích Hoạt Ngay</span>
          </a>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onTrackOrder(order.orderId);
                onClose();
              }}
              className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
            >
              Tra Cứu Đơn Này
            </button>

            <button
              onClick={onClose}
              className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
            >
              Tiếp Tục Mua Sắm
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
