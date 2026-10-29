import { Hono } from "hono";
import { Env, Variables } from "../bindings.js";
import { requireAdmin } from "../_middleware/auth.js";
import type { UnifiedProduct } from "../services/adapters/types.js";
import type { BalanceResult } from "../services/adapters/types.js";

import { openSession, SessionError, type ProviderSession } from "../services/providerSession.js";
import { placeOrder, listOrders, syncProvider, syncAllProviders, refreshStatus, toOrderDetailView } from "../services/orderLedger.js";
import { normalizeStatus } from "../services/orderNormalization.js";
import { createD1Stores, type MmoStores } from "../services/mmoStores.js";
import mmoTransactions from "./mmoTransactions.js";

type MmoVariables = Variables & { mmoStores: MmoStores };

const app = new Hono<{ Bindings: Env; Variables: MmoVariables }>();

// Mount subrouter quản lý giao dịch, bán hàng, chi phí và bảo hành
app.route("/", mmoTransactions);


// GET /api/mmo/providers
app.get("/providers", async (c) => {
  const user = c.get("user");
  const isAdmin = user?.role === "admin";
  
  const rows = await c.get("mmoStores").providers.listProviders();

  const providers = rows.map((p: any) => {
    let maskedKey = null;
    if (p.api_key) {
      if (isAdmin) {
        maskedKey = p.api_key.length > 4 ? `...${p.api_key.slice(-4)}` : "***";
      } else {
        maskedKey = "***";
      }
    }
    
    let balance = null;
    let currency = null;
    if (p.balance_cache) {
      try {
        const cache = JSON.parse(p.balance_cache);
        balance = cache.balance;
        currency = cache.currency;
      } catch {
        // ignore
      }
    }

    return {
      id: p.id,
      name: p.name,
      base_url: p.base_url,
      is_active: Boolean(p.is_active),
      sort_order: p.sort_order,
      bot_url: p.bot_url || null,
      avatar_url: p.avatar_url || null,
      badge_color: p.badge_color || null,
      api_key_masked: maskedKey,
      balance,
      balance_currency: currency,
      balance_cached_at: p.balance_cached_at
    };
  });

  return c.json({ success: true, providers, usd_rate: await c.get("mmoStores").providers.getUsdRate() });
});

function parseTelegramUsername(botUrl?: string | null): string | null {
  if (!botUrl) return null;
  let u = botUrl.trim();
  if (u.startsWith('https://t.me/')) u = u.replace('https://t.me/', '');
  else if (u.startsWith('http://t.me/')) u = u.replace('http://t.me/', '');
  else if (u.startsWith('t.me/')) u = u.replace('t.me/', '');
  else if (u.startsWith('@')) u = u.slice(1);
  u = u.split('/')[0].split('?')[0].trim();
  return u || null;
}

