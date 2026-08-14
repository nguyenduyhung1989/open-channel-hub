# Phase 2a PostgreSQL: operations and data boundary

**Status:** the durable inbound-event ledger, connection registry, immutable
source-bound reply-command ledger, and synthetic Docker proof source are
implemented. The verified Phase 4e server-rendered queued-history source and
verified Phase 4f dashboard reply-intent source add no schema change. The
Phase 4g append-only delivery-evidence migration is a verified source at exact
commit <code>6444699</code>; it has no provider dispatch or production
verification claim. Phase 4h adds verified authorization-provenance migration,
Phase 4i adds verified Telegram private-reply evidence, and Phase 4j adds
verified Telegram delivery-authorization evidence. The combined source passed
final local checks, independent audit, synthetic Compose/PostgreSQL proof,
GitHub CI, and CodeQL at exact commit <code>52608e0</code>; it remains no
provider-dispatch claim.
The Phase 5a experimental Zalo User bridge is a source candidate. Its additive
fourteenth migration stores only an internal group/user classification and an
opaque account-binding fingerprint; it stores no QR/session material, group
target, bridge bearer, local-control bearer, or provider result. It has no
real-account, provider-send, or production verification claim.
Phase 4e's final local
verification includes a synthetic Compose proof, but that loopback HTTP proof
does not establish external HTTPS cookie behavior. Phase 4f source verification
at `74fca30` likewise does not prove a production deployment, a backup/restore
solution, or a real provider verification.

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

| Object                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>schema_migrations</code>                         | Immutable record of forward schema migrations applied by this binary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| <code>connection_registry</code>                       | Opaque connection ID, immutable connector metadata, registration timestamp, and a non-secret provider-identity fingerprint when Zalo OA, Facebook Page, WhatsApp Business, verified Telegram private-reply eligibility, or candidate Zalo User is configured.                                                                                                                                                                                                                                                                                                                                             |
| <code>inbound_events</code>                            | Canonical inbound text-event ledger. Its primary key is <code>(connection_id, provider_event_id)</code>. Verified Phase 4i adds an internal Telegram chat-type field for new Telegram rows only; candidate Phase 5a adds an internal Zalo User `user`/`group` field.                                                                                                                                                                                                                                                                                                                                      |
| <code>dashboard_sessions</code>                        | Optional Phase 4b browser-session metadata: only HMACs of random session/anti-forgery values, principal ID, timestamps, and revocation state. It contains no raw token, password, credential, or inbox membership.                                                                                                                                                                                                                                                                                                                                                                                        |
| <code>outbound_commands</code>                         | Phase 4c immutable source-bound reply intents. It retains a private target derived from canonical inbound `conversation_id`, source message/channel, message text, client operation ID, `queued` state, and timestamps. Phase 4d reads a safe scoped projection of queued rows without changing this table; the Phase 4e source reuses that reader for a smaller server-rendered dashboard projection. The verified Phase 4f source reuses the existing source-bound store through an explicitly granted dashboard form. It has no provider credential, raw payload, attempt, receipt, or delivery state. |
| <code>outbound_delivery_attempts</code>                | Verified Phase 4g append-only evidence that one command has a durable local attempt fact. One command can have at most one such row. It contains no target, message text, credential, provider response, HTTP detail, retry field, or mutable delivery state.                                                                                                                                                                                                                                                                                                                                             |
| <code>outbound_delivery_attempt_receipts</code>        | Verified Phase 4g append-only recorded-outcome evidence for one stored attempt. Its constraint permits exactly `provider_accepted`, `provider_rejected`, or `outcome_unknown`; only acceptance has a provider message ID. It proves neither network delivery nor read status.                                                                                                                                                                                                                                                                                                                             |
| <code>outbound_command_authorizations</code>           | Verified Phase 4h immutable provenance for a newly created command. It records only authority kind, configured inbox ID, optional dashboard principal ID, scope fingerprint, and recording time. It has no bearer, browser session, password/hash, target, text, provider data, delivery result, retry, or mutable state.                                                                                                                                                                                                                                                                                 |
| <code>outbound_telegram_command_eligibility</code>     | Verified Phase 4i immutable evidence for one new Telegram command: command ID, opaque Bot fingerprint, `private`, and recording time. It has no token, Bot ID, target, text, provider response, attempt, receipt, or mutable state.                                                                                                                                                                                                                                                                                                                                                                       |
| <code>outbound_telegram_delivery_authorizations</code> | Verified Phase 4j immutable human authorization evidence for one already eligible Telegram command: command ID, configured inbox/principal, scope fingerprint, opaque Bot fingerprint, and recording time. It has no target, text, bearer/session, token, provider response, attempt, receipt, retry, or mutable state.                                                                                                                                                                                                                                                                                   |

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
<code>(appId, wabaId, phoneNumberId)</code> triple. Verified Phase 4i's
<code>0012</code> migration requires a Telegram fingerprint derived from the
numeric Bot-ID prefix of the configured token only. It does not retain the
prefix or token and refuses to attach a first Telegram fingerprint to a
connection ID that already has inbound history. The subsequent foreign key from
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
raw payload, credential, or delivery-attempt data. Phase 4d made no migration;
at that revision, <code>0009_outbound_reply_commands</code> was the ninth
entry.

