import { SELF, env } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import worker from "../workers/index";
import type { Env } from "../workers/types";
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
  }
}

const testEnv = {
  ...env,
  APP_ORIGIN: "http://localhost:8787",
  ADMIN_ORIGIN: "http://localhost:8787",
  ENVIRONMENT: "local",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
  SEPAY_WEBHOOK_SECRET: "test-bank-secret",
  EMAIL_FROM: "shop@example.com",
} as Env;
let otp = "";
let client = 1;
testEnv.EMAIL = {
  async send(message) {
    const match = message.text.match(/\b\d{6}\b/);
    if (match) otp = match[0];
  },
};
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  key = crypto.randomUUID(),
) {
  return worker.fetch(
    new Request(`http://localhost:8787${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: testEnv.APP_ORIGIN,
        cookie,
        "cf-connecting-ip": `192.0.2.${client}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  );
}
async function login(email: string) {
  client++;
  const sent = await request("/api/auth/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  expect(sent.status).toBe(200);
  const signedIn = await request("/api/auth/sign-in/email-otp", {
    email,
    otp,
    name: "Khách hàng",
  });
  expect(signedIn.status).toBe(200);
  return signedIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function bankWebhook(payload: unknown, signatureOverride?: string) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(testEnv.SEPAY_WEBHOOK_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${timestamp}.${body}`),
      ),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  return worker.fetch(
    new Request("http://localhost:8787/webhooks/bank/sepay", {
      method: "POST",
      headers: {
        "x-sepay-timestamp": timestamp,
        "x-sepay-signature": signatureOverride ?? `sha256=${signature}`,
      },
      body,
    }),
    testEnv,
  );
}

describe("public Worker API", () => {
  it("requires a verified session before exposing wallet or orders", async () => {
    for (const path of ["/api/me/wallet", "/api/me/orders"]) {
      const response = await SELF.fetch(`http://localhost:8787${path}`);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("creates verified customer accounts with private empty wallets", async () => {
    const cookie = await login("wallet-owner@example.com");
    const response = await request("/api/me/wallet", undefined, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      balance: 0,
      currency: "VND",
    });
  });
  it("credits a ACB top-up once and prevents concurrent overspending", async () => {
    const cookie = await login("buyer@example.com");
    await env.DB.prepare(`UPDATE settings SET body=? WHERE id='payment'`)
      .bind(
        JSON.stringify({
          enabled: true,
          provider: "sepay",
          bankBin: "970416",
          bankName: "ACB",
          accountNumber: "123456789",
          accountHolder: "TIEM DIGITAL",
          minTopup: 10000,
          maxTopup: 5000000,
          intentTtl: 900,
        }),
      )
      .run();
    const topupResponse = await request(
      "/api/me/topups",
      { amount: 100000 },
      cookie,
    );
    expect(topupResponse.status).toBe(201);
    const topup = (await topupResponse.json()) as { id: string };
    const transaction = {
      id: 9001,
      gateway: "ACB",
      accountNumber: "123456789",
      transferType: "in",
      transferAmount: 100000,
      content: topup.id,
      transactionDate: new Date().toISOString(),
    };
    expect((await bankWebhook(transaction, "sha256=bad")).status).toBe(401);
    expect((await request("/api/me/wallet", undefined, cookie)).status).toBe(
      200,
    );
    for (let n = 0; n < 3; n++)
      expect((await bankWebhook(transaction)).status).toBe(200);
    expect(
      await (await request("/api/me/wallet", undefined, cookie)).json(),
    ).toMatchObject({ balance: 100000 });
    await env.DB.prepare(
      `INSERT INTO products(id,name,selling_price,updated_at) VALUES(9001,'Test key',70000,'2026-10-28')`,
    ).run();
    const create = async () => {
      const r = await request(
        "/api/orders",
        {
          items: [{ productId: 9001, quantity: 1 }],
          customer: {
            fullName: "Buyer",
            email: "buyer@example.com",
            phone: "0123456789",
          },
        },
        cookie,
      );
      expect(r.status).toBe(201);
      return (await r.json()) as { id: string; total: number };
    };
    const first = await create();
    const second = await create();
    expect(first.total).toBe(70000);
    const paid = await Promise.all([
      request(`/api/orders/${first.id}/payments/wallet`, {}, cookie),
      request(`/api/orders/${second.id}/payments/wallet`, {}, cookie),
    ]);
    expect(paid.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await (await request("/api/me/wallet", undefined, cookie)).json(),
    ).toMatchObject({ balance: 30000 });
    const ledger = (await (
      await request("/api/me/wallet/transactions", undefined, cookie)
    ).json()) as { transactions: unknown[] };
    expect(ledger.transactions).toHaveLength(2);
    const stranger = await login("stranger@example.com");
    expect(
      (await request(`/api/orders/${first.id}`, undefined, stranger)).status,
    ).toBe(404);
  });
  it("rejects cross-site writes and never accepts an unsigned admin identity", async () => {
    const cookie = await login("csrf@example.com");
    const forged = await worker.fetch(
      new Request("http://localhost:8787/api/me/topups", {
        method: "POST",
        headers: { origin: "https://attacker.example", cookie },
        body: JSON.stringify({ amount: 100000 }),
      }),
      testEnv,
    );
    expect(forged.status).toBe(403);
    const admin = await worker.fetch(
      new Request("http://localhost:8787/api/admin/overview", {
        headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
      }),
      testEnv,
    );
    expect(admin.status).toBe(403);
  });
  it("requires two distinct Access admins to approve wallet and bank changes", async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    const publicKey = await exportJWK(pair.publicKey);
    publicKey.kid = "test-access-key";
    const issuer = "https://tests.cloudflareaccess.com";
    const accessEnv = {
      ...testEnv,
      ACCESS_ISSUER: issuer,
      ACCESS_AUD: "test-aud",
      SEPAY_API_TOKEN: "test-provider-token",
    };
    let providerRows: unknown[] = [];
    const originalFetch = globalThis.fetch;
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) =>
        String(input) === `${issuer}/cdn-cgi/access/certs`
          ? Promise.resolve(Response.json({ keys: [publicKey] }))
          : String(input).startsWith("https://userapi.sepay.vn/v2/transactions")
            ? Promise.resolve(
                Response.json({
                  data: providerRows,
                  meta: { pagination: { has_more: false } },
                }),
              )
            : originalFetch(input, init),
      );
    async function adminRequest(
      email: string,
      path: string,
      body?: unknown,
      key = crypto.randomUUID(),
    ) {
      const token = await new SignJWT({ email })
        .setProtectedHeader({ alg: "RS256", kid: "test-access-key" })
        .setIssuer(issuer)
        .setAudience("test-aud")
        .setSubject(email)
        .setExpirationTime("5m")
        .sign(pair.privateKey);
      return worker.fetch(
        new Request(`http://localhost:8787/api/admin${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin: testEnv.ADMIN_ORIGIN,
            "Cf-Access-Jwt-Assertion": token,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        accessEnv,
      );
    }
    try {
      // This scenario must also run alone, without the preceding purchase test.
      await env.DB.prepare("INSERT OR IGNORE INTO products(id,name,selling_price,updated_at) VALUES(9001,'Test key',70000,'2026-10-28')").run();
      await env.DB.prepare("UPDATE settings SET body=? WHERE id='payment'").bind(JSON.stringify({
        enabled: true, provider: 'sepay', bankBin: '970416', bankName: 'ACB',
        accountNumber: '123456789', accountHolder: 'TIEM DIGITAL', minTopup: 10000,
        maxTopup: 5000000, intentTtl: 900,
      })).run();
      await env.DB.batch(
        [
          "owner-one@example.com",
          "owner-two@example.com",
          "editor@example.com",
        ].map((email) =>
          env.DB.prepare(
            "INSERT INTO admin_roles(email,role) VALUES(?,?)",
          ).bind(email, email.startsWith("editor") ? "editor" : "owner"),
        ),
      );
      const cookie = await login("adjustment@example.com");
      const user = (await (
        await request("/api/me", undefined, cookie)
      ).json()) as { id: string };
      const adjustmentKey = crypto.randomUUID();
      const created = await adminRequest(
        "owner-one@example.com",
        "/approvals",
        {
          kind: "WALLET_ADJUSTMENT",
          userId: user.id,
          delta: 50000,
          reason: "Điều chỉnh có đối soát",
        },
        adjustmentKey,
      );
      expect(created.status).toBe(201);
      const approval = (await created.json()) as { id: string };
      const replay = await adminRequest(
        "owner-one@example.com",
        "/approvals",
        {
          kind: "WALLET_ADJUSTMENT",
          userId: user.id,
          delta: 50000,
          reason: "Điều chỉnh có đối soát",
        },
        adjustmentKey,
      );
      expect(await replay.json()).toMatchObject({ id: approval.id });
      expect(
        (
          await adminRequest(
            "owner-one@example.com",
            "/approvals",
            {
              kind: "WALLET_ADJUSTMENT",
              userId: user.id,
              delta: 60000,
              reason: "Điều chỉnh có đối soát",
            },
            adjustmentKey,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await adminRequest(
            "owner-one@example.com",
            `/approvals/${approval.id}/approve`,
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await adminRequest(
            "editor@example.com",
            `/approvals/${approval.id}/approve`,
            {},
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await adminRequest(
            "owner-two@example.com",
            `/approvals/${approval.id}/approve`,
            {},
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await adminRequest(
            "owner-two@example.com",
            `/approvals/${approval.id}/approve`,
            {},
          )
        ).status,
      ).toBe(409);
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 50000 });
      const ledger = (await (
        await adminRequest("owner-one@example.com", "/ledger")
      ).json()) as { differences: unknown[] };
      expect(ledger.differences).toEqual([]);
      const page = await adminRequest("editor@example.com", "/pages", {
        slug: "test-page",
        title: "Trang thử",
        description: "Bản nháp",
        blocks: [
          { type: "text", heading: "Xin chào", text: "Nội dung an toàn" },
        ],
      });
      expect(page.status).toBe(201);
      const version = (await page.json()) as { id: string };
      expect((await request("/api/pages/test-page")).status).toBe(404);
      expect(
        (
          await adminRequest("editor@example.com", "/pages/test-page/publish", {
            versionId: version.id,
          })
        ).status,
      ).toBe(200);
      expect(
        await (await request("/api/pages/test-page")).json(),
      ).toMatchObject({ title: "Trang thử" });
      expect(
        (
          await adminRequest("editor@example.com", "/pages", {
            slug: "xss",
            title: "Bad",
            description: "",
            blocks: [
              { type: "link", label: "Bad", url: "javascript:alert(1)" },
            ],
          })
        ).status,
      ).toBe(400);
      const topup = (await (
        await request("/api/me/topups", { amount: 10000 }, cookie)
      ).json()) as { id: string };
      providerRows = [
        {
          id: "provider-reconcile-9001",
          bank_brand_name: "ACB",
          account_number: "123456789",
          transfer_type: "in",
          amount_in: 10000,
          amount_out: 0,
          transaction_content: topup.id,
          transaction_date: new Date().toISOString(),
          reference_number: "ACB-REFERENCE-9001",
        },
      ];
      expect(
        (await adminRequest("owner-one@example.com", "/reconcile", {})).status,
      ).toBe(200);
      expect(
        (await adminRequest("owner-one@example.com", "/reconcile", {})).status,
      ).toBe(200);
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 60000 });
      const order = (await (
        await request(
          "/api/orders",
          {
            items: [{ productId: 9001, quantity: 1 }],
            customer: {
              fullName: "Customer",
              email: "adjustment@example.com",
              phone: "",
            },
          },
          cookie,
        )
      ).json()) as { id: string };
      // The product costs 70,000: this debit must fail and leave no partial ledger/settlement.
      expect(
        (await request(`/api/orders/${order.id}/payments/wallet`, {}, cookie))
          .status,
      ).toBe(409);
      const config = (await (
        await adminRequest("owner-one@example.com", "/payment-config")
      ).json()) as Record<string, unknown>;
      const configVersion = config.version;
      delete config.version;
      const pending = [];
      for (let count = 0; count < 2; count++)
        pending.push(
          (await (
            await adminRequest("owner-one@example.com", "/approvals", {
              kind: "PAYMENT_CONFIG",
              config,
              expectedVersion: configVersion,
            })
          ).json()) as { id: string },
        );
      expect(
        (
          await adminRequest(
            "owner-two@example.com",
            `/approvals/${pending[0].id}/approve`,
            {},
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await adminRequest(
            "owner-two@example.com",
            `/approvals/${pending[1].id}/approve`,
            {},
          )
        ).status,
      ).toBe(409);
      // A persisted cursor must catch up after a multi-day outage.
      const old = Math.floor(Date.now() / 1000) - 4 * 86400;
      await env.DB.prepare(
        "UPDATE reconciliation_state SET completed_at=?,lease_until=0 WHERE id='sepay'",
      )
        .bind(old)
        .run();
      const oldIntent = "TDAAAAAAAAAAAAAAAAAAAA";
      await env.DB.prepare(
        "INSERT INTO intents(id,user_id,purpose,amount,account_number,config,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          oldIntent,
          user.id,
          "TOPUP",
          10000,
          "123456789",
          JSON.stringify(config),
          old,
          old + 900,
        )
        .run();
      providerRows = [
        {
          id: "old-outage-transaction",
          bank_brand_name: "ACB",
          account_number: "123456789",
          transfer_type: "in",
          amount_in: 10000,
          amount_out: 0,
          transaction_content: oldIntent,
          transaction_date: new Date((old + 60) * 1000).toISOString(),
          reference_number: "OLD-REFERENCE",
        },
      ];
      expect(
        (await adminRequest("owner-one@example.com", "/reconcile", {})).status,
      ).toBe(200);
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 70000 });
      // An inconsistent balance projection freezes this customer's money operations.
      await env.DB.prepare(
        "UPDATE wallets SET balance=balance+1 WHERE user_id=?",
      )
        .bind(user.id)
        .run();
      expect(
        (await request(`/api/orders/${order.id}/payments/wallet`, {}, cookie))
          .status,
      ).toBe(409);
      await env.DB.prepare(
        "UPDATE wallets SET balance=balance-1 WHERE user_id=?",
      )
        .bind(user.id)
        .run();
      expect(
        (await request(`/api/orders/${order.id}/payments/wallet`, {}, cookie))
          .status,
      ).toBe(200);
      const refund = (await (
        await adminRequest("owner-one@example.com", "/approvals", {
          kind: "WALLET_REFUND",
          orderId: order.id,
          reason: "Hoàn đơn theo yêu cầu khách",
        })
      ).json()) as { id: string };
      expect(
        (
          await adminRequest(
            "owner-two@example.com",
            `/approvals/${refund.id}/approve`,
            {},
          )
        ).status,
      ).toBe(200);
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 70000 });
      // Old interactive queries are terminal and cannot starve bank/payment recovery.
      for (let n = 0; n < 51; n++)
        await env.DB.prepare(
          "INSERT INTO inbox(id,provider,payload,created_at) VALUES(?,?,?,?)",
        )
          .bind(
            `expired-query-${n}`,
            "telegram",
            JSON.stringify({
              update_id: 80000 + n,
              callback_query: {
                id: `expired-${n}`,
                from: { id: 12345 },
                data: "products",
                message: { chat: { id: 12345, type: "private" } },
              },
            }),
            old,
          )
          .run();
      accessEnv.EMAIL_FROM = undefined;
      expect(
        (await adminRequest("owner-one@example.com", "/maintenance", {}))
          .status,
      ).toBe(200);
      expect(
        (await adminRequest("owner-one@example.com", "/maintenance", {}))
          .status,
      ).toBe(200);
      const status = (await (
        await adminRequest("owner-one@example.com", "/status")
      ).json()) as {
        outbox: { id: string; status: string; attempts: number }[];
      };
      expect(
        status.outbox.some(
          (event) =>
            event.id === `paid:${order.id}` &&
            event.status === "PENDING" &&
            event.attempts === 1,
        ),
      ).toBe(true);
      const review = (await (
        await adminRequest("owner-one@example.com", "/transactions")
      ).json()) as { inbox: { id: string }[] };
      expect(
        review.inbox.some((event) => event.id.startsWith("expired-query-")),
      ).toBe(false);
    } finally {
      mock.mockRestore();
    }
  // Includes real RSA operations and dozens of D1/API calls on the Worker runtime.
  }, 15000);
  it("accepts ACB top-ups and rejects a different bank", async () => {
    const cookie = await login("acb-buyer@example.com");
    const previous = await env.DB.prepare("SELECT body FROM settings WHERE id='payment'").first<{ body: string }>();
    await env.DB.prepare("UPDATE settings SET body=? WHERE id='payment'").bind(JSON.stringify({
      enabled: true, provider: "sepay", bankBin: "970416", bankName: "ACB",
      accountNumber: "7669977", accountHolder: "TEST ACCOUNT", minTopup: 10000,
      maxTopup: 5000000, intentTtl: 900,
    })).run();
    try {
      const response = await request("/api/me/topups", { amount: 20000 }, cookie);
      expect(response.status).toBe(201);
      const intent = await response.json() as { id: string; bankBin: string; bankName: string };
      expect(intent).toMatchObject({ bankBin: "970416", bankName: "ACB" });
      const tx = { accountNumber: "7669977", transferType: "in", transferAmount: 20000,
        content: intent.id, transactionDate: new Date().toISOString() };
      expect((await bankWebhook({ ...tx, id: 19801, gateway: "TPBank" })).status).toBe(200);
      expect(await (await request("/api/me/wallet", undefined, cookie)).json()).toMatchObject({ balance: 0 });
      expect((await bankWebhook({ ...tx, id: 19802, gateway: "ACB" })).status).toBe(200);
      expect((await bankWebhook({ ...tx, id: 19802, gateway: "ACB" })).status).toBe(200);
      expect(await (await request("/api/me/wallet", undefined, cookie)).json()).toMatchObject({ balance: 20000 });
      expect(await env.DB.prepare("SELECT debit_account FROM journals WHERE id='sepay:19802'").first()).toMatchObject({ debit_account: "bank:ACB" });
    } finally {
      await env.DB.prepare("UPDATE settings SET body=? WHERE id='payment'").bind(previous!.body).run();
    }
  });
  it("shares one VND account between Telegram and web for QR, top-ups and wallet payments", async () => {
    const cookie = await login("telegram-shared@example.com");
    const user = (await (
      await request("/api/me", undefined, cookie)
    ).json()) as { id: string };
    await env.DB.prepare(
      "INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES(?,?,?)",
    )
      .bind(user.id, "12345", "12345")
      .run();
    await env.DB.prepare(
      "INSERT INTO products(id,name,selling_price,updated_at) VALUES(9003,'Shared VND product',20000,'2026-10-28')",
    ).run();
    const botEnv = {
      ...testEnv,
      TELEGRAM_WEBHOOK_SECRET: "test-telegram-secret",
      TELEGRAM_BOT_TOKEN: "test-bot-token",
    };
    const sent: { method: string; body: Record<string, any> }[] = [];
    const answeredCallbacks = new Set<string>();
    let failStatusForOrder = "";
    const originalFetch = globalThis.fetch;
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) => {
        const url = String(input);
        if (url.startsWith("https://api.telegram.org/bottest-bot-token/")) {
          sent.push({
            method: url.split("/").at(-1)!,
            body: JSON.parse(String(init?.body)),
          });
          const outgoing = sent.at(-1)!;
          if (outgoing.method === "answerCallbackQuery") {
            const callback = String(outgoing.body.callback_query_id);
            if (answeredCallbacks.has(callback))
              return Promise.resolve(
                Response.json({ ok: false }, { status: 400 }),
              );
            answeredCallbacks.add(callback);
          }
          if (
            outgoing.method === "sendMessage" &&
            failStatusForOrder &&
            String(outgoing.body.text).includes(failStatusForOrder)
          ) {
            failStatusForOrder = "";
            return Promise.resolve(
              Response.json({ ok: false }, { status: 500 }),
            );
          }
          return Promise.resolve(Response.json({ ok: true }));
        }
        return originalFetch(input, init);
      });
    let updateId = 70000;
    async function message(
      text: string,
      callback = false,
      sender = 12345,
      secret = "test-telegram-secret",
    ) {
      const body = callback
        ? {
            update_id: ++updateId,
            callback_query: {
              id: `callback-${updateId}`,
              from: { id: sender },
              data: text,
              message: { chat: { id: sender, type: "private" } },
            },
          }
        : {
            update_id: ++updateId,
            message: {
              from: { id: sender },
              chat: { id: sender, type: "private" },
              text,
            },
          };
      const send = () =>
        worker.fetch(
          new Request("http://localhost:8787/webhooks/telegram", {
            method: "POST",
            headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
            body: JSON.stringify(body),
          }),
          botEnv,
        );
      return { response: await send(), retry: send };
    }
    function lastPhoto() {
      return sent.filter((s) => s.method === "sendPhoto").at(-1)!.body;
    }
    function photoIntent() {
      return (
        lastPhoto().reply_markup.inline_keyboard[0][0].callback_data as string
      ).slice("intent:".length);
    }
    async function latestOrder() {
      return (
        (await (await request("/api/me/orders", undefined, cookie)).json()) as {
          orders: import("../src/services/platform").PlatformOrder[];
        }
      ).orders.filter((o) => o.payment_status === "UNPAID")[0];
    }
    try {
      expect(
        (await message("/products", false, 12345, "forged")).response.status,
      ).toBe(401);
      expect((await message("/start", false, 987654)).response.status).toBe(200);
      expect((await message("/start", false, 987654)).response.status).toBe(200);
      const botUser = await env.DB.prepare(
        "SELECT u.id,u.emailVerified FROM telegram_links l JOIN user u ON u.id=l.user_id WHERE l.telegram_id=?",
      ).bind("987654").first<{ id: string; emailVerified: number }>();
      expect(botUser).toMatchObject({ id: "telegram:987654", emailVerified: 0 });
      expect((await message("profile", true, 987654)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Telegram ID: 987654");
      expect(String(sent.at(-1)?.body.text)).toContain("Số dư khả dụng: 0");
      expect((await message("topup", true, 987654)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("liên kết Telegram");
      const newWebCookie = await login("new-telegram-link@example.com");
      testEnv.TELEGRAM_BOT_USERNAME = "tiemdigital_bot";
      const link = await (await request("/api/me/telegram-link", {}, newWebCookie)).json() as { token: string };
      await message(`/start ${link.token}`, false, 987654);
      expect((await request("/api/me/telegram-link/confirm", { token: link.token, telegramId: "987654" }, newWebCookie)).status).toBe(200);
      const newWebUser = await (await request("/api/me", undefined, newWebCookie)).json() as { id: string };
      expect(await env.DB.prepare("SELECT user_id FROM telegram_links WHERE telegram_id=?").bind("987654").first()).toMatchObject({ user_id: newWebUser.id });
      await message("/start");
      expect(await env.DB.prepare("SELECT user_id FROM telegram_links WHERE telegram_id=?").bind("12345").first()).toMatchObject({ user_id: user.id });
      expect(sent.at(-1)?.body.reply_markup.inline_keyboard.flat()).toContainEqual({ text: "👤 Profile", callback_data: "profile" });
      expect((await message("/products")).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Chọn danh mục");
      expect(
        sent
          .at(-1)
          ?.body.reply_markup.inline_keyboard.flat()
          .some((button: { text: string }) => button.text.startsWith("📁")),
      ).toBe(true);
      expect((await message("balance", true)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Số dư khả dụng");
      expect(sent.at(-1)?.body.reply_markup.inline_keyboard[0][0]).toMatchObject({
        text: "💳 Nạp tiền",
        callback_data: "topup",
      });
      expect((await message("topup", true)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Chọn số tiền nạp");
      expect((await message("category:Khác", true)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Khác");
      expect(
        sent.at(-1)?.body.reply_markup.inline_keyboard[0][0],
      ).toMatchObject({ callback_data: "product:9003" });
      expect((await message("product:9003", true)).response.status).toBe(200);
      expect(String(sent.at(-1)?.body.text)).toContain("Shared VND product");
      expect(
        sent.at(-1)?.body.reply_markup.inline_keyboard[0][0],
      ).toMatchObject({ text: "🛒 Mua ngay", callback_data: "buy:9003" });
      expect((await message("buy:9003", true)).response.status).toBe(200);
      expect(sent.at(-1)?.body.reply_markup.inline_keyboard[0]).toEqual(
        [1, 2, 3, 4, 5].map((quantity) => ({ text: String(quantity), callback_data: `quantity:9003:${quantity}` })),
      );
      const bought = await message("quantity:9003:1", true);
      expect(bought.response.status).toBe(200);
      expect(sent.at(-1)?.body.reply_markup.inline_keyboard[0]).toEqual([
        { text: "💰 Thanh toán bằng số dư", callback_data: expect.stringMatching(/^wallet:/) },
        { text: "🏦 QR ngân hàng", callback_data: expect.stringMatching(/^qr:/) },
      ]);
      expect((await bought.retry()).status).toBe(200);
      const order = await latestOrder();
      expect(order).toMatchObject({
        channel: "telegram",
        currency: "VND",
        total: 20000,
        user_id: user.id,
      });
      expect((await message(`qr:${order.id}`, true)).response.status).toBe(200);
      const qrIntent = photoIntent();
      expect(lastPhoto().photo).toContain("970416-123456789");
      expect(
        (
          await bankWebhook({
            id: 71001,
            gateway: "ACB",
            accountNumber: "123456789",
            transferType: "in",
            transferAmount: 20000,
            content: qrIntent,
            transactionDate: new Date().toISOString(),
          })
        ).status,
      ).toBe(200);
      expect(
        await (
          await request(`/api/orders/${order.id}`, undefined, cookie)
        ).json(),
      ).toMatchObject({ payment_status: "PAID" });
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 0 });
      expect((await message("/topup 50000")).response.status).toBe(200);
      const topup = photoIntent();
      await bankWebhook({
        id: 71002,
        gateway: "ACB",
        accountNumber: "123456789",
        transferType: "in",
        transferAmount: 50000,
        content: topup,
        transactionDate: new Date().toISOString(),
      });
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 50000 });
      await message("buy:9003", true);
      await message("quantity:9003:1", true);
      const walletOrder = await latestOrder();
      failStatusForOrder = walletOrder.id;
      const lostStatus = await message(`wallet:${walletOrder.id}`, true);
      expect(lostStatus.response.status).toBe(502);
      expect((await lostStatus.retry()).status).toBe(200);
      expect(
        (await message(`wallet:${walletOrder.id}`, true)).response.status,
      ).toBe(200);
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 30000 });
      const web = (await (
        await request(
          "/api/orders",
          {
            items: [{ productId: 9003, quantity: 1 }],
            customer: {
              fullName: "Shared customer",
              email: "telegram-shared@example.com",
              phone: "",
            },
          },
          cookie,
        )
      ).json()) as { id: string };
      const raced = await Promise.all([
        message(`wallet:${web.id}`, true),
        request(`/api/orders/${web.id}/payments/wallet`, {}, cookie),
      ]);
      expect(raced[0].response.status).toBe(200);
      expect([200, 409]).toContain(raced[1].status);
      expect(
        await (
          await request(`/api/orders/${web.id}`, undefined, cookie)
        ).json(),
      ).toMatchObject({ payment_status: "PAID" });
      expect(
        await (await request("/api/me/wallet", undefined, cookie)).json(),
      ).toMatchObject({ balance: 10000 });
      await message("/balance");
      expect(String(sent.at(-1)?.body.text)).toContain("10.000");
      await message("quantity:9003:5", true);
      const quantityOrder = await latestOrder();
      expect(quantityOrder.total).toBe(100000);
      expect(quantityOrder.items[0].quantity).toBe(5);
      await message("quantity:9003:6", true);
      expect(String(sent.at(-1)?.body.text)).toContain("Lệnh không hợp lệ");
      const strangerCookie = await login("telegram-stranger@example.com");
      const stranger = (await (
        await request("/api/me", undefined, strangerCookie)
      ).json()) as { id: string };
      await env.DB.prepare(
        "INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES(?,?,?)",
      )
        .bind(stranger.id, "67890", "67890")
        .run();
      await message(`qr:${web.id}`, true, 67890);
      expect(String(sent.at(-1)?.body.text)).toContain("Không tìm thấy");
      const before = (
        (await (await request("/api/me/orders", undefined, cookie)).json()) as {
          orders: unknown[];
        }
      ).orders.length;
      await env.DB.prepare("UPDATE customers SET disabled=1 WHERE id=?")
        .bind(user.id)
        .run();
      await message("buy:9003", true);
      expect(String(sent.at(-1)?.body.text)).toContain("Tài khoản bị khóa");
      await env.DB.prepare("UPDATE customers SET disabled=0 WHERE id=?")
        .bind(user.id)
        .run();
      expect(
        (
          (await (
            await request("/api/me/orders", undefined, cookie)
          ).json()) as { orders: unknown[] }
        ).orders.length,
      ).toBe(before);
      expect(
        sent.some((s) =>
          ["sendInvoice", "answerPreCheckoutQuery"].includes(s.method),
        ),
      ).toBe(false);
    } finally {
      mock.mockRestore();
    }
  });
  it("uses server prices and allocates direct bank payment to the order, not the wallet", async () => {
    const cookie = await login("direct-bank@example.com");
    await env.DB.prepare(
      "INSERT INTO products(id,name,selling_price,updated_at) VALUES(9002,'Server-priced key',60000,'2026-10-28')",
    ).run();
    const created = await request(
      "/api/orders",
      {
        items: [{ productId: 9002, quantity: 1, price: 1 }],
        total: 1,
        customer: { fullName: "Buyer", email: "other@example.com", phone: "" },
      },
      cookie,
    );
    const order = (await created.json()) as {
      id: string;
      total: number;
      customer: { email: string };
    };
    expect(order.total).toBe(60000);
    expect(order.customer.email).toBe("direct-bank@example.com");
    const intent = (await (
      await request(`/api/orders/${order.id}/payments/qr`, {}, cookie)
    ).json()) as { id: string };
    const tx = {
      id: 9002,
      gateway: "ACB",
      accountNumber: "123456789",
      transferType: "in",
      transferAmount: 60000,
      content: intent.id,
      transactionDate: new Date().toISOString(),
    };
    expect((await bankWebhook(tx)).status).toBe(200);
    expect(
      await (
        await request(`/api/orders/${order.id}`, undefined, cookie)
      ).json(),
    ).toMatchObject({ payment_status: "PAID" });
    expect(
      await (await request("/api/me/wallet", undefined, cookie)).json(),
    ).toMatchObject({ balance: 0 });
    expect(
      (await request(`/api/orders/${order.id}/payments/wallet`, {}, cookie))
        .status,
    ).toBe(409);
  });
  it("returns the same top-up for a retried command and rejects changed content", async () => {
    const cookie = await login("idempotency@example.com");
    const key = crypto.randomUUID();
    const first = await request(
      "/api/me/topups",
      { amount: 20000 },
      cookie,
      key,
    );
    const second = await request(
      "/api/me/topups",
      { amount: 20000 },
      cookie,
      key,
    );
    const a = (await first.json()) as { id: string };
    const b = (await second.json()) as { id: string };
    expect(a.id).toBe(b.id);
    expect(
      (await request("/api/me/topups", { amount: 30000 }, cookie, key)).status,
    ).toBe(409);
  });
  it("keeps mismatched and late bank money in review without crediting the wallet", async () => {
    const cookie = await login("bank-review@example.com");
    const topup = (await (
      await request("/api/me/topups", { amount: 20000 }, cookie)
    ).json()) as { id: string };
    const base = {
      gateway: "ACB",
      accountNumber: "123456789",
      transferType: "in",
      transferAmount: 20000,
      content: topup.id,
      transactionDate: new Date().toISOString(),
    };
    expect(
      (await bankWebhook({ ...base, id: 9010, transferAmount: 19999 })).status,
    ).toBe(200);
    expect(
      (await bankWebhook({ ...base, id: 9011, accountNumber: "999999999" }))
        .status,
    ).toBe(200);
    expect(
      (
        await bankWebhook({
          ...base,
          id: 9012,
          transactionDate: new Date(Date.now() + 3600000).toISOString(),
        })
      ).status,
    ).toBe(200);
    expect(
      await (await request("/api/me/wallet", undefined, cookie)).json(),
    ).toMatchObject({ balance: 0 });
    expect(
      await (
        await request(`/api/intents/${topup.id}`, undefined, cookie)
      ).json(),
    ).toMatchObject({ status: "PENDING" });
  });
});
