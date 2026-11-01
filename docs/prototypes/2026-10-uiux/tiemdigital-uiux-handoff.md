# TiệmDigital — bàn giao plan UI/UX

Ngày: 01/11/2026 · Múi giờ Asia/Bangkok

Map quyết định: https://github.com/kandinz/TiemDigital/issues/1

Phạm vi: spec và prototype cho effort build riêng; không phải frontend đã triển khai. Các quyết định sau khi owner nói “tự động hoàn toàn” được tự chọn theo ủy quyền, không ghi là owner duyệt từng chi tiết.

## Nền tảng và ranh giới

- Một React app cho storefront và admin, bỏ phụ thuộc UI Vue cũ; giữ ADR nghiệp vụ hiện có và backend trong phạm vi thiết kế này. Chủ shop là người dùng admin duy nhất.
- shadcn/ui dùng Base UI, TanStack Table/Query, Recharts, Tailwind v4; DataTable chung; không dùng Refine. Hướng Gọn rõ; sáng mặc định, có tối và nhớ lựa chọn. Token và component: https://github.com/kandinz/TiemDigital/issues/2#issuecomment-6538747630
- Chỉ có hai loại đơn nghiệp vụ: Đơn bán và Đơn nhập NCC. Thuật ngữ kỹ thuật của module cũ không trở thành loại đơn thứ ba.
- Desktop admin dùng sidebar và bảng; mobile có thanh dưới năm mục và thẻ. Chi tiết là panel bên phải desktop, toàn màn mobile, đóng giữ ngữ cảnh. Thông báo là huy hiệu và danh sách việc, không popup ngắt việc.

## Storefront

- Vào thẳng danh sách sản phẩm; tìm/lọc/sắp xếp, tên hoặc ảnh mở trang chi tiết; quay lại giữ tìm/lọc/sắp. Không tự tạo review, số đã bán, biến thể, tồn kho công khai hoặc cam kết bảo hành khi API không có. https://github.com/kandinz/TiemDigital/issues/12
- Mua ngay mở khung gọn; bắt buộc đăng nhập khi mua và giữ lựa chọn. Mặc định ví khi đủ tiền, QR toàn đơn khi thiếu; cho đổi trước xác nhận. Gộp tạo đơn vào xác nhận trên UI nhưng vẫn điều phối các API tuần tự. https://github.com/kandinz/TiemDigital/issues/5#issuecomment-6538043183
- Tách thanh toán với giao hàng, hiển thị dữ liệu nhận ngay và xem lại trong Đơn hàng; giao một phần hiện phần đã nhận. Kết quả chưa rõ giữ đơn để kiểm tra, tránh mua/trả lại mù. https://github.com/kandinz/TiemDigital/issues/11
- Tài khoản có Đơn hàng / Ví / Hồ sơ & bảo mật; nạp QR không tự trả đơn, lịch sử ví tối đa 100 mục, tạo/đổi mật khẩu và liên kết Telegram theo API hiện có. https://github.com/kandinz/TiemDigital/issues/13

## Admin

- Năm mục: Hôm nay; Sản phẩm → Danh mục bán / Hàng từ NCC / Kho; Nhà cung cấp; Đơn hàng → Đơn bán / Đơn nhập NCC / Bảo hành / Khách hàng; Tài chính. Cài đặt riêng. Hôm nay đặt doanh thu/lợi nhuận trước, việc cần xử lý gồm tồn cũ sau đó, số dư NCC cuối. https://github.com/kandinz/TiemDigital/issues/3#issuecomment-6538277098
- Hàng từ NCC gộp tất cả NCC đang bật, tìm/lọc và mua trực tiếp; hai nút Mua dùng / Mua nhập kho. Nhập kho chọn có sẵn hoặc tạo nhanh chưa lên kệ; giao ngay nhập luôn, giao chờ quay lại kiểm tra và nhập. Chưa rõ kết quả hoặc persisted:false phải đối soát, không mua lại tự động. https://github.com/kandinz/TiemDigital/issues/17
- Lên kệ nhiều sản phẩm: giá theo % cấu hình, chỉnh nội dung/giá ngoại lệ, xác nhận một lần và bật bán các mục thành công; kiểm tra lại kết quả chưa rõ, không ghi đè sản phẩm đã liên kết hoặc thử lại cả lô. https://github.com/kandinz/TiemDigital/issues/18
- Đơn bán tách trạng thái tiền/giao; chỉ bổ sung phần còn thiếu. Retry NCC chỉ sau xác minh chưa mua, có lý do và expectedAttempt; không retry khi đã giao một phần. Bảo hành và khách hàng bám trường/hành động có sẵn. https://github.com/kandinz/TiemDigital/issues/19
- NCC/cài đặt gồm kết nối/key che/số dư và thời điểm, ngân hàng/hạn mức/TTL, Telegram đúng người nhận, nội dung draft/published, nhật ký. Retry gửi thông báo không phải mua hoặc giao lại. https://github.com/kandinz/TiemDigital/issues/21
- Tài chính gồm báo cáo, thu chi, ví/sổ cái và ngân hàng/đối soát; hoàn ví trực tiếp chỉ toàn bộ đơn đủ điều kiện đã trả bằng ví. Số tổng thiếu nguồn hiện “Chưa đủ dữ liệu”, không lấy số 0 thay thế. https://github.com/kandinz/TiemDigital/issues/22

