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
- Phase 4b adds an optional server-rendered dashboard with configured local
  principals, exact-profile Argon2id password hashes, signed secure browser
  sessions, HMAC-only PostgreSQL session records, and an eighth migration. Its
  final local verification, synthetic Compose proof, independent security
  review, GitHub CI, and CodeQL succeeded for exact commit
  <code>7672be9</code>. The local smoke intentionally remains dashboard-free
  because it is HTTP on loopback and cannot prove the required external HTTPS
  browser boundary.
- Phase 4c adds an immutable source-bound reply-command ledger. A configured
  inbox bearer can record an intent against an already durable in-scope event;
  PostgreSQL derives the private reply target from canonical source data. Phase
  4d adds a read-only history of those `queued` intents through a separate
  version-1 cursor; its projection returns recorded text with safe
  command/source metadata but omits private target/source metadata and client
  operation IDs. Neither adds a migration beyond `0009`, provider request,
  dispatch, retry, receipt, OAuth/token storage, delivery state, or dashboard
  send/history UI. Exact commit <code>160414e</code> passed final local
  verification, synthetic Compose proof, independent security review, GitHub
  CI, and CodeQL.
- Phase 4g is a verified source forward migration only. It adds append-only
  `outbound_delivery_attempts` and `outbound_delivery_attempt_receipts` tables
  without a route, provider request, provider credential, worker, retry, or
  delivery/read state. An absent attempt row supports only a derived
  `not_attempted`-in-this-ledger label; it never proves no external call
  happened. A stored attempt without a receipt remains unknown.
- Phase 4h–4i are candidate-only source changes. Phase 4h records immutable
  authority provenance with a new command; Phase 4i records internal Telegram
  private-chat/Bot-identity evidence with a new Telegram command. Neither
  feature is verified source evidence, dispatches a provider message, retains
  a Telegram token/Bot ID, backfills historic rows, or establishes production
  eligibility.

## Verified Phase 4e source

- Phase 4e is a server-rendered dashboard-history source. An authenticated
  configured dashboard principal can inspect only `queued` command history for
  an already assigned inbox through `GET /operator/outbound-commands`. The
  page uses the existing scope-bound Phase 4d cursor, has a fixed 50-row page,
  and keeps an inbox bearer out of the browser.
- The source renders escaped recorded text, creation time, source connection
  ID, and a recorded-not-sent label only. It omits command/provider-event IDs,
  private target/source metadata, client operation IDs, credentials, and
  delivery data. It adds no migration, command write, browser API bearer,
  provider request, worker, send, retry, cancel, or delivery state.
- Exact commit <code>465186e</code> passed final local verification,
  independent security review, a synthetic Compose proof, and fresh GitHub
  CI/CodeQL. It is a verified source feature, not public-TLS proof, a
  production deployment, or evidence of provider dispatch.

## Verified Phase 4f source

- Phase 4f adds an optional strict
  `dashboard.principals[].replyIntentInboxIds` array. Each value must be an
  already readable configured inbox for that principal; omission becomes an
  empty immutable set, so existing dashboard principals remain read-only.
- An enabled dashboard event card renders a same-origin native form with reply
  text as its only editable value. The server supplies escaped source reference
  and UUIDv4 operation inputs, then requires a signed session, exact HTTPS
  origin, anti-forgery value, explicit principal/inbox write grant, and the
  existing Phase 4c durable source-scope check before it can record `queued`.
  The card shows only channel, occurrence time, message text, and connection
  ID; it omits `conversationId`, `senderId`, private target, and source-message
  ID.
- The URL-encoded form parser rejects a whole body above 32 KiB before strict
  validation or the recorder; the reply text remains separately limited to
  2,000 characters.
- A new record or exact idempotent replay uses `303` post/redirect/get to the
  queued-history page without a command-result URL signal. The queued-history
  row is the only browser evidence of a durable record. The browser sees
  neither an inbox bearer nor provider credential, recipient, private target,
  command result, or delivery state.
- The in-process guard limits one configured principal to 20 record attempts
  per rolling minute. It is not a proxy, multi-host, distributed, or production
  rate-limit claim.
- Phase 4f adds no migration, Compose service, provider client/request,
  provider token/OAuth storage, worker, dispatch, retry, attempt, receipt,
  delivery/read state, or command mutation. Exact commit <code>74fca30</code>
  passed <code>npm run check</code> (54 test files / 358 tests and build),
  <code>npm audit --audit-level=low</code> with zero findings, Gitleaks with no
  secrets, <code>git diff --check</code>, a synthetic Compose smoke with
  cleanup, an independent security audit APPROVE with zero high/medium findings,
  and GitHub checks <code>Verify Node 24.18.1</code> and
  <code>Analyze JavaScript and TypeScript</code>. This source evidence does not
  prove the required HTTPS dashboard boundary, public TLS, live provider
  operation, or production deployment.

## Verified Phase 4g source delivery evidence

- Migration `0010_outbound_delivery_attempt_receipts` adds one immutable
  attempt fact at most per command and one optional immutable receipt at most
  per attempt. Both tables have their own update/delete-rejection trigger.
- The receipt constraint permits only `provider_accepted`,
  `provider_rejected`, and `outcome_unknown`. A recorded acceptance receipt
  requires a provider message ID; neither the schema nor the verified source
  proves a live provider acknowledgement, delivery, display, or read.
- Exact commit <code>6444699</code> passed <code>npm run check</code> (54 test
  files / 358 tests and build), <code>npm audit --audit-level=low</code> with
  zero findings, Gitleaks with no secrets, <code>git diff --check</code>, a
  synthetic Compose smoke with cleanup, an independent security audit APPROVE
  with zero high/medium findings, and GitHub checks <code>Verify Node 24.18.1</code>
  and <code>Analyze JavaScript and TypeScript</code>. It is a verified source
  feature, not public-TLS, live-provider-I/O, provider-acceptance, delivery,
  read-status, or production evidence; it still cannot authorize provider I/O
  or public TLS.

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
- GitHub CI and CodeQL succeeded for the combined Phase 4c–4d reply-command
  candidate at <code>160414e</code>.
- GitHub CI and CodeQL succeeded for the Phase 4e dashboard-history source at
  exact commit <code>465186e</code>.
- GitHub checks <code>Verify Node 24.18.1</code> and
  <code>Analyze JavaScript and TypeScript</code> succeeded for the Phase 4f
  dashboard reply-intent source at exact commit <code>74fca30</code>.
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
  and operational observability before operating real customer data. Phase 4c
  additionally stores outgoing reply text and private source-derived target
  metadata; Phase 4d returns that recorded text to the authorized scoped inbox
  bearer. The Phase 4e source renders a smaller escaped projection through
  an authenticated dashboard session. The verified Phase 4f source receives escaped
  hidden source transport values and user-entered reply text through that same
  authenticated boundary. Protect every path to that text to the same standard
  and keep messages out of examples, logs, screenshots, and public discussion.
- Do not mistake Phase 4c `queued` intents, Phase 4d history rows, or verified
  Phase 4g evidence for sends. A future provider dispatcher still needs a
  separate official-provider policy, attempt-write ordering, timeout/receipt
  model, retry decision, review, and verification. The legacy Phase 1a Telegram
  direct-send route is separate compatibility behavior, not evidence that all
  sends are durable. Phase 4e renders intent history and the verified Phase 4f
  source can record the existing source-bound intent; neither changes that
  boundary.
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
