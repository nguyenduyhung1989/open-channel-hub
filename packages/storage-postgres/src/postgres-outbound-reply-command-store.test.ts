import type { OutboundReplyCommandCreateInput } from '@open-channel-hub/domain';
import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresOutboundReplyCommandStore } from './postgres-outbound-reply-command-store.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_SALES = 'telegram-bot-sales';
const CONNECTION_SUPPORT = 'telegram-bot-support';
const ALLOWED_CONNECTION_IDS = Object.freeze([CONNECTION_SALES, CONNECTION_SUPPORT]);
const SUPPORT_INBOX = 'support-inbox';
const SALES_INBOX = 'sales-inbox';
const DASHBOARD_PRINCIPAL_A = 'dashboard-principal-a';
const DASHBOARD_PRINCIPAL_B = 'dashboard-principal-b';
const EXPECTED_SCOPE_FINGERPRINT =
  '3d58dc520e577fc8205c5baa6c1fa853232cb7e40fab9a73b0e44a36c95e321e';
const EXPECTED_SUPPORT_ONLY_SCOPE_FINGERPRINT =
  '7893b2565513a5b5cd5cacee0dd46ab3485505434c2a5e3c63effe2cea85ba68';
const SOURCE: SourceEvent = Object.freeze({
  channel: 'telegram_bot',
  connectionId: CONNECTION_SUPPORT,
  conversationId: '-1001234567890',
  messageId: '301',
  providerEventId: "9001';DROP--",
  senderId: '42'
});
const CREATED_AT = '2026-08-13T12:00:00.000Z';

