/**
 * Đánh giá khách hàng thực tế về dịch vụ của Tiệm Digital
 */

import React from 'react';
import { Star } from 'lucide-react';

interface Review {
  name: string;
  role: string;
  avatar: string;
  content: string;
  productBought: string;
  rating: number;
}

export const ReviewsSection: React.FC = () => {
  const reviews: Review[] = [
    {
      name: 'Nguyễn Tuấn Anh',
      role: 'Senior Fullstack Dev @ FPT',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
      productBought: 'API CLAUDE - 50M Token - 2day',
      rating: 5,
      content:
        'Mình mua gói Claude 50M Token để cày sprint trong Cursor IDE. Kích hoạt cực nhanh qua MiraiAPI, tốc độ phản hồi sonnet siêu mượt, không hề bị rớt request. Rất đáng tiền!',
    },
    {
      name: 'Trần Minh Hoàng',
      role: 'MMO & Affiliate Marketer',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      productBought: 'MUSE AI 31 TỶ TOKEN',
      rating: 5,
      content:
        'Mua gói Muse AI 31 tỷ token làm content số lượng lớn, lúc đầu hơi bỡ ngỡ về cách đọc mail lấy code nhưng được admin Tiệm Digital support qua Zalo tận tình trong 2 phút là xong ngay.',
    },
    {
      name: 'Đặng Thanh Tâm',
      role: 'AI Prompt Engineer',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
      productBought: 'Gemini Pro 3 Months',
      rating: 5,
      content:
        'Gói Gemini Pro 3 tháng có 5TB dung lượng lưu trữ cực kỳ xịn sò. Mình dùng để train dữ liệu và lưu dataset thoải mái. Giá rẻ hơn nhiều so với mua trực tiếp.',
    },
  ];

  return (
    <section id="reviews" className="py-14 sm:py-20 bg-slate-50 dark:bg-slate-900/40 border-y border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-500/20">
            <Star className="w-3.5 h-3.5 fill-current" /> Đánh Giá Từ Khách Hàng
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight font-['Plus_Jakarta_Sans']">
            Hơn 5.000+ Khách Hàng Đã Tin Tưởng
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Phản hồi thực tế từ các anh em lập trình viên, content creator và đội ngũ MMO chuyên nghiệp.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {reviews.map((r, i) => (
            <div
              key={i}
              className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {/* Rating stars */}
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(r.rating)].map((_, idx) => (
                    <Star key={idx} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                {/* Content */}
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4 italic">
                  "{r.content}"
                </p>
              </div>

              {/* Author footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {r.role}
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                  Đã mua
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
