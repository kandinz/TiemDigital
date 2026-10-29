import type { Env } from "./types";
import { now } from "./http";
import { processBankInbox, reconcile } from "./payments";
import { processTelegramInbox, telegramCall } from "./telegram";

export async function processOutbox(env: Env, eventId: string) {
  const event = await env.DB.prepare(
    "UPDATE outbox SET status='SENDING',next_attempt=? WHERE id=? AND status<>'DONE' AND next_attempt<=? RETURNING *",
  )
    .bind(now() + 120, eventId, now())
    .first<{
      id: string;
      user_id: string;
      kind: string;
      body: string;
      attempts: number;
    }>();
  if (!event) return;
  try {
    const user = await env.DB.prepare(
      "SELECT email,emailVerified FROM user WHERE id=?",
    )
      .bind(event.user_id)
      .first<{ email: string; emailVerified: number }>();
    const link = await env.DB.prepare(
      "SELECT chat_id FROM telegram_links WHERE user_id=?",
    )
      .bind(event.user_id)
      .first<{ chat_id: string }>();
    const { orderId } = JSON.parse(event.body) as { orderId: string };
    const text =
      event.kind === "ORDER_DELIVERED"
        ? `Đơn ${orderId} đã được giao. Đăng nhập ${env.APP_ORIGIN}/account để nhận sản phẩm.`
        : `Đơn ${orderId} đã thanh toán, đang chờ giao. Theo dõi tại ${env.APP_ORIGIN}/account.`;
    if (!user || (user.emailVerified && !(env.EMAIL && env.EMAIL_FROM) && !(link && env.TELEGRAM_BOT_TOKEN)))
      throw new Error('NOTIFICATION_NOT_CONFIGURED');
    // Each destination has its own checkpoint. A timeout can still duplicate a
    // notification; it never repeats settlement or creates another product key.
    const emailKey = `notification:${event.id}:email`;
    if (
      env.EMAIL &&
      env.EMAIL_FROM &&
      user.emailVerified &&
      !user.email.endsWith('@users.invalid') &&
      !(await env.DB.prepare("SELECT id FROM audit WHERE id=?")
        .bind(emailKey)
        .first())
    ) {
      await env.EMAIL.send({
        from: env.EMAIL_FROM,
        to: user.email,
        subject: "Tiệm Digital — Cập nhật đơn hàng",
        text,
      });
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      )
        .bind(emailKey, "system", "EMAIL_SENT", event.id, "{}")
        .run();
    }
    const telegramKey = `notification:${event.id}:telegram`;
    if (
      link && env.TELEGRAM_BOT_TOKEN &&
      !(await env.DB.prepare("SELECT id FROM audit WHERE id=?")
        .bind(telegramKey)
        .first())
    ) {
      await telegramCall(env, "sendMessage", { chat_id: link.chat_id, text });
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit(id,actor,action,target,detail) VALUES(?,?,?,?,?)",
      )
        .bind(telegramKey, "system", "TELEGRAM_SENT", event.id, "{}")
        .run();
    }
    await env.DB.prepare(
      "UPDATE outbox SET status='DONE',error=NULL WHERE id=?",
    )
      .bind(event.id)
      .run();
  } catch {
    await env.DB.prepare(
      "UPDATE outbox SET status='PENDING',attempts=attempts+1,next_attempt=?,error='NOTIFICATION_FAILED' WHERE id=?",
    )
      .bind(
        now() + Math.min(3600, 30 * 2 ** Math.min(event.attempts, 7)),
        event.id,
      )
      .run();
    throw new Error("NOTIFICATION_FAILED");
  }
}
export async function sweep(env: Env) {
  const { results: inbox } = await env.DB.prepare(
    "SELECT i.id,i.provider,COALESCE(r.attempts,0) AS attempts FROM inbox i LEFT JOIN inbox_retries r ON r.id=i.id WHERE i.status='PENDING' AND COALESCE(r.next_attempt,0)<=? AND COALESCE(r.attempts,0)<5 ORDER BY CASE i.provider WHEN 'sepay' THEN 0 ELSE 1 END,i.created_at LIMIT 50",
  )
    .bind(now())
    .all<{ id: string; provider: string; attempts: number }>();
  for (const event of inbox) {
    try {
      if (event.provider === "sepay") await processBankInbox(env, event.id);
      else await processTelegramInbox(env, event.id);
    } catch {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO inbox_retries(id,attempts,next_attempt) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,next_attempt=excluded.next_attempt",
        ).bind(
          event.id,
          event.attempts + 1,
          now() + Math.min(3600, 60 * 2 ** event.attempts),
        ),
        env.DB.prepare(
          "UPDATE inbox SET status=CASE WHEN ?>=5 THEN 'REVIEW' ELSE 'PENDING' END,error='PROCESSING_FAILED' WHERE id=?",
        ).bind(event.attempts + 1, event.id),
      ]);
      console.error(JSON.stringify({ event: "inbox_retry", id: event.id }));
    }
  }
  const { results } = await env.DB.prepare(
    "SELECT id FROM outbox WHERE status<>'DONE' AND attempts<10 AND next_attempt<=? ORDER BY created_at LIMIT 50",
  )
    .bind(now())
    .all<{ id: string }>();
  for (const event of results) {
    if (env.EVENTS) await env.EVENTS.send({ id: event.id });
    else {
      try {
        await processOutbox(env, event.id);
      } catch {
        /* Persisted retry state is visible to admin. */
      }
    }
  }
  await env.DB.prepare("DELETE FROM rateLimit WHERE lastRequest<?")
    .bind(Date.now() - 86400000)
    .run();
}
export async function scheduled(env: Env) {
  await sweep(env);
  await reconcile(env);
}