The Phase 4e source does not query the database from the browser or add a
new storage path. After the existing dashboard session is authenticated, its
server-side history closure reuses the Phase 4d reader for the configured
principal's already assigned inbox. It renders only escaped creation time,
recorded text, source connection ID, and a recorded-not-sent label. It adds no
migration, table, index, trigger, command-row mutation, provider call, worker,
or delivery state. Viewing the page touches only the pre-existing dashboard
session record for its idle timeout.

The verified Phase 4f source likewise keeps the browser away from PostgreSQL. A
server-rendered event form sends its strict source reference and text to the
existing dashboard route; after signed-session, exact-origin, anti-forgery, and
explicit write-scope checks, a narrow server closure calls the existing Phase
4c command store. The immutable command transaction still derives its private
target from the durable inbound source. No migration, table, index, trigger,
or command state changes. Its local per-principal write guard is in process;
it is not a database or distributed rate-limit mechanism.

The verified Phase 4g source adds forward migration
<code>0010_outbound_delivery_attempt_receipts</code>. It leaves
<code>outbound_commands</code> immutable and `queued`, then adds an optional
immutable attempt row for a command and an optional immutable receipt row for
that attempt. `command_id` is unique in the attempt table, and `attempt_id` is
the receipt primary key, so this bounded foundation has at most one durable
attempt fact per command and at most one receipt per attempt. Both tables have
their own update/delete-rejection trigger. A receipt may be
<code>provider_accepted</code> only with a non-empty printable provider message
ID; <code>provider_rejected</code> and <code>outcome_unknown</code> require no
provider message ID. Absence of a durable attempt row supports only a derived
<code>not_attempted</code>-in-this-ledger label, not proof that an external
provider call never happened. A durable attempt without a receipt is
conservatively unknown. This verified source adds no route, reader, dashboard result,
worker, provider HTTP request, credential, retry policy, or command state
transition. See the dedicated
[Phase 4g delivery-evidence guide](outbound-delivery-evidence-4g.md).

The verified Phase 4h source adds forward migration
<code>0011_outbound_command_authorizations</code>. `command_id` is both its
primary key and foreign key to <code>outbound_commands</code>, so a new command
has at most one immutable provenance row. Its exact authority kind is either
<code>inbox_bearer</code> with no dashboard principal or
<code>dashboard_principal</code> with one valid dashboard principal; both have
one configured inbox ID and a SHA-256 fingerprint of the sorted connection
scope evaluated at command creation. The PostgreSQL adapter writes it in the
same transaction as a new command and never accepts it from HTTP/browser input.
The migration does not backfill old commands. A row is historical evidence, not
current permission, and it adds no provider request, delivery behavior, worker,
or command state transition. See the verified
[Phase 4h authorization-provenance guide](outbound-command-authorization-provenance-4h.md).

The verified Phase 4i source adds forward migration
<code>0012_telegram_private_reply_eligibility</code>. New Telegram inbound rows
must carry one recognized chat type; non-Telegram rows carry none. A new Telegram
command must derive from a private source with a current registry fingerprint,
then writes an immutable one-to-one eligibility row in the same transaction as
the command and Phase 4h provenance. Historic rows and commands are not
backfilled. See the verified
[Phase 4i private-reply guide](telegram-private-reply-eligibility-4i.md).

The verified Phase 4j source adds forward migration
<code>0013_outbound_telegram_delivery_authorizations</code>. A row can exist
only for a Phase 4i eligibility row and records a configured dashboard
principal's approval fact after current source/provenance/Bot/no-attempt
rechecks. It is append-only, never backfills historic commands, and does not
authorize provider I/O. See the verified
[Phase 4j delivery-authorization guide](telegram-delivery-authorization-4j.md).

