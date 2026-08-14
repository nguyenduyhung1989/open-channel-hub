import type {
  CreateOutboundTelegramDeliveryAuthorizationResult,
  OutboundTelegramDeliveryAuthorization,
  OutboundTelegramDeliveryAuthorizationCreateInput,
  OutboundTelegramDeliveryAuthorizationStore
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import {
  INBOUND_EVENT_APPEND_LOCK_KEY,
  OUTBOUND_REPLY_COMMAND_CREATE_LOCK_KEY,
  OUTBOUND_TELEGRAM_DELIVERY_AUTHORIZATION_CREATE_LOCK_KEY
} from './postgres-lock-keys.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import { createOutboundCommandScopeFingerprint } from './outbound-command-scope-fingerprint.js';
import type { SqlClient, SqlPool } from './sql.js';

const MAXIMUM_ALLOWED_CONNECTION_IDS = 100;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_POSTGRES_BIGINT = '9223372036854775807';

/**
 * Every condition is bound to one already-selected dashboard inbox scope.
 * There is deliberately no reply target, message text, provider request, or
 * credential in this statement. The result is immutable evidence only.
 */
const INSERT_AUTHORIZATION_SQL = `
WITH eligible_command AS (
  SELECT
    outbound_command.command_id,
    connection_registry.provider_identity_fingerprint
  FROM ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
  JOIN ${POSTGRES_SCHEMA}.outbound_command_authorizations AS command_authorization
    ON command_authorization.command_id = outbound_command.command_id
  JOIN ${POSTGRES_SCHEMA}.outbound_telegram_command_eligibility AS telegram_eligibility
    ON telegram_eligibility.command_id = outbound_command.command_id
  JOIN ${POSTGRES_SCHEMA}.inbound_events AS source
    ON source.connection_id = outbound_command.connection_id
    AND source.provider_event_id = outbound_command.source_provider_event_id
  JOIN ${POSTGRES_SCHEMA}.connection_registry AS connection_registry
    ON connection_registry.connection_id = outbound_command.connection_id
  WHERE outbound_command.command_id = $1::bigint
    AND outbound_command.connection_id = ANY($2::text[])
    AND outbound_command.state = 'queued'
    AND outbound_command.source_channel = 'telegram_bot'
    AND command_authorization.inbox_id = $3
    AND command_authorization.scope_fingerprint = $4
    AND source.channel = 'telegram_bot'
    AND source.telegram_chat_type = 'private'
    AND telegram_eligibility.source_chat_type = 'private'
    AND connection_registry.channel = 'telegram_bot'
    AND connection_registry.provider_identity_fingerprint ~ '^[a-f0-9]{64}$'
    AND telegram_eligibility.bot_identity_fingerprint = connection_registry.provider_identity_fingerprint
    AND NOT EXISTS (
      SELECT 1
      FROM ${POSTGRES_SCHEMA}.outbound_delivery_attempts AS delivery_attempt
      WHERE delivery_attempt.command_id = outbound_command.command_id
    )
)
INSERT INTO ${POSTGRES_SCHEMA}.outbound_telegram_delivery_authorizations AS delivery_authorization (
  command_id,
  inbox_id,
  dashboard_principal_id,
  scope_fingerprint,
  bot_identity_fingerprint
)
SELECT
  eligible_command.command_id,
  $3,
  $5,
  $4,
  eligible_command.provider_identity_fingerprint
FROM eligible_command
ON CONFLICT (command_id) DO NOTHING
RETURNING
  command_id::text AS command_id,
  inbox_id,
  dashboard_principal_id,
  to_char(authorized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS authorized_at
`;

/**
 * An existing row is read through exactly the same current safety conditions.
 * A stale source, altered Bot binding, absent provenance, or attempted command
 * is indistinguishable from an unavailable command.
 */
const FIND_EXISTING_AUTHORIZATION_SQL = `
SELECT
  delivery_authorization.command_id::text AS command_id,
  delivery_authorization.inbox_id,
  delivery_authorization.dashboard_principal_id,
  delivery_authorization.scope_fingerprint,
  delivery_authorization.bot_identity_fingerprint,
  to_char(
    delivery_authorization.authorized_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS authorized_at,
  CASE WHEN
    outbound_command.state = 'queued'
    AND outbound_command.source_channel = 'telegram_bot'
    AND command_authorization.inbox_id = $3
    AND command_authorization.scope_fingerprint = $4
    AND source.channel = 'telegram_bot'
    AND source.telegram_chat_type = 'private'
    AND telegram_eligibility.source_chat_type = 'private'
    AND connection_registry.channel = 'telegram_bot'
    AND connection_registry.provider_identity_fingerprint ~ '^[a-f0-9]{64}$'
    AND telegram_eligibility.bot_identity_fingerprint = connection_registry.provider_identity_fingerprint
    AND delivery_authorization.bot_identity_fingerprint = connection_registry.provider_identity_fingerprint
    AND NOT EXISTS (
      SELECT 1
      FROM ${POSTGRES_SCHEMA}.outbound_delivery_attempts AS delivery_attempt
      WHERE delivery_attempt.command_id = outbound_command.command_id
    )
  THEN true ELSE false END AS authorization_eligible_now
FROM ${POSTGRES_SCHEMA}.outbound_telegram_delivery_authorizations AS delivery_authorization
JOIN ${POSTGRES_SCHEMA}.outbound_commands AS outbound_command
  ON outbound_command.command_id = delivery_authorization.command_id
LEFT JOIN ${POSTGRES_SCHEMA}.outbound_command_authorizations AS command_authorization
  ON command_authorization.command_id = outbound_command.command_id
LEFT JOIN ${POSTGRES_SCHEMA}.outbound_telegram_command_eligibility AS telegram_eligibility
  ON telegram_eligibility.command_id = outbound_command.command_id
LEFT JOIN ${POSTGRES_SCHEMA}.inbound_events AS source
  ON source.connection_id = outbound_command.connection_id
  AND source.provider_event_id = outbound_command.source_provider_event_id
LEFT JOIN ${POSTGRES_SCHEMA}.connection_registry AS connection_registry
  ON connection_registry.connection_id = outbound_command.connection_id
WHERE delivery_authorization.command_id = $1::bigint
  AND outbound_command.connection_id = ANY($2::text[])
`;

type ValidatedCreateInput = Readonly<{
  allowedConnectionIds: readonly string[];
  commandId: string;
  dashboardPrincipalId: string;
  inboxId: string;
  scopeFingerprint: string;
}>;

type StoredAuthorization = Readonly<{
  authorization: OutboundTelegramDeliveryAuthorization;
  authorizationEligibleNow: boolean;
  botIdentityFingerprint: string;
  scopeFingerprint: string;
}>;

/**
 * PostgreSQL evidence writer for a future Telegram-delivery decision. It has
 * no connector dependency and cannot create delivery attempts or provider I/O.
 */
export class PostgresOutboundTelegramDeliveryAuthorizationStore implements OutboundTelegramDeliveryAuthorizationStore {
  public constructor(private readonly pool: SqlPool) {}

  public async create(
    input: OutboundTelegramDeliveryAuthorizationCreateInput
  ): Promise<CreateOutboundTelegramDeliveryAuthorizationResult> {
    let client: SqlClient | undefined;
    let transactionStarted = false;

    try {
      const authorization = validateCreateInput(input);
      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      // The order is shared with connection registration and reply-command
      // creation. It serializes binding/eligibility visibility, not HTTP work.
      await client.query('SELECT pg_advisory_xact_lock($1)', [INBOUND_EVENT_APPEND_LOCK_KEY]);
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        OUTBOUND_REPLY_COMMAND_CREATE_LOCK_KEY
      ]);
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        OUTBOUND_TELEGRAM_DELIVERY_AUTHORIZATION_CREATE_LOCK_KEY
      ]);

      const existing = await this.findExisting(client, authorization);
      const outcome =
        existing === undefined
          ? await this.insertOrClassifyConflict(client, authorization)
          : classifyExisting(existing, authorization);

      await client.query('COMMIT');
      transactionStarted = false;

      return outcome;
    } catch (error) {
      if (client !== undefined && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original safe boundary error remains the only outcome.
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
  ): Promise<StoredAuthorization | undefined> {
    const result = await client.query(FIND_EXISTING_AUTHORIZATION_SQL, [
      input.commandId,
      input.allowedConnectionIds,
      input.inboxId,
      input.scopeFingerprint
    ]);

    return parseOptionalStoredAuthorization(result.rows, input.commandId);
  }

  private async insertOrClassifyConflict(
    client: SqlClient,
    input: ValidatedCreateInput
  ): Promise<CreateOutboundTelegramDeliveryAuthorizationResult> {
    const result = await client.query(INSERT_AUTHORIZATION_SQL, [
      input.commandId,
      input.allowedConnectionIds,
      input.inboxId,
      input.scopeFingerprint,
      input.dashboardPrincipalId
    ]);

    if (result.rows.length === 1) {
      const row = result.rows[0];

      if (row === undefined) {
        throw new PostgresStorageError();
      }

      return Object.freeze({
        authorization: parseAuthorization(row, input.commandId),
        kind: 'created'
      });
    }

    if (result.rows.length > 1) {
      throw new PostgresStorageError();
    }

    const existing = await this.findExisting(client, input);

    return existing === undefined
      ? Object.freeze({ kind: 'command_unavailable' })
      : classifyExisting(existing, input);
  }
}

