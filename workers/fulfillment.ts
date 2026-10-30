import { z } from "zod";
import type { Admin, Env, StoredOrder } from "./types";
import { audit, HttpError, json, now, readBody } from "./http";
import { requireRole } from "./auth";
import { decryptDelivery, encryptDelivery } from "./delivery";
import { createD1Stores } from "./mmo/services/mmoStores";
import { openSession } from "./mmo/services/providerSession";
import { placeOrder } from "./mmo/services/orderLedger";
import { updateSupplierProduct } from "./catalog";

interface Fulfillment {
  id: string;
  order_id: string;
  product_id: number;
  name: string;
  quantity: number;
  price: number;
  source: string;
  provider_id: string | null;
  provider_product_id: string | null;
  status: string;
  reason: string | null;
  delivery: string | null;
  delivered_quantity: number;
  purchase_order_id: string | null;
  cost_vnd: number;
  attempts: number;
}
export async function orderProgress(env: Env, order: StoredOrder) {
  const { delivery: _private, items, customer, ...publicOrder } = order;
  const { results } = await env.DB.prepare(
    "SELECT product_id,name,quantity,status,reason,delivered_quantity FROM fulfillments WHERE order_id=? ORDER BY product_id",
  )
    .bind(order.id)
    .all<{ product_id: number; status: string; delivered_quantity: number }>();
  let status = order.fulfillment_status;
  if (status !== "DELIVERED" && results.length) {
    if (results.every((v) => v.status === "DELIVERED")) status = "DELIVERED";
    else if (results.some((v) => v.delivered_quantity > 0)) status = "PARTIAL";
    else if (
      results.some((v) => v.status === "REVIEW" || v.status === "AWAITING")
    )
      status = "REVIEW";
  }
  return {
    ...publicOrder,
    items: JSON.parse(items),
    customer: JSON.parse(customer),
    fulfillment_status: status,
    fulfillments: results,
  };
}
export async function receivedDelivery(env: Env, order: StoredOrder) {
  if (order.payment_status !== "PAID")
    throw new HttpError(409, "Đơn chưa thanh toán");
  if (order.delivery)
    return { value: await decryptDelivery(env, order.id, order.delivery) };
  const { results } = await env.DB.prepare(
    "SELECT id,name,delivery FROM fulfillments WHERE order_id=? AND delivery IS NOT NULL ORDER BY product_id",
  )
    .bind(order.id)
    .all<{ id: string; name: string; delivery: string }>();
  if (!results.length) throw new HttpError(409, "Sản phẩm đang được chuẩn bị");
  const values = await Promise.all(
    results.map(
      async (f) => `${f.name}\n${await decryptDelivery(env, f.id, f.delivery)}`,
    ),
  );
  return { value: values.join("\n\n") };
}
async function alert(
  env: Env,
  f: Fulfillment,
  reason: string,
  awaiting = false,
) {
  const alertId = `${f.id}:${f.attempts}:${reason}`;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE fulfillments SET status=?,reason=?,updated_at=unixepoch() WHERE id=? AND attempts=? AND status<>'DELIVERED'",
    ).bind(awaiting ? "AWAITING" : "REVIEW", reason, f.id, f.attempts),
    env.DB.prepare(
      "INSERT OR IGNORE INTO admin_alerts(id,order_id,fulfillment_id,reason) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM fulfillments WHERE id=? AND attempts=?)",
    ).bind(alertId, f.order_id, f.id, reason, f.id, f.attempts),
    env.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,user_id,kind,body) SELECT ?,user_id,'ADMIN_ALERT',? FROM orders WHERE id=? AND EXISTS(SELECT 1 FROM admin_alerts WHERE id=? AND resolved_at IS NULL)",
    ).bind(
      `admin:${alertId}`,
      JSON.stringify({ orderId: f.order_id, alertId, reason }),
      f.order_id,
      alertId,
    ),
  ]);
}
async function finish(
  env: Env,
  f: Fulfillment,
  values: string[],
  cost: number,
  purchaseId: string | null,
) {
  const delivery = await encryptDelivery(env, f.id, JSON.stringify(values));
  const complete = values.length >= f.quantity;
  const result = await env.DB.batch([
    env.DB.prepare(
      "UPDATE fulfillments SET status=?,delivery=?,delivered_quantity=?,cost_vnd=?,purchase_order_id=?,reason=NULL,updated_at=unixepoch() WHERE id=? AND status='PROCESSING' AND attempts=?",
    ).bind(
      complete ? "DELIVERED" : "AWAITING",
      delivery,
      Math.min(f.quantity, values.length),
      cost,
      purchaseId,
      f.id,
      f.attempts,
    ),
    env.DB.prepare(
      "UPDATE admin_alerts SET resolved_at=unixepoch() WHERE fulfillment_id=? AND resolved_at IS NULL AND EXISTS(SELECT 1 FROM fulfillments WHERE id=? AND delivery=?)",
    ).bind(f.id, f.id, delivery),
    env.DB.prepare(
      "UPDATE orders SET fulfillment_status='DELIVERED' WHERE id=? AND payment_status='PAID' AND NOT EXISTS(SELECT 1 FROM fulfillments WHERE order_id=? AND status<>'DELIVERED') AND EXISTS(SELECT 1 FROM fulfillments WHERE id=? AND delivery=?)",
    ).bind(f.order_id, f.order_id, f.id, delivery),
    env.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,user_id,kind,body) SELECT ?,user_id,'ORDER_PARTIAL',? FROM orders WHERE id=? AND fulfillment_status<>'DELIVERED' AND EXISTS(SELECT 1 FROM fulfillments WHERE id=? AND delivery=?)",
    ).bind(
      `partial:${f.id}`,
      JSON.stringify({ orderId: f.order_id }),
      f.order_id,
      f.id,
      delivery,
    ),
  ]);
  if (!result[0].meta.changes) return;
  if (!complete) await alert(env, f, "NCC_PARTIAL_DELIVERY", true);
}
async function fulfill(env: Env, candidate: Fulfillment) {
  // For local stock, a later payment cannot claim while an earlier paid task
  // for this product is queued/running, even if queue events arrive out of order.
  const f = await env.DB.prepare(
    `UPDATE fulfillments SET status='PROCESSING',attempts=attempts+1,started_at=?,updated_at=? WHERE id=? AND status='QUEUED' AND EXISTS(SELECT 1 FROM orders WHERE id=fulfillments.order_id AND payment_status='PAID' AND fulfillment_status<>'DELIVERED') AND NOT EXISTS(SELECT 1 FROM fulfillments earlier JOIN settlements es ON es.order_id=earlier.order_id JOIN settlements current ON current.order_id=fulfillments.order_id WHERE earlier.product_id=fulfillments.product_id AND earlier.source='stock' AND earlier.status IN('QUEUED','PROCESSING') AND es.rowid<current.rowid) RETURNING *`,
  )
    .bind(now(), now(), candidate.id)
    .first<Fulfillment>();
  if (!f) return;
  try {
    if (f.source === "stock") {
      const assigned = await env.DB.prepare(
        "SELECT id,payload FROM product_inventory WHERE fulfillment_id=? ORDER BY created_at,id",
      )
        .bind(f.id)
        .all<{ id: string; payload: string }>();
      const { results } = assigned.results.length
        ? assigned
        : await env.DB.prepare(
            "UPDATE product_inventory SET fulfillment_id=? WHERE id IN(SELECT id FROM product_inventory WHERE product_id=? AND fulfillment_id IS NULL ORDER BY created_at,id LIMIT ?) AND (SELECT COUNT(*) FROM product_inventory WHERE product_id=? AND fulfillment_id IS NULL)>=? RETURNING id,payload",
          )
            .bind(f.id, f.product_id, f.quantity, f.product_id, f.quantity)
            .all<{ id: string; payload: string }>();
      if (results.length !== f.quantity) {
        await alert(env, f, "STOCK_EXHAUSTED");
        return;
      }
      const values = await Promise.all(
        results.map((i) => decryptDelivery(env, i.id, i.payload)),
      );
      await finish(env, f, values, 0, null);
      return;
    }
    if (!f.provider_id || !f.provider_product_id) {
      await alert(env, f, "SOURCE_MISSING");
      return;
    }
    const stores = createD1Stores(env);
    const session = await openSession(stores.providers, f.provider_id);
    if (!session.provider.is_active) {
      await alert(env, f, "PROVIDER_INACTIVE");
      return;
    }
    const item = (await session.fetchProducts()).find(
      (p) => p.provider_product_id === f.provider_product_id,
    );
    if (!item || !item.in_stock) {
      await alert(env, f, "NCC_OUT_OF_STOCK");
      return;
    }
    const cost = await updateSupplierProduct(
      env,
      f.provider_id,
      item,
      session.usdRate,
    );
    if (cost > f.price) {
      await alert(env, f, "COST_EXCEEDS_PAID_PRICE");
      return;
    }
    const order = await env.DB.prepare(
      "SELECT user_id,customer FROM orders WHERE id=?",
    )
      .bind(f.order_id)
      .first<{ user_id: string; customer: string }>();
    if (!order) throw new Error("ORDER_MISSING");
    // The durable PROCESSING claim precedes the external charge. No automatic
    // retry is allowed after this call, including a crash after supplier success.
    const outcome = await placeOrder(session, stores.orders, order.user_id, {
      provider_id: f.provider_id,
      product_id: f.provider_product_id,
      product_name: f.name,
      quantity: f.quantity,
      unit_price: item.price_usd,
      total_price: item.price_usd * f.quantity,
      email: JSON.parse(order.customer).email,
    });
    if (!outcome.ok) {
      await alert(env, f, "NCC_PURCHASE_FAILED");
      return;
    }
    const saved = await env.DB.prepare(
      "UPDATE fulfillments SET purchase_order_id=?,cost_vnd=? WHERE id=? AND attempts=? AND status='PROCESSING'",
    )
      .bind(outcome.order_id, cost * f.quantity, f.id, f.attempts)
      .run();
    if (!saved.meta.changes) return;
    if (!outcome.delivered_items.length) {
      await alert(env, f, "NCC_AWAITING_DELIVERY", true);
      return;
    }
    await finish(
      env,
      f,
      outcome.delivered_items,
      cost * f.quantity,
      outcome.order_id,
    );
    if (!outcome.persisted) {
      // Delivery itself is durably saved above; alert on the missing import ledger.
      await alert(env, f, "NCC_LEDGER_REVIEW");
    }
  } catch {
    await alert(
      env,
      f,
      f.source === "provider"
        ? "NCC_RESULT_UNCERTAIN"
        : "STOCK_DELIVERY_REVIEW",
    );
  }
}
export async function fulfillPaidOrders(env: Env) {
  const stale = await env.DB.prepare(
    "SELECT * FROM fulfillments WHERE status='PROCESSING' AND started_at<?",
  )
    .bind(now() - 300)
    .all<Fulfillment>();
  for (const f of stale.results) await alert(env, f, "RESULT_UNCERTAIN");
  const queue = await env.DB.prepare(
    "SELECT f.* FROM fulfillments f JOIN settlements s ON s.order_id=f.order_id JOIN orders o ON o.id=f.order_id WHERE f.status='QUEUED' AND o.payment_status='PAID' AND o.fulfillment_status<>'DELIVERED' ORDER BY s.rowid,f.product_id LIMIT 50",
  ).all<Fulfillment>();
  for (const f of queue.results) await fulfill(env, f);
}

