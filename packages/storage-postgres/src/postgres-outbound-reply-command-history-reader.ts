import type {
  OutboundReplyCommandHistoryEntry,
  OutboundReplyCommandHistoryListInput,
  OutboundReplyCommandHistoryPage,
  OutboundReplyCommandHistoryPageCursor,
  OutboundReplyCommandHistoryReader
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlPool } from './sql.js';

const MAXIMUM_ALLOWED_CONNECTION_IDS = 100;
const MAXIMUM_MESSAGE_LENGTH = 4_096;
const MAXIMUM_PROVIDER_IDENTIFIER_LENGTH = 512;
const MAXIMUM_PAGE_SIZE = 100;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_IDENTIFIER_PATTERN = /^[!-~]{1,512}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_POSTGRES_BIGINT = '9223372036854775807';

const SNAPSHOT_MAX_SEQUENCE_SQL = `
SELECT MAX(outbound_command.command_id)::text AS snapshot_max_sequence
FROM ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
WHERE outbound_command.connection_id = ANY($1::text[])
  AND outbound_command.state = 'queued'
`;

/**
 * The projection intentionally stops at safe command-history fields. Private
 * reply targets, source-message metadata, source channel, and client
 * idempotency keys must never enter this reader's process memory.
 */
const COMMAND_HISTORY_COLUMNS_SQL = `
  outbound_command.command_id::text AS command_id,
  outbound_command.connection_id,
  outbound_command.source_provider_event_id,
  outbound_command.message_text,
  outbound_command.state,
  to_char(
    outbound_command.created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS created_at
`;

const FIRST_PAGE_SQL = `
SELECT
${COMMAND_HISTORY_COLUMNS_SQL}
FROM ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
WHERE outbound_command.connection_id = ANY($1::text[])
  AND outbound_command.state = 'queued'
  AND outbound_command.command_id <= $2::bigint
ORDER BY outbound_command.command_id DESC
LIMIT $3
`;

const CONTINUATION_PAGE_SQL = `
SELECT
${COMMAND_HISTORY_COLUMNS_SQL}
FROM ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
WHERE outbound_command.connection_id = ANY($1::text[])
  AND outbound_command.state = 'queued'
  AND outbound_command.command_id <= $2::bigint
  AND outbound_command.command_id < $3::bigint
ORDER BY outbound_command.command_id DESC
LIMIT $4
`;

interface ValidatedHistoryListInput {
  readonly allowedConnectionIds: readonly string[];
  readonly cursor?: OutboundReplyCommandHistoryPageCursor;
  readonly pageSize: number;
}

interface ParsedCommandHistoryRow {
  readonly command: OutboundReplyCommandHistoryEntry;
  readonly sequence: string;
}

/**
 * Parameterized PostgreSQL reader for one stable, inbox-scoped durable command
 * snapshot. It neither imports a connector nor performs provider I/O, and it
 * never returns a raw database row.
 */
export class PostgresOutboundReplyCommandHistoryReader implements OutboundReplyCommandHistoryReader {
  public constructor(private readonly pool: SqlPool) {}

