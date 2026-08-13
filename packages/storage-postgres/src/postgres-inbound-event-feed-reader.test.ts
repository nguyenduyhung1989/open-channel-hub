import { describe, expect, it } from 'vitest';

import { PostgresStorageError } from './postgres-error.js';
import { PostgresInboundEventFeedReader } from './postgres-inbound-event-feed-reader.js';
import type { SqlPool, SqlQueryResult } from './sql.js';

const CONNECTION_A = "connection-a'; DROP TABLE inbound_events; --";
const CONNECTION_B = 'connection-b';
const CONNECTION_IDS = Object.freeze([CONNECTION_A, CONNECTION_B]);

describe('PostgresInboundEventFeedReader', () => {
  it('returns one parameterized, canonical-only feed across its explicit connection scope', async () => {
    const pool = createPool({
      pageRows: [row('12', CONNECTION_B), row('11', CONNECTION_A), row('10', CONNECTION_B)],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });

    const result = await new PostgresInboundEventFeedReader(pool).list({
      connectionIds: CONNECTION_IDS,
      pageSize: 2
    });

    expect(result).toEqual({
      events: [event('12', CONNECTION_B), event('11', CONNECTION_A)],
      nextCursor: {
        beforeSequence: '11',
        snapshotMaxSequence: '12'
      }
    });
    expect(pool.queries).toHaveLength(2);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('connection_id = ANY($1::text[])'),
      values: [CONNECTION_IDS]
    });
    expect(pool.queries[1]).toMatchObject({
      sql: expect.stringContaining('inbound_event.connection_id = ANY($1::text[])'),
      values: [CONNECTION_IDS, '12', 3]
    });
    expect(pool.queries[1]?.sql).toContain('inbound_event.ledger_id <= $2::bigint');
    expect(pool.queries[1]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
    expect(pool.queries[1]?.sql).not.toContain(CONNECTION_A);
    expect(result.events[0]).not.toHaveProperty('ledgerId');
  });

  it('orders the underlying bigint ledger column numerically rather than the projected text alias', async () => {
    const pool = createPool({
      pageRows: [
        row('11', CONNECTION_A),
        row('7', CONNECTION_B),
        row('4', CONNECTION_A),
        row('1', CONNECTION_B)
      ],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '11' })]
    });

    await expect(
      new PostgresInboundEventFeedReader(pool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 4
      })
    ).resolves.toEqual({
      events: [
        event('11', CONNECTION_A),
        event('7', CONNECTION_B),
        event('4', CONNECTION_A),
        event('1', CONNECTION_B)
      ]
    });
    expect(pool.queries[1]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
    expect(pool.queries[1]?.sql).not.toContain('ORDER BY ledger_id DESC');
  });

  it('continues below the same global ledger snapshot without fetching a new maximum', async () => {
    const pool = createPool({ pageRows: [row('9', CONNECTION_B), row('8', CONNECTION_A)] });
    const result = await new PostgresInboundEventFeedReader(pool).list({
      connectionIds: CONNECTION_IDS,
      pageSize: 2,
      cursor: {
        beforeSequence: '10',
        snapshotMaxSequence: '12'
      }
    });

    expect(result).toEqual({
      events: [event('9', CONNECTION_B), event('8', CONNECTION_A)]
    });
    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('inbound_event.ledger_id < $3::bigint'),
      values: [CONNECTION_IDS, '12', '10', 3]
    });
    expect(pool.queries[0]?.sql).toContain('ORDER BY inbound_event.ledger_id DESC');
  });

  it('returns an empty first page when no selected connection has a committed event snapshot', async () => {
    const pool = createPool({ snapshotRows: [Object.freeze({ snapshot_max_sequence: null })] });

    await expect(
      new PostgresInboundEventFeedReader(pool).list({ connectionIds: CONNECTION_IDS, pageSize: 1 })
    ).resolves.toEqual({ events: [] });
    expect(pool.queries).toHaveLength(1);
  });

  it('fails safely when a row escapes scope or violates the advertised reverse sequence', async () => {
    const outsideScopePool = createPool({
      pageRows: [row('12', 'unrelated-connection')],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresInboundEventFeedReader(outsideScopePool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });

    const unorderedPool = createPool({
      pageRows: [row('11', CONNECTION_A), row('12', CONNECTION_B)],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresInboundEventFeedReader(unorderedPool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 2
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });

  it('rejects malformed scope, cursor, row, snapshot, and database details before exposing storage data', async () => {
    const invalidInputs: readonly unknown[] = [
      undefined,
      Object.freeze({ connectionIds: [], pageSize: 1 }),
      Object.freeze({ connectionIds: [CONNECTION_A, CONNECTION_A], pageSize: 1 }),
      Object.freeze({ connectionIds: ['  '], pageSize: 1 }),
      Object.freeze({ connectionIds: CONNECTION_IDS, pageSize: 101 }),
      Object.freeze({
        connectionIds: CONNECTION_IDS,
        pageSize: 1,
        cursor: Object.freeze({ beforeSequence: '0009', snapshotMaxSequence: '9' })
      }),
      Object.freeze({
        connectionIds: Array.from({ length: 101 }, (_, index) => `connection-${index}`),
        pageSize: 1
      })
    ];

    for (const input of invalidInputs) {
      const pool = createPool();
      await expect(
        new PostgresInboundEventFeedReader(pool).list(input as never)
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.queries).toHaveLength(0);
    }

    const malformedRowPool = createPool({
      pageRows: [row('12', CONNECTION_A, { channel: 'not-a-channel' })],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresInboundEventFeedReader(malformedRowPool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const oversizedPagePool = createPool({
      pageRows: [row('12', CONNECTION_B), row('11', CONNECTION_A), row('10', CONNECTION_B)],
      snapshotRows: [Object.freeze({ snapshot_max_sequence: '12' })]
    });
    await expect(
      new PostgresInboundEventFeedReader(oversizedPagePool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const malformedSnapshotPool = createPool({ snapshotRows: [] });
    await expect(
      new PostgresInboundEventFeedReader(malformedSnapshotPool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const invalidSnapshotValuePool = createPool({
      snapshotRows: [Object.freeze({ snapshot_max_sequence: 'not-a-bigint' })]
    });
    await expect(
      new PostgresInboundEventFeedReader(invalidSnapshotValuePool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const failingPool = createPool({ failOnQuery: true });
    await expect(
      new PostgresInboundEventFeedReader(failingPool).list({
        connectionIds: CONNECTION_IDS,
        pageSize: 1
      })
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
          rows: options.snapshotRows ?? [Object.freeze({ snapshot_max_sequence: '12' })]
        });
      }

      return Object.freeze({ rows: options.pageRows ?? [] });
    }
  });
};

const row = (
  sequence: string,
  connectionId: string,
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    ledger_id: sequence,
    connection_id: connectionId,
    provider_event_id: `provider-${sequence}`,
    canonical_event_id: `canonical-${sequence}`,
    channel: 'telegram_bot',
    event_type: 'message.received',
    occurred_at: '2026-08-13T00:00:00.000Z',
    conversation_id: `conversation-${connectionId}`,
    message_id: `message-${sequence}`,
    sender_id: 'sender-1',
    message_text: `Synthetic message ${sequence}`,
    ...overrides
  });

const event = (sequence: string, connectionId: string) => ({
  id: `canonical-${sequence}`,
  providerEventId: `provider-${sequence}`,
  type: 'message.received' as const,
  connectionId,
  channel: 'telegram_bot' as const,
  occurredAt: '2026-08-13T00:00:00.000Z',
  message: {
    id: `message-${sequence}`,
    senderId: 'sender-1',
    conversationId: `conversation-${connectionId}`,
    text: `Synthetic message ${sequence}`
  }
});
