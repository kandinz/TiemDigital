# Review: hợp nhất admin và danh mục sản phẩm

Ngày: 2026-10-30 (Asia/Bangkok).

Baseline: `623e2903a5e025e473bc15732b031649bdeb3c2f` (HEAD trước khi triển khai). Phạm vi review: `git diff --cached 623e2903a5e025e473bc15732b031649bdeb3c2f --`. Bản thiết kế: [hợp nhất admin và danh mục](../plans/2026-10-29-unified-admin-catalog.md).

Hai reviewer độc lập kiểm tra Standards và Spec. Review tập trung vào thay đổi của công việc này; thay đổi đã có sẵn trong `functions/admin/[[path]].ts`, `AGENTS.md`, `CLAUDE.md`, `.claude/` và `tests/admin-pages.test.ts` được giữ ngoài commit.

## Standards

Không xác định được vi phạm cứng nào đối với chuẩn đã ghi trong repo. Bốn vấn đề tính đúng đắn đã được phát hiện và sửa:

- **P1 — Tạo sản phẩm đồng thời có thể ghi đè:** cách lấy MAX(id)+1 trước upsert không an toàn. Đã chuyển sang ID do SQLite cấp trong transaction; tách tạo mới khỏi cập nhật ID hiện có. Kiểm thử đồng thời đã chứng minh lỗi trước sửa và qua sau sửa.
- **P1 — Xác nhận mua lại không gắn với lần thực hiện:** yêu cầu cũ có thể mua lại sau một timeout mới. API nay bắt buộc expectedAttempt, kiểm tra trạng thái/lần thực hiện bằng compare-and-swap và kiểm tra kết quả trước khi chạy.
- **P2 — Cảnh báo lỗi ghi lịch sử sau giao thành công không thể đóng:** đã thêm thao tác xác nhận đối soát có audit, độc lập với việc giao/mua; không mua hoặc giao lại.
- **P2 — Kết quả NCC trả muộn có thể ghi đè metadata mới:** ghi purchase_order_id và giá vốn nay kiểm tra đúng attempts và trạng thái PROCESSING, dừng nếu không cập nhật được dòng nào.

Reviewer kiểm tra lại và kết luận **0 phát hiện quan trọng còn lại, 0 vi phạm cứng đã chứng minh**.

## Spec

Bốn vấn đề đối chiếu thiết kế đã được phát hiện và sửa:

- **P1 — Ghi đè sản phẩm tạo đồng thời:** trái yêu cầu giữ sản phẩm/lịch sử; đã sửa bằng ID cấp trong transaction như trên.
- **P2 — Thử lại kho có thể bỏ quên key đã lấy:** lần thử lại nay dùng lại inventory đã gắn với fulfillment trước khi lấy thêm hàng. Kiểm thử làm lỗi giải mã rồi khôi phục xác nhận giao đúng key ban đầu, không tiêu thụ key khác.
- **P2 — Telegram bỏ qua danh mục chung:** các màn danh mục/chi tiết bot nay dùng cùng catalogProducts với website, gồm trạng thái hiển thị và số lượng kho khả dụng.
- **P2 — Bảo hành một năm gửi giá trị không được parser hỗ trợ:** giao diện nay gửi 12m thay cho 1y, giữ đúng cơ chế tính hạn hiện có.

Reviewer kiểm tra lại và kết luận **0 phát hiện quan trọng còn lại**. Bổ sung kiểm thử sửa/tắt NCC trên D1 thật và chuyển dữ liệu lặp lại, không trùng ID hoặc tạo alias khi nguồn NCC đã được liên kết.

## Xác minh

- Kiểm thử API/D1 mới bao phủ giá %, giá NCC tăng/giảm, giá sửa tay, đơn cũ, chống mua/giao trùng, ưu tiên thanh toán, giao một phần, timeout/đối soát, xác nhận cũ, phục hồi kho và đóng cảnh báo lỗi ghi lịch sử.
- Playwright chạy luồng admin desktop/mobile qua API fixtures: sửa sản phẩm, nhập kho, cấu hình %, nơi nhận Telegram, xử lý đơn và bảo hành. Không có iframe, lỗi trình duyệt hoặc API ngoài fixture; không gọi NCC, gửi tin hoặc thanh toán thật.
- Build React không còn build ứng dụng Vue riêng. API công khai vẫn giữ trường updated_at hiện có; source không còn gọi gumtool.pages.dev.
- Lint không có lỗi; còn một cảnh báo set-state-in-effect tại loadAdmin đã có nguyên trạng ở baseline.
- Kết quả cuối: `npm test` qua 125/125 test trong 12 file; `npm run typecheck`, `npm run build` và `npm run check:pages` thành công. Bài Playwright desktop/mobile và entry point browser cũ chuyển sang admin chung đều qua.
- Đã cập nhật index và chạy GitNexus `detect_changes(scope: all)`: rủi ro tổng thể critical, 47 luồng chịu ảnh hưởng; phản hồi không trả cờ partial/truncated. Các luồng thanh toán web, Telegram, queue/cron và giao hàng được kiểm chứng bằng test. Analyzer có giới hạn scope-resolution và ngân sách trace khi dựng danh sách processes; vì vậy kết quả graph là công cụ xác định phạm vi, không phải bằng chứng đã liệt kê mọi đường chạy động.

Tổng kết review: Standards 4 vấn đề ban đầu đã sửa, 0 còn lại; Spec 4 vấn đề ban đầu đã sửa, 0 còn lại.
