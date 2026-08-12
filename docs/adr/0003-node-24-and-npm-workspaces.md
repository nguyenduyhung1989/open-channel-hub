# ADR-0003: Node.js 24.18.1 LTS và npm workspaces

**Ngày:** 2026-08-12
**Trạng thái:** accepted

## Bối cảnh

Dự án có API và các package nội bộ nhưng Chặng 0 chưa cần một hệ điều phối monorepo phức tạp. Cần một runtime thống nhất, còn được hỗ trợ dài hạn và một cách quản lý phụ thuộc tái lập cho máy lập trình, CI và container.

## Quyết định

Ghim runtime kiểm tra/chạy container là **Node.js `24.18.1` LTS**, dùng npm đi kèm Node và npm workspaces ở gốc kho mã. CI dùng `npm ci`; Docker dùng `node:24.18.1-alpine`; các phụ thuộc trực tiếp được ghim phiên bản cụ thể và lockfile đóng băng cây phụ thuộc.

Trường `engines` trong `package.json` cho biết dải tương thích tối thiểu của mã nguồn. Nó không thay thế việc CI/container ghim chính xác `24.18.1`.

## Phương án đã cân nhắc

### Nhiều runtime hoặc để CI dùng `node` không ghim

- Ưu: ít cập nhật cấu hình khi phiên bản thay đổi.
- Nhược: kết quả không tái lập, có thể lấy bản không tương thích hoặc khác với production.
- Không chọn: độ ổn định quan trọng hơn sự tiện tay.

### pnpm/Turborepo/Nx ngay từ Chặng 0

- Ưu: có thêm tối ưu/bộ công cụ monorepo.
- Nhược: thêm công cụ và chính sách cache khi npm workspaces + một `package-lock.json` đã giải quyết nhu cầu hiện tại.
- Không chọn: có thể xem lại khi số package/tốc độ CI chứng minh cần.

## Hệ quả

- Người đóng góp cần cài đúng Node `24.18.1` để khớp CI.
- Nâng runtime là thay đổi có chủ đích: kiểm tra lịch hỗ trợ Node, tương thích dependency, Docker image và CI, rồi ghi ADR/PR thích hợp.
- Không dùng tag Docker `latest` hoặc cài dependency không qua lockfile trong CI.
