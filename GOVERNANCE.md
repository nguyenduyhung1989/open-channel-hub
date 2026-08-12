# Cách dự án ra quyết định

## Giai đoạn hiện tại

Open Channel Hub ở Chặng 0 và hiện do một maintainer điều phối. Điều đó không biến mọi quyết định thành bí mật: thay đổi đáng kể phải có issue/PR, lý do kỹ thuật và, khi phù hợp, ADR công khai.

## Vai trò

- **Maintainer:** duy trì mục tiêu sản phẩm, xét duyệt thay đổi, xử lý sự cố bảo mật, cắt phát hành và bảo vệ ranh giới dự án.
- **Contributor:** gửi issue, tài liệu, kiểm thử hoặc PR theo [CONTRIBUTING.md](CONTRIBUTING.md).
- **Reviewer:** xem xét tính đúng, phạm vi, kiểm thử, bảo mật và tính trung thực của tài liệu; không tự tạo quyền ghi vào kho mã.

## Cách quyết định

1. Việc nhỏ: thảo luận trong issue/PR, maintainer chốt dựa trên bằng chứng và phạm vi.
2. Quyết định ảnh hưởng kiến trúc, giấy phép, dữ liệu, mô hình quyền hoặc chiến lược connector: ghi ADR trước/đồng thời với thay đổi.
3. Lỗ hổng khẩn cấp: maintainer có thể vá kín trước để giảm hại, rồi công bố lý do và thay đổi khi an toàn.

Ưu tiên là tích hợp chính thức, bảo vệ dữ liệu và lát cắt nhỏ chạy được. “Nhiều nền tảng hơn” không thắng được một ranh giới kém an toàn hoặc một lời hứa không có kiểm thử.

## Phát hành

Một phiên bản chỉ được phát hành sau khi phần thay đổi có kiểm thử phù hợp, CI xanh, tài liệu trạng thái được cập nhật và không còn bí mật/dữ liệu thật trong thay đổi. `main` phải luôn có khả năng kiểm tra được; việc có CI xanh không tự động nghĩa là đã đủ điều kiện production.

## Thay đổi chính sách này

Mọi thay đổi governance quan trọng được đề xuất qua PR, thảo luận công khai tối thiểu 7 ngày khi không khẩn cấp, rồi maintainer quyết định và ghi lý do.