## Khoảng trống tài chính phải giải quyết riêng

Owner chốt mọi Mua dùng/Mua nhập kho là chi phí ngay khi mua thành công; khi bán ghi tiền bán, không trừ tiền nhập lần nữa. API hiện tại không bảo đảm tính đúng: báo cáo cũ bỏ chi purchase hoặc tính giá vốn theo hàng đã giao, commerce-report nhóm đơn theo ngày tạo thay vì ngày thanh toán, giá NCC lưu từ input và tiền tệ/tỷ giá thực chưa được chứng minh. Liên kết transaction chi vào purchase_order_id còn làm serializer hiểu nhầm đã bán và cờ nhập kho sai. Không cộng máy móc các báo cáo, không tự mua lại và không gọi số thiếu là lợi nhuận đúng. Đối chiếu: https://github.com/kandinz/TiemDigital/issues/15#issuecomment-6539049213

Yêu cầu dữ liệu và kiểm thử cho effort backend/build riêng: https://github.com/kandinz/TiemDigital/issues/23. Phần frontend có thể xây bố cục và trạng thái thiếu dữ liệu trước; chỉ bật số tổng hợp đáng tin khi hợp đồng dữ liệu và đối soát đã đáp ứng.

## Thứ tự triển khai đề xuất

1. Khôi phục môi trường build; kiểm tra build, typecheck và test hiện có; giữ nguyên thay đổi ngoài phạm vi. Snapshot prototype theo #20.
2. Thiết lập nền React, token, layout, điều hướng responsive, DataTable/panel và theme chung. Mỗi màn kết nối qua hợp đồng HTTP đã kiểm kê, không thay API âm thầm.
3. Storefront danh mục/chi tiết, xác thực, checkout, QR/ví và đơn hàng; kiểm thử giữ lựa chọn, không tạo đơn/trả tiền trùng, giao một phần và khôi phục lịch sử.
4. Admin sản phẩm/NCC/lên kệ, mua dùng/nhập kho và đơn bán/cảnh báo. Kiểm thử từng trạng thái, idempotency và giới hạn dữ liệu; không xóa hoặc sửa nghiệp vụ backend để làm UI trông hoàn chỉnh.
5. Admin nhà cung cấp/cài đặt/Telegram/CMS và tài chính. Nối các số liệu đã xác minh, để trạng thái chờ cho số tổng chưa đủ điều kiện; tách yêu cầu backend #23.
6. Kiểm tra desktop/mobile 320–1024 trở lên, sáng/tối, bàn phím, thông báo trạng thái, giới hạn API, lỗi/đối soát và đối chiếu luồng với các ticket. Chạy build/typecheck/test liên quan, GitNexus impact trước sửa và detect_changes scope all trước commit theo AGENTS.md, rồi commit/push theo quy định repository.

Đây là thứ tự phân nhóm và nghiệm thu, không phải kế hoạch triển khai chi tiết từng file/hàm; effort build cần lập kế hoạch kỹ thuật sau khi xác định hợp đồng #23.

## Prototype và nguồn

Các file dưới đây trong cùng thư mục với tài liệu này; chúng dùng dữ liệu minh họa, không gọi API và không thực hiện giao dịch. Các màn con có chỗ chỉ minh họa bố cục, các yêu cầu chưa mô phỏng được liệt kê trong resolution của từng ticket.

| Phần | File prototype | Ticket |
| --- | --- | --- |
| Hướng thị giác | `tiemdigital-visual-directions.html` | #2 |
| Danh mục và chi tiết | `tiemdigital-storefront-wireframe.html` | #12 |
| Mua, thanh toán, nhận hàng | `tiemdigital-checkout-wireframe.html` | #11 |
| Tài khoản và ví | `tiemdigital-account-wireframe.html` | #13 |
| Hôm nay và điều hướng | `tiemdigital-admin-today.html` | #16 |
| Sản phẩm và lên kệ | `tiemdigital-admin-products.html` | #18 |
| Mua NCC và nhập kho | `tiemdigital-admin-purchase.html` | #17 |
| Đơn bán, bảo hành, khách hàng | `tiemdigital-admin-orders.html` | #19 |
| NCC và cài đặt | `tiemdigital-admin-settings.html` | #21 |
| Tài chính và đối soát | `tiemdigital-admin-finance.html` | #22 |

Các `check-*.cjs` và `*-check.json` tương ứng ghi smoke check Chrome. Kiểm kê màn hình/API ở commit 575586d: https://github.com/kandinz/TiemDigital/issues/10#issuecomment-6538135680. Smoke check prototype không thay cho test tích hợp hay audit accessibility.

## Còn mở

- https://github.com/kandinz/TiemDigital/issues/20 — theo dõi snapshot Git của bộ prototype. Lần build trước thất bại vì thiếu `tsc`; ngày 01/11/2026 đã khôi phục dependency bằng `npm ci` và build, typecheck, 128 test đều qua trên commit gốc `575586d`.
- https://github.com/kandinz/TiemDigital/issues/23 — dữ liệu và hợp đồng để báo cáo thu/chi theo yêu cầu; ngoài phạm vi sửa backend của map này.
- `docs/mmo-migration.md` đang bị xóa trong checkout từ trước, không thuộc công việc plan; không stage hoặc khôi phục khi chưa được yêu cầu.
