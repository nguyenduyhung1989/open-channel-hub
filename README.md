# Open Channel Hub

> Trung tâm nhắn tin đa kênh, tự triển khai, ưu tiên các tích hợp chính thức.

**Trạng thái: Chặng 0 / alpha.** Dự án hiện chỉ có lát cắt dọc `Telegram Bot`; cổng gateway của nó được mô phỏng trong kiểm thử bằng dữ liệu tổng hợp. Nó **chưa** gửi tin nhắn Telegram thật, chưa nhận token thật, chưa có người dùng/đăng nhập, giao diện web, PostgreSQL, Redis, webhook bền vững hay bộ kết nối Facebook, Zalo và WhatsApp.

Open Channel Hub được xây để các đội nhỏ có một lõi chung cho hội thoại đa kênh, nhưng không che giấu rủi ro: tích hợp qua API chính thức đi trước; bộ kết nối dùng phiên đăng nhập hoặc API không được nhà cung cấp hỗ trợ chỉ có thể là thử nghiệm, tách biệt, tự nguyện bật và không bao giờ có tính năng né CAPTCHA, giả dấu vết thiết bị hay gửi thư rác hàng loạt.

## Có gì chạy được hôm nay?

- Máy chủ HTTP tối thiểu với `GET /health`.
- Hợp đồng dữ liệu, cổng kết nối và kiểm tra năng lực cho lát cắt `Telegram Bot`.
- Bộ chuyển đổi dữ liệu Telegram dạng văn bản hẹp, dùng dữ liệu giả trong kiểm thử.
- Kiểm tra định dạng, kiểu dữ liệu, mã nguồn, kiểm thử và bản dựng có thể chạy cục bộ/CI.

`Telegram Bot` ở đây là **nền móng kiểm thử**. Cổng gateway được tiêm vào adapter và chỉ có mock trong kiểm thử hiện tại; không có transport production nào gọi Telegram hay lưu token.

## Điều chưa có

Những phần sau là kế hoạch, không phải lời quảng cáo về tính năng đã tồn tại:

- Kết nối Telegram Bot thật và luồng cấp quyền/token.
- PostgreSQL, Redis, hộp thư đi bền vững, xử lý gửi lại và lưu hội thoại.
- Bảng điều khiển web, phân quyền, nhiều tổ chức và webhook nhận từ nhà cung cấp.
- Facebook Page, Facebook User, Zalo OA, Zalo User và WhatsApp.

Xem [ROADMAP.md](ROADMAP.md) để biết tiêu chí trước khi từng chặng được gọi là hoàn thành.

## Chạy nhanh tại máy

Không cần bí mật hay tài khoản Telegram để chạy Chặng 0.

```bash
git clone https://github.com/nguyenduyhung1989/open-channel-hub.git
cd open-channel-hub
npm ci
cp .env.example .env
npm run check
npm run dev
```

Mở một cửa sổ khác để kiểm tra máy chủ:

```bash
curl http://127.0.0.1:3000/health
```

Kết quả mong đợi có dạng:

```json
{ "success": true, "data": { "service": "open-channel-hub", "status": "ok" } }
```

Biến trong `.env.example` chỉ chỉnh địa chỉ và cổng; không có token mẫu. Giữ `.env` ở máy của mày và tuyệt đối không đưa nó vào issue, PR hay nhật ký.

## Chạy bằng Docker

Tệp `compose.yaml` chỉ tạo **một API Chặng 0**. Gateway Telegram vẫn chỉ là mock của kiểm thử; compose không tạo PostgreSQL, Redis hay một môi trường production đầy đủ.

```bash
docker compose up --build
curl http://127.0.0.1:3000/health
```

Mặc định cổng chỉ mở tại `127.0.0.1`. Nếu muốn đưa dịch vụ ra Internet, hãy tự triển khai lớp TLS, xác thực, giới hạn tốc độ, giám sát và quản lý bí mật trước; compose này không làm các việc đó thay mày.

## Phát triển và kiểm tra

Dự án dùng Node.js `24.18.1` trong CI và Docker. Các lệnh chính:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

Xem [CONTRIBUTING.md](CONTRIBUTING.md) trước khi mở pull request. Các quyết định kiến trúc được ghi ở [docs/adr](docs/adr/README.md); mô hình đe doạ hiện tại nằm tại [docs/security/threat-model.md](docs/security/threat-model.md).

## Giấy phép và dịch vụ trên mạng

Mã nguồn được phát hành theo [GNU Affero General Public License v3.0 hoặc bản mới hơn (AGPL-3.0-or-later)](LICENSE).

Nói ngắn gọn: nếu mày sửa Open Channel Hub rồi cho người khác tương tác với **bản đã sửa** qua mạng, Điều 13 của AGPL yêu cầu bản đó phải cho những người dùng từ xa cơ hội nhận mã nguồn tương ứng của phiên bản đang chạy, miễn phí từ máy chủ. Đọc toàn văn [LICENSE](LICENSE) trước khi phân phối, triển khai hay kết hợp mã nguồn.

AGPL không cấm bán phần mềm, vận hành dịch vụ lưu trữ hay hỗ trợ thương mại. Hiện dự án không hứa hẹn một giấy phép thương mại thay thế; xem [ADR-0004](docs/adr/0004-agpl-and-future-commercial-options.md) để biết lý do và điều kiện cần cân nhắc nếu sau này có.

## Cộng đồng và bảo mật

- Cách đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md)
- Quy tắc ứng xử: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Hỗ trợ: [SUPPORT.md](SUPPORT.md)
- Báo lỗ hổng riêng tư: [SECURITY.md](SECURITY.md)
- Cách ra quyết định: [GOVERNANCE.md](GOVERNANCE.md)

Không mở issue để báo lỗ hổng và không dán token, cookie, số điện thoại, nội dung hội thoại thật hay tệp `.env` ở bất cứ đâu trong kho mã công khai.

## Ghi nhận trạng thái mã nguồn mở

Kho này hướng tới một lịch sử bảo trì công khai, có kiểm thử và có trách nhiệm, không phải cố “đánh bóng hồ sơ”. Bằng chứng vận hành và các việc còn thiếu được ghi minh bạch tại [docs/maintainers/oss-readiness.md](docs/maintainers/oss-readiness.md).
