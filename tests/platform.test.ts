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
  it("credits a TPBank top-up once and prevents concurrent overspending", async () => {
    const cookie = await login("buyer@example.com");
    await env.DB.prepare(`UPDATE settings SET body=? WHERE id='payment'`)
      .bind(
        JSON.stringify({
          enabled: true,
          provider: "sepay",
          bankBin: "970423",
          bankName: "TPBank",
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
      gateway: "TPBank",
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
          bank_brand_name: "TPBank",
          account_number: "123456789",
          transfer_type: "in",
          amount_in: 10000,
          amount_out: 0,
          transaction_content: topup.id,
          transaction_date: new Date().toISOString(),
          reference_number: "TPBANK-REFERENCE-9001",
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
          bank_brand_name: "TPBank",
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
              pre_checkout_query: {
                id: `expired-${n}`,
                from: { id: 12345 },
                currency: "XTR",
                total_amount: 50,
                invoice_payload: "TGUNKNOWN",
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
  });
  it("only settles Stars after a valid successful_payment and deduplicates the charge", async () => {
    const cookie = await login("stars@example.com");
    const user = (await (
      await request("/api/me", undefined, cookie)
    ).json()) as { id: string };
    await env.DB.prepare(
      "INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES(?,?,?)",
    )
      .bind(user.id, "12345", "12345")
      .run();
    await env.DB.prepare(
      "INSERT INTO orders(id,user_id,channel,currency,total,items,customer) VALUES(?,?,?,?,?,?,?)",
    )
      .bind("TG90001", user.id, "telegram", "XTR", 50, "[]", "{}")
      .run();
    const botEnv = {
      ...testEnv,
      TELEGRAM_WEBHOOK_SECRET: "test-telegram-secret",
    };
    const update = {
      update_id: 70001,
      message: {
        from: { id: 12345 },
        chat: { id: 12345, type: "private" },
        successful_payment: {
          currency: "XTR",
          total_amount: 50,
          invoice_payload: "TG90001",
          telegram_payment_charge_id: "charge-90001",
        },
      },
    };
    async function webhook(body: unknown, secret = "test-telegram-secret") {
      return worker.fetch(
        new Request("http://localhost:8787/webhooks/telegram", {
          method: "POST",
          headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
          body: JSON.stringify(body),
        }),
        botEnv,
      );
    }
    expect((await webhook(update, "forged")).status).toBe(401);
    expect(
      (
        await webhook({
          ...update,
          update_id: 70000,
          message: {
            ...update.message,
            successful_payment: {
              ...update.message.successful_payment,
              total_amount: 1,
            },
          },
        })
      ).status,
    ).toBe(200);
    expect(
      await (await request("/api/orders/TG90001", undefined, cookie)).json(),
    ).toMatchObject({ payment_status: "UNPAID" });
    expect((await webhook(update)).status).toBe(200);
    expect((await webhook(update)).status).toBe(200);
    expect(
      await (await request("/api/orders/TG90001", undefined, cookie)).json(),
    ).toMatchObject({ payment_status: "PAID" });
    expect(
      await (await request("/api/me/wallet", undefined, cookie)).json(),
    ).toMatchObject({ balance: 0 });
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
      gateway: "TPBank",
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
      gateway: "TPBank",
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
