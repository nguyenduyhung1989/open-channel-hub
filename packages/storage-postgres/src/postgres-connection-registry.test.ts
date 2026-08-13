import type { ConnectionRegistration } from '@open-channel-hub/contracts';
import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresConnectionRegistry } from './postgres-connection-registry.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

const REGISTRATION_A: ConnectionRegistration = Object.freeze({
  id: 'telegram-bot-support-a',
  connectorId: 'telegram-bot',
  channel: 'telegram_bot',
  tier: 'OFFICIAL'
});

const REGISTRATION_B: ConnectionRegistration = Object.freeze({
  id: 'telegram-bot-support-b',
  connectorId: 'telegram-bot',
  channel: 'telegram_bot',
  tier: 'OFFICIAL'
});

describe('PostgresConnectionRegistry', () => {
  it('registers matching metadata idempotently through parameterized transactions', async () => {
    const pool = createRegistryPool();
    const registry = new PostgresConnectionRegistry(pool);

    await registry.ensureRegistered([REGISTRATION_A, REGISTRATION_B]);
    await registry.ensureRegistered([REGISTRATION_A]);

    expect(pool.records).toEqual([REGISTRATION_A, REGISTRATION_B]);
    expect(pool.client.queries.map((query) => query.sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      'COMMIT',
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      'COMMIT'
    ]);
    const insertQuery = pool.client.queries[2];
    expect(insertQuery).toMatchObject({
      values: ['telegram-bot-support-a', 'telegram-bot', 'telegram_bot', 'OFFICIAL']
    });
    expect(insertQuery?.sql).toContain('$1');
    expect(insertQuery?.sql).toContain('$4');
    expect(insertQuery?.sql).not.toContain('telegram-bot-support-a');
    expect(pool.client.released).toBe(true);
  });

  it('rolls back every registration when an existing connection id has mismatched metadata', async () => {
    const pool = createRegistryPool([REGISTRATION_A]);
    const registry = new PostgresConnectionRegistry(pool);
    const newRegistration = Object.freeze({
      ...REGISTRATION_B,
      id: 'alpha-new-connection'
    });
    const mismatch = Object.freeze({
      ...REGISTRATION_A,
      tier: 'EXPERIMENTAL' as const
    });

    await expect(registry.ensureRegistered([newRegistration, mismatch])).rejects.toBeInstanceOf(
      PostgresStorageError
    );

    expect(pool.records).toEqual([REGISTRATION_A]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(pool.client.released).toBe(true);
  });

  it('treats an empty registration list as a safe no-op', async () => {
    const pool = createRegistryPool();

    await expect(
      new PostgresConnectionRegistry(pool).ensureRegistered([])
    ).resolves.toBeUndefined();
    expect(pool.client.queries).toEqual([]);
  });

  it('rejects malformed, duplicate, and oversized input before opening a transaction', async () => {
    const invalidInputs: readonly unknown[] = [
      undefined,
      [Object.freeze({ ...REGISTRATION_A, id: 'invalid id' })],
      [Object.freeze({ ...REGISTRATION_A, channel: 'not-a-channel' })],
      [Object.freeze({ ...REGISTRATION_A, tier: 'NOT_A_TIER' })],
      [REGISTRATION_A, Object.freeze({ ...REGISTRATION_A })],
      Array.from({ length: 101 }, (_, index) =>
        Object.freeze({ ...REGISTRATION_A, id: `telegram-bot-${index}` })
      )
    ];

    for (const input of invalidInputs) {
      const pool = createRegistryPool();
      const registry = new PostgresConnectionRegistry(pool);

      await expect(
        registry.ensureRegistered(input as readonly ConnectionRegistration[])
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.client.queries).toEqual([]);
    }
  });

  it('keeps historical dot-segment identifiers registerable for legacy one-Bot deployments', async () => {
    const pool = createRegistryPool();
    const registry = new PostgresConnectionRegistry(pool);
    const legacyRegistrations = [
      Object.freeze({ ...REGISTRATION_A, id: '.' }),
      Object.freeze({ ...REGISTRATION_B, id: '..' })
    ];

    await expect(registry.ensureRegistered(legacyRegistrations)).resolves.toBeUndefined();
    expect(pool.records).toEqual(legacyRegistrations);
  });

  it('converts query failures into one storage error and releases the client', async () => {
    const pool = createRegistryPool({ failOnInsert: true });

    await expect(
      new PostgresConnectionRegistry(pool).ensureRegistered([REGISTRATION_A])
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });
    expect(pool.client.queries.map((query) => query.sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      'ROLLBACK'
    ]);
    expect(pool.client.released).toBe(true);
  });
});

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeSqlClient extends SqlClient {
  readonly queries: RecordedQuery[];
  released: boolean;
}

