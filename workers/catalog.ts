import { z } from "zod";
import type { Admin, Env } from "./types";
import { requireRole } from "./auth";
import { audit, HttpError, id, json, readBody } from "./http";
import { encryptDelivery } from "./delivery";
import { createD1Stores } from "./mmo/services/mmoStores";
import { openSession } from "./mmo/services/providerSession";
import type { UnifiedProduct } from "./mmo/services/adapters/types";
import { deliveredItemsOfRow, normalizeStatus } from "./mmo/services/orderNormalization";

export interface CatalogProduct {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  selling_price: number;
  updated_at: string;
  in_stock: number;
  source: "stock" | "provider";
  provider_id: string | null;
  provider_product_id: string | null;
  cost_vnd: number;
  markup_percent: number | null;
  active: number;
  available: number;
}
const fields = `p.*,COALESCE(s.source,'stock') AS source,s.provider_id,s.provider_product_id,COALESCE(s.cost_vnd,0) AS cost_vnd,s.markup_percent,COALESCE(s.active,1) AS active,(SELECT COUNT(*) FROM product_inventory i WHERE i.product_id=p.id AND i.fulfillment_id IS NULL) AS available`;
export async function catalogProducts(env: Env, publicOnly = false) {
  const { results } = await env.DB.prepare(
    `SELECT ${fields} FROM products p LEFT JOIN product_sources s ON s.product_id=p.id ${publicOnly ? "WHERE COALESCE(s.active,1)=1" : ""} ORDER BY p.id DESC`,
  ).all<CatalogProduct>();
  return results.map((p) => ({
    ...p,
    in_stock: Boolean(
      p.in_stock && (!publicOnly || p.source === "provider" || p.available > 0),
    ),
  }));
}
export async function catalogConfig(env: Env) {
  const row = await env.DB.prepare(
    "SELECT markup_percent,telegram_chat_id FROM commerce_config WHERE id=1",
  ).first<{ markup_percent: number | null; telegram_chat_id: string }>();
  return {
    markupPercent: row?.markup_percent ?? null,
    telegramChatId: row?.telegram_chat_id ?? "",
  };
}

