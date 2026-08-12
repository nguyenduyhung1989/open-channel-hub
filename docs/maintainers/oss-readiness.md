# Sẵn sàng cho cộng đồng mã nguồn mở

Tài liệu này là checklist vận hành trung thực, không phải lời khẳng định dự án đã được một chương trình hay tổ chức nào chấp nhận.

## Hiện có

- Kho mã công khai, [AGPL-3.0-or-later](../../LICENSE), hướng dẫn chạy không cần bí mật và trạng thái alpha được nêu rõ.
- Hướng dẫn đóng góp, quy tắc ứng xử, hỗ trợ, governance, security policy, roadmap, changelog và ADR.
- Tệp CI ghim runtime, kiểm tra định dạng/lint/kiểu/kiểm thử/bản dựng; CodeQL, Dependabot và dependency review.
- Lát cắt nhỏ có thể kiểm tra thay vì tuyên bố “hỗ trợ mọi nền tảng”.

## Cần duy trì bằng hành động thật

- Giữ `main` xanh; xử lý cảnh báo dependency/CodeQL; cập nhật runtime và Actions theo bản ổn định có kiểm tra.
- Trả lời issue/PR, ghi quyết định lớn, phát hành tag/changelog khi thật sự phát hành.
- Giữ ví dụ, fixture và ảnh chụp không có dữ liệu người dùng hay bí mật.
- Bật GitHub Private Vulnerability Reporting trước khi mời cộng đồng rộng hơn; cấu hình branch protection, secret scanning và các quyền GitHub phù hợp qua giao diện repository.
- Công bố rõ maintainer nào có quyền ghi và ai chịu trách nhiệm xử lý báo cáo bảo mật.

## Nếu sau này nộp Codex for Open Source

Chỉ nộp bằng thông tin đúng: liên kết kho mã, vai trò maintainer, lịch sử bảo trì, người dùng/cộng đồng khi đã có, và cách Codex thực sự được dùng trong review, tự động hoá bảo trì hoặc phát hành. Không tạo issue, PR hay số liệu giả để làm hồ sơ đẹp hơn.

Đọc điều kiện hiện hành trực tiếp từ [Codex for Open Source](https://developers.openai.com/community/codex-for-oss) và [điều khoản chương trình](https://learn.chatgpt.com/docs/codex-for-oss-terms) ngay trước khi nộp; chương trình và quyền lợi có thể thay đổi, không có bảo đảm được chọn.
