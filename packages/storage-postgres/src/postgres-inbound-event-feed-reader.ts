import {
  CHANNELS,
  TELEGRAM_CHAT_TYPES,
  ZALO_USER_THREAD_TYPES,
  type CanonicalEvent,
  type Channel,
  type TelegramChatType,
  type ZaloUserThreadType
} from '@open-channel-hub/contracts';
import type {
  InboundEventFeedListInput,
  InboundEventFeedReader,
  InboundEventPage,
  InboundEventPageCursor
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlPool } from './sql.js';

const MAXIMUM_CONNECTION_IDS = 100;
const MAXIMUM_PAGE_SIZE = 100;
const MAX_POSTGRES_BIGINT = '9223372036854775807';

const SNAPSHOT_MAX_SEQUENCE_SQL = `
SELECT MAX(inbound_event.ledger_id)::text AS snapshot_max_sequence
FROM ${POSTGRES_SCHEMA}.inbound_events AS inbound_event
WHERE inbound_event.connection_id = ANY($1::text[])
`;

const FIRST_PAGE_SQL = `
SELECT
  ledger_id::text AS ledger_id,
  connection_id,
  provider_event_id,
  canonical_event_id,
  channel,
  event_type,
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
  conversation_id,
  message_id,
  sender_id,
  message_text,
  telegram_chat_type,
  zalo_user_thread_type
FROM ${POSTGRES_SCHEMA}.inbound_events AS inbound_event
WHERE inbound_event.connection_id = ANY($1::text[])
  AND inbound_event.ledger_id <= $2::bigint
ORDER BY inbound_event.ledger_id DESC
LIMIT $3
`;

const CONTINUATION_PAGE_SQL = `
SELECT
  ledger_id::text AS ledger_id,
  connection_id,
  provider_event_id,
  canonical_event_id,
  channel,
  event_type,
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
  conversation_id,
  message_id,
  sender_id,
  message_text,
  telegram_chat_type,
  zalo_user_thread_type
FROM ${POSTGRES_SCHEMA}.inbound_events AS inbound_event
WHERE inbound_event.connection_id = ANY($1::text[])
  AND inbound_event.ledger_id <= $2::bigint
  AND inbound_event.ledger_id < $3::bigint
ORDER BY inbound_event.ledger_id DESC
LIMIT $4
`;

interface ValidatedFeedListInput {
  readonly connectionIds: readonly string[];
  readonly pageSize: number;
  readonly cursor?: InboundEventPageCursor;
}

interface ParsedLedgerRow {
  readonly event: CanonicalEvent;
  readonly sequence: string;
}

/**
 * Parameterized PostgreSQL reader for a canonical inbound-event feed across an
 * explicit connection scope. It returns no database rows or raw payloads.
 */
export class PostgresInboundEventFeedReader implements InboundEventFeedReader {
  public constructor(private readonly pool: SqlPool) {}

  public async list(input: InboundEventFeedListInput): Promise<InboundEventPage> {
    try {
      const validated = validateInput(input);
      const snapshotMaxSequence =
        validated.cursor === undefined
          ? await this.findSnapshotMaxSequence(validated.connectionIds)
          : validated.cursor.snapshotMaxSequence;

      if (snapshotMaxSequence === undefined) {
        return Object.freeze({ events: Object.freeze([]) });
      }

      const result =
        validated.cursor === undefined
          ? await this.pool.query(FIRST_PAGE_SQL, [
              validated.connectionIds,
              snapshotMaxSequence,
              validated.pageSize + 1
            ])
          : await this.pool.query(CONTINUATION_PAGE_SQL, [
              validated.connectionIds,
              snapshotMaxSequence,
              validated.cursor.beforeSequence,
              validated.pageSize + 1
            ]);

      if (result.rows.length > validated.pageSize + 1) {
        throw new PostgresStorageError();
      }

      const hasNextPage = result.rows.length > validated.pageSize;
      const selectedRows = result.rows.slice(0, validated.pageSize);
      const parsedRows = selectedRows.map((row) =>
        parseLedgerRow(row, validated.connectionIds, snapshotMaxSequence, validated.cursor)
      );
      assertDescendingSequences(parsedRows);
      const events = Object.freeze(parsedRows.map((row) => row.event));

      if (!hasNextPage) {
        return Object.freeze({ events });
      }

      const lastRow = parsedRows.at(-1);

      if (lastRow === undefined) {
        throw new PostgresStorageError();
      }

      return Object.freeze({
        events,
        nextCursor: Object.freeze({
          beforeSequence: lastRow.sequence,
          snapshotMaxSequence
        })
      });
    } catch (error) {
      if (error instanceof PostgresStorageError) {
        throw error;
      }

      throw new PostgresStorageError();
    }
  }

  private async findSnapshotMaxSequence(
    connectionIds: readonly string[]
  ): Promise<string | undefined> {
    const result = await this.pool.query(SNAPSHOT_MAX_SEQUENCE_SQL, [connectionIds]);

    if (result.rows.length !== 1) {
      throw new PostgresStorageError();
    }

    const value = result.rows[0]?.snapshot_max_sequence;

    if (value === null) {
      return undefined;
    }

    if (!isPositivePostgresBigIntString(value)) {
      throw new PostgresStorageError();
    }

    return value;
  }
}

