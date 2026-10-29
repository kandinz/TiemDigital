// Requires Playwright and the local dev server. API fixtures never send email or payment requests.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.STOREFRONT_URL || 'http://localhost:8787';

async function checkContrast(page, screen) {
  const failures = await page.locator('.platform h1, .platform h2, .platform p, .platform label, .platform input:not(:disabled), .platform button:not(:disabled), .platform a, .platform .danger, .shop-dialog-heading h2, .shop-account a, .profile-name, .profile-balance, .profile-dropdown button').evaluateAll((elements) => {
    const rgba = (value) => { const parts = value.match(/[\d.]+/g).map(Number); return [...parts.slice(0, 3), parts[3] ?? 1]; };
    const luminance = (rgb) => rgb.slice(0, 3).map((channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    return elements.filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').flatMap((element) => {
      let background = [0, 0, 0, 0];
      for (let ancestor = element; ancestor && background[3] < 0.999; ancestor = ancestor.parentElement) {
        const under = rgba(getComputedStyle(ancestor).backgroundColor);
        const alpha = background[3] + under[3] * (1 - background[3]);
        if (alpha) background = [...background.slice(0, 3).map((channel, index) => (channel * background[3] + under[index] * under[3] * (1 - background[3])) / alpha), alpha];
      }
      const foreground = luminance(rgba(getComputedStyle(element).color));
      const behind = luminance(background[3] ? background : [255, 255, 255]);
      const ratio = (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
      return ratio < 4.5 ? [`${element.tagName} ${(element.textContent || element.getAttribute('type') || '').trim().slice(0, 45)}: ${ratio.toFixed(2)}:1`] : [];
    });
  });
  assert.deepEqual(failures, [], `${screen}: text contrast must be at least 4.5:1`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${screen}: horizontal overflow`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) for (const colorScheme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      let authenticated = false, rejectOtp = false;
      await context.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        const reply = (json, status = 200) => route.fulfill({ json, status });
        if (path === '/api/me') return authenticated ? reply({ id: 'theme-test', name: 'Khách kiểm thử', email: 'theme@example.com' }) : reply({ error: 'Vui lòng đăng nhập' }, 401);
        if (path === '/api/public/config') return reply({ turnstileSiteKey: null });
        if (path === '/api/auth/email-otp/send-verification-otp') return reply({ success: true });
        if (path === '/api/auth/sign-in/email-otp') return rejectOtp ? reply({ error: 'Mã đăng nhập không hợp lệ' }, 400) : reply({ success: true });
        if (path === '/api/me/wallet') return reply({ balance: 250000 });
        if (path === '/api/catalog') return reply({ products: [{ id: 1, name: 'Sản phẩm kiểm thử', category: 'Test', selling_price: 49000, description: 'Mô tả sản phẩm.', image_url: null, in_stock: true }], categories: ['Test'] });
        if (path === '/api/me/orders') return reply({ orders: [] });
        if (path === '/api/me/wallet/transactions') return reply({ transactions: [{ id: 'theme-debit', kind: 'PAYMENT', memo: 'Thanh toán đơn kiểm thử', wallet_delta: -49000, created_at: 1800000000 }] });
        if (path === '/api/auth/list-sessions') return reply([]);
        return reply({ error: `Unexpected API ${path}` }, 500);
      });
      const page = await context.newPage();
      await page.goto(`${origin}/account`);
      await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
      await checkContrast(page, `login ${width}/${colorScheme}`);
      await page.getByRole('textbox', { name: 'Email', exact: true }).fill('theme@example.com');
      await page.getByRole('button', { name: 'Gửi mã đăng nhập' }).click();
      await page.getByRole('textbox', { name: 'Mã gồm 6 số' }).waitFor();
      await checkContrast(page, `OTP ${width}/${colorScheme}`);
      rejectOtp = true;
      await page.getByRole('textbox', { name: 'Mã gồm 6 số' }).fill('000000');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await checkContrast(page, `OTP error ${width}/${colorScheme}`);
      authenticated = true;
      await page.goto(`${origin}/account#wallet`);
      await page.reload();
      await page.getByRole('heading', { name: 'Nạp số dư' }).waitFor();
      await checkContrast(page, `wallet ${width}/${colorScheme}`);
      await page.goto(`${origin}/account#security`);
      await page.getByRole('button', { name: 'Cập nhật hồ sơ' }).waitFor();
      await checkContrast(page, `profile ${width}/${colorScheme}`);
      await page.goto(`${origin}/pages/lien-he`);
      await page.getByRole('link', { name: 'Nhắn @kandinz' }).waitFor();
      await checkContrast(page, `support ${width}/${colorScheme}`);
      await page.locator('.profile-menu summary').click();
      await checkContrast(page, `profile menu ${width}/${colorScheme}`);
      await page.goto(`${origin}/?buy=1&quantity=1`);
      await page.getByRole('button', { name: 'Tạo đơn và chọn thanh toán' }).waitFor();
      await checkContrast(page, `checkout ${width}/${colorScheme}`);
      await context.close();
    }
    console.log('PASS: login, OTP, errors, wallet, profile/menu, support and checkout have readable text in light/dark at desktop/mobile sizes.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
