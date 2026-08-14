import { createHash } from 'node:crypto';

import type {
  CreateOutboundReplyCommandResult,
  OutboundReplyCommand,
  OutboundReplyCommandAuthorization,
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
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const AUTHORIZATION_SCOPE_FINGERPRINT_PREFIX =
  'open-channel-hub/outbound-command-authorization-scope/v1\u0000';

const COMMAND_COLUMNS_SQL = `
  outbound_command.command_id::text AS command_id,
  outbound_command.connection_id,
  outbound_command.source_provider_event_id,
  outbound_command.state,
  to_char(outbound_command.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
`;

/**
 * The lookup is deliberately scope-bound. A caller who lacks the source
 * connection sees the same absence as one whose source event never existed.
 * `message_text` stays inside this adapter solely to decide idempotent replay.
 */
const FIND_IDEMPOTENCY_COMMAND_SQL = `
SELECT
${COMMAND_COLUMNS_SQL},
  outbound_command.message_text,
  command_authorization.authorization_kind,
  command_authorization.inbox_id,
  command_authorization.dashboard_principal_id,
  command_authorization.scope_fingerprint
FROM ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
LEFT JOIN ${POSTGRES_SCHEMA}.outbound_command_authorizations AS command_authorization
  ON command_authorization.command_id = outbound_command.command_id
WHERE outbound_command.connection_id = $1
  AND outbound_command.client_operation_id = $2
  AND outbound_command.connection_id = ANY($3::text[])
`;

/**
 * This is the only insert path. It selects all provider-facing reply material
 * from the immutable canonical inbound event; no command input has a target,
 * source-message id, or channel field that could be tampered with.
 */
const INSERT_SOURCE_BOUND_COMMAND_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command (
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

const INSERT_OUTBOUND_COMMAND_AUTHORIZATION_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.outbound_command_authorizations (
  command_id,
  authorization_kind,
  inbox_id,
  dashboard_principal_id,
  scope_fingerprint
)
VALUES ($1::bigint, $2, $3, $4, $5)
RETURNING
  command_id::text AS command_id,
  authorization_kind,
  inbox_id,
  dashboard_principal_id,
  scope_fingerprint
`;

type ValidatedCreateInput = Readonly<{
  allowedConnectionIds: readonly string[];
  authorization: OutboundReplyCommandAuthorization;
  clientOperationId: string;
  scopeFingerprint: string;
  sourceConnectionId: string;
  sourceProviderEventId: string;
  text: string;
}>;

type StoredCommandAuthorization = Readonly<{
  authorization: OutboundReplyCommandAuthorization;
  scopeFingerprint: string;
}>;

type StoredIdempotencyCommand = Readonly<{
  authorization: StoredCommandAuthorization | undefined;
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

      const command = parsePublicCommand(row, input.sourceConnectionId);
      await this.insertAuthorization(client, command, input);

      return Object.freeze({
        command,
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

  private async insertAuthorization(
    client: SqlClient,
    command: OutboundReplyCommand,
    input: ValidatedCreateInput
  ): Promise<void> {
    const result = await client.query(INSERT_OUTBOUND_COMMAND_AUTHORIZATION_SQL, [
      command.id,
      input.authorization.kind,
      input.authorization.inboxId,
      input.authorization.kind === 'dashboard_principal'
        ? input.authorization.dashboardPrincipalId
        : null,
      input.scopeFingerprint
    ]);

    assertInsertedAuthorization(result.rows, command.id, input);
  }
}

const validateCreateInput = (input: OutboundReplyCommandCreateInput): ValidatedCreateInput => {
  const authorization = isRecord(input) ? validateAuthorization(input.authorization) : undefined;

  if (
    !isRecord(input) ||
    !isSortedConnectionScope(input.allowedConnectionIds) ||
    authorization === undefined ||
    !isOperationIdentifier(input.clientOperationId) ||
    !isConnectionIdentifier(input.sourceConnectionId) ||
    !isProviderIdentifier(input.sourceProviderEventId) ||
    !isMessageText(input.text)
  ) {
    throw new PostgresStorageError();
  }

  const allowedConnectionIds = Object.freeze([...input.allowedConnectionIds]);

  return Object.freeze({
    allowedConnectionIds,
    authorization,
    clientOperationId: input.clientOperationId,
    scopeFingerprint: createScopeFingerprint(allowedConnectionIds),
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
    authorization: parseStoredAuthorization(row),
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
  existing.messageText === input.text &&
  hasSameAuthorization(existing.authorization, input)
    ? Object.freeze({ command: existing.command, kind: 'idempotent_replay' })
    : Object.freeze({ kind: 'idempotency_conflict' });

const assertInsertedAuthorization = (
  rows: readonly Readonly<Record<string, unknown>>[],
  expectedCommandId: string,
  input: ValidatedCreateInput
): void => {
  if (rows.length !== 1) {
    throw new PostgresStorageError();
  }

  const row = rows[0];

  if (row === undefined || row.command_id !== expectedCommandId) {
    throw new PostgresStorageError();
  }

  const authorization = parseStoredAuthorization(row);

  if (authorization === undefined || !hasSameAuthorization(authorization, input)) {
    throw new PostgresStorageError();
  }
};

const parseStoredAuthorization = (
  row: Readonly<Record<string, unknown>>
): StoredCommandAuthorization | undefined => {
  const kind = row.authorization_kind;
  const inboxId = row.inbox_id;
  const dashboardPrincipalId = row.dashboard_principal_id;
  const scopeFingerprint = row.scope_fingerprint;

  if (
    kind === null &&
    inboxId === null &&
    dashboardPrincipalId === null &&
    scopeFingerprint === null
  ) {
    return undefined;
  }

  if (!isAuthorizationIdentifier(inboxId) || !isSha256Hex(scopeFingerprint)) {
    throw new PostgresStorageError();
  }

  if (kind === 'inbox_bearer' && dashboardPrincipalId === null) {
    return Object.freeze({
      authorization: Object.freeze({ inboxId, kind }),
      scopeFingerprint
    });
  }

  if (kind === 'dashboard_principal' && isAuthorizationIdentifier(dashboardPrincipalId)) {
    return Object.freeze({
      authorization: Object.freeze({ dashboardPrincipalId, inboxId, kind }),
      scopeFingerprint
    });
  }

  throw new PostgresStorageError();
};

const hasSameAuthorization = (
  stored: StoredCommandAuthorization | undefined,
  input: ValidatedCreateInput
): boolean => {
  if (
    stored === undefined ||
    stored.scopeFingerprint !== input.scopeFingerprint ||
    stored.authorization.kind !== input.authorization.kind ||
    stored.authorization.inboxId !== input.authorization.inboxId
  ) {
    return false;
  }

  return input.authorization.kind === 'inbox_bearer'
    ? true
    : stored.authorization.kind === 'dashboard_principal' &&
        stored.authorization.dashboardPrincipalId === input.authorization.dashboardPrincipalId;
};

const validateAuthorization = (value: unknown): OutboundReplyCommandAuthorization | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value.kind === 'inbox_bearer' &&
    hasExactKeys(value, ['inboxId', 'kind']) &&
    isAuthorizationIdentifier(value.inboxId)
  ) {
    return Object.freeze({ inboxId: value.inboxId, kind: value.kind });
  }

  if (
    value.kind === 'dashboard_principal' &&
    hasExactKeys(value, ['dashboardPrincipalId', 'inboxId', 'kind']) &&
    isAuthorizationIdentifier(value.inboxId) &&
    isAuthorizationIdentifier(value.dashboardPrincipalId)
  ) {
    return Object.freeze({
      dashboardPrincipalId: value.dashboardPrincipalId,
      inboxId: value.inboxId,
      kind: value.kind
    });
  }

  return undefined;
};

const createScopeFingerprint = (allowedConnectionIds: readonly string[]): string =>
  createHash('sha256')
    .update(AUTHORIZATION_SCOPE_FINGERPRINT_PREFIX)
    .update(allowedConnectionIds.join('\u0000'))
    .digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: readonly string[]): boolean => {
  const keys = Object.keys(value);

  return (
    keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key))
  );
};

const isConnectionIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value);

const isOperationIdentifier = (value: unknown): value is string =>
  isConnectionIdentifier(value) && value !== '.' && value !== '..';

const isAuthorizationIdentifier = (value: unknown): value is string => isOperationIdentifier(value);

const isProviderIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAXIMUM_PROVIDER_IDENTIFIER_LENGTH &&
  PROVIDER_IDENTIFIER_PATTERN.test(value);

const isMessageText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= MAXIMUM_MESSAGE_LENGTH &&
  value.trim().length > 0;

const isSha256Hex = (value: unknown): value is string =>
  typeof value === 'string' && SHA256_HEX_PATTERN.test(value);

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
