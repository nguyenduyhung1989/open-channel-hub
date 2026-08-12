# Đóng góp cho Open Channel Hub

Cảm ơn mày đã muốn làm dự án tốt hơn. Chặng 0 còn nhỏ nên đóng góp tốt nhất là một thay đổi hẹp, có lý do rõ ràng và có kiểm tra đi kèm.

## Trước khi bắt đầu

1. Đọc [README.md](README.md), [ROADMAP.md](ROADMAP.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) và các [ADR](docs/adr/README.md) liên quan.
2. Tìm issue/PR đang có để tránh làm trùng.
3. Với thay đổi lớn về kiến trúc, bộ kết nối mới hay quyền riêng tư, mở issue thảo luận trước. Đừng đổ một bể thiết kế xuống PR rồi bắt mọi người bơi.

## Chuẩn bị môi trường

Dùng Node.js `24.18.1`, phiên bản được CI và Docker ghim chính xác.

```bash
git clone https://github.com/nguyenduyhung1989/open-channel-hub.git
cd open-channel-hub
npm ci
cp .env.example .env
npm run check
```

Không cần token hay tài khoản nhà cung cấp để chạy kiểm thử. Nếu mày phát hiện một quy trình buộc người đóng góp phải có bí mật thật ở Chặng 0, hãy báo đó là lỗi thiết kế.

## Cách làm một thay đổi

- Tạo nhánh có tên rõ nghĩa, ví dụ `feature/telegram-normalizer` hoặc `fix/health-response`.
- Giữ quy tắc nghiệp vụ trong `packages/domain`; bộ kết nối chỉ dịch dữ liệu nhà cung cấp qua các hợp đồng ở `packages/connector-sdk` và `packages/contracts`.
- Dữ liệu từ HTTP, webhook và nhà cung cấp luôn là không đáng tin: xác thực ở ranh giới trước khi dùng.
- Mọi tính năng gửi hành động phải bị chặn trước khi gọi nhà cung cấp nếu connector không công bố năng lực đó.
- Viết kiểm thử hành vi cho trường hợp thành công, đầu vào sai và năng lực không có. Kiểm thử không được gọi mạng thật.
- Không tự thêm PostgreSQL, Redis, hàng đợi hay giao diện chỉ vì “sau này chắc cần”; chỉ thêm khi lát cắt dọc hiện tại cần nó.

Trước khi mở PR, chạy:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Hoặc chạy một lần:

```bash
npm run check
```

## Pull request

Một PR nên giải quyết một ý chính, mô tả rõ:

- Vấn đề và lý do thay đổi.
- Phạm vi thực hiện và điều cố ý không làm.
- Lệnh kiểm tra đã chạy cùng kết quả.
- Rủi ro về tương thích, bảo mật hoặc dữ liệu.
- Tài liệu/ADR cần sửa, nếu có.

Đừng đưa bí mật vào lịch sử Git: token bot, cookie, khoá API, payload webhook thật, số điện thoại và nội dung hội thoại đều bị cấm. Dùng dữ liệu giả tổng hợp trong mã, kiểm thử, issue và ảnh chụp màn hình.

## Giấy phép cho phần đóng góp

Bằng việc gửi phần đóng góp, mày xác nhận mình có quyền gửi nó và đồng ý để phần đó được phân phối theo [AGPL-3.0-or-later](LICENSE). Đây là chính sách “đầu vào bằng đầu ra”; dự án hiện không có CLA hay thoả thuận chuyển nhượng bản quyền riêng.

Nếu một ngày dự án cân nhắc giấy phép kép hoặc ngoại lệ thương mại, việc đó phải được thảo luận công khai trước vì các phần đóng góp hiện tại không tự động trao cho maintainer toàn bộ quyền cấp lại giấy phép.

## Hành vi và bảo mật

Tuân theo [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Lỗ hổng bảo mật phải đi theo [SECURITY.md](SECURITY.md), không dùng issue/PR công khai.
