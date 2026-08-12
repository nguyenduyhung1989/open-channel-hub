# Lộ trình

Lộ trình mô tả thứ tự ưu tiên, không phải lịch hứa phát hành. Chỉ một mục đủ tiêu chí mới được chuyển sang “đã làm”.

## Chặng 0 — nền móng có thể kiểm tra (đang làm)

- [x] Kho mã công khai, AGPL-3.0-or-later, tài liệu cộng đồng và chính sách bảo mật.
- [x] CI kiểm tra định dạng, lint, kiểu dữ liệu, kiểm thử, bản dựng và quét mã.
- [x] API `GET /health`, cấu hình khởi động được xác thực.
- [x] Hợp đồng connector, kiểm tra năng lực và lát cắt `Telegram Bot` dùng cổng mô phỏng.
- [ ] Chốt kiểm thử hồi quy và phát hành `0.1.0` sau khi toàn bộ cổng kiểm tra xanh trên commit cuối.

Không có token Telegram thật, gọi Telegram thật, cơ sở dữ liệu, Redis hay giao diện web trong chặng này.

Các ô đã đánh dấu mô tả mã/tệp cấu hình hiện có trong kho mã; chúng không thay cho một lần CI xanh trên commit phát hành cuối hoặc xác nhận production.

## Chặng 1 — Telegram Bot chính thức, nhỏ nhưng thật

- Cấp quyền/cấu hình token theo cách không đưa bí mật vào log hay mã nguồn.
- Gửi/nhận phạm vi Telegram Bot tối thiểu qua API chính thức.
- Xác thực webhook, kiểm thử adapter và hướng dẫn vận hành cục bộ.
- Chỉ gọi là hoàn thành khi có kiểm thử không gọi mạng thật, tài liệu cấu hình và kiểm tra hoạt động với một tài khoản thử nghiệm được uỷ quyền.

## Chặng 2 — dữ liệu bền vững và vận hành tối thiểu

- PostgreSQL, migration an toàn và kho lưu trữ rõ ranh giới.
- Redis/hàng đợi/hộp thư đi chỉ khi yêu cầu gửi lại hoặc tải thực tế chứng minh cần.
- Nhật ký có cấu trúc, chỉ số, sao lưu và chính sách giữ/xoá dữ liệu.

## Chặng 3 — trải nghiệm quản trị và kết nối chính thức tiếp theo

- Bảng điều khiển, tài khoản/tổ chức và phân quyền được kiểm thử.
- Đánh giá Facebook Page, Zalo OA và WhatsApp dựa trên tài liệu/chính sách chính thức tại thời điểm triển khai.
- Mỗi connector có ma trận năng lực, trạng thái sức khoẻ và kiểm thử hợp đồng riêng.

## Chặng 4 — connector thử nghiệm, chỉ khi có căn cứ

Facebook User và Zalo User không được coi là lời hứa tính năng. Nếu được nghiên cứu, chúng phải là gói tách biệt, tự nguyện bật, giới hạn năng lực, nêu rủi ro/pháp lý rõ ràng và không có tính năng né chống tự động hoá, giả dấu vết, vượt CAPTCHA hay gửi thư rác.

## Không nằm trong lộ trình

- Bot tự động gửi hàng loạt, thu thập trái phép hay lách giới hạn nhà cung cấp.
- Lưu/đăng dữ liệu hoặc bí mật thật trong kho mã.
- Tuyên bố “tương tự Func đầy đủ” trước khi các lát cắt độc lập có kiểm thử và vận hành được.
