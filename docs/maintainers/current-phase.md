# Public checkpoint: Phase 3a

**Scope:** official Zalo Official Account (OA) signed inbound text, shared
runtime connection configuration, durable PostgreSQL ledger, and
bearer-scoped canonical-event reads. This is not an inbox, an administration
UI, OAuth, outbound messaging, Zalo User, a real provider test, or a production
deployment.

## Exact verified history

- GitHub CI and CodeQL succeeded for the Phase 0 commit <code>8b80c3b</code>,
  Phase 1a Telegram Bot candidate <code>7141949</code>, Phase 2a ledger
  candidate <code>f106bb8</code>, and Phase 2b reader candidate
  <code>4d5a9c9</code>.
- Phase 2c's multi-account configuration and connection registry passed final
  local checks, an independent review, and a two-Telegram-account synthetic
  Compose proof. GitHub CI and CodeQL then succeeded for exact commit
  <code>8352b51</code>.
- Historical evidence proves only those exact revisions. It does not verify the
  current Phase 3a Zalo OA source or a live provider account.

## Current Phase 3a source

The source now has a narrowly bounded official Zalo OA inbound-text vertical
slice:

- `packages/connector-zalo-oa` declares an `OFFICIAL` connector with only
  `message.receive.text`. Its command execution always rejects; it contains no
  provider HTTP client, OAuth, token refresh, or outbound path.
- The shared version-1 runtime document accepts `zalo_oa` entries containing
  opaque connection `id`, decimal `appId` and `oaId`, `oaSecretKey`, a unique
  operator bearer, and an optional fixed public
  `https://host/v1/webhooks/zalo-oa` URL. The loader rejects unsafe documents
  without exposing content; it prevents duplicate `(appId, oaId)` pairs and
  credential-role collisions, but deliberately makes no claim that OA entries
  with one App ID must share a secret.
- `POST /v1/webhooks/zalo-oa` receives the original JSON bytes in an isolated
  Fastify scope. It reads `app_id`, `recipient.id`, and `timestamp` only to
  locate a configured pair; it then checks `X-ZEvent-Signature` as SHA-256 of
  `appId + raw JSON + timestamp + oaSecretKey`. The JSON is not reserialized
  before signature verification.
- An unknown pair and an invalid signature both return the same generic `401`.
  A signed but unsupported event is acknowledged with `200` without storage. A
  supported `user_send_text` event becomes canonical and must append durably
  before the route returns `200`; a storage failure becomes generic `500` for a
  possible provider retry.
- `GET /v1/zalo-oa/inbound-events` resolves exactly one OA from its bearer. It
  returns canonical fields only and binds opaque pagination cursors to that
  connection. Callers cannot supply a connection ID through route, query, or
  header.
- Startup registers internal connection ID, compiled connector ID, channel, and
  tier in `open_channel_hub.connection_registry`. For Zalo OA, it also records
  a domain-separated SHA-256 fingerprint of `(appId, oaId)`, never the raw
  identifiers or a credential. Migration `0005_connection_registry_provider_identity`
  requires that fingerprint for every Zalo row and rejects a changed one on a
  reused ID; it also refuses the first Zalo binding when older pre-registry
  history exists for that ID. Telegram has no equivalent configured non-secret
  provider-account identity yet, so its binding remains connector/channel/tier.
  The registry and ledger contain neither OA identifiers, secrets, raw payloads,
  nor access tokens.

The Zalo webhook path is fixed at the App level. It is not a dynamic account
route; a signed payload chooses a configured account server side. Telegram's
existing dynamic webhook path and legacy one-Bot compatibility remain separate.

## Required verification before a Phase 3a release claim

1. Freeze the Phase 3a source and run formatting, lint, strict type checking,
   targeted and full tests, build, low-threshold dependency audit, Compose
   configuration, and the expanded synthetic Docker smoke test.
2. Obtain an independent bounded review of the final frozen candidate.
3. Commit and push the verified candidate, then read fresh GitHub CI and CodeQL
   for that exact commit.

The synthetic proof must remain offline and use only fake IDs, secrets, tokens,
and messages. It should verify raw-byte signature rejection, duplicate
idempotency, per-connection provider-ID isolation, bearer/cursor isolation,
Zalo's non-secret registry fingerprint, secret-file permission, and PostgreSQL
role safety. It is
not a live Zalo compatibility or TLS proof.

## Explicitly not proven or not implemented

- No owner-authorized Zalo App/OA, public HTTPS route, webhook registration,
  signed live delivery, retry timing, or real message has been used.
- No OAuth authorization, `Official_Account_Access_Token`, refresh, outbound
  message, attachment, Zalo User, access token persistence, or provider HTTP
  client exists in this slice.
- No rate limit, structured observability, alerting, backup/restore, retention
  or deletion workflow, encryption-at-rest assurance, secret rotation,
  user/organization/RBAC model, audit trail, or production deployment exists.
- A `200` from local synthetic ingress does not prove Zalo accepts the TLS
  endpoint or two-second response expectation. A green test or GitHub check is
  not a production claim.

## Next authorized work

After final local and GitHub evidence for the exact Phase 3a commit, keep live
provider use separate: require explicit owner authorization before connecting a
real Zalo App/OA or exposing public TLS. Then address operational controls
before treating customer data as operated. Subsequent connector or dashboard
work needs its own official-document review, implementation boundary, and
verification plan.