describe('PostgresOutboundReplyCommandStore', () => {
  it('creates one source-bound queued command and immutable inbox-bearer authorization without exposing private fields', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);
    const input = createInput({ text: "Reply '; DROP TABLE outbound_commands; --" });

    const result = await store.create(input);

    expect(result).toEqual({
      command: {
        createdAt: CREATED_AT,
        id: '1',
        sourceConnectionId: CONNECTION_SUPPORT,
        sourceProviderEventId: SOURCE.providerEventId,
        state: 'queued'
      },
      kind: 'created'
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.kind !== 'created') {
      throw new Error('The synthetic source must create a command.');
    }

    expect(Object.isFrozen(result.command)).toBe(true);
    expect(result.command).not.toHaveProperty('replyTargetId');
    expect(result.command).not.toHaveProperty('sourceMessageId');
    expect(result.command).not.toHaveProperty('sourceChannel');
    expect(result.command).not.toHaveProperty('text');
    expect(result.command).not.toHaveProperty('authorization');

    const insert = pool.queries.find((query) =>
      query.sql.includes('INSERT INTO open_channel_hub.outbound_commands')
    );

    expect(insert).toMatchObject({
      values: [
        CONNECTION_SUPPORT,
        SOURCE.providerEventId,
        input.clientOperationId,
        input.text,
        ALLOWED_CONNECTION_IDS
      ]
    });
    expect(insert?.sql).toContain('FROM open_channel_hub.inbound_events AS source');
    expect(insert?.sql).toContain('source.conversation_id');
    expect(insert?.sql).toContain('source.message_id');
    expect(insert?.sql).toContain('source.channel');
    expect(insert?.sql).toContain('source.connection_id = ANY($5::text[])');
    expect(insert?.sql).not.toContain(SOURCE.conversationId);
    expect(insert?.sql).not.toContain(input.text);
    expect(insert?.sql).not.toContain(input.authorization.inboxId);
    expect(pool.records).toEqual([
      expect.objectContaining({
        messageText: input.text,
        replyTargetId: SOURCE.conversationId,
        sourceChannel: SOURCE.channel,
        sourceMessageId: SOURCE.messageId
      })
    ]);

    const authorizationInsert = pool.queries.find((query) =>
      query.sql.includes('INSERT INTO open_channel_hub.outbound_command_authorizations')
    );

    expect(authorizationInsert).toMatchObject({
      values: ['1', 'inbox_bearer', SUPPORT_INBOX, null, EXPECTED_SCOPE_FINGERPRINT]
    });
    expect(authorizationInsert?.sql).toContain('VALUES ($1::bigint, $2, $3, $4, $5)');
    expect(authorizationInsert?.sql).not.toContain(SOURCE.conversationId);
    expect(authorizationInsert?.sql).not.toContain(input.text);
    expect(authorizationInsert?.sql).not.toContain('reply_target_id');
    expect(authorizationInsert?.sql).not.toContain('message_text');
    expect(authorizationInsert?.sql).not.toContain('token');
    expect(authorizationInsert?.sql).not.toContain('session');
    expect(authorizationInsert?.sql).not.toContain('cookie');
    expect(pool.authorizations).toEqual([
      Object.freeze({
        authorizationKind: 'inbox_bearer',
        commandId: '1',
        inboxId: SUPPORT_INBOX,
        scopeFingerprint: EXPECTED_SCOPE_FINGERPRINT
      })
    ]);
  });

  it('persists dashboard-principal provenance with its bound inbox and no bearer material', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const input = createInput({
      authorization: Object.freeze({
        dashboardPrincipalId: DASHBOARD_PRINCIPAL_A,
        inboxId: SUPPORT_INBOX,
        kind: 'dashboard_principal'
      })
    });

    await expect(new PostgresOutboundReplyCommandStore(pool).create(input)).resolves.toMatchObject({
      kind: 'created'
    });

    const authorizationInsert = pool.queries.find((query) =>
      query.sql.includes('INSERT INTO open_channel_hub.outbound_command_authorizations')
    );

    expect(authorizationInsert).toMatchObject({
      values: [
        '1',
        'dashboard_principal',
        SUPPORT_INBOX,
        DASHBOARD_PRINCIPAL_A,
        EXPECTED_SCOPE_FINGERPRINT
      ]
    });
    expect(pool.authorizations).toEqual([
      Object.freeze({
        authorizationKind: 'dashboard_principal',
        commandId: '1',
        dashboardPrincipalId: DASHBOARD_PRINCIPAL_A,
        inboxId: SUPPORT_INBOX,
        scopeFingerprint: EXPECTED_SCOPE_FINGERPRINT
      })
    ]);
  });

  it('derives a different versioned scope fingerprint when the sorted allowed connection scope changes', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);

    await store.create(createInput());
    await store.create(
      createInput({
        allowedConnectionIds: Object.freeze([CONNECTION_SUPPORT]),
        clientOperationId: 'support-only-scope-operation'
      })
    );

    expect(pool.authorizations).toEqual([
      expect.objectContaining({
        commandId: '1',
        scopeFingerprint: EXPECTED_SCOPE_FINGERPRINT
      }),
      expect.objectContaining({
        commandId: '2',
        scopeFingerprint: EXPECTED_SUPPORT_ONLY_SCOPE_FINGERPRINT
      })
    ]);
    expect(EXPECTED_SCOPE_FINGERPRINT).not.toBe(EXPECTED_SUPPORT_ONLY_SCOPE_FINGERPRINT);
  });

  it('returns an idempotent replay only when source, text, provenance, and scope all match', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);
    const input = createInput();

    const created = await store.create(input);
    const replay = await store.create(input);

    expect(created).toMatchObject({ kind: 'created' });
    expect(replay).toEqual({
      command: {
        createdAt: CREATED_AT,
        id: '1',
        sourceConnectionId: CONNECTION_SUPPORT,
        sourceProviderEventId: SOURCE.providerEventId,
        state: 'queued'
      },
      kind: 'idempotent_replay'
    });
    expect(pool.records).toHaveLength(1);
    expect(pool.authorizations).toHaveLength(1);
    expect(
      pool.queries.filter((query) =>
        query.sql.includes('INSERT INTO open_channel_hub.outbound_commands')
      )
    ).toHaveLength(1);
    expect(
      pool.queries.filter((query) =>
        query.sql.includes('INSERT INTO open_channel_hub.outbound_command_authorizations')
      )
    ).toHaveLength(1);
  });

  it('returns an idempotency conflict when one operation key changes source or text', async () => {
    const pool = createPool({
      sources: [
        SOURCE,
        Object.freeze({
          ...SOURCE,
          conversationId: '-1009999999999',
          messageId: '302',
          providerEventId: '9002'
        })
      ]
    });
    const store = new PostgresOutboundReplyCommandStore(pool);
    const input = createInput();

    await store.create(input);

    await expect(store.create({ ...input, text: 'A different reply' })).resolves.toEqual({
      kind: 'idempotency_conflict'
    });
    await expect(store.create({ ...input, sourceProviderEventId: '9002' })).resolves.toEqual({
      kind: 'idempotency_conflict'
    });
    expect(pool.records).toHaveLength(1);
  });

  it('returns an idempotency conflict when the authorizing inbox, dashboard principal, or scope changes', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);
    const bearerInput = createInput();

    await store.create(bearerInput);

    await expect(
      store.create({
        ...bearerInput,
        authorization: Object.freeze({ inboxId: SALES_INBOX, kind: 'inbox_bearer' })
      })
    ).resolves.toEqual({ kind: 'idempotency_conflict' });
    await expect(
      store.create({
        ...bearerInput,
        allowedConnectionIds: Object.freeze([CONNECTION_SUPPORT])
      })
    ).resolves.toEqual({ kind: 'idempotency_conflict' });

    const dashboardInput = createInput({
      authorization: Object.freeze({
        dashboardPrincipalId: DASHBOARD_PRINCIPAL_A,
        inboxId: SUPPORT_INBOX,
        kind: 'dashboard_principal'
      }),
      clientOperationId: 'dashboard-principal-operation'
    });
    await store.create(dashboardInput);

    await expect(
      store.create({
        ...dashboardInput,
        authorization: Object.freeze({
          dashboardPrincipalId: DASHBOARD_PRINCIPAL_B,
          inboxId: SUPPORT_INBOX,
          kind: 'dashboard_principal'
        })
      })
    ).resolves.toEqual({ kind: 'idempotency_conflict' });

    expect(pool.records).toHaveLength(2);
    expect(pool.authorizations).toHaveLength(2);
  });

  it('treats a legacy command without durable authorization provenance as an idempotency conflict', async () => {
    const input = createInput();
    const pool = createPool({ initialCommands: [storedCommand(input)], sources: [SOURCE] });

    await expect(new PostgresOutboundReplyCommandStore(pool).create(input)).resolves.toEqual({
      kind: 'idempotency_conflict'
    });
    expect(pool.records).toHaveLength(1);
    expect(pool.authorizations).toEqual([]);
    expect(
      pool.queries.filter((query) =>
        query.sql.includes('INSERT INTO open_channel_hub.outbound_command_authorizations')
      )
    ).toEqual([]);
  });

  it('returns the same source-unavailable result for an out-of-scope source and a missing source', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);

    const outOfScope = await store.create({
      ...createInput({ clientOperationId: 'reply-outside-scope' }),
      allowedConnectionIds: Object.freeze([CONNECTION_SALES])
    });
    const missing = await store.create(
      createInput({
        clientOperationId: 'reply-missing-source',
        sourceProviderEventId: 'not-present'
      })
    );

    expect(outOfScope).toEqual({ kind: 'source_unavailable' });
    expect(missing).toEqual({ kind: 'source_unavailable' });
    expect(pool.records).toEqual([]);
    const scopeBoundQueries = pool.queries.filter(
      (query) =>
        query.sql.includes('open_channel_hub.outbound_commands') ||
        query.sql.includes('open_channel_hub.inbound_events AS source')
    );
    expect(scopeBoundQueries.every((query) => query.sql.includes('ANY($'))).toBe(true);
  });

  it('serializes concurrent identical create calls into one command and one replay', async () => {
    const pool = createPool({ sources: [SOURCE] });
    const store = new PostgresOutboundReplyCommandStore(pool);
    const input = createInput({ clientOperationId: 'reply-concurrent' });

    const results = await Promise.all([store.create(input), store.create(input)]);

    expect(results.map((result) => result.kind).sort()).toEqual(['created', 'idempotent_replay']);
    expect(pool.records).toHaveLength(1);
    expect(pool.outboundLockAcquisitions).toBe(2);
  });

  it('rejects malformed boundary input before it opens a PostgreSQL transaction', async () => {
    const invalidInputs: readonly unknown[] = [
      undefined,
      Object.freeze({ ...createInput(), allowedConnectionIds: [] }),
      Object.freeze({
        ...createInput(),
        allowedConnectionIds: [CONNECTION_SUPPORT, CONNECTION_SALES]
      }),
      Object.freeze({
        ...createInput(),
        allowedConnectionIds: [CONNECTION_SALES, CONNECTION_SALES]
      }),
      Object.freeze({ ...createInput(), clientOperationId: '..' }),
      Object.freeze({ ...createInput(), sourceProviderEventId: 'has a space' }),
      Object.freeze({ ...createInput(), text: ' \n\t ' }),
      Object.freeze({ ...createInput(), text: 'x'.repeat(4_097) }),
      Object.freeze({ ...createInput(), authorization: undefined }),
      Object.freeze({
        ...createInput(),
        authorization: Object.freeze({ inboxId: '..', kind: 'inbox_bearer' })
      }),
      Object.freeze({
        ...createInput(),
        authorization: Object.freeze({
          inboxId: SUPPORT_INBOX,
          kind: 'inbox_bearer',
          token: 'must-not-cross-the-boundary'
        })
      }),
      Object.freeze({
        ...createInput(),
        authorization: Object.freeze({ inboxId: SUPPORT_INBOX, kind: 'dashboard_principal' })
      }),
      Object.freeze({
        ...createInput(),
        authorization: Object.freeze({
          dashboardPrincipalId: '..',
          inboxId: SUPPORT_INBOX,
          kind: 'dashboard_principal'
        })
      })
    ];

    for (const input of invalidInputs) {
      const pool = createPool({ sources: [SOURCE] });

      await expect(
        new PostgresOutboundReplyCommandStore(pool).create(input as OutboundReplyCommandCreateInput)
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.queries).toEqual([]);
      expect(pool.connectionCount).toBe(0);
    }
  });

  it('fails closed when storage returns a malformed idempotency row or a command query fails', async () => {
    const malformedPool = createPool({
      corruptExistingRow: Object.freeze({ state: 'accepted' }),
      initialCommands: [storedCommand(createInput())],
      sources: [SOURCE]
    });

    await expect(
      new PostgresOutboundReplyCommandStore(malformedPool).create(createInput())
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(malformedPool.queries.map((query) => query.sql)).toContain('ROLLBACK');

    const failingPool = createPool({
      failOnQuery: 'INSERT INTO open_channel_hub.outbound_commands',
      sources: [SOURCE]
    });
    await expect(
      new PostgresOutboundReplyCommandStore(failingPool).create(createInput())
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });
    expect(failingPool.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(failingPool.clients.every((client) => client.released)).toBe(true);
  });

  it('rolls back the source-bound command when its authorization insert fails', async () => {
    const pool = createPool({
      failOnQuery: 'INSERT INTO open_channel_hub.outbound_command_authorizations',
      sources: [SOURCE]
    });

    await expect(new PostgresOutboundReplyCommandStore(pool).create(createInput())).rejects.toEqual(
      new PostgresStorageError()
    );
    expect(pool.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(pool.records).toEqual([]);
    expect(pool.authorizations).toEqual([]);
    expect(pool.clients.every((client) => client.released)).toBe(true);
  });
});

