import type { Env } from "./types";
import { auth, customer, register } from "./auth";
import { checkOrigin, HttpError, json, rateLimit } from "./http";
import {
  createOrder,
  orderFor,
  payWallet,
  serializeOrder,
  walletFor,
} from "./commerce";
import { bankWebhook, createIntent, intentFor, qrImageUrl } from "./payments";
import { adminApi } from "./admin";
import { administrator } from "./auth";
import { createLink, telegramWebhook } from "./telegram";
import { decryptDelivery } from "./delivery";
import { processOutbox, scheduled } from "./operations";
import { now, readBody, sha256 } from "./http";
import { z } from "zod";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handle(request, env);
    const headers = new Headers(response.headers);
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) headers.set('Cache-Control', 'no-store');
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    const mmoFrame = pathname === '/admin/mmo-ui';
    headers.set("X-Frame-Options", mmoFrame ? 'SAMEORIGIN' : 'DENY');
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors ${mmoFrame ? "'self'" : "'none'"}; form-action 'self'`,
    );
    if (env.ENVIRONMENT === "production")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await scheduled(env);
  },
  async queue(batch: MessageBatch<{ id: string }>, env: Env) {
    for (const message of batch.messages) {
      try {
        await processOutbox(env, message.body.id);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (![env.APP_ORIGIN, env.ADMIN_ORIGIN].includes(url.origin))
      throw new HttpError(403, "Hostname không được phép");
    if (
      url.origin === env.ADMIN_ORIGIN &&
      env.ADMIN_ORIGIN !== env.APP_ORIGIN &&
      url.pathname === "/"
    )
      return Response.redirect(`${env.ADMIN_AUTH_MODE === 'session' ? env.APP_ORIGIN : env.ADMIN_ORIGIN}/admin`, 302);
    if (url.pathname.startsWith("/api/admin/"))
      return await adminApi(request, env);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      if (env.ADMIN_AUTH_MODE !== 'session') await administrator(request, env);
      else if (url.origin !== env.APP_ORIGIN) return Response.redirect(`${env.APP_ORIGIN}${url.pathname}${url.search}`, 302);
      if (url.pathname === '/admin/mmo-ui') {
        const admin = await administrator(request, env);
        if (admin.role !== 'owner') throw new HttpError(403, 'Không đủ quyền MMO');
        const asset = new URL('/mmo/index.html', url);
        return env.SITE_ASSETS.fetch(new Request(asset, { headers: request.headers }));
      }
      return env.SITE_ASSETS.fetch(request);
    }
    if (url.pathname === "/webhooks/bank/sepay" && request.method === "POST")
      return await bankWebhook(request, env);
    if (url.pathname === "/webhooks/telegram" && request.method === "POST")
      return await telegramWebhook(request, env);
    if (url.pathname === "/api/public/config" && request.method === "GET")
      return json({
        adminAuthMode: env.ADMIN_AUTH_MODE ?? 'access',
        adminUrl: `${env.ADMIN_AUTH_MODE === 'session' ? env.APP_ORIGIN : env.ADMIN_ORIGIN}/admin`,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
        botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
      });
    const media = url.pathname.match(/^\/media\/([a-f0-9-]{36})$/);
    if (media && request.method === "GET") {
      const object = await env.MEDIA?.get(media[1]);
      if (!object) throw new HttpError(404, "Không tìm thấy ảnh");
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? "application/octet-stream",
          "Cache-Control": "public,max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (url.pathname.startsWith("/api/auth/")) {
      checkOrigin(request, env);
      const profileWrite = ['/api/auth/profile', '/api/auth/password/create', '/api/auth/change-password', '/api/auth/update-user'].includes(url.pathname.replace(/\/+$/, ''));
      if (profileWrite) await customer(request, env);
      if (request.method === 'POST' && (profileWrite || url.pathname === '/api/auth/register' || url.pathname.startsWith('/api/auth/sign-in/') || url.pathname === '/api/auth/telegram/start')) {
        await rateLimit(env, `auth:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`, 12, 60);
      }
      if (url.pathname === '/api/auth/register' && request.method === 'POST') return await register(request, env);
      if (url.pathname === '/api/auth/sign-up/email') throw new HttpError(404, 'Vui lòng đăng ký bằng username.');
      if (
        url.pathname === "/api/auth/email-otp/send-verification-otp" &&
        request.method === "POST"
      ) {
        await rateLimit(
          env,
          `otp:${request.headers.get("cf-connecting-ip") ?? "unknown"}`,
          5,
          300,
        );
        if (env.ENVIRONMENT !== "local") {
          if (!env.TURNSTILE_SECRET)
            throw new HttpError(503, "Chưa cấu hình xác minh chống spam");
          const token = request.headers.get("x-turnstile-token");
          if (!token) throw new HttpError(403, "Vui lòng hoàn tất xác minh");
          const verify = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                secret: env.TURNSTILE_SECRET,
                response: token,
                remoteip: request.headers.get("cf-connecting-ip"),
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          const result = (await verify.json()) as {
            success: boolean;
            hostname: string;
            action: string;
          };
          if (
            !result.success ||
            result.hostname !== new URL(env.APP_ORIGIN).hostname ||
            result.action !== "login"
          )
            throw new HttpError(403, "Xác minh không hợp lệ");
        }
      }
      return await auth(env).handler(request);
    }
    const publicPage = url.pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
    if (publicPage && request.method === "GET") {
      const page = await env.DB.prepare(
        "SELECT v.title,v.description,v.blocks FROM pages p JOIN page_versions v ON v.id=p.published_id WHERE p.slug=?",
      )
        .bind(publicPage[1])
        .first<{ title: string; description: string; blocks: string }>();
      if (!page) throw new HttpError(404, "Trang chưa được xuất bản");
      return json({ ...page, blocks: JSON.parse(page.blocks) });
    }
    if (url.pathname === "/api/catalog" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id,name,description,category,image_url,selling_price,in_stock,updated_at FROM products ORDER BY id DESC",
      ).all();
      return json({
        products: results.map((p) => ({ ...p, in_stock: !!p.in_stock })),
        categories: [...new Set(results.map((p) => p.category))],
        fromCache: false,
      });
    }
    if (url.pathname.startsWith("/api/")) {
      checkOrigin(request, env);
      const actor = await customer(request, env);
      if (request.method !== "GET")
        await rateLimit(env, `write:${actor.id}`, 30);
      if (url.pathname === "/api/me" && request.method === "GET") {
        const credential = await env.DB.prepare("SELECT id FROM account WHERE userId=? AND providerId='credential' AND password IS NOT NULL").bind(actor.id).first();
        return json({ ...actor, hasPassword: !!credential });
      }
      if (
        url.pathname === "/api/me/telegram-link" &&
        request.method === "GET"
      ) {
        const link = await env.DB.prepare(
          "SELECT telegram_id FROM telegram_links WHERE user_id=?",
        )
          .bind(actor.id)
          .first();
        return json({ link });
      }
      if (url.pathname === "/api/me/telegram-link" && request.method === "POST")
        return json(await createLink(env, actor), 201);
      if (
        url.pathname === "/api/me/telegram-link/confirm" &&
        request.method === "POST"
      ) {
        const input = await readBody(
          request,
          z.object({
            token: z.string().regex(/^[a-f0-9]{32}$/),
            telegramId: z.string().regex(/^\d+$/),
          }),
        );
        const challengeId = await sha256(input.token);
        const challenge = await env.DB.prepare(
          "SELECT * FROM link_challenges WHERE id=? AND user_id=? AND telegram_id=? AND expires_at>?",
        )
          .bind(challengeId, actor.id, input.telegramId, now())
          .first<{ chat_id: string }>();
        if (!challenge)
          throw new HttpError(
            409,
            "Hãy mở bot với mã liên kết còn hạn rồi xác nhận đúng ID",
          );
        const linked = await env.DB.prepare(`
          INSERT INTO telegram_links(user_id,telegram_id,chat_id)
          SELECT user_id,telegram_id,chat_id FROM link_challenges WHERE id=? AND expires_at>?
          ON CONFLICT(telegram_id) DO UPDATE SET user_id=excluded.user_id,chat_id=excluded.chat_id
          WHERE telegram_links.user_id='telegram:' || telegram_links.telegram_id
            AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=telegram_links.user_id)
            AND NOT EXISTS (SELECT 1 FROM intents WHERE user_id=telegram_links.user_id)
            AND NOT EXISTS (SELECT 1 FROM journals WHERE user_id=telegram_links.user_id)
            AND NOT EXISTS (SELECT 1 FROM wallets WHERE user_id=telegram_links.user_id AND balance<>0)
          RETURNING user_id
        `).bind(challengeId, now()).first();
        if (!linked) throw new HttpError(409, "Tài khoản Telegram đã có giao dịch hoặc đã liên kết. Vui lòng liên hệ hỗ trợ.");
        await env.DB.prepare("DELETE FROM link_challenges WHERE user_id=?").bind(actor.id).run();
        return json({ ok: true });
      }
      if (
        url.pathname === "/api/me/telegram-link" &&
        request.method === "DELETE"
      ) {
        await env.DB.prepare("DELETE FROM telegram_links WHERE user_id=?")
          .bind(actor.id)
          .run();
        return json({ ok: true });
      }
      const receive = url.pathname.match(
        /^\/api\/orders\/([A-Z0-9]+)\/delivery$/,
      );
      if (receive && request.method === "GET") {
        const order = await orderFor(env, receive[1], actor);
        if (order.payment_status !== "PAID" || !order.delivery)
          throw new HttpError(409, "Sản phẩm đang được chuẩn bị");
        return json({
          value: await decryptDelivery(env, order.id, order.delivery),
        });
      }
      if (url.pathname === "/api/me/wallet" && request.method === "GET") {
        return json(await walletFor(env, actor));
      }
      if (
        url.pathname === "/api/me/wallet/transactions" &&
        request.method === "GET"
      ) {
        const { results } = await env.DB.prepare(
          "SELECT id,kind,amount,wallet_delta,memo,created_at FROM journals WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
        )
          .bind(actor.id)
          .all();
        return json({ transactions: results });
      }
      if (url.pathname === "/api/me/orders" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
        )
          .bind(actor.id)
          .all<import("./types").StoredOrder>();
        return json({ orders: results.map(serializeOrder) });
      }
      if (url.pathname === "/api/me/topups" && request.method === "POST")
        return json(await createIntent(request, env, actor), 201);
      if (url.pathname === "/api/orders" && request.method === "POST")
        return json(await createOrder(request, env, actor), 201);
      const orderMatch = url.pathname.match(
        /^\/api\/orders\/([A-Z0-9]+)(?:\/payments\/(wallet|qr))?$/,
      );
      if (orderMatch) {
        if (!orderMatch[2] && request.method === "GET")
          return json(
            serializeOrder(await orderFor(env, orderMatch[1], actor)),
          );
        if (orderMatch[2] === "wallet" && request.method === "POST")
          return json(await payWallet(request, env, actor, orderMatch[1]));
        if (orderMatch[2] === "qr" && request.method === "POST")
          return json(
            await createIntent(request, env, actor, orderMatch[1]),
            201,
          );
      }
      const intentMatch = url.pathname.match(
        /^\/api\/intents\/([A-Z0-9]+)(\/qr)?$/,
      );
      if (intentMatch && request.method === "GET") {
        const intent = await intentFor(env, intentMatch[1], actor);
        if (!intentMatch[2]) return json(intent);
        const image = qrImageUrl(intent);
        const response = await fetch(image, {
          signal: AbortSignal.timeout(10000),
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new HttpError(502, "Không tải được mã QR");
        return new Response(response.body, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return json({ error: "Không tìm thấy chức năng" }, 404);
    }
    if (url.pathname.startsWith("/webhooks/"))
      return json({ error: "Không tìm thấy" }, 404);
    return env.SITE_ASSETS.fetch(request);
  } catch (error) {
    if (!(error instanceof HttpError))
      console.error(
        JSON.stringify({
          event: "request_failed",
          path: new URL(request.url).pathname,
          type: error instanceof Error ? error.name : "unknown",
        }),
      );
    return json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Lỗi máy chủ. Vui lòng thử lại sau.",
      },
      error instanceof HttpError ? error.status : 500,
    );
  }
}
