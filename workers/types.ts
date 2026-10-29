export interface Env {
  DB: D1Database;
  SITE_ASSETS: Fetcher;
  EVENTS?: Queue<{ id: string }>;
  MEDIA?: R2Bucket;
  EMAIL?: {
    send(message: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
  };
  APP_ORIGIN: string;
  ADMIN_ORIGIN: string;
  ENVIRONMENT: string;
  BETTER_AUTH_SECRET: string;
  EMAIL_FROM?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
  SEPAY_WEBHOOK_SECRET?: string;
  SEPAY_API_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  DELIVERY_KEY?: string;
}

export interface Actor {
  id: string;
  email: string;
  name: string;
}
export interface Admin {
  email: string;
  role: "owner" | "finance" | "support" | "editor" | "auditor";
}
export interface PaymentConfig {
  enabled: boolean;
  provider: "sepay";
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  minTopup: number;
  maxTopup: number;
  intentTtl: number;
}
export interface StoredOrder {
  id: string;
  user_id: string;
  channel: "web" | "telegram";
  currency: "VND" | "XTR"; // XTR is read-only legacy history; new orders must be VND.
  total: number;
  items: string;
  customer: string;
  payment_status: string;
  fulfillment_status: string;
  delivery: string | null;
  created_at: number;
}
export interface Intent {
  id: string;
  user_id: string;
  purpose: "ORDER" | "TOPUP";
  order_id: string | null;
  amount: number;
  account_number: string;
  config: string;
  status: string;
  created_at: number;
  expires_at: number;
}
