/**
 * Mục Hỏi & Đáp thường gặp (FAQ) của Tiệm Digital
 */

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: 'Sau khi chuyển khoản, tôi sẽ nhận tài khoản/token thế nào?',
      answer:
        'Sau khi hệ thống xác nhận tiền vào ngân hàng hoặc trừ số dư thành công, đơn được chuyển sang chờ giao. Bạn đăng nhập mục Tài khoản để theo dõi và nhận thông tin sản phẩm khi cửa hàng giao hoàn tất.',
    },
    {
      question: 'Token API Claude có dùng được cho Cursor, VS Code và Claude Dev không?',
      answer:
        'Hoàn toàn tương thích 100%! Các gói Token Claude API tại Tiệm Digital hỗ trợ kết nối mượt mà qua các adapter trung gian như MiraiAPI, Bedrock Cloud hoặc 9Router. Bạn chỉ cần dán Base URL và API Key vào phần cấu hình của Cursor, VS Code (Cline/Roo Code/Claude Dev) là có thể code ngay lập tức với các model đỉnh cao như Sonnet 3.5, Sonnet 4 hay Opus.',
    },
    {
      question: 'Chính sách bảo hành 1 đổi 1 của Tiệm Digital cam kết ra sao?',
      answer:
        'Tiệm Digital cam kết bảo hành 1 đổi 1 cho mọi sự cố xuất phát từ hệ thống hoặc lỗi tài khoản trong suốt thời gian gói dịch vụ có hiệu lực. Bạn chỉ cần gửi Mã đơn hàng và chụp ảnh thông báo lỗi qua Zalo hoặc Telegram CSKH, kỹ thuật viên sẽ cấp mã thay thế ngay trong 5 - 15 phút.',
    },
    {
      question: 'Gói Gemini Pro 3 tháng cần điều kiện gì để kích hoạt thành công?',
      answer:
        'Gói Google Gemini Advanced / Pro 3 tháng (kèm 5TB dung lượng Google One) là dạng mã khuyến mãi dành cho tài khoản Google chưa từng đăng ký gói trả phí trước đó. Khi redeem, Google sẽ yêu cầu thêm thẻ thanh toán quốc tế (Visa/Mastercard) để xác minh danh tính và bạn phải kích hoạt trong vòng 7 ngày kể từ lúc mua.',
    },
    {
      question: 'Tôi có thể mua sỉ số lượng lớn cho Agency hoặc MMO Team không?',
      answer:
        'Có! Tiệm Digital có chính sách chiết khấu sâu đặc biệt dành cho các team MMO, lập trình viên và Agency mua số lượng lớn hoặc có nhu cầu tích hợp API tự động. Vui lòng liên hệ trực tiếp với chúng tôi qua Zalo hoặc Telegram để nhận bảng giá sỉ tốt nhất.',
    },
  ];

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-14 sm:py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      
      <div className="text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-500/20">
          <HelpCircle className="w-3.5 h-3.5" /> Giải Đáp Thắc Mắc
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight font-['Plus_Jakarta_Sans']">
          Câu Hỏi Thường Gặp
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Mọi điều bạn cần biết trước khi mua tài khoản & token tại Tiệm Digital
        </p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden transition-all shadow-xs"
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full py-4 px-5 sm:px-6 flex items-center justify-between gap-4 text-left font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-emerald-500' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 sm:px-6 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/60 pt-3 animate-fadeIn">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
};