interface SourceEvent {
  readonly channel: string;
  readonly connectionId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly providerEventId: string;
  readonly senderId: string;
}

interface StoredCommand {
  readonly clientOperationId: string;
  readonly commandId: string;
  readonly connectionId: string;
  readonly createdAt: string;
  readonly messageText: string;
  readonly replyTargetId: string;
  readonly sourceChannel: string;
  readonly sourceMessageId: string;
  readonly sourceProviderEventId: string;
  readonly state: 'queued';
}

interface StoredCommandAuthorization {
  readonly authorizationKind: 'dashboard_principal' | 'inbox_bearer';
  readonly commandId: string;
  readonly dashboardPrincipalId?: string;
  readonly inboxId: string;
  readonly scopeFingerprint: string;
}

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeSqlClient extends SqlClient {
  readonly queries: readonly RecordedQuery[];
  readonly released: boolean;
}

interface FakePool extends SqlPool {
  readonly authorizations: readonly StoredCommandAuthorization[];
  readonly clients: readonly FakeSqlClient[];
  readonly connectionCount: number;
  readonly outboundLockAcquisitions: number;
  readonly queries: readonly RecordedQuery[];
  readonly records: readonly StoredCommand[];
}

interface PoolOptions {
  readonly corruptExistingRow?: Readonly<Record<string, unknown>>;
  readonly failOnQuery?: string;
  readonly initialAuthorizations?: readonly StoredCommandAuthorization[];
  readonly initialCommands?: readonly StoredCommand[];
  readonly sources?: readonly SourceEvent[];
}

