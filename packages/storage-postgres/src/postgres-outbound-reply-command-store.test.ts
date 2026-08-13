import type { OutboundReplyCommandCreateInput } from '@open-channel-hub/domain';
import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresOutboundReplyCommandStore } from './postgres-outbound-reply-command-store.js';
import type { SqlClient, SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_SALES = 'telegram-bot-sales';
const CONNECTION_SUPPORT = 'telegram-bot-support';
const ALLOWED_CONNECTION_IDS = Object.freeze([CONNECTION_SALES, CONNECTION_SUPPORT]);
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
  it('creates one source-bound queued command through parameterized INSERT SELECT without exposing its target', async () => {
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
    expect(pool.records).toEqual([
      expect.objectContaining({
        messageText: input.text,
        replyTargetId: SOURCE.conversationId,
        sourceChannel: SOURCE.channel,
        sourceMessageId: SOURCE.messageId
      })
    ]);
  });

  it('returns an idempotent replay only when the original source and text both match', async () => {
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
    expect(
      pool.queries.filter((query) =>
        query.sql.includes('INSERT INTO open_channel_hub.outbound_commands')
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
      Object.freeze({ ...createInput(), text: 'x'.repeat(4_097) })
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

  it('fails closed when storage returns a malformed idempotency row or a query fails', async () => {
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

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeSqlClient extends SqlClient {
  readonly queries: readonly RecordedQuery[];
  readonly released: boolean;
}

interface FakePool extends SqlPool {
  readonly clients: readonly FakeSqlClient[];
  readonly connectionCount: number;
  readonly outboundLockAcquisitions: number;
  readonly queries: readonly RecordedQuery[];
  readonly records: readonly StoredCommand[];
}

interface PoolOptions {
  readonly corruptExistingRow?: Readonly<Record<string, unknown>>;
  readonly failOnQuery?: string;
  readonly initialCommands?: readonly StoredCommand[];
  readonly sources?: readonly SourceEvent[];
}

const createInput = (
  overrides: Readonly<Partial<OutboundReplyCommandCreateInput>> = {}
): OutboundReplyCommandCreateInput =>
  Object.freeze({
    allowedConnectionIds: ALLOWED_CONNECTION_IDS,
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

  const createClient = (): FakeSqlClient => {
    const clientQueries: RecordedQuery[] = [];
    let releaseLock: (() => void) | undefined;
    let released = false;

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
            rows: command === undefined ? [] : [existingRow(command, options.corruptExistingRow)]
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

          return Object.freeze({ rows: [publicRow(command)] });
        }

        return Object.freeze({ rows: [] });
      },
      release: () => {
        releaseLock?.();
        releaseLock = undefined;
        released = true;
      }
    };

    clients.push(client);
    return client;
  };

  return Object.freeze({
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
  overrides: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ...publicRow(command),
    message_text: command.messageText,
    ...overrides
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