interface RegistryPool extends SqlPool {
  readonly client: FakeSqlClient;
  readonly records: readonly ConnectionRegistration[];
}

interface RegistryPoolOptions {
  readonly failOnInsert?: boolean;
}

const createRegistryPool = (
  initialRecordsOrOptions: readonly ConnectionRegistration[] | RegistryPoolOptions = [],
  maybeOptions: RegistryPoolOptions = {}
): RegistryPool => {
  const initialRecords = isRegistrationArray(initialRecordsOrOptions)
    ? initialRecordsOrOptions
    : [];
  const options: RegistryPoolOptions = isRegistrationArray(initialRecordsOrOptions)
    ? maybeOptions
    : initialRecordsOrOptions;
  let records = new Map(initialRecords.map((record) => [record.id, record]));
  let transactionRecords: Map<string, ConnectionRegistration> | undefined;

  const queries: RecordedQuery[] = [];
  const client: FakeSqlClient = {
    queries,
    released: false,
    async query(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> {
      queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (sql === 'BEGIN') {
        transactionRecords = new Map(records);
        return Object.freeze({ rows: [] });
      }

      if (sql === 'COMMIT') {
        if (transactionRecords === undefined) {
          throw new Error('Synthetic test transaction was not started.');
        }

        records = transactionRecords;
        transactionRecords = undefined;
        return Object.freeze({ rows: [] });
      }

      if (sql === 'ROLLBACK') {
        transactionRecords = undefined;
        return Object.freeze({ rows: [] });
      }

      if (sql.includes('INSERT INTO open_channel_hub.connection_registry')) {
        if (options.failOnInsert === true) {
          throw new Error('Synthetic PostgreSQL detail that must not leave the storage adapter.');
        }

        const [id, connectorId, channel, tier] = values;
        if (
          transactionRecords === undefined ||
          typeof id !== 'string' ||
          typeof connectorId !== 'string' ||
          typeof channel !== 'string' ||
          typeof tier !== 'string'
        ) {
          throw new Error('Synthetic registry query has invalid values.');
        }

        const existing = transactionRecords.get(id);
        if (existing !== undefined) {
          if (
            existing.connectorId !== connectorId ||
            existing.channel !== channel ||
            existing.tier !== tier
          ) {
            return Object.freeze({ rows: [] });
          }

          return Object.freeze({ rows: [toRow(existing)] });
        }

        const record: ConnectionRegistration = Object.freeze({
          id,
          connectorId,
          channel: channel as ConnectionRegistration['channel'],
          tier: tier as ConnectionRegistration['tier']
        });
        transactionRecords.set(id, record);

        return Object.freeze({ rows: [toRow(record)] });
      }

      return Object.freeze({ rows: [] });
    },
    release: () => {
      client.released = true;
    }
  };

  return Object.freeze({
    client,
    get records(): readonly ConnectionRegistration[] {
      return Object.freeze([...records.values()]);
    },
    connect: async (): Promise<SqlClient> => client,
    query: async (): Promise<SqlQueryResult> => Object.freeze({ rows: [] })
  });
};

const isRegistrationArray = (
  value: readonly ConnectionRegistration[] | RegistryPoolOptions
): value is readonly ConnectionRegistration[] => Array.isArray(value);

const toRow = (registration: ConnectionRegistration): Readonly<Record<string, unknown>> =>
  Object.freeze({
    connection_id: registration.id,
    connector_id: registration.connectorId,
    channel: registration.channel,
    tier: registration.tier
  });