const createInput = (
  overrides: Readonly<Partial<OutboundReplyCommandCreateInput>> = {}
): OutboundReplyCommandCreateInput =>
  Object.freeze({
    allowedConnectionIds: ALLOWED_CONNECTION_IDS,
    authorization: Object.freeze({ inboxId: SUPPORT_INBOX, kind: 'inbox_bearer' }),
    clientOperationId: 'reply-operation-1',
    sourceConnectionId: CONNECTION_SUPPORT,
    sourceProviderEventId: SOURCE.providerEventId,
    text: 'Synthetic reply',
    ...overrides
  });

const storedCommand = (input: OutboundReplyCommandCreateInput): StoredCommand =>
  Object.freeze({
    clientOperationId: input.clientOperationId,
    commandId: '1',
    connectionId: input.sourceConnectionId,
    createdAt: CREATED_AT,
    messageText: input.text,
    replyTargetId: SOURCE.conversationId,
    sourceChannel: SOURCE.channel,
    sourceMessageId: SOURCE.messageId,
    sourceProviderEventId: input.sourceProviderEventId,
    state: 'queued'
  });

const createPool = (options: PoolOptions = {}): FakePool => {
  const authorizations = new Map<string, StoredCommandAuthorization>();
  const commands = new Map<string, StoredCommand>();
  const sources = new Map<string, SourceEvent>();
  const queries: RecordedQuery[] = [];
  const clients: FakeSqlClient[] = [];
  const lock = new AsyncTransactionLock();
  let nextCommandId = 1;
  let outboundLockAcquisitions = 0;

  for (const source of options.sources ?? []) {
    sources.set(sourceKey(source.connectionId, source.providerEventId), source);
  }

  for (const command of options.initialCommands ?? []) {
    commands.set(commandKey(command.connectionId, command.clientOperationId), command);
    nextCommandId = Math.max(nextCommandId, Number(command.commandId) + 1);
  }

  for (const authorization of options.initialAuthorizations ?? []) {
    authorizations.set(authorization.commandId, authorization);
  }

  const createClient = (): FakeSqlClient => {
    const clientQueries: RecordedQuery[] = [];
    const createdAuthorizationIds = new Set<string>();
    const createdCommandKeys = new Set<string>();
    let releaseLock: (() => void) | undefined;
    let released = false;
    let transactionCommitted = false;

    const rollbackCreatedRecords = (): void => {
      for (const authorizationId of createdAuthorizationIds) {
        authorizations.delete(authorizationId);
      }

      for (const commandKeyToRemove of createdCommandKeys) {
        const command = commands.get(commandKeyToRemove);

        if (command !== undefined) {
          authorizations.delete(command.commandId);
        }

        commands.delete(commandKeyToRemove);
      }

      createdAuthorizationIds.clear();
      createdCommandKeys.clear();
    };

    const client: FakeSqlClient = {
      get queries(): readonly RecordedQuery[] {
        return clientQueries;
      },
      get released(): boolean {
        return released;
      },
      async query(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> {
        const record = Object.freeze({ sql, values: Object.freeze([...values]) });
        clientQueries.push(record);
        queries.push(record);

        if (options.failOnQuery !== undefined && sql.includes(options.failOnQuery)) {
          throw new Error('Synthetic PostgreSQL detail that must not leave the storage adapter.');
        }

        if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          if (sql === 'ROLLBACK') {
            rollbackCreatedRecords();
          } else {
            transactionCommitted = true;
          }

          releaseLock?.();
          releaseLock = undefined;
          return Object.freeze({ rows: [] });
        }

        if (sql.includes('SELECT pg_advisory_xact_lock($1)') && values[0] === 1_864_659_704) {
          outboundLockAcquisitions += 1;
          releaseLock = await lock.acquire();
          return Object.freeze({ rows: [] });
        }

        if (sql.includes('FROM open_channel_hub.outbound_commands')) {
          const [connectionId, clientOperationId, allowedConnectionIds] = values;
          const command =
            typeof connectionId === 'string' &&
            typeof clientOperationId === 'string' &&
            isStringArray(allowedConnectionIds) &&
            allowedConnectionIds.includes(connectionId)
              ? commands.get(commandKey(connectionId, clientOperationId))
              : undefined;

          return Object.freeze({
            rows:
              command === undefined
                ? []
                : [
                    existingRow(
                      command,
                      authorizations.get(command.commandId),
                      options.corruptExistingRow
                    )
                  ]
          });
        }

        if (sql.includes('INSERT INTO open_channel_hub.outbound_commands')) {
          const [
            connectionId,
            providerEventId,
            clientOperationId,
            messageText,
            allowedConnectionIds
          ] = values;
          if (
            typeof connectionId !== 'string' ||
            typeof providerEventId !== 'string' ||
            typeof clientOperationId !== 'string' ||
            typeof messageText !== 'string' ||
            !isStringArray(allowedConnectionIds)
          ) {
            throw new Error('The synthetic query values are invalid.');
          }

          const key = commandKey(connectionId, clientOperationId);
          const source = sources.get(sourceKey(connectionId, providerEventId));

          if (
            source === undefined ||
            !allowedConnectionIds.includes(connectionId) ||
            commands.has(key)
          ) {
            return Object.freeze({ rows: [] });
          }

          const command: StoredCommand = Object.freeze({
            clientOperationId,
            commandId: String(nextCommandId),
            connectionId,
            createdAt: CREATED_AT,
            messageText,
            replyTargetId: source.conversationId,
            sourceChannel: source.channel,
            sourceMessageId: source.messageId,
            sourceProviderEventId: providerEventId,
            state: 'queued'
          });
          nextCommandId += 1;
          commands.set(key, command);
          createdCommandKeys.add(key);

          return Object.freeze({ rows: [publicRow(command)] });
        }

        if (sql.includes('INSERT INTO open_channel_hub.outbound_command_authorizations')) {
          const [commandId, authorizationKind, inboxId, dashboardPrincipalId, scopeFingerprint] =
            values;

          if (
            typeof commandId !== 'string' ||
            (authorizationKind !== 'inbox_bearer' && authorizationKind !== 'dashboard_principal') ||
            typeof inboxId !== 'string' ||
            (dashboardPrincipalId !== null && typeof dashboardPrincipalId !== 'string') ||
            typeof scopeFingerprint !== 'string' ||
            authorizations.has(commandId)
          ) {
            throw new Error('The synthetic authorization query values are invalid.');
          }

          const command = [...commands.values()].find(
            (candidate) => candidate.commandId === commandId
          );

          if (
            command === undefined ||
            (authorizationKind === 'inbox_bearer' && dashboardPrincipalId !== null) ||
            (authorizationKind === 'dashboard_principal' &&
              typeof dashboardPrincipalId !== 'string')
          ) {
            throw new Error('The synthetic authorization does not match a stored command.');
          }

          let authorization: StoredCommandAuthorization;

          if (authorizationKind === 'dashboard_principal') {
            if (typeof dashboardPrincipalId !== 'string') {
              throw new Error('The synthetic dashboard principal is missing.');
            }

            authorization = Object.freeze({
              authorizationKind,
              commandId,
              dashboardPrincipalId,
              inboxId,
              scopeFingerprint
            });
          } else {
            authorization = Object.freeze({
              authorizationKind,
              commandId,
              inboxId,
              scopeFingerprint
            });
          }
          authorizations.set(commandId, authorization);
          createdAuthorizationIds.add(commandId);

          return Object.freeze({ rows: [authorizationRow(authorization)] });
        }

        return Object.freeze({ rows: [] });
      },
      release: () => {
        if (!transactionCommitted) {
          rollbackCreatedRecords();
        }

        releaseLock?.();
        releaseLock = undefined;
        released = true;
      }
    };

    clients.push(client);
    return client;
  };

  return Object.freeze({
    get authorizations(): readonly StoredCommandAuthorization[] {
      return Object.freeze([...authorizations.values()]);
    },
    get clients(): readonly FakeSqlClient[] {
      return Object.freeze([...clients]);
    },
    get connectionCount(): number {
      return clients.length;
    },
    get outboundLockAcquisitions(): number {
      return outboundLockAcquisitions;
    },
    get queries(): readonly RecordedQuery[] {
      return Object.freeze([...queries]);
    },
    get records(): readonly StoredCommand[] {
      return Object.freeze([...commands.values()]);
    },
    connect: async (): Promise<SqlClient> => createClient(),
    query: async (): Promise<SqlQueryResult> => {
      throw new Error('Outbound reply commands must use a transaction-scoped client.');
    }
  });
};

