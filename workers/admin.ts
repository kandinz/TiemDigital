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
} from "./http";
import { configSchema, paymentConfig, reconcile } from "./payments";
import { serializeOrder } from "./commerce";
import { encryptDelivery } from "./delivery";
import { sha256 } from "./http";
import { sweep } from "./operations";
import { mmoApi } from './mmo';

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
const productSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(150),
  description: z.string().max(10000),
  category: z.string().min(1).max(80),
  selling_price: z.number().int().min(1000).max(100000000),
  in_stock: z.boolean(),
  image_url: z
    .union([z.literal(""), z.url().refine((s) => s.startsWith("https://"))])
    .default(""),
});

export async function adminApi(request: Request, env: Env) {
  const admin = await administrator(request, env);
  checkOrigin(request, env, true);
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/admin".length);
  if (path === '/mmo' || path.startsWith('/mmo/')) {
    requireRole(admin, ['owner']);
    if (!['GET', 'HEAD'].includes(request.method))
      await audit(env, admin.email, 'MMO_REQUEST', path, { method: request.method });
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
    const { results } = await env.DB.prepare(
      "SELECT u.id,u.name,u.email,COALESCE(c.disabled,0) AS disabled,COALESCE(w.balance,0) AS balance FROM user u LEFT JOIN customers c ON c.id=u.id LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.createdAt DESC LIMIT 100",
    ).all();
    return json({ customers: results });
  }
  const lock = path.match(/^\/customers\/([^/]+)\/lock$/);
  if (lock && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const body = await readBody(
      request,
      z.object({ disabled: z.boolean(), reason: z.string().min(5).max(300) }),
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO customers(id,disabled) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET disabled=excluded.disabled",
      ).bind(lock[1], Number(body.disabled)),
      env.DB.prepare("DELETE FROM session WHERE userId=?").bind(lock[1]),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(id(), admin.email, "CUSTOMER_LOCK", lock[1], JSON.stringify(body)),
    ]);
    return json({ ok: true });
  }
  if (path === "/orders" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "support", "auditor"]);
    const { results } = await env.DB.prepare(
      "SELECT * FROM orders ORDER BY created_at DESC,id DESC LIMIT 100",
    ).all<StoredOrder>();
    return json({ orders: results.map(serializeOrder) });
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
        "UPDATE orders SET delivery=?,fulfillment_status='DELIVERED' WHERE id=? AND payment_status='PAID' AND fulfillment_status='QUEUED' RETURNING id",
      ).bind(encrypted, delivery[1]),
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
  if (path === "/products" && request.method === "GET")
    return json({
      products: (
        await env.DB.prepare(
          "SELECT id,name,description,category,image_url,selling_price,in_stock,updated_at FROM products ORDER BY id DESC",
        ).all()
      ).results,
    });
  if (path === "/products" && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const p = await readBody(request, productSchema);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO products(id,name,description,category,image_url,selling_price,in_stock,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,image_url=excluded.image_url,selling_price=excluded.selling_price,in_stock=excluded.in_stock,updated_at=excluded.updated_at",
      ).bind(
        p.id,
        p.name,
        p.description,
        p.category,
        p.image_url || null,
        p.selling_price,
        Number(p.in_stock),
        new Date().toISOString(),
      ),
      env.DB.prepare(
        "INSERT INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      ).bind(
        id(),
        admin.email,
        "PRODUCT_SAVE",
        String(p.id),
        JSON.stringify({ priceVnd: p.selling_price }),
      ),
    ]);
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
