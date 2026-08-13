import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventStore } from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlClient, SqlPool } from './sql.js';

/**
 * Serializes identity allocation and commit for the ledger. Without this lock,
 * PostgreSQL sequences can hand a later transaction a larger identity before
 * an earlier transaction commits, which would make a stable read snapshot able
 * to skip the earlier row.
 */
const INBOUND_EVENT_APPEND_LOCK_KEY = 1_864_659_702;

const INSERT_INBOUND_EVENT_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.inbound_events (
  connection_id,
  provider_event_id,
  canonical_event_id,
  channel,
  event_type,
  occurred_at,
  conversation_id,
  message_id,
  sender_id,
  message_text
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (connection_id, provider_event_id) DO NOTHING
`;

/**
 * PostgreSQL implementation of the domain event-store port. The provider event
 * identity is scoped to a connection so the same provider identifier on a
 * different configured account is never mistaken for a duplicate.
 */
export class PostgresInboundEventStore implements InboundEventStore {
  public constructor(private readonly pool: SqlPool) {}

  public async append(events: readonly CanonicalEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    let client: SqlClient | undefined;
    let transactionStarted = false;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query('SELECT pg_advisory_xact_lock($1)', [INBOUND_EVENT_APPEND_LOCK_KEY]);

      for (const event of events) {
        await client.query(INSERT_INBOUND_EVENT_SQL, valuesFor(event));
      }

      await client.query('COMMIT');
      transactionStarted = false;
    } catch {
      if (client !== undefined && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original failure is the only safe error this boundary exposes.
        }
      }

      throw new PostgresStorageError();
    } finally {
      client?.release();
    }
  }
}

const valuesFor = (event: CanonicalEvent): readonly unknown[] =>
  Object.freeze([
    event.connectionId,
    event.providerEventId,
    event.id,
    event.channel,
    event.type,
    event.occurredAt,
    event.message.conversationId,
    event.message.id,
    event.message.senderId,
    event.message.text
  ]);

export type { SqlClient, SqlPool } from './sql.js';
