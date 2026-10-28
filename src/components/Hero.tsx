/**
 * Hero Banner của Tiệm Digital - Giới thiệu thương hiệu, thông số nổi bật & tìm kiếm nhanh
 */

import React from 'react';
import { Zap, ShieldCheck, Clock, Sparkles, Flame, CheckCircle2, ArrowRight } from 'lucide-react';

interface HeroProps {
  onExploreClick: () => void;
  onTagClick: (tag: string) => void;
  totalProducts: number;
  isLiveApi: boolean;
  content?: { title: string; description: string } | null;
}

export const Hero: React.FC<HeroProps> = ({
  onExploreClick,
  onTagClick,
  totalProducts,
  isLiveApi,
  content,
}) => {
  const quickTags = ['Claude 50M', 'Gemini Pro', 'Claude 100$', 'Muse AI 31 Tỷ', 'Bảo Hành 1-1'];

  return (
    <section id="hero" className="relative overflow-hidden pt-6 pb-12 sm:pt-10 sm:pb-16 lg:pb-20">
      
      {/* Background Glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-emerald-500/15 dark:bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-1/4 w-[300px] h-[250px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-[280px] h-[240px] bg-amber-500/10 blur-[90px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Live Status Pill */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs font-semibold shadow-xs">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-700 dark:text-slate-300">
              {isLiveApi ? 'Danh mục được cập nhật từ cửa hàng' : 'Sẵn sàng phục vụ 24/7'}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              {totalProducts} Sản phẩm sẵn hàng
            </span>
          </div>
        </div>

        {/* Main Headings */}
        <div className="text-center max-w-4xl mx-auto space-y-4 sm:space-y-6">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15] font-['Plus_Jakarta_Sans']">
            {content ? content.title : <>Hệ Thống Phân Phối{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500">
              Tài Khoản AI & API Token
            </span>{' '}
            Chính Hãng</>}
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {content ? content.description : <><strong className="text-slate-900 dark:text-white font-semibold">Tiệm Digital</strong> cung cấp tài khoản
            Anthropic Claude, Google Gemini, OpenAI và token lập trình cho Cursor, VS Code, 9Router. 
            Theo dõi thanh toán và nhận sản phẩm trong tài khoản của bạn.</>}
          </p>

          {/* Quick Suggestion Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Gợi ý hot:
            </span>
            {quickTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick(tag)}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-emerald-500/10 dark:bg-slate-900 hover:dark:bg-emerald-500/20 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-800 transition-all font-medium"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <button
              onClick={onExploreClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm sm:text-base shadow-xl shadow-emerald-500/25 active:scale-95 transition-all group"
            >
              <Zap className="w-5 h-5 fill-white text-white group-hover:scale-110 transition-transform" />
              <span>Xem Bảng Giá & Mua Ngay</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <a
              href="https://zalo.me"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-bold text-sm sm:text-base transition-all"
            >
              <span>Tư Vấn Chọn Gói (Zalo)</span>
            </a>
          </div>

        </div>

        {/* Stats Strip */}
        <div className="mt-12 sm:mt-16 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
          
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-mono">5.200+</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Khách hàng tin cậy</div>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-mono">&lt; 30 Giây</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kích hoạt siêu tốc</div>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-mono">100%</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bảo hành 1 đổi 1</div>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white font-mono">24 / 7</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Hỗ trợ kỹ thuật</div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
