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
shape and currently supports only <code>telegram_bot</code> entries. Each entry
has an opaque connection ID, a Telegram Bot token, an operator bearer token, a
webhook secret, and an optional public webhook URL.

The document is a secret because it contains inline credentials. It is never
committed, logged, exposed through an API, or stored in PostgreSQL. Direct
direct or other non-Compose runtimes can use the Git- and Docker-ignored
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

The loader rejects unknown fields, duplicate connection IDs, duplicate values
across all Bot/operator/webhook credentials, invalid paths, malformed JSON,
invalid public webhook URLs, and every provider/network operation at load time.
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

### Tokens select an account; callers never select one

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

- One runtime can hold multiple official Telegram Bot accounts without giving
  an HTTP caller a way to choose somebody else's account.
- The database can reject future event rows whose connection was never
  registered, while old Phase 2a rows remain available for an explicit future
  reconciliation decision.
- Connection IDs are durable internal identifiers. Operators must not reuse an
  existing ID for a different connector, channel, or tier.
- This is configuration plumbing, not a multi-tenant SaaS. It adds no user
  accounts, organization model, RBAC, dashboard, public connection listing,
  OAuth, secret rotation, inbox, outbox, retry queue, retention policy, or
  real provider verification.
- A multi-account configuration change requires a controlled API restart; a
  real webhook registration remains a separate owner-authorized network action.
