// Run against `npm run dev:worker`: NODE_PATH=<Playwright package directory> node tests/storefront.browser.cjs
// All API responses and payments are isolated browser fixtures; no real transactions are sent.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.STOREFRONT_URL || 'http://localhost:8787';
const products = [
  { id: 1, name: 'Claude API 50M Tokens 2day', category: 'Claude', selling_price: 99000, description: 'Hướng dẫn: https://example.com/guide', image_url: null, in_stock: true },
  { id: 2, name: 'Gemini Pro 3 Months', category: 'Gemini', selling_price: 69000, description: 'Gói 3 tháng.', image_url: null, in_stock: true },
  { id: 3, name: 'Claude API 30days', category: 'Claude', selling_price: 49000, description: 'Gói 30 ngày.', image_url: 'https://example.com/missing.png', in_stock: false },
];
const customer = { id: 'browser-test', name: 'Khách kiểm thử', email: 'browser@example.com' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let loggedIn = false, catalogFails = false, emptyCatalog = false, topups = 0, walletPayments = 0, qrPayments = 0, paid = false;
    let order = null;
    const unexpected = [];
    const intent = { id: 'test-intent', purpose: 'TOPUP', orderId: null, amount: 100000, status: 'PENDING', expiresAt: Math.floor(Date.now() / 1000) + 600, bankName: 'Test bank', accountNumber: '123456', accountHolder: 'TEST', memo: 'TEST TOPUP', qrUrl: 'https://example.com/qr.png' };
    await context.route('https://example.com/**', (route) => route.abort());
    await context.route('**/api/**', async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const reply = (json, status = 200) => route.fulfill({ json, status });
      if (path === '/api/catalog') return catalogFails ? reply({ error: 'Catalog unavailable' }, 503) : reply({ products: emptyCatalog ? [] : products, categories: ['Claude', 'Gemini'] });
      if (path === '/api/public/config') return reply({ turnstileSiteKey: null });
      if (path === '/api/auth/email-otp/send-verification-otp') return reply({ success: true });
      if (path === '/api/auth/sign-in/email-otp') { loggedIn = true; return reply({ user: customer }); }
      if (path === '/api/auth/sign-out') { loggedIn = false; return reply({ success: true }); }
      if (path === '/api/auth/list-sessions') return reply([{ id: 'session', token: 'fixture-token', userAgent: 'Test browser' }]);
      if (path === '/api/auth/update-user' || path === '/api/auth/revoke-session') return reply({ success: true });
      if (path === '/api/me') return loggedIn ? reply(customer) : reply({ error: 'Đăng nhập để tiếp tục.' }, 401);
      if (path === '/api/me/wallet') return reply({ balance: 200000 + (paid ? 100000 : 0) });
      if (path === '/api/me/wallet/transactions') return reply({ transactions: [] });
      if (path === '/api/me/orders') return reply({ orders: order ? [order] : [] });
      if (path === '/api/me/topups') { topups++; assert.equal(request.postDataJSON().amount, 100000); assert.ok(request.headers()['idempotency-key']); return reply(intent); }
      if (path === '/api/intents/test-intent') { paid = true; if (qrPayments) order.payment_status = 'PAID'; return reply({ ...intent, status: 'SUCCEEDED' }); }
      if (path === '/api/orders' && request.method() === 'POST') {
        const body = request.postDataJSON();
        assert.ok(request.headers()['idempotency-key']);
        const items = body.items.map(({ productId, quantity }) => { const product = products.find((item) => item.id === productId); return { productId, quantity, name: product.name, price: product.selling_price }; });
        order = { id: 'TDTEST01', user_id: customer.id, channel: 'web', currency: 'VND', total: items.reduce((sum, item) => sum + item.price * item.quantity, 0), customer: body.customer, items, payment_status: 'UNPAID', fulfillment_status: 'NOT_READY', created_at: Math.floor(Date.now() / 1000) };
        return reply(order);
      }
      if (path === '/api/orders/TDTEST01/payments/wallet') { walletPayments++; order.payment_status = 'PAID'; return reply(order); }
      if (path === '/api/orders/TDTEST01/payments/qr') { qrPayments++; return reply({ ...intent, purpose: 'ORDER', orderId: order.id, amount: order.total }); }
      if (path === '/api/orders/TDTEST01') return reply(order);
      if (path === '/api/orders/TDTEST01/delivery') return reply({ value: 'fixture-delivery-value' });
      unexpected.push(path); return reply({ error: 'Unexpected API in browser test' }, 500);
    });

    await page.goto(origin); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.product-card').count(), 3);
    assert.ok((await page.locator('.product-card').first().boundingBox()).y < 300);
    await page.getByRole('button', { name: 'Gemini', exact: true }).click();
    assert.equal(await page.locator('.product-card').count(), 1);
    await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
    await page.getByRole('searchbox').fill('not-a-product');
    await page.getByRole('heading', { name: 'Không tìm thấy sản phẩm' }).waitFor();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await page.getByRole('combobox').selectOption('price-asc');
    assert.match(await page.locator('.product-card').first().innerText(), /49\.000/);
    assert.equal(await page.locator('.product-card').first().getByRole('button', { name: 'Hết hàng', exact: true }).isDisabled(), true);
    await page.getByRole('combobox').selectOption('default');
    await page.getByRole('button', { name: 'Xem chi tiết Claude API 50M Tokens 2day' }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('link').getAttribute('href'), 'https://example.com/guide');
    await page.getByRole('spinbutton').fill('2');
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await page.getByRole('button', { name: 'Giỏ hàng, 2 sản phẩm' }).click();
    await page.getByRole('button', { name: /Tăng số lượng/ }).click();
    assert.match(await page.locator('.cart-total').innerText(), /297\.000/);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.reload(); await page.getByRole('button', { name: 'Giỏ hàng, 3 sản phẩm' }).click();
    await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
    await page.getByRole('heading', { name: 'Đăng nhập để mua hàng' }).waitFor();
    await page.getByRole('link', { name: 'Đăng nhập bằng email' }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(customer.email);
    await page.getByRole('button', { name: 'Gửi mã đăng nhập' }).click();
    await page.getByRole('textbox', { name: 'Mã gồm 6 số' }).fill('123456');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: 'Đơn hàng', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Telegram', exact: true }).count(), 0);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Số dư', exact: true }).click();
    await page.getByRole('heading', { name: 'Nạp số dư' }).waitFor();
    await page.getByRole('button', { name: 'Tạo QR nạp tiền' }).click();
    await page.getByText('300.000 ₫', { exact: true }).waitFor();
    assert.equal(topups, 1);
    await page.getByRole('button', { name: 'Hồ sơ & bảo mật' }).click();
    await page.getByRole('button', { name: 'Thu hồi phiên' }).waitFor();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Sản phẩm' }).click();
    await page.getByRole('button', { name: 'Giỏ hàng, 3 sản phẩm' }).click();
    await page.getByRole('button', { name: 'Thanh toán', exact: true }).click();
    await page.getByRole('textbox', { name: 'Họ tên' }).fill(customer.name);
    await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).click();
    await page.getByRole('button', { name: 'Thanh toán bằng số dư', exact: true }).click();
    await page.getByRole('dialog', { name: 'Thanh toán thành công' }).waitFor();
    assert.equal(walletPayments, 1); assert.equal(order.total, 297000);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('tiem_digital_cart'))), []);
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Nhận sản phẩm' }).click();
    await page.getByText('fixture-delivery-value', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Sản phẩm' }).click();
    await page.locator('.product-card').filter({ hasText: 'Gemini Pro' }).getByRole('button', { name: 'Mua ngay', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).click();
    await page.getByRole('button', { name: 'Quét QR ngân hàng' }).click();
    await page.getByRole('dialog', { name: 'Thanh toán thành công' }).waitFor();
    assert.equal(qrPayments, 1); assert.equal(order.total, 69000);
    await page.getByRole('button', { name: 'Tiếp tục mua hàng' }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Hỗ trợ' }).click();
    assert.equal(await page.getByRole('link', { name: 'Nhắn @kandinz' }).getAttribute('href'), 'https://t.me/kandinz');

    catalogFails = true;
    await page.goto(origin); await page.getByRole('alert').waitFor();
    catalogFails = false;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await page.locator('.product-card').first().waitFor();
    emptyCatalog = true;
    await page.reload(); await page.getByRole('heading', { name: 'Chưa có sản phẩm' }).waitFor();
    emptyCatalog = false;
    await context.close();

    for (const width of [320, 390, 768, 1440]) {
      for (const colorScheme of ['light', 'dark']) {
        const responsive = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
        await responsive.route('**/api/catalog', (route) => route.fulfill({ json: { products, categories: ['Claude', 'Gemini'] } }));
        await responsive.route('https://example.com/**', (route) => route.abort());
        const view = await responsive.newPage();
        await view.goto(origin); await view.locator('.product-card').first().waitFor();
        assert.equal(await view.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}/${colorScheme}`);
        assert.ok((await view.locator('.product-card').first().boundingBox()).y < 340);
        assert.equal(await view.evaluate(() => document.documentElement.classList.contains('dark')), colorScheme === 'dark');
        await responsive.close();
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('PASS: catalog, search, categories, sorting, out-of-stock, details, cart persistence, guest login, wallet/topup, wallet and QR checkout, delivery, Telegram support, error/retry, empty states, 8 responsive/theme combinations.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