const validateInput = (input: InboundEventFeedListInput): ValidatedFeedListInput => {
  if (!isRecord(input) || !isConnectionScope(input.connectionIds) || !isPageSize(input.pageSize)) {
    throw new PostgresStorageError();
  }

  const connectionIds = Object.freeze([...input.connectionIds]);

  if (input.cursor === undefined) {
    return Object.freeze({ connectionIds, pageSize: input.pageSize });
  }

  if (!isValidCursor(input.cursor)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    connectionIds,
    pageSize: input.pageSize,
    cursor: Object.freeze({
      beforeSequence: input.cursor.beforeSequence,
      snapshotMaxSequence: input.cursor.snapshotMaxSequence
    })
  });
};

const isConnectionScope = (value: unknown): value is readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAXIMUM_CONNECTION_IDS) {
    return false;
  }

  const seen = new Set<string>();

  for (const connectionId of value) {
    if (!isNonBlankString(connectionId) || seen.has(connectionId)) {
      return false;
    }

    seen.add(connectionId);
  }

  return true;
};

const isValidCursor = (cursor: unknown): cursor is InboundEventPageCursor =>
  isRecord(cursor) &&
  isPositivePostgresBigIntString(cursor.beforeSequence) &&
  isPositivePostgresBigIntString(cursor.snapshotMaxSequence) &&
  compareDecimalStrings(cursor.beforeSequence, cursor.snapshotMaxSequence) <= 0;

const parseLedgerRow = (
  row: Readonly<Record<string, unknown>>,
  connectionIds: readonly string[],
  snapshotMaxSequence: string,
  cursor: InboundEventPageCursor | undefined
): ParsedLedgerRow => {
  const sequence = row.ledger_id;
  const connectionId = row.connection_id;
  const providerEventId = row.provider_event_id;
  const id = row.canonical_event_id;
  const channel = row.channel;
  const eventType = row.event_type;
  const occurredAt = row.occurred_at;
  const conversationId = row.conversation_id;
  const messageId = row.message_id;
  const senderId = row.sender_id;
  const text = row.message_text;

  if (
    !isPositivePostgresBigIntString(sequence) ||
    !isNonBlankString(connectionId) ||
    !connectionIds.includes(connectionId) ||
    !isNonBlankString(providerEventId) ||
    !isNonBlankString(id) ||
    !isChannel(channel) ||
    eventType !== 'message.received' ||
    !isOccurredAt(occurredAt) ||
    !isNonBlankString(conversationId) ||
    !isNonBlankString(messageId) ||
    !isNonBlankString(senderId) ||
    typeof text !== 'string' ||
    compareDecimalStrings(sequence, snapshotMaxSequence) > 0 ||
    (cursor !== undefined && compareDecimalStrings(sequence, cursor.beforeSequence) >= 0)
  ) {
    throw new PostgresStorageError();
  }

  const telegramChatType = parseTelegramChatType(channel, row.telegram_chat_type);
  const zaloUserThreadType = parseZaloUserThreadType(channel, row.zalo_user_thread_type);

  return Object.freeze({
    sequence,
    event: Object.freeze({
      id,
      providerEventId,
      type: 'message.received',
      connectionId,
      channel,
      occurredAt,
      ...(telegramChatType === undefined ? {} : { telegramChatType }),
      ...(zaloUserThreadType === undefined ? {} : { zaloUserThreadType }),
      message: Object.freeze({
        id: messageId,
        senderId,
        conversationId,
        text
      })
    })
  });
};

const assertDescendingSequences = (rows: readonly ParsedLedgerRow[]): void => {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    if (
      previous === undefined ||
      current === undefined ||
      compareDecimalStrings(previous.sequence, current.sequence) <= 0
    ) {
      throw new PostgresStorageError();
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPageSize = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= MAXIMUM_PAGE_SIZE;

const isPositivePostgresBigIntString = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,18}$/.test(value) &&
  (value.length < MAX_POSTGRES_BIGINT.length ||
    (value.length === MAX_POSTGRES_BIGINT.length && value <= MAX_POSTGRES_BIGINT));

const isChannel = (value: unknown): value is Channel =>
  typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);

const parseTelegramChatType = (channel: Channel, value: unknown): TelegramChatType | undefined => {
  if (channel !== 'telegram_bot') {
    if (value !== null) {
      throw new PostgresStorageError();
    }

    return undefined;
  }

  if (value === null) {
    return undefined;
  }

  if (typeof value === 'string' && (TELEGRAM_CHAT_TYPES as readonly string[]).includes(value)) {
    return value as TelegramChatType;
  }

  throw new PostgresStorageError();
};

const parseZaloUserThreadType = (
  channel: Channel,
  value: unknown
): ZaloUserThreadType | undefined => {
  if (channel !== 'zalo_user') {
    if (value !== null) {
      throw new PostgresStorageError();
    }

    return undefined;
  }

  if (value === null) {
    return undefined;
  }

  if (typeof value === 'string' && (ZALO_USER_THREAD_TYPES as readonly string[]).includes(value)) {
    return value as ZaloUserThreadType;
  }

  throw new PostgresStorageError();
};

const isOccurredAt = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));

const compareDecimalStrings = (left: string, right: string): number =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length;
