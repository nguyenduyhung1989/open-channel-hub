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
