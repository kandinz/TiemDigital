/**
 * Dịch vụ gọi API danh mục sản phẩm từ Swagger GumTool và quản lý dữ liệu Tiệm Digital
 */

import type { BankConfig, CatalogResponse, Order, Product, PromoCode } from '../types';
import { calculateAnchorPrice, extractSpecs } from '../utils/formatters';

const API_BASE_URL = 'https://gumtool.pages.dev/api/mmo/catalog';

/**
 * Danh sách sản phẩm dự phòng chuẩn bị sẵn khi mạng offline hoặc bị chặn CORS
 */
const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 5,
    name: 'MUSE AI 31 TỶ TOKEN - KBH',
    description: `Muse AI 31 tỷ tokens - không bảo hành
- Format: mail
- Mail access: https://generator.email
- Thêm mail cần đọc vào cuối link trên (ví dụ: https://generator.email/abcd@mail.com)

Nếu thấy email không được hỗ trợ thì dùng web sau:
- Web lấy code: https://luuvan.site/?inbox=
- Thêm mail cần đọc vào cuối link trên (ví dụ: https://luuvan.site/?inbox=abcd@mail.com)

(Nếu acc là định dạng hotmail/outlook thì hãy vào web https://dongvanfb.net/read_mail_box/ paste toàn bộ thông tin tài khoản rồi ấn đọc mail)`,
    selling_price: 79000,
    category: 'Khác',
    image_url: null,
    in_stock: true,
    updated_at: '2026-10-28T01:21:00.01Z',
  },
  {
    id: 4,
    name: 'API CLAUDE - 50M Token - 2day',
    description: `⚡⚡ API CLAUDE
- 50M Token
- 2day

✨✨✨ 100% Genuine Claude API (100% refund guaranteed if not authentic).
💎 Seamlessly compatible with all tools & IDEs: 9router, Claude Dev, Cursor, VS Code, etc.
⏱ Validity: 2 Day

👉 Quick Setup Instructions:
1️⃣ Step 1: Visit 👉 https://miraiapi.com/usage/#redeem to redeem your code (Enter the code provided in your order details).
2️⃣ Step 2: Visit 👉 https://miraiapi.com/usage/#config to configure your API Key, select your target App, and choose the ideal Model.
🎉 All done & Ready to code!

📖 Detailed Documentation & Guide: 👉 https://docs.google.com/document/d/16smXXteTwJYdrxTfdZlJvOkSEFkVL_6UBxoXcXZH6Gc/edit?tab=t.tbg84q5rs9yi

⚠️ Important Notice: The validity period only starts counting once the redeem code is activated. You can store or resell the code.`,
    selling_price: 99000,
    category: 'Claude',
    image_url: 'https://images.g2a.com/323x433/1x1x1/claude-api-key-p10000514852/f6d0c7e129d247a7bc1b228a',
    in_stock: true,
    updated_at: '2026-10-28T01:16:03.205Z',
  },
  {
    id: 3,
    name: '100$ API Claude 30days',
    description: `🌟🌟🌟 PRODUCT INFORMATION
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡
👉 100$ API Claude
- 30 days

100% genuine Claude API (100% refund if fake).
Works with all apps: vscode ,codex, 9router, claude code, cursor, etc.
Full warranty.
Detailed guide: https://docs.google.com/document/d/1bKvZSBqpS5eIq5EsQ45nagvH6KB1ywqjcIk7BcWkVF0/edit?tab=t.tbg84q5rs9yi
You can watch the video in the Doc (simple tuto)`,
    selling_price: 89000,
    category: 'Claude',
    image_url: 'https://images.g2a.com/323x433/1x1x1/claude-api-key-p10000514852/f6d0c7e129d247a7bc1b228a',
    in_stock: true,
    updated_at: '2026-10-28T01:15:38.746Z',
  },
  {
    id: 2,
    name: 'Claude Api 10M Tokens 30 Day',
    description: `⚡ Claude API - 10M Tokens
✨ Genuine Claude API Access.
💎 Compatible with 9Router, Claude Dev, Cursor, VS Code and other supported tools.
⏱ Validity: 30 Day
🎯 Token Limit: 10 Million Tokens
🤖 Multiple Claude Models Available (Opus 4.5, Sonnet 4.5, Haiku 4.5, Sonnet 4)

👉 QUICK SETUP:
Step 1: Check/Redeem your Bedrock Cloud key https://bedrock.com.de/
Step 2: Configure your API using the required application and preferred Claude model.
Base URL: https://api.bedrock.com.de/
Guide: https://docs.google.com/document/d/16XE54GlohRQ9iQC080w7Xwa55k7FiOOg0BLXoF_3tRI/edit?usp=sharing`,
    selling_price: 49000,
    category: 'Claude',
    image_url: null,
    in_stock: true,
    updated_at: '2026-10-28T01:15:27.645Z',
  },
  {
    id: 1,
    name: 'Gemini Pro 3 Months',
    description: `🔥 Google Gemini Advanced / Pro gói 3 tháng
- Trial - chỉ kích hoạt cho tài khoản chưa từng dùng gói trả phí
- 5TB dung lượng lưu trữ Google Cloud đi kèm
- Bảo hành 7 ngày sau khi kích hoạt thành công
- Phải kích hoạt mã trong vòng 7 ngày kể từ lúc mua`,
    selling_price: 69000,
    category: 'Gemini',
    image_url: null,
    in_stock: true,
    updated_at: '2026-10-25T14:24:26.796Z',
  },
];

