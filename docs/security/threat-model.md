# Mô hình đe doạ Chặng 0

**Ngày rà soát:** 2026-08-12
**Trạng thái:** bản đầu cho alpha; không phải chứng nhận bảo mật hoặc xác nhận production-ready.

## Sự thật trước, kế hoạch sau

| Đã có trong Chặng 0                                                                         | Chưa có / chỉ là kế hoạch                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| API HTTP tối thiểu với kiểm tra sức khoẻ; cấu hình khởi động được kiểm tra kiểu/giới hạn.   | Tài khoản người dùng, tổ chức, phân quyền, giao diện web và quản trị.                                         |
| Hợp đồng connector và lát cắt `Telegram Bot` dùng cổng mô phỏng, dữ liệu kiểm thử tổng hợp. | Token Telegram thật, gọi API Telegram thật, webhook Telegram hay gửi tin nhắn thật.                           |
| Tệp cấu hình CI, CodeQL, Dependabot và Dockerfile dùng người dùng không phải root.          | PostgreSQL, Redis, hàng đợi/hộp thư đi bền vững, sao lưu, mã hoá dữ liệu lưu trữ.                             |
| Chính sách không lưu bí mật/dữ liệu thật trong mã và kiểm thử.                              | Giới hạn tốc độ, xác thực request/webhook, audit log, quan sát production và quy trình đổi bí mật hoàn chỉnh. |

Không diễn giải một ô bên trái thành lời hứa rằng các ô bên phải đã được giải quyết.

## Hai vùng tin cậy

### Vùng A — bên ngoài, không đáng tin

Bao gồm mọi yêu cầu HTTP, dữ liệu người dùng, payload webhook/nhà cung cấp trong tương lai, thông tin trong issue/PR và bất kỳ input nào đi qua mạng. Người gửi có thể sai, bị giả mạo hoặc cố ý độc hại.

Mọi dữ liệu từ vùng này phải được xác thực ở ranh giới, có giới hạn kích thước/phạm vi khi một route mới xuất hiện, và không được biến thành truy vấn, lệnh, URL gọi ra ngoài hoặc nội dung HTML mà không kiểm soát.

### Vùng B — runtime do người vận hành kiểm soát

Bao gồm mã đã được duyệt, tiến trình API, cấu hình môi trường, cổng mô phỏng, container và bí mật sẽ được thêm ở tương lai. Vùng này chỉ đáng tin ở mức người vận hành có quyền kiểm soát máy chủ; nó không làm một biến môi trường bị lộ trở nên an toàn, cũng không biến dữ liệu nhà cung cấp thành đáng tin.

Ranh giới chính là: input HTTP vào API; cấu hình môi trường vào lúc khởi động; và trong tương lai, lệnh hub đi ra connector/nhà cung cấp. Mỗi lần vượt ranh giới phải có xác thực, quyền tối thiểu và nhật ký không chứa bí mật.

## Tài sản cần bảo vệ

- Tính toàn vẹn của mã nguồn, dependency, CI và artifact container.
- Khả năng hoạt động của API cục bộ và các hành động connector sau này.
- Bí mật nhà cung cấp, token, cookie và cấu hình vận hành — hiện chưa có trong kho mã.
- Dữ liệu hội thoại, định danh liên hệ và nhật ký — hiện chưa được lưu, nhưng sẽ thành dữ liệu nhạy cảm khi thêm persistence.

## Các đe doạ và hàng rào

| Đe doạ                                                            | Hàng rào hiện có                                                                         | Việc bắt buộc trước khi feature liên quan được gọi là production-ready                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Input HTTP sai định dạng hoặc bất ngờ                             | Cấu hình môi trường được kiểm tra; adapter được yêu cầu xác thực ở ranh giới.            | Schema/giới hạn cho mọi route mới, kiểm thử input xấu, lỗi không lộ chi tiết nội bộ.                                             |
| Connector thực hiện hành động quá quyền                           | Hợp đồng yêu cầu khai báo năng lực trước khi thực thi.                                   | Kiểm thử từ chối năng lực, quyền theo tổ chức/tài khoản, xác nhận thao tác nhạy cảm.                                             |
| Lộ token/cookie/dữ liệu thật                                      | `.env` bị bỏ qua; fixtures phải tổng hợp; policy cấm đưa bí mật vào kênh công khai.      | Secret manager, đổi bí mật, redaction log, quét lịch sử, đào tạo người vận hành.                                                 |
| URL/SDK nhà cung cấp bị lợi dụng thành SSRF hoặc gửi ngoài ý muốn | Chưa có gọi mạng thật ở connector mock.                                                  | Allowlist đích, timeout, phân tách DNS/IP nội bộ, retry có giới hạn và kiểm thử lỗi mạng.                                        |
| Webhook giả mạo hoặc gửi lại                                      | Chưa có webhook thật.                                                                    | Kiểm chữ ký, chống lặp/idempotency, giới hạn tốc độ, thời hạn timestamp và kiểm thử hợp đồng.                                    |
| Dependency hoặc workflow CI bị xâm nhập                           | Tệp CI dùng `npm ci`; Dependabot/CodeQL và GitHub Actions ghim commit SHA được khai báo. | Bật/tạo kiểm tra GitHub thực tế, branch protection, rà soát cảnh báo, SBOM/artifact provenance và quy trình cập nhật dependency. |
| Container có quyền quá rộng                                       | Image ghim phiên bản, đa giai đoạn, người dùng không phải root; compose hạ quyền Linux.  | TLS/reverse proxy, giới hạn tài nguyên, giám sát, sao lưu và kiểm thử phục hồi.                                                  |
| Prompt injection / tính năng AI về sau                            | Chưa có tính năng AI, RAG hay agent trong sản phẩm.                                      | Mô hình đe doạ riêng, tách dữ liệu không tin cậy khỏi chỉ dẫn, lọc output và giới hạn chi phí/quyền.                             |

## Giả định và giới hạn

- Máy người vận hành, GitHub account và Docker daemon có thể bị xâm phạm; repository không thể tự bảo vệ khi nền tảng tin cậy gốc đã mất.
- Đóng góp/issue từ người lạ là nội dung không đáng tin; không chạy lệnh gợi ý trong đó trước khi đọc.
- Một CI xanh chỉ chứng minh các lệnh đã chạy; nó không chứng minh triển khai ngoài Internet an toàn.

## Mốc rà soát lại

Phải cập nhật mô hình này trước khi thêm connector chạy mạng thật, token/quyền, webhook, cơ sở dữ liệu, hàng đợi, giao diện đăng nhập, AI hoặc môi trường production.
