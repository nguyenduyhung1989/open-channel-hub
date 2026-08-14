import type { ConnectionRegistration } from '@open-channel-hub/contracts';
import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresConnectionRegistry } from './postgres-connection-registry.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

const REGISTRATION_A: ConnectionRegistration = Object.freeze({
  id: 'telegram-bot-support-a',
  connectorId: 'telegram-bot',
  channel: 'telegram_bot',
  providerIdentityFingerprint: '1111111111111111111111111111111111111111111111111111111111111111',
  tier: 'OFFICIAL'
});

const REGISTRATION_B: ConnectionRegistration = Object.freeze({
  id: 'telegram-bot-support-b',
  connectorId: 'telegram-bot',
  channel: 'telegram_bot',
  providerIdentityFingerprint: '2222222222222222222222222222222222222222222222222222222222222222',
  tier: 'OFFICIAL'
});

const ZALO_OA_REGISTRATION: ConnectionRegistration = Object.freeze({
  channel: 'zalo_oa',
  connectorId: 'zalo-oa',
  id: 'zalo-oa-support',
  providerIdentityFingerprint: '4e3cf2b346086a44fa154f4a6a33da25d514105622d5cacb1d1ddced7b440be9',
  tier: 'OFFICIAL'
});

const ZALO_USER_REGISTRATION: ConnectionRegistration = Object.freeze({
  channel: 'zalo_user',
  connectorId: 'zalo-user',
  id: 'zalo-user-support',
  providerIdentityFingerprint: '3d9c0bdb0a878c974c947a36fc38e51ad46dc6a7ba9b55bc854046218fcc83e1',
  tier: 'EXPERIMENTAL'
});

const FACEBOOK_PAGE_REGISTRATION: ConnectionRegistration = Object.freeze({
  channel: 'facebook_page',
  connectorId: 'facebook-page',
  id: 'facebook-page-support',
  providerIdentityFingerprint: '9be0cc63d8f9c7a1c892be4bb4a0f65b1f0ec4533a038f7eb2ca58f38f9b5c37',
  tier: 'OFFICIAL'
});

