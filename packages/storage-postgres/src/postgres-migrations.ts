import { createHash } from 'node:crypto';

import { PostgresStorageError } from './postgres-error.js';
import type { SqlClient, SqlPool } from './sql.js';

export const POSTGRES_SCHEMA = 'open_channel_hub' as const;

const MIGRATION_LOCK_KEY = 1_864_659_701;

const CREATE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS ${POSTGRES_SCHEMA} AUTHORIZATION ${POSTGRES_SCHEMA}
`;

const CREATE_SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS ${POSTGRES_SCHEMA}.schema_migrations (
  migration_id text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

const INBOUND_EVENT_LEDGER_ID = '0001_inbound_event_ledger';

const INBOUND_EVENT_LEDGER_STATEMENTS = Object.freeze([
  `
CREATE TABLE ${POSTGRES_SCHEMA}.inbound_events (
  connection_id text NOT NULL,
  provider_event_id text NOT NULL,
  canonical_event_id text NOT NULL,
  channel text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  conversation_id text NOT NULL,
  message_id text NOT NULL,
  sender_id text NOT NULL,
  message_text text NOT NULL,
  PRIMARY KEY (connection_id, provider_event_id)
)
`
]);

/**
 * This migration is forward-only. Existing Phase 2a rows receive identity
 * values once; their historical ordering was never exposed, while all future
 * writes receive a stable ledger position used for keyset pagination.
 */
const INBOUND_EVENT_LEDGER_SEQUENCE_ID = '0002_inbound_event_ledger_sequence';

const INBOUND_EVENT_LEDGER_SEQUENCE_STATEMENTS = Object.freeze([
  `
ALTER TABLE ${POSTGRES_SCHEMA}.inbound_events
  ADD COLUMN ledger_id bigint GENERATED ALWAYS AS IDENTITY
`,
  `
UPDATE ${POSTGRES_SCHEMA}.inbound_events
SET ledger_id = DEFAULT
WHERE ledger_id IS NULL
`,
  `
ALTER TABLE ${POSTGRES_SCHEMA}.inbound_events
  ALTER COLUMN ledger_id SET NOT NULL
`,
  `
CREATE UNIQUE INDEX inbound_events_ledger_id_unique
  ON ${POSTGRES_SCHEMA}.inbound_events (ledger_id)
`,
  `
CREATE INDEX inbound_events_connection_ledger_id_desc
  ON ${POSTGRES_SCHEMA}.inbound_events (connection_id, ledger_id DESC)
`
]);

/**
 * Runtime connection metadata is deliberately distinct from event content and
 * credentials. The static checks keep the durable registry aligned with the
 * public connector vocabulary without storing any provider account data.
 */
const CONNECTION_REGISTRY_ID = '0003_connection_registry';

const CONNECTION_REGISTRY_STATEMENTS = Object.freeze([
  `
