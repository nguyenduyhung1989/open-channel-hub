# ADR-0002: Tầng connector ưu tiên chính thức

**Ngày:** 2026-08-12
**Trạng thái:** accepted

## Bối cảnh

Nền tảng nhắn tin có mức hỗ trợ chính thức, mô hình cấp quyền và rủi ro rất khác nhau. Một connector dựa trên API công khai không tương đương với connector tái sử dụng phiên người dùng hay hành vi không được nhà cung cấp hỗ trợ.

Nếu che khác biệt này sau một nhãn “đã hỗ trợ”, người vận hành không biết mình đang chấp nhận điều gì và dự án dễ trượt sang tính năng né chính sách.

## Quyết định

Mỗi bộ kết nối (connector) phải công bố một tầng rõ ràng. Các giá trị trong mã hiện là chữ in hoa:

| Tầng              | Ý nghĩa                                                                                                                                            | Quy tắc                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `OFFICIAL`        | Dùng API/luồng cấp quyền có tài liệu của nhà cung cấp.                                                                                             | Là đường ưu tiên cho sản phẩm.                                |
| `OFFICIAL_CLIENT` | Chỗ giữ trong hợp đồng cho một bề mặt phía gửi chính thức của nhà cung cấp có phạm vi/quyền riêng. Chưa có bộ kết nối nào dùng tầng này ở Chặng 0. | Phải có ADR và mô tả quyền/rủi ro riêng trước khi triển khai. |
| `EXPERIMENTAL`    | Có tính không chắc chắn về chính sách/kỹ thuật, ví dụ dựa vào phiên đăng nhập.                                                                     | Tách gói, tự nguyện bật, ghi rõ rủi ro và giới hạn năng lực.  |

`deferred` là trạng thái lộ trình, không phải một giá trị `ConnectorTier` trong mã: nghĩa là chưa có căn cứ kỹ thuật/pháp lý đủ để xây và không được giới thiệu như tính năng.

Bộ kết nối `EXPERIMENTAL` không được chứa né CAPTCHA, giả dấu vết thiết bị, vượt cơ chế chống tự động hoá, đánh cắp phiên, thu thập trái phép hay gửi thư rác hàng loạt. Nếu không thể cung cấp nó mà không cần các hành vi đó, nó thuộc trạng thái `deferred`.

Hiện chỉ có `Telegram Bot` **mô phỏng**; không có connector chính thức chạy mạng thật trong repository ở thời điểm ADR này.

## Phương án đã cân nhắc

### Một giao diện “đã hỗ trợ” cho mọi nền tảng

- Ưu: mô tả marketing đơn giản.
- Nhược: che mất khác biệt quyền, độ bền và rủi ro.
- Không chọn: trái với minh bạch vận hành.

### Cấm tuyệt đối mọi connector không chính thức

- Ưu: rủi ro sản phẩm nhỏ hơn.
- Nhược: chặn luôn nghiên cứu hợp pháp/tự nguyện có thể hữu ích.
- Không chọn: giữ `EXPERIMENTAL` bị cô lập, nhưng chỉ sau khi có ADR cụ thể và kiểm tra chính sách hiện hành.

## Hệ quả

- Giao diện, tài liệu và API phải hiển thị tầng connector, không chỉ tên nền tảng.
- Một connector mới cần ma trận năng lực, nguồn chính sách/API, mô hình dữ liệu, kiểm thử và ADR khi rủi ro thay đổi.
- Việc chấp nhận connector không chính thức là quyết định riêng từng connector, không phải tiền lệ mặc định.