const WHATSAPP_BUSINESS_REGISTRATION: ConnectionRegistration = Object.freeze({
  channel: 'whatsapp_business',
  connectorId: 'whatsapp-business',
  id: 'whatsapp-business-support',
  providerIdentityFingerprint: 'f5f6d3c9e5c80d0441f83c42d6f8a8545e772156c3320b0f9fb4df9d4cb61c76',
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
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      'COMMIT',
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.connection_registry'),
      'COMMIT'
    ]);
    const insertQuery = pool.client.queries[3];
    expect(insertQuery).toMatchObject({
      values: [
        'telegram-bot-support-a',
        'telegram-bot',
        'telegram_bot',
        '1111111111111111111111111111111111111111111111111111111111111111',
        'OFFICIAL'
      ]
    });
    expect(insertQuery?.sql).toContain('$1');
    expect(insertQuery?.sql).toContain('$5');
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

  it('rejects rebinding a Zalo OA connection id to a different opaque provider identity', async () => {
    const pool = createRegistryPool([ZALO_OA_REGISTRATION]);
    const registry = new PostgresConnectionRegistry(pool);
    const rebound = Object.freeze({
      ...ZALO_OA_REGISTRATION,
      providerIdentityFingerprint:
        '6fb4d468bae3102075d0ad82e4b6b7e115b2332a4ff8d0d0c826d90d2a5b55f0'
    });

    await expect(registry.ensureRegistered([rebound])).rejects.toBeInstanceOf(PostgresStorageError);
    expect(pool.records).toEqual([ZALO_OA_REGISTRATION]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('rejects first binding a Zalo OA id that has pre-registry inbound history', async () => {
    const pool = createRegistryPool({ historicalConnectionIds: [ZALO_OA_REGISTRATION.id] });
    const registry = new PostgresConnectionRegistry(pool);

    await expect(registry.ensureRegistered([ZALO_OA_REGISTRATION])).rejects.toBeInstanceOf(
      PostgresStorageError
    );
    expect(pool.records).toEqual([]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('requires, preserves, and protects an opaque Zalo User provider identity', async () => {
    const invalid = Object.freeze({
      channel: 'zalo_user' as const,
      connectorId: 'zalo-user',
      id: 'zalo-user-without-identity',
      tier: 'EXPERIMENTAL' as const
    } satisfies ConnectionRegistration);
    const rebound = Object.freeze({
      ...ZALO_USER_REGISTRATION,
      providerIdentityFingerprint:
        '6fb4d468bae3102075d0ad82e4b6b7e115b2332a4ff8d0d0c826d90d2a5b55f0'
    });

    await expect(
      new PostgresConnectionRegistry(createRegistryPool()).ensureRegistered([invalid])
    ).rejects.toBeInstanceOf(PostgresStorageError);
    await expect(
      new PostgresConnectionRegistry(createRegistryPool([ZALO_USER_REGISTRATION])).ensureRegistered(
        [rebound]
      )
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });

  it('rejects first binding a Zalo User id that has pre-registry inbound history', async () => {
    const pool = createRegistryPool({ historicalConnectionIds: [ZALO_USER_REGISTRATION.id] });

    await expect(
      new PostgresConnectionRegistry(pool).ensureRegistered([ZALO_USER_REGISTRATION])
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(pool.records).toEqual([]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('requires, preserves, and protects an opaque Telegram Bot provider identity', async () => {
    const invalid = Object.freeze({
      channel: 'telegram_bot' as const,
      connectorId: 'telegram-bot',
      id: 'telegram-bot-without-identity',
      tier: 'OFFICIAL' as const
    } satisfies ConnectionRegistration);
    const rebound = Object.freeze({
      ...REGISTRATION_A,
      providerIdentityFingerprint:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });

    await expect(
      new PostgresConnectionRegistry(createRegistryPool()).ensureRegistered([invalid])
    ).rejects.toBeInstanceOf(PostgresStorageError);
    await expect(
      new PostgresConnectionRegistry(createRegistryPool([REGISTRATION_A])).ensureRegistered([
        rebound
      ])
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });

  it('rejects first binding a Telegram Bot id with historical events and permits a no-history registry upgrade', async () => {
    await expect(
      new PostgresConnectionRegistry(
        createRegistryPool({ historicalConnectionIds: [REGISTRATION_A.id] })
      ).ensureRegistered([REGISTRATION_A])
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const legacyWithoutIdentity = Object.freeze({
      channel: REGISTRATION_A.channel,
      connectorId: REGISTRATION_A.connectorId,
      id: REGISTRATION_A.id,
      tier: REGISTRATION_A.tier
    } satisfies ConnectionRegistration);
    const pool = createRegistryPool([legacyWithoutIdentity]);

    await expect(
      new PostgresConnectionRegistry(pool).ensureRegistered([REGISTRATION_A])
    ).resolves.toBeUndefined();
    expect(pool.records).toEqual([REGISTRATION_A]);
    expect(
      pool.client.queries.find((query) =>
        query.sql.includes('INSERT INTO open_channel_hub.connection_registry')
      )?.sql
    ).toContain('provider_identity_fingerprint = EXCLUDED.provider_identity_fingerprint');
  });

  it('requires an opaque provider identity fingerprint for a Facebook Page registration', async () => {
    const invalidRegistrations: readonly ConnectionRegistration[] = [
      Object.freeze({
        channel: FACEBOOK_PAGE_REGISTRATION.channel,
        connectorId: FACEBOOK_PAGE_REGISTRATION.connectorId,
        id: FACEBOOK_PAGE_REGISTRATION.id,
        tier: FACEBOOK_PAGE_REGISTRATION.tier
      } satisfies ConnectionRegistration),
      Object.freeze({
        ...FACEBOOK_PAGE_REGISTRATION,
        providerIdentityFingerprint: 'not-a-sha-256-fingerprint'
      })
    ];

    for (const registration of invalidRegistrations) {
      const pool = createRegistryPool();

      await expect(
        new PostgresConnectionRegistry(pool).ensureRegistered([registration])
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.client.queries).toEqual([]);
    }
  });

  it('rejects rebinding a Facebook Page connection id to a different opaque provider identity', async () => {
    const pool = createRegistryPool([FACEBOOK_PAGE_REGISTRATION]);
    const registry = new PostgresConnectionRegistry(pool);
    const rebound = Object.freeze({
      ...FACEBOOK_PAGE_REGISTRATION,
      providerIdentityFingerprint:
        '6fb4d468bae3102075d0ad82e4b6b7e115b2332a4ff8d0d0c826d90d2a5b55f0'
    });

    await expect(registry.ensureRegistered([rebound])).rejects.toBeInstanceOf(PostgresStorageError);
    expect(pool.records).toEqual([FACEBOOK_PAGE_REGISTRATION]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('rejects first binding a Facebook Page id that has pre-registry inbound history', async () => {
    const pool = createRegistryPool({
      historicalConnectionIds: [FACEBOOK_PAGE_REGISTRATION.id]
    });
    const registry = new PostgresConnectionRegistry(pool);

    await expect(registry.ensureRegistered([FACEBOOK_PAGE_REGISTRATION])).rejects.toBeInstanceOf(
      PostgresStorageError
    );
    expect(pool.records).toEqual([]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('requires an opaque provider identity fingerprint for a WhatsApp Business registration', async () => {
    const invalidRegistrations: readonly ConnectionRegistration[] = [
      Object.freeze({
        channel: WHATSAPP_BUSINESS_REGISTRATION.channel,
        connectorId: WHATSAPP_BUSINESS_REGISTRATION.connectorId,
        id: WHATSAPP_BUSINESS_REGISTRATION.id,
        tier: WHATSAPP_BUSINESS_REGISTRATION.tier
      } satisfies ConnectionRegistration),
      Object.freeze({
        ...WHATSAPP_BUSINESS_REGISTRATION,
        providerIdentityFingerprint: 'not-a-sha-256-fingerprint'
      })
    ];

    for (const registration of invalidRegistrations) {
      const pool = createRegistryPool();

      await expect(
        new PostgresConnectionRegistry(pool).ensureRegistered([registration])
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.client.queries).toEqual([]);
    }
  });

  it('rejects rebinding a WhatsApp Business connection id to a different opaque provider identity', async () => {
    const pool = createRegistryPool([WHATSAPP_BUSINESS_REGISTRATION]);
    const registry = new PostgresConnectionRegistry(pool);
    const rebound = Object.freeze({
      ...WHATSAPP_BUSINESS_REGISTRATION,
      providerIdentityFingerprint:
        '6fb4d468bae3102075d0ad82e4b6b7e115b2332a4ff8d0d0c826d90d2a5b55f0'
    });

    await expect(registry.ensureRegistered([rebound])).rejects.toBeInstanceOf(PostgresStorageError);
    expect(pool.records).toEqual([WHATSAPP_BUSINESS_REGISTRATION]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
  });

  it('rejects first binding a WhatsApp Business id that has pre-registry inbound history', async () => {
    const pool = createRegistryPool({
      historicalConnectionIds: [WHATSAPP_BUSINESS_REGISTRATION.id]
    });
    const registry = new PostgresConnectionRegistry(pool);

    await expect(
      registry.ensureRegistered([WHATSAPP_BUSINESS_REGISTRATION])
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(pool.records).toEqual([]);
    expect(pool.client.queries.map((query) => query.sql)).toContain('ROLLBACK');
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
  readonly historicalConnectionIds?: readonly string[];
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

        const [id, connectorId, channel, providerIdentityFingerprint, tier] = values;
        if (
          transactionRecords === undefined ||
          typeof id !== 'string' ||
          typeof connectorId !== 'string' ||
          typeof channel !== 'string' ||
          (providerIdentityFingerprint !== null &&
            typeof providerIdentityFingerprint !== 'string') ||
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

          const existingFingerprint = existing.providerIdentityFingerprint ?? null;
          const canAdoptNoHistoryIdentity =
            existingFingerprint === null &&
            typeof providerIdentityFingerprint === 'string' &&
            options.historicalConnectionIds?.includes(id) !== true &&
            sql.includes('provider_identity_fingerprint = EXCLUDED.provider_identity_fingerprint');

          if (existingFingerprint !== providerIdentityFingerprint && !canAdoptNoHistoryIdentity) {
            return Object.freeze({ rows: [] });
          }

          if (canAdoptNoHistoryIdentity) {
            const updated: ConnectionRegistration = Object.freeze({
              ...existing,
              providerIdentityFingerprint
            });
            transactionRecords.set(id, updated);

            return Object.freeze({ rows: [toRow(updated)] });
          }

          return Object.freeze({ rows: [toRow(existing)] });
        }

        if (
          providerIdentityFingerprint !== null &&
          options.historicalConnectionIds?.includes(id) === true
        ) {
          return Object.freeze({ rows: [] });
        }

        const record: ConnectionRegistration = Object.freeze({
          id,
          connectorId,
          channel: channel as ConnectionRegistration['channel'],
          tier: tier as ConnectionRegistration['tier'],
          ...(providerIdentityFingerprint === null ? {} : { providerIdentityFingerprint })
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
    provider_identity_fingerprint: registration.providerIdentityFingerprint ?? null,
    tier: registration.tier
  });
