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

const MIGRATIONS = Object.freeze([
  Object.freeze({
    id: INBOUND_EVENT_LEDGER_ID,
    checksum: checksumFor(INBOUND_EVENT_LEDGER_ID, INBOUND_EVENT_LEDGER_STATEMENTS),
    statements: INBOUND_EVENT_LEDGER_STATEMENTS
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
