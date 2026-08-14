import type { OutboundTelegramDeliveryAuthorizationCreateInput } from '@open-channel-hub/domain';
import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { createOutboundCommandScopeFingerprint } from './outbound-command-scope-fingerprint.js';
import { PostgresOutboundTelegramDeliveryAuthorizationStore } from './postgres-outbound-telegram-delivery-authorization-store.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_IDS = Object.freeze(['telegram-bot-sales', 'telegram-bot-support']);
const COMMAND_ID = '42';
const INBOX_ID = 'support-inbox';
const PRINCIPAL_A = 'support-approver-a';
const PRINCIPAL_B = 'support-approver-b';
const BOT_FINGERPRINT = '2d9cb6d8a36fb0a2b3c774d9ed50bbd7ebd6954d11c0f87f3282bb17480304f2';
const AUTHORIZED_AT = '2026-08-14T12:00:00.000Z';

describe('PostgresOutboundTelegramDeliveryAuthorizationStore', () => {
  it('records one scoped immutable Telegram authorization without target, text, or provider material', async () => {
    const pool = createPool({ insertEligible: true });
    const store = new PostgresOutboundTelegramDeliveryAuthorizationStore(pool);
    const input = createInput();

    await expect(store.create(input)).resolves.toEqual({
      authorization: {
        authorizedAt: AUTHORIZED_AT,
        commandId: COMMAND_ID,
        dashboardPrincipalId: PRINCIPAL_A,
        inboxId: INBOX_ID
      },
      kind: 'created'
    });

    const insert = pool.queries.find((query) =>
      query.sql.includes('INSERT INTO open_channel_hub.outbound_telegram_delivery_authorizations')
    );

    expect(insert).toMatchObject({
      values: [
        COMMAND_ID,
        CONNECTION_IDS,
        INBOX_ID,
        createOutboundCommandScopeFingerprint(CONNECTION_IDS),
        PRINCIPAL_A
      ]
    });
    expect(insert?.sql).toContain('outbound_command_authorizations AS command_authorization');
    expect(insert?.sql).toContain("source.telegram_chat_type = 'private'");
    expect(insert?.sql).toContain('outbound_telegram_command_eligibility AS telegram_eligibility');
    expect(insert?.sql).toContain('outbound_delivery_attempts AS delivery_attempt');
    expect(insert?.sql).toContain('connection_registry.provider_identity_fingerprint');
    expect(insert?.sql).not.toContain('reply_target_id');
    expect(insert?.sql).not.toContain('message_text');
    expect(insert?.sql).not.toContain('source_message_id');
    expect(insert?.sql).not.toContain('bot_token');
    expect(insert?.sql).not.toContain('sendMessage');
    expect(insert?.sql).not.toContain('fetch(');
    expect(insert?.sql).not.toContain('synthetic-private-target');
    expect(pool.queries.map((query) => query.sql)).toContain('COMMIT');
    expect(pool.lockKeys).toEqual([1_864_659_702, 1_864_659_704, 1_864_659_705]);
    expect(pool.clients.every((client) => client.released)).toBe(true);
  });

  it('replays only the same principal, inbox, scope, and current Bot binding', async () => {
    const existing = storedAuthorization({ authorizationEligibleNow: true });
    const pool = createPool({ existing, insertEligible: false });
    const store = new PostgresOutboundTelegramDeliveryAuthorizationStore(pool);

    await expect(store.create(createInput())).resolves.toEqual({
      authorization: {
        authorizedAt: AUTHORIZED_AT,
        commandId: COMMAND_ID,
        dashboardPrincipalId: PRINCIPAL_A,
        inboxId: INBOX_ID
      },
      kind: 'idempotent_replay'
    });
    await expect(store.create(createInput({ dashboardPrincipalId: PRINCIPAL_B }))).resolves.toEqual(
      { kind: 'authorization_conflict' }
    );
    await expect(store.create(createInput({ inboxId: 'sales-inbox' }))).resolves.toEqual({
      kind: 'command_unavailable'
    });
    await expect(
      store.create(
        createInput({
          allowedConnectionIds: Object.freeze(['telegram-bot-support'])
        })
      )
    ).resolves.toEqual({ kind: 'command_unavailable' });
  });

  it('conflates legacy, non-private, drifted, attempted, missing, and out-of-scope cases as unavailable', async () => {
    for (const authorizationEligibleNow of [false, false] as const) {
      const pool = createPool({
        existing: storedAuthorization({ authorizationEligibleNow }),
        insertEligible: false
      });

      await expect(
        new PostgresOutboundTelegramDeliveryAuthorizationStore(pool).create(createInput())
      ).resolves.toEqual({ kind: 'command_unavailable' });
    }

    const missingPool = createPool({ insertEligible: false });
    const outOfScopePool = createPool({ insertEligible: false });
    const store = new PostgresOutboundTelegramDeliveryAuthorizationStore(missingPool);

    await expect(store.create(createInput())).resolves.toEqual({ kind: 'command_unavailable' });
    await expect(
      new PostgresOutboundTelegramDeliveryAuthorizationStore(outOfScopePool).create(
        createInput({ allowedConnectionIds: Object.freeze(['telegram-bot-sales']) })
      )
    ).resolves.toEqual({ kind: 'command_unavailable' });
    expect(missingPool.records).toEqual([]);
    expect(outOfScopePool.records).toEqual([]);
  });

  it('rejects malformed browser-adjacent input before opening PostgreSQL', async () => {
    const invalidInputs: readonly unknown[] = [
      undefined,
      Object.freeze({ ...createInput(), allowedConnectionIds: [] }),
      Object.freeze({
        ...createInput(),
        allowedConnectionIds: ['telegram-bot-support', 'telegram-bot-sales']
      }),
      Object.freeze({ ...createInput(), commandId: '00042' }),
      Object.freeze({ ...createInput(), commandId: '9223372036854775808' }),
      Object.freeze({ ...createInput(), inboxId: '..' }),
      Object.freeze({ ...createInput(), dashboardPrincipalId: '.' }),
      Object.freeze({ ...createInput(), recipientId: 'synthetic-private-target' })
    ];

    for (const input of invalidInputs) {
      const pool = createPool({ insertEligible: true });

      await expect(
        new PostgresOutboundTelegramDeliveryAuthorizationStore(pool).create(
          input as OutboundTelegramDeliveryAuthorizationCreateInput
        )
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.queries).toEqual([]);
      expect(pool.connectionCount).toBe(0);
    }
  });

  it('rolls back and fails closed when storage returns a malformed row or insert error', async () => {
    const malformedPool = createPool({
      corruptInsertRow: Object.freeze({ authorized_at: 'not-an-iso-timestamp' }),
      insertEligible: true
    });

    await expect(
      new PostgresOutboundTelegramDeliveryAuthorizationStore(malformedPool).create(createInput())
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(malformedPool.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(malformedPool.records).toEqual([]);

    const failingPool = createPool({ failOnInsert: true, insertEligible: true });

    await expect(
      new PostgresOutboundTelegramDeliveryAuthorizationStore(failingPool).create(createInput())
    ).rejects.toEqual(new PostgresStorageError());
    expect(failingPool.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(failingPool.records).toEqual([]);
    expect(failingPool.clients.every((client) => client.released)).toBe(true);
  });
});

interface StoredAuthorization {
  readonly authorizationEligibleNow: boolean;
  readonly authorizedAt: string;
  readonly botIdentityFingerprint: string;
  readonly commandId: string;
  readonly dashboardPrincipalId: string;
  readonly inboxId: string;
  readonly scopeFingerprint: string;
}

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeSqlClient extends SqlClient {
  readonly released: boolean;
}

interface FakePool extends SqlPool {
  readonly clients: readonly FakeSqlClient[];
  readonly connectionCount: number;
  readonly lockKeys: readonly number[];
  readonly queries: readonly RecordedQuery[];
  readonly records: readonly StoredAuthorization[];
}

interface PoolOptions {
  readonly corruptInsertRow?: Readonly<Record<string, unknown>>;
  readonly existing?: StoredAuthorization;
  readonly failOnInsert?: boolean;
  readonly insertEligible: boolean;
}

const createInput = (
  overrides: Readonly<Partial<OutboundTelegramDeliveryAuthorizationCreateInput>> = {}
): OutboundTelegramDeliveryAuthorizationCreateInput =>
  Object.freeze({
    allowedConnectionIds: CONNECTION_IDS,
    commandId: COMMAND_ID,
    dashboardPrincipalId: PRINCIPAL_A,
    inboxId: INBOX_ID,
    ...overrides
  });

const storedAuthorization = (
  overrides: Readonly<Partial<StoredAuthorization>> = {}
): StoredAuthorization =>
  Object.freeze({
    authorizationEligibleNow: true,
    authorizedAt: AUTHORIZED_AT,
    botIdentityFingerprint: BOT_FINGERPRINT,
    commandId: COMMAND_ID,
    dashboardPrincipalId: PRINCIPAL_A,
    inboxId: INBOX_ID,
    scopeFingerprint: createOutboundCommandScopeFingerprint(CONNECTION_IDS),
    ...overrides
  });

const createPool = (options: PoolOptions): FakePool => {
  const queries: RecordedQuery[] = [];
  const lockKeys: number[] = [];
  let records: StoredAuthorization[] = options.existing === undefined ? [] : [options.existing];
  const clients: FakeSqlClient[] = [];
  let connectionCount = 0;
  let transactionSnapshot: readonly StoredAuthorization[] | undefined;

  const query = async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
    queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

    if (sql === 'BEGIN') {
      transactionSnapshot = Object.freeze([...records]);
      return Object.freeze({ rows: [] });
    }

    if (sql === 'COMMIT') {
      transactionSnapshot = undefined;
      return Object.freeze({ rows: [] });
    }

    if (sql === 'ROLLBACK') {
      records = [...(transactionSnapshot ?? [])];
      transactionSnapshot = undefined;
      return Object.freeze({ rows: [] });
    }

    if (sql === 'SELECT pg_advisory_xact_lock($1)') {
      const key = values[0];

      if (typeof key === 'number') {
        lockKeys.push(key);
      }

      return Object.freeze({ rows: [] });
    }

    if (sql.includes('FROM open_channel_hub.outbound_telegram_delivery_authorizations')) {
      const [commandId, , inboxId, scopeFingerprint] = values;

      if (
        typeof commandId !== 'string' ||
        typeof inboxId !== 'string' ||
        typeof scopeFingerprint !== 'string'
      ) {
        throw new Error('Synthetic command identifier must be a string.');
      }

      const record = records.find((candidate) => candidate.commandId === commandId);

      return Object.freeze({
        rows:
          record === undefined
            ? []
            : [
                Object.freeze({
                  authorization_eligible_now:
                    record.authorizationEligibleNow &&
                    record.inboxId === inboxId &&
                    record.scopeFingerprint === scopeFingerprint,
                  authorized_at: record.authorizedAt,
                  bot_identity_fingerprint: record.botIdentityFingerprint,
                  command_id: record.commandId,
                  dashboard_principal_id: record.dashboardPrincipalId,
                  inbox_id: record.inboxId,
                  scope_fingerprint: record.scopeFingerprint
                })
              ]
      });
    }

    if (sql.includes('INSERT INTO open_channel_hub.outbound_telegram_delivery_authorizations')) {
      if (options.failOnInsert === true) {
        throw new Error('Synthetic PostgreSQL insert failure.');
      }

      const [commandId, , inboxId, scopeFingerprint, dashboardPrincipalId] = values;

      if (
        options.insertEligible !== true ||
        typeof commandId !== 'string' ||
        typeof inboxId !== 'string' ||
        typeof scopeFingerprint !== 'string' ||
        typeof dashboardPrincipalId !== 'string' ||
        records.some((candidate) => candidate.commandId === commandId)
      ) {
        return Object.freeze({ rows: [] });
      }

      const record = storedAuthorization({
        commandId,
        dashboardPrincipalId,
        inboxId,
        scopeFingerprint
      });
      records.push(record);

      return Object.freeze({
        rows: [
          Object.freeze({
            ...(options.corruptInsertRow ?? {}),
            authorized_at: options.corruptInsertRow?.authorized_at ?? record.authorizedAt,
            command_id: record.commandId,
            dashboard_principal_id: record.dashboardPrincipalId,
            inbox_id: record.inboxId
          })
        ]
      });
    }

    return Object.freeze({ rows: [] });
  };

  return Object.freeze({
    get clients(): readonly FakeSqlClient[] {
      return Object.freeze([...clients]);
    },
    get connectionCount(): number {
      return connectionCount;
    },
    connect: async (): Promise<SqlClient> => {
      connectionCount += 1;
      let released = false;
      const client: FakeSqlClient = Object.freeze({
        get released(): boolean {
          return released;
        },
        query,
        release: (): void => {
          released = true;
        }
      });
      clients.push(client);
      return client;
    },
    get lockKeys(): readonly number[] {
      return Object.freeze([...lockKeys]);
    },
    query,
    get queries(): readonly RecordedQuery[] {
      return Object.freeze([...queries]);
    },
    get records(): readonly StoredAuthorization[] {
      return Object.freeze([...records]);
    }
  });
};