async function extractTelegramInfo(botUrl?: string | null): Promise<{ name?: string; avatar_url?: string } | null> {
  const username = parseTelegramUsername(botUrl);
  if (!username) return null;
  try {
    const res = await fetch(`https://t.me/${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    let name: string | undefined;
    let avatar_url: string | undefined;

    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                       html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i);
    if (titleMatch && titleMatch[1]) {
      const rawTitle = titleMatch[1].trim();
      if (!rawTitle.startsWith('Telegram: Contact @') && rawTitle !== 'Telegram') {
        name = rawTitle;
      }
    }

    const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
                     html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i);
    if (imgMatch && imgMatch[1]) {
      const rawImg = imgMatch[1].trim();
      if (!rawImg.includes('t_logo_2x.png') && !rawImg.endsWith('/t_logo.png')) {
        avatar_url = rawImg;
      }
    }

    return { name, avatar_url };
  } catch (error) {
    console.error(`Failed to extract telegram info for @${username}`, error);
    return null;
  }
}

// POST /api/mmo/providers/sync-telegram
app.post("/providers/sync-telegram", requireAdmin, async (c) => {
  const providersRes = await c.env.DB.prepare(
    "SELECT id, name, bot_url, avatar_url FROM mmo_providers WHERE bot_url IS NOT NULL AND TRIM(bot_url) != ''"
  ).all();

  const providers = providersRes.results || [];
  let updatedCount = 0;
  const syncResults = [];

  for (const prov of providers as any[]) {
    const info = await extractTelegramInfo(prov.bot_url);
    if (info && (info.name || info.avatar_url)) {
      const newName = info.name || prov.name;
      const newAvatar = info.avatar_url || prov.avatar_url;

      await c.env.DB.prepare(
        "UPDATE mmo_providers SET name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(newName, newAvatar, prov.id).run();

      updatedCount++;
      syncResults.push({ id: prov.id, name: newName, avatar_url: newAvatar, status: 'updated' });
    } else {
      syncResults.push({ id: prov.id, name: prov.name, status: 'skipped' });
    }
  }

  return c.json({
    success: true,
    total: providers.length,
    updated: updatedCount,
    results: syncResults
  });
});

// POST /api/mmo/providers/extract-telegram
app.post("/providers/extract-telegram", requireAdmin, async (c) => {
  const body = await c.req.json();
  const info = await extractTelegramInfo(body.bot_url);
  return c.json({ success: true, data: info });
});

// PUT /api/mmo/providers/:id
app.put("/providers/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  
  const updates = [];
  const params = [];
  
  const allowedFields = ["name", "base_url", "auth_type", "auth_key_name", "api_key", "is_active", "sort_order", "bot_url", "avatar_url", "badge_color"];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }
  
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    
    await c.env.DB.prepare(`UPDATE mmo_providers SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();
  }
  
  return c.json({ success: true, message: "Provider updated" });
});

