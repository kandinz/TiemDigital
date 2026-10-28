# Vận hành nền tảng thanh toán Tiệm Digital

## Phạm vi bản triển khai

- Website: Better Auth email OTP, tài khoản/phiên đăng nhập, danh mục giá server, đơn hàng riêng tư, ví VND, nạp QR TPBank, trả bằng ví hoặc QR, nhận sản phẩm đã mã hóa.
- Admin: JWT Cloudflare Access + vai trò D1, khách hàng/khóa phiên, sản phẩm giá VND/XTR, đơn và giao hàng thủ công, CMS page và trang chủ, lịch sử phiên bản, phê duyệt hai người, sổ cái, audit, đối soát.
- Ngân hàng: SePay API Banking liên kết tài khoản TPBank. Webhook HMAC + timestamp; cron truy vấn SePay User API v2. Không phải API TPBank trực tiếp.
- Telegram: catalog, mua từng sản phẩm bằng Stars, pre-checkout, successful payment, hỗ trợ `/paysupport`, liên kết tài khoản hai bước và thông báo đơn. Không thanh toán hàng số trong bot bằng QR hoặc ví VND.
- Runtime hiện tại là một Worker phân module (API, auth, commerce, payment, admin, bot, operations); không có service binding/core worker độc lập. Các endpoint admin vẫn xác thực JWT và role ngay trong Worker.
- Giao hàng thủ công có mã hóa là luồng đang hoạt động. Catalog được quản lý trong D1 bởi Owner; không tự dùng giá fallback cũ hoặc gọi GumTool để giao key khi chưa có contract supplier.

## Chạy và kiểm tra cục bộ

1. `npm ci`
2. Sao chép `.dev.vars.example` sang `.dev.vars`. Tạo `BETTER_AUTH_SECRET` ngẫu nhiên ít nhất 32 ký tự; tạo `DELIVERY_KEY` bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Không commit file secrets.
3. `npm run schema:local` — schema từ `workers/schema.ts`, không có thư mục migration SQL.
4. `npm run dev` — build Vite rồi chạy Wrangler tại `http://localhost:8787`. Sau khi sửa frontend chạy lại build. `npm run preview` chỉ xem assets, không có backend.
5. `npm run typecheck`, `npm run lint`, `npm test`.

Ứng dụng mặc định không có sản phẩm, tài khoản admin hay số dư mẫu. Thanh toán TPBank mặc định tắt. Test HTTP chạy trên Workers/D1 thật trong Miniflare, email và JWKS Access được thay bằng dịch vụ ngoài giả lập ở ranh giới test; không có bypass đăng nhập/admin trong runtime ứng dụng.

Đăng nhập thật cần Email Service hoạt động với domain đã onboard. Local Wrangler không tự gửi email tới khách khi chưa có binding tương ứng. Test suite kiểm chứng OTP mà không gửi email thật. Để dùng admin cần Cloudflare Access/JWKS hợp lệ kể cả khi chạy local; không có mật khẩu admin mặc định.

## Provision Cloudflare

