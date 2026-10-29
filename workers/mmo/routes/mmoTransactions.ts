import { Hono } from "hono";
import { Env, Variables } from "../bindings.js";
import { authenticate, requireAuth, requireModuleAccess } from "../_middleware/auth.js";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Yêu cầu xác thực đăng nhập và phân quyền truy cập module mmo
app.use("*", authenticate, requireAuth, requireModuleAccess("mmo"));

export interface MmoTransactionRow {
  id: number;
  user_id: string;
  type: string;
  date: string;
  product_name: string;
  customer_info: string | null;
  cost_price: number;
  sale_price: number;
  delivered_data: string | null;
  warranty_period: string;
  warranty_start_date: string | null;
  warranty_expire_date: string | null;
  warranty_note: string | null;
  warranty_status: string;
  purchase_order_id: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

/**
 * Tính toán ngày hết hạn bảo hành dựa vào ngày bắt đầu và gói bảo hành
 */
export function computeWarrantyExpireDate(startDate: string, period: string): string | null {
  if (!period || period === "none" || period === "lifetime") return null;
  const dMatch = period.match(/^(\d+)d$/);
  if (dMatch) {
    const days = parseInt(dMatch[1], 10);
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }
  const mMatch = period.match(/^(\d+)m$/);
  if (mMatch) {
    const months = parseInt(mMatch[1], 10);
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
  }
  return null;
}

/**
 * Tính toán trạng thái và số ngày còn lại của hạn bảo hành
 */
export function computeWarrantyStatus(
  period: string,
  expireDateStr: string | null,
  rawStatus?: string
): { status: "none" | "lifetime" | "valid" | "expiring_soon" | "expired" | "void"; daysLeft: number | null } {
  if (rawStatus === "void") return { status: "void", daysLeft: null };
  if (!period || period === "none") return { status: "none", daysLeft: null };
  if (period === "lifetime") return { status: "lifetime", daysLeft: null };
  if (!expireDateStr) return { status: "none", daysLeft: null };

  const todayStr = new Date().toISOString().split("T")[0];
  const today = new Date(todayStr).getTime();
  const expire = new Date(expireDateStr).getTime();
  const diffDays = Math.ceil((expire - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "expired", daysLeft: 0 };
  }
  if (diffDays <= 7) {
    return { status: "expiring_soon", daysLeft: diffDays };
  }
  return { status: "valid", daysLeft: diffDays };
}

/**
 * Chuẩn hóa bản ghi giao dịch trả về cho frontend
 */
function formatTransaction(row: MmoTransactionRow) {
  const { status, daysLeft } = computeWarrantyStatus(
    row.warranty_period,
    row.warranty_expire_date,
    row.warranty_status
  );

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    date: row.date,
    productName: row.product_name,
    customerInfo: row.customer_info || "",
    costPrice: Number(row.cost_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    profit: (Number(row.sale_price) || 0) - (Number(row.cost_price) || 0),
    deliveredData: row.delivered_data || "",
    warrantyPeriod: row.warranty_period || "none",
    warrantyStartDate: row.warranty_start_date || row.date,
    warrantyExpireDate: row.warranty_expire_date || null,
    warrantyNote: row.warranty_note || "",
    warrantyStatus: status,
    warrantyDaysLeft: daysLeft,
    purchaseOrderId: row.purchase_order_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lấy danh sách giao dịch MMO theo bộ lọc kỳ, từ khóa, loại và bảo hành
 * // Bước 1: Trích xuất thông tin người dùng từ context bảo mật
 * // Bước 2: Thiết lập điều kiện lọc kỳ thời gian, loại giao dịch và từ khóa tìm kiếm
 * // Bước 3: Truy vấn danh sách giao dịch từ Cloudflare D1
 */
app.get("/transactions", async (c) => {
  const user = c.get("user")!;
  const period = c.req.query("period") || "all";
  const date = c.req.query("date");
  const month = c.req.query("month");
  const year = c.req.query("year");
  const fromDate = c.req.query("from_date");
  const toDate = c.req.query("to_date");
  const type = c.req.query("type");
  const search = c.req.query("q")?.trim();
  const warrantyFilter = c.req.query("warranty");

  let sql = "SELECT * FROM mmo_transactions WHERE user_id = ? AND is_deleted = 0";
  const params: any[] = [user.id];

  if (period === "day" && date) {
    sql += " AND date = ?";
    params.push(date);
  } else if (period === "month" && month) {
    sql += " AND date LIKE ?";
    params.push(`${month}-%`);
  } else if (period === "year" && year) {
    sql += " AND date LIKE ?";
    params.push(`${year}-%`);
  } else if (period === "custom" && fromDate && toDate) {
    sql += " AND date >= ? AND date <= ?";
    params.push(fromDate, toDate);
  }

  if (type && (type === "sale" || type === "expense" || type === "purchase")) {
    sql += " AND type = ?";
    params.push(type);
  }

  if (search) {
    sql += " AND (product_name LIKE ? OR customer_info LIKE ? OR delivered_data LIKE ? OR warranty_note LIKE ?)";
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }

  sql += " ORDER BY date DESC, id DESC LIMIT 500";

  try {
    const res = await c.env.DB.prepare(sql).bind(...params).all<MmoTransactionRow>();
    let transactions = (res.results || []).map(formatTransaction);

    if (warrantyFilter && warrantyFilter !== "all") {
      transactions = transactions.filter((t) => t.warrantyStatus === warrantyFilter);
    }

    return c.json({ success: true, transactions, total: transactions.length });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to fetch transactions: ${err.message}` }, 500);
  }
});

/**
 * Thêm mới giao dịch MMO (Bán hàng hoặc Chi phí khác)
 * // Bước 1: Kiểm tra tính hợp lệ của dữ liệu đầu vào (product_name, type, cost_price, sale_price)
 * // Bước 2: Tự động tính hạn bảo hành và lưu trữ vào Cloudflare D1
 */
app.post("/transactions", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const {
    type = "sale",
    date,
    product_name,
    customer_info = "",
    cost_price = 0,
    sale_price = 0,
    delivered_data = "",
    warranty_period = "none",
    warranty_note = "",
    purchase_order_id = null,
  } = body;

  const trimmedProductName = String(product_name || "").trim();
  if (!trimmedProductName) {
    return c.json({ success: false, message: "Product name is required" }, 400);
  }

  const txType = type === "expense" ? "expense" : type === "purchase" ? "purchase" : "sale";
  const numCost = Math.max(0, Number(cost_price) || 0);
  const numSale = Math.max(0, Number(sale_price) || 0);

  const txDate = (date && typeof date === "string" && date.trim()) || new Date().toISOString().split("T")[0];
  const expireDate = computeWarrantyExpireDate(txDate, warranty_period);
  if (purchase_order_id) {
    const existingOrderLink = await c.env.DB.prepare(
      "SELECT id FROM mmo_transactions WHERE purchase_order_id = ? AND is_deleted = 0"
    )
      .bind(String(purchase_order_id).trim())
      .first<{ id: number }>();

    if (existingOrderLink) {
      return c.json(
        {
          success: false,
          message: "Đơn mua NCC này đã được liên kết với một đơn bán khác",
        },
        400
      );
    }
  }

  const now = new Date().toISOString();

  try {
    const insertRes = await c.env.DB.prepare(
      `INSERT INTO mmo_transactions (
        user_id, type, date, product_name, customer_info,
        cost_price, sale_price, delivered_data, warranty_period,
        warranty_start_date, warranty_expire_date, warranty_note,
        warranty_status, purchase_order_id, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?, 0, ?, ?)`
    )
      .bind(
        user.id,
        txType,
        txDate,
        trimmedProductName,
        customer_info ? String(customer_info).trim() : null,
        numCost,
        numSale,
        delivered_data ? String(delivered_data).trim() : null,
        warranty_period || "none",
        txDate,
        expireDate,
        warranty_note ? String(warranty_note).trim() : null,
        purchase_order_id || null,
        now,
        now
      )
      .run();

    const newId = insertRes.meta.last_row_id;

    return c.json({
      success: true,
      message: "Transaction created successfully",
      id: newId,
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to create transaction: ${err.message}` }, 500);
  }
});

/**
 * Cập nhật thông tin chi tiết giao dịch (ghi chú bảo hành, đổi tài khoản, điều chỉnh giá)
 * // Bước 1: Kiểm tra quyền sở hữu bản ghi của user hiện tại
 * // Bước 2: Cập nhật các trường thông tin thay đổi vào D1
 */
app.put("/transactions/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));

  if (!id) {
    return c.json({ success: false, message: "Invalid transaction ID" }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const {
    date,
    product_name,
    customer_info,
    cost_price,
    sale_price,
    delivered_data,
    warranty_period,
    warranty_note,
    warranty_status,
  } = body;

  try {
    const existing = await c.env.DB.prepare(
      "SELECT * FROM mmo_transactions WHERE id = ? AND user_id = ? AND is_deleted = 0"
    )
      .bind(id, user.id)
      .first<MmoTransactionRow>();

    if (!existing) {
      return c.json({ success: false, message: "Transaction not found or access denied" }, 404);
    }

    const txDate = date !== undefined ? String(date).trim() : existing.date;
    const pName = product_name !== undefined ? String(product_name).trim() : existing.product_name;
    const cInfo = customer_info !== undefined ? String(customer_info).trim() : existing.customer_info;
    const cost = cost_price !== undefined ? Math.max(0, Number(cost_price) || 0) : existing.cost_price;
    const sale = sale_price !== undefined ? Math.max(0, Number(sale_price) || 0) : existing.sale_price;
    const deliv = delivered_data !== undefined ? String(delivered_data).trim() : existing.delivered_data;
    const wPeriod = warranty_period !== undefined ? String(warranty_period) : existing.warranty_period;
    const wNote = warranty_note !== undefined ? String(warranty_note).trim() : existing.warranty_note;
    const wStatus = warranty_status !== undefined ? String(warranty_status) : existing.warranty_status;

    let pOrderId = existing.purchase_order_id;
    if (body.purchase_order_id !== undefined) {
      const candidate = body.purchase_order_id ? String(body.purchase_order_id).trim() : null;
      if (candidate && candidate !== existing.purchase_order_id) {
        const conflict = await c.env.DB.prepare(
          "SELECT id FROM mmo_transactions WHERE purchase_order_id = ? AND id != ? AND is_deleted = 0"
        )
          .bind(candidate, id)
          .first<{ id: number }>();
        if (conflict) {
          return c.json(
            { success: false, message: "Đơn mua NCC này đã được liên kết với một đơn bán khác" },
            400
          );
        }
      }
      pOrderId = candidate;
    }

    const expireDate = computeWarrantyExpireDate(txDate, wPeriod);
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE mmo_transactions
       SET date = ?, product_name = ?, customer_info = ?, cost_price = ?,
           sale_price = ?, delivered_data = ?, warranty_period = ?,
           warranty_expire_date = ?, warranty_note = ?, warranty_status = ?,
           purchase_order_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
      .bind(
        txDate,
        pName,
        cInfo,
        cost,
        sale,
        deliv,
        wPeriod,
        expireDate,
        wNote,
        wStatus,
        pOrderId,
        now,
        id,
        user.id
      )
      .run();

    return c.json({ success: true, message: "Transaction updated successfully" });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to update transaction: ${err.message}` }, 500);
  }
});

/**
 * Xóa mềm giao dịch MMO (is_deleted = 1)
 */
app.delete("/transactions/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));

  if (!id) {
    return c.json({ success: false, message: "Invalid transaction ID" }, 400);
  }

  const now = new Date().toISOString();

  try {
    const res = await c.env.DB.prepare(
      `UPDATE mmo_transactions
       SET is_deleted = 1, updated_at = ?
       WHERE id = ? AND user_id = ? AND is_deleted = 0`
    )
      .bind(now, id, user.id)
      .run();

    if (res.meta.changes === 0) {
      return c.json({ success: false, message: "Transaction not found or already deleted" }, 404);
    }

    return c.json({ success: true, message: "Transaction deleted successfully" });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to delete transaction: ${err.message}` }, 500);
  }
});