// POST /api/mmo/providers
app.post("/providers", requireAdmin, async (c) => {
  const body = await c.req.json();
  if (!body.id || !body.name || !body.base_url) {
    return c.json({ success: false, message: "Missing required fields (id, name, base_url)" }, 400);
  }
  
  try {
    await c.env.DB.prepare(
      `INSERT INTO mmo_providers (id, name, base_url, auth_type, auth_key_name, api_key, is_active, sort_order, bot_url, avatar_url, badge_color, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      body.id,
      body.name,
      body.base_url,
      body.auth_type || "header",
      body.auth_key_name || "Authorization",
      body.api_key || "",
      body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1,
      body.sort_order || 99,
      body.bot_url || null,
      body.avatar_url || null,
      body.badge_color || null
    ).run();
    return c.json({ success: true, message: "Provider created" });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// DELETE /api/mmo/providers/:id
app.delete("/providers/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  try {
    await c.env.DB.prepare("DELETE FROM mmo_providers WHERE id = ?").bind(id).run();
    return c.json({ success: true, message: "Provider deleted" });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// POST /api/mmo/providers/:id/sync-balance
app.post("/providers/:id/sync-balance", requireAdmin, async (c) => {
  let session: ProviderSession;
  try {
    session = await openSession(c.get("mmoStores").providers, c.req.param("id") as string);
  } catch (err) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    throw err;
  }

  try {
    const { balance, currency } = await session.fetchBalance();
    return c.json({ success: true, balance, currency });
  } catch (err: any) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    return c.json({ success: false, message: `Sync failed: ${err.message}` }, 500);
  }
});

// GET /api/mmo/settings
app.get("/settings", requireAdmin, async (c) => {
  const settingRes = await c.env.DB.prepare("SELECT * FROM mmo_settings").all();
  const settings: Record<string, any> = {};
  if (settingRes.results) {
    settingRes.results.forEach((r: any) => {
      settings[r.key] = r.value;
    });
  }
  
  const catRes = await c.env.DB.prepare("SELECT * FROM mmo_categories ORDER BY sort_order").all();
  const categories = (catRes.results || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    keywords: row.keywords ? row.keywords.split(',') : []
  }));
  
  settings.categories = categories;

  return c.json({ success: true, settings });
});

app.put("/settings", requireAdmin, async (c) => {
  const body = await c.req.json();
  const stmts = [];
  
  if (body.usd_rate !== undefined) {
    stmts.push(c.env.DB.prepare("INSERT INTO mmo_settings (key, value) VALUES ('usd_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(String(body.usd_rate)));
  }
  
  if (body.categories !== undefined) {
    stmts.push(c.env.DB.prepare("DELETE FROM mmo_categories"));
    body.categories.forEach((cat: any, index: number) => {
      const kw = Array.isArray(cat.keywords) ? cat.keywords.join(',') : '';
      stmts.push(c.env.DB.prepare("INSERT INTO mmo_categories (name, keywords, sort_order) VALUES (?, ?, ?)").bind(cat.name, kw, index + 1));
    });
  }
  
  if (stmts.length > 0) {
    await c.env.DB.batch(stmts);
  }
  
  return c.json({ success: true, message: "Settings updated" });
});

// GET /api/mmo/products
app.get("/products", async (c) => {
  const url = new URL(c.req.url);
  const providerId = url.searchParams.get("provider_id");
  if (!providerId) {
    return c.json({ success: false, message: "provider_id is required" }, 400);
  }

  let session: ProviderSession;
  try {
    session = await openSession(c.get("mmoStores").providers, providerId);
  } catch (err) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    throw err;
  }

  const { provider, usdRate, categories } = session;
  const products: UnifiedProduct[] = [];
  const providerErrors: any[] = [];
  let liveBalance: BalanceResult | undefined;

  if (session.hasKey) {
    // Số dư ví được cập nhật cache ngầm; lỗi số dư không chặn việc tải sản phẩm
    try {
      liveBalance = await session.fetchBalance();
    } catch {
      // Bỏ qua lỗi số dư khi tải danh mục sản phẩm
    }

    try {
      products.push(...(await session.fetchProducts()));
    } catch (err: any) {
      providerErrors.push({
        provider_id: provider.id,
        error: true,
        message: err.message
      });
    }
  }

  let cached: Partial<BalanceResult> = {};
  if (!liveBalance && provider.balance_cache) {
    try {
      cached = JSON.parse(provider.balance_cache);
    } catch {}
  }
  const bal = liveBalance ?? cached;
  const provider_balances = [{
    provider_id: provider.id,
    name: provider.name,
    bot_url: provider.bot_url || null,
    avatar_url: provider.avatar_url || null,
    balance: bal.balance !== undefined ? bal.balance : 0,
    currency: bal.currency || 'USD',
    balance_original: bal.balance_original,
    currency_original: bal.currency_original
  }];

  return c.json({
    success: true,
    products,
    provider_balances,
    provider_errors: providerErrors,
    usd_rate: usdRate,
    fetched_at: new Date().toISOString(),
    categories: categories.map((cat) => cat.name)
  });
});

// POST /api/mmo/order
app.post("/order", async (c) => {
  const body = await c.req.json();
  const { provider_id, product_id, email } = body;

  if (!provider_id || !product_id) {
    return c.json({ success: false, message: "Missing provider_id or product_id" }, 400);
  }

  const stores = c.get("mmoStores");
  try {
    const session = await openSession(stores.providers, provider_id);
    const user = c.get("user");
    const outcome = await placeOrder(session, stores.orders, user?.id || user?.username || "admin", {
      provider_id,
      product_id,
      email,
      product_name: body.product_name,
      quantity: body.quantity,
      unit_price: body.unit_price,
      total_price: body.total_price
    });

    if (!outcome.ok) {
      return c.json({ success: false, message: outcome.message, details: outcome.details }, outcome.statusCode as any);
    }

    return c.json({
      success: true,
      provider_id,
      order: outcome.order,
      order_id: outcome.order_id,
      status: outcome.status,
      delivered_items: outcome.delivered_items,
      persisted: outcome.persisted
    });
  } catch (err: any) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// GET /api/mmo/orders
app.get("/orders", async (c) => {
  const url = new URL(c.req.url);
  const providerId = url.searchParams.get("provider_id");
  const search = url.searchParams.get("search");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get("limit") || "50", 10)));

  const { orders, total } = await listOrders(c.get("mmoStores").orders, {
    providerId: providerId && providerId !== "Tất cả" ? providerId : undefined,
    search: search?.trim() || undefined,
    page,
    limit
  });

  return c.json({ success: true, orders, total, page, limit });
});

// GET /api/mmo/orders/:id
app.get("/orders/:id", async (c) => {
  const id = c.req.param("id");
  const order = await c.get("mmoStores").orders.findOrder(id);
  if (!order) {
    return c.json({ success: false, message: "Order not found" }, 404);
  }
  return c.json({ success: true, order: toOrderDetailView(order) });
});

// POST /api/mmo/orders/sync-all (Đồng bộ đơn hàng từ tất cả nhà cung cấp)
app.post("/orders/sync-all", async (c) => {
  try {
    const outcome = await syncAllProviders(c.get("mmoStores"));
    return c.json({
      success: true,
      message: `Đã đồng bộ ${outcome.total_synced} đơn hàng từ các nhà cung cấp`,
      total_synced: outcome.total_synced,
      results: outcome.results,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Lỗi đồng bộ: ${err.message}` }, 500);
  }
});

