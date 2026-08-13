# Phase 2a PostgreSQL: operations and data boundary

**Status:** the durable inbound-event ledger, connection registry, immutable
source-bound reply-command ledger, and synthetic Docker proof source are
implemented. This is not a production deployment, a backup/restore solution,
or a real provider verification.

## What this stack creates

The supplied Compose stack creates three services:

1. <code>postgres</code> runs a pinned PostgreSQL 18.4 image on the internal
   <code>hub-data</code> network. It has no host port.
2. <code>migrate</code> runs the schema migration CLI after PostgreSQL becomes
   healthy. The API waits for it to finish successfully.
3. <code>api</code> uses the non-superuser
   <code>open_channel_hub</code> application role and exposes only
   <code>127.0.0.1:3000</code> on the host.

The database and schema are both named <code>open_channel_hub</code>. The
application schema contains:

| Object                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>schema_migrations</code>   | Immutable record of forward schema migrations applied by this binary.                                                                                                                                                                                                                                                                                                                        |
| <code>connection_registry</code> | Opaque connection ID, immutable connector metadata, registration timestamp, and a non-secret Zalo OA, Facebook Page, or WhatsApp Business provider-identity fingerprint when those channels are configured.                                                                                                                                                                                  |
| <code>inbound_events</code>      | Canonical inbound text-event ledger. Its primary key is <code>(connection_id, provider_event_id)</code>.                                                                                                                                                                                                                                                                                     |
| <code>dashboard_sessions</code>  | Optional Phase 4b browser-session metadata: only HMACs of random session/anti-forgery values, principal ID, timestamps, and revocation state. It contains no raw token, password, credential, or inbox membership.                                                                                                                                                                           |
| <code>outbound_commands</code>   | Phase 4c immutable source-bound reply intents. It retains a private target derived from canonical inbound `conversation_id`, source message/channel, message text, client operation ID, `queued` state, and timestamps. Phase 4d reads a safe scoped projection of queued rows without changing this table. It has no provider credential, raw payload, attempt, receipt, or delivery state. |

The ledger stores a canonical event ID, channel/type/timestamps, conversation
and sender/message identifiers, and message text. It intentionally does **not**
store raw provider payloads. Canonical identifiers and text are still sensitive
data; absence of raw payload is data minimization, not anonymity.

Every migration is applied under a transaction-scoped PostgreSQL advisory lock.
A second migrator waits instead of racing the ledger. A known migration is
recorded only after its DDL succeeds. Future production changes must add a new
forward migration; do not edit or delete an applied migration.

The Phase 2c registry migration intentionally stores no Bot/OA token, operator
token, webhook secret/signature material, raw provider account name/ID, phone
number, or JSON configuration. Phase 3a's additive <code>0005</code> migration
stores a domain-separated SHA-256 fingerprint of each Zalo OA
<code>(appId, oaId)</code> pair. This opaque value is not a credential or raw
provider identifier; it prevents the durable Zalo connection label from being
silently rebound to a different pair. Phase 3b's additive <code>0006</code>
migration requires the same kind of fingerprint for each Facebook Page
<code>(appId, pageId)</code> pair. Phase 3c's additive <code>0007</code>
migration requires the same kind of fingerprint for each WhatsApp Business
<code>(appId, wabaId, phoneNumberId)</code> triple. Telegram entries remain
without a provider-identity fingerprint because this configuration does not hold
an equivalent non-secret Bot account identity. The subsequent foreign key from
<code>inbound_events.connection_id</code> to the registry is marked
<code>NOT VALID</code>: PostgreSQL enforces new rows, while older Phase 2a
history can be reconciled and explicitly validated later. Do not manually
backfill, delete, or alter the registry in a deployed database.

Phase 4b's additive <code>0008_dashboard_sessions</code> migration is separate
from both the event ledger and registry. It records only HMACs of random
browser-token values, a configured principal ID, session times, and revocation
state. It does not record a raw browser token, password, password hash, inbox
bearer, provider credential, or inbox membership.

Phase 4c's additive <code>0009_outbound_reply_commands</code> migration creates
the separate <code>outbound_commands</code> ledger. It has a composite foreign
key to the exact source <code>inbound_events</code> row and unique
<code>(connection_id, client_operation_id)</code> idempotency. PostgreSQL
rejects every update and delete through an immutable-row trigger. Its private
reply target is copied from the source event's canonical conversation inside
the storage transaction; it is not a request field or public API field. The
only current state, <code>queued</code>, proves a committed intent only, not
provider acceptance, a send attempt, delivery, or read receipt.

Phase 4d adds a parameterized, inbox-scoped reader over that same immutable
table. It selects only queued rows in a fixed command-ID snapshot and projects
command/source IDs, message text, state, and creation time. It deliberately
does not select a reply target, source message/channel, client operation ID,
raw payload, credential, or delivery-attempt data. No migration changes the
schema: <code>0009_outbound_reply_commands</code> remains the ninth entry.

## Configure without exposing passwords

Copy <code>.env.example</code> to <code>.env</code> and edit it locally. Do not
put values in a shell command, terminal history, GitHub artifact, issue, pull
request, screenshot, or log.

The first Compose start requires:

| Variable                       | Role                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>SOURCE_OFFER_URL</code>  | Exact public, unauthenticated corresponding-source HTTPS URL for this running version. It is required because Compose uses production mode. |
| <code>POSTGRES_PASSWORD</code> | PostgreSQL bootstrap password.                                                                                                              |
| <code>DATABASE_PASSWORD</code> | Password for the non-superuser <code>open_channel_hub</code> application role.                                                              |

