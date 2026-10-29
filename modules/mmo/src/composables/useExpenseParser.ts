import { AppConfig } from '@/config/app.config';

export interface ParsedExpense {
  label: string;
  amount: number;
  formattedAmount: string;
}

export function useExpenseParser() {
  const parseExpense = (text: string): ParsedExpense => {
    const regex = /(.*)\s(\d+(\.\d+)?)(.*)/;
    const match = text.trim().match(regex);

    if (!match) {
      throw new Error('Sai định dạng. Hãy nhập ví dụ: "Cơm trưa 35k" hoặc "Đổ xăng 2 lit"');
    }

    const [, label, priceText, , unitLabel] = match;
    const unitUpper = unitLabel.trim().toUpperCase();

    const multiplier = AppConfig.UNITS[unitUpper] || 1;
    const amount = Math.round(Number(priceText) * multiplier);

    if (!amount || isNaN(amount) || amount <= 0) {
      throw new Error('Số tiền không hợp lệ');
    }

    return {
      label: label.trim(),
      amount,
      formattedAmount: formatMoney(amount),
    };
  };

  const formatMoney = (amount: number): string => {
    return Number(amount).toLocaleString('vi-VN') + ' ₫';
  };

  return {
    parseExpense,
    formatMoney,
  };
}

