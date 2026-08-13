# Public checkpoint: Phase 4a

**Scope:** a configured, read-only aggregate feed across an explicit set of
existing official connections. It builds on the Telegram Bot, Zalo OA, Facebook
Page, and WhatsApp Business runtime configuration and durable PostgreSQL
inbound-event ledger. It is not a browser dashboard, user login, organization,
RBAC model, conversation/thread model, search service, attachment store,
outbound queue, provider credential manager, real provider test, or production
deployment.

## Exact verified history

- GitHub CI and CodeQL succeeded for the Phase 0 commit <code>8b80c3b</code>,
  Phase 1a Telegram Bot candidate <code>7141949</code>, Phase 2a ledger
  candidate <code>f106bb8</code>, Phase 2b reader candidate
  <code>4d5a9c9</code>, and Phase 2c multi-account candidate
  <code>8352b51</code>.
- Phase 3a's Zalo OA source passed final local checks, independent review, a
  synthetic Compose proof, and fresh GitHub CI/CodeQL for exact commit
  <code>b930d29</code>. Phase 3b's Facebook Page source passed the same
  evidence for exact commit <code>c933102</code>.
- Phase 3c's WhatsApp Business source passed final local checks, independent
  review, a synthetic Compose proof, and fresh GitHub CI/CodeQL for exact
  commit <code>fd802cb</code>.
- Historical evidence proves only those exact revisions. It does not verify the
  current Phase 4a source or any live provider account.

## Current Phase 4a source

The source now has a bounded configured-inbox vertical slice:

- The existing strict version-1 runtime document may contain optional
  `inboxes`. Each entry has an opaque ID, a unique printable bearer token, and
  an explicit non-empty set of existing connection IDs. The parser rejects
  duplicate inbox IDs, duplicate inbox tokens, duplicate or unknown scope
  members, and every inbox-token collision with a provider, webhook, or
  account-operator credential. The configured set is frozen in stable order.
- `GET /v1/inbox/inbound-events` appears only when an inbox is configured. It
  resolves its bearer before parsing query input or contacting storage. The
  route accepts bounded `limit` and opaque `cursor` only; an HTTP caller cannot
  select an inbox ID, connection ID, or connection scope.
- The new domain-owned PostgreSQL feed reader uses parameterized SQL to list
  canonical inbound events across the immutable configured scope. It fixes a
  first-page maximum ledger sequence, returns newest sequence first, and keeps
  a continuation below the preceding sequence. It never returns raw provider
  payloads or database rows.
- A public cursor contains the ledger position plus the inbox ID and a SHA-256
  binding of the canonical configured connection set. The route rejects a
  cursor issued to another inbox or a cursor retained after that inbox's scope
  changed. The cursor is not a credential; the inbox bearer remains required.
- The Phase 4a numeric ledger-order correction versions newly issued cursors.
  A per-account cursor issued before Phase 4a has no safe continuation under
  the corrected order, so the route deliberately returns `400`; callers must
  restart that traversal from its first page after upgrading.
- Inbox tokens are separate from the existing per-account operator tokens. A
  connection bearer cannot access the aggregate route, and an inbox bearer does
  not select an individual connection route. Configuration remains secret-file
  data and is not stored in PostgreSQL.

The [Phase 4a unified inbox guide](../operations/unified-inbox-4a.md) and
[ADR-0010](../adr/0010-configured-read-only-inbox-principals.md) describe the
contract, rationale, and boundaries.

## Required verification before a Phase 4a release claim

1. Freeze the source and run formatting, lint, strict type checking, targeted
   and full tests, build, low-threshold dependency audit, Compose configuration,
   secret scan, and the expanded synthetic Docker smoke test.
2. Obtain an independent bounded review of the frozen candidate.
3. Commit and push the verified candidate, then read fresh GitHub CI and CodeQL
   for that exact commit.

The synthetic proof must use fake IDs, secrets, tokens, and messages only. It
must verify multiple provider connections in each of two configured inboxes,
aggregate canonical output, connection-bearer rejection at the inbox route,
cross-inbox cursor rejection, unchanged per-account cursor isolation,
secret-file permission, and PostgreSQL role safety. It is not a live-provider,
TLS, dashboard, or production-authorization proof.

## Explicitly not proven or not implemented

- No owner-authorized Telegram Bot, Zalo OA, Facebook Page, Meta App, WABA,
  business phone, public HTTPS endpoint, webhook subscription, signed live
  delivery, or real customer message has been used.
- No browser UI, user identity, organization, RBAC, invitation flow, audit
  log, public connection management, token rotation endpoint, or multi-host
  authorization model exists. A configured inbox bearer is only a bounded
  local runtime principal.
- No conversation summary, read/unread state, assignment, labels, search,
  attachment, retention/deletion workflow, backup/restore proof,
  encryption-at-rest assurance, rate-limit, structured observability,
  alerting, or production deployment exists.
- No outbound queue, retry, delivery/read status, template, media, OAuth,
  provider access-token storage, Graph API request, Facebook User, Zalo User,
  or WhatsApp User surface exists.
- A `200` from the local synthetic feed or a green test/GitHub check does not
  prove a TLS endpoint, provider eligibility, live message operation, or a
  production-ready access model.

## Next authorized work

After final local and GitHub evidence for the exact Phase 4a commit, keep all
live provider use separate: require explicit owner authorization before
connecting a real account or exposing public TLS. A later browser dashboard,
user/organization authorization, conversation model, or outbound engine must
start with its own bounded design, migration/security review, and verification
criteria rather than being implied by this configured read-only API.
