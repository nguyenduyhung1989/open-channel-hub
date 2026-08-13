# Public checkpoint: Phase 3b

**Scope:** official Facebook Page signed inbound text, alongside the existing
Telegram Bot and Zalo OA runtime configuration, durable PostgreSQL ledger, and
bearer-scoped canonical-event reads. This is not an inbox, administration UI,
Facebook User, OAuth, Page access-token storage, Graph API client, outbound
messaging, real provider test, or production deployment.

## Exact verified history

- GitHub CI and CodeQL succeeded for the Phase 0 commit <code>8b80c3b</code>,
  Phase 1a Telegram Bot candidate <code>7141949</code>, Phase 2a ledger
  candidate <code>f106bb8</code>, Phase 2b reader candidate
  <code>4d5a9c9</code>, and Phase 2c multi-account candidate
  <code>8352b51</code>.
- Phase 3a's Zalo OA source passed final local checks, independent review, a
  synthetic Compose proof, and fresh GitHub CI/CodeQL for exact commit
  <code>b930d29</code>.
- Historical evidence proves only those exact revisions. It does not verify the
  current Phase 3b Facebook Page source or any live provider account.

## Current Phase 3b source

The source now has a bounded official Facebook Page inbound-text vertical slice:

- `packages/connector-facebook-page` declares an `OFFICIAL` connector with only
  `message.receive.text`. Its command execution always rejects; it contains no
  Graph API client, OAuth, Page access token, or outbound path.
- The shared version-1 runtime document accepts `facebook_page` entries with an
  opaque connection `id`, decimal `appId` and `pageId`, `appSecret`,
  `webhookVerifyToken`, unique operator bearer, and optional fixed public
  `https://host/v1/webhooks/facebook-page` URL. Multiple configured Pages may
  share one App only when both App credentials match exactly.
- `GET /v1/webhooks/facebook-page` validates Meta's configured verify token and
  returns the exact challenge. `POST /v1/webhooks/facebook-page` receives raw
  bytes in an isolated Fastify scope, collects every signed payload Page ID,
  requires all Pages to resolve to one configured App, then verifies
  `X-Hub-Signature-256` over the original Buffer. JSON is never reserialized for
  signature verification.
- An unknown/malformed/cross-App batch and an invalid signature return the same
  generic `401`. A signed unsupported item is acknowledged with `200` without
  storage. A supported customer text event must append durably before the route
  returns `200`; storage failure becomes generic `500` for a possible retry.
- `GET /v1/facebook-page/inbound-events` resolves exactly one Page from its
  bearer. It returns canonical fields only and binds opaque pagination cursors
  to that connection. Callers cannot supply a connection ID through route,
  query, or header.
- Migration `0006_connection_registry_facebook_page_provider_identity` requires
  a non-secret domain-separated SHA-256 fingerprint of `(appId, pageId)` for
  every Facebook Page registry row. It rejects changing App/Page under a durable
  internal ID and refuses first identity-bound registration when pre-registry
  history already uses that ID. It stores no raw provider identity or secret.

Facebook Page has a fixed App-level route because Meta's POST payload identifies
Pages but not the App. It is intentionally separate from Telegram's dynamic
route and Zalo OA's signed App/OA route.

## Required verification before a Phase 3b release claim

1. Freeze the source and run formatting, lint, strict type checking, targeted
   and full tests, build, low-threshold dependency audit, Compose configuration,
   secret scan, and the expanded synthetic Docker smoke test.
2. Obtain an independent bounded review of the frozen candidate.
3. Commit and push the verified candidate, then read fresh GitHub CI and CodeQL
   for that exact commit.

The synthetic proof must stay offline and use only fake IDs, secrets, tokens,
and messages. It should verify Meta challenge handling, raw-byte HMAC rejection,
same-App multi-Page dispatch, duplicate idempotency, Page bearer/cursor
isolation, Facebook's non-secret registry fingerprint, secret-file permission,
and PostgreSQL role safety. It is not a live Meta compatibility or TLS proof.

## Explicitly not proven or not implemented

- No owner-authorized Meta App/Page, public HTTPS route, webhook registration,
  signed live delivery, retry timing, permissions/Advanced Access, or real
  customer message has been used.
- No Facebook User, OAuth, Page access-token storage/refresh, Graph API call,
  outbound Page message, attachment, or automatic webhook registration exists.
- No rate limit, structured observability, alerting, backup/restore, retention
  or deletion workflow, encryption-at-rest assurance, secret rotation,
  user/organization/RBAC model, audit trail, or production deployment exists.
- A `200` from local synthetic ingress does not prove Meta accepts the TLS
  endpoint or five-second response expectation. A green test or GitHub check is
  not a production claim.

## Next authorized work

After final local and GitHub evidence for the exact Phase 3b commit, keep live
provider use separate: require explicit owner authorization before connecting a
real Meta App/Page or exposing public TLS. Then continue with the next official
connector only after current official documentation and a new bounded design.
