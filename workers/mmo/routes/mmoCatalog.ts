import { Hono } from "hono";
import { Env, Variables } from "../bindings.js";
import { authenticate, requireAuth, requireAdmin } from "../_middleware/auth.js";
import { openSession } from "../services/providerSession.js";
import { createD1Stores, type MmoStores } from "../services/mmoStores.js";
import { productOpenApiSpec } from "../services/mmoProductSpec.js";

type MmoVariables = Variables & { mmoStores: MmoStores };

const app = new Hono<{ Bindings: Env; Variables: MmoVariables }>();

app.use("*", async (c, next) => {
  if (!c.get("mmoStores")) {
    c.set("mmoStores", createD1Stores(c.env));
  }
  await next();
});

export interface RetailProductRow {
  id: number;
  provider_id: string;
  provider_product_id: string;
  name: string;
  description: string;
  original_name: string;
  original_description: string;
  original_price_usd: number;
  original_price: number;
  original_currency: string;
  selling_price: number;
  category: string;
  image_url: string | null;
  in_stock: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * // Bước 1.0: Cung cấp đặc tả tài liệu OpenAPI / Swagger JSON cho toàn bộ API Sản phẩm
 * - Mục đích nghiệp vụ: Cho phép Swagger UI, Postman, hoặc các công cụ tự động hóa đọc tài liệu đặc tả chuẩn OAS 3.0.
 */
app.get("/openapi.json", (c) => {
  return c.json(productOpenApiSpec);
});

app.get("/swagger.json", (c) => {
  return c.json(productOpenApiSpec);
});

/**
 * // Bước 1.1: Lấy danh sách sản phẩm bán lẻ công khai cho khách xem (/product)
 * - Mục đích nghiệp vụ: Cung cấp danh mục sản phẩm chọn lọc kèm giá bán lẻ cho khách xem trên PC và mobile.
 * - Quy tắc nghiệp vụ:
 *   + Chỉ trả về sản phẩm đang kích hoạt (is_active = 1).
 *   + Sắp xếp theo thứ tự sort_order ASC, updated_at DESC.
 *   + Tuyệt đối bảo mật: Ẩn hoàn toàn provider_id, provider_product_id và original_price (giá vốn).
 */
app.get("/", async (c) => {
  try {
    const url = new URL(c.req.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search")?.trim().toLowerCase();

    let sql = `
      SELECT id, name, description, selling_price, category, image_url, in_stock, updated_at
      FROM mmo_retail_products
      WHERE is_active = 1
    `;
    const params: any[] = [];

    if (category && category !== "Tất cả") {
      sql += " AND category = ?";
      params.push(category);
    }

    if (search) {
      sql += " AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY sort_order ASC, updated_at DESC";

    const stmt = c.env.DB.prepare(sql);
    const res = await (params.length > 0 ? stmt.bind(...params) : stmt).all<RetailProductRow>();
    const products = (res.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || "",
      selling_price: Number(row.selling_price) || 0,
      category: row.category || "Khác",
      image_url: row.image_url || null,
      in_stock: Boolean(row.in_stock),
      updated_at: row.updated_at,
    }));

    // Lấy danh mục distinct cho bộ lọc
    const catRes = await c.env.DB.prepare(
      "SELECT DISTINCT category FROM mmo_retail_products WHERE is_active = 1 AND category IS NOT NULL AND TRIM(category) != '' ORDER BY category ASC"
    ).all<{ category: string }>();
    const categories = (catRes.results || []).map((r) => r.category);

    return c.json({
      success: true,
      products,
      categories,
      total: products.length,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to fetch public catalog: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.2: Lấy danh sách sản phẩm bán lẻ dành cho Admin quản trị
 * - Mục đích nghiệp vụ: Hiển thị đầy đủ thông tin sản phẩm trên kệ, giá vốn vendor, giá bán lẻ, và tỷ lệ lợi nhuận.
 * - Quy tắc nghiệp vụ: Yêu cầu quyền Admin, trả về cả sản phẩm đang ẩn (is_active = 0).
 */
app.get("/admin", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const res = await c.env.DB.prepare(
      "SELECT * FROM mmo_retail_products ORDER BY sort_order ASC, updated_at DESC"
    ).all<RetailProductRow>();

    const products = (res.results || []).map((row) => {
      const sellingPrice = Number(row.selling_price) || 0;
      const costPriceVnd = Number(row.original_price) || 0;
      const profitVnd = sellingPrice - costPriceVnd;
      const profitMargin = costPriceVnd > 0 ? Math.round((profitVnd / costPriceVnd) * 100) : 0;

      return {
        id: row.id,
        provider_id: row.provider_id,
        provider_product_id: row.provider_product_id,
        name: row.name,
        description: row.description || "",
        original_name: row.original_name,
        original_description: row.original_description || "",
        original_price_usd: Number(row.original_price_usd) || 0,
        original_price: costPriceVnd,
        original_currency: row.original_currency || "USD",
        selling_price: sellingPrice,
        profit_vnd: profitVnd,
        profit_margin: profitMargin,
        category: row.category || "Khác",
        image_url: row.image_url || null,
        in_stock: Boolean(row.in_stock),
        is_active: Boolean(row.is_active),
        sort_order: row.sort_order || 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return c.json({
      success: true,
      products,
      total: products.length,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to fetch admin catalog: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.3: Thêm hoặc cập nhật sản phẩm chọn lọc từ Vendor vào kệ bán lẻ
 * - Mục đích nghiệp vụ: Lưu sản phẩm được Admin chọn từ danh sách của Vendor vào bảng mmo_retail_products.
 * - Quy tắc nghiệp vụ:
 *   + Khóa duy nhất (provider_id, provider_product_id) ngăn ngừa thêm trùng.
 *   + Tên và mô tả nếu không truyền sẽ tự động sao chép từ original_name và original_description.
 */
app.post("/", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      provider_id,
      provider_product_id,
      original_name,
      original_description = "",
      original_price_usd = 0,
      original_price = 0,
      original_currency = "USD",
      selling_price,
      name,
      description,
      category = "Khác",
      image_url = null,
      in_stock = 1,
      is_active = 1,
      sort_order = 0,
    } = body;

    if (!provider_id || !provider_product_id || !original_name) {
      return c.json({ success: false, message: "Missing required vendor product information" }, 400);
    }

    if (selling_price === undefined || selling_price === null || isNaN(Number(selling_price))) {
      return c.json({ success: false, message: "Selling price is required and must be a number" }, 400);
    }

    const finalName = (name && String(name).trim()) || original_name;
    const finalDescription = description !== undefined && description !== null ? String(description) : original_description;
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO mmo_retail_products (
        provider_id, provider_product_id, name, description,
        original_name, original_description, original_price_usd, original_price, original_currency,
        selling_price, category, image_url, in_stock, is_active, sort_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, provider_product_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        original_name = excluded.original_name,
        original_description = excluded.original_description,
        original_price_usd = excluded.original_price_usd,
        original_price = excluded.original_price,
        original_currency = excluded.original_currency,
        selling_price = excluded.selling_price,
        category = excluded.category,
        image_url = COALESCE(excluded.image_url, mmo_retail_products.image_url),
        in_stock = excluded.in_stock,
        is_active = excluded.is_active,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `;

    await c.env.DB.prepare(sql)
      .bind(
        provider_id,
        provider_product_id,
        finalName,
        finalDescription,
        original_name,
        original_description,
        Number(original_price_usd) || 0,
        Number(original_price) || 0,
        original_currency,
        Number(selling_price),
        category,
        image_url,
        in_stock ? 1 : 0,
        is_active ? 1 : 0,
        Number(sort_order) || 0,
        now,
        now
      )
      .run();

    return c.json({ success: true, message: "Product added to retail catalog" });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to add product: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.4: Cập nhật thông tin sản phẩm bán lẻ (Sửa tên, mô tả, giá bán, hoặc khôi phục gốc)
 * - Mục đích nghiệp vụ: Cho phép Admin điều chỉnh giá bán và nội dung hiển thị hoặc bấm khôi phục về bản gốc của vendor.
 */
app.put("/:id", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param("id") || "", 10);
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid product ID" }, 400);
    }

    const existing = await c.env.DB.prepare("SELECT * FROM mmo_retail_products WHERE id = ?").bind(id).first<RetailProductRow>();
    if (!existing) {
      return c.json({ success: false, message: "Retail product not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const {
      name,
      description,
      selling_price,
      category,
      is_active,
      sort_order,
      restore_defaults,
    } = body;

    let finalName = existing.name;
    let finalDesc = existing.description;

    if (restore_defaults) {
      finalName = existing.original_name;
      finalDesc = existing.original_description;
    } else {
      if (name !== undefined) finalName = String(name).trim() || existing.original_name;
      if (description !== undefined) finalDesc = String(description);
    }

    const finalSellingPrice = selling_price !== undefined ? Number(selling_price) : existing.selling_price;
    const finalCategory = category !== undefined ? category : existing.category;
    const finalIsActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;
    const finalSortOrder = sort_order !== undefined ? Number(sort_order) : existing.sort_order;
    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      UPDATE mmo_retail_products
      SET name = ?, description = ?, selling_price = ?, category = ?, is_active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).bind(finalName, finalDesc, finalSellingPrice, finalCategory, finalIsActive, finalSortOrder, now, id).run();

    return c.json({ success: true, message: "Retail product updated successfully" });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to update product: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.5: Bật hoặc tắt trạng thái hiển thị của sản phẩm trên trang /product
 * - Mục đích nghiệp vụ: Ẩn nhanh sản phẩm khi tạm dừng bán mà không cần xóa khỏi cơ sở dữ liệu.
 */
app.patch("/:id/status", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param("id") || "", 10);
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid product ID" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const isActive = body.is_active ? 1 : 0;
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "UPDATE mmo_retail_products SET is_active = ?, updated_at = ? WHERE id = ?"
    ).bind(isActive, now, id).run();

    return c.json({ success: true, message: "Status updated successfully", is_active: Boolean(isActive) });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to toggle status: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.6: Xóa sản phẩm khỏi danh mục bán lẻ
 * - Mục đích nghiệp vụ: Gỡ bỏ hoàn toàn sản phẩm khỏi kệ bán lẻ D1.
 */
app.delete("/:id", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const id = parseInt(c.req.param("id") || "", 10);
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid product ID" }, 400);
    }

    await c.env.DB.prepare("DELETE FROM mmo_retail_products WHERE id = ?").bind(id).run();
    return c.json({ success: true, message: "Retail product deleted" });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to delete product: ${err.message}` }, 500);
  }
});

/**
 * // Bước 1.7: Đồng bộ giá vốn & tồn kho hàng loạt từ các Vendor
 * - Mục đích nghiệp vụ: Gom nhóm sản phẩm theo provider_id, gọi API nhà cung cấp 1 lần duy nhất cho mỗi vendor
 *   để cập nhật giá vốn gốc và trạng thái còn hàng (in_stock) cho toàn bộ sản phẩm trên kệ bán lẻ.
 */
app.post("/sync", authenticate, requireAuth, requireAdmin, async (c) => {
  try {
    const itemsRes = await c.env.DB.prepare(
      "SELECT id, provider_id, provider_product_id FROM mmo_retail_products"
    ).all<{ id: number; provider_id: string; provider_product_id: string }>();

    const items = itemsRes.results || [];
    if (items.length === 0) {
      return c.json({ success: true, message: "No retail products to sync", updated_count: 0 });
    }

    // Gom nhóm theo provider_id
    const providerMap = new Map<string, { id: number; provider_product_id: string }[]>();
    for (const item of items) {
      const list = providerMap.get(item.provider_id) || [];
      list.push(item);
      providerMap.set(item.provider_id, list);
    }

    const stores = c.get("mmoStores");
    let totalUpdated = 0;
    const errors: { provider_id: string; message: string }[] = [];
    const now = new Date().toISOString();

    for (const [providerId, retailItems] of providerMap.entries()) {
      try {
        const session = await openSession(stores.providers, providerId);
        const liveProducts = await session.fetchProducts();

        const liveMap = new Map<string, any>();
        for (const lp of liveProducts) {
          liveMap.set(String(lp.provider_product_id), lp);
        }

        const updateStmts = [];
        for (const item of retailItems) {
          const live = liveMap.get(String(item.provider_product_id));
          if (live) {
            updateStmts.push(
              c.env.DB.prepare(`
                UPDATE mmo_retail_products
                SET original_price_usd = ?,
                    original_price = ?,
                    original_currency = ?,
                    in_stock = ?,
                    updated_at = ?
                WHERE id = ?
              `).bind(
                Number(live.price_usd) || 0,
                Number(live.price_original) || 0,
                live.currency_original || "USD",
                live.in_stock ? 1 : 0,
                now,
                item.id
              )
            );
            totalUpdated++;
          }
        }

        if (updateStmts.length > 0) {
          await c.env.DB.batch(updateStmts);
        }
      } catch (err: any) {
        errors.push({ provider_id: providerId, message: err.message });
      }
    }

    return c.json({
      success: true,
      message: `Synced ${totalUpdated} products across ${providerMap.size} providers`,
      total_updated: totalUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Sync failed: ${err.message}` }, 500);
  }
});

export default app;
