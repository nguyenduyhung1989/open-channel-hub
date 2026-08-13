# Open-source readiness

This is an honest operating checklist, not a claim that a program or
organization has accepted the project.

## Present

- A public repository under [AGPL-3.0-or-later](../../LICENSE), instructions
  that run without secrets, and a clearly stated alpha status.
- Contribution guidance, code of conduct, support, governance, security policy,
  roadmap, changelog, ADRs, and phase checkpoints.
- CI files with a pinned runtime and formatting, lint, type, test, build,
  Compose smoke, CodeQL, Dependabot, and dependency-review checks.
- A small verifiable slice rather than a claim to support every platform.
- Historical Phase 1a evidence: local candidate checks and GitHub CI/CodeQL at
  <code>7141949</code>. Live Telegram verification remains outstanding.
- Phase 2a contains a dedicated PostgreSQL schema, migration ledger,
  non-superuser role, canonical inbound-event storage, and a synthetic Docker
  proof of migration/idempotency. GitHub CI and CodeQL succeeded at
  <code>f106bb8</code>.
- Phase 2b added a token-gated canonical event reader, stable pagination, and
  its synthetic Compose proof. GitHub CI and CodeQL succeeded for exact commit
  <code>4d5a9c9</code>.
- Phase 2c added secret-backed multi-connection configuration, token-bound
  account selection, dynamic webhook ingress, and a durable connection registry.
  Its final local verification, synthetic Compose proof, GitHub CI, and CodeQL
  succeeded for exact commit <code>8352b51</code>.
- Phase 3a added a deliberately receive-only official Zalo OA boundary: a fixed
  raw-JSON signed webhook and bearer-scoped canonical-event reader. Its final
  local verification, synthetic Compose proof, independent review, GitHub CI,
  and CodeQL succeeded for exact commit <code>b930d29</code>.
- Phase 3b added a deliberately receive-only official Facebook Page boundary:
  a fixed GET verification/raw-byte HMAC webhook and bearer-scoped
  canonical-event reader. Its final local verification, synthetic Compose
  proof, independent review, GitHub CI, and CodeQL succeeded for exact commit
  <code>c933102</code>.
- Phase 3c added a deliberately receive-only official WhatsApp Business
  boundary: standalone or shared-Meta GET verification/raw-byte HMAC webhook
  ingress and a bearer-scoped canonical-event reader. Its final local
  verification, synthetic Compose proof, independent review, GitHub CI, and
  CodeQL succeeded for exact commit <code>fd802cb</code>.
- Phase 4a added a configured read-only inbox bearer with an explicit
  multi-connection allow-list and canonical aggregate event feed. Its final
  local verification, synthetic Compose proof, independent review, GitHub CI,
  and CodeQL succeeded for exact commit <code>705db0a</code>.

## Verified GitHub evidence

- GitHub CI and CodeQL succeeded at commit <code>8b80c3b</code>. This evidence
  applies only to that commit and does not replace verification of a later
  release commit or tag.
- GitHub CI and CodeQL succeeded for the Phase 1a candidate at
  <code>7141949</code>, the Phase 2a candidate at <code>f106bb8</code>, and
  the Phase 2b candidate at <code>4d5a9c9</code>, and the Phase 2c candidate
  at <code>8352b51</code>.
- GitHub CI and CodeQL succeeded for the Phase 3a Zalo OA candidate at
  <code>b930d29</code>.
- GitHub CI and CodeQL succeeded for the Phase 3b Facebook Page candidate at
  <code>c933102</code>.
- GitHub CI and CodeQL succeeded for the Phase 3c WhatsApp Business candidate
  at <code>fd802cb</code>.
- GitHub CI and CodeQL succeeded for the Phase 4a configured inbox candidate
  at <code>705db0a</code>.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts,
  and automatic security fixes are enabled.
- The <code>main</code> branch blocks force pushes and deletion, including by
  administrators. Required status checks and pull-request review requirements
  are deliberately absent to retain the current owner-controlled direct-push
  workflow. A future collaboration model must revisit that choice before
  treating it as comprehensive merge governance.

## Must be maintained through real work

- Keep <code>main</code> green; address dependency and CodeQL alerts; update
  the runtime and Actions through verified stable releases.
- Keep final local evidence with the exact candidate and read fresh GitHub
  checks for each actual release commit before making release claims.
- Maintain migrations as immutable, forward-only repository artifacts. Never
  manually alter a deployed database and then describe it as a repository
  migration.
- Treat the runtime multi-connection document as a secret. Never commit it,
  publish it through a ticket/log/screenshot, store it in PostgreSQL, or mix it
  with legacy Telegram Bot credentials in one process. It can contain Telegram
  Bot, Zalo OA, Facebook Page, WhatsApp Business, per-account operator, and
  configured inbox credentials. Phase 3a does not store or transmit Zalo's
  provider access token, Phase 3b does not store a Facebook Page access token
  or make a Graph API request, Phase 3c does not store a WhatsApp access token
  or make a Graph API request, and Phase 4a does not store an inbox principal
  in PostgreSQL.
- Treat canonical message text and identifiers as sensitive data. Build and
  test backup/restore, retention/deletion, secret rotation, access controls,
  and operational observability before operating real customer data.
- Keep examples, fixtures, screenshots, logs, and public discussions free of
  user data and secrets.
- Respond to issues and pull requests, record material decisions, and create
  release tags and changelog entries only when an actual release occurs.
- Maintain Private Vulnerability Reporting, secret scanning, Dependabot
  alerts, and automatic security fixes; recheck them after permission or
  GitHub-configuration changes.
- State which maintainers have write access and who is accountable for security
  reports.

## If applying to Codex for Open Source later

Apply with accurate information only: repository links, maintainer role,
maintenance history, users or community when they exist, and how Codex is
actually used for review, maintenance automation, or releases. Do not create
fake issues, pull requests, or metrics to make an application look stronger.

Read the current
[Codex for Open Source](https://developers.openai.com/community/codex-for-oss)
conditions and
[program terms](https://learn.chatgpt.com/docs/codex-for-oss-terms) immediately
before applying. The program and its benefits can change, and selection is not
guaranteed.