The two passwords must be different, 32–512 characters, visible, and
non-whitespace. Compose sources them as Docker secrets. The PostgreSQL process
gets its bootstrap secret from a secret file; the API and migration process get
only the application secret file. Neither database password is an API
environment variable.

If multi-connection mode is enabled, <code>CONNECTIONS_CONFIG_BASE64</code> is
a third Compose secret source. It is the unpadded base64url encoding of a JSON
document that contains inline Telegram Bot, Zalo OA, Facebook Page, and/or
WhatsApp Business credentials. The encoded value is
mounted only for the API as <code>runtime_connections_base64</code>; it is not
sent to the API as an environment value and never belongs in PostgreSQL.
Base64url prevents Compose from expanding credential <code>$</code> characters;
it is not encryption. The precise configuration, compatibility, and route rules
are in the
[runtime multi-connection guide](runtime-multi-connection-2c.md) and the
[Phase 3a Zalo OA guide](zalo-oa-3a.md) and
[Phase 3b Facebook Page guide](facebook-page-3b.md) and
[Phase 3c WhatsApp Business guide](whatsapp-business-3c.md).

Do **not** assume that editing <code>.env</code> rotates an existing database
password. The role-creation script runs only while a new PostgreSQL volume is
initialized. A safe rotation procedure is not implemented yet; stop and design
one before changing a running data volume.

## Start and verify

After local editing of <code>.env</code>:

```bash
docker compose up --build
curl http://127.0.0.1:3000/ready
```

If another local process already uses host port <code>3000</code>, set
<code>API_HOST_PORT</code> to an unused loopback port in <code>.env</code> and
use that port for the readiness request. The API still listens on port
<code>3000</code> inside its container.

<code>/health</code> means the API process is alive.
<code>/ready</code> checks the expected PostgreSQL migration and returns
<code>503</code> if the database or schema is unavailable. If
<code>migrate</code> fails, Compose does not start the API.

The following inspection commands reveal schema names only, not message data or
passwords:

```bash
docker compose exec postgres psql --username=postgres --dbname=open_channel_hub -c '\dn open_channel_hub'
docker compose exec postgres psql --username=postgres --dbname=open_channel_hub -c '\dt open_channel_hub.*'
```

The verified Phase 2b local proof used only synthetic values. It ran the
migration twice, delivered the same fake webhook twice, observed two
<code>204</code> responses, and verified exactly one ledger row. The verified
Phase 2c proof extended this to two registered Telegram connections. The
verified Phase 3a proof added two synthetic Zalo OA connections, raw-byte
signature checks, and non-secret registry fingerprints. The verified Phase 3b
proof added two synthetic Facebook Pages on one fake App, raw-byte HMAC checks,
and Facebook fingerprints. The verified Phase 3c proof added two synthetic
WhatsApp business phones on that same fake App, the common Meta callback,
raw-byte HMAC checks, and WhatsApp fingerprints for exact commit
<code>fd802cb</code>. Phase 4a's exact commit <code>705db0a</code> adds
separate support and sales inboxes across those accounts, aggregate bearer
scope, cross-inbox cursor rejection, and canonical-only output; it passed its
final local verification, independent review, and GitHub CI/CodeQL. No proof
path calls a provider or uses a real credential or message. Phase 4b's exact
commit <code>7672be9</code> adds the eighth migration for HMAC-only dashboard
sessions; it passed the same local verification, independent review, synthetic
Compose proof, and GitHub CI/CodeQL. The smoke remains dashboard-free because
it is loopback HTTP, not proof of browser cookies over external HTTPS. Phase
4c's verified <code>160414e</code> revision extends the synthetic proof to a
source-bound reply command:
one `201` create and one `200` exact replay produce one immutable row; a
different payload under the same operation ID returns `409`; absent and
out-of-scope sources share `404`; SQL proves that the stored reply target is
the source conversation. The proof makes no provider request and treats
`queued` as an unsent intent.
Phase 4d's verified <code>160414e</code> revision extends the same smoke source
with queued-history scope, safe-projection, continuation, and
foreign/malformed-cursor assertions. It still makes no provider request and
does not turn a queued row into a send.

## Container and network boundary

PostgreSQL is reachable only from services on the internal
<code>hub-data</code> network. It is not published on a host TCP port. The
application role is created with no superuser, database-creation, role-creation,
replication, or bypass-RLS privilege.

The API and migration containers run as a non-root user, drop all Linux
capabilities, use <code>no-new-privileges</code>, and have no host source/data
bind mount. They use a temporary <code>/tmp</code>. Their root filesystems are
**not** read-only in this Compose revision: the available environment-sourced
Docker secret mechanism cannot be injected into a read-only service. Treat that
as a real hardening limitation. A future change may replace the secret delivery
mechanism and restore read-only roots, but it must be implemented and verified
before claiming that control.

## Stop, preserve, and delete

Normal shutdown preserves the named PostgreSQL volume:

```bash
docker compose down
```

The following command is destructive:

```bash
docker compose down --volumes
```

It deletes the named <code>postgres-data</code> volume and all durable inbound
events and outgoing reply-command data in it. There is no implemented backup
or restore drill. Do not use it as a routine reset, and do not run it against
any data you need to keep.

## Explicit operational gaps

- No backup schedule, encrypted backup, restore procedure, or recovery test.
- No retention/deletion workflow or owner-facing request process for either
  inbound text or immutable reply-command text/targets.
- No database audit trail, user/account authorization model, rate limit, or
  capacity policy.
- No encryption-at-rest claim for the Docker volume or host disk.
- No dispatch worker, provider send/receipt path, retry policy, public
  TLS/proxy, real Telegram, Zalo OA, Facebook Page, or WhatsApp Business
  confirmation, or production monitoring.

These gaps are intentionally left visible in the roadmap and threat model.
