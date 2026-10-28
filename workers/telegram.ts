import { z } from "zod";
import type { Actor, Env } from "./types";
import { HttpError, json, limitedText, now, rateLimit, sha256 } from "./http";
import { createOrder, orderFor, payWallet, walletFor } from "./commerce";
import { createIntent, intentFor, qrImageUrl } from "./payments";

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
const chatSchema = z.object({ id: z.number().int(), type: z.string() });
const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      from: tgUser,
      chat: chatSchema,
      text: z.string().max(4096).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: tgUser,
      data: z.string().max(64).optional(),
      message: z.object({ chat: chatSchema }).optional(),
    })
    .optional(),
});

export async function telegramWebhook(request: Request, env: Env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET)
    throw new HttpError(503, "Webhook bot chưa cấu hình");
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
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

async function linkedActor(
  env: Env,
  telegramId: number,
): Promise<Actor | null> {
  return env.DB.prepare(
    "SELECT u.id,u.email,u.name FROM telegram_links l JOIN user u ON u.id=l.user_id LEFT JOIN customers c ON c.id=u.id WHERE l.telegram_id=? AND u.emailVerified=1 AND COALESCE(c.disabled,0)=0",
  )
    .bind(String(telegramId))
    .first<Actor>();
}
// A verified Telegram update resolves to the same Actor and calls the same
// payment service as the HTTP website routes. No second wallet or API credential.
function paymentRequest(env: Env, key: string, body: unknown = {}) {
  return new Request(`${env.APP_ORIGIN}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}
const money = (value: number) => `${value.toLocaleString("vi-VN")} ₫`;
async function showOrder(
  env: Env,
  chatId: string,
  actor: Actor,
  orderId: string,
) {
  const order = await orderFor(env, orderId, actor);
  const canPay = order.payment_status === "UNPAID" && order.currency === "VND";
  await sendText(
    env,
    chatId,
    `Đơn ${order.id}\n${money(order.total)}\n${order.payment_status === "PAID" ? "Đã thanh toán" : order.payment_status === "REFUNDED" ? "Đã hoàn số dư" : "Chờ thanh toán"}\n${order.fulfillment_status === "DELIVERED" ? "Đã giao sản phẩm" : "Theo dõi giao hàng trong tài khoản"}`,
    {
      reply_markup: {
        inline_keyboard: [
          ...(canPay
            ? [
                [
                  {
                    text: "Thanh toán bằng số dư",
                    callback_data: `wallet:${order.id}`,
                  },
                  { text: "QR TPBank", callback_data: `qr:${order.id}` },
                ],
              ]
            : []),
          [
            { text: "Cập nhật đơn", callback_data: `status:${order.id}` },
            { text: "Mở tài khoản", url: `${env.APP_ORIGIN}/account` },
          ],
        ],
      },
    },
  );
}
async function showQr(
  env: Env,
  chatId: string,
  intent: Awaited<ReturnType<typeof intentFor>>,
) {
  if (intent.status !== "PENDING") {
    await sendText(
      env,
      chatId,
      intent.status === "SUCCEEDED"
        ? "Giao dịch đã được xác nhận."
        : "QR đã hết hạn. Tạo yêu cầu mới trước khi chuyển tiền.",
    );
    return;
  }
  await telegramCall(env, "sendPhoto", {
    chat_id: chatId,
    photo: qrImageUrl(intent).toString(),
    caption: `${intent.purpose === "TOPUP" ? "Nạp số dư tài khoản chung" : "Thanh toán đơn hàng"}\nSố tiền: ${money(intent.amount)}\nTPBank: ${intent.accountNumber}\nChủ tài khoản: ${intent.accountHolder}\nNội dung: ${intent.memo}\nHiệu lực đến ${new Date(intent.expiresAt * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok" })}\nChuyển đúng số tiền và nội dung. Hệ thống tự xác nhận khi nhận tiền.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Kiểm tra giao dịch", callback_data: `intent:${intent.id}` }],
      ],
    },
  });
}

