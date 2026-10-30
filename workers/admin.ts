import { z } from "zod";
import { administrator, requireRole } from "./auth";
import type { Env, StoredOrder } from "./types";
import {
  audit,
  checkOrigin,
  HttpError,
  id,
  json,
  readBody,
  limitedBytes,
  sha256,
} from "./http";
import { configSchema, paymentConfig, reconcile } from "./payments";
import { encryptDelivery } from "./delivery";
import { sweep } from "./operations";
import { mmoApi } from "./mmo";
import { catalogAdmin } from "./catalog";
import { fulfillmentAdmin, orderProgress, receivedDelivery } from "./fulfillment";
import { telegramCall } from "./telegram";

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    heading: z.string().max(150),
    text: z.string().max(10000),
  }),
  z.object({
    type: z.literal("link"),
    label: z.string().max(100),
    url: z.url().refine((s) => s.startsWith("https://")),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().regex(/^\/media\/[a-f0-9-]{36}$/),
    alt: z.string().max(150),
  }),
]);

const pageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  title: z.string().min(1).max(150),
  description: z.string().max(500),
  blocks: z.array(blockSchema).max(30),
});

/**
 * Điều phối toàn bộ API quản trị cho cửa hàng, khách hàng, đơn hàng, tài chính và CMS.
 */
