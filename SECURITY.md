# Chính sách bảo mật

## Báo lỗ hổng riêng tư

**Đừng mở issue, pull request hay discussion công khai cho lỗ hổng.** Dùng biểu mẫu báo cáo riêng tư của GitHub tại:

<https://github.com/nguyenduyhung1989/open-channel-hub/security/advisories/new>

Nếu nút “Report a vulnerability” chưa xuất hiện trên trang Security, maintainer phải bật GitHub Private Vulnerability Reporting trước khi quảng bá kho mã rộng rãi. Không được bù bằng việc mở issue công khai.

Trong báo cáo, nêu phiên bản/commit, điều kiện tái hiện tối thiểu, tác động dự kiến và cách liên lạc an toàn. **Không bao giờ dán** token Telegram, cookie, khoá API, tệp `.env`, số điện thoại, nội dung hội thoại, payload webhook thật hay dữ liệu khách hàng. Hãy thay bằng giá trị giả và mô tả cách tạo lại dữ liệu đó.

## Phạm vi hiện tại

Chặng 0 chỉ có API cục bộ nhỏ và lát cắt `Telegram Bot` dùng cổng mô phỏng. Dù vậy, các lỗi trong mã nguồn, quy trình CI, Dockerfile, xử lý cấu hình, xác thực dữ liệu đầu vào và ranh giới connector đều nằm trong phạm vi.

Không kiểm tra phá hoại trên hạ tầng không thuộc quyền mày, không dùng tài khoản người khác và không cố gửi tin nhắn thật qua hệ thống hiện chưa cung cấp tích hợp production.

## Cách xử lý

Mục tiêu là xác nhận đã nhận báo cáo critical trong 24 giờ, high trong 72 giờ và các mức khác trong 7 ngày làm việc. Đây là mục tiêu vận hành thiện chí của dự án alpha, không phải cam kết SLA.

Khi một lỗi được xác nhận, maintainer sẽ đánh giá mức độ, vá, thêm kiểm thử hồi quy phù hợp, cập nhật ghi chú phát hành và phối hợp thời điểm công bố. Nếu bí mật có thể đã lộ, phải thu hồi/đổi bí mật đó ngay — sửa mã một mình không đủ.

Xem [mô hình đe doạ Chặng 0](docs/security/threat-model.md) để phân biệt các hàng rào đã có với các việc còn là kế hoạch.
