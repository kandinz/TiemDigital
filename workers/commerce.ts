import { z } from "zod";
import type { Actor, Env, StoredOrder } from "./types";
import { HttpError, id, readBody, sha256 } from "./http";

export const customerSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.email(),
  phone: z.string().max(30).default(""),
  note: z.string().max(500).default(""),
});
const orderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
  customer: customerSchema,
  promoCode: z.string().max(40).optional(),
});
export async function command(
  request: Request,
  env: Env,
  actor: Actor,
  scope: string,
  input: unknown,
) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    throw new HttpError(400, "Thiếu idempotency key hợp lệ");
  const commandId = `${actor.id}:${scope}:${key}`;
  const hash = await sha256(JSON.stringify(input));
  const previous = await env.DB.prepare(
    "SELECT hash,result_id FROM commands WHERE id=?",
  )
    .bind(commandId)
    .first<{ hash: string; result_id: string }>();
  if (previous && previous.hash !== hash)
    throw new HttpError(409, "Key đã dùng với nội dung khác");
  return { id: commandId, hash, previous: previous?.result_id };
}
export function commandStatement(
  env: Env,
  actor: Actor,
  cmd: { id: string; hash: string },
  result: string,
) {
  return env.DB.prepare(
    "INSERT INTO commands(id,user_id,hash,result_id) VALUES(?,?,?,?)",
  ).bind(cmd.id, actor.id, cmd.hash, result);
}
export async function orderFor(env: Env, orderId: string, actor: Actor) {
  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE id=? AND user_id=?",
  )
    .bind(orderId, actor.id)
    .first<StoredOrder>();
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  return order;
}
export function serializeOrder(order: StoredOrder) {
  const { items, customer, delivery: _delivery, ...fields } = order;
  return {
    ...fields,
    items: JSON.parse(items),
    customer: JSON.parse(customer),
  };
}
export async function createOrder(
  request: Request,
  env: Env,
  actor: Actor,
  channel: "web" | "telegram" = "web",
) {
  const input = await readBody(request, orderSchema);
  const scope = channel === "web" ? "order" : "order:telegram";
  const cmd = await command(request, env, actor, scope, input);
  if (cmd.previous)
    return serializeOrder(await orderFor(env, cmd.previous, actor));
  if (input.promoCode)
    throw new HttpError(
      400,
      "Mã ưu đãi chưa được kích hoạt trên hệ thống thanh toán",
    );
  const items = await pricedItems(env, input.items);
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const orderId = `TD${crypto.randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO orders(id,user_id,channel,currency,total,items,customer) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        orderId,
        actor.id,
        channel,
        "VND",
        total,
        JSON.stringify(items),
        JSON.stringify({ ...input.customer, email: actor.email }),
      ),
      commandStatement(env, actor, cmd, orderId),
    ]);
  } catch (error) {
    const retry = await command(request, env, actor, scope, input);
    if (retry.previous)
      return serializeOrder(await orderFor(env, retry.previous, actor));
    throw error;
  }
  return serializeOrder(await orderFor(env, orderId, actor));
}
export async function pricedItems(
  env: Env,
  requested: { productId: number; quantity: number }[],
) {
  const merged = new Map<number, number>();
  for (const item of requested)
    merged.set(
      item.productId,
      (merged.get(item.productId) ?? 0) + item.quantity,
    );
  const result = [];
  for (const [productId, quantity] of merged) {
    if (quantity > 20) throw new HttpError(400, "Số lượng vượt giới hạn");
    const product = await env.DB.prepare(
      "SELECT * FROM products WHERE id=? AND in_stock=1",
    )
      .bind(productId)
      .first<{
        id: number;
        name: string;
        selling_price: number;
      }>();
    const price = product?.selling_price;
    if (!product || !price)
      throw new HttpError(409, "Sản phẩm chưa sẵn sàng để bán trên kênh này");
    result.push({ productId, name: product.name, price, quantity });
  }
  return result;
}
export async function walletFor(env: Env, actor: Actor) {
  const wallet = await env.DB.prepare(
    "SELECT balance FROM wallets WHERE user_id=?",
  )
    .bind(actor.id)
    .first<{ balance: number }>();
  return { balance: wallet?.balance ?? 0, currency: "VND" as const };
}
export async function payWallet(
  request: Request,
  env: Env,
  actor: Actor,
  orderId: string,
) {
  const order = await orderFor(env, orderId, actor);
  const cmd = await command(request, env, actor, `pay:${orderId}`, {});
  if (cmd.previous) return serializeOrder(await orderFor(env, orderId, actor));
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settlements(id,order_id,source) VALUES(?,?,?)",
      ).bind(id(), orderId, "WALLET"),
      commandStatement(env, actor, cmd, orderId),
    ]);
  } catch (error) {
    const retry = await command(request, env, actor, `pay:${orderId}`, {});
    if (retry.previous)
      return serializeOrder(await orderFor(env, orderId, actor));
    if (
      /INSUFFICIENT_BALANCE|ORDER_ALREADY_PAID|UNIQUE constraint|INVALID_PAYMENT_METHOD|ACCOUNT_DISABLED|LEDGER_MISMATCH/.test(
        String(error),
      )
    )
      throw new HttpError(409, "Số dư không đủ hoặc đơn đã thanh toán");
    throw error;
  }
  return serializeOrder({
    ...order,
    payment_status: "PAID",
    fulfillment_status: "QUEUED",
  });
}
