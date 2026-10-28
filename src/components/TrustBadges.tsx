/**
 * Khối cam kết dịch vụ và uy tín thương hiệu của Tiệm Digital
 */

import React from 'react';
import { ShieldCheck, Zap, Headphones, Cpu, Award } from 'lucide-react';

export const TrustBadges: React.FC = () => {
  const pillars = [
    {
      icon: Zap,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      title: 'Kích Hoạt Tự Động 24/7',
      desc: 'Hệ thống gửi mã kích hoạt, redeem code & thông tin đăng nhập tự động qua Email chỉ sau 15 - 30 giây kể từ khi thanh toán thành công.',
    },
    {
      icon: ShieldCheck,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      title: 'Bảo Hành 1 Đổi 1 Trọn Gói',
      desc: 'Cam kết 100% tài khoản chuẩn chính hãng. Nếu xảy ra lỗi do hệ thống, Tiệm Digital đổi mã mới hoặc hoàn tiền ngay trong ngày.',
    },
    {
      icon: Cpu,
      color: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
      title: 'Tương Thích Mọi IDE & Tool',
      desc: 'Dễ dàng tích hợp token vào Cursor, VS Code, Claude Dev, 9Router, MiraiAPI, Bedrock Cloud... Có tài liệu hướng dẫn chi tiết từng bước.',
    },
    {
      icon: Headphones,
      color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
      title: 'Hỗ Trợ Kỹ Thuật Tận Tình',
      desc: 'Đội ngũ kỹ thuật viên am hiểu MMO và lập trình AI luôn túc trực qua Zalo & Telegram để giải đáp và hỗ trợ cấu hình từ xa (Ultraview/Anydesk).',
    },
  ];

  return (
    <section id="trust" className="py-12 sm:py-16 bg-slate-50 dark:bg-slate-900/40 border-y border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-500/20">
            <Award className="w-3.5 h-3.5" /> Cam Kết Chất Lượng
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight font-['Plus_Jakarta_Sans']">
            Tại Sao Nên Chọn <span className="text-emerald-500">Tiệm Digital</span>?
          </h2>
          <p className="mt-2.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Chính sách minh bạch, bảo vệ quyền lợi tối đa cho anh em lập trình viên, content creator và dân MMO.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {pillars.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div
                key={idx}
                className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border mb-4 ${p.color} group-hover:scale-105 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                  {p.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