const validateCreateInput = (
  input: OutboundTelegramDeliveryAuthorizationCreateInput
): ValidatedCreateInput => {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      'allowedConnectionIds',
      'commandId',
      'dashboardPrincipalId',
      'inboxId'
    ]) ||
    !isSortedConnectionScope(input.allowedConnectionIds) ||
    !isPostgresBigInt(input.commandId) ||
    !isIdentifier(input.inboxId) ||
    !isIdentifier(input.dashboardPrincipalId)
  ) {
    throw new PostgresStorageError();
  }

  const allowedConnectionIds = Object.freeze([...input.allowedConnectionIds]);

  return Object.freeze({
    allowedConnectionIds,
    commandId: input.commandId,
    dashboardPrincipalId: input.dashboardPrincipalId,
    inboxId: input.inboxId,
    scopeFingerprint: createOutboundCommandScopeFingerprint(allowedConnectionIds)
  });
};

const classifyExisting = (
  stored: StoredAuthorization,
  input: ValidatedCreateInput
): CreateOutboundTelegramDeliveryAuthorizationResult => {
  if (!stored.authorizationEligibleNow) {
    return Object.freeze({ kind: 'command_unavailable' });
  }

  return stored.authorization.inboxId === input.inboxId &&
    stored.authorization.dashboardPrincipalId === input.dashboardPrincipalId &&
    stored.scopeFingerprint === input.scopeFingerprint &&
    isSha256Hex(stored.botIdentityFingerprint)
    ? Object.freeze({ authorization: stored.authorization, kind: 'idempotent_replay' })
    : Object.freeze({ kind: 'authorization_conflict' });
};