1. Dùng account/domain thuộc quyền quản lý. Tạo D1 riêng cho staging và production, Queues và DLQ, R2 cho media, Email Service với SPF/DKIM.
2. Điền ID tài nguyên và hostname thật vào `wrangler.jsonc`. Giữ `workers_dev=false`, `preview_urls=false`; route/custom domain cho shop, admin, hooks phải trỏ đúng Worker. Nếu dùng hostname hooks riêng, bổ sung `HOOKS_ORIGIN` vào env (xem ghi chú code/config trước khi dùng); mặc định webhook dùng hostname shop.
3. Bảo vệ toàn hostname admin bằng Access, IdP MFA/passkey, session ngắn và reauthentication policy cho admin. Worker kiểm chữ ký JWT, issuer, audience, expiry và vai trò D1. Chỉ có `Cf-Access-Authenticated-User-Email` không được chấp nhận.
4. `node scripts/schema.mjs --remote --env=staging`. Không áp dụng production trước khi có backup và kiểm tra staging. Script mặc định chỉ thêm cấu trúc chưa tồn tại. Nếu database đã tạo bằng phiên bản trước khi review: dừng các tác vụ ghi tiền, chạy lại với `--refresh-triggers` để thay các trigger bằng bản hiện tại, kiểm tra rồi mới mở ghi. Lệnh giữ nguyên bảng/dữ liệu nhưng không được chạy refresh trigger khi còn giao dịch đang ghi. Thay đổi cột bảng trong các phiên bản sau cần DDL có kiểm soát riêng.
5. Bootstrap ít nhất hai Owner khác nhau bằng `node scripts/admin.mjs --email=<email> --role=owner --remote --env=staging`. Các Owner phải là hai danh tính độc lập qua IdP; không dùng hai email alias của một người để thay thế kiểm soát hai người.
6. Cấu hình secrets bằng `wrangler secret put <NAME> --env staging`: BETTER_AUTH_SECRET, TURNSTILE_SECRET, DELIVERY_KEY, SEPAY_WEBHOOK_SECRET, SEPAY_API_TOKEN. Nếu dùng bot: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET. Không nhập secrets vào admin hoặc Vite `VITE_*`.
7. Biến không bí mật: APP_ORIGIN, ADMIN_ORIGIN, ACCESS_ISSUER, ACCESS_AUD, TURNSTILE_SITE_KEY, EMAIL_FROM, TELEGRAM_BOT_USERNAME. Khai báo `EMAIL` send_email binding; staging cần queues/R2 riêng nếu muốn kiểm chứng đủ chức năng này.
8. `npm run deploy -- --env=staging` từ môi trường đã login Cloudflare. Script chặn domain/ID placeholder, thiếu cấu hình Access/Turnstile và thiếu secrets cốt lõi. Script không thay thế việc kiểm tra Access policy hoặc schema đã apply.

Không có deployment, liên kết ngân hàng hay tạo bot nào được tự thực hiện trong lúc triển khai mã nguồn này; cần credentials/domain thật của chủ dự án.

## Kích hoạt TPBank qua SePay

1. Liên kết TPBank theo hướng dẫn chính thức của SePay. Website này không thu thập tài khoản/mật khẩu/OTP Internet Banking.
2. Webhook nhận POST `https://<shop-domain>/webhooks/bank/sepay`, chỉ tiền vào, HMAC-SHA256; secret khớp Workers Secret. Giữ nguyên raw body/timestamp. Không đặt Access login hoặc browser challenge trước webhook.
3. Mã giao dịch ứng dụng có dạng `TD` + 20 ký tự hex; nhận diện chính xác từ nội dung. Kiểm tra TPBank giữ nguyên toàn bộ mã. Không phụ thuộc bộ lọc mã của provider; không bật “bỏ giao dịch không có mã” nếu muốn nhìn thấy khoản chuyển sai nội dung.
4. Owner nhập TPBank BIN 970423, số tài khoản/chủ tài khoản và hạn mức, tạo yêu cầu bật thanh toán; Owner khác duyệt. Cần có cả webhook secret và API token đối soát.
5. Chuyển một khoản nhỏ có kiểm soát: nạp ví; xác minh sổ cái; trả đơn ví; trả đơn QR trực tiếp; thử webhook lặp; đối chiếu sao kê. Chỉ mở nhận tiền rộng sau khi pilot đạt.

Số dư chỉ dùng trong cửa hàng, chưa có chuyển tiền ngang hàng hoặc rút tiền tự động. Hoàn ví chỉ áp dụng đơn vốn trả bằng ví, cần hai người duyệt. Hoàn chuyển khoản và Stars hiện được xử lý theo quy trình hỗ trợ/nhà cung cấp bên ngoài; giao diện không tự đánh dấu đã hoàn hai loại này. Chưa có quy trình tự động hoàn Stars trong admin.

## Telegram

Tạo bot bằng BotFather thuộc chủ cửa hàng. Cấu hình token/username/secret ở Cloudflare; gọi `setWebhook` bằng công cụ quản trị của bạn với URL `https://<shop-domain>/webhooks/telegram`, `secret_token` và `allowed_updates=["message","callback_query","pre_checkout_query"]`. Không ghi token vào URL trong tài liệu hoặc log.

Khách tạo liên kết trong `/account`, mở bot với token một lần, bot trả Telegram ID để khách xác nhận lại trên website. Username không dùng làm căn cứ sở hữu. Đơn bot thanh toán XTR, chỉ successful_payment mới ghi PAID; pre-checkout không phải bằng chứng thanh toán. Giá Stars bằng 0 nghĩa là không bán trên bot. Giao key qua trang tài khoản; bot chỉ gửi thông báo để hạn chế lộ key trong lịch sử chat.

