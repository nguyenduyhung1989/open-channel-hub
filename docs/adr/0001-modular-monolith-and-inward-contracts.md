# ADR-0001: Modular monolith và hợp đồng hướng vào trong

**Ngày:** 2026-08-12
**Trạng thái:** accepted

## Bối cảnh

Open Channel Hub hướng tới nhiều connector và nhiều giao diện, nhưng Chặng 0 chỉ có một API nhỏ cùng lát cắt `Telegram Bot` mô phỏng. Tách microservice hay dựng hàng đợi ngay bây giờ sẽ tạo vận hành, triển khai và lỗi phân tán trước khi có một luồng thật chứng minh cần chúng.

Đồng thời, mỗi connector không được kéo SDK hay chi tiết nhà cung cấp vào quy tắc nghiệp vụ chung.

## Quyết định

Dùng modular monolith trong một tiến trình triển khai, chia bằng npm workspaces:

- `packages/contracts`: kiểu và hợp đồng chuẩn.
- `packages/domain`: quy tắc nghiệp vụ thuần, không phụ thuộc framework hay SDK.
- `packages/connector-sdk`: cổng connector hướng vào lõi.
- `packages/connector-*`: adapter dịch dữ liệu nhà cung cấp.
- `apps/api`: adapter HTTP và điểm ghép phụ thuộc.

Phụ thuộc đi vào trong: adapter → hợp đồng/lõi; lõi không nhập Fastify, ORM hay SDK nhà cung cấp. Chỉ tách tiến trình khi một lát cắt chạy thật cho thấy nhu cầu về cô lập tải, độ tin cậy hoặc quyền truy cập riêng.

## Phương án đã cân nhắc

### Microservice từ đầu

- Ưu: cô lập triển khai và mở rộng độc lập trên giấy.
- Nhược: thêm mạng nội bộ, hàng đợi, quan sát, bí mật và phối hợp phát hành khi chưa có lưu lượng hay dữ liệu bền vững.
- Không chọn: không phù hợp KISS/YAGNI ở Chặng 0.

### Một thư mục ứng dụng phẳng

- Ưu: bắt đầu nhanh hơn.
- Nhược: logic chung và chi tiết connector sẽ lẫn, khó kiểm thử và khó tách connector sau này.
- Không chọn: chi phí tách lại cao hơn phần hợp đồng nhỏ hiện tại.

## Hệ quả

- Chúng ta có một artifact triển khai đơn giản, một lockfile và ranh giới kiểm thử rõ.
- Mỗi connector phải khai báo năng lực; lệnh không được gọi nhà cung cấp khi năng lực vắng mặt.
- Tách dịch vụ sau này đòi hỏi ADR mới, kế hoạch dữ liệu/quan sát/triển khai và bằng chứng rằng monolith là nút thắt thật.
