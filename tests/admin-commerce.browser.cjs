// Browser API fixtures: no production accounts, payments, supplier calls or messages.
// NODE_PATH=<Playwright package directory> node tests/admin-commerce.browser.cjs
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const origin = process.env.ADMIN_TEST_URL || "http://localhost:4173";
const capture = resolve(".wrangler/admin-commerce-browser");
const product = {
  id: 1,
  name: "Local fixture key",
  category: "Keys",
  description: "Admin configured",
  image_url: "",
  selling_price: 120000,
  in_stock: true,
  active: 1,
  source: "stock",
  provider_id: null,
  provider_product_id: null,
  cost_vnd: 0,
  markup_percent: null,
  available: 2,
};
const transaction = {
  id: 9,
  type: "sale",
  date: "2026-10-29",
  productName: "Warranty fixture",
  customerInfo: "Customer fixture",
  costPrice: 10000,
  salePrice: 20000,
  deliveredData: "fixture-replacement",
  warrantyPeriod: "7d",
  warrantyNote: "",
  warrantyStatus: "valid",
  warrantyExpireDate: "2026-11-05",
  purchaseOrderId: null,
};
(async () => {
  mkdirSync(capture, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const failures = [],
      unexpected = [],
      writes = [];
    let products = [product],
      supplierOrders = [],
      config = { markupPercent: 20, telegramChatId: "-100123" };
    await context.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const reply = (json) => route.fulfill({ json });
      if (req.method() !== "GET")
        writes.push({ path, body: req.postDataJSON() });
      if (path === "/api/admin/me")
        return reply({
          userId: "fixture-owner",
          email: "owner@example.test",
          username: "owner",
          role: "owner",
        });
      if (path === "/api/public/config")
        return reply({ adminAuthMode: "session", adminUrl: "/admin" });
      if (path === "/api/admin/catalog-config") {
        if (req.method() === "PUT") config = req.postDataJSON();
        return reply(req.method() === "GET" ? config : { ok: true });
      }
      if (path === "/api/admin/products") {
        if (req.method() === "GET") return reply({ products });
        const input = req.postDataJSON();
        products = [
          ...products.filter((p) => p.id !== input.id),
          { ...input, id: input.id || 2, available: 0 },
        ];
        return reply({ ok: true, id: input.id || 2 });
      }
      if (/\/products\/\d+\/inventory$/.test(path))
        return reply({ ok: true, added: 1 });
      if (path === "/api/admin/mmo/providers")
        return reply({
          providers: [
            {
              id: "prodseller",
              name: "Supplier fixture",
              base_url: "https://supplier.example.test",
              is_active: true,
              balance: 42,
              balance_currency: "USD",
              auth_type: "header",
              auth_key_name: "X-Key",
              api_key_masked: "...1234",
            },
          ],
          usd_rate: 25500,
        });
      if (path === "/api/admin/mmo/settings")
        return reply({
          settings: { categories: [{ name: "AI", keywords: ["Claude"] }] },
        });
      if (path === "/api/admin/mmo/products")
        return reply({
          products: [
            {
              provider_product_id: "sku",
              name: "Vendor fixture",
              price_usd: 2,
              in_stock: true,
            },
          ],
          usd_rate: 25500,
        });
      if (path === "/api/admin/fulfillment-alerts")
        return reply({
          alerts: [
            {
              id: "alert",
              order_id: "TDFIXTURE",
              fulfillment_id: "TDFIXTURE:1",
              name: "Local fixture key",
              reason: "STOCK_EXHAUSTED",
              quantity: 1,
              delivered_quantity: 0,
              created_at: 1793232000,
              status: "REVIEW",
              attempts: 1,
            },
          ],
        });
      if (path === "/api/admin/orders")
        return reply({
          orders: [
            {
              id: "TDFIXTURE",
              user_id: "customer",
              channel: "web",
              currency: "VND",
              total: 120000,
              customer: { email: "customer@example.test" },
              items: [
                {
                  productId: 1,
                  name: "Local fixture key",
                  price: 120000,
                  quantity: 1,
                },
              ],
              payment_status: "PAID",
              fulfillment_status: "REVIEW",
              fulfillments: [
                {
                  product_id: 1,
                  name: "Local fixture key",
                  quantity: 1,
                  delivered_quantity: 0,
                  status: "REVIEW",
                },
              ],
            },
          ],
        });
      if (path === "/api/admin/mmo/orders") return reply({ orders: supplierOrders });
      if (path === "/api/admin/mmo/order") {
        const input = req.postDataJSON();
        const id = `mmo_fixture_${supplierOrders.length + 1}`;
        supplierOrders = [...supplierOrders, { id, user_id: "fixture-owner", provider_id: input.provider_id, product_name: "Vendor fixture", quantity: input.quantity, status: "completed", total_price: 2, currency: "USD", provider_order_id: "vendor-fixture", delivered_items: [`key-${id}`], can_check_status: false, created_at: "2026-10-30" }];
        return reply({ order_id: id, status: "completed", persisted: true });
      }
      if (/^\/api\/admin\/mmo\/orders\/mmo_fixture_\d+$/.test(path))
        return reply({ order: supplierOrders.find((order) => path.endsWith(order.id)) });
      if (/^\/api\/admin\/supplier-purchases\/mmo_fixture_\d+\/import$/.test(path))
        return reply({ ok: true, added: 1, total: 1 });
      if (path === "/api/admin/mmo/transactions")
        return reply({ transactions: [transaction] });
      if (/^\/api\/admin\/mmo\/transactions\/\d+$/.test(path))
        return reply({ ok: true });
      if (path === "/api/admin/mmo/warranty/lookup")
        return reply({ list: [transaction] });
      if (path === "/api/admin/mmo/reports/summary")
        return reply({
          summary: {
            totalRevenue: 20000,
            totalExpense: 10000,
            netProfit: 10000,
          },
        });
      if (path === "/api/admin/mmo/reports/monthly")
        return reply({
          yearSummary: { totalRevenue: 20000, totalCost: 8000, totalOtherExpense: 2000, totalExpense: 10000, netProfit: 10000 },
          months: [
            {
              month: 10,
              label: "Tháng 10",
              revenue: 20000,
              cost: 8000,
              otherExpense: 2000,
              totalExpense: 10000,
              profit: 10000,
            },
          ],
        });
      if (/\/fulfillments\/[^/]+\/resolve$/.test(path))
        return reply({ ok: true });
      if (path === "/api/admin/commerce-report")
        return reply({
          revenue: 120000,
          cost: 50000,
          profit: 70000,
          review: 1,
        });
      if (path === "/api/admin/ledger")
        return reply({ journals: [], differences: [] });
      if (path === "/api/admin/approvals") return reply({ approvals: [] });
      unexpected.push(path);
      return route.fulfill({
        status: 500,
        json: { error: `Unmocked ${path}` },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(e.message));
    await page.goto(`${origin}/admin/products`);
    await page.waitForLoadState("networkidle");
    console.log(
      JSON.stringify({
        headings: await page.getByRole("heading").allTextContents(),
        buttons: await page.getByRole("button").allTextContents(),
      }),
    );
    assert.equal(await page.locator("iframe").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "MMO", exact: true }).count(),
      0,
    );
    await page.screenshot({
      path: resolve(capture, "products-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("row", { name: /Local fixture key/ }).click();
    await page
      .getByLabel("Tên sản phẩm", { exact: true })
      .fill("Edited local fixture");
    await page.getByLabel("Giá bán VND", { exact: true }).fill("125000");
    await page
      .getByRole("button", { name: "Lưu sản phẩm", exact: true })
      .click();
    await page.getByRole("row", { name: /Edited local fixture/ }).waitFor();
    assert.equal(
      writes.find((v) => v.path === "/api/admin/products").body.selling_price,
      125000,
    );
    await page
      .getByLabel("Dữ liệu nhập kho", { exact: true })
      .fill("fixture-only-key");
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/inventory") && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Nhập vào kho", exact: true }).click(),
    ]);
    assert.deepEqual(
      writes.find((v) => v.path.endsWith("/inventory")).body.values,
      ["fixture-only-key"],
    );
    await page.getByLabel("% lợi nhuận mặc định", { exact: true }).fill("25");
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/catalog-config") && r.request().method() === "PUT",
      ),
      page
        .getByRole("button", { name: "Lưu cấu hình giá", exact: true })
        .click(),
    ]);
    await page
      .getByRole("button", { name: "Nhà cung cấp", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Tỷ giá & phân loại NCC",
        exact: true,
      })
      .waitFor();
    await page.getByRole("row", { name: /Supplier fixture/ }).click();
    assert.equal(
      await page
        .getByLabel("Tên header / tham số", { exact: true })
        .inputValue(),
      "X-Key",
    );
    await page
      .getByRole("button", { name: "Đơn & giao hàng", exact: true })
      .click();
    await page.getByRole("row", { name: /Kho đã hết hàng/ }).click();
    await page
      .getByLabel("Lý do / kết quả đối soát", { exact: true })
      .fill("Fixture đã được đối soát");
    assert.equal(
      await page
        .getByRole("button", {
          name: "Cho phép thực hiện lại sau đối soát",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await page
      .getByLabel("Bổ sung dữ liệu giao hàng", { exact: false })
      .fill("fixture-replacement-key");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/resolve")),
      page
        .getByRole("button", { name: "Giao phần còn thiếu", exact: true })
        .click(),
    ]);
    assert.equal(
      writes.find((v) => v.path.endsWith("/resolve")).body.expectedAttempt,
      1,
    );
    await page.getByRole("button", { name: "Bảo hành", exact: true }).click();
    await page.getByRole("row", { name: /Warranty fixture/ }).click();
    assert.equal(
      await page
        .getByLabel("Sản phẩm / nội dung", { exact: true })
        .inputValue(),
      "Warranty fixture",
    );
    assert.equal(
      await page.getByLabel("Giá vốn VND", { exact: true }).inputValue(),
      "10000",
    );
    await page
      .getByLabel("Thời hạn bảo hành", { exact: false })
      .selectOption("12m");
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/transactions/9")),
      page.getByRole("button", { name: "Lưu giao dịch", exact: true }).click(),
    ]);
    assert.equal(
      writes.find((v) => v.path.endsWith("/transactions/9")).body
        .warranty_period,
      "12m",
    );
    await page.getByRole("button", { name: "Mua hàng NCC", exact: true }).click();
    await page.getByRole("button", { name: "Mua hàng từ NCC", exact: true }).click();
    await page.getByLabel("NCC").selectOption("prodseller");
    await page.getByRole("button", { name: "Tải sản phẩm", exact: true }).click();
    await page.getByLabel("Sản phẩm").first().selectOption("sku");
    await page.getByLabel("Mục đích mua").selectOption("stock");
    await page.getByLabel("Sản phẩm kho nhận hàng").last().selectOption("1");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/supplier-purchases/mmo_fixture_1/import")),
      page.getByRole("button", { name: "Mua từ NCC", exact: true }).click(),
    ]);
    assert.equal(writes.find((v) => v.path.endsWith("/supplier-purchases/mmo_fixture_1/import")).body.productId, 1);
    await page.getByText("Đã mua đơn mmo_fixture_1 và nhập 1 đơn vị vào kho.").waitFor();
    await page.screenshot({ path: resolve(capture, "purchases-desktop.png"), fullPage: true });
    await page
      .getByRole("button", { name: "Báo cáo doanh thu", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Báo cáo theo tháng",
        exact: true,
      })
      .waitFor();
    await page.getByRole("columnheader", { name: "Chi phí khác" }).waitFor();
    const reportTypeGroup = page.getByRole("group", { name: "Loại báo cáo" });
    await reportTypeGroup.getByRole("button", { name: "Đơn cửa hàng", exact: true }).click();
    assert.equal(await page.getByText("Doanh thu MMO cũ").count(), 0);
    await reportTypeGroup.getByRole("button", { name: "Tất cả báo cáo", exact: true }).click();
    const reportTimeGroup = page.getByRole("group", { name: "Thời gian báo cáo" });
    await reportTimeGroup.getByRole("button", { name: "Theo ngày", exact: true }).click();
    await page.getByLabel("Chọn ngày báo cáo").waitFor();
    await reportTimeGroup.getByRole("button", { name: "Theo tuần", exact: true }).click();
    await page.getByLabel("Chọn ngày trong tuần báo cáo").waitFor();
    await reportTimeGroup.getByRole("button", { name: "Theo tháng", exact: true }).click();
    await page.getByLabel("Chọn tháng báo cáo").waitFor();
    await reportTimeGroup.getByRole("button", { name: "Theo năm", exact: true }).click();
    await page.getByLabel("Chọn năm báo cáo").waitFor();
    await page.screenshot({ path: resolve(capture, "finance-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Sản phẩm", exact: true }).click();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.getByRole("row", { name: /Edited local fixture/ }).click();
    await page.locator(".admin-detail-pane.is-open").waitFor();
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
    assert.equal(await page.locator(".admin-detail-pane.is-open").count(), 0);
    await page.screenshot({
      path: resolve(capture, "products-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(failures, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "Admin desktop/mobile workflows passed; no iframe, no unexpected API calls, no browser errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