export async function adminApi(request: Request, env: Env) {
  const admin = await administrator(request, env);
  checkOrigin(request, env, true);
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/admin".length);

  const catalogResponse = await catalogAdmin(request, env, admin, path);
  if (catalogResponse) return catalogResponse;

  const fulfillmentResponse = await fulfillmentAdmin(request, env, admin, path);
  if (fulfillmentResponse) return fulfillmentResponse;

  if (path === "/mmo" || path.startsWith("/mmo/")) {
    requireRole(admin, ["owner"]);
    if (!["GET", "HEAD"].includes(request.method))
      await audit(env, admin.email, "MMO_REQUEST", path, { method: request.method });
    return mmoApi(request, env, admin);
  }

  if (path === "/me" && request.method === "GET") return json(admin);

  if (path === "/media" && request.method === "POST") {
    requireRole(admin, ["owner", "editor"]);
    if (!env.MEDIA) throw new HttpError(503, "Chưa cấu hình kho ảnh R2");
    const bytes = await limitedBytes(request, 2 * 1024 * 1024);
    const type = request.headers.get("content-type");
    const png =
      type === "image/png" &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => bytes[index] === byte,
      );
    const jpeg =
      type === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
    const webp =
      type === "image/webp" &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!png && !jpeg && !webp)
      throw new HttpError(
        400,
        "Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP hợp lệ, tối đa 2 MB",
      );
    const mediaId = id();
    await env.MEDIA.put(mediaId, bytes, {
      httpMetadata: { contentType: type! },
    });
    await audit(env, admin.email, "MEDIA_UPLOAD", mediaId, {
      type,
      size: bytes.length,
    });
    return json({ url: `/media/${mediaId}` }, 201);
  }

  if (path === "/overview" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "support", "auditor"]);
    const [payments, wallets, review, backlog, reconciliation] =
      await Promise.all([
        env.DB.prepare(
          "SELECT currency,channel,SUM(total) AS total,COUNT(*) AS count FROM orders WHERE payment_status='PAID' GROUP BY currency,channel",
        ).all(),
        env.DB.prepare(
          "SELECT COALESCE(SUM(balance),0) AS liability FROM wallets",
        ).first(),
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM inbox WHERE status='REVIEW'",
        ).first(),
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM outbox WHERE status<>'DONE'",
        ).first(),
        env.DB.prepare(
          "SELECT * FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1",
        ).first(),
      ]);
    return json({
      payments: payments.results,
      wallets,
      review,
      backlog,
      reconciliation,
    });
  }

  if (path === "/customers" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "support", "auditor"]);
    const q = url.searchParams.get("q")?.trim();
    const pattern = q ? `%${q}%` : null;
    const { results } = await (pattern
      ? env.DB.prepare(
          "SELECT u.id,u.name,u.email,u.username,u.createdAt,COALESCE(c.phone,'') AS phone,COALESCE(c.disabled,0) AS disabled,COALESCE(w.balance,0) AS balance,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count FROM user u LEFT JOIN customers c ON c.id=u.id LEFT JOIN wallets w ON w.user_id=u.id WHERE u.name LIKE ? OR u.email LIKE ? OR COALESCE(u.username,'') LIKE ? OR u.id LIKE ? OR COALESCE(c.phone,'') LIKE ? ORDER BY u.createdAt DESC LIMIT 100",
        ).bind(pattern, pattern, pattern, pattern, pattern)
      : env.DB.prepare(
          "SELECT u.id,u.name,u.email,u.username,u.createdAt,COALESCE(c.phone,'') AS phone,COALESCE(c.disabled,0) AS disabled,COALESCE(w.balance,0) AS balance,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count FROM user u LEFT JOIN customers c ON c.id=u.id LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.createdAt DESC LIMIT 100",
        )
    ).all();
    return json({ customers: results });
  }

  const customerDetail = path.match(/^\/customers\/([^/]+)$/);
  if (customerDetail && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "support", "auditor"]);
    const customerId = decodeURIComponent(customerDetail[1]);
    const userRow = await env.DB.prepare(
      "SELECT u.id,u.name,u.email,u.username,u.createdAt,COALESCE(c.phone,'') AS phone,COALESCE(c.disabled,0) AS disabled,COALESCE(w.balance,0) AS balance FROM user u LEFT JOIN customers c ON c.id=u.id LEFT JOIN wallets w ON w.user_id=u.id WHERE u.id=?",
    )
      .bind(customerId)
      .first();
    if (!userRow) throw new HttpError(404, "Không tìm thấy khách hàng");
    const [ordersRes, journalsRes, telegramRow] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(customerId)
        .all<StoredOrder>(),
      env.DB.prepare(
        "SELECT * FROM journals WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(customerId)
        .all(),
      env.DB.prepare(
        "SELECT telegram_id,chat_id FROM telegram_links WHERE user_id=?",
      )
        .bind(customerId)
        .first(),
    ]);
    return json({
      customer: userRow,
      orders: await Promise.all(
        ordersRes.results.map((o) => orderProgress(env, o)),
      ),
      journals: journalsRes.results,
      telegram: telegramRow ?? null,
    });
  }

  if (customerDetail && request.method === "PUT") {
    requireRole(admin, ["owner", "support"]);
    const customerId = decodeURIComponent(customerDetail[1]);
    const existingUser = await env.DB.prepare("SELECT id FROM user WHERE id=?")
      .bind(customerId)
      .first();
    if (!existingUser) throw new HttpError(404, "Không tìm thấy khách hàng");
    const body = await readBody(
      request,
      z.object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().trim().max(30).default(""),
      }),
    );
    await env.DB.batch([
      env.DB.prepare("UPDATE user SET name=?,updatedAt=? WHERE id=?").bind(
        body.name,
        Date.now(),
        customerId,
      ),
      env.DB.prepare(
        "INSERT INTO customers(id,phone) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone",
      ).bind(customerId, body.phone),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "CUSTOMER_UPDATE",
        customerId,
        JSON.stringify(body),
      ),
    ]);
    return json({ ok: true });
  }

  const lock = path.match(/^\/customers\/([^/]+)\/lock$/);
  if (lock && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const customerId = decodeURIComponent(lock[1]);
    const body = await readBody(
      request,
      z.object({ disabled: z.boolean(), reason: z.string().min(5).max(300) }),
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO customers(id,disabled) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET disabled=excluded.disabled",
      ).bind(customerId, Number(body.disabled)),
      env.DB.prepare("DELETE FROM session WHERE userId=?").bind(customerId),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "CUSTOMER_LOCK",
        customerId,
        JSON.stringify(body),
      ),
    ]);
    return json({ ok: true });
  }

  if (path === "/orders" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "support", "auditor"]);
    const q = url.searchParams.get("q")?.trim();
    const statusFilter = url.searchParams.get("status")?.trim();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q) {
      conditions.push(
        "(id LIKE ? OR user_id LIKE ? OR customer LIKE ? OR items LIKE ?)",
      );
      const p = `%${q}%`;
      params.push(p, p, p, p);
    }
    if (statusFilter) {
      conditions.push("(payment_status=? OR fulfillment_status=?)");
      params.push(statusFilter, statusFilter);
    }
    const whereSql = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const { results } = await env.DB.prepare(
      `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC,id DESC LIMIT 100`,
    )
      .bind(...params)
      .all<StoredOrder>();
    return json({
      orders: await Promise.all(
        results.map((order) => orderProgress(env, order)),
      ),
    });
  }

  const orderDeliveryView = path.match(/^\/orders\/([A-Z0-9]+)\/delivery$/);
  if (orderDeliveryView && request.method === "GET") {
    requireRole(admin, ["owner", "support"]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?")
      .bind(orderDeliveryView[1])
      .first<StoredOrder>();
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    return json(await receivedDelivery(env, order));
  }

  const orderDelete = path.match(/^\/orders\/([A-Z0-9]+)$/);
  if (orderDelete && request.method === "DELETE") {
    requireRole(admin, ["owner", "support"]);
    const orderId = orderDelete[1];
    const order = await env.DB.prepare(
      "SELECT id,payment_status FROM orders WHERE id=?",
    )
      .bind(orderId)
      .first<{ id: string; payment_status: string }>();
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    if (order.payment_status !== "UNPAID")
      throw new HttpError(409, "Chỉ có thể xóa đơn chưa thanh toán");
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM intents WHERE order_id=? AND status<>'SUCCEEDED'",
      ).bind(orderId),
      env.DB.prepare(
        "DELETE FROM orders WHERE id=? AND payment_status='UNPAID'",
      ).bind(orderId),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "ORDER_DELETE", orderId, "{}"),
    ]);
    return json({ ok: true });
  }

  const delivery = path.match(/^\/orders\/([A-Z0-9]+)\/deliver$/);
  if (delivery && request.method === "POST") {
    requireRole(admin, ["owner", "support"]);
    const body = await readBody(
      request,
      z.object({ value: z.string().min(1).max(10000) }),
    );
    const encrypted = await encryptDelivery(env, delivery[1], body.value);
    const result = await env.DB.batch([
      env.DB.prepare(
        "UPDATE orders SET delivery=?,fulfillment_status='DELIVERED' WHERE id=? AND payment_status='PAID' AND fulfillment_status IN('QUEUED','REVIEW','AWAITING') AND NOT EXISTS(SELECT 1 FROM fulfillments WHERE order_id=orders.id AND status NOT IN('QUEUED','REVIEW','AWAITING')) RETURNING id",
      ).bind(encrypted, delivery[1]),
      env.DB.prepare(
        "UPDATE fulfillments SET status='DELIVERED',delivered_quantity=quantity,reason=NULL,updated_at=unixepoch() WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND delivery=? AND fulfillment_status='DELIVERED')",
      ).bind(delivery[1], delivery[1], encrypted),
      env.DB.prepare(
        "UPDATE admin_alerts SET resolved_at=unixepoch() WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND delivery=? AND fulfillment_status='DELIVERED')",
      ).bind(delivery[1], delivery[1], encrypted),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "DELIVERY_ATTEMPT", delivery[1], "{}"),
    ]);
    if (!result[0].results.length)
      throw new HttpError(409, "Đơn chưa thanh toán hoặc đã giao");
    return json({ ok: true });
  }

  if (path === "/payment-config" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "auditor"]);
    return json(await paymentConfig(env));
  }

  if (path === "/payment-config" && request.method === "PUT") {
    requireRole(admin, ["owner"]);
    const body = await readBody(
      request,
      z.object({
        config: configSchema,
        expectedVersion: z.number().int().positive(),
      }),
    );
    if (
      body.config.enabled &&
      (!env.SEPAY_WEBHOOK_SECRET || !env.SEPAY_API_TOKEN)
    )
      throw new HttpError(
        409,
        "Cần cấu hình webhook secret và API đối soát trước khi bật nhận tiền",
      );
    const updated = await env.DB.batch([
      env.DB.prepare(
        "UPDATE settings SET body=?,version=version+1,updated_at=unixepoch() WHERE id='payment' AND version=? RETURNING version",
      ).bind(JSON.stringify(body.config), body.expectedVersion),
      env.DB.prepare(
        "DELETE FROM admin_commands WHERE result_id IN (SELECT id FROM approvals WHERE kind='PAYMENT_CONFIG' AND status='PENDING')",
      ),
      env.DB.prepare(
        "DELETE FROM approvals WHERE kind='PAYMENT_CONFIG' AND status='PENDING'",
      ),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "UPDATE_PAYMENT_CONFIG",
        "payment",
        JSON.stringify({ expectedVersion: body.expectedVersion }),
      ),
    ]);
    if (!updated[0].results.length)
      throw new HttpError(409, "Cấu hình đã cũ, vui lòng tải lại trang");
    return json(await paymentConfig(env));
  }

  if (path === "/wallet-adjustments" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const body = await readBody(
      request,
      z.object({
        userId: z.string().min(1).max(100),
        delta: z
          .number()
          .int()
          .min(-100000000)
          .max(100000000)
          .refine((n) => n !== 0),
        reason: z.string().min(5).max(300),
      }),
    );
    const journalId = id();
    const debitAccount = body.delta > 0 ? "adjustments" : `wallet:${body.userId}`;
    const creditAccount = body.delta > 0 ? `wallet:${body.userId}` : "adjustments";
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo) VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          journalId,
          `adjustment:${journalId}`,
          body.userId,
          "ADJUSTMENT",
          Math.abs(body.delta),
          body.delta,
          debitAccount,
          creditAccount,
          body.reason,
        ),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(
          id(),
          admin.email,
          "WALLET_ADJUSTMENT",
          body.userId,
          JSON.stringify({ journalId, delta: body.delta, reason: body.reason }),
        ),
      ]);
    } catch (error) {
      if (
        /INSUFFICIENT_BALANCE|LEDGER_MISMATCH|ACCOUNT_DISABLED|FOREIGN KEY|CHECK constraint/.test(
          String(error),
        )
      )
        throw new HttpError(
          409,
          "Không thể điều chỉnh số dư: khách hàng không tồn tại, đang bị khóa hoặc số dư không đủ",
        );
      throw error;
    }
    return json({ id: journalId, ok: true }, 201);
  }

  if (path === "/wallet-refunds" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const body = await readBody(
      request,
      z.object({
        orderId: z.string().min(1).max(100),
        reason: z.string().min(5).max(300),
      }),
    );
    const order = await env.DB.prepare(
      "SELECT o.id,o.user_id,o.total FROM orders o JOIN settlements s ON s.order_id=o.id WHERE o.id=? AND o.payment_status='PAID' AND s.source='WALLET'",
    )
      .bind(body.orderId)
      .first<{ id: string; user_id: string; total: number }>();
    if (!order)
      throw new HttpError(
        409,
        "Đơn hàng không tồn tại, chưa thanh toán bằng ví hoặc đã được hoàn tiền",
      );
    const journalId = id();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO journals(id,source,user_id,kind,amount,wallet_delta,debit_account,credit_account,memo) VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          journalId,
          `refund:${order.id}`,
          order.user_id,
          "REFUND",
          order.total,
          order.total,
          "sales",
          `wallet:${order.user_id}`,
          body.reason,
        ),
        env.DB.prepare(
          "UPDATE orders SET payment_status='REFUNDED' WHERE id=? AND payment_status='PAID'",
        ).bind(order.id),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(
          id(),
          admin.email,
          "WALLET_REFUND",
          order.id,
          JSON.stringify({ journalId, reason: body.reason }),
        ),
      ]);
    } catch (error) {
      if (
        /INSUFFICIENT_BALANCE|LEDGER_MISMATCH|ACCOUNT_DISABLED|UNIQUE|CHECK constraint/.test(
          String(error),
        )
      )
        throw new HttpError(
          409,
          "Không thể hoàn tiền đơn hàng này hoặc đơn đã được hoàn trước đó",
        );
      throw error;
    }
    return json({ id: journalId, ok: true }, 201);
  }

  if (path === "/approvals" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "auditor"]);
    const { results } = await env.DB.prepare(
      "SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100",
    ).all();
    return json({ approvals: results });
  }

  if (path === "/approvals" && request.method === "POST") {
    requireRole(admin, ["owner", "finance"]);
    const body = await readBody(
      request,
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("PAYMENT_CONFIG"),
          config: configSchema,
          expectedVersion: z.number().int().positive(),
        }),
        z.object({
          kind: z.literal("WALLET_ADJUSTMENT"),
          userId: z.string().min(1).max(100),
          delta: z
            .number()
            .int()
            .min(-100000000)
            .max(100000000)
            .refine((n) => n !== 0),
          reason: z.string().min(5).max(300),
        }),
        z.object({
          kind: z.literal("WALLET_REFUND"),
          orderId: z.string().min(1).max(100),
          reason: z.string().min(5).max(300),
        }),
      ]),
    );
    if (body.kind === "PAYMENT_CONFIG") {
      requireRole(admin, ["owner"]);
      if (
        body.config.enabled &&
        (!env.SEPAY_WEBHOOK_SECRET || !env.SEPAY_API_TOKEN)
      )
        throw new HttpError(
          409,
          "Cần cấu hình webhook secret và API đối soát trước khi bật nhận tiền",
        );
    }
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      throw new HttpError(400, "Thiếu idempotency key hợp lệ");
    const commandId = `${admin.email}:approvals:${key}`;
    const hash = await sha256(JSON.stringify(body));
    async function previous() {
      const result = await env.DB.prepare(
        "SELECT hash,result_id FROM admin_commands WHERE id=?",
      )
        .bind(commandId)
        .first<{ hash: string; result_id: string }>();
      if (result && result.hash !== hash)
        throw new HttpError(409, "Key đã dùng với nội dung khác");
      return result?.result_id;
    }
    const existing = await previous();
    if (existing) return json({ id: existing }, 201);
    const approvalId = id();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO approvals(id,kind,body,requested_by) VALUES(?,?,?,?)",
        ).bind(approvalId, body.kind, JSON.stringify(body), admin.email),
        env.DB.prepare(
          "INSERT INTO admin_commands(id,hash,result_id) VALUES(?,?,?)",
        ).bind(commandId, hash, approvalId),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(
          id(),
          admin.email,
          "REQUEST_APPROVAL",
          approvalId,
          JSON.stringify({ kind: body.kind }),
        ),
      ]);
    } catch (error) {
      const replay = await previous();
      if (replay) return json({ id: replay }, 201);
      throw error;
    }
    return json({ id: approvalId }, 201);
  }

  const approval = path.match(/^\/approvals\/([a-f0-9-]+)\/approve$/);
  if (approval && request.method === "POST") {
    requireRole(admin, ["owner", "finance"]);
    const item = await env.DB.prepare("SELECT * FROM approvals WHERE id=?")
      .bind(approval[1])
      .first<{ kind: string; requested_by: string; status: string }>();
    if (!item) throw new HttpError(404, "Không tìm thấy yêu cầu");
    if (item.kind === "PAYMENT_CONFIG") requireRole(admin, ["owner"]);
    if (item.requested_by === admin.email || item.status !== "PENDING")
      throw new HttpError(409, "Cần người thứ hai duyệt yêu cầu còn chờ");
    try {
      await env.DB.prepare(
        "UPDATE approvals SET status='APPROVED',approved_by=? WHERE id=?",
      )
        .bind(admin.email, approval[1])
        .run();
    } catch (error) {
      if (
        /STALE_CONFIG|APPROVAL_ALREADY_APPLIED|INSUFFICIENT_BALANCE|INVALID_REFUND|LEDGER_MISMATCH|CHECK constraint/.test(
          String(error),
        )
      )
        throw new HttpError(
          409,
          "Yêu cầu đã cũ, số dư không đủ hoặc trạng thái không hợp lệ",
        );
      throw error;
    }
    return json({ ok: true });
  }

  const cancelApproval = path.match(/^\/approvals\/([a-f0-9-]+)$/);
  if (cancelApproval && request.method === "DELETE") {
    requireRole(admin, ["owner", "finance"]);
    const item = await env.DB.prepare(
      "SELECT id,kind,status FROM approvals WHERE id=?",
    )
      .bind(cancelApproval[1])
      .first<{ id: string; kind: string; status: string }>();
    if (!item) throw new HttpError(404, "Không tìm thấy yêu cầu");
    if (item.status !== "PENDING")
      throw new HttpError(409, "Chỉ có thể hủy yêu cầu đang chờ duyệt");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_commands WHERE result_id=?").bind(
        cancelApproval[1],
      ),
      env.DB.prepare(
        "DELETE FROM approvals WHERE id=? AND status='PENDING'",
      ).bind(cancelApproval[1]),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "CANCEL_APPROVAL",
        cancelApproval[1],
        JSON.stringify({ kind: item.kind }),
      ),
    ]);
    return json({ ok: true });
  }

  const inboxAction = path.match(/^\/inbox\/([^/]+)(?:\/(retry))?$/);
  if (inboxAction) {
    requireRole(admin, ["owner", "finance"]);
    const inboxId = decodeURIComponent(inboxAction[1]);
    if (inboxAction[2] === "retry" && request.method === "POST") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM inbox_retries WHERE id=?").bind(inboxId),
        env.DB.prepare(
          "UPDATE inbox SET status='PENDING',error=NULL WHERE id=? AND status<>'DONE'",
        ).bind(inboxId),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(id(), admin.email, "INBOX_RETRY", inboxId, "{}"),
      ]);
      await sweep(env);
      return json({ ok: true });
    }
    if (!inboxAction[2] && request.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM inbox_retries WHERE id=?").bind(inboxId),
        env.DB.prepare("DELETE FROM inbox WHERE id=? AND status<>'DONE'").bind(
          inboxId,
        ),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
        ).bind(id(), admin.email, "INBOX_DISMISS", inboxId, "{}"),
      ]);
      return json({ ok: true });
    }
  }

  if (path === "/ledger" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "auditor"]);
    const { results } = await env.DB.prepare(
      "SELECT * FROM journals ORDER BY created_at DESC,id DESC LIMIT 100",
    ).all();
    const differences = await env.DB.prepare(
      "SELECT w.user_id,w.balance,COALESCE(SUM(j.wallet_delta),0) AS ledger_balance FROM wallets w LEFT JOIN journals j ON j.user_id=w.user_id GROUP BY w.user_id HAVING w.balance<>COALESCE(SUM(j.wallet_delta),0)",
    ).all();
    return json({ journals: results, differences: differences.results });
  }

  if (path === "/transactions" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "auditor"]);
    const [transactions, inbox, runs] = await Promise.all([
      env.DB.prepare(
        "SELECT * FROM bank_transactions ORDER BY happened_at DESC LIMIT 100",
      ).all(),
      env.DB.prepare(
        "SELECT id,provider,status,error,created_at FROM inbox WHERE status<>'DONE' ORDER BY created_at DESC LIMIT 100",
      ).all(),
      env.DB.prepare(
        "SELECT * FROM reconciliation_runs ORDER BY created_at DESC LIMIT 20",
      ).all(),
    ]);
    return json({
      transactions: transactions.results,
      inbox: inbox.results,
      runs: runs.results,
    });
  }

  if (path === "/reconcile" && request.method === "POST") {
    requireRole(admin, ["owner", "finance"]);
    const input = await readBody(
      request,
      z
        .object({
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
        })
        .refine((v) => !!v.from === !!v.to, "Cần cả ngày bắt đầu và kết thúc"),
    );
    await audit(env, admin.email, "RECONCILE", "sepay");
    return json(
      await reconcile(
        env,
        input.from && input.to
          ? {
              from: Math.floor(Date.parse(input.from) / 1000),
              to: Math.floor(Date.parse(input.to) / 1000),
            }
          : undefined,
      ),
    );
  }

  if (path === "/maintenance" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    await audit(env, admin.email, "SWEEP", "inbox-outbox");
    await sweep(env);
    return json({ ok: true });
  }

  if (path === "/pages" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT p.*,v.title,v.description,v.blocks FROM pages p JOIN page_versions v ON v.id=p.draft_id",
    ).all();
    return json({ pages: results });
  }

  if (path === "/pages" && request.method === "POST") {
    requireRole(admin, ["owner", "editor"]);
    const p = await readBody(request, pageSchema);
    const versionId = id();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO page_versions(id,slug,title,description,blocks,created_by) VALUES(?,?,?,?,?,?)",
      ).bind(
        versionId,
        p.slug,
        p.title,
        p.description,
        JSON.stringify(p.blocks),
        admin.email,
      ),
      env.DB.prepare(
        "INSERT INTO pages(slug,draft_id) VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET draft_id=excluded.draft_id",
      ).bind(p.slug, versionId),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "PAGE_DRAFT",
        p.slug,
        JSON.stringify({ versionId }),
      ),
    ]);
    return json({ id: versionId }, 201);
  }

  const page = path.match(/^\/pages\/([a-z0-9-]+)\/(publish|versions)$/);
  if (page && page[2] === "versions" && request.method === "GET")
    return json({
      versions: (
        await env.DB.prepare(
          "SELECT * FROM page_versions WHERE slug=? ORDER BY created_at DESC LIMIT 30",
        )
          .bind(page[1])
          .all()
      ).results,
    });

  if (page && page[2] === "publish" && request.method === "POST") {
    requireRole(admin, ["owner", "editor"]);
    const body = await readBody(
      request,
      z.object({ versionId: z.string().uuid() }),
    );
    if (
      !(await env.DB.prepare(
        "SELECT id FROM page_versions WHERE id=? AND slug=?",
      )
        .bind(body.versionId, page[1])
        .first())
    )
      throw new HttpError(404, "Không tìm thấy phiên bản");
    await env.DB.batch([
      env.DB.prepare("UPDATE pages SET published_id=? WHERE slug=?").bind(
        body.versionId,
        page[1],
      ),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "PAGE_PUBLISH", page[1], JSON.stringify(body)),
    ]);
    return json({ ok: true });
  }

  const pageDelete = path.match(/^\/pages\/([a-z0-9-]+)$/);
  if (pageDelete && request.method === "DELETE") {
    requireRole(admin, ["owner", "editor"]);
    const slug = pageDelete[1];
    if (slug === "trang-chu")
      throw new HttpError(409, "Không thể xóa trang chủ mặc định");
    if (
      !(await env.DB.prepare("SELECT slug FROM pages WHERE slug=?")
        .bind(slug)
        .first())
    )
      throw new HttpError(404, "Không tìm thấy trang");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM pages WHERE slug=?").bind(slug),
      env.DB.prepare("DELETE FROM page_versions WHERE slug=?").bind(slug),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "PAGE_DELETE", slug, "{}"),
    ]);
    return json({ ok: true });
  }

  if (path === "/audit" && request.method === "GET") {
    requireRole(admin, ["owner", "auditor"]);
    return json({
      events: (
        await env.DB.prepare(
          "SELECT * FROM audit ORDER BY created_at DESC,id DESC LIMIT 100",
        ).all()
      ).results,
    });
  }

  if (path === "/telegram/settings") {
    requireRole(admin, ["owner"]);
    if (request.method === "GET") {
      const [settings, config] = await Promise.all([
        env.DB.prepare("SELECT order_paid,order_delivered,order_partial,admin_alert FROM telegram_notification_settings WHERE id=1").first<{ order_paid: number; order_delivered: number; order_partial: number; admin_alert: number }>(),
        env.DB.prepare("SELECT telegram_chat_id FROM commerce_config WHERE id=1").first<{ telegram_chat_id: string }>(),
      ]);
      return json({
        adminChatId: config?.telegram_chat_id ?? "",
        orderPaid: Boolean(settings?.order_paid ?? 1),
        orderDelivered: Boolean(settings?.order_delivered ?? 1),
        orderPartial: Boolean(settings?.order_partial ?? 1),
        adminAlert: Boolean(settings?.admin_alert ?? 1),
      });
    }
    if (request.method === "PUT") {
      const input = await readBody(request, z.object({
        adminChatId: z.string().regex(/^$|^-?\d{1,25}$/),
        orderPaid: z.boolean(),
        orderDelivered: z.boolean(),
        orderPartial: z.boolean(),
        adminAlert: z.boolean(),
      }));
      await env.DB.batch([
        env.DB.prepare("UPDATE commerce_config SET telegram_chat_id=? WHERE id=1").bind(input.adminChatId),
        env.DB.prepare("UPDATE telegram_notification_settings SET order_paid=?,order_delivered=?,order_partial=?,admin_alert=? WHERE id=1").bind(Number(input.orderPaid), Number(input.orderDelivered), Number(input.orderPartial), Number(input.adminAlert)),
        env.DB.prepare("INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)").bind(id(), admin.email, "TELEGRAM_SETTINGS", "telegram", JSON.stringify(input)),
      ]);
      return json({ ok: true });
    }
  }

  if (path === "/telegram/test" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const config = await env.DB.prepare("SELECT telegram_chat_id FROM commerce_config WHERE id=1").first<{ telegram_chat_id: string }>();
    if (!config?.telegram_chat_id) throw new HttpError(400, "Hãy lưu Chat ID quản trị trước khi gửi thử");
    await telegramCall(env, "sendMessage", { chat_id: config.telegram_chat_id, text: "Tiệm Digital · Kết nối thông báo quản trị hoạt động." });
    await audit(env, admin.email, "TELEGRAM_TEST", "telegram");
    return json({ ok: true });
  }

  if (path === "/telegram/send" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const input = await readBody(request, z.object({ text: z.string().trim().min(1).max(4096) }));
    const config = await env.DB.prepare("SELECT telegram_chat_id FROM commerce_config WHERE id=1").first<{ telegram_chat_id: string }>();
    if (!config?.telegram_chat_id) throw new HttpError(400, "Hãy lưu Chat ID quản trị trước khi gửi");
    await telegramCall(env, "sendMessage", { chat_id: config.telegram_chat_id, text: input.text });
    await audit(env, admin.email, "TELEGRAM_MESSAGE_SENT", "telegram", { length: input.text.length });
    return json({ ok: true });
  }

  if (path === "/telegram/webhook" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    if (!env.TELEGRAM_WEBHOOK_SECRET) throw new HttpError(400, "Thiếu TELEGRAM_WEBHOOK_SECRET");
    await telegramCall(env, "setMyCommands", { commands: [
      { command: "start", description: "Mở cửa hàng" },
      { command: "products", description: "Xem và mua sản phẩm" },
      { command: "profile", description: "Tài khoản và số dư" },
      { command: "orders", description: "Theo dõi đơn hàng" },
      { command: "topup", description: "Nạp tiền bằng QR" },
      { command: "support", description: "Liên hệ hỗ trợ" },
    ] });
    await telegramCall(env, "setWebhook", { url: `${env.APP_ORIGIN.replace(/\/$/, "")}/webhooks/telegram`, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] });
    await audit(env, admin.email, "TELEGRAM_WEBHOOK_SET", "telegram");
    return json({ ok: true });
  }

  if (path === "/telegram/webhook-info" && request.method === "GET") {
    requireRole(admin, ["owner"]);
    const response = await telegramCall(env, "getWebhookInfo", {}) as { result?: { url?: string; pending_update_count?: number; last_error_message?: string } };
    return json({ url: response.result?.url ?? "", pending: response.result?.pending_update_count ?? 0, lastError: response.result?.last_error_message ?? "" });
  }

  if (path === "/status" && request.method === "GET") {
    return json({
      environment: env.ENVIRONMENT,
      bankWebhook: !!env.SEPAY_WEBHOOK_SECRET,
      reconciliation: !!env.SEPAY_API_TOKEN,
      telegram: !!env.TELEGRAM_BOT_TOKEN,
      telegramWebhook: !!env.TELEGRAM_WEBHOOK_SECRET,
      telegramUsername: env.TELEGRAM_BOT_USERNAME ?? null,
      encryption: !!env.DELIVERY_KEY,
      email: !!env.EMAIL,
      queue: !!env.EVENTS,
      outbox: (
        await env.DB.prepare(
          "SELECT id,kind,status,attempts,error,created_at FROM outbox WHERE status<>'DONE' ORDER BY created_at LIMIT 100",
        ).all()
      ).results,
    });
  }

  const retryOutbox = path.match(/^\/outbox\/(.+)\/retry$/);
  if (retryOutbox && request.method === "POST") {
    requireRole(admin, ["owner", "support"]);
    const eventId = decodeURIComponent(retryOutbox[1]);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE outbox SET status='PENDING',attempts=0,next_attempt=unixepoch(),error=NULL WHERE id=? AND status<>'DONE'",
      ).bind(eventId),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "OUTBOX_RETRY", eventId, "{}"),
    ]);
    return json({ ok: true });
  }

  throw new HttpError(404, "Không tìm thấy chức năng admin");
}