export async function fulfillmentAdmin(
  request: Request,
  env: Env,
  admin: Admin,
  path: string,
): Promise<Response | null> {
  if (path === "/commerce-report" && request.method === "GET") {
    requireRole(admin, ["owner", "finance", "auditor"]);
    const revenue = await env.DB.prepare(
      "SELECT COALESCE(SUM(total),0) AS revenue FROM orders WHERE payment_status='PAID'",
    ).first<{ revenue: number }>();
    const fulfillment = await env.DB.prepare(
      "SELECT COALESCE(SUM(f.cost_vnd*1.0*f.delivered_quantity/f.quantity),0) AS cost,COALESCE(SUM(f.price*f.delivered_quantity-f.cost_vnd*1.0*f.delivered_quantity/f.quantity),0) AS profit FROM fulfillments f JOIN orders o ON o.id=f.order_id WHERE o.payment_status='PAID'",
    ).first<{ cost: number; profit: number }>();
    const review = await env.DB.prepare(
      "SELECT COUNT(DISTINCT order_id) AS review FROM admin_alerts WHERE resolved_at IS NULL",
    ).first<{ review: number }>();
    return json({ ...revenue, ...fulfillment, ...review });
  }
  if (path === "/fulfillment-alerts" && request.method === "GET") {
    requireRole(admin, ["owner", "support", "auditor"]);
    return json({
      alerts: (
        await env.DB.prepare(
          "SELECT a.*,f.name,f.status,f.quantity,f.delivered_quantity,f.purchase_order_id,f.attempts FROM admin_alerts a JOIN fulfillments f ON f.id=a.fulfillment_id WHERE a.resolved_at IS NULL ORDER BY a.created_at DESC LIMIT 100",
        ).all()
      ).results,
    });
  }
  const acknowledge = path.match(
    /^\/fulfillment-alerts\/([^/]+)\/acknowledge$/,
  );
  if (acknowledge && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const { reason } = await readBody(
      request,
      z.object({ reason: z.string().trim().min(5).max(500) }),
    );
    const result = await env.DB.prepare(
      "UPDATE admin_alerts SET resolved_at=unixepoch() WHERE id=? AND resolved_at IS NULL AND EXISTS(SELECT 1 FROM fulfillments f WHERE f.id=admin_alerts.fulfillment_id AND f.status='DELIVERED') RETURNING id",
    )
      .bind(decodeURIComponent(acknowledge[1]))
      .first();
    if (!result)
      throw new HttpError(
        409,
        "Cần hoàn thành giao hàng trước khi đóng cảnh báo",
      );
    await audit(
      env,
      admin.email,
      "FULFILLMENT_ALERT_ACKNOWLEDGE",
      decodeURIComponent(acknowledge[1]),
      { reason },
    );
    return json({ ok: true });
  }
  const match = path.match(/^\/fulfillments\/([^/]+)\/(resolve|retry)$/);
  if (match && request.method === "POST") {
    requireRole(admin, ["owner"]);
    const f = await env.DB.prepare("SELECT * FROM fulfillments WHERE id=?")
      .bind(decodeURIComponent(match[1]))
      .first<Fulfillment>();
    if (!f || !["REVIEW", "AWAITING"].includes(f.status))
      throw new HttpError(409, "Đơn không ở trạng thái cần xử lý");
    if (match[2] === "retry") {
      const input = await readBody(
        request,
        z.object({
          confirmedNoPurchase: z.literal(true),
          expectedAttempt: z.number().int().positive(),
          reason: z.string().trim().min(5).max(500),
        }),
      );
      if (input.expectedAttempt !== f.attempts)
        throw new HttpError(
          409,
          "Lần thực hiện đã thay đổi; đối soát lại trước khi thử lại",
        );
      if (f.delivered_quantity || f.delivery)
        throw new HttpError(
          409,
          "Đơn đã giao một phần; bổ sung dữ liệu thay vì mua lại toàn bộ",
        );
      const claim = await env.DB.batch([
        env.DB.prepare(
          "UPDATE fulfillments SET status='QUEUED',reason=NULL,updated_at=unixepoch() WHERE id=? AND status=? AND attempts=? RETURNING id",
        ).bind(f.id, f.status, input.expectedAttempt),
        env.DB.prepare(
          "INSERT INTO audit(id,actor,action,target,detail) SELECT ?,?,?,?,? WHERE changes()=1",
        ).bind(
          crypto.randomUUID(),
          admin.email,
          "FULFILLMENT_RETRY",
          f.id,
          JSON.stringify(input),
        ),
      ]);
      if (!claim[0].results.length)
        throw new HttpError(409, "Lần thực hiện đã thay đổi; tải lại cảnh báo");
      await fulfillPaidOrders(env);
    } else {
      const { values, reason, expectedAttempt } = await readBody(
        request,
        z.object({
          values: z.array(z.string().trim().min(1).max(10000)).min(1).max(20),
          reason: z.string().trim().min(5).max(500),
          expectedAttempt: z.number().int().positive(),
        }),
      );
      if (expectedAttempt !== f.attempts)
        throw new HttpError(409, "Lần thực hiện đã thay đổi; tải lại cảnh báo");
      const previous = f.delivery
        ? (JSON.parse(await decryptDelivery(env, f.id, f.delivery)) as string[])
        : [];
      if (previous.length + values.length !== f.quantity)
        throw new HttpError(
          400,
          "Số dữ liệu bổ sung phải đủ số lượng còn thiếu",
        );
      const claimed = await env.DB.prepare(
        "UPDATE fulfillments SET status='PROCESSING',attempts=attempts+1,started_at=? WHERE id=? AND status=? AND attempts=? AND EXISTS(SELECT 1 FROM orders WHERE id=fulfillments.order_id AND payment_status='PAID') RETURNING *",
      )
        .bind(now(), f.id, f.status, expectedAttempt)
        .first<Fulfillment>();
      if (!claimed)
        throw new HttpError(
          409,
          "Đơn đã được xử lý hoặc không còn thanh toán hợp lệ",
        );
      await finish(
        env,
        claimed,
        [...previous, ...values],
        f.cost_vnd,
        f.purchase_order_id,
      );
      await audit(env, admin.email, "FULFILLMENT_RESOLVE", f.id, {
        reason,
        added: values.length,
      });
    }
    return json({ ok: true });
  }
  return null;
}
