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
  type: 'message.received'
});

describe('PostgresInboundEventStore', () => {
  it('records a canonical event through a parameterized, conflict-safe transaction', async () => {
    const pool = createSqlPool();
    const store = new PostgresInboundEventStore(pool);

    await store.append([EVENT]);

    expect(pool.client.queries).toHaveLength(3);
    expect(pool.client.queries[0]).toEqual({ sql: 'BEGIN', values: [] });
    expect(pool.client.queries[1]).toMatchObject({
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
        "Synthetic text with quote ' and SQL-looking punctuation; --"
      ]
    });
    expect(pool.client.queries[1]?.sql).toContain('$10');
    expect(pool.client.queries[1]?.sql).toContain(
      'ON CONFLICT (connection_id, provider_event_id) DO NOTHING'
    );
    expect(pool.client.queries[2]).toEqual({ sql: 'COMMIT', values: [] });
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
      expect.stringContaining('INSERT INTO open_channel_hub.inbound_events'),
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