## Bất biến tiền và giới hạn

- Số dư VND không âm, dùng integer. Atomic D1 trigger ghi sổ cái cùng settlement và outbox. Mỗi journal có hai tài khoản đối ứng, amount dương và wallet_delta; view ledger_entries có tổng bằng 0 cho mỗi journal.
- `journals` và audit không cho update/delete bằng SQL thông thường. Chủ account có quyền sửa schema vẫn là trusted operator; không tuyên bố chống được chủ Cloudflare account.
- Webhook chỉ ACK sau khi lưu inbox. Crash được Cron quét lại. D1 và Queue không có transaction chung; outbox đảm bảo có thể gửi lại. Notification có thể lặp nếu dịch vụ đã nhận nhưng mất response; settlement và cấp sản phẩm không lặp theo notification.
- Khoản sai/thiếu/thừa hoặc đến ngoài thời gian intent: REVIEW; không tự chia tiền/credit thừa. Khoản chuyển đúng thời gian nhưng webhook đến trễ vẫn được xét theo thời gian giao dịch.
- Đối soát lưu cursor sau khi persist hết các trang; mỗi lần tiến tối đa một ngày, chồng lấn 5 phút, tối đa 100 trang. Sự cố nhiều ngày được bắt kịp qua các lượt Cron tiếp theo. Admin có ngày bắt đầu/kết thúc để chạy lại lịch sử (tối đa một ngày mỗi lần); đối soát thủ công không đẩy cursor tự động về trước.
- Inbox lỗi có backoff và tối đa 5 lần thử qua sweeper trước REVIEW; query Telegram tương tác đã hết hạn kết thúc riêng để không chặn giao dịch tiền. Outbox dừng tự retry sau 10 lần, admin có thao tác gửi lại có audit. Chênh lệch projection/ledger của khách chặn journal mới và settlement của tài khoản đó bằng DB trigger.
- Ledger/order endpoints hiện giới hạn 100 bản ghi gần nhất. Chưa có cursor UI/export lịch sử đầy đủ. Chủ cửa hàng phải kiểm tra khối lượng thực tế trước khi dùng lâu dài.
- Chưa bật D1 read replicas. Khi bật, phải sửa luồng đọc tiền sang primary/session và kiểm chứng read-after-write; không bật replication chỉ ở dashboard rồi giả định API hiện tại đã xử lý.
- R2 media là dữ liệu công khai qua `/media/<uuid>`; không upload giấy tờ cá nhân, biên lai hoặc key vào media. Chỉ ảnh PNG/JPEG/WebP tối đa 2 MB, không SVG/HTML.
- Auth khách hàng dùng OTP email; chưa có passkey/MFA riêng cho khách. Admin MFA do Access/IdP enforcement. Chưa có KMS tách account hoặc archive audit bất biến ngoài D1.

## Theo dõi và phục hồi

Theo dõi Workers logs, Queue/DLQ, admin overview, các inbox REVIEW, tuổi outbox, đối soát thất bại, và chênh lệch wallet/ledger. Thiết lập Cloudflare alerts theo gói của account; chưa có kênh cảnh báo ngoài hệ thống được cấu hình sẵn.

Trước restore D1: tắt tạo intent/thanh toán, lưu bookmark hiện tại và export đối chiếu; sau restore so sánh sao kê, settlement, journal và giao hàng đã xảy ra. Không phát lại tất cả đơn PAID để giao hàng. Không có restore drill production đã thực hiện trong repo.

Khi lộ secret: tắt ingress theo provider, xoay secret và webhook, kiểm tra inbox/giao dịch từ thời điểm nghi ngờ. Nếu đổi DELIVERY_KEY phải re-encrypt dữ liệu cũ trước khi bỏ key cũ; bản hiện tại chưa có keyring rotation cho ciphertext.

## Các gate còn phụ thuộc tài khoản ngoài

Cloudflare account/resources/domains/Email Service, Access IdP MFA và hai Owner, TPBank account liên kết SePay, provider credentials và bot token. Các gate này chưa được xác minh bằng giao dịch thật. Build/typecheck/test local không chứng minh production đã nhận tiền hay gửi email thành công.
