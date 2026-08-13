# ADR-0009: WhatsApp Business signed inbound text boundary

**Date:** 2026-08-13
**Status:** accepted

## Context

Open Channel Hub needs an official WhatsApp Business surface without turning a
first inbound slice into a Graph API client, token vault, send engine, or raw
payload archive. WhatsApp Business Cloud API webhook batches identify a WhatsApp
Business Account (WABA) at `entry[].id` and a business phone number in message
metadata, but do not identify the Meta App. Meta verifies one fixed callback
through a GET challenge and signs POST bytes with HMAC-SHA256 using the App
secret.

The service already has a secret-backed multi-connection document, a canonical
PostgreSQL inbound-event ledger, token-bound account reads, immutable registry
metadata, and a raw Meta HMAC boundary for Facebook Page. It must retain
business-phone isolation even when one signed batch contains several configured
phones or WABAs from one App, and must prevent a durable internal connection ID
from silently moving to another provider identity.

## Decision

Phase 3c adds a receive-only `whatsapp_business` connector and keeps all Meta
network operations outside this slice.

- Runtime entries contain opaque `id`, decimal `appId`, `wabaId`, and
  `phoneNumberId`, `appSecret`, `webhookVerifyToken`, unique
  `operatorApiToken`, and optional public
  `/v1/webhooks/whatsapp-business` or shared `/v1/webhooks/meta` URL. Phone IDs
  are unique; one WABA maps to one configured App. Several phones or WABAs may
  share one App only with exactly matching App credentials. Facebook Page
  entries may share that same App only with the same credentials and, whenever
  a URL is declared, the exact common `/v1/webhooks/meta` URL.
- The standalone `GET`/`POST /v1/webhooks/whatsapp-business` boundary supports
  an App used only by WhatsApp. An App shared with Facebook Page uses the
  common `GET`/`POST /v1/webhooks/meta` boundary. The selected route validates
  `hub.mode=subscribe` and a configured verify token, then returns
  `hub.challenge`. POST receives a raw Buffer in its own Fastify child scope.
  It parses only enough untrusted JSON to collect every WABA ID, requires all
  WABAs to resolve to one configured App, and only then verifies
  `X-Hub-Signature-256` against the untouched bytes.
- A cross-App, unknown, malformed, or invalid-signature batch returns generic
  `401` before normalization or storage. Signed supported text becomes a
  canonical event; signed unsupported items receive `200` without storage;
  storage failure returns generic `500` for provider retry.
- `GET /v1/whatsapp-business/inbound-events` follows the existing bearer-bound,
  canonical-only cursor convention. The caller never supplies a connection ID.
- Migration
  `0007_connection_registry_whatsapp_business_provider_identity` requires the
  existing provider-identity fingerprint column for `whatsapp_business` rows.
  The App/WABA/phone triple is hashed with a domain separator; raw provider IDs
  and credentials never enter PostgreSQL. The generic registry blocks
  rebinding and rejects first identity-bound registration when pre-registry
  history already uses its connection ID.

## Options considered

### Start with Graph API token storage and outbound sends

Rejected. Access tokens, templates, customer-window policy, permission scope,
retries, and durable outbox behavior are separate risks. Inbound text proves
the authenticated ingress and ledger without claiming an operational messaging
client.

### Bind an internal connection to a phone number alone

Rejected. Phone selection is necessary for routing, but the durable binding
must include its WABA and Meta App context so an internal ID cannot silently
move when one part of the provider hierarchy changes.

### Verify only the first WABA in a batch

Rejected. It would make App selection ambiguous and could process a convenient
subset of a multi-WABA webhook. The route requires every WABA in the batch to
map to the same configured App before one HMAC verification.

### Reconstruct JSON before HMAC verification

Rejected. JSON whitespace, key ordering, and Unicode escaping alter the signed
bytes. The raw Buffer is used for HMAC, and parsing occurs only for controlled
internal selection and normalization.

## Consequences

- The platform gains one official WhatsApp Business inbound text boundary
  without access-token storage, Graph API calls, outbound messages, templates,
  media, or WhatsApp User automation.
- One App can serve several configured WABAs and business phones while each
  phone has an isolated operator bearer, ledger connection, cursor, and durable
  identity fingerprint. If it also serves Facebook Page, both products use one
  explicit Meta callback rather than conflicting provider configuration.
- Real Meta App/WABA/phone configuration, public TLS, subscription/admin
  permissions, App Review/access requirements, operational response timing, and
  a harmless live test remain explicit owner actions outside source
  implementation.
- Further WhatsApp and Meta surfaces must pass their own official-document
  review and acceptance criteria rather than being implied by this connector.
