/**
 * Footer chân trang của Tiệm Digital
 */

import React from 'react';
import { Zap, Mail, Phone, Send, Clock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 pt-12 pb-8 text-xs text-slate-500 dark:text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-slate-200 dark:border-slate-800">
          
          {/* Cột 1 & 2: Thương hiệu & Giới thiệu (2 cols) */}
          <div className="lg:col-span-2 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Zap className="w-4 h-4 fill-white" />
              </div>
              <span className="text-xl font-black text-slate-900 dark:text-white font-['Plus_Jakarta_Sans']">
                Tiệm<span className="text-emerald-500">Digital</span>
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm">
              Nền tảng cung cấp tài khoản AI, bản quyền công cụ số, token Claude, Gemini Pro và dịch vụ MMO uy tín hàng đầu. Cam kết kích hoạt siêu tốc 24/7 và bảo hành 1 đổi 1.
            </p>

            <div className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300 font-medium">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span>Thời gian làm việc: 24/7 tất cả các ngày trong tuần</span>
            </div>
          </div>

          {/* Cột 3: Danh mục sản phẩm */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Sản Phẩm Hot
            </h4>
            <ul className="space-y-2">
              <li><a href="#products" className="hover:text-emerald-500 transition-colors">Anthropic Claude API</a></li>
              <li><a href="#products" className="hover:text-emerald-500 transition-colors">Google Gemini Pro 3 Tháng</a></li>
              <li><a href="#products" className="hover:text-emerald-500 transition-colors">Claude 100$ Token 30 Days</a></li>
              <li><a href="#products" className="hover:text-emerald-500 transition-colors">Muse AI 31 Tỷ Token</a></li>
              <li><a href="#products" className="hover:text-emerald-500 transition-colors">API Lập Trình Cursor / VS Code</a></li>
            </ul>
          </div>

          {/* Cột 4: Hỗ trợ & Chính sách */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Chính Sách & Hỗ Trợ
            </h4>
            <ul className="space-y-2">
              <li><a href="#trust" className="hover:text-emerald-500 transition-colors">Chính sách bảo hành 1 đổi 1</a></li>
              <li><a href="#faq" className="hover:text-emerald-500 transition-colors">Quy trình kích hoạt tài khoản</a></li>
              <li><a href="#faq" className="hover:text-emerald-500 transition-colors">Chính sách hoàn tiền</a></li>
              <li><a href="#faq" className="hover:text-emerald-500 transition-colors">Tài liệu cấu hình Cursor & VS Code</a></li>
              <li><a href="#faq" className="hover:text-emerald-500 transition-colors">Bảo mật thông tin khách hàng</a></li>
            </ul>
          </div>

          {/* Cột 5: Liên hệ CSKH */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Kênh Liên Hệ 24/7
            </h4>
            <div className="space-y-2.5">
              <a
                href="https://zalo.me"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:text-sky-500 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <span>Zalo CSKH: 0988.889.999</span>
              </a>

              <a
                href="https://t.me"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:text-sky-500 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </div>
                <span>Telegram: @tiemdigital_support</span>
              </a>

              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <span>Email: support@tiemdigital.vn</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <div>
            © {new Date().getFullYear()} <strong>Tiệm Digital</strong>. Toàn bộ quyền được bảo lưu.
          </div>
          <div className="flex items-center gap-1">
            <span>Dành cho cộng đồng lập trình & MMO Việt Nam</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
