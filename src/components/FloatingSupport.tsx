/**
 * Nút hỗ trợ trực tuyến nổi (Floating Support Button) góc dưới màn hình
 */

import React, { useState } from 'react';
import { MessageCircle, Phone, Send, X, Headphones } from 'lucide-react';

export const FloatingSupport: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      
      {/* Expanded contact options */}
      {isOpen && (
        <div className="mb-3 flex flex-col gap-2 animate-scaleUp">
          
          <a
            href="https://zalo.me"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:text-sky-500 hover:border-sky-500/50 transition-all"
          >
            <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center text-white">
              <MessageCircle className="w-4 h-4 fill-white" />
            </div>
            <span>Chat Zalo CSKH (24/7)</span>
          </a>

          <a
            href="https://t.me"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:text-sky-400 hover:border-sky-400/50 transition-all"
          >
            <div className="w-7 h-7 rounded-lg bg-[#229ED9] flex items-center justify-center text-white">
              <Send className="w-4 h-4" />
            </div>
            <span>Telegram Kỹ Thuật</span>
          </a>

          <a
            href="tel:0988889999"
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-bold text-slate-800 dark:text-slate-100 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
              <Phone className="w-4 h-4" />
            </div>
            <span>Hotline: 0988.889.999</span>
          </a>

        </div>
      )}

      {/* Main trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/30 flex items-center justify-center transition-transform active:scale-95 group"
        aria-label="Hỗ trợ trực tuyến"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <div className="relative flex items-center justify-center">
            <Headphones className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
          </div>
        )}
      </button>

    </div>
  );
};
