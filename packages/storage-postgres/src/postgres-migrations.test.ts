import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { assertPostgresSchemaCurrent, migratePostgresSchema } from './postgres-migrations.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

describe('PostgreSQL migrations', () => {
  it('creates the isolated schema and records the immutable inbound-event migration', async () => {
    const pool = createMigrationPool();

    await migratePostgresSchema(pool);

    const sql = pool.queries.map((query) => query.sql).join('\n');

    expect(sql).toContain('SELECT pg_advisory_xact_lock($1)');
    expect(sql).toContain(
      'CREATE SCHEMA IF NOT EXISTS open_channel_hub AUTHORIZATION open_channel_hub'
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS open_channel_hub.schema_migrations');
    expect(sql).toContain('CREATE TABLE open_channel_hub.inbound_events');
    expect(sql).toContain('PRIMARY KEY (connection_id, provider_event_id)');
    expect(sql).toContain('ADD COLUMN ledger_id bigint GENERATED ALWAYS AS IDENTITY');
    expect(sql).toContain('SET ledger_id = DEFAULT');
    expect(sql).toContain('ALTER COLUMN ledger_id SET NOT NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX inbound_events_ledger_id_unique');
    expect(sql).toContain('CREATE INDEX inbound_events_connection_ledger_id_desc');
    expect(sql).toContain('CREATE TABLE open_channel_hub.connection_registry');
    expect(sql).toContain("connection_id ~ '^[A-Za-z0-9._:-]{1,128}$'");
    expect(sql).toContain("connector_id ~ '^[A-Za-z0-9._:-]{1,128}$'");
    expect(sql).toContain("'telegram_bot'");
    expect(sql).toContain("'EXPERIMENTAL'");
    expect(sql).toContain('ADD CONSTRAINT inbound_events_connection_registry_fk');
    expect(sql).toContain('REFERENCES open_channel_hub.connection_registry (connection_id)');
    expect(sql).toContain('NOT VALID');
    expect(sql).toContain('ADD COLUMN provider_identity_fingerprint text');
    expect(sql).toContain("provider_identity_fingerprint ~ '^[a-f0-9]{64}$'");
    expect(sql).toContain("channel <> 'zalo_oa' OR provider_identity_fingerprint IS NOT NULL");
    expect(sql).toContain(
      "channel <> 'facebook_page' OR provider_identity_fingerprint IS NOT NULL"
    );
    expect(sql).toContain('INSERT INTO open_channel_hub.schema_migrations');
    expect(sql).not.toContain('public.');
    expect(
      pool.queries
        .filter((query) => query.sql.includes('INSERT INTO open_channel_hub.schema_migrations'))
        .map((query) => query.values[0])
    ).toEqual([
      '0001_inbound_event_ledger',
      '0002_inbound_event_ledger_sequence',
      '0003_connection_registry',
      '0004_inbound_events_connection_registry_fk',
      '0005_connection_registry_provider_identity',
      '0006_connection_registry_facebook_page_provider_identity'
    ]);
    expect(pool.releaseCount).toBe(1);
  });

  it('does not replay an applied migration when the migrator runs again', async () => {
    const pool = createMigrationPool();

    await migratePostgresSchema(pool);
    const firstRunQueryCount = pool.queries.length;

    await migratePostgresSchema(pool);

    const secondRunSql = pool.queries
      .slice(firstRunQueryCount)
      .map((query) => query.sql)
      .join('\n');

    expect(secondRunSql).not.toContain('CREATE TABLE open_channel_hub.inbound_events');
    expect(secondRunSql).not.toContain('ADD COLUMN ledger_id bigint GENERATED ALWAYS AS IDENTITY');
    expect(secondRunSql).not.toContain('CREATE TABLE open_channel_hub.connection_registry');
    expect(secondRunSql).not.toContain('ADD CONSTRAINT inbound_events_connection_registry_fk');
    expect(secondRunSql).not.toContain('ADD COLUMN provider_identity_fingerprint text');
    expect(secondRunSql).not.toContain(
      'ADD CONSTRAINT connection_registry_facebook_page_provider_identity_required'
    );
    expect(secondRunSql).not.toContain('INSERT INTO open_channel_hub.schema_migrations');
    expect(pool.releaseCount).toBe(2);
  });

  it('refuses an applied migration whose source checksum no longer matches', async () => {
    const pool = createMigrationPool({ mismatchedChecksum: true });

    await migratePostgresSchema(pool);
    await expect(migratePostgresSchema(pool)).rejects.toBeInstanceOf(PostgresStorageError);

    expect(pool.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('rolls back and hides provider details when a migration query fails', async () => {
    const pool = createMigrationPool({
      failOnQuery: 'CREATE TABLE open_channel_hub.inbound_events'
    });

    await expect(migratePostgresSchema(pool)).rejects.toBeInstanceOf(PostgresStorageError);

    expect(pool.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(pool.releaseCount).toBe(1);
  });

  it('refuses readiness until every known migration is recorded', async () => {
    const pool = createMigrationPool();

    await expect(assertPostgresSchemaCurrent(pool)).rejects.toBeInstanceOf(PostgresStorageError);

    await migratePostgresSchema(pool);
    await expect(assertPostgresSchemaCurrent(pool)).resolves.toBeUndefined();
  });
});

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface MigrationPool extends SqlPool {
  readonly queries: readonly RecordedQuery[];
  readonly releaseCount: number;
}

const createMigrationPool = (
  options: Readonly<{ failOnQuery?: string; mismatchedChecksum?: boolean }> = {}
): MigrationPool => {
  const appliedMigrations = new Map<string, string>();
  const queries: RecordedQuery[] = [];
  let releaseCount = 0;

  const query = async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
    queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

    if (options.failOnQuery !== undefined && sql.includes(options.failOnQuery)) {
      throw new Error('Synthetic PostgreSQL detail that must not leave the storage adapter.');
    }

    if (sql.includes('FROM open_channel_hub.schema_migrations')) {
      const migrationId = values[0];
      const rows =
        typeof migrationId === 'string' && appliedMigrations.has(migrationId)
          ? [
              Object.freeze({
                migration_id: migrationId,
                checksum: options.mismatchedChecksum
                  ? 'changed-source-checksum'
                  : appliedMigrations.get(migrationId)
              })
            ]
          : [];

      return Object.freeze({ rows });
    }

    if (sql.includes('INSERT INTO open_channel_hub.schema_migrations')) {
      const migrationId = values[0];
      const checksum = values[1];

      if (typeof migrationId === 'string' && typeof checksum === 'string') {
        appliedMigrations.set(migrationId, checksum);
      }
    }

    return Object.freeze({ rows: [] });
  };

  const client: SqlClient = Object.freeze({
    query,
    release: () => {
      releaseCount += 1;
    }
  });

  return Object.freeze({
    get queries(): readonly RecordedQuery[] {
      return queries;
    },
    get releaseCount(): number {
      return releaseCount;
    },
    connect: async (): Promise<SqlClient> => client,
    query
  });
};
