# ADR-0008: Facebook Page signed inbound text boundary

**Date:** 2026-08-13
**Status:** accepted

## Context

Open Channel Hub needs another official channel without turning a first inbound
slice into an OAuth client, a send engine, or an unbounded raw-payload archive.
Facebook Page Messenger webhooks differ materially from Telegram and Zalo OA:
Meta first verifies one fixed callback through a GET challenge, then signs POST
bodies with HMAC-SHA256 of the exact raw request bytes using an App secret. A
single App can serve multiple Pages, while the POST envelope identifies Page
IDs but does not include the App ID.

The service already has a secret-backed multi-connection document, a canonical
PostgreSQL inbound-event ledger, token-bound account reads, and an immutable
registry. It must retain Page isolation even when a batch contains more than
one Page and must prevent a durable internal connection ID from silently moving
to another provider account.

## Decision

Phase 3b adds a receive-only `facebook_page` connector and keeps all Meta
network operations outside this slice.

- Runtime entries contain opaque `id`, decimal `appId` and `pageId`, `appSecret`,
  `webhookVerifyToken`, unique `operatorApiToken`, and optional fixed public
  `/v1/webhooks/facebook-page` URL. The document allows several Pages for one
  App only when the App secret and verify token match exactly.
- `GET /v1/webhooks/facebook-page` validates `hub.mode=subscribe` and the
  configured verify token, then returns `hub.challenge`. `POST` receives a
  raw Buffer in its own Fastify child scope. It parses only enough untrusted
  JSON to collect every Page ID, requires all Pages to resolve to one configured
  App, and only then verifies `X-Hub-Signature-256` against the untouched bytes.
- A cross-App, unknown, malformed, or invalid-signature batch returns generic
  `401` before normalization or storage. Signed supported text becomes a
  canonical event; signed unsupported items receive `200` without storage;
  storage failure returns generic `500` for provider retry.
- `GET /v1/facebook-page/inbound-events` follows the existing bearer-bound,
  canonical-only cursor convention. The caller never supplies a connection ID.
- Migration `0006_connection_registry_facebook_page_provider_identity` requires
  the existing provider-identity fingerprint column for `facebook_page` rows.
  The App/Page pair is hashed with a domain separator; raw provider IDs and
  credentials never enter PostgreSQL. The generic registry blocks rebinding and
  rejects first identity-bound registration when pre-registry history already
  uses its connection ID.

## Options considered

### Start with Graph API token storage and outbound sends

Rejected. Page access tokens, permissions, customer-window policy, retry, and
outbox behavior are separate risks. Inbound text proves the authenticated
ingress and ledger without claiming an operational messaging client.

### Use Page ID alone as the permanent account binding

Rejected. Page selection is necessary for batch routing, but the durable
binding must include the Meta App context so an internal ID cannot silently
move between configured Apps that happen to reference a Page differently.

### Verify only the first Page in a batch

Rejected. It would make App selection ambiguous and could process a convenient
subset of a multi-Page webhook. The route requires all batch Page IDs to map to
the same configured App before one HMAC verification.

### Reconstruct JSON before HMAC verification

Rejected. JSON whitespace, key ordering, and Unicode escaping alter the signed
bytes. The raw Buffer is used for HMAC, and parsing occurs only for controlled
internal selection/normalization.

## Consequences

- The platform gains one official Facebook Page inbound text boundary without
  Facebook User automation, access-token storage, Graph API calls, or outbound
  messages.
- A single App can serve several configured Pages while each Page has an
  isolated operator bearer, ledger connection, cursor, and durable identity
  fingerprint.
- Real Meta App/Page configuration, public TLS, permissions, Advanced Access,
  operational response timing, and a harmless live test remain explicit owner
  actions outside source implementation.
- Further Meta surfaces must pass their own official-document review and
  acceptance criteria rather than being implied by this connector.
