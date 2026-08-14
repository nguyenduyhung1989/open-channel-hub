import type { CanonicalEvent } from '@open-channel-hub/contracts';
import { describe, expect, it } from 'vitest';

import {
  PostgresInboundEventStore,
  type SqlClient,
  type SqlPool
} from './postgres-inbound-event-store.js';

const EVENT: CanonicalEvent = Object.freeze({
  channel: 'telegram_bot',
  connectionId: 'telegram-bot-default',
  id: 'telegram:event:9001',
  message: Object.freeze({
    conversationId: '42',
    id: '301',
    senderId: '42',
    text: "Synthetic text with quote ' and SQL-looking punctuation; --"
  }),
  occurredAt: '2026-08-12T00:00:00.000Z',
  providerEventId: '9001',
  telegramChatType: 'private',
  type: 'message.received'
});

describe('PostgresInboundEventStore', () => {
  it('records a canonical event through a parameterized, conflict-safe transaction', async () => {
    const pool = createSqlPool();
    const store = new PostgresInboundEventStore(pool);

    await store.append([EVENT]);

    expect(pool.client.queries).toHaveLength(4);
    expect(pool.client.queries[0]).toEqual({ sql: 'BEGIN', values: [] });
    expect(pool.client.queries[1]).toEqual({
      sql: 'SELECT pg_advisory_xact_lock($1)',
      values: [1_864_659_702]
    });
    expect(pool.client.queries[2]).toMatchObject({
      sql: expect.stringContaining('INSERT INTO open_channel_hub.inbound_events'),
      values: [
        'telegram-bot-default',
        '9001',
        'telegram:event:9001',
        'telegram_bot',
        'message.received',
        '2026-08-12T00:00:00.000Z',
        '42',
        '301',
        '42',
        "Synthetic text with quote ' and SQL-looking punctuation; --",
        'private'
      ]
    });
    expect(pool.client.queries[2]?.sql).toContain('$11');
    expect(pool.client.queries[2]?.sql).toContain(
      'ON CONFLICT (connection_id, provider_event_id) DO NOTHING'
    );
    expect(pool.client.queries[3]).toEqual({ sql: 'COMMIT', values: [] });
    expect(pool.client.released).toBe(true);
  });

  it('rolls back and returns a safe error when recording fails', async () => {
    const pool = createSqlPool({ failOnQuery: 'INSERT INTO open_channel_hub.inbound_events' });
    const store = new PostgresInboundEventStore(pool);

    await expect(store.append([EVENT])).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });

    expect(pool.client.queries.map((query) => query.sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('INSERT INTO open_channel_hub.inbound_events'),
      'ROLLBACK'
    ]);
    expect(pool.client.released).toBe(true);
  });

  it('rejects Telegram chat evidence that would violate the durable channel boundary before opening a transaction', async () => {
    const withoutTelegramChatType = eventWithoutTelegramChatType();
    const invalidEvents: readonly CanonicalEvent[] = [
      Object.freeze(withoutTelegramChatType),
      Object.freeze({ ...EVENT, telegramChatType: 'unsupported' as never }),
      Object.freeze({ ...EVENT, channel: 'zalo_oa' as const })
    ];

    for (const event of invalidEvents) {
      const pool = createSqlPool();

      await expect(new PostgresInboundEventStore(pool).append([event])).rejects.toMatchObject({
        message: 'PostgreSQL storage is unavailable.',
        name: 'PostgresStorageError'
      });
      expect(pool.client.queries).toEqual([]);
    }
  });

  it('stores no Telegram chat evidence for a non-Telegram canonical event', async () => {
    const pool = createSqlPool();
    const withoutTelegramChatType = eventWithoutTelegramChatType();
    const nonTelegram = Object.freeze({ ...withoutTelegramChatType, channel: 'zalo_oa' as const });

    await new PostgresInboundEventStore(pool).append([nonTelegram]);

    expect(pool.client.queries[2]?.values.at(-1)).toBeNull();
  });
});

const eventWithoutTelegramChatType = (): Omit<CanonicalEvent, 'telegramChatType'> =>
  Object.freeze({
    channel: EVENT.channel,
    connectionId: EVENT.connectionId,
    id: EVENT.id,
    message: EVENT.message,
    occurredAt: EVENT.occurredAt,
    providerEventId: EVENT.providerEventId,
    type: EVENT.type
  });

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeSqlClient extends SqlClient {
  readonly queries: RecordedQuery[];
  released: boolean;
}

interface FakeSqlPool extends SqlPool {
  readonly client: FakeSqlClient;
}

const createSqlPool = (options: Readonly<{ failOnQuery?: string }> = {}): FakeSqlPool => {
  const client: FakeSqlClient = {
    queries: [],
    released: false,
    async query(sql: string, values: readonly unknown[] = []) {
      client.queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (options.failOnQuery !== undefined && sql.includes(options.failOnQuery)) {
        throw new Error('Synthetic PostgreSQL failure that must not escape the storage boundary.');
      }

      return Object.freeze({ rows: [] });
    },
    release: () => {
      client.released = true;
    }
  };

  return Object.freeze({
    client,
    connect: async () => client,
    query: async () => Object.freeze({ rows: [] })
  });
};
