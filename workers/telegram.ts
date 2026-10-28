import { z } from "zod";
import type { Actor, Env, StoredOrder } from "./types";
import { HttpError, id, json, limitedText, now, sha256 } from "./http";
import { pricedItems } from "./commerce";

export async function telegramCall(env: Env, method: string, body: unknown) {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new HttpError(503, "Bot chưa được cấu hình");
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    },
  );
  const result = (await response.json()) as {
    ok: boolean;
    parameters?: { retry_after?: number };
  };
  if (!response.ok || !result.ok)
    throw new HttpError(
      502,
      `TELEGRAM_${response.status}${result.parameters?.retry_after ? `_RETRY_${result.parameters.retry_after}` : ""}`,
    );
  return result;
}
async function sendText(env: Env, chatId: string, text: string, extra = {}) {
  return telegramCall(env, "sendMessage", { chat_id: chatId, text, ...extra });
}
export async function createLink(env: Env, actor: Actor) {
  if (
    !env.TELEGRAM_BOT_USERNAME ||
    !/^[a-zA-Z0-9_]+$/.test(env.TELEGRAM_BOT_USERNAME)
  )
    throw new HttpError(503, "Bot chưa được cấu hình");
  const token = crypto.randomUUID().replaceAll("-", "");
  await env.DB.prepare(
    "INSERT INTO link_challenges(id,user_id,expires_at) VALUES(?,?,?)",
  )
    .bind(await sha256(token), actor.id, now() + 300)
    .run();
  return {
    token,
    url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`,
    expiresAt: now() + 300,
  };
}
const tgUser = z.object({ id: z.number().int().positive() });
const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      from: tgUser,
      chat: z.object({ id: z.number().int(), type: z.string() }),
      text: z.string().optional(),
      successful_payment: z
        .object({
          currency: z.string(),
          total_amount: z.number().int(),
          invoice_payload: z.string(),
          telegram_payment_charge_id: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: tgUser,
      data: z.string().optional(),
      message: z
        .object({ chat: z.object({ id: z.number().int(), type: z.string() }) })
        .optional(),
    })
    .optional(),
  pre_checkout_query: z
    .object({
      id: z.string(),
      from: tgUser,
      currency: z.string(),
      total_amount: z.number().int(),
      invoice_payload: z.string(),
    })
    .optional(),
});
export async function telegramWebhook(request: Request, env: Env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET)
    throw new HttpError(503, "Webhook bot chưa cấu hình");
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  // Compare fixed-size digests through WebCrypto rather than a variable-length string comparison.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET),
  );
  if (
    !supplied ||
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      expected,
      new TextEncoder().encode(supplied),
    ))
  )
    throw new HttpError(401, "Webhook bot không hợp lệ");
  const raw = await limitedText(request, 65536);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON không hợp lệ");
  }
  const result = telegramUpdateSchema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Telegram update không hợp lệ");
  const inboxId = `telegram:${result.data.update_id}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO inbox(id,provider,payload) VALUES(?,?,?)",
  )
    .bind(inboxId, "telegram", raw)
    .run();
  await processTelegramInbox(env, inboxId);
  return json({ ok: true });
}
async function linked(env: Env, telegramId: number) {
  return env.DB.prepare(
    "SELECT l.user_id,l.chat_id FROM telegram_links l LEFT JOIN customers c ON c.id=l.user_id WHERE l.telegram_id=? AND COALESCE(c.disabled,0)=0",
  )
    .bind(String(telegramId))
    .first<{ user_id: string; chat_id: string }>();
}
export async function processTelegramInbox(env: Env, inboxId: string) {
  const inbox = await env.DB.prepare(
    "SELECT payload,status,created_at FROM inbox WHERE id=?",
  )
    .bind(inboxId)
    .first<{ payload: string; status: string; created_at: number }>();
  if (!inbox || inbox.status !== "PENDING") return;
  const update = telegramUpdateSchema.parse(JSON.parse(inbox.payload));
  const checkout = update.pre_checkout_query;
  if (
    (checkout && now() - inbox.created_at > 8) ||
    (update.callback_query && now() - inbox.created_at > 60)
  ) {
    await env.DB.prepare(
      "UPDATE inbox SET status='DONE',error='INTERACTIVE_QUERY_EXPIRED' WHERE id=?",
    )
      .bind(inboxId)
      .run();
    return;
  }
  if (checkout) {
    const link = await linked(env, checkout.from.id);
    const order = await env.DB.prepare(
      "SELECT * FROM orders WHERE id=? AND user_id=?",
    )
      .bind(checkout.invoice_payload, link?.user_id ?? "")
      .first<StoredOrder>();
    let valid =
      !!order &&
      order.payment_status === "UNPAID" &&
      order.currency === "XTR" &&
      order.channel === "telegram" &&
      checkout.currency === "XTR" &&
      checkout.total_amount === order.total &&
      order.created_at + 900 > now();
    if (valid && order) {
      try {
        const items = JSON.parse(order.items) as {
          productId: number;
          quantity: number;
          price: number;
        }[];
        const current = await pricedItems(env, items, "XTR");
        valid =
          current.reduce((sum, item) => sum + item.price * item.quantity, 0) ===
          order.total;
      } catch {
        valid = false;
      }
    }
    await telegramCall(env, "answerPreCheckoutQuery", {
      pre_checkout_query_id: checkout.id,
      ok: valid,
      ...(!valid
        ? {
            error_message:
              "Đơn không còn hợp lệ. Vui lòng tạo lại đơn hoặc liên hệ hỗ trợ.",
          }
        : {}),
    });
  } else if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const link = await linked(env, update.message.from.id);
    const order = await env.DB.prepare(
      "SELECT * FROM orders WHERE id=? AND user_id=?",
    )
      .bind(payment.invoice_payload, link?.user_id ?? "")
      .first<StoredOrder>();
    if (
      !order ||
      payment.currency !== "XTR" ||
      order.currency !== "XTR" ||
      order.channel !== "telegram" ||
      payment.total_amount !== order.total
    ) {
      await env.DB.prepare(
        "UPDATE inbox SET status='REVIEW',error='Sai chủ đơn, loại tiền hoặc số tiền' WHERE id=?",
      )
        .bind(inboxId)
        .run();
      return;
    }
    const charge = `stars:${payment.telegram_payment_charge_id}`;
    const settled = await env.DB.prepare(
      "SELECT order_id FROM settlements WHERE external_id=?",
    )
      .bind(charge)
      .first<{ order_id: string }>();
    if (!settled) {
      try {
        await env.DB.prepare(
          "INSERT INTO settlements(id,order_id,source,external_id) VALUES(?,?,?,?)",
        )
          .bind(id(), order.id, "STARS", charge)
          .run();
      } catch (error) {
        const previous = await env.DB.prepare(
          "SELECT order_id FROM settlements WHERE external_id=?",
        )
          .bind(charge)
          .first<{ order_id: string }>();
        if (previous?.order_id !== order.id) {
          if (!/UNIQUE constraint|ORDER_ALREADY_PAID/.test(String(error)))
            throw error;
          await env.DB.prepare(
            "UPDATE inbox SET status='REVIEW',error='Đơn đã được thanh toán bằng giao dịch khác' WHERE id=?",
          )
            .bind(inboxId)
            .run();
          return;
        }
      }
    } else if (settled.order_id !== order.id) {
      throw new HttpError(409, "Charge đã dùng cho đơn khác");
    }
  } else {
    const message = update.message;
    const callback = update.callback_query;
    const chat = message?.chat ?? callback?.message?.chat;
    const sender = message?.from ?? callback?.from;
    if (
      chat?.type !== "private" ||
      !sender ||
      String(chat.id) !== String(sender.id)
    ) {
      await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
        .bind(inboxId)
        .run();
      return;
    }
    const chatId = String(chat.id);
    const text = message?.text ?? callback?.data ?? "";
    if (callback)
      await telegramCall(env, "answerCallbackQuery", {
        callback_query_id: callback.id,
      });
    if (/^\/start [a-f0-9]{32}$/.test(text)) {
      const challenge = await sha256(text.split(" ")[1]);
      const claimed = await env.DB.prepare(
        "UPDATE link_challenges SET telegram_id=?,chat_id=? WHERE id=? AND expires_at>? AND telegram_id IS NULL RETURNING id",
      )
        .bind(String(sender.id), chatId, challenge, now())
        .first();
      await sendText(
        env,
        chatId,
        claimed
          ? `Đã nhận yêu cầu liên kết. Telegram ID: ${sender.id}. Quay lại website, nhập ID này và xác nhận.`
          : "Mã liên kết đã hết hạn hoặc đã sử dụng. Tạo mã mới trên website.",
      );
    } else if (text === "/products" || text === "products") {
      const { results } = await env.DB.prepare(
        "SELECT id,name,price_xtr FROM products WHERE in_stock=1 AND price_xtr>0 LIMIT 20",
      ).all<{ id: number; name: string; price_xtr: number }>();
      await sendText(
        env,
        chatId,
        results.length
          ? "Chọn sản phẩm. Thanh toán trong bot bằng Telegram Stars."
          : "Chưa có sản phẩm mở bán bằng Stars.",
        {
          reply_markup: {
            inline_keyboard: results.map((p) => [
              {
                text: `${p.name} · ${p.price_xtr} ⭐`,
                callback_data: `buy:${p.id}`,
              },
            ]),
          },
        },
      );
    } else if (/^buy:\d+$/.test(text)) {
      const link = await linked(env, sender.id);
      if (!link)
        await sendText(
          env,
          chatId,
          `Hãy đăng nhập và liên kết Telegram trong mục Tài khoản tại ${env.APP_ORIGIN}/account.`,
        );
      else {
        const items = await pricedItems(
          env,
          [{ productId: Number(text.slice(4)), quantity: 1 }],
          "XTR",
        );
        const orderId = `TG${update.update_id}`;
        await env.DB.prepare(
          "INSERT OR IGNORE INTO orders(id,user_id,channel,currency,total,items,customer) VALUES(?,?,?,?,?,?,?)",
        )
          .bind(
            orderId,
            link.user_id,
            "telegram",
            "XTR",
            items[0].price,
            JSON.stringify(items),
            JSON.stringify({ fullName: "Telegram", email: "", phone: "" }),
          )
          .run();
        await telegramCall(env, "sendInvoice", {
          chat_id: chatId,
          title: items[0].name.slice(0, 32),
          description: "Sản phẩm số Tiệm Digital. Hỗ trợ: /paysupport",
          payload: orderId,
          currency: "XTR",
          provider_token: "",
          prices: [{ label: items[0].name, amount: items[0].price }],
          start_parameter: orderId,
        });
      }
    } else if (text === "/orders") {
      const link = await linked(env, sender.id);
      const rows = link
        ? await env.DB.prepare(
            "SELECT id,payment_status,fulfillment_status FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
          )
            .bind(link.user_id)
            .all<{
              id: string;
              payment_status: string;
              fulfillment_status: string;
            }>()
        : { results: [] };
      await sendText(
        env,
        chatId,
        rows.results.length
          ? rows.results
              .map(
                (o) => `${o.id}: ${o.payment_status} / ${o.fulfillment_status}`,
              )
              .join("\n")
          : "Chưa có đơn hoặc chưa liên kết tài khoản.",
      );
    } else if (text === "/paysupport" || text === "/support") {
      await sendText(
        env,
        chatId,
        `Hỗ trợ thanh toán và hoàn tiền: ${env.APP_ORIGIN}/pages/lien-he. Gửi kèm mã đơn, không gửi OTP hoặc mật khẩu. Tiệm Digital chịu trách nhiệm hỗ trợ đơn mua hàng.`,
      );
    } else {
      await sendText(
        env,
        chatId,
        "Tiệm Digital\n/products — Mua hàng bằng Stars\n/orders — Đơn của tôi\n/paysupport — Hỗ trợ thanh toán\nLiên kết tài khoản trong mục Tài khoản trên website.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Xem sản phẩm", callback_data: "products" }],
            ],
          },
        },
      );
    }
  }
  await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
    .bind(inboxId)
    .run();
}