/**
 * Thống kê tổng hợp số liệu kinh doanh MMO (KPI Summary)
 * // Bước 1: Trích xuất các tham số kỳ lọc từ query
 * // Bước 2: Tính tổng doanh thu (sale_price đơn bán), tổng giá vốn (cost_price đơn bán),
 * //         tổng chi phí khác (cost_price đơn expense), lợi nhuận ròng và tỷ suất
 */
app.get("/reports/summary", async (c) => {
  const user = c.get("user")!;
  const period = c.req.query("period") || "month";
  const date = c.req.query("date");
  const month = c.req.query("month");
  const year = c.req.query("year");
  const fromDate = c.req.query("from_date");
  const toDate = c.req.query("to_date");

  let sql = `
    SELECT
      SUM(CASE WHEN type = 'sale' THEN sale_price ELSE 0 END) as total_revenue,
      SUM(CASE WHEN type = 'sale' THEN cost_price ELSE 0 END) as total_cost,
      SUM(CASE WHEN type = 'expense' THEN cost_price ELSE 0 END) as total_other_expense,
      COUNT(CASE WHEN type = 'sale' THEN 1 END) as count_sales,
      COUNT(CASE WHEN type = 'expense' THEN 1 END) as count_expenses,
      COUNT(id) as total_count
    FROM mmo_transactions
    WHERE user_id = ? AND is_deleted = 0
  `;
  const params: any[] = [user.id];

  if (period === "day" && date) {
    sql += " AND date = ?";
    params.push(date);
  } else if (period === "month" && month) {
    sql += " AND date LIKE ?";
    params.push(`${month}-%`);
  } else if (period === "year" && year) {
    sql += " AND date LIKE ?";
    params.push(`${year}-%`);
  } else if (period === "custom" && fromDate && toDate) {
    sql += " AND date >= ? AND date <= ?";
    params.push(fromDate, toDate);
  }

  try {
    const row = await c.env.DB.prepare(sql).bind(...params).first<any>();

    const totalRevenue = Number(row?.total_revenue) || 0;
    const totalCost = Number(row?.total_cost) || 0;
    const totalOtherExpense = Number(row?.total_other_expense) || 0;
    const totalExpense = totalCost + totalOtherExpense;
    const netProfit = totalRevenue - totalExpense;
    const profitMargin = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0;
    const countSales = Number(row?.count_sales) || 0;
    const countExpenses = Number(row?.count_expenses) || 0;
    const totalCount = Number(row?.total_count) || 0;

    return c.json({
      success: true,
      summary: {
        totalRevenue,
        totalCost,
        totalOtherExpense,
        totalExpense,
        netProfit,
        profitMargin,
        countSales,
        countExpenses,
        totalCount,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to compute report summary: ${err.message}` }, 500);
  }
});

interface MonthlyRow {
  month_num: string;
  revenue: number;
  cost: number;
  other_expense: number;
  count_sales: number;
}

/**
 * Thống kê doanh thu, chi phí và lợi nhuận 12 tháng trong năm
 */
app.get("/reports/monthly", async (c) => {
  const user = c.get("user")!;
  const currentYear = new Date().getFullYear();
  const yearQuery = c.req.query("year");
  const year = yearQuery && /^\d{4}$/.test(yearQuery) ? parseInt(yearQuery, 10) : currentYear;

  const sql = `
    SELECT
      strftime('%m', date) as month_num,
      SUM(CASE WHEN type = 'sale' THEN sale_price ELSE 0 END) as revenue,
      SUM(CASE WHEN type = 'sale' THEN cost_price ELSE 0 END) as cost,
      SUM(CASE WHEN type = 'expense' THEN cost_price ELSE 0 END) as other_expense,
      COUNT(CASE WHEN type = 'sale' THEN 1 END) as count_sales
    FROM mmo_transactions
    WHERE user_id = ? AND is_deleted = 0 AND date LIKE ?
    GROUP BY strftime('%m', date)
    ORDER BY month_num ASC
  `;

  try {
    const res = await c.env.DB.prepare(sql).bind(user.id, `${year}-%`).all<MonthlyRow>();
    const rowMap = new Map<number, { revenue: number; cost: number; other_expense: number; count_sales: number }>();

    for (const r of res.results || []) {
      const mNum = parseInt(r.month_num, 10);
      if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
        rowMap.set(mNum, {
          revenue: Number(r.revenue) || 0,
          cost: Number(r.cost) || 0,
          other_expense: Number(r.other_expense) || 0,
          count_sales: Number(r.count_sales) || 0,
        });
      }
    }

    let yearRevenue = 0;
    let yearCost = 0;
    let yearOtherExpense = 0;

    const months = Array.from({ length: 12 }, (_, i) => {
      const monthIndex = i + 1;
      const data = rowMap.get(monthIndex) || { revenue: 0, cost: 0, other_expense: 0, count_sales: 0 };
      const rev = data.revenue;
      const cost = data.cost;
      const otherExp = data.other_expense;
      const totalExp = cost + otherExp;
      const profit = rev - totalExp;

      yearRevenue += rev;
      yearCost += cost;
      yearOtherExpense += otherExp;

      return {
        month: monthIndex,
        label: `Tháng ${monthIndex}`,
        shortLabel: `T${monthIndex}`,
        monthKey: `${year}-${String(monthIndex).padStart(2, "0")}`,
        revenue: rev,
        cost,
        otherExpense: otherExp,
        totalExpense: totalExp,
        profit,
        countSales: data.count_sales,
      };
    });

    const yearTotalExpense = yearCost + yearOtherExpense;
    const yearProfit = yearRevenue - yearTotalExpense;
    const yearMargin = yearRevenue > 0 ? Number(((yearProfit / yearRevenue) * 100).toFixed(2)) : 0;

    return c.json({
      success: true,
      year,
      months,
      yearSummary: {
        totalRevenue: yearRevenue,
        totalCost: yearCost,
        totalOtherExpense: yearOtherExpense,
        totalExpense: yearTotalExpense,
        netProfit: yearProfit,
        profitMargin: yearMargin,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to compute monthly report: ${err.message}` }, 500);
  }
});

/**
 * Tra cứu danh sách bảo hành chuyên sâu
 */
app.get("/warranty/lookup", async (c) => {
  const user = c.get("user")!;
  const search = c.req.query("q")?.trim();
  const statusFilter = c.req.query("status") || "all";

  let sql = `
    SELECT * FROM mmo_transactions
    WHERE user_id = ? AND is_deleted = 0 AND type = 'sale' AND warranty_period != 'none'
  `;
  const params: any[] = [user.id];

  if (search) {
    sql += " AND (product_name LIKE ? OR customer_info LIKE ? OR delivered_data LIKE ? OR warranty_note LIKE ?)";
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }

  sql += " ORDER BY warranty_expire_date ASC, date DESC LIMIT 300";

  try {
    const res = await c.env.DB.prepare(sql).bind(...params).all<MmoTransactionRow>();
    let list = (res.results || []).map(formatTransaction);

    if (statusFilter && statusFilter !== "all") {
      list = list.filter((item) => item.warrantyStatus === statusFilter);
    }

    // Phân loại số lượng theo từng nhóm để trả về badges thống kê
    const counts = {
      all: list.length,
      valid: 0,
      expiringSoon: 0,
      expired: 0,
      lifetime: 0,
    };

    for (const item of list) {
      if (item.warrantyStatus === "valid") counts.valid++;
      else if (item.warrantyStatus === "expiring_soon") counts.expiringSoon++;
      else if (item.warrantyStatus === "expired") counts.expired++;
      else if (item.warrantyStatus === "lifetime") counts.lifetime++;
    }

    return c.json({ success: true, list, counts });
  } catch (err: any) {
    return c.json({ success: false, message: `Failed to lookup warranty: ${err.message}` }, 500);
  }
});

export default app;