const parseOptionalStoredAuthorization = (
  rows: readonly Readonly<Record<string, unknown>>[],
  expectedCommandId: string
): StoredAuthorization | undefined => {
  if (rows.length === 0) {
    return undefined;
  }

  if (rows.length !== 1) {
    throw new PostgresStorageError();
  }

  const row = rows[0];

  if (
    row === undefined ||
    typeof row.authorization_eligible_now !== 'boolean' ||
    !isSha256Hex(row.scope_fingerprint) ||
    !isSha256Hex(row.bot_identity_fingerprint)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    authorization: parseAuthorization(row, expectedCommandId),
    authorizationEligibleNow: row.authorization_eligible_now,
    botIdentityFingerprint: row.bot_identity_fingerprint,
    scopeFingerprint: row.scope_fingerprint
  });
};

const parseAuthorization = (
  row: Readonly<Record<string, unknown>>,
  expectedCommandId: string
): OutboundTelegramDeliveryAuthorization => {
  const commandId = row.command_id;
  const inboxId = row.inbox_id;
  const dashboardPrincipalId = row.dashboard_principal_id;
  const authorizedAt = row.authorized_at;

  if (
    commandId !== expectedCommandId ||
    !isPostgresBigInt(commandId) ||
    !isIdentifier(inboxId) ||
    !isIdentifier(dashboardPrincipalId) ||
    !isCanonicalIsoUtc(authorizedAt)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({ authorizedAt, commandId, dashboardPrincipalId, inboxId });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: readonly string[]): boolean => {
  const keys = Object.keys(value);

  return (
    keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key))
  );
};

const isSortedConnectionScope = (value: unknown): value is readonly string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAXIMUM_ALLOWED_CONNECTION_IDS) {
    return false;
  }

  let previous: string | undefined;

  for (const connectionId of value) {
    if (!isIdentifier(connectionId) || (previous !== undefined && previous >= connectionId)) {
      return false;
    }

    previous = connectionId;
  }

  return true;
};

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && value !== '.' && value !== '..';

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