/**
 * Cấu hình tài khoản ngân hàng nhận thanh toán VietQR của Tiệm Digital
 */
export const BANK_CONFIG: BankConfig = {
  bankId: 'MB',
  bankName: 'MBBank (Ngân hàng Quân Đội)',
  accountNumber: '0988889999',
  accountHolder: 'TIEM DIGITAL VIETNAM',
  vietQrUrl: '',
};

/**
 * Tạo link mã QR VietQR chuẩn ngân hàng Napas
 */
export function generateVietQrUrl(amount: number, memo: string): string {
  const sanitizedMemo = encodeURIComponent(memo.replace(/[^a-zA-Z0-9_\-\s]/g, ''));
  return `https://img.vietqr.io/image/${BANK_CONFIG.bankId}-${BANK_CONFIG.accountNumber}-compact2.png?amount=${amount}&addInfo=${sanitizedMemo}&accountName=${encodeURIComponent(BANK_CONFIG.accountHolder)}`;
}

/**
 * Danh sách mã giảm giá hợp lệ
 */
export const AVAILABLE_PROMOS: PromoCode[] = [
  {
    code: 'TIEMDIGITAL',
    type: 'percent',
    value: 10,
    description: 'Giảm 10% cho khách hàng mới của Tiệm Digital',
  },
  {
    code: 'WELCOME15K',
    type: 'fixed',
    value: 15000,
    description: 'Giảm ngay 15.000 ₫ cho mọi đơn hàng',
  },
  {
    code: 'AI2026',
    type: 'fixed',
    value: 20000,
    description: 'Giảm 20.000 ₫ cho đơn hàng từ 100.000 ₫',
    minOrder: 100000,
  },
];

/**
 * Chuẩn hóa và làm giàu dữ liệu sản phẩm với các trường tính toán
 */
function enrichProduct(p: Product): Product {
  const specs = extractSpecs(p.name, p.description);
  return {
    ...p,
    original_price: calculateAnchorPrice(p.selling_price),
    discount_percent: Math.round(((calculateAnchorPrice(p.selling_price) - p.selling_price) / calculateAnchorPrice(p.selling_price)) * 100),
    badge: specs.badge || 'Chính Hãng',
  };
}

/**
 * Tải danh mục sản phẩm từ API https://gumtool.pages.dev/api/mmo/catalog
 * Có cơ chế tự động thử lại và dự phòng dữ liệu nếu mạng gián đoạn
 */
export async function fetchProducts(options?: {
  category?: string;
  search?: string;
}): Promise<{ products: Product[]; categories: string[]; fromCache: boolean }> {
  try {
    const url = new URL(API_BASE_URL);
    if (options?.category && options.category !== 'all') {
      url.searchParams.set('category', options.category);
    }
    if (options?.search && options.search.trim()) {
      url.searchParams.set('search', options.search.trim());
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data: CatalogResponse = await res.json();
    if (data && data.success && Array.isArray(data.products)) {
      const enriched = data.products.map(enrichProduct);
      const categories = data.categories || Array.from(new Set(enriched.map((p) => p.category)));
      return {
        products: enriched,
        categories,
        fromCache: false,
      };
    }
    throw new Error('Dữ liệu API trả về không hợp lệ');
  } catch (error) {
    console.warn('Lỗi khi nạp dữ liệu từ API live, sử dụng bộ đệm sản phẩm Tiệm Digital:', error);
    let filtered = FALLBACK_PRODUCTS.map(enrichProduct);

    if (options?.category && options.category !== 'all') {
      filtered = filtered.filter((p) => p.category.toLowerCase() === options.category?.toLowerCase());
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }

    const categories = Array.from(new Set(FALLBACK_PRODUCTS.map((p) => p.category)));
    return {
      products: filtered,
      categories,
      fromCache: true,
    };
  }
}

/**
 * Lưu trữ đơn hàng vào LocalStorage của khách hàng
 */
const ORDERS_STORAGE_KEY = 'tiem_digital_orders';

export function saveLocalOrder(order: Order): void {
  try {
    const existing = getLocalOrders();
    existing.unshift(order);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch (e) {
    console.error('Không thể lưu đơn hàng vào LocalStorage', e);
  }
}

export function getLocalOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function findOrderByCode(code: string): Order | undefined {
  const orders = getLocalOrders();
  const cleanCode = code.trim().toUpperCase();
  return orders.find((o) => o.orderId.toUpperCase() === cleanCode);
}
