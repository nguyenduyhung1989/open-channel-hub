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
- [Phase 0–3a threat model](security/threat-model.md): assets, trust
  boundaries, current controls, and planned work.
- [Open-source readiness](maintainers/oss-readiness.md): an honest operating
  checklist for maintainers.
- [Phase 3a checkpoint](maintainers/current-phase.md): verified milestones,
  code state, risks, and exact next verification.
