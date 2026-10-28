import { z } from "zod";
import type { Actor, Env, Intent, PaymentConfig } from "./types";
import { HttpError, id, json, limitedText, now, readBody } from "./http";
import { command, commandStatement, orderFor } from "./commerce";

export const configSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.literal("sepay"),
    bankBin: z.literal("970423"),
    bankName: z.literal("TPBank"),
    accountNumber: z.string().regex(/^\d{6,19}$/),
    accountHolder: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[A-Z0-9 ]+$/),
    minTopup: z.number().int().min(10000),
    maxTopup: z.number().int().min(10000).max(100000000),
    intentTtl: z.number().int().min(300).max(3600),
  })
  .refine((v) => v.maxTopup >= v.minTopup, "Hạn mức nạp không hợp lệ");
export async function paymentConfig(env: Env) {
  const row = await env.DB.prepare(
    "SELECT version,body FROM settings WHERE id='payment'",
  ).first<{ version: number; body: string }>();
  if (!row) throw new HttpError(503, "Chưa khởi tạo cấu hình thanh toán");
  return { ...(JSON.parse(row.body) as PaymentConfig), version: row.version };
}
export async function createIntent(
  request: Request,
  env: Env,
  actor: Actor,
  orderId?: string,
) {
  const input = orderId
    ? {}
    : await readBody(
        request,
        z.object({ amount: z.number().int().positive() }),
      );
  const cmd = await command(
    request,
    env,
    actor,
    orderId ? `qr:${orderId}` : "topup",
    input,
  );
  if (cmd.previous) return intentFor(env, cmd.previous, actor);
  const config = await paymentConfig(env);
  if (!config.enabled || !config.accountNumber || !env.SEPAY_WEBHOOK_SECRET)
    throw new HttpError(503, "Thanh toán TPBank chưa được kích hoạt");
  let amount = "amount" in input ? (input.amount as number) : 0;
  if (orderId) {
    const order = await orderFor(env, orderId, actor);
    if (
      order.payment_status !== "UNPAID" ||
      order.channel !== "web" ||
      order.currency !== "VND"
    )
      throw new HttpError(409, "Đơn không thể thanh toán bằng QR");
    amount = order.total;
  } else if (amount < config.minTopup || amount > config.maxTopup)
    throw new HttpError(400, "Số tiền nằm ngoài hạn mức nạp");
  const intentId = `TD${crypto.randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO intents(id,user_id,purpose,order_id,amount,account_number,config,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    ).bind(
      intentId,
      actor.id,
      orderId ? "ORDER" : "TOPUP",
      orderId ?? null,
      amount,
      config.accountNumber,
      JSON.stringify(config),
      now() + config.intentTtl,
    ),
    commandStatement(env, actor, cmd, intentId),
  ]).catch(async (error) => {
    const retry = await command(
      request,
      env,
      actor,
      orderId ? `qr:${orderId}` : "topup",
      input,
    );
    if (!retry.previous) throw error;
  });
  const persisted = await command(
    request,
    env,
    actor,
    orderId ? `qr:${orderId}` : "topup",
    input,
  );
  return intentFor(env, persisted.previous ?? intentId, actor);
}
export async function intentFor(env: Env, intentId: string, actor: Actor) {
  const intent = await env.DB.prepare(
    "SELECT * FROM intents WHERE id=? AND user_id=?",
  )
    .bind(intentId, actor.id)
    .first<Intent>();
  if (!intent) throw new HttpError(404, "Không tìm thấy yêu cầu thanh toán");
  const config = JSON.parse(intent.config) as PaymentConfig;
  return {
    id: intent.id,
    purpose: intent.purpose,
    orderId: intent.order_id,
    amount: intent.amount,
    status:
      intent.status === "PENDING" && intent.expires_at < now()
        ? "EXPIRED"
        : intent.status,
    expiresAt: intent.expires_at,
    bankName: config.bankName,
    accountNumber: intent.account_number,
    accountHolder: config.accountHolder,
    bankBin: config.bankBin,
    memo: intent.id,
    qrUrl: `/api/intents/${intent.id}/qr`,
  };
}
export const bankSchema = z.object({
  id: z.union([z.string().min(1).max(100), z.number().int().nonnegative()]),
  gateway: z.string().max(100),
  accountNumber: z.string().max(30),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().positive().max(1000000000000),
  content: z.string().max(2000),
  transactionDate: z.string().max(50),
  code: z.string().nullish(),
  referenceCode: z.string().nullish(),
});
const apiTransactionSchema = z.object({
  id: z.string().min(1),
  bank_brand_name: z.string(),
  account_number: z.string(),
  transfer_type: z.enum(["in", "out"]),
  amount_in: z.number().int().nonnegative(),
  amount_out: z.number().int().nonnegative(),
  transaction_content: z.string(),
  transaction_date: z.string(),
  reference_number: z.string().nullish(),
  code: z.string().nullish(),
});
export async function bankWebhook(request: Request, env: Env) {
  if (!env.SEPAY_WEBHOOK_SECRET)
    throw new HttpError(503, "Webhook chưa cấu hình");
  const raw = await limitedText(request, 16384);
  const timestamp = request.headers.get("x-sepay-timestamp") ?? "";
  const signature = request.headers.get("x-sepay-signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now() - Number(timestamp)) > 300 ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  )
    throw new HttpError(401, "Chữ ký không hợp lệ");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SEPAY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      bytes,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    ))
  )
    throw new HttpError(401, "Chữ ký không hợp lệ");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON không hợp lệ");
  }
  const result = bankSchema.safeParse(payload);
  if (!result.success) throw new HttpError(400, "Giao dịch không hợp lệ");
  const inboxId = `sepay:${result.data.id}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO inbox(id,provider,payload) VALUES(?,?,?)",
  )
    .bind(inboxId, "sepay", raw)
    .run();
  // ACK is only returned after durable storage. A crash is recovered by the sweeper.
  await processBankInbox(env, inboxId);
  return json({ success: true });
}
function bankTime(text: string) {
  const iso = text.includes("T") ? text : text.replace(" ", "T") + "+07:00";
  const parsed = Math.floor(Date.parse(iso) / 1000);
  return Number.isFinite(parsed) ? parsed : 0;
}
export async function processBankInbox(env: Env, inboxId: string) {
  const inbox = await env.DB.prepare(
    "SELECT payload,status FROM inbox WHERE id=?",
  )
    .bind(inboxId)
    .first<{ payload: string; status: string }>();
  if (!inbox || inbox.status !== "PENDING") return;
  const tx = bankSchema.parse(JSON.parse(inbox.payload));
  if (tx.transferType !== "in") {
    await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
      .bind(inboxId)
      .run();
    return;
  }
  const matches = [
    ...new Set(tx.content.toUpperCase().match(/\bTD[A-F0-9]{20}\b/g) ?? []),
  ];
  const intentId = matches.length === 1 ? matches[0] : null;
  const intent = intentId
    ? await env.DB.prepare("SELECT * FROM intents WHERE id=?")
        .bind(intentId)
        .first<Intent>()
    : null;
  const txId = tx.referenceCode
    ? `sepay:ref:${tx.accountNumber}:${tx.referenceCode}`
    : `sepay:${tx.id}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO bank_transactions(id,provider,provider_id,amount,account_number,content,happened_at,intent_id) VALUES(?,?,?,?,?,?,?,?)",
  )
    .bind(
      txId,
      "sepay",
      String(tx.id),
      tx.transferAmount,
      tx.accountNumber,
      tx.content,
      bankTime(tx.transactionDate),
      intent?.id ?? null,
    )
    .run();
  const existing = await env.DB.prepare(
    "SELECT status FROM bank_transactions WHERE id=?",
  )
    .bind(txId)
    .first<{ status: string }>();
  if (existing?.status === "ALLOCATED") {
    await env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?")
      .bind(inboxId)
      .run();
    return;
  }
  if (!intent || !/^(TPBank|TPB)$/i.test(tx.gateway)) {
    await env.DB.prepare(
      "UPDATE inbox SET status='REVIEW',error='Không khớp mã hoặc ngân hàng' WHERE id=?",
    )
      .bind(inboxId)
      .run();
    return;
  }
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO allocations(transaction_id,intent_id) VALUES(?,?)",
      ).bind(txId, intent.id),
      env.DB.prepare("UPDATE inbox SET status='DONE' WHERE id=?").bind(inboxId),
    ]);
  } catch (error) {
    if (
      !/PAYMENT_REVIEW_REQUIRED|ORDER_ALREADY_PAID|UNIQUE constraint|ACCOUNT_DISABLED|LEDGER_MISMATCH/.test(
        String(error),
      )
    )
      throw error;
    await env.DB.prepare(
      "UPDATE inbox SET status='REVIEW',error='Cần đối soát số tiền, tài khoản, thời gian hoặc đơn đã trả' WHERE id=?",
    )
      .bind(inboxId)
      .run();
  }
}
export async function reconcile(
  env: Env,
  range?: { from: number; to: number },
) {
  if (!env.SEPAY_API_TOKEN) return { status: "NOT_CONFIGURED" };
  const runId = id();
  let imported = 0;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO reconciliation_state(id,completed_at) VALUES('sepay',?)",
  )
    .bind(now() - 86400)
    .run();
  const state = await env.DB.prepare(
    "UPDATE reconciliation_state SET lease_until=? WHERE id='sepay' AND lease_until<=? RETURNING completed_at",
  )
    .bind(now() + 1800, now())
    .first<{ completed_at: number }>();
  if (!state) throw new HttpError(409, "Đối soát đang chạy");
  const from = range?.from ?? state.completed_at - 300;
  const to = range?.to ?? Math.min(now(), state.completed_at + 86400);
  if (to < from || to - from > 86400 + 300) {
    await env.DB.prepare(
      "UPDATE reconciliation_state SET lease_until=0 WHERE id='sepay'",
    ).run();
    throw new HttpError(400, "Chọn khoảng đối soát tối đa một ngày");
  }
  // Persist the cursor only after every page has been durably ingested. Each
  // run advances one day at most, so outages of many days catch up without gaps.
  try {
    for (let page = 1; page <= 100; page++) {
      const url = new URL("https://userapi.sepay.vn/v2/transactions");
      const bankDate = (value: number) =>
        new Date(value + 7 * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      url.searchParams.set("transaction_date_from", bankDate(from * 1000));
      url.searchParams.set("transaction_date_to", bankDate(to * 1000));
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "100");
      url.searchParams.set("timestamp_format", "iso8601");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${env.SEPAY_API_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
      const body = (await response.json()) as {
        data?: unknown[];
        meta?: { pagination?: { has_more?: boolean } };
      };
      const transactions = body.data;
      if (!Array.isArray(transactions))
        throw new Error("PROVIDER_SCHEMA_MISMATCH");
      for (const transaction of transactions) {
        const source = apiTransactionSchema.parse(transaction);
        const tx = bankSchema.parse({
          id: source.id,
          gateway: source.bank_brand_name,
          accountNumber: source.account_number,
          transferType: source.transfer_type,
          transferAmount:
            source.transfer_type === "in"
              ? source.amount_in
              : source.amount_out,
          content: source.transaction_content,
          transactionDate: source.transaction_date,
          referenceCode: source.reference_number,
          code: source.code,
        });
        const inboxId = `sepay:${tx.id}`;
        await env.DB.prepare(
          "INSERT OR IGNORE INTO inbox(id,provider,payload) VALUES(?,?,?)",
        )
          .bind(inboxId, "sepay", JSON.stringify(tx))
          .run();
        await processBankInbox(env, inboxId);
        imported++;
      }
      if (
        body.meta?.pagination?.has_more === false ||
        (body.meta?.pagination?.has_more === undefined &&
          transactions.length < 100)
      )
        break;
      if (page === 100) throw new Error("RECONCILIATION_PAGE_LIMIT");
    }
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO reconciliation_runs(id,status,detail) VALUES(?,?,?)",
      ).bind(runId, "SUCCESS", JSON.stringify({ imported, from, to })),
      env.DB.prepare(
        "UPDATE reconciliation_state SET completed_at=?,lease_until=0 WHERE id='sepay'",
      ).bind(range ? state.completed_at : to),
    ]);
    return { status: "SUCCESS", imported, from, to };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE reconciliation_state SET lease_until=0 WHERE id='sepay'",
    ).run();
    await env.DB.prepare(
      "INSERT INTO reconciliation_runs(id,status,detail) VALUES(?,?,?)",
    )
      .bind(runId, "FAILED", String(error).slice(0, 300))
      .run();
    throw error;
  }
}
