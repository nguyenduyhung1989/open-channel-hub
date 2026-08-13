# ADR-0007: Runtime-configured connection registry and token-bound account selection

**Date:** 2026-08-13
**Status:** accepted

## Context

The first Telegram Bot slice assumed one implicit connection per process. That
was enough to prove a narrow receive/send path, but it would make a second
account ambiguous at every boundary: a webhook could reach the wrong connector,
an operator token could read another account, and durable event rows would have
no verified relationship to the configured connector.

The product must grow toward multiple official accounts without storing phone
numbers, provider account names, bot tokens, operator tokens, webhook secrets,
raw provider payloads, or configuration files in PostgreSQL. It must also keep
the existing single-bot environment configuration temporarily usable for early
operators.

## Decision

### Runtime configuration is an explicit secret document

Multi-connection mode reads one local JSON document from the absolute path in
<code>CONNECTIONS_CONFIG_FILE</code>, or decodes one unpadded base64url JSON
document from the absolute path in <code>CONNECTIONS_CONFIG_BASE64_FILE</code>.
The two inputs are mutually exclusive. The document has a strict versioned
shape and supports <code>telegram_bot</code>, <code>zalo_oa</code>, and
<code>facebook_page</code> entries.
A Telegram entry has an opaque connection ID, a Bot token, an operator bearer
token, a webhook secret, and an optional public webhook URL. A Zalo OA entry
has an opaque connection ID, <code>appId</code>, <code>oaId</code>,
<code>oaSecretKey</code>, an operator bearer, and an optional fixed App-level
webhook URL. A Facebook Page entry has an opaque connection ID,
<code>appId</code>, <code>pageId</code>, <code>appSecret</code>,
<code>webhookVerifyToken</code>, an operator bearer, and an optional fixed
App-level webhook URL. Several Facebook Pages may share one App only when those
two App credentials are identical.

The document is a secret because it contains inline credentials. It is never
committed, logged, exposed through an API, or stored in PostgreSQL. Direct or
other non-Compose runtimes can use the Git- and Docker-ignored
<code>runtime-connections.local.json</code> convention or a mounted secret at
an absolute path through <code>CONNECTIONS_CONFIG_FILE</code>. Compose instead
receives a one-line unpadded base64url
<code>CONNECTIONS_CONFIG_BASE64</code> value from the local environment/secret
store and mounts it only as the <code>runtime_connections_base64</code> Docker
secret at <code>/run/secrets/runtime_connections_base64</code>, owned by runtime
UID/GID <code>10001:10001</code> with mode <code>0400</code>. The API receives
only <code>CONNECTIONS_CONFIG_BASE64_FILE</code> and decodes the secret locally.
Base64url prevents Compose from treating a credential's <code>$</code> as an
environment interpolation marker; it is an encoding boundary, not encryption.

The loader rejects unknown fields, duplicate connection IDs, duplicate
Telegram/operator credential-role values, duplicate Zalo
<code>(appId, oaId)</code> pairs, invalid paths, malformed JSON, invalid public
webhook URLs, and every provider/network operation at load time. It
intentionally makes no undocumented claim that Zalo OA entries sharing an App
ID must share an OA secret.
Although old one-Bot environment labels are retained for compatibility, the
multi-connection document rejects the path-component IDs <code>.</code> and
<code>..</code>. Its public error deliberately omits file paths, JSON contents,
and secrets.

### PostgreSQL records only connection identity metadata

Migration <code>0003_connection_registry</code> creates
<code>open_channel_hub.connection_registry</code>. A row contains only:

- opaque <code>connection_id</code>;
- connector ID;
- channel;
- connector tier; and
- an optional non-secret provider-identity fingerprint; and
- registration timestamp.

Before the API accepts provider traffic, startup derives those values from each
compiled connector manifest and idempotently registers them through a
domain-owned registry port. Reusing an ID with different connector metadata
causes safe startup failure rather than silent identity drift.

Migration <code>0004_inbound_events_connection_registry_fk</code> adds a
foreign key from <code>inbound_events.connection_id</code> to that registry
with PostgreSQL <code>NOT VALID</code>. It protects every new event write while
allowing an older Phase 2a installation to retain historical rows that existed
before the registry. A later explicit migration may validate the constraint
only after historical identity records are deliberately reconciled; this change
does not hide a data backfill in schema migration code.

Migration <code>0005_connection_registry_provider_identity</code> adds an
optional fingerprint column, then requires a domain-separated SHA-256
fingerprint for every <code>zalo_oa</code> registration. The fingerprint derives
from its configured <code>(appId, oaId)</code> pair and retains neither the raw
pair nor a secret. A restart with the same pair is safe; a changed fingerprint
for an existing Zalo connection ID fails registration. The first Zalo binding is
also refused when older pre-registry inbound history already uses that ID, so
the new source never silently claims that old rows belonged to a newly chosen
OA. Telegram remains without an equivalent provider-identity fingerprint because
this configuration does not contain a comparable non-secret Bot account ID.