CREATE TABLE ${POSTGRES_SCHEMA}.connection_registry (
  connection_id text PRIMARY KEY,
  connector_id text NOT NULL,
  channel text NOT NULL,
  tier text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT connection_registry_connection_id_format CHECK (
    connection_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  CONSTRAINT connection_registry_connector_id_format CHECK (
    connector_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  CONSTRAINT connection_registry_channel_known CHECK (
    channel IN (
      'telegram_bot',
      'zalo_oa',
      'facebook_page',
      'whatsapp_business',
      'telegram_user',
      'zalo_user',
      'whatsapp_user',
      'facebook_user'
    )
  ),
  CONSTRAINT connection_registry_tier_known CHECK (
    tier IN ('OFFICIAL', 'OFFICIAL_CLIENT', 'EXPERIMENTAL')
  )
)
`
]);

/**
 * Existing Phase 2a installations can contain events that predate the
 * registry. PostgreSQL enforces this foreign key for all future writes while a
 * later explicit validation migration can verify any historical backfill.
 */
const INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_ID =
  '0004_inbound_events_connection_registry_fk';

const INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_STATEMENTS = Object.freeze([
  `
ALTER TABLE ${POSTGRES_SCHEMA}.inbound_events
  ADD CONSTRAINT inbound_events_connection_registry_fk
  FOREIGN KEY (connection_id)
  REFERENCES ${POSTGRES_SCHEMA}.connection_registry (connection_id)
  NOT VALID
`
]);

/**
 * A Zalo OA registration binds its opaque connection id to a non-secret
 * fingerprint of the provider App/OA pair. Historical Phase 2 rows have no
 * Zalo OA registration, so this additive constraint does not alter them.
 */
const CONNECTION_REGISTRY_PROVIDER_IDENTITY_ID = '0005_connection_registry_provider_identity';

const CONNECTION_REGISTRY_PROVIDER_IDENTITY_STATEMENTS = Object.freeze([
  `
ALTER TABLE ${POSTGRES_SCHEMA}.connection_registry
  ADD COLUMN provider_identity_fingerprint text
`,
  `
ALTER TABLE ${POSTGRES_SCHEMA}.connection_registry
  ADD CONSTRAINT connection_registry_provider_identity_fingerprint_format CHECK (
    provider_identity_fingerprint IS NULL
    OR provider_identity_fingerprint ~ '^[a-f0-9]{64}$'
  )
`,
  `
ALTER TABLE ${POSTGRES_SCHEMA}.connection_registry
  ADD CONSTRAINT connection_registry_zalo_oa_provider_identity_required CHECK (
    channel <> 'zalo_oa' OR provider_identity_fingerprint IS NOT NULL
  )
  `
]);

/**
 * Facebook Page registrations bind an opaque connection id to a non-secret
 * fingerprint of the Meta App/Page pair. This is a separate immutable
 * migration because migration 0005 has already been applied by Phase 3a
 * installations and its checksum must never change.
 */
const CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_ID =
  '0006_connection_registry_facebook_page_provider_identity';

const CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_STATEMENTS = Object.freeze([
  `
ALTER TABLE ${POSTGRES_SCHEMA}.connection_registry
  ADD CONSTRAINT connection_registry_facebook_page_provider_identity_required CHECK (
    channel <> 'facebook_page' OR provider_identity_fingerprint IS NOT NULL
  )
`
]);

/**
 * WhatsApp Business registrations bind an opaque connection id to a
 * non-secret fingerprint of the Meta App, WABA, and business phone number.
 * This is additive because the preceding migrations are immutable once
 * applied to an installation.
 */
const CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_ID =
  '0007_connection_registry_whatsapp_business_provider_identity';

const CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_STATEMENTS = Object.freeze([
  `
ALTER TABLE ${POSTGRES_SCHEMA}.connection_registry
  ADD CONSTRAINT connection_registry_whatsapp_business_provider_identity_required CHECK (
    channel <> 'whatsapp_business' OR provider_identity_fingerprint IS NOT NULL
  )
`
]);

/**
 * Dashboard sessions retain only HMACs of random browser tokens. The strict
 * time constraints make malformed or impossible state fail inside PostgreSQL
 * even if a future writer bypasses this adapter.
 */
const DASHBOARD_SESSIONS_ID = '0008_dashboard_sessions';

const DASHBOARD_SESSIONS_STATEMENTS = Object.freeze([
  `
CREATE TABLE ${POSTGRES_SCHEMA}.dashboard_sessions (
  session_id text PRIMARY KEY,
  principal_id text NOT NULL,
  session_token_hmac text NOT NULL UNIQUE,
  csrf_token_hmac text NOT NULL,
  issued_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT dashboard_sessions_session_id_format CHECK (
    session_id ~ '^[A-Za-z0-9._:-]{1,128}$'
    AND session_id NOT IN ('.', '..')
  ),
  CONSTRAINT dashboard_sessions_principal_id_format CHECK (
    principal_id ~ '^[A-Za-z0-9._:-]{1,128}$'
    AND principal_id NOT IN ('.', '..')
  ),
  CONSTRAINT dashboard_sessions_session_token_hmac_format CHECK (
    session_token_hmac ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT dashboard_sessions_csrf_token_hmac_format CHECK (
    csrf_token_hmac ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT dashboard_sessions_distinct_token_hmacs CHECK (
    session_token_hmac <> csrf_token_hmac
  ),
  CONSTRAINT dashboard_sessions_time_order CHECK (
    issued_at <= last_seen_at
    AND last_seen_at < idle_expires_at
    AND idle_expires_at <= absolute_expires_at
  ),
  CONSTRAINT dashboard_sessions_revocation_order CHECK (
    revoked_at IS NULL OR revoked_at >= issued_at
  )
)
`,
  `
CREATE INDEX dashboard_sessions_active_expiry
  ON ${POSTGRES_SCHEMA}.dashboard_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL
`
]);

/**
 * Reply commands retain their immutable source event and the reply target
 * derived from that event's canonical conversation. No caller can choose or
 * inspect the stored target. This first durable-outbound slice records only a
 * queued intent; provider dispatch, receipts, and state transitions require a
 * later migration with their own safety policy.
 */
const OUTBOUND_REPLY_COMMANDS_ID = '0009_outbound_reply_commands';

const OUTBOUND_REPLY_COMMANDS_STATEMENTS = Object.freeze([
  `
CREATE TABLE ${POSTGRES_SCHEMA}.outbound_commands (
  command_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id text NOT NULL,
  source_provider_event_id text NOT NULL,
  client_operation_id text NOT NULL,
  reply_target_id text NOT NULL,
  source_message_id text NOT NULL,
  source_channel text NOT NULL,
  message_text text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT outbound_commands_connection_id_format CHECK (
    connection_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  CONSTRAINT outbound_commands_source_provider_event_id_format CHECK (
    char_length(source_provider_event_id) BETWEEN 1 AND 512
    AND source_provider_event_id ~ '^[!-~]+$'
  ),
  CONSTRAINT outbound_commands_client_operation_id_format CHECK (
    client_operation_id ~ '^[A-Za-z0-9._:-]{1,128}$'
    AND client_operation_id NOT IN ('.', '..')
  ),
  CONSTRAINT outbound_commands_reply_target_id_format CHECK (
    char_length(reply_target_id) BETWEEN 1 AND 512
    AND reply_target_id ~ '^[!-~]+$'
  ),
  CONSTRAINT outbound_commands_source_message_id_format CHECK (
    char_length(source_message_id) BETWEEN 1 AND 512
    AND source_message_id ~ '^[!-~]+$'
  ),
  CONSTRAINT outbound_commands_source_channel_known CHECK (
    source_channel IN (
      'telegram_bot',
      'zalo_oa',
      'facebook_page',
      'whatsapp_business',
      'telegram_user',
      'zalo_user',
      'whatsapp_user',
      'facebook_user'
    )
  ),
  CONSTRAINT outbound_commands_message_text_valid CHECK (
    char_length(message_text) BETWEEN 1 AND 4096
    AND message_text !~ '^[[:space:]]*$'
  ),
  CONSTRAINT outbound_commands_state_queued CHECK (
    state = 'queued'
  ),
  CONSTRAINT outbound_commands_source_event_fk FOREIGN KEY (
    connection_id,
    source_provider_event_id
  ) REFERENCES ${POSTGRES_SCHEMA}.inbound_events (
    connection_id,
    provider_event_id
  ),
  CONSTRAINT outbound_commands_connection_client_operation_unique UNIQUE (
    connection_id,
    client_operation_id
  )
)
`,
  `
CREATE FUNCTION ${POSTGRES_SCHEMA}.reject_outbound_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Outbound commands are immutable.';
END;
$$
`,
  `
CREATE TRIGGER outbound_commands_immutable
BEFORE UPDATE OR DELETE ON ${POSTGRES_SCHEMA}.outbound_commands
FOR EACH ROW
EXECUTE FUNCTION ${POSTGRES_SCHEMA}.reject_outbound_command_mutation()
`
]);

const MIGRATIONS = Object.freeze([
  Object.freeze({
    id: INBOUND_EVENT_LEDGER_ID,
    checksum: checksumFor(INBOUND_EVENT_LEDGER_ID, INBOUND_EVENT_LEDGER_STATEMENTS),
    statements: INBOUND_EVENT_LEDGER_STATEMENTS
  }),
  Object.freeze({
    id: INBOUND_EVENT_LEDGER_SEQUENCE_ID,
    checksum: checksumFor(
      INBOUND_EVENT_LEDGER_SEQUENCE_ID,
      INBOUND_EVENT_LEDGER_SEQUENCE_STATEMENTS
    ),
    statements: INBOUND_EVENT_LEDGER_SEQUENCE_STATEMENTS
  }),
  Object.freeze({
    id: CONNECTION_REGISTRY_ID,
    checksum: checksumFor(CONNECTION_REGISTRY_ID, CONNECTION_REGISTRY_STATEMENTS),
    statements: CONNECTION_REGISTRY_STATEMENTS
  }),
  Object.freeze({
    id: INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_ID,
    checksum: checksumFor(
      INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_ID,
      INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_STATEMENTS
    ),
    statements: INBOUND_EVENTS_CONNECTION_REGISTRY_FOREIGN_KEY_STATEMENTS
  }),
  Object.freeze({
    id: CONNECTION_REGISTRY_PROVIDER_IDENTITY_ID,
    checksum: checksumFor(
      CONNECTION_REGISTRY_PROVIDER_IDENTITY_ID,
      CONNECTION_REGISTRY_PROVIDER_IDENTITY_STATEMENTS
    ),
    statements: CONNECTION_REGISTRY_PROVIDER_IDENTITY_STATEMENTS
  }),
  Object.freeze({
    id: CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_ID,
    checksum: checksumFor(
      CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_ID,
      CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_STATEMENTS
    ),
    statements: CONNECTION_REGISTRY_FACEBOOK_PAGE_PROVIDER_IDENTITY_STATEMENTS
  }),
  Object.freeze({
    id: CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_ID,
    checksum: checksumFor(
      CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_ID,
      CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_STATEMENTS
    ),
    statements: CONNECTION_REGISTRY_WHATSAPP_BUSINESS_PROVIDER_IDENTITY_STATEMENTS
  }),
  Object.freeze({
    id: DASHBOARD_SESSIONS_ID,
    checksum: checksumFor(DASHBOARD_SESSIONS_ID, DASHBOARD_SESSIONS_STATEMENTS),
    statements: DASHBOARD_SESSIONS_STATEMENTS
  }),
  Object.freeze({
    id: OUTBOUND_REPLY_COMMANDS_ID,
    checksum: checksumFor(OUTBOUND_REPLY_COMMANDS_ID, OUTBOUND_REPLY_COMMANDS_STATEMENTS),
    statements: OUTBOUND_REPLY_COMMANDS_STATEMENTS
  })
]);

/**
 * Applies immutable, schema-qualified DDL under a transaction-scoped advisory
 * lock. A second migrator waits instead of racing the migration ledger.
 */
export const migratePostgresSchema = async (pool: SqlPool): Promise<void> => {
  let client: SqlClient | undefined;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(CREATE_SCHEMA_SQL);
    await client.query(CREATE_SCHEMA_MIGRATIONS_SQL);

    for (const migration of MIGRATIONS) {
      const result = await client.query(
        `SELECT migration_id, checksum FROM ${POSTGRES_SCHEMA}.schema_migrations WHERE migration_id = $1`,
        [migration.id]
      );

      if (result.rows.length > 0) {
        if (!hasMatchingChecksum(result.rows, migration.checksum)) {
          throw new PostgresStorageError();
        }

        continue;
      }

      for (const statement of migration.statements) {
        await client.query(statement);
      }

      await client.query(
        `INSERT INTO ${POSTGRES_SCHEMA}.schema_migrations (migration_id, checksum) VALUES ($1, $2)`,
        [migration.id, migration.checksum]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
  } catch {
    if (client !== undefined && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original failure is the only safe error this boundary exposes.
      }
    }

    throw new PostgresStorageError();
  } finally {
    client?.release();
  }
};

/** Verifies that every migration known to this binary is applied before serving traffic. */
export const assertPostgresSchemaCurrent = async (pool: SqlPool): Promise<void> => {
  try {
    for (const migration of MIGRATIONS) {
      const result = await pool.query(
        `SELECT migration_id, checksum FROM ${POSTGRES_SCHEMA}.schema_migrations WHERE migration_id = $1`,
        [migration.id]
      );

      if (!hasMatchingChecksum(result.rows, migration.checksum)) {
        throw new PostgresStorageError();
      }
    }
  } catch (error) {
    if (error instanceof PostgresStorageError) {
      throw error;
    }

    throw new PostgresStorageError();
  }
};

function checksumFor(id: string, statements: readonly string[]): string {
  return createHash('sha256')
    .update(id)
    .update('\u0000')
    .update(statements.join('\u0000'))
    .digest('hex');
}

const hasMatchingChecksum = (
  rows: readonly Readonly<Record<string, unknown>>[],
  expectedChecksum: string
): boolean => rows.length === 1 && rows[0]?.checksum === expectedChecksum;
