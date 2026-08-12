# Phase 2a PostgreSQL: operations and data boundary

**Status:** the durable inbound-event ledger and a synthetic local Docker proof
are implemented. This is not a production deployment, a backup/restore
solution, or a real Telegram verification.

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

| Object                         | Purpose                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| <code>schema_migrations</code> | Immutable record of forward schema migrations applied by this binary.                                    |
| <code>inbound_events</code>    | Canonical inbound text-event ledger. Its primary key is <code>(connection_id, provider_event_id)</code>. |

The ledger stores a canonical event ID, channel/type/timestamps, conversation
and sender/message identifiers, and message text. It intentionally does **not**
store raw provider payloads. Canonical identifiers and text are still sensitive
data; absence of raw payload is data minimization, not anonymity.

The first migration is applied under a transaction-scoped PostgreSQL advisory
lock. A second migrator waits instead of racing the ledger. A known migration
is recorded only after its DDL succeeds. Future production changes must add a
new forward migration; do not edit or delete an applied migration.

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

The local proof for this phase used only synthetic values. It ran the migration
twice, delivered the same fake webhook twice, observed two <code>204</code>
responses, and verified exactly one ledger row. It did not call Telegram or
use any real credential or message.

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
events in it. There is no implemented backup or restore drill. Do not use it as
a routine reset, and do not run it against any data you need to keep.

## Explicit operational gaps

- No backup schedule, encrypted backup, restore procedure, or recovery test.
- No retention/deletion workflow or owner-facing request process.
- No database audit trail, user/account authorization model, rate limit, or
  capacity policy.
- No encryption-at-rest claim for the Docker volume or host disk.
- No public TLS/proxy, real Telegram confirmation, or production monitoring.

These gaps are intentionally left visible in the roadmap and threat model.
