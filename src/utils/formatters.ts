/**
 * Các hàm tiện ích định dạng tiền tệ, trích xuất thông số và nhãn thương hiệu
 */

/**
 * Định dạng số tiền sang chuẩn tiền tệ Việt Nam Đồng (VND)
 */
export function formatVND(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

/**
 * Tính toán giá gốc tham chiếu để hiển thị mức tiết kiệm cho khách hàng
 */
export function calculateAnchorPrice(sellingPrice: number): number {
  if (sellingPrice <= 0) return 0;
  // Làm tròn tới hàng ngàn
  const anchor = Math.round((sellingPrice * 1.45) / 1000) * 1000;
  return anchor;
}

/**
 * Trích xuất các thông số nổi bật (tokens, hạn dùng, bảo hành) từ tên và mô tả
 */
export function extractSpecs(name: string, description: string): {
  tokens?: string;
  duration?: string;
  warranty?: string;
  badge?: string;
} {
  const specs: {
    tokens?: string;
    duration?: string;
    warranty?: string;
    badge?: string;
  } = {};

  const fullText = `${name} ${description}`.toLowerCase();

  // Tokens
  const tokenMatch = name.match(/(\d+\s*(?:tỷ|m|k|tr|triệu|billion|million)?\s*tokens?)/i);
  if (tokenMatch) {
    specs.tokens = tokenMatch[1].toUpperCase();
  }

  // Duration
  const durationMatch = name.match(/(\d+\s*(?:day|days|ngày|tháng|months?|thg|m))/i);
  if (durationMatch) {
    specs.duration = durationMatch[1];
  }

  // Warranty
  if (fullText.includes('kbh') || fullText.includes('không bảo hành')) {
    specs.warranty = 'Không bảo hành (KBH)';
    specs.badge = 'Giá Siêu Rẻ';
  } else if (fullText.includes('full warranty') || fullText.includes('bảo hành') || fullText.includes('chính chủ')) {
    specs.warranty = 'Bảo hành 1 đổi 1';
    specs.badge = 'Bảo Hành 100%';
  } else {
    specs.warranty = 'Bảo hành kích hoạt';
    specs.badge = 'Bán Chạy';
  }

  return specs;
}

/**
 * Lấy thông tin màu sắc và style của từng thương hiệu sản phẩm
 */
export function getBrandTheme(category: string, name: string): {
  brandName: string;
  gradient: string;
  bgBadge: string;
  textBadge: string;
  borderColor: string;
  glowColor: string;
} {
  const text = `${category} ${name}`.toLowerCase();

  if (text.includes('claude') || text.includes('anthropic')) {
    return {
      brandName: 'Anthropic Claude',
      gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
      bgBadge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      textBadge: 'text-amber-500',
      borderColor: 'border-amber-500/30 hover:border-amber-500/60',
      glowColor: 'rgba(245, 158, 11, 0.15)',
    };
  }

  if (text.includes('gemini') || text.includes('google')) {
    return {
      brandName: 'Google Gemini',
      gradient: 'from-sky-500/20 via-blue-500/10 to-transparent',
      bgBadge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
      textBadge: 'text-sky-500',
      borderColor: 'border-sky-500/30 hover:border-sky-500/60',
      glowColor: 'rgba(14, 165, 233, 0.15)',
    };
  }

  if (text.includes('muse') || text.includes('midjourney')) {
    return {
      brandName: 'Muse AI',
      gradient: 'from-purple-500/20 via-pink-500/10 to-transparent',
      bgBadge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      textBadge: 'text-purple-500',
      borderColor: 'border-purple-500/30 hover:border-purple-500/60',
      glowColor: 'rgba(168, 85, 247, 0.15)',
    };
  }

  if (text.includes('chatgpt') || text.includes('openai') || text.includes('gpt')) {
    return {
      brandName: 'OpenAI GPT',
      gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
      bgBadge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      textBadge: 'text-emerald-500',
      borderColor: 'border-emerald-500/30 hover:border-emerald-500/60',
      glowColor: 'rgba(16, 185, 129, 0.15)',
    };
  }

  return {
    brandName: category || 'Digital Tool',
    gradient: 'from-emerald-500/20 via-cyan-500/10 to-transparent',
    bgBadge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    textBadge: 'text-emerald-500',
    borderColor: 'border-slate-700/50 hover:border-emerald-500/50',
    glowColor: 'rgba(16, 185, 129, 0.12)',
  };
}

/**
 * Trích xuất URL từ chuỗi văn bản mô tả sản phẩm
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s\)\],]+)/g;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Định dạng ngày giờ thân thiện
 */
export function formatFriendlyDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Vừa cập nhật';
  }
}
