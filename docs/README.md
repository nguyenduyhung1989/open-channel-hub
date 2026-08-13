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
- [Phase 0–4b threat model](security/threat-model.md): assets, trust
  boundaries, current controls, and planned work.
- [Open-source readiness](maintainers/oss-readiness.md): an honest operating
  checklist for maintainers.
- [Phase 4a–4b checkpoint](maintainers/current-phase.md):
  verified milestones, active code state, risks, and exact next verification.
