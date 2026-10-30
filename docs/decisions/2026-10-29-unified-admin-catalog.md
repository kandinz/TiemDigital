# ADR: Hợp nhất quản trị và danh mục sản phẩm

Ngày: 2026-10-29 (Asia/Bangkok).

Trạng thái: Đã chốt thiết kế và được người dùng yêu cầu triển khai qua skill implement; chưa triển khai lên production.

## Bối cảnh đã kiểm tra

- `src/pages/AdminPage.tsx` có tab MMO nhúng ứng dụng Vue bằng iframe `/admin/mmo-ui`.
- `src/services/api.ts` gọi `/api/catalog`; `workers/index.ts` đọc danh mục từ bảng `products` nội bộ.
- Danh mục bán lẻ trong phần MMO dùng bảng `mmo_retail_products`, tách khỏi danh mục cửa hàng.
- Đơn hàng cửa hàng đã thanh toán chuyển sang chờ giao; admin hiện giao dữ liệu qua chức năng giao đơn. Việc đặt mua từ nhà cung cấp có luồng riêng.

## Quyết định đã chốt

1. MMO không còn là phân hệ, tab hay giao diện quản trị riêng. Các tính năng hiện có phải trở thành các chức năng trong page admin chung, sử dụng giao diện thống nhất.
2. Trang sản phẩm lấy dữ liệu từ danh mục được cấu hình trong admin của TiệmDigital; không phụ thuộc API của `gumtool.pages.dev`.
3. Một mục Sản phẩm quản lý cả sản phẩm tự tạo và sản phẩm được chọn từ nhà cung cấp. Người dùng xác nhận “có” khi được hỏi về việc hỗ trợ đồng thời hai nguồn sản phẩm này.
4. Với sản phẩm từ NCC, sau khi khách thanh toán được xác nhận, hệ thống tự đặt mua từ NCC và giao hàng cho khách. Người dùng xác nhận “hệ thống tự mua và giao hàng”; đây là phạm vi của đợt sửa này.
5. Khi NCC timeout và chưa rõ đã mua thành công hay chưa, giữ đơn chờ đối soát, báo admin và không tự đặt mua lại để tránh trùng đơn.
6. Khi NCC xác nhận thất bại hoặc hết hàng, đánh dấu đơn cần xử lý và báo admin. Admin kiểm tra rồi quyết định mua lại, đổi nguồn hoặc hoàn tiền; hệ thống không tự thực hiện các thao tác này. Người dùng chốt “phương án admin xử lý”.
7. Sản phẩm tự tạo được quản trị viên nhập sẵn dữ liệu giao hàng (key, tài khoản hoặc dữ liệu tương ứng) vào kho. Sau khi thanh toán được xác nhận, hệ thống tự giao từ kho. Người dùng chốt “tự giao từ kho”.
8. Giá bán sản phẩm từ NCC được tự điền dựa trên cấu hình tỷ lệ lợi nhuận % khi admin thêm hoặc chỉnh sản phẩm. Admin có quyền sửa giá bán thành một giá khác.
9. Có một tỷ lệ lợi nhuận % mặc định chung; từng sản phẩm được phép ghi đè bằng tỷ lệ % riêng. Người dùng chốt “một mức % mặc định chung, cho phép từng sản phẩm ghi đè”.
10. Khi giá nhập NCC tăng bao nhiêu %, giá bán tăng cùng tỷ lệ %, kể cả giá bán admin đã sửa tay. Ví dụ giá nhập từ 100.000đ lên 110.000đ (+10%), giá bán từ 120.000đ lên 132.000đ (+10%). Công thức là `giá bán mới = giá bán cũ × (giá nhập mới / giá nhập cũ)` khi giá nhập cũ lớn hơn 0. Quyết định mới nhất “Khi NCC tăng giá bao nhiêu % thì giá bán bấy nhiêu %” thay thế phương án không tự tăng giá và chờ admin sửa giá bán. Người dùng xác nhận “có” khi được hỏi quy tắc này có áp dụng cho giá admin sửa tay hay không.
11. Giá bán mới chỉ áp dụng cho đơn mới. Với đơn đã thanh toán theo giá cũ, không tự thu thêm tiền của khách.
12. Nếu giá nhập NCC tăng khiến đơn đã thanh toán bị lỗ trước khi đặt mua, dừng mua và báo admin xử lý. Người dùng chốt “dừng mua, báo admin xử lý”. Không tự tiếp tục mua với giá gây lỗ.
13. Công thức tự điền giá theo tỷ lệ lợi nhuận là `giá bán = giá nhập × (1 + tỷ lệ % / 100)`. Ví dụ giá nhập 100.000đ, tỷ lệ 20% thì giá bán gợi ý là 120.000đ. Công thức này dùng khi admin thêm hoặc chỉnh sản phẩm; cần phân biệt tỷ lệ lợi nhuận cấu hình với tỷ lệ NCC tăng giá ở mục 10.
14. Đơn có nhiều sản phẩm được giao ngay phần đã thành công; phần lỗi chuyển admin xử lý. Khách thấy trạng thái “Giao một phần” và chi tiết từng sản phẩm. Người dùng xác nhận “Đồng ý”.
15. Khi NCC giảm giá nhập, giữ nguyên giá bán. Admin có thể chủ động sửa giá bán. Người dùng chốt “giữ nguyên giá bán”; không tự giảm giá bán cùng tỷ lệ NCC.
16. Với sản phẩm tự giao từ kho, không giữ hàng theo thời điểm tạo đơn chưa thanh toán. Ưu tiên giao cho khách thanh toán thành công trước. Chỉ giao dữ liệu sau khi thanh toán được xác nhận; một đơn vị hàng không được giao cho hai khách. Người dùng yêu cầu “giao cho khách hàng thanh toán thành công trước”.
17. Nếu khách đã thanh toán nhưng kho tự tạo đã hết do giao cho khách thanh toán thành công trước, báo admin xử lý. Không tự hoàn tiền. Người dùng chốt “không tự hoàn tiền báo admin xử lý”.
18. Bố cục admin chung được người dùng xác nhận “ok”:
    - Sản phẩm: danh mục bán, chọn hàng NCC, kho key/tài khoản, cấu hình giá.
    - Nhà cung cấp: kết nối API, số dư, đồng bộ danh mục NCC.
    - Đơn hàng: đơn khách, đơn nhập NCC, giao hàng, đối soát, bảo hành.
    - Tổng quan / Tài chính: doanh thu, chi phí, lợi nhuận và giao dịch.
    Các mục dùng chung giao diện admin; bỏ tab MMO và iframe riêng.
