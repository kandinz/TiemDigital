# Admin và MMO

Production và local dùng `ADMIN_AUTH_MODE=session`: mở `/admin` trên cùng origin với website, đăng nhập bằng tài khoản TiệmDigital. `admin_accounts.user_id` gắn quyền với ID cố định của tài khoản Better Auth. Email và username trong hồ sơ có thể đổi mà không làm mất hoặc phát sinh quyền. Tài khoản bị khóa hoặc hết phiên không truy cập được API admin. Chế độ `access` vẫn được giữ cho môi trường cấu hình Cloudflare Access riêng.

## Cấp quyền

Tạo tài khoản trên website trước, áp dụng schema, rồi chạy:

```sh
node scripts/admin.mjs --username=khanhdq --role=owner --remote --env=production
```

Local bỏ `--remote --env=production`. Script báo lỗi nếu username không tồn tại. `--email` chỉ dành cho danh tính Cloudflare Access trong `admin_roles`; quyền của chế độ session luôn đọc `admin_accounts`. Không tự cấp Owner cho người đăng ký đầu tiên và không dùng email chưa xác minh để quyết định quyền.

MMO chỉ mở cho Owner tại `/admin/mmo`. API nằm dưới `/api/admin/mmo/*`, bao gồm cả danh mục, cấu hình và tài liệu API. Các API ghi kiểm tra origin trước khi gọi module; danh tính của Gum Tool/JWT Bearer không được dùng. Audit ghi ID cố định của admin và đường dẫn thao tác, không ghi API key hoặc dữ liệu giao hàng.

## Mã nguồn

- `workers/mmo`: API NCC, adapter, đơn mua, giao dịch, báo cáo, bảo hành và kệ bán lẻ từ Gum Tool.
- `modules/mmo`: giao diện Vue/Pinia được build riêng vào `dist/mmo`; tải bên trong trang admin cùng origin, dùng cookie TiệmDigital. CSS và runtime không ảnh hưởng giao diện cửa hàng React.
- `workers/mmo/schema.ts`: sáu bảng MMO và index, được gộp vào schema TiệmDigital. Không có SQL migration tĩnh.
- Trang xem trước kệ bán lẻ và tài liệu API trong MMO dành cho quản trị. Danh mục cửa hàng `/api/catalog`, đơn khách, ví và luồng giao hàng cửa hàng vẫn sử dụng dữ liệu hiện có; thao tác mua NCC không tự trừ ví khách hoặc tự giao đơn cửa hàng.

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:pages` kiểm tra cả hai ứng dụng. Vue dùng compiler TypeScript 6 riêng cho công cụ Vue; React/Worker giữ TypeScript 7. `npm run build:mmo` chỉ build giao diện MMO. Phần Swagger tải khi mở tài liệu API.

`node tests/migrate-mmo.node.mjs` kiểm tra ánh xạ chủ sở hữu và đối chiếu dữ liệu. `node tests/admin-mmo.browser.cjs` kiểm tra trên localhost với tài khoản fixture/D1 local, gồm đăng nhập/đăng xuất, tạo rồi xóa giao dịch thử, báo cáo, cấu hình và layout mobile; cần Playwright có sẵn qua `NODE_PATH` nếu không cài trong dự án. Không chạy bài browser ghi dữ liệu này trên production.

## Chuyển dữ liệu

`scripts/migrate-mmo.mjs` mặc định chạy thử. Đọc nguồn từ `.env` và `wrangler.toml` ở dự án Gum Tool, đích từ `wrangler.worker.jsonc`. Đích dùng token `.env` hoặc profile OAuth Wrangler được chỉ định rõ bằng `--target-oauth` và `--target-account`.

```sh
node scripts/migrate-mmo.mjs --source="D:/Project/Gum Tool" --owner=khanhdq --env=production
```

Thêm `--apply` để thực hiện. Script:

1. Kiểm tra nguồn/đích khác nhau, tài khoản đích tồn tại, bảng đích rỗng hoặc khớp hoàn toàn dữ liệu dự kiến; từ chối ghi đè dữ liệu khác.
2. Lưu snapshot nguồn vào `.wrangler/mmo-migration/<timestamp>/source.json`. Thư mục này bị Git bỏ qua và chứa dữ liệu bí mật; chỉ giữ trong môi trường quản trị.
3. Tạo schema cộng thêm, giữ nguyên ID, API key, dữ liệu giao hàng và liên kết đơn mua–giao dịch. Gắn `user_id` của đơn mua/giao dịch vào Owner đã chọn.
4. Đối chiếu số dòng và SHA-256 của toàn bộ giá trị từng bảng, kiểm tra nguồn không thay đổi trong lúc chuyển, rồi cấp Owner.
5. Lưu kết quả vào `verification.json`. Không ghi, xóa hoặc chuyển hướng traffic ở Gum Tool. Nếu nguồn tiếp tục có giao dịch sau snapshot, phải đối soát phần phát sinh trước khi chuyển hẳn vận hành.

Ngày 29/10/2026 đã chuyển và đối chiếu production cho `khanhdq`: 19 NCC, 1 cấu hình tỷ giá, 21 danh mục, 69 đơn mua, 77 giao dịch và 5 sản phẩm bán lẻ. Mọi cột được đối chiếu sau khi ánh xạ chủ sở hữu. Không thực hiện mua NCC thật trong quá trình kiểm thử.

Nếu nguồn tiếp tục hoạt động, `--catch-up --apply` cho phép chép bổ sung bản ghi mới khi dữ liệu đích là tập con tương thích của nguồn. Không ghi đè bản ghi hiện có; từ chối nếu cấu hình, API key, đơn hoặc giao dịch đã khác. Chỉ bỏ qua hai cột cache số dư NCC khi đối chiếu chế độ này. Trong lần chuyển này đã chép bổ sung một đơn phát sinh ở nguồn sau snapshot đầu, nâng tổng đơn mua ở đích lên **70**.
