import { z } from "zod";
import type { Actor, Env } from "./types";
import { HttpError, json, limitedText, now, rateLimit, sha256 } from "./http";
import { createOrder, orderFor, payWallet, walletFor } from "./commerce";
import { createIntent, intentFor, qrImageUrl } from "./payments";
import { publicEmail } from './auth';

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
function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "🛍️ Sản phẩm", callback_data: "products" },
        { text: "👤 Profile", callback_data: "profile" },
      ],
      [
        { text: "📦 Đơn hàng", callback_data: "orders" },
        { text: "💳 Nạp tiền", callback_data: "topup" },
      ],
      [{ text: "🆘 Hỗ trợ", callback_data: "support" }],
    ],
  };
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
const tgUser = z.object({ id: z.number().int().positive(), first_name: z.string().max(256).optional(), last_name: z.string().max(256).optional(), username: z.string().max(256).optional() });
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
  const actor = await env.DB.prepare(
    "SELECT u.id,u.email,u.name FROM telegram_links l JOIN user u ON u.id=l.user_id LEFT JOIN customers c ON c.id=u.id WHERE l.telegram_id=? AND (u.emailVerified=1 OR EXISTS(SELECT 1 FROM account a WHERE a.userId=u.id AND a.providerId='credential') OR u.id='telegram:' || l.telegram_id) AND COALESCE(c.disabled,0)=0",
  )
    .bind(String(telegramId))
    .first<Actor>();
  return actor ? { ...actor, email: publicEmail(actor.email) } : null;
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
                    text: "💰 Thanh toán bằng số dư",
                    callback_data: `wallet:${order.id}`,
                  },
                  { text: "🏦 QR ngân hàng", callback_data: `qr:${order.id}` },
                ],
              ]
            : []),
          [
            { text: "🔄 Cập nhật đơn", callback_data: `status:${order.id}` },
            { text: "👤 Mở tài khoản", url: `${env.APP_ORIGIN}/account` },
          ],
          [{ text: "🏠 Menu chính", callback_data: "menu" }],
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
    caption: `${intent.purpose === "TOPUP" ? "Nạp số dư tài khoản chung" : "Thanh toán đơn hàng"}\nSố tiền: ${money(intent.amount)}\n${intent.bankName}: ${intent.accountNumber}\nChủ tài khoản: ${intent.accountHolder}\nNội dung: ${intent.memo}\nHiệu lực đến ${new Date(intent.expiresAt * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok" })}\nChuyển đúng số tiền và nội dung. Hệ thống tự xác nhận khi nhận tiền.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Kiểm tra giao dịch", callback_data: `intent:${intent.id}` }],
      ],
    },
  });
}

async function showProductDetail(env: Env, chatId: string, productId: number) {
  const product = await env.DB.prepare(
    "SELECT id,name,description,selling_price,in_stock FROM products WHERE id=?",
  )
    .bind(productId)
    .first<{
      id: number;
      name: string;
      description: string;
      selling_price: number;
      in_stock: number;
    }>();
  if (!product) {
    await sendText(env, chatId, "Không tìm thấy sản phẩm.", {
      reply_markup: mainMenu(),
    });
    return;
  }
  const description = product.description.trim() || "Chưa có mô tả sản phẩm.";
  await sendText(
    env,
    chatId,
    `🛍️ ${product.name}\n\n💰 Giá: ${money(product.selling_price)}\n📦 Tồn kho: ${product.in_stock ? "Còn hàng" : "Hết hàng"}\n\n${description}`.slice(
      0,
      3900,
    ),
    {
      reply_markup: {
        inline_keyboard: [
          ...(product.in_stock
            ? [[{ text: "🛒 Mua ngay", callback_data: `buy:${product.id}` }]]
            : []),
          [{ text: "🔙 Danh sách sản phẩm", callback_data: "products" }],
          [{ text: "🏠 Menu chính", callback_data: "menu" }],
        ],
      },
    },
  );
}

async function showCategories(env: Env, chatId: string) {
  const { results } = await env.DB.prepare(
    "SELECT category,COUNT(*) AS count FROM products WHERE in_stock=1 GROUP BY category ORDER BY category",
  ).all<{ category: string; count: number }>();
  await sendText(
    env,
    chatId,
    results.length ? "📁 Chọn danh mục sản phẩm:" : "Chưa có danh mục sản phẩm.",
    {
      reply_markup: {
        inline_keyboard: [
          ...results.map((item) => [
            {
              text: `📁 ${item.category} (${item.count})`,
              callback_data: `category:${item.category}`,
            },
          ]),
          [{ text: "🏠 Menu chính", callback_data: "menu" }],
        ],
      },
    },
  );
}

async function showCategoryProducts(
  env: Env,
  chatId: string,
  category: string,
) {
  const { results } = await env.DB.prepare(
    "SELECT id,name,selling_price FROM products WHERE category=? AND in_stock=1 ORDER BY name",
  )
    .bind(category)
    .all<{ id: number; name: string; selling_price: number }>();
  await sendText(
    env,
    chatId,
    results.length
      ? `🗂️ ${category}\nChọn tên sản phẩm để xem chi tiết:`
      : "Danh mục này hiện chưa có sản phẩm.",
    {
      reply_markup: {
        inline_keyboard: [
          ...results.map((product) => [
            {
              text: `🛍️ ${product.name} · ${money(product.selling_price)}`,
              callback_data: `product:${product.id}`,
            },
          ]),
          [{ text: "🔙 Danh mục", callback_data: "products" }],
          [{ text: "🏠 Menu chính", callback_data: "menu" }],
        ],
      },
    },
  );
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
    if (/^\/start login_[a-f0-9]{32}$/.test(text)) {
      const actor = await linkedActor(env, sender.id);
      if (!actor) throw new HttpError(401, 'Hãy gửi /start để tạo tài khoản trong bot, rồi tạo lại yêu cầu đăng nhập từ website.');
      const token = text.slice('/start login_'.length);
      const claimed = await env.DB.prepare('UPDATE telegram_logins SET user_id=?,telegram_id=? WHERE id=? AND expires_at>? AND confirmed_at IS NULL AND (telegram_id IS NULL OR telegram_id=?) RETURNING id')
        .bind(actor.id, String(sender.id), await sha256(token), now(), String(sender.id)).first();
      if (!claimed) throw new HttpError(400, 'Yêu cầu đăng nhập đã hết hạn hoặc đã sử dụng.');
      await sendText(env, chatId, 'Xác nhận đăng nhập tài khoản Telegram của bạn trên website Tiệm Digital. Chỉ xác nhận nếu bạn vừa yêu cầu đăng nhập; không dùng liên kết người khác gửi.', {
        reply_markup: { inline_keyboard: [[{ text: 'Xác nhận đăng nhập website', callback_data: `web-login:${token}` }]] },
      });
    } else if (/^web-login:[a-f0-9]{32}$/.test(text)) {
      if (!callback) throw new HttpError(400, 'Vui lòng dùng nút xác nhận trong bot.');
      const actor = await linkedActor(env, sender.id);
      if (!actor) throw new HttpError(403, 'Tài khoản không còn khả dụng.');
      const confirmed = await env.DB.prepare('UPDATE telegram_logins SET confirmed_at=? WHERE id=? AND user_id=? AND telegram_id=? AND expires_at>? AND confirmed_at IS NULL RETURNING id')
        .bind(now(), await sha256(text.slice('web-login:'.length)), actor.id, String(sender.id), now()).first();
      await sendText(env, chatId, confirmed ? 'Đã xác nhận. Quay lại trình duyệt để tiếp tục đăng nhập.' : 'Yêu cầu đã hết hạn hoặc đã sử dụng. Hãy tạo lại trên website.');
    } else if (/^\/start [a-f0-9]{32}$/.test(text)) {
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
    } else if (text === "/start" || /^\/start@[a-zA-Z0-9_]+$/.test(text)) {
      const telegramId = String(sender.id);
      const userId = `telegram:${telegramId}`;
      const timestamp = Date.now();
      const name = [sender.first_name, sender.last_name].filter(Boolean).join(" ") || sender.username || "Khách hàng";
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO user(id,name,email,emailVerified,createdAt,updatedAt) SELECT ?,?,?,0,?,? WHERE NOT EXISTS (SELECT 1 FROM telegram_links WHERE telegram_id=?)")
          .bind(userId, name, `telegram-${telegramId}@users.invalid`, timestamp, timestamp, telegramId),
        env.DB.prepare("INSERT OR IGNORE INTO telegram_links(user_id,telegram_id,chat_id) SELECT id,?,? FROM user WHERE id=?")
          .bind(telegramId, chatId, userId),
      ]);
      await sendText(env, chatId, "Chào bạn! Chọn sản phẩm để bắt đầu.", { reply_markup: mainMenu() });
    } else if (text === "/products" || text === "products") {
      await showCategories(env, chatId);
    } else if (/^category:.+$/.test(text)) {
      await showCategoryProducts(env, chatId, text.slice("category:".length));
    } else if (/^product:\d+$/.test(text)) {
      await showProductDetail(env, chatId, Number(text.slice("product:".length)));
    } else if (
      /^(buy:|quantity:|wallet:|qr:|status:|intent:|topup:|topup$|\/topup|\/balance|balance|\/profile|profile|\/orders|orders)/.test(text)
    ) {
      const actor = await linkedActor(env, sender.id);
      if (!actor)
        throw new HttpError(
          401,
          `Hãy đăng nhập và liên kết tài khoản Telegram tại ${env.APP_ORIGIN}/account. Tài khoản bị khóa không thể thanh toán.`,
        );
      if (actor.id.startsWith("telegram:") && /^(quantity:|topup:|\/topup|topup$)/.test(text))
        throw new HttpError(409, `Để mua hàng và nhận sản phẩm, hãy liên kết Telegram với tài khoản tại ${env.APP_ORIGIN}/account.`);
      const eventKey = `telegram-${String(update.update_id).padStart(12, "0")}`;
      if (/^(quantity:|wallet:|qr:|topup:|\/topup\s)/.test(text))
        await rateLimit(env, `write:${actor.id}`, 30);
      if (/^buy:\d+$/.test(text)) {
        const productId = text.slice(4);
        await sendText(env, chatId, "Chọn số lượng:", {
          reply_markup: {
            inline_keyboard: [
              [1, 2, 3, 4, 5].map((quantity) => ({
                text: String(quantity),
                callback_data: `quantity:${productId}:${quantity}`,
              })),
              [{ text: "🔙 Sản phẩm", callback_data: `product:${productId}` }],
            ],
          },
        });
      } else if (/^quantity:\d+:[1-5]$/.test(text)) {
        const [, productId, quantity] = text.split(":");
        const order = await createOrder(
          paymentRequest(env, eventKey, {
            items: [{ productId: Number(productId), quantity: Number(quantity) }],
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
      } else if (text === "/topup" || text === "topup")
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
      else if (text === "/balance" || text === "balance" || text === "/profile" || text === "profile")
        await sendText(
          env,
          chatId,
          `👤 Profile\nTên: ${actor.name}\nTelegram ID: ${sender.id}\nSố dư khả dụng: ${money((await walletFor(env, actor)).balance)}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "💳 Nạp tiền", callback_data: "topup" }],
                [{ text: "🏠 Menu chính", callback_data: "menu" }],
              ],
            },
          },
        );
      else if (text === "/orders" || text === "orders") {
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
              inline_keyboard: [
                ...results.map((order) => [
                  { text: `🧾 ${order.id}`, callback_data: `status:${order.id}` },
                ]),
                [{ text: "🏠 Menu chính", callback_data: "menu" }],
              ],
            },
          },
        );
      } else
        throw new HttpError(
          400,
          "Lệnh không hợp lệ. Dùng /products, /balance, /topup hoặc /orders.",
        );
    } else if (
      text === "/paysupport" ||
      text === "/support" ||
      text === "support"
    )
      await sendText(
        env,
        chatId,
        `Hỗ trợ thanh toán: ${env.APP_ORIGIN}/pages/lien-he. Gửi mã đơn, không gửi OTP hoặc mật khẩu.`,
      );
    else
      await sendText(
        env,
        chatId,
        "Tiệm Digital\n/products — Mua hàng\n/profile — Profile\n/topup — Nạp tiền bằng QR ngân hàng\n/orders — Đơn của tôi\n/support — Hỗ trợ\nNhấn /start để tạo tài khoản bot.",
        {
          reply_markup: mainMenu(),
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
