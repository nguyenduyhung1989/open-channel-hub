# Architecture Decision Records

ADR ghi lại những quyết định mà sáu tháng sau người ta vẫn cần biết “vì sao lại chọn thế này?”. Trạng thái `accepted` nghĩa là đang được áp dụng; nó không nói rằng một tính năng đã hoàn thiện.

| ADR                                                   | Trạng thái | Quyết định                                         |
| ----------------------------------------------------- | ---------- | -------------------------------------------------- |
| [0001](0001-modular-monolith-and-inward-contracts.md) | accepted   | Modular monolith, hợp đồng hướng vào trong         |
| [0002](0002-official-first-connector-tiers.md)        | accepted   | Tầng connector ưu tiên chính thức                  |
| [0003](0003-node-24-and-npm-workspaces.md)            | accepted   | Node.js 24.18.1 và npm workspaces                  |
| [0004](0004-agpl-and-future-commercial-options.md)    | accepted   | AGPL-3.0-or-later và lựa chọn thương mại tương lai |

Mẫu ADR mới:

```markdown
# ADR-NNNN: Tên quyết định

**Ngày:** YYYY-MM-DD
**Trạng thái:** proposed | accepted | deprecated | superseded by ADR-NNNN

## Bối cảnh

## Quyết định

## Phương án đã cân nhắc

## Hệ quả
```
