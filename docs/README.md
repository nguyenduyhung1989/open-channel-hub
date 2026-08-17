# Technical documentation

- [Architecture Decision Records](adr/README.md): decisions whose rationale
  must remain available.
- [Phase 1a Telegram Bot](operations/telegram-bot-1a.md): the HTTP boundary,
  token-safe configuration, durable-event interaction, and unresolved limits.
- [Phase 2a PostgreSQL operations](operations/postgresql-phase-2a.md): schema,
  secret boundary, safe inspection, migration behavior, and destructive-volume
  warning.
- [Phase 2c multi-connection configuration](operations/runtime-multi-connection-2c.md):
  secret-backed runtime configuration, account isolation, registry, and
  compatibility boundary.
- [Phase 3a Zalo OA inbound text](operations/zalo-oa-3a.md): official signed
  raw-JSON ingress, account isolation, and intentionally excluded Zalo surface.
- [Experimental Zalo User group bridge](operations/zalo-user-group-bridge-experimental.md):
  isolated local QR session, optional authenticated loopback QR/group UI,
  group-only text/image control, bounded reconnect, and explicit account-risk
  boundary.
- [Phase 3b Facebook Page inbound text](operations/facebook-page-3b.md):
  official GET verification, raw-byte HMAC ingress, Page isolation, and the
  intentionally excluded Meta surface.
- [Phase 3c WhatsApp Business inbound text](operations/whatsapp-business-3c.md):
  official GET verification, raw-byte HMAC ingress, business-phone isolation,
  and the intentionally excluded WhatsApp surface.
- [Phase 4a unified read-only inbox](operations/unified-inbox-4a.md): explicit
  multi-connection read scopes, bearer isolation, and the boundary inherited by
  the browser dashboard.
- [Phase 4b operator dashboard](operations/operator-dashboard-4b.md): optional
  server-rendered dashboard, TLS-only deployment boundary, and local-principal
  session operation.
- [Google dashboard sign-in](operations/dashboard-google-sign-in.md): optional
  configured first Google sign-in, exact callback registration, and the
  HMAC-only identity boundary.
- [Phase 4c durable reply commands](operations/outbound-reply-commands-4c.md):
  source-bound immutable reply-intent ledger, idempotency, and the explicit
  no-dispatch boundary.
- [Phase 4d queued reply-command history](operations/outbound-command-history-4d.md):
  inbox-scoped queued-intent history, private-field projection, and independent
  cursor boundary.
- [Phase 4e dashboard queued-command history](operations/operator-dashboard-queued-history-4e.md):
  a server-rendered, principal-scoped queued-history view with no browser
  bearer; later bounded evidence/Telegram-approval controls still do not send
  through a provider.
- [Phase 4f dashboard reply intents](operations/operator-dashboard-reply-intents-4f.md):
  verified opt-in, source-bound durable intent recording through a
  server-rendered form; no provider send or browser bearer.
- [Phase 4g outbound delivery evidence](operations/outbound-delivery-evidence-4g.md):
  verified append-only attempt/receipt evidence with no provider dispatch.
- [Phase 4h command authorization provenance](operations/outbound-command-authorization-provenance-4h.md):
  verified immutable authority evidence with no provider dispatch.
- [Phase 4i Telegram private-reply eligibility](operations/telegram-private-reply-eligibility-4i.md):
  verified private-chat and Bot-identity evidence with no provider dispatch.
- [Phase 4j Telegram delivery authorization](operations/telegram-delivery-authorization-4j.md):
  verified immutable human authorization evidence with no provider dispatch.
- [Phase 0–5a threat model](security/threat-model.md): assets, trust
  boundaries, current controls, and planned work.
- [Open-source readiness](maintainers/oss-readiness.md): an honest operating
  checklist for maintainers.
- [Phase 4a–5a checkpoint](maintainers/current-phase.md): verified milestones,
  the Phase 4h–4j no-dispatch boundaries, risks, and next design work.