19. Cảnh báo đơn cần xử lý hoặc chờ đối soát được hiển thị trong admin và gửi Telegram đến tài khoản/nhóm quản trị được cấu hình. Người dùng chốt “cả 2”.

## Lựa chọn kỹ thuật trong bản thiết kế triển khai

Các mục dưới đây được tổng hợp trong thiết kế trước khi người dùng yêu cầu triển khai:

- Làm tròn giá tính tự động lên đồng VND nguyên; tỷ lệ lợi nhuận mặc định do admin cấu hình, không tự chọn một mức % kinh doanh cho người dùng.
- Nếu chưa có giá nhập cũ hợp lệ thì không chia tỷ lệ tăng giá; ghi nhận mốc giá nhập và báo admin khi cần kiểm tra giá bán. Giá bán gợi ý lúc thêm sản phẩm vẫn dùng công thức tỷ lệ lợi nhuận đã chốt.
- Đồng bộ NCC cập nhật giá nhập, tồn kho và giá bán theo quy tắc tăng giá đã chốt; giữ tên, mô tả, ảnh, danh mục và trạng thái hiển thị admin đã cấu hình.
- Giữ giá đã chốt cả với đơn cũ chưa thanh toán, theo nguyên tắc giá mới chỉ áp dụng cho đơn mới. Sau thanh toán vẫn kiểm tra tồn kho và nguy cơ lỗ trước khi giao/mua.
- Hợp nhất dữ liệu theo hướng giữ sản phẩm và lịch sử hiện có, có ánh xạ ID để tránh nhầm sản phẩm; không xóa dữ liệu cũ hoặc đổi liên kết lịch sử đơn hàng một cách ngầm định.

Bản thiết kế tổng hợp và trình tự triển khai: [Hợp nhất admin và danh mục](../plans/2026-10-29-unified-admin-catalog.md).

## Giới hạn của tài liệu

Danh mục đích dùng bảng products và metadata product_sources; catalog_imports ánh xạ ID kệ bán lẻ cũ. Cơ chế giao hàng dùng fulfillments, product_inventory và admin_alerts, giữ nguyên schema lịch sử orders và sổ cái. Thay đổi cần áp dụng schema trước khi triển khai phiên bản mới.

Thuật ngữ: [Glossary](../glossary.md).