The Phase 5a candidate adds forward migration
<code>0014_zalo_user_thread_type_and_provider_identity</code>. It appends
`zalo_user_thread_type` to `inbound_events` with a channel-matching constraint:
only `zalo_user` rows may contain `user` or `group`; all other channels remain
null. It also requires an opaque provider-identity fingerprint for every new
`zalo_user` registry row. No bridge token, local-control token, QR/session
material, image, raw provider object, or provider result is stored. The
canonical inbound event still retains the group conversation identifier in
`inbound_events.conversation_id`; migration `0014` does not add a second
group-target copy, and only an operator-bearer event reader can return it.

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
does not turn a queued row into a send. Exact commit <code>465186e</code>
completed Phase 4e final local verification, including a rerun of that
synthetic Compose smoke, independent security review, and fresh GitHub
CI/CodeQL. The loopback HTTP smoke still cannot prove the dashboard's external
HTTPS cookie boundary.

The Phase 4f source at `74fca30` reuses `0009` without a schema change. Its
final local behavior/security evidence, synthetic Compose smoke with cleanup,
and fresh GitHub checks are recorded in the Phase 4f operations guide. That
evidence still does not prove an external HTTPS proxy, provider send, or
production authorization model.

The verified Phase 4g source advances the migration count to ten. Its Compose
smoke checks structural evidence only: the new tables, foreign keys, unique
command binding, receipt primary key, outcome/provider-message-ID constraints,
and immutable triggers. It does not insert an attempt or receipt, run a worker,
make a provider request, or demonstrate delivery semantics.

Exact commit <code>6444699</code> passed <code>npm run check</code> (54 test
files / 358 tests and build), <code>npm audit --audit-level=low</code> with
zero findings, Gitleaks with no secrets, <code>git diff --check</code>, a
synthetic Compose smoke with cleanup, an independent security audit APPROVE
with zero high/medium findings, and GitHub checks <code>Verify Node 24.18.1</code>
and <code>Analyze JavaScript and TypeScript</code>. This verifies frozen source
and synthetic local evidence only; it does not prove public TLS, live provider
I/O, provider acceptance, delivery, read status, or production deployment.

The verified Phase 4h source advances the expected migration count to eleven. Its
Compose addition checks only the migration, exact column shape, foreign key,
primary key, named constraints, and immutable trigger. The existing Phase 4c
API command checks remain and may create provenance atomically with their
source-bound commands; the Phase 4h smoke adds no direct SQL/DML or semantic
assertion for authorization rows. It makes no provider call. The verified Phase 4i
source advances the expected count to twelve. Its synthetic extension uses
only fake Telegram-shaped tokens and private/supergroup payloads, checks the
new table/constraints/trigger plus opaque fingerprints, and confirms that a
supergroup source cannot create a command. It makes no provider call. The verified Phase 4j
source advances the expected count to thirteen. Its Compose extension uses
a disposable synthetic dashboard configuration and manually returns a signed
`Secure` cookie to `curl` so the server-rendered authorization route reaches
the actual PostgreSQL writer. It checks the table's exact structural boundary
and create/replay/conflict plus unavailable branches for legacy,
Bot-drifted, non-private, and already-attempted synthetic commands. The
fixture directly seeds only disposable synthetic rows needed to reach those
unavailable branches; the writer itself creates no attempt. This remains no
browser-over-HTTP or external HTTPS-cookie proof and makes no provider call.
The combined Phase 4h–4j source is verified at exact commit <code>52608e0</code>
after final local checks, independent audit, the synthetic Compose/PostgreSQL
proof, GitHub CI, and CodeQL.

The Phase 5a candidate advances the expected migration count to fourteen. Its
disposable Compose extension checks the exact new inbound column and the two
named `NOT VALID` constraints structurally. The bridge itself is deliberately
not started by Compose, so this is not a QR login, Zalo User send, reconnect,
or real-account proof.

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
  confirmation, or production monitoring. The verified Phase 4g source stores only
  a narrow append-only evidence foundation; it is not a dispatcher or delivery
  feature. The verified Phase 4h source stores historical authority provenance only;
  it is not current authorization or a send feature. The Phase 4e source renders
  queued intent through an authenticated dashboard session, and the Phase 4f
  source can record that existing source-bound intent through an explicit
  dashboard grant.

These gaps are intentionally left visible in the roadmap and threat model.
