# ADR-0020: Isolated experimental Zalo User group bridge

**Date:** 2026-08-14

**Status:** accepted

## Context

The official Zalo OA boundary in this repository is intentionally separate from
Zalo personal-account messaging. The requested experimental use case is narrow:
receive plain text from a Zalo User group, explicitly send text or one image to
that same observed group, and survive a bounded abnormal network reconnect.

The selected `zca-js` dependency is an unofficial Zalo Web implementation. A
QR session contains sensitive cookie/IMEI/user-agent material and can be
invalidated by Zalo. It must not enter the Hub API, Docker Compose, source
tree, runtime connection JSON, or browser.

## Decision

Keep Zalo User as an opt-in host-local bridge in
`apps/zalo-user-bridge`, outside the API container and Compose stack.

- The Hub stores only narrow canonical group-text events. Its runtime JSON
  stores a numeric account binding, an opaque bridge bearer, and an operator
  bearer; it stores no QR session material.
- The bridge creates a fresh QR session in memory. A temporary owner-only QR
  image is deleted on exit. QR expiry, duplicate connection, or kick requires
  a human restart and new QR scan.
- The listener admits only non-self group text. A group becomes send-eligible
  in memory only after the Hub has returned `204` for that canonical event.
- The bridge listens on `127.0.0.1` only. Its separate local control bearer
  can explicitly send bounded text or one JPEG/PNG/WebP buffer to an observed
  group. It cannot enumerate groups, choose a direct-message target, upload a
  filesystem path, or submit bulk recipients.
- The listener never enables `zca-js` internal `retryOnClose`. The bridge
  retries only abnormal close `1006`, at 1 s, 5 s, then 30 s. It makes no
  automatic provider send retry.

## Options considered

### Put the Zalo Web session inside the API/Compose service

Rejected. It would put QR-derived account session material next to the
internet-facing API, complicate container secret handling, and make an
unofficial provider dependency part of the normal official-provider runtime.

### Use a generic provider command or legacy Telegram send route

Rejected. Both permit a caller-selected recipient shape that cannot express the
group-only observed-target rule safely.

### Add automatic response, queue scanning, or retries

Rejected for this slice. Neither provider acceptance nor an ambiguous network
failure proves a message result. Automatic behavior would create a much wider
spam, duplicate-send, and account-risk surface.

## Consequences

This is a useful but deliberately limited experimental connector. It supports
local group text/image sends after a group has produced a durable inbound text
event in the running session. It does not support Zalo User direct messages,
bulk sending, account/session persistence, sender impersonation, CAPTCHA
bypass, automatic retries, delivery/read status, a durable outbound command,
or a production availability claim.

The operator accepts the risk of an unofficial library and possible account
restriction. A live account test is owner-operated and remains distinct from
synthetic source verification.
