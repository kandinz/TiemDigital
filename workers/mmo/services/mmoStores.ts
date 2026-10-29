import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../bindings.js";
import type { CategoryConfig } from "./productCatalog.js";
import type { BalanceResult } from "./adapters/types.js";

// Single place that defines the exchange rate used when no valid one is configured.
export const DEFAULT_USD_RATE = 25500;

export interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  auth_type: string;
  auth_key_name: string;
  api_key: string;
  is_active: number;
  sort_order: number;
  bot_url?: string | null;
  avatar_url?: string | null;
  badge_color?: string | null;
  balance_cache?: string | null;
  balance_cached_at?: string | null;
}

export interface OrderRow {
  id: string;
  provider_id: string;
  created_at: string;
  product_name?: string | null;
  provider_order_id?: string | null;
  customer_email?: string | null;
  status?: string | null;
  delivered_data?: string | null;
  delivered_items?: string | null;
  response_raw?: string | null;
  linked_transaction_id?: number | null;
  is_sold?: boolean;
  [column: string]: unknown;
}

export interface OrderListQuery {
  providerId?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface SessionConfig {
  provider: ProviderRow | null;
  usdRate: number;
  categories: CategoryConfig[];
}

export interface ProviderStore {
  listProviders(): Promise<ProviderRow[]>;
  getUsdRate(): Promise<number>;
  loadSessionConfig(providerId: string): Promise<SessionConfig>;
  saveBalance(providerId: string, balance: BalanceResult): Promise<void>;
}

export interface NewOrder {
  id: string;
  user_id: string;
  provider_id: string;
  provider_order_id: string | null;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  status: string;
  delivered_data: string | null;
  delivered_items: string;
  customer_email: string | null;
  response_raw: string;
}

export interface OrderStore {
  listOrders(query: OrderListQuery): Promise<{ rows: OrderRow[]; total: number }>;
  insertOrder(order: NewOrder): Promise<void>;
  findOrder(id: string): Promise<OrderRow | null>;
  hasProviderOrder(providerId: string, providerOrderId: string): Promise<boolean>;
  updateOrder(id: string, change: { status?: string; response_raw?: string }): Promise<void>;
}

export interface MmoStores {
  providers: ProviderStore;
  orders: OrderStore;
}

export function createD1Stores(env: Env): MmoStores {
  return { providers: createD1ProviderStore(env.DB), orders: createD1OrderStore(env.DB) };
}

function createD1ProviderStore(db: D1Database): ProviderStore {
  return {
    async listProviders() {
      const res = await db
        .prepare(
          "SELECT id, name, base_url, auth_type, auth_key_name, api_key, is_active, sort_order, bot_url, avatar_url, badge_color, balance_cache, balance_cached_at FROM mmo_providers ORDER BY sort_order ASC"
        )
        .all<ProviderRow>();
      return res.results || [];
    },
    async getUsdRate() {
      const row = await db.prepare("SELECT value FROM mmo_settings WHERE key = 'usd_rate'").first<{ value: string }>();
      return Number(row?.value) || DEFAULT_USD_RATE;
    },
    async loadSessionConfig(providerId) {
      const [providerRes, rateRes, categoryRes] = await db.batch([
        db
          .prepare(
            "SELECT id, name, base_url, auth_type, auth_key_name, api_key, is_active, sort_order, bot_url, avatar_url, balance_cache FROM mmo_providers WHERE id = ?"
          )
          .bind(providerId),
        db.prepare("SELECT value FROM mmo_settings WHERE key = 'usd_rate'"),
        db.prepare("SELECT name, keywords FROM mmo_categories ORDER BY sort_order"),
      ]);
      const rate = (rateRes.results as { value: string }[] | undefined)?.[0];
      const categories = (categoryRes.results || []) as { name: string; keywords: string | null }[];
      return {
        provider: ((providerRes.results || [])[0] as ProviderRow | undefined) ?? null,
        usdRate: Number(rate?.value) || DEFAULT_USD_RATE,
        categories: categories.map((row) => ({
          name: row.name,
          keywords: row.keywords ? row.keywords.split(",") : [],
        })),
      };
    },
    async saveBalance(providerId, balance) {
      await db
        .prepare("UPDATE mmo_providers SET balance_cache = ?, balance_cached_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(balance), providerId)
        .run();
    },
  };
}

function createD1OrderStore(db: D1Database): OrderStore {
  return {
    async listOrders({ providerId, search, page, limit }) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (providerId) {
        conditions.push("o.provider_id = ?");
        params.push(providerId);
      }
      if (search) {
        conditions.push("(o.product_name LIKE ? OR o.provider_order_id LIKE ? OR o.customer_email LIKE ? OR o.delivered_data LIKE ?)");
        const pattern = `%${search}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countRes = await db
        .prepare(`SELECT COUNT(*) as total FROM mmo_orders o ${whereClause}`)
        .bind(...params)
        .first<{ total: number }>();
      const rowsRes = await db
        .prepare(
          `SELECT o.*, t.id AS linked_transaction_id
           FROM mmo_orders o
           LEFT JOIN mmo_transactions t ON t.purchase_order_id = o.id AND t.is_deleted = 0
           ${whereClause}
           ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
        )
        .bind(...params, limit, (page - 1) * limit)
        .all<OrderRow>();

      return { rows: rowsRes.results || [], total: countRes?.total || 0 };
    },
    async insertOrder(o) {
      await db
        .prepare(
          `INSERT INTO mmo_orders (
            id, user_id, provider_id, provider_order_id, product_id, product_name, quantity,
            unit_price, total_price, currency, status, delivered_data, delivered_items, customer_email, response_raw, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(
          o.id, o.user_id, o.provider_id, o.provider_order_id, o.product_id, o.product_name, o.quantity,
          o.unit_price, o.total_price, o.currency, o.status, o.delivered_data, o.delivered_items, o.customer_email, o.response_raw
        )
        .run();
    },
    async findOrder(id) {
      return (
        (await db
          .prepare(
            `SELECT o.*, t.id AS linked_transaction_id
             FROM mmo_orders o
             LEFT JOIN mmo_transactions t ON t.purchase_order_id = o.id AND t.is_deleted = 0
             WHERE o.id = ?`
          )
          .bind(id)
          .first<OrderRow>()) ?? null
      );
    },
    async hasProviderOrder(providerId, providerOrderId) {
      const row = await db
        .prepare("SELECT id FROM mmo_orders WHERE provider_id = ? AND provider_order_id = ?")
        .bind(providerId, providerOrderId)
        .first();
      return row !== null;
    },
    async updateOrder(id, change) {
      const updates: string[] = ["updated_at = datetime('now')"];
      const params: any[] = [];
      if (change.status !== undefined) {
        updates.push("status = ?");
        params.push(change.status);
      }
      if (change.response_raw !== undefined) {
        updates.push("response_raw = ?");
        params.push(change.response_raw);
      }
      params.push(id);
      await db
        .prepare(`UPDATE mmo_orders SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...params)
        .run();
    },
  };
}
