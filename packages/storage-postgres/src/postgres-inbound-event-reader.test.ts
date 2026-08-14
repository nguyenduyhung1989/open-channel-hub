import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresInboundEventReader } from './postgres-inbound-event-reader.js';
import type { SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_ID = "connection'; DROP TABLE inbound_events; --";

describe('PostgresInboundEventReader', () => {
  it('uses a connection-scoped snapshot and parameterized keyset query without returning storage fields', async () => {
    const pool = createPool({
      pageRows: [row('9'), row('8'), row('7')],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '9' })]
    });

    const result = await new PostgresInboundEventReader(pool).list({
      connectionId: CONNECTION_ID,
      pageSize: 2
    });

    expect(result).toEqual({
      events: [event('9'), event('8')],
      nextCursor: {
        beforeSequence: '8',
        snapshotMaxSequence: '9'
      }
    });
    expect(pool.queries).toHaveLength(2);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('WHERE inbound_event.connection_id = $1'),
      values: [CONNECTION_ID]
    });
    expect(pool.queries[1]).toMatchObject({
      sql: expect.stringContaining('inbound_event.connection_id = $1'),
      values: [CONNECTION_ID, '9', 3]
    });
    expect(pool.queries[1]?.sql).toContain('inbound_event.ledger_id <= $2::bigint');
    expect(pool.queries[1]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
    expect(pool.queries[1]?.sql).toContain('telegram_chat_type');
    expect(pool.queries[1]?.sql).not.toContain(CONNECTION_ID);
    expect(result.events[0]).not.toHaveProperty('ledgerId');
  });

  it('preserves recognized Telegram chat evidence internally and rejects malformed channel coupling', async () => {
    const privatePool = createPool({
      pageRows: [row('9', { telegram_chat_type: 'private' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '9' })]
    });

    await expect(
      new PostgresInboundEventReader(privatePool).list({ connectionId: CONNECTION_ID, pageSize: 1 })
    ).resolves.toEqual({
      events: [Object.freeze({ ...event('9'), telegramChatType: 'private' })]
    });

    const malformedPool = createPool({
      pageRows: [row('9', { channel: 'zalo_oa', telegram_chat_type: 'private' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '9' })]
    });

    await expect(
      new PostgresInboundEventReader(malformedPool).list({
        connectionId: CONNECTION_ID,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });

  it('orders the underlying bigint ledger column numerically rather than the projected text alias', async () => {
    const pool = createPool({
      pageRows: [row('11'), row('7'), row('4'), row('1')],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '11' })]
    });

    await expect(
      new PostgresInboundEventReader(pool).list({ connectionId: CONNECTION_ID, pageSize: 4 })
    ).resolves.toEqual({
      events: [event('11'), event('7'), event('4'), event('1')]
    });
    expect(pool.queries[1]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
    expect(pool.queries[1]?.sql).not.toContain('ORDER BY ledger_id DESC');
  });

  it('continues below the same snapshot ceiling without fetching a new maximum', async () => {
    const pool = createPool({ pageRows: [row('7'), row('6')] });
    const result = await new PostgresInboundEventReader(pool).list({
      connectionId: CONNECTION_ID,
      pageSize: 2,
      cursor: {
        beforeSequence: '8',
        snapshotMaxSequence: '9'
      }
    });

    expect(result).toEqual({ events: [event('7'), event('6')] });
    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('inbound_event.ledger_id < $3::bigint'),
      values: [CONNECTION_ID, '9', '8', 3]
    });
    expect(pool.queries[0]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
  });

  it('returns an empty first page when the connection has no committed event snapshot', async () => {
    const pool = createPool({ snapshotRows: [Object.freeze({ snapshot_max_sequence: null })] });

    await expect(
      new PostgresInboundEventReader(pool).list({ connectionId: CONNECTION_ID, pageSize: 1 })
    ).resolves.toEqual({ events: [] });
    expect(pool.queries).toHaveLength(1);
  });

  it('fails safely when a row escapes its requested connection scope', async () => {
    const pool = createPool({
      pageRows: [row('9', { connection_id: 'other-connection' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '9' })]
    });

    await expect(
      new PostgresInboundEventReader(pool).list({ connectionId: CONNECTION_ID, pageSize: 1 })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });
  });

  it('fails safely for malformed cursors, malformed rows, and database details', async () => {
    const invalidPageSizePool = createPool();
    await expect(
      new PostgresInboundEventReader(invalidPageSizePool).list({
        connectionId: CONNECTION_ID,
        pageSize: 101
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidPageSizePool.queries).toHaveLength(0);

    const invalidCursorPool = createPool();
    await expect(
      new PostgresInboundEventReader(invalidCursorPool).list({
        connectionId: CONNECTION_ID,
        pageSize: 1,
        cursor: { beforeSequence: '0009', snapshotMaxSequence: '9' }
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidCursorPool.queries).toHaveLength(0);

    const malformedRowPool = createPool({
      pageRows: [row('9', { channel: 'not-a-channel' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '9' })]
    });
    await expect(
      new PostgresInboundEventReader(malformedRowPool).list({
        connectionId: CONNECTION_ID,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const failingPool = createPool({ failOnQuery: true });
    await expect(
      new PostgresInboundEventReader(failingPool).list({ connectionId: CONNECTION_ID, pageSize: 1 })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });
  });
});

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakePool extends SqlPool {
  readonly queries: readonly RecordedQuery[];
}

interface PoolOptions {
  readonly failOnQuery?: boolean;
  readonly pageRows?: readonly Readonly<Record<string, unknown>>[];
  readonly snapshotRows?: readonly Readonly<Record<string, unknown>>[];
}

const createPool = (options: PoolOptions = {}): FakePool => {
  const queries: RecordedQuery[] = [];

  return Object.freeze({
    get queries(): readonly RecordedQuery[] {
      return queries;
    },
    connect: async () => {
      throw new Error('Reader must not need a dedicated client.');
    },
    query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
      queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (options.failOnQuery === true) {
        throw new Error('Synthetic PostgreSQL details must never cross the adapter boundary.');
      }

      if (sql.includes('MAX(inbound_event.ledger_id)::text')) {
        return Object.freeze({
          rows: options.snapshotRows ?? [Object.freeze({ snapshot_max_sequence: '9' })]
        });
      }

      return Object.freeze({ rows: options.pageRows ?? [] });
    }
  });
};

const row = (
  sequence: string,
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ledger_id: sequence,
    connection_id: CONNECTION_ID,
    provider_event_id: `provider-${sequence}`,
    canonical_event_id: `canonical-${sequence}`,
    channel: 'telegram_bot',
    event_type: 'message.received',
    occurred_at: '2026-08-13T00:00:00.000Z',
    conversation_id: 'conversation-1',
    message_id: `message-${sequence}`,
    sender_id: 'sender-1',
    message_text: `Synthetic message ${sequence}`,
    telegram_chat_type: null,
    ...overrides
  });

const event = (sequence: string) => ({
  id: `canonical-${sequence}`,
  providerEventId: `provider-${sequence}`,
  type: 'message.received' as const,
  connectionId: CONNECTION_ID,
  channel: 'telegram_bot' as const,
  occurredAt: '2026-08-13T00:00:00.000Z',
  message: {
    id: `message-${sequence}`,
    senderId: 'sender-1',
    conversationId: 'conversation-1',
    text: `Synthetic message ${sequence}`
  }
});
