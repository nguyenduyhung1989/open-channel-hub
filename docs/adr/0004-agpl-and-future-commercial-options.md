# ADR-0004: AGPL-3.0-or-later và lựa chọn thương mại tương lai

**Ngày:** 2026-08-12
**Trạng thái:** accepted

## Bối cảnh

Dự án là trung tâm nhắn tin tự triển khai. Một bên có thể sửa mã rồi vận hành thành dịch vụ mạng mà không phân phối binary, khiến giấy phép copyleft thông thường không kích hoạt nghĩa vụ cung cấp mã nguồn cho người dùng dịch vụ.

Mục tiêu là giữ các cải tiến cho dịch vụ mạng có thể quay lại cộng đồng, đồng thời không tự lừa mình rằng giấy phép thay thế được chất lượng kỹ thuật, bảo mật hay mô hình kinh doanh.

## Quyết định

Phát hành mã nguồn theo `AGPL-3.0-or-later`.

Theo Điều 13, khi một bên sửa chương trình và cho người khác tương tác với bản đã sửa qua mạng, bản đó phải cho các người dùng từ xa cơ hội nhận mã nguồn tương ứng của phiên bản đang chạy. Điều này áp dụng cho **bản đã sửa** và cần đọc toàn văn giấy phép để đánh giá các tình huống kết hợp/phân phối cụ thể.

Dự án không hứa hẹn giấy phép thương mại, ngoại lệ SaaS hay giấy phép kép ở thời điểm này. Đóng góp theo chính sách đầu vào-bằng-đầu-ra: contributor giữ bản quyền nhưng cho phép phân phối phần đóng góp theo AGPL-3.0-or-later.

## Phương án đã cân nhắc

### Apache-2.0

- Ưu: dễ dùng cho thư viện/hệ sinh thái, có điều khoản bằng sáng chế rõ.
- Nhược: bên vận hành SaaS có thể sửa và giữ phần sửa kín.
- Không chọn: không khớp mục tiêu chia sẻ cải tiến cho dịch vụ mạng.

### Giấy phép kép ngay từ đầu

- Ưu: có đường bán ngoại lệ thương mại rõ hơn.
- Nhược: cần quyền cấp lại giấy phép đủ đối với mọi đóng góp; hiện không có CLA/thoả thuận chuyển nhượng bản quyền để bảo đảm điều đó.
- Không chọn bây giờ: không hứa một quyền mà dự án chưa có.

## Hệ quả

- README và các artifact phát hành phải nêu đúng AGPL, không dùng nhãn “open source” mơ hồ.
- Trước bất kỳ đề nghị giấy phép thương mại/giấy phép kép nào, maintainer cần đánh giá mô hình quyền tác giả, chính sách đóng góp, tư vấn pháp lý phù hợp và một ADR mới.
- Dịch vụ lưu trữ, hỗ trợ, tư vấn, tích hợp và thương mại hoá khác vẫn có thể tồn tại; quyết định kinh doanh đó không tự thay đổi nghĩa vụ của AGPL.