app.post("/orders/sync", async (c) => {
  try {
    const outcome = await syncAllProviders(c.get("mmoStores"));
    return c.json({
      success: true,
      message: `Đã đồng bộ ${outcome.total_synced} đơn hàng từ các nhà cung cấp`,
      total_synced: outcome.total_synced,
      results: outcome.results,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Lỗi đồng bộ: ${err.message}` }, 500);
  }
});

// POST /api/mmo/orders/sync-provider/:id
app.post("/orders/sync-provider/:id", async (c) => {
  let session: ProviderSession;
  try {
    session = await openSession(c.get("mmoStores").providers, c.req.param("id") as string);
  } catch (err) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    throw err;
  }

  try {
    const syncedCount = await syncProvider(session, c.get("mmoStores").orders);
    return c.json({ success: true, message: `Synced ${syncedCount} orders from ${session.provider.name}`, synced_count: syncedCount });
  } catch (err: any) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    return c.json({ success: false, message: `Sync failed: ${err.message}` }, 500);
  }
});

/**
 * Tra cứu và cập nhật trạng thái đơn hàng ngầm (invite) từ nhà cung cấp
 */
app.post("/orders/:id/check-status", async (c) => {
  try {
    const outcome = await refreshStatus(c.get("mmoStores"), c.req.param("id") as string);
    if (!outcome.ok) return c.json({ success: false, message: outcome.message }, outcome.statusCode);
    const { ok: _ok, ...payload } = outcome;
    return c.json({ success: true, ...payload });
  } catch (err: any) {
    if (err instanceof SessionError) return c.json({ success: false, message: err.message }, err.status);
    return c.json({ success: false, message: `Failed to check status: ${err.message}` }, 500);
  }
});

/**
 * Cập nhật thủ công trạng thái đơn hàng (ví dụ: chuyển thành Đã hoàn thành)
 */
app.patch("/orders/:id/status", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const rawStatus = body?.status;
  if (!rawStatus) {
    return c.json({ success: false, message: "Status is required" }, 400);
  }
  const status = normalizeStatus(rawStatus);
  const orderStore = c.get("mmoStores").orders;
  const order = await orderStore.findOrder(id);
  if (!order) {
    return c.json({ success: false, message: "Order not found" }, 404);
  }
  await orderStore.updateOrder(id, { status });
  return c.json({ success: true, message: "Order status updated", status });
});

// DELETE /api/mmo/orders/:id
app.delete("/orders/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  try {
    await c.env.DB.prepare("DELETE FROM mmo_orders WHERE id = ?").bind(id).run();
    return c.json({ success: true, message: "Order deleted" });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Stores are resolved per request so tests can inject in-memory adapters at the HTTP seam.
export function createMmoRoutes(resolveStores: (env: Env) => MmoStores = createD1Stores) {
  const root = new Hono<{ Bindings: Env; Variables: MmoVariables }>();
  root.use("*", async (c, next) => {
    c.set("mmoStores", resolveStores(c.env));
    await next();
  });
  root.route("/", app);
  return root;
}

export default createMmoRoutes();
