# TiệmDigital UI/UX — prototype bàn giao

Đây là **prototype dùng để lập kế hoạch**, với dữ liệu và thao tác mô phỏng. Không dùng các file này làm giao diện production, và không nhập mật khẩu, API key hoặc dữ liệu khách hàng thật.

- [Tài liệu bàn giao](tiemdigital-uiux-handoff.md) tổng hợp quyết định, thứ tự thực hiện và các giới hạn API.
- Các file `tiemdigital-*.html` là nguồn fragment; file cùng tên có đuôi `.preview.html` là bản xem độc lập.
- Các file `*-check.json` ghi kết quả kiểm tra bản mẫu trong môi trường đã tạo. Script `check-*.cjs` và `extract-preview.py` được giữ kèm làm tài liệu kiểm tra; script Chrome giả định Windows và đường dẫn Chrome mặc định.

Để xem, chạy trong thư mục này:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Mở `http://127.0.0.1:8000/` rồi chọn file `.preview.html`. Dừng server bằng Ctrl+C.

Các bản mẫu từng được kiểm tra tương tác ở 1024, 736, 390 và 320 px. Đó không phải test tích hợp API hoặc audit accessibility. Những phần chỉ mô phỏng bố cục và các yêu cầu build còn lại được ghi trong tài liệu bàn giao và các issue liên kết.

Tại ngày 01/11/2026, trên commit gốc `575586d`, sau khi cài dependency bằng `npm ci`, `npm run build`, `npm run typecheck` và `npm test` đều thành công (12 tập test, 128 test). Chi tiết điều kiện dữ liệu tài chính được theo dõi tại [issue #23](https://github.com/kandinz/TiemDigital/issues/23).
