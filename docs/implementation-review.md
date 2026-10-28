# Implementation review — 28/10/2026

> Review ban đầu bên dưới là lịch sử của bản `6aae733`. Yêu cầu đã được người dùng hiệu chỉnh: bot Telegram và web dùng chung tài khoản/số dư VND, thanh toán QR TPBank hoặc ví, không dùng Stars. Xem phần review hiệu chỉnh cuối tài liệu.

Fixed point được người dùng chấp thuận: `60992278c5b9b1465be69a3ade58c311131fd995` (HEAD trước khi triển khai). Spec: `docs/plans/2026-10-28-payment-platform-cloudflare.md`. Review hai trục bằng hai agent độc lập, sau đó review lại các sửa đổi.

## Standards

Không tìm thấy vi phạm tiêu chuẩn được ghi trong repo hoặc smell cần báo cáo; các cảnh báo tooling được giữ riêng. Khi đọc luồng trọng yếu, reviewer phát hiện ba lỗi hành vi:

1. **P1 — approval tài chính thiếu idempotency:** retry POST có thể tạo hai điều chỉnh ví. Đã sửa bằng admin command key/hash, lưu cùng atomic batch với approval/audit; UI giữ key khi kết quả chưa rõ. API test xác nhận replay trả cùng approval và changed body trả conflict.
2. **P2 — nạp lại cùng số tiền dùng intent cũ:** đã sửa dựa trên trạng thái intent vừa nhận từ server; SUCCEEDED/EXPIRED làm xoay key và tạo intent mới. Reviewer xác nhận cả trường hợp đổi qua lại nhiều số tiền.
3. **P2 — outbox DONE khi thiếu sender:** đã sửa guard yêu cầu EMAIL + EMAIL_FROM hoặc Telegram link + bot token. Test API maintenance/status xác nhận sự kiện vẫn PENDING khi không có kênh gửi thực sự.

Kết quả recheck: ba lỗi đã sửa, không còn finding trong phạm vi được review.

## Spec

Reviewer báo năm điểm:

1. **P1 — query Telegram hết hạn làm nghẽn inbox:** đã thêm expiry cho query tương tác; inbox retry budget/backoff, ưu tiên sự kiện ngân hàng, terminal REVIEW sau số lần thử giới hạn. Hồi quy 51 query hết hạn được kiểm chứng qua API maintenance/transactions.
2. **P1 — retry approval cộng tiền lặp:** đã bổ sung key/hash và ràng buộc dữ liệu như trên.
3. **P1 — đối soát bỏ lỡ outage trên 24 giờ:** đã thêm persisted cursor, lease, tiến theo cửa sổ ngày và overlap; cursor chỉ ghi sau khi persist đủ trang. Admin có khoảng ngày thủ công. Test khôi phục giao dịch cách bốn ngày và không cộng lại khi đối soát lặp.
4. **P2 — phát hiện ledger lệch nhưng chưa freeze:** DB journal/settlement guards nay chặn thao tác tiền khi projection của tài khoản không khớp ledger. Test cố tình làm lệch projection, gọi thanh toán qua API và xác nhận bị chặn. Sau khôi phục projection đúng, thanh toán và hoàn ví hoạt động.
5. **P2 — thông báo chưa gửi vẫn DONE:** đã sửa và kiểm chứng như trục Standards.

Kết quả recheck: năm điểm đã sửa ở mức mã nguồn; reviewer không thấy lỗi P1/P2 còn lại trong thay đổi được yêu cầu kiểm lại. Ghi chú áp dụng schema đã được xử lý bằng `--refresh-triggers`; đã chạy local và đọc sqlite_master xác nhận journal_guard/settlement_guard có LEDGER_MISMATCH. Với database đang vận hành, phải dừng ghi và làm theo runbook trước khi refresh trigger.

## Validation và giới hạn

- Typecheck frontend/Worker và build production hoàn tất.
- Chín test tích hợp HTTP chạy trên Cloudflare Workers/D1 runtime cục bộ, bao gồm nhiều kịch bản/khẳng định về auth, sở hữu đơn, CSRF, JWT, tiền, phê duyệt, CMS, Stars, đối soát và phục hồi.
- Production Wrangler bundle dry-run thành công; đây không phải deploy thật.
- Lint không có error; còn bốn warning (purity/effect và escape) trong mã frontend.
- Credential/domain, Email Service, Access policy MFA, TPBank/SePay thật, bot thật và pilot giao dịch là gate bên ngoài chưa được xác minh. Review mã và test cục bộ không thay thế những gate này.
- Các giới hạn chức năng còn lại được ghi trong `docs/operations.md`, gồm giao hàng thủ công, hoàn ngân hàng/Stars theo quy trình hỗ trợ, lịch sử UI 100 bản ghi, chưa có MFA riêng cho khách và chưa cấu hình cảnh báo ngoài hệ thống.

## Review hiệu chỉnh: tài khoản và thanh toán chung web/Telegram

Mốc so sánh: `6aae73328c18dd184a0115ff36261978e156f4d5`. Spec hiện hành: yêu cầu hiệu chỉnh của người dùng và mục 1/7 trong plan đã cập nhật. Code dùng chung Actor, createOrder, payWallet, walletFor, createIntent, intentFor và QR builder giữa web/bot. Không còn invoice/Stars handler hoặc giá Stars trong admin; schema mới chỉ chấp nhận VND và BANK/WALLET. Dữ liệu tiền tệ cũ trên database có sẵn chỉ phục vụ lịch sử.

### Standards

Không có vi phạm tiêu chuẩn hoặc smell đáng báo cáo. Có một finding hành vi P2: lỗi ACK nút Telegram đã trả lời có thể chặn recovery sau khi tiền đã commit nhưng thông báo timeout. Đã sửa ACK thành best-effort sau guard private chat/tuổi callback. Hồi quy giả lập sendMessage lỗi500 sau commit, ACK lần retry trả400: retry hoàn tất và số dư chỉ trừ một lần. Reviewer kiểm lại và xác nhận finding đã được xử lý.

### Spec

Review xác nhận chung user/số dư/giá VND, QR trả đơn tách TOPUP, ownership, khóa tài khoản và chống lặp/race. Có một finding P3: dashboard chưa tách doanh số theo channel; đã sửa API GROUP BY currency,channel và UI nhãn Website/Telegram. Reviewer xác nhận không còn finding trong phần kiểm lại.

### Kiểm chứng hiệu chỉnh

Chín test HTTP/D1 đạt, gồm luồng bot tạo đơn nhìn thấy trên web, QR TPBank trả đơn không cộng ví, bot nạp QR cộng số dư web, bot dùng ví chung, thanh toán đơn web từ bot, race web/bot cùng đơn không double debit, callback retry sau lỗi gửi, chặn người khác/khóa tài khoản. Build, typecheck và Wrangler production dry-run thành công; không có deploy production trong bước này.