// A compare-and-swap updates the price and its baseline together, including on
// repeated/concurrent syncs. Local descriptions and manual merchandising survive.
export async function updateSupplierProduct(
  env: Env,
  providerId: string,
  item: UnifiedProduct,
  usdRate: number,
) {
  const cost = Math.ceil(item.price_usd * usdRate);
  if (!Number.isSafeInteger(cost) || cost <= 0)
    throw new HttpError(502, "Giá nhập NCC không hợp lệ");
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE products SET selling_price=CASE WHEN ?>s.cost_vnd AND s.cost_vnd>0 THEN CAST(CEIL(products.selling_price*1.0*?/s.cost_vnd) AS INTEGER) ELSE products.selling_price END,in_stock=?,updated_at=? FROM product_sources s WHERE products.id=s.product_id AND s.provider_id=? AND s.provider_product_id=?`,
    ).bind(
      cost,
      cost,
      Number(item.in_stock),
      new Date().toISOString(),
      providerId,
      item.provider_product_id,
    ),
    env.DB.prepare(
      "UPDATE product_sources SET cost_vnd=?,cost_usd=? WHERE provider_id=? AND provider_product_id=?",
    ).bind(cost, item.price_usd, providerId, item.provider_product_id),
  ]);
  return cost;
}
export async function syncCatalog(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT provider_id FROM product_sources WHERE source='provider' AND active=1",
  ).all<{ provider_id: string }>();
  const errors: { providerId: string; error: string }[] = [];
  let updated = 0;
  for (const { provider_id } of results) {
    try {
      const session = await openSession(
        createD1Stores(env).providers,
        provider_id,
      );
      if (!session.provider.is_active) continue;
      const products = await session.fetchProducts();
      for (const item of products) {
        await updateSupplierProduct(env, provider_id, item, session.usdRate);
        updated++;
      }
      const ids = products.map((p) => p.provider_product_id);
      // Missing products stop selling; the source link/history remains intact.
      const sources = await env.DB.prepare(
        "SELECT product_id,provider_product_id FROM product_sources WHERE provider_id=?",
      )
        .bind(provider_id)
        .all<{ product_id: number; provider_product_id: string }>();
      for (const source of sources.results)
        if (!ids.includes(source.provider_product_id))
          await env.DB.prepare("UPDATE products SET in_stock=0 WHERE id=?")
            .bind(source.product_id)
            .run();
    } catch {
      errors.push({
        providerId: provider_id,
        error: "Đồng bộ NCC thất bại; kiểm tra kết nối và API key.",
      });
    }
  }
  return { updated, errors };
}
const productInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(150),
  description: z.string().max(10000).default(""),
  category: z.string().trim().min(1).max(80).default("Khác"),
  image_url: z
    .union([z.literal(""), z.url().refine((v) => v.startsWith("https://"))])
    .nullish(),
  selling_price: z.number().int().positive().max(100000000).optional(),
  in_stock: z.boolean().default(true),
  active: z.boolean().default(true),
  source: z.enum(["stock", "provider"]).default("stock"),
  provider_id: z.string().min(1).max(100).optional(),
  provider_product_id: z.string().min(1).max(200).optional(),
  markup_percent: z.number().min(0).max(10000).nullable().optional(),
});
export async function catalogAdmin(
  request: Request,
  env: Env,
  admin: Admin,
  path: string,
): Promise<Response | null> {
  if (path === "/products" && request.method === "GET")
    return json({ products: await catalogProducts(env) });
  if (path === "/catalog-config") {
    requireRole(admin, ["owner"]);
    if (request.method === "GET") return json(await catalogConfig(env));
    if (request.method === "PUT") {
      const input = await readBody(
        request,
        z.object({
          markupPercent: z.number().min(0).max(10000).nullable(),
          telegramChatId: z.string().regex(/^$|^-?\d{1,25}$/),
        }),
      );
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE commerce_config SET markup_percent=?,telegram_chat_id=? WHERE id=1",
        ).bind(input.markupPercent, input.telegramChatId),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(
          id(),
          admin.email,
          "CATALOG_CONFIG",
          "commerce",
          JSON.stringify(input),
        ),
      ]);
      return json({ ok: true });
    }
  }
  if (path === "/products/sync" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const result = await syncCatalog(env);
    await audit(env, admin.email, "CATALOG_SYNC", "products");
    return json(result);
  }
  if (path === "/products" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const p = await readBody(request, productInput);
    let costVnd = 0,
      costUsd = 0;
    if (p.source === "provider") {
      if (!p.provider_id || !p.provider_product_id)
        throw new HttpError(400, "Chọn NCC và sản phẩm nguồn");
      const session = await openSession(
        createD1Stores(env).providers,
        p.provider_id,
      );
      const item = (await session.fetchProducts()).find(
        (v) => v.provider_product_id === p.provider_product_id,
      );
      if (!item) throw new HttpError(409, "Sản phẩm NCC không còn tồn tại");
      costUsd = item.price_usd;
      costVnd = Math.ceil(costUsd * session.usdRate);
      if (!Number.isSafeInteger(costVnd) || costVnd <= 0)
        throw new HttpError(502, "Giá nhập NCC không hợp lệ");
    }
    const config = await catalogConfig(env);
    const markup = p.markup_percent ?? config.markupPercent;
    const price =
      p.selling_price ??
      (p.source === "provider" && markup !== null
        ? Math.ceil(costVnd * (1 + markup / 100))
        : 0);
    if (!Number.isSafeInteger(price) || price <= 0 || price > 100000000)
      throw new HttpError(400, "Nhập giá bán hoặc cấu hình % lợi nhuận");
    const productId = p.id ?? null;
    const existingProduct =
      productId === null
        ? null
        : await env.DB.prepare("SELECT id FROM products WHERE id=?")
            .bind(productId)
            .first();
    const existing =
      productId === null
        ? null
        : await env.DB.prepare(
            "SELECT source,provider_id,provider_product_id FROM product_sources WHERE product_id=?",
          )
            .bind(productId)
            .first<{
              source: string;
              provider_id: string | null;
              provider_product_id: string | null;
            }>();
    if (
      existing &&
      (existing.source !== p.source ||
        existing.provider_id !== (p.provider_id ?? null) ||
        existing.provider_product_id !== (p.provider_product_id ?? null))
    )
      throw new HttpError(
        409,
        "Nguồn sản phẩm đã cố định; tạo sản phẩm mới để đổi nguồn",
      );
    // NULL INTEGER PRIMARY KEY asks SQLite to allocate the ID within this
    // transaction. New inserts never upsert over another concurrent creation.
    const saveProduct = existingProduct
      ? env.DB.prepare(
          "UPDATE products SET name=?,description=?,category=?,image_url=?,selling_price=?,in_stock=?,updated_at=? WHERE id=? RETURNING id",
        ).bind(
          p.name,
          p.description,
          p.category,
          p.image_url || null,
          price,
          Number(p.in_stock),
          new Date().toISOString(),
          productId,
        )
      : env.DB.prepare(
          "INSERT INTO products(id,name,description,category,image_url,selling_price,in_stock,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
        ).bind(
          productId,
          p.name,
          p.description,
          p.category,
          p.image_url || null,
          price,
          Number(p.in_stock),
          new Date().toISOString(),
        );
    const result = await env.DB.batch([
      saveProduct,
      env.DB.prepare(
        "INSERT INTO product_sources(product_id,source,provider_id,provider_product_id,cost_vnd,cost_usd,markup_percent,active) VALUES(COALESCE(?,last_insert_rowid()),?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET cost_vnd=excluded.cost_vnd,cost_usd=excluded.cost_usd,markup_percent=excluded.markup_percent,active=excluded.active",
      ).bind(
        productId,
        p.source,
        p.provider_id ?? null,
        p.provider_product_id ?? null,
        costVnd,
        costUsd,
        p.markup_percent ?? null,
        Number(p.active),
      ),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,CAST(COALESCE(?,last_insert_rowid()) AS TEXT),?)",
      ).bind(
        id(),
        admin.email,
        "PRODUCT_SAVE",
        productId,
        JSON.stringify({ priceVnd: price, source: p.source }),
      ),
    ]);
    return json({ ok: true, id: (result[0].results[0] as { id: number }).id });
  }
  const archive = path.match(/^\/products\/(\d+)$/);
  if (archive && request.method === "DELETE") {
    requireRole(admin, ["owner"]);
    const productId = Number(archive[1]);
    if (!await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first())
      throw new HttpError(404, "Không tìm thấy sản phẩm");
    await env.DB.prepare(
      "INSERT INTO product_sources(product_id,source,active) VALUES(?,'stock',0) ON CONFLICT(product_id) DO UPDATE SET active=0",
    ).bind(productId).run();
    await audit(env, admin.email, "PRODUCT_ARCHIVE", archive[1]);
    return json({ ok: true });
  }
  const supplierImport = path.match(/^\/supplier-purchases\/([a-zA-Z0-9_-]+)\/import$/);
  if (supplierImport && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const { productId } = await readBody(request, z.object({ productId: z.number().int().positive() }));
    const orderId = supplierImport[1];
    const order = await env.DB.prepare(
      "SELECT id,user_id,status,quantity,delivered_items FROM mmo_orders WHERE id=?",
    ).bind(orderId).first<{
      id: string; user_id: string | null; status: string; quantity: number; delivered_items: string | null;
    }>();
    if (!order || order.user_id !== (admin.userId ?? admin.email))
      throw new HttpError(404, "Không tìm thấy đơn mua riêng của quản trị viên");
    if (normalizeStatus(order.status) !== "completed")
      throw new HttpError(409, "Đơn NCC chưa hoàn tất; kiểm tra trạng thái trước khi nhập kho");
    const linkedSale = await env.DB.prepare(
      "SELECT id FROM mmo_transactions WHERE purchase_order_id=? AND type='sale' AND is_deleted=0",
    ).bind(orderId).first();
    if (linkedSale) throw new HttpError(409, "Đơn đã gắn với giao dịch bán, không thể nhập kho");
    const product = await env.DB.prepare(
      "SELECT s.source FROM products p JOIN product_sources s ON s.product_id=p.id WHERE p.id=?",
    ).bind(productId).first<{ source: string }>();
    if (product?.source !== "stock")
      throw new HttpError(400, "Chọn sản phẩm dùng kho tự tạo");
    const items = deliveredItemsOfRow(order).map((value) => value.trim()).filter(Boolean);
    if (!items.length || items.length > 500 || items.length > order.quantity)
      throw new HttpError(409, "Dữ liệu NCC giao chưa đủ rõ để nhập kho; kiểm tra chi tiết đơn");
    const inventoryIds = items.map((_, index) => `supplier:${orderId}:${index}`);
    const placeholders = inventoryIds.map(() => "?").join(",");
    const existing = await env.DB.prepare(
      `SELECT DISTINCT product_id FROM product_inventory WHERE id IN (${placeholders})`,
    ).bind(...inventoryIds).all<{ product_id: number }>();
    if (existing.results.some((row) => row.product_id !== productId))
      throw new HttpError(409, "Đơn NCC đã được nhập vào sản phẩm kho khác");
    const rows = await Promise.all(items.map(async (value, index) =>
      env.DB.prepare("INSERT OR IGNORE INTO product_inventory(id,product_id,payload) VALUES(?,?,?)")
        .bind(inventoryIds[index], productId, await encryptDelivery(env, inventoryIds[index], value)),
    ));
    const results = await env.DB.batch(rows);
    const imported = await env.DB.prepare(
      `SELECT DISTINCT product_id FROM product_inventory WHERE id IN (${placeholders})`,
    ).bind(...inventoryIds).all<{ product_id: number }>();
    if (imported.results.some((row) => row.product_id !== productId))
      throw new HttpError(409, "Đơn NCC đã được nhập vào sản phẩm kho khác");
    const added = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
    if (added) await audit(env, admin.email, "SUPPLIER_PURCHASE_IMPORT", orderId, { productId, count: added });
    return json({ ok: true, added, total: items.length });
  }
  const inventory = path.match(/^\/products\/(\d+)\/inventory$/);
  if (inventory) {
    requireRole(admin, ["owner"]);
    const productId = Number(inventory[1]);
    const source = await env.DB.prepare(
      "SELECT source FROM product_sources WHERE product_id=?",
    )
      .bind(productId)
      .first<{ source: string }>();
    if (source?.source !== "stock")
      throw new HttpError(400, "Sản phẩm không dùng kho tự tạo");
    if (request.method === "GET")
      return json({
        inventory: (
          await env.DB.prepare(
            "SELECT id,created_at,fulfillment_id FROM product_inventory WHERE product_id=? ORDER BY created_at DESC",
          )
            .bind(productId)
            .all()
        ).results,
      });
    if (request.method === "POST") {
      const { values } = await readBody(
        request,
        z.object({
          values: z.array(z.string().trim().min(1).max(10000)).min(1).max(500),
        }),
      );
      const rows = await Promise.all(
        values.map(async (value) => {
          const inventoryId = id();
          return env.DB.prepare(
            "INSERT INTO product_inventory(id,product_id,payload) VALUES(?,?,?)",
          ).bind(
            inventoryId,
            productId,
            await encryptDelivery(env, inventoryId, value),
          );
        }),
      );
      await env.DB.batch([
        ...rows,
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(
          id(),
          admin.email,
          "INVENTORY_ADD",
          String(productId),
          JSON.stringify({ count: rows.length }),
        ),
      ]);
      return json({ ok: true, added: rows.length });
    }
  }
  return null;
}