const existingRow = (
  command: StoredCommand,
  authorization: StoredCommandAuthorization | undefined,
  overrides: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ...publicRow(command),
    message_text: command.messageText,
    authorization_kind: authorization?.authorizationKind ?? null,
    inbox_id: authorization?.inboxId ?? null,
    dashboard_principal_id: authorization?.dashboardPrincipalId ?? null,
    scope_fingerprint: authorization?.scopeFingerprint ?? null,
    ...overrides
  });

const authorizationRow = (
  authorization: StoredCommandAuthorization
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    authorization_kind: authorization.authorizationKind,
    command_id: authorization.commandId,
    dashboard_principal_id: authorization.dashboardPrincipalId ?? null,
    inbox_id: authorization.inboxId,
    scope_fingerprint: authorization.scopeFingerprint
  });

const publicRow = (command: StoredCommand): Readonly<Record<string, unknown>> =>
  Object.freeze({
    command_id: command.commandId,
    connection_id: command.connectionId,
    created_at: command.createdAt,
    source_provider_event_id: command.sourceProviderEventId,
    state: command.state
  });

const commandKey = (connectionId: string, clientOperationId: string): string =>
  `${connectionId}\u0000${clientOperationId}`;

const sourceKey = (connectionId: string, providerEventId: string): string =>
  `${connectionId}\u0000${providerEventId}`;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((candidate) => typeof candidate === 'string');

class AsyncTransactionLock {
  private tail: Promise<void> = Promise.resolve();

  public async acquire(): Promise<() => void> {
    let releaseCurrent: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const previous = this.tail;
    this.tail = current;
    await previous;

    let released = false;

    return () => {
      if (!released) {
        released = true;
        releaseCurrent?.();
      }
    };
  }
}
