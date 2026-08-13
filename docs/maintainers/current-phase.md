# Public checkpoint: Phase 2c

**Updated:** 2026-08-13

**Objective:** establish a safe multi-account foundation before building an
inbox or additional providers. One runtime can hold several official Telegram
Bot connections, but credentials stay in a secret document, PostgreSQL stores
only opaque connection metadata, and HTTP callers cannot choose an account.
This checkpoint does not authorize a production deployment.

## Historical evidence that remains true

- Phase 0 GitHub CI and CodeQL succeeded at commit <code>8b80c3b</code>.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts,
  and automatic security fixes are enabled.
- GitHub CI and CodeQL succeeded for the Phase 1a candidate at
  <code>7141949</code>, the Phase 2a storage candidate at
  <code>f106bb8</code>, and the exact Phase 2b candidate at
  <code>4d5a9c9</code>. Each result applies only to its own commit.
- The <code>main</code> branch blocks force pushes and deletion, including by
  administrators. Required status checks and pull-request review requirements
  are intentionally unset so the current owner-controlled direct-push workflow
  remains possible.
- The <code>0.1.0</code> release tag has not been created; that is a separate
  owner decision.

Historical checks are not evidence for the current Phase 2c source. In
particular, the older Phase 2b Docker proof had one connection, not this
source’s two-connection configuration path.

## Current Phase 2c source

- A strict, versioned JSON document loaded from an absolute
  <code>CONNECTIONS_CONFIG_FILE</code>, or decoded from an absolute
  <code>CONNECTIONS_CONFIG_BASE64_FILE</code>, configures one to one hundred
  official Telegram Bot connections. The two sources are mutually exclusive.
  It is a secret because it contains inline Bot, operator, and webhook
  credentials.
- The loader rejects unknown fields, malformed JSON, unsafe file paths,
  duplicate IDs, every cross-connection credential collision, invalid public
  webhook URLs, and invalid configurations without reporting file paths,
  document contents, or secrets.
- Direct or other non-Compose runtimes can use the Git- and Docker-ignored
  <code>runtime-connections.local.json</code> convention or a mounted raw
  secret at an absolute path. Compose converts a nonblank unpadded base64url
  <code>CONNECTIONS_CONFIG_BASE64</code> host value into the
  <code>runtime_connections_base64</code> secret and mounts it only for the API
  at <code>/run/secrets/runtime_connections_base64</code> as
  <code>10001:10001 0400</code>. This encoding prevents Compose from expanding
  a credential <code>$</code>; it is not encryption and remains secret.
- The legacy one-Bot environment mode remains temporarily supported. It is
  mutually exclusive with multi-connection mode: a process refuses to start
  if the runtime config file coexists with enabled or nonblank legacy Bot
  credentials.
- Migration <code>0003_connection_registry</code> adds an immutable registry
  of opaque connection ID, connector ID, channel, tier, and registration time.
  It stores no phone number, provider account ID, token, secret, config file,
  or raw provider payload.
- Migration <code>0004_inbound_events_connection_registry_fk</code> adds a
  <code>NOT VALID</code> foreign key. New event writes must reference a
  registered connection; pre-registry Phase 2a rows remain for an explicit
  later reconciliation and validation decision.
- Before the API serves provider traffic, startup derives metadata from each
  compiled connector manifest and idempotently registers every configured
  connection. A reused ID with different metadata fails startup.
- Multi-connection webhook ingress is
  <code>POST /v1/webhooks/telegram-bot/:connectionId</code>. An unknown ID and
  a wrong webhook secret return the same <code>401</code> response before
  normalization or storage.
- The two existing operator routes remain free of a caller-selected connection
  ID. A unique bearer token resolves one configured feature inside the process,
  and an inbound-event cursor is bound to that resolved connection.

## Verified Phase 2b evidence

- The Phase 2b candidate passed its final local formatting, lint, type, test,
  build, dependency-audit, Compose-configuration, synthetic Docker, and
  independent-audit gates.
- Its synthetic Docker proof ran migration <code>0001</code> and
  <code>0002</code> twice, delivered one fake webhook twice with
  <code>204</code>, preserved one ledger row, and read its canonical event
  through the operator route. It used no real credential, Telegram request,
  provider payload archive, or production system.
- GitHub Continuous Integration and CodeQL passed for exact commit
  <code>4d5a9c9</code>.

## Current Phase 2c candidate

- The candidate adds migrations <code>0003</code> and <code>0004</code>, the
  configuration loader/catalog, token-bound dynamic routing, connection
  registry, Compose secret mount, documentation, and a two-connection synthetic
  smoke-test source.
- The smoke test is designed to run four migrations twice, verify two registry
  rows, post the same fake provider event to both account-specific webhook
  paths, prove idempotency within one account, read each account only with its
  token, reject a cross-account cursor, and inspect secret-file ownership/mode.
- Final local formatting, lint, type, test, build, and dependency-audit gates
  passed. The synthetic Compose proof ran all four migrations twice, verified
  two registered connections, proved bearer isolation and cursor rejection,
  and removed its temporary stack. An independent review found no HIGH or
  MEDIUM issue in the bounded Phase 2c scope.
- Fresh GitHub CI and CodeQL for the exact Phase 2c commit remain required
  before any Phase 2c release claim.

## Not yet verified or implemented

- No owner-authorized Telegram Bot test through a public TLS endpoint has
  occurred. Phase 1a is therefore still not complete.
- There is no user inbox, attachment persistence, Redis, queue/outbox, outbound
  retry, user/organization model, RBAC, TLS proxy, rate limit, or production
  observability.
- There is no public connection management, connection listing, OAuth, secret
  rotation, provider account discovery, or audit trail.
- There is no retention/deletion policy, backup schedule, encrypted backup,
  restore procedure, recovery drill, encryption-at-rest assurance, or database
  password rotation procedure.

## Open risks

- Canonical sender/conversation identifiers and message text remain durable
  sensitive data. Excluding raw payload and credentials reduces collection but
  does not make the ledger non-sensitive.
- A routine <code>docker compose down</code> preserves the database volume.
  <code>docker compose down --volumes</code> deletes it and every stored event;
  backups are not implemented.
- The configuration document has inline credentials. Docker-secret mounting
  narrows exposure inside Compose, but the host, local environment file,
  operator workstation, and deployment secret source remain high-trust.
- <code>NOT VALID</code> protects future inbound rows but is not a statement
  that pre-Phase-2c events are already registry-backed.
- Offline and synthetic Docker tests do not prove Telegram compatibility,
  public TLS security, secret rotation, or production reliability.

## Exact next verification

1. Freeze the Phase 2c candidate, run its relevant local gates and the
   two-connection Compose smoke test, then obtain an independent final review.
2. Push the exact checked candidate and read GitHub CI and CodeQL for that
   exact commit before making a Phase 2c release claim.
3. Only with owner authorization, use a test Bot and public TLS URL to verify
   one real Telegram flow without printing a token, header, payload, or
   persisted message.
4. Before operating real data, design and test backup/restore, retention and
   deletion, password and token rotation, access controls, rate limits,
   monitoring, and an encryption-at-rest decision.