  public async list(
    input: OutboundReplyCommandHistoryListInput
  ): Promise<OutboundReplyCommandHistoryPage> {
    try {
      const validated = validateHistoryListInput(input);
      const snapshotMaxSequence =
        validated.cursor === undefined
          ? await this.findSnapshotMaxSequence(validated.allowedConnectionIds)
          : validated.cursor.snapshotMaxSequence;

      if (snapshotMaxSequence === undefined) {
        return Object.freeze({ commands: Object.freeze([]) });
      }

      const result =
        validated.cursor === undefined
          ? await this.pool.query(FIRST_PAGE_SQL, [
              validated.allowedConnectionIds,
              snapshotMaxSequence,
              validated.pageSize + 1
            ])
          : await this.pool.query(CONTINUATION_PAGE_SQL, [
              validated.allowedConnectionIds,
              snapshotMaxSequence,
              validated.cursor.beforeSequence,
              validated.pageSize + 1
            ]);

      if (result.rows.length > validated.pageSize + 1) {
        throw new PostgresStorageError();
      }

      const hasNextPage = result.rows.length > validated.pageSize;
      // Parse the look-ahead row too. Although it is not returned to callers,
      // it affects pagination and must obey the exact same scope, snapshot,
      // shape, and ordering guarantees as every selected command.
      const parsedRows = result.rows.map((row) =>
        parseCommandHistoryRow(
          row,
          validated.allowedConnectionIds,
          snapshotMaxSequence,
          validated.cursor
        )
      );
      assertDescendingSequences(parsedRows);
      const selectedRows = parsedRows.slice(0, validated.pageSize);
      const commands = Object.freeze(selectedRows.map((row) => row.command));

      if (!hasNextPage) {
        return Object.freeze({ commands });
      }

      const lastRow = selectedRows.at(-1);

      if (lastRow === undefined) {
        throw new PostgresStorageError();
      }

      return Object.freeze({
        commands,
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
    allowedConnectionIds: readonly string[]
  ): Promise<string | undefined> {
    const result = await this.pool.query(SNAPSHOT_MAX_SEQUENCE_SQL, [allowedConnectionIds]);

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

const validateHistoryListInput = (
  input: OutboundReplyCommandHistoryListInput
): ValidatedHistoryListInput => {
  if (
    !isRecord(input) ||
    !isSortedConnectionScope(input.allowedConnectionIds) ||
    !isPageSize(input.pageSize)
  ) {
    throw new PostgresStorageError();
  }

  const allowedConnectionIds = Object.freeze([...input.allowedConnectionIds]);

  if (input.cursor === undefined) {
    return Object.freeze({ allowedConnectionIds, pageSize: input.pageSize });
  }

  if (!isValidCursor(input.cursor)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    allowedConnectionIds,
    cursor: Object.freeze({
      beforeSequence: input.cursor.beforeSequence,
      snapshotMaxSequence: input.cursor.snapshotMaxSequence
    }),
    pageSize: input.pageSize
  });
};

const isSortedConnectionScope = (value: unknown): value is readonly string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_ALLOWED_CONNECTION_IDS) {
    return false;
  }

  let previous: string | undefined;

  for (const connectionId of value) {
    if (
      !isConnectionIdentifier(connectionId) ||
      (previous !== undefined && previous >= connectionId)
    ) {
      return false;
    }

    previous = connectionId;
  }

  return true;
};

const isValidCursor = (cursor: unknown): cursor is OutboundReplyCommandHistoryPageCursor =>
  isRecord(cursor) &&
  isPositivePostgresBigIntString(cursor.beforeSequence) &&
  isPositivePostgresBigIntString(cursor.snapshotMaxSequence) &&
  compareDecimalStrings(cursor.beforeSequence, cursor.snapshotMaxSequence) <= 0;

const parseCommandHistoryRow = (
  row: Readonly<Record<string, unknown>>,
  allowedConnectionIds: readonly string[],
  snapshotMaxSequence: string,
  cursor: OutboundReplyCommandHistoryPageCursor | undefined
): ParsedCommandHistoryRow => {
  const sequence = row.command_id;
  const sourceConnectionId = row.connection_id;
  const sourceProviderEventId = row.source_provider_event_id;
  const text = row.message_text;
  const state = row.state;
  const createdAt = row.created_at;

  if (
    !isPositivePostgresBigIntString(sequence) ||
    !isConnectionIdentifier(sourceConnectionId) ||
    !allowedConnectionIds.includes(sourceConnectionId) ||
    !isProviderIdentifier(sourceProviderEventId) ||
    !isMessageText(text) ||
    state !== 'queued' ||
    !isCanonicalIsoUtc(createdAt) ||
    compareDecimalStrings(sequence, snapshotMaxSequence) > 0 ||
    (cursor !== undefined && compareDecimalStrings(sequence, cursor.beforeSequence) >= 0)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    command: Object.freeze({
      createdAt,
      id: sequence,
      sourceConnectionId,
      sourceProviderEventId,
      state: 'queued',
      text
    }),
    sequence
  });
};

const assertDescendingSequences = (rows: readonly ParsedCommandHistoryRow[]): void => {
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

const isConnectionIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && value !== '.' && value !== '..';

const isProviderIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAXIMUM_PROVIDER_IDENTIFIER_LENGTH &&
  PROVIDER_IDENTIFIER_PATTERN.test(value);

const isMessageText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= MAXIMUM_MESSAGE_LENGTH &&
  value.trim().length > 0;

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

const isCanonicalIsoUtc = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const compareDecimalStrings = (left: string, right: string): number =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length;
