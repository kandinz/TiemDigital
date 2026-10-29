export interface Customer {
  id: string;
  email: string;
  name: string;
}
export interface PlatformOrder {
  id: string;
  user_id: string;
  channel: string;
  currency: "VND" | "XTR"; // Historical rows may retain XTR; no XTR checkout exists.
  total: number;
  items: { productId: number; name: string; price: number; quantity: number }[];
  customer: { fullName: string; email: string; phone: string; note?: string };
  payment_status: string;
  fulfillment_status: string;
  created_at: number;
}
export interface PaymentIntent {
  id: string;
  purpose: string;
  orderId: string | null;
  amount: number;
  status: string;
  expiresAt: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  memo: string;
  qrUrl: string;
}
export interface Journal {
  id: string;
  kind: string;
  amount: number;
  wallet_delta: number;
  memo: string;
  created_at: number;
}
export interface PageBlock {
  type: "text" | "link" | "image";
  heading?: string;
  text?: string;
  label?: string;
  url?: string;
  alt?: string;
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.body === undefined
        ? {}
        : { "Idempotency-Key": options.key ?? crypto.randomUUID() }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(
      value.error?.message ??
        value.error ??
        value.message ??
        `Yêu cầu thất bại (${response.status})`,
    ), { status: response.status });
  return value as T;
}
export const amountLabel = (amount: number, currency = "VND") =>
  currency === "XTR"
    ? `${amount.toLocaleString("vi-VN")} XTR (lịch sử)`
    : `${amount.toLocaleString("vi-VN")} ₫`;
export const timeLabel = (value: number) =>
  new Date(value * 1000).toLocaleString("vi-VN");
export const paymentLabel = (value: string) =>
  ({
    UNPAID: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    REFUNDED: "Đã hoàn số dư",
    PENDING: "Đang chờ",
    SUCCEEDED: "Thành công",
    EXPIRED: "Hết hạn",
  })[value] ?? value;
