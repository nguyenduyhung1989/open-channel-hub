# Public checkpoint: Phase 3c

**Scope:** official WhatsApp Business signed inbound text, alongside the
existing Telegram Bot, Zalo OA, Facebook Page runtime configuration, durable
PostgreSQL ledger, and bearer-scoped canonical-event reads. This is not an
inbox, administration UI, WhatsApp User, OAuth, Graph API access-token storage,
Graph API client, outbound messaging, template, real provider test, or
production deployment.

## Exact verified history

- GitHub CI and CodeQL succeeded for the Phase 0 commit <code>8b80c3b</code>,
  Phase 1a Telegram Bot candidate <code>7141949</code>, Phase 2a ledger
  candidate <code>f106bb8</code>, Phase 2b reader candidate
  <code>4d5a9c9</code>, and Phase 2c multi-account candidate
  <code>8352b51</code>.
- Phase 3a's Zalo OA source passed final local checks, independent review, a
  synthetic Compose proof, and fresh GitHub CI/CodeQL for exact commit
  <code>b930d29</code>.
- Phase 3b's Facebook Page source passed final local checks, independent
  review, a synthetic Compose proof, and fresh GitHub CI/CodeQL for exact
  commit <code>c933102</code>.
- Historical evidence proves only those exact revisions. It does not verify the
  current Phase 3c WhatsApp Business source or any live provider account.

## Current Phase 3c source

The source now has a bounded official WhatsApp Business inbound-text vertical
slice:

- `packages/connector-whatsapp-business` declares an `OFFICIAL` connector with
  only `message.receive.text`. Its command execution always rejects; it
  contains no Graph API client, OAuth, access token, template, media, or
  outbound path.
- The shared version-1 runtime document accepts `whatsapp_business` entries
  with an opaque connection `id`, decimal `appId`, `wabaId`, and
  `phoneNumberId`, `appSecret`, `webhookVerifyToken`, unique operator bearer,
  and optional public webhook URL. Phone IDs are unique and a WABA resolves to
  one configured App. Several business phones or WABAs may share an App only
  with matching App credentials.
- A WhatsApp-only App can use `GET`/`POST
/v1/webhooks/whatsapp-business`. An App configured for both Facebook Page and
  WhatsApp Business must use the common `GET`/`POST /v1/webhooks/meta` route
  for all declared callback URLs. The common raw-byte scope selects exactly one
  product and App from the untrusted envelope before HMAC verification; JSON is
  never reserialized for signature verification.
- The incoming body must carry `object: "whatsapp_business_account"`. Every
  WABA ID is collected from `entry[].id`, all must resolve to one configured
  App, and `X-Hub-Signature-256` is checked over the original Buffer. A signed
  item then has to match its configured WABA and business phone before it can
  create canonical text.
- Unknown/malformed/cross-App batches and invalid signatures return the same
  generic `401`. A signed unsupported item is acknowledged with `200` without
  storage. A supported customer text event must append durably before the route
  returns `200`; storage failure becomes generic `500` for a possible retry.
- `GET /v1/whatsapp-business/inbound-events` resolves exactly one business
  phone from its bearer. It returns canonical fields only and binds opaque
  pagination cursors to that connection. Callers cannot supply a connection ID
  through route, query, or header.
- Migration `0007_connection_registry_whatsapp_business_provider_identity`
  requires a non-secret domain-separated SHA-256 fingerprint of
  `(appId, wabaId, phoneNumberId)` for every WhatsApp Business registry row. It
  rejects changing that triple under a durable internal ID and refuses first
  identity-bound registration when pre-registry history already uses that ID.
  It stores no raw provider identity or secret.

Meta's [official WhatsApp Business getting-started documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
is the source for the Cloud API WABA/phone webhook model. This repository makes
no live compatibility, subscription, App Review, access, retry, or timing
claim.

## Required verification before a Phase 3c release claim

1. Freeze the source and run formatting, lint, strict type checking, targeted
   and full tests, build, low-threshold dependency audit, Compose configuration,
   secret scan, and the expanded synthetic Docker smoke test.
2. Obtain an independent bounded review of the frozen candidate.
3. Commit and push the verified candidate, then read fresh GitHub CI and CodeQL
   for that exact commit.

The synthetic proof must stay offline and use only fake IDs, secrets, tokens,
and messages. It should verify the shared Meta challenge, raw-byte HMAC
rejection, Facebook Page and WhatsApp dispatch through one shared App callback,
duplicate idempotency, business-phone bearer/cursor isolation, WhatsApp's
non-secret registry fingerprint, secret-file permission, and PostgreSQL role
safety. It is not a live Meta compatibility or TLS proof.

## Explicitly not proven or not implemented

- No owner-authorized Meta App, WABA, business phone, public HTTPS route,
  webhook subscription, signed live delivery, App Review/access decision, or
  real customer message has been used.
- No WhatsApp User, OAuth, access-token storage/refresh, Graph API call,
  outbound message, template, media, delivery/read status, attachment, or
  automatic webhook registration exists.
- No rate limit, structured observability, alerting, backup/restore, retention
  or deletion workflow, encryption-at-rest assurance, secret rotation,
  user/organization/RBAC model, audit trail, or production deployment exists.
- A `200` from local synthetic ingress does not prove Meta accepts the TLS
  endpoint or that an account is eligible for live traffic. A green test or
  GitHub check is not a production claim.

## Next authorized work

After final local and GitHub evidence for the exact Phase 3c commit, keep live
provider use separate: require explicit owner authorization before connecting a
real Meta App/WABA/business phone or exposing public TLS. Then continue with
the next official connector only after current official documentation and a new
bounded design.
