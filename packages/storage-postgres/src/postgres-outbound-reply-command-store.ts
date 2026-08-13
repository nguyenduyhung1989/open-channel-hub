import type {
  CreateOutboundReplyCommandResult,
  OutboundReplyCommand,
  OutboundReplyCommandCreateInput,
  OutboundReplyCommandStore
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import {
  INBOUND_EVENT_APPEND_LOCK_KEY,
  OUTBOUND_REPLY_COMMAND_CREATE_LOCK_KEY
} from './postgres-lock-keys.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlClient, SqlPool } from './sql.js';

const MAXIMUM_ALLOWED_CONNECTION_IDS = 100;
const MAXIMUM_MESSAGE_LENGTH = 4_096;
const MAXIMUM_PROVIDER_IDENTIFIER_LENGTH = 512;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_IDENTIFIER_PATTERN = /^[!-~]{1,512}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_POSTGRES_BIGINT = '9223372036854775807';

const COMMAND_COLUMNS_SQL = `
  command_id::text AS command_id,
  connection_id,
  source_provider_event_id,
  state,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
`;

/**
 * The lookup is deliberately scope-bound. A caller who lacks the source
 * connection sees the same absence as one whose source event never existed.
 * `message_text` stays inside this adapter solely to decide idempotent replay.
 */
const FIND_IDEMPOTENCY_COMMAND_SQL = `
SELECT
${COMMAND_COLUMNS_SQL},
  message_text
FROM ${POSTGRES_SCHEMA}.outbound_commands
WHERE connection_id = $1
  AND client_operation_id = $2
  AND connection_id = ANY($3::text[])
`;

/**
 * This is the only insert path. It selects all provider-facing reply material
 * from the immutable canonical inbound event; no command input has a target,
 * source-message id, or channel field that could be tampered with.
 */
const INSERT_SOURCE_BOUND_COMMAND_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.outbound_commands (
  connection_id,
  source_provider_event_id,
  client_operation_id,
  reply_target_id,
  source_message_id,
  source_channel,
  message_text,
  state
)
SELECT
  source.connection_id,
  source.provider_event_id,
  $3,
  source.conversation_id,
  source.message_id,
  source.channel,
  $4,
  'queued'
FROM ${POSTGRES_SCHEMA}.inbound_events AS source
WHERE source.connection_id = $1
  AND source.provider_event_id = $2
  AND source.connection_id = ANY($5::text[])
ON CONFLICT (connection_id, client_operation_id) DO NOTHING
RETURNING
${COMMAND_COLUMNS_SQL}
`;

type ValidatedCreateInput = Readonly<{
  allowedConnectionIds: readonly string[];
  clientOperationId: string;
  sourceConnectionId: string;
  sourceProviderEventId: string;
  text: string;
}>;

type StoredIdempotencyCommand = Readonly<{
  command: OutboundReplyCommand;
  messageText: string;
}>;

/**
 * PostgreSQL implementation of the domain-owned durable reply-command port.
 * It records an immutable queued intent only. It never imports a connector,
 * performs provider I/O, stores raw provider payloads, or exposes a reply
 * target to an API caller.
 */
export class PostgresOutboundReplyCommandStore implements OutboundReplyCommandStore {
  public constructor(private readonly pool: SqlPool) {}

  public async create(
    input: OutboundReplyCommandCreateInput
  ): Promise<CreateOutboundReplyCommandResult> {
    let client: SqlClient | undefined;
    let transactionStarted = false;

    try {
      const command = validateCreateInput(input);
      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      // Waiting for inbound append makes a just-arrived source event visible
      // before this command decides whether that source is available.
      await client.query('SELECT pg_advisory_xact_lock($1)', [INBOUND_EVENT_APPEND_LOCK_KEY]);
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        OUTBOUND_REPLY_COMMAND_CREATE_LOCK_KEY
      ]);

      const existing = await this.findExisting(client, command);
      const outcome =
        existing === undefined
          ? await this.insertOrClassifyConflict(client, command)
          : classifyExisting(existing, command);

      await client.query('COMMIT');
      transactionStarted = false;

      return outcome;
    } catch (error) {
      if (client !== undefined && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve one safe boundary error rather than a driver detail.
        }
      }

      if (error instanceof PostgresStorageError) {
        throw error;
      }

      throw new PostgresStorageError();
    } finally {
      client?.release();
    }
  }

  private async findExisting(
    client: SqlClient,
    input: ValidatedCreateInput
  ): Promise<StoredIdempotencyCommand | undefined> {
    const result = await client.query(FIND_IDEMPOTENCY_COMMAND_SQL, [
      input.sourceConnectionId,
      input.clientOperationId,
      input.allowedConnectionIds
    ]);

    return parseOptionalStoredCommand(result.rows, input.sourceConnectionId);
  }

  private async insertOrClassifyConflict(
    client: SqlClient,
    input: ValidatedCreateInput
  ): Promise<CreateOutboundReplyCommandResult> {
    const inserted = await client.query(INSERT_SOURCE_BOUND_COMMAND_SQL, [
      input.sourceConnectionId,
      input.sourceProviderEventId,
      input.clientOperationId,
      input.text,
      input.allowedConnectionIds
    ]);

    if (inserted.rows.length === 1) {
      const row = inserted.rows[0];

      if (row === undefined) {
        throw new PostgresStorageError();
      }

      return Object.freeze({
        command: parsePublicCommand(row, input.sourceConnectionId),
        kind: 'created'
      });
    }

    if (inserted.rows.length > 1) {
      throw new PostgresStorageError();
    }

    // This second read handles a unique-key race from a future writer that
    // does not participate in this adapter's advisory lock. It intentionally
    // remains scope-bound, so no conflict can reveal another account's record.
    const existing = await this.findExisting(client, input);

    return existing === undefined
      ? Object.freeze({ kind: 'source_unavailable' })
      : classifyExisting(existing, input);
  }
}

const validateCreateInput = (input: OutboundReplyCommandCreateInput): ValidatedCreateInput => {
  if (
    !isRecord(input) ||
    !isSortedConnectionScope(input.allowedConnectionIds) ||
    !isOperationIdentifier(input.clientOperationId) ||
    !isConnectionIdentifier(input.sourceConnectionId) ||
    !isProviderIdentifier(input.sourceProviderEventId) ||
    !isMessageText(input.text)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    allowedConnectionIds: Object.freeze([...input.allowedConnectionIds]),
    clientOperationId: input.clientOperationId,
    sourceConnectionId: input.sourceConnectionId,
    sourceProviderEventId: input.sourceProviderEventId,
    text: input.text
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

const parseOptionalStoredCommand = (
  rows: readonly Readonly<Record<string, unknown>>[],
  expectedConnectionId: string
): StoredIdempotencyCommand | undefined => {
  if (rows.length === 0) {
    return undefined;
  }

  if (rows.length !== 1) {
    throw new PostgresStorageError();
  }

  const row = rows[0];

  if (row === undefined || !isMessageText(row.message_text)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    command: parsePublicCommand(row, expectedConnectionId),
    messageText: row.message_text
  });
};

const parsePublicCommand = (
  row: Readonly<Record<string, unknown>>,
  expectedConnectionId: string
): OutboundReplyCommand => {
  const id = row.command_id;
  const sourceConnectionId = row.connection_id;
  const sourceProviderEventId = row.source_provider_event_id;
  const state = row.state;
  const createdAt = row.created_at;

  if (
    !isPostgresBigInt(id) ||
    !isConnectionIdentifier(sourceConnectionId) ||
    sourceConnectionId !== expectedConnectionId ||
    !isProviderIdentifier(sourceProviderEventId) ||
    state !== 'queued' ||
    !isCanonicalIsoUtc(createdAt)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    createdAt,
    id,
    sourceConnectionId,
    sourceProviderEventId,
    state: 'queued'
  });
};

const classifyExisting = (
  existing: StoredIdempotencyCommand,
  input: ValidatedCreateInput
): CreateOutboundReplyCommandResult =>
  existing.command.sourceProviderEventId === input.sourceProviderEventId &&
  existing.messageText === input.text
    ? Object.freeze({ command: existing.command, kind: 'idempotent_replay' })
    : Object.freeze({ kind: 'idempotency_conflict' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isConnectionIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value);

const isOperationIdentifier = (value: unknown): value is string =>
  isConnectionIdentifier(value) && value !== '.' && value !== '..';

const isProviderIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAXIMUM_PROVIDER_IDENTIFIER_LENGTH &&
  PROVIDER_IDENTIFIER_PATTERN.test(value);

const isMessageText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= MAXIMUM_MESSAGE_LENGTH &&
  value.trim().length > 0;

const isPostgresBigInt = (value: unknown): value is string =>
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