export async function processTelegramInbox(env: Env, inboxId: string) {
  const inbox = await env.DB.prepare(
    "SELECT payload,status,created_at FROM inbox WHERE id=?",
  )
    .bind(inboxId)
    .first<{ payload: string; status: string; created_at: number }>();
  if (!inbox || inbox.status !== "PENDING") return;
  const update = telegramUpdateSchema.parse(JSON.parse(inbox.payload));
  const message = update.message;
  const callback = update.callback_query;
  const chat = message?.chat ?? callback?.message?.chat;
  const sender = message?.from ?? callback?.from;
  if (
    chat?.type !== "private" ||
    !sender ||
    String(chat.id) !== String(sender.id) ||
    (callback && now() - inbox.created_at > 60)
  ) {
    await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
      .bind(inboxId)
      .run();
    return;
  }
  const chatId = String(chat.id);
  const text = message?.text ?? callback?.data;
  // Ignore unrelated/native-payment updates. They cannot settle a bank order.
  if (!text) {
    await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
      .bind(inboxId)
      .run();
    return;
  }
  if (callback) {
    try {
      await telegramCall(env, "answerCallbackQuery", {
        callback_query_id: callback.id,
      });
    } catch {
      console.warn(
        JSON.stringify({ event: "telegram_callback_ack_failed", id: inboxId }),
      );
    }
  }
  try {
    if (/^\/start [a-f0-9]{32}$/.test(text)) {
      const claimed = await env.DB.prepare(
        "UPDATE link_challenges SET telegram_id=?,chat_id=? WHERE id=? AND expires_at>? AND telegram_id IS NULL RETURNING id",
      )
        .bind(
          String(sender.id),
          chatId,
          await sha256(text.split(" ")[1]),
          now(),
        )
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
        "SELECT id,name,selling_price FROM products WHERE in_stock=1 LIMIT 20",
      ).all<{ id: number; name: string; selling_price: number }>();
      await sendText(
        env,
        chatId,
        results.length
          ? "Chọn sản phẩm. Thanh toán bằng số dư chung hoặc QR TPBank."
          : "Chưa có sản phẩm mở bán.",
        {
          reply_markup: {
            inline_keyboard: results.map((p) => [
              {
                text: `${p.name} · ${money(p.selling_price)}`,
                callback_data: `buy:${p.id}`,
              },
            ]),
          },
        },
      );
    } else if (
      /^(buy:|wallet:|qr:|status:|intent:|topup:|\/topup|\/balance|\/orders)/.test(
        text,
      )
    ) {
      const actor = await linkedActor(env, sender.id);
      if (!actor)
        throw new HttpError(
          401,
          `Hãy đăng nhập và liên kết tài khoản Telegram tại ${env.APP_ORIGIN}/account. Tài khoản bị khóa không thể thanh toán.`,
        );
      const eventKey = `telegram-${String(update.update_id).padStart(12, "0")}`;
      if (/^(buy:|wallet:|qr:|topup:|\/topup\s)/.test(text))
        await rateLimit(env, `write:${actor.id}`, 30);
      if (/^buy:\d+$/.test(text)) {
        const order = await createOrder(
          paymentRequest(env, eventKey, {
            items: [{ productId: Number(text.slice(4)), quantity: 1 }],
            customer: {
              fullName: actor.name || "Khách hàng",
              email: actor.email,
              phone: "",
            },
          }),
          env,
          actor,
          "telegram",
        );
        await showOrder(env, chatId, actor, order.id);
      } else if (/^wallet:[A-Z0-9]+$/.test(text)) {
        const orderId = text.slice(7);
        const order = await orderFor(env, orderId, actor);
        if (order.payment_status === "UNPAID")
          await payWallet(
            paymentRequest(env, `telegram-wallet-${orderId}`),
            env,
            actor,
            orderId,
          );
        await showOrder(env, chatId, actor, orderId);
      } else if (/^qr:[A-Z0-9]+$/.test(text)) {
        const orderId = text.slice(3);
        const order = await orderFor(env, orderId, actor);
        if (order.payment_status !== "UNPAID")
          await showOrder(env, chatId, actor, orderId);
        else
          await showQr(
            env,
            chatId,
            await createIntent(
              paymentRequest(env, eventKey),
              env,
              actor,
              orderId,
            ),
          );
      } else if (/^status:[A-Z0-9]+$/.test(text))
        await showOrder(env, chatId, actor, text.slice(7));
      else if (/^intent:[A-Z0-9]+$/.test(text)) {
        const intent = await intentFor(env, text.slice(7), actor);
        await sendText(
          env,
          chatId,
          `Giao dịch ${intent.id}: ${intent.status === "SUCCEEDED" ? "Đã nhận tiền" : intent.status === "EXPIRED" ? "Hết hạn — khoản đến muộn cần đối soát" : "Đang chờ ngân hàng xác nhận"}`,
        );
        if (intent.orderId && intent.status === "SUCCEEDED")
          await showOrder(env, chatId, actor, intent.orderId);
      } else if (/^(\/topup\s+|topup:)\d+$/.test(text)) {
        const amount = Number(text.replace(/^(\/topup\s+|topup:)/, ""));
        await showQr(
          env,
          chatId,
          await createIntent(
            paymentRequest(env, eventKey, { amount }),
            env,
            actor,
          ),
        );
      } else if (text === "/topup")
        await sendText(
          env,
          chatId,
          "Chọn số tiền nạp, hoặc nhập /topup 100000. Số dư dùng chung với website.",
          {
            reply_markup: {
              inline_keyboard: [50000, 100000, 200000].map((amount) => [
                { text: money(amount), callback_data: `topup:${amount}` },
              ]),
            },
          },
        );
      else if (text === "/balance")
        await sendText(
          env,
          chatId,
          `Số dư khả dụng: ${money((await walletFor(env, actor)).balance)}\nĐây là cùng số dư trên tài khoản website.`,
        );
      else if (text === "/orders") {
        const { results } = await env.DB.prepare(
          "SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 10",
        )
          .bind(actor.id)
          .all<{ id: string }>();
        await sendText(
          env,
          chatId,
          results.length
            ? "Đơn của bạn trên website và Telegram:"
            : "Bạn chưa có đơn hàng.",
          {
            reply_markup: {
              inline_keyboard: results.map((order) => [
                { text: order.id, callback_data: `status:${order.id}` },
              ]),
            },
          },
        );
      } else
        throw new HttpError(
          400,
          "Lệnh không hợp lệ. Dùng /products, /balance, /topup hoặc /orders.",
        );
    } else if (text === "/paysupport" || text === "/support")
      await sendText(
        env,
        chatId,
        `Hỗ trợ thanh toán: ${env.APP_ORIGIN}/pages/lien-he. Gửi mã đơn, không gửi OTP hoặc mật khẩu.`,
      );
    else
      await sendText(
        env,
        chatId,
        "Tiệm Digital\n/products — Mua hàng\n/balance — Số dư chung\n/topup — Nạp tiền bằng QR TPBank\n/orders — Đơn của tôi\n/support — Hỗ trợ\nLiên kết tài khoản trong mục Tài khoản trên website.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Xem sản phẩm", callback_data: "products" }],
            ],
          },
        },
      );
  } catch (error) {
    if (error instanceof HttpError && error.status < 500)
      await sendText(env, chatId, error.message);
    else throw error;
  }
  await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
    .bind(inboxId)
    .run();
}