Migration
<code>0006_connection_registry_facebook_page_provider_identity</code> requires
the same opaque fingerprint field for every <code>facebook_page</code> row. Its
domain-separated digest derives from `(appId, pageId)`, never stores those raw
identifiers or a credential, rejects rebinding an existing Page connection ID,
and uses the same pre-registry-history guard. It does not add an equivalent
Telegram binding.

### Credentials select an account; callers never select one

Multi-connection webhook ingress is
<code>POST /v1/webhooks/telegram-bot/:connectionId</code>. The route resolves
the configured feature internally, then checks that feature's webhook secret;
an unknown ID and a wrong secret have the same <code>401</code> result.

The existing operator routes remain
<code>POST /v1/telegram-bot/messages</code> and
<code>GET /v1/telegram-bot/inbound-events</code>. They do not accept a
connection ID in a route, query, or header. A unique bearer token resolves one
configured feature inside the process, and the route supplies that feature's
connection ID to the domain operation. Inbound-event cursors bind the resolved
connection ID, so a cursor from one account is rejected for another account.

Zalo OA webhook ingress is the fixed
<code>POST /v1/webhooks/zalo-oa</code> path. It reads the signed payload's
<code>app_id</code> and <code>recipient.id</code> to resolve one configured
<code>(appId, oaId)</code> pair, then verifies <code>X-ZEvent-Signature</code>
over the original raw JSON bytes with that entry's <code>oaSecretKey</code>. The
caller still never supplies the internal connection ID. This Phase 3a
inbound-only boundary does not create an OAuth workflow, store an Official
Account access token, send a provider request, or register a webhook
automatically.

Facebook Page webhook ingress is the fixed
<code>GET</code>/<code>POST /v1/webhooks/facebook-page</code> path. GET checks
the configured verify token and returns Meta's challenge. POST collects every
untrusted `entry[].id` Page ID, requires one configured App for the entire
batch, and then verifies <code>X-Hub-Signature-256</code> over the original raw
bytes with that App's secret. The caller never supplies an internal connection
ID. The Phase 3b inbound-only boundary does not store a Page access token, call
the Graph API, send a provider request, or register a webhook automatically.

### Temporary legacy compatibility

The original one-bot environment variables remain supported temporarily. They
continue to use the legacy webhook path
<code>POST /v1/webhooks/telegram-bot</code>. Multi-connection configuration
cannot coexist with <code>TELEGRAM_BOT_ENABLED=true</code> or nonblank legacy
Bot token, operator token, webhook secret, or webhook URL variables. This
prevents a process from having two sources of account authority.

## Options considered

### Keep one process/one account forever

Rejected. It duplicates deployment, migration, and monitoring work per account
and leaves no durable account identity model for a shared hub.

### Let callers pass a connection ID

Rejected. A bearer token plus a caller-controlled account identifier creates a
straightforward cross-account access-control failure surface.

### Expose connection-registry CRUD over the operator API

Rejected for this alpha. Configuration writes, deletion, account discovery,
organization ownership, and audit logging require a real administration and
authorization model that does not exist yet.

### Store a provider account identity or credentials in PostgreSQL

Rejected. The registry needs only a stable internal identifier and immutable
connector metadata. Provider names, numbers, tokens, and secrets increase the
durable-data risk without enabling a current feature.

### Remove the legacy environment mode immediately

Rejected for now. Retaining one narrow, documented compatibility path lowers
migration friction. It is deliberately mutually exclusive with the new mode,
not a second configuration layer.

## Consequences

- One runtime can hold multiple official Telegram Bot, Zalo OA, and Facebook
  Page accounts
  without giving an HTTP caller a way to choose somebody else's account.
- The database can reject future event rows whose connection was never
  registered, while old Phase 2a rows remain available for an explicit future
  reconciliation decision.
- A Zalo OA or Facebook Page connection ID with durable history cannot be
  silently repointed to another configured provider pair. The database records
  only a domain-separated hash, not the pair itself or a credential; this
  narrower binding does not currently apply to Telegram.
- Connection IDs are durable internal identifiers. Operators must not reuse an
  existing ID for a different connector, channel, or tier.
- This is configuration plumbing, not a multi-tenant SaaS. It adds no user
  accounts, organization model, RBAC, dashboard, public connection listing,
  OAuth, secret rotation, inbox, outbox, retry queue, retention policy, or
  real provider verification.
- A multi-account configuration change requires a controlled API restart; a
  real webhook registration remains a separate owner-authorized network action.
