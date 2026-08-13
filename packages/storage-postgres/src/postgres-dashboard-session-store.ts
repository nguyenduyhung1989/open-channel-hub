import type {
  DashboardSession,
  DashboardSessionCreateInput,
  DashboardSessionReadInput,
  DashboardSessionRevokeInput,
  DashboardSessionStore,
  DashboardSessionTouchInput
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlPool } from './sql.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const SESSION_COLUMNS_SQL = `
  session_id,
  principal_id,
  session_token_hmac,
  csrf_token_hmac,
  to_char(issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS issued_at,
  to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen_at,
  to_char(idle_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS idle_expires_at,
  to_char(absolute_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS absolute_expires_at,
  CASE
    WHEN revoked_at IS NULL THEN NULL
    ELSE to_char(revoked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  END AS revoked_at
`;

const INSERT_SESSION_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.dashboard_sessions (
  session_id,
  principal_id,
  session_token_hmac,
  csrf_token_hmac,
  issued_at,
  last_seen_at,
  idle_expires_at,
  absolute_expires_at
)
VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8::timestamptz)
RETURNING
${SESSION_COLUMNS_SQL}
`;

const READ_ACTIVE_SESSION_SQL = `
SELECT
${SESSION_COLUMNS_SQL}
FROM ${POSTGRES_SCHEMA}.dashboard_sessions
WHERE session_token_hmac = $1
  AND revoked_at IS NULL
  AND issued_at <= $2::timestamptz
  AND last_seen_at <= $2::timestamptz
  AND idle_expires_at > $2::timestamptz
  AND absolute_expires_at > $2::timestamptz
`;

/**
 * A one-statement compare-and-set prevents a concurrent request from touching
 * a session after another request revoked or expired it. `GREATEST` prevents a
 * stale request from shortening a newer idle expiry; `LEAST` caps every
 * renewal at the immutable absolute expiry selected at login.
 */
const TOUCH_ACTIVE_SESSION_SQL = `
UPDATE ${POSTGRES_SCHEMA}.dashboard_sessions
SET
  last_seen_at = $2::timestamptz,
  idle_expires_at = LEAST(GREATEST(idle_expires_at, $3::timestamptz), absolute_expires_at)
WHERE session_token_hmac = $1
  AND revoked_at IS NULL
  AND last_seen_at <= $2::timestamptz
  AND idle_expires_at > $2::timestamptz
  AND absolute_expires_at > $2::timestamptz
  AND $3::timestamptz > $2::timestamptz
RETURNING
${SESSION_COLUMNS_SQL}
`;

const REVOKE_SESSION_SQL = `
UPDATE ${POSTGRES_SCHEMA}.dashboard_sessions
SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
WHERE session_token_hmac = $1
`;

/**
 * PostgreSQL adapter for durable dashboard session state. The application
 * HMACs random cookie/CSRF tokens before calling this boundary, so this adapter
 * persists neither a raw bearer token nor password or provider material.
 */
export class PostgresDashboardSessionStore implements DashboardSessionStore {
  public constructor(private readonly pool: SqlPool) {}

  public async create(input: DashboardSessionCreateInput): Promise<DashboardSession> {
    try {
      const session = validateCreateInput(input);
      const result = await this.pool.query(INSERT_SESSION_SQL, [
        session.id,
        session.principalId,
        session.sessionTokenHmac,
        session.csrfTokenHmac,
        session.issuedAt,
        session.lastSeenAt,
        session.idleExpiresAt,
        session.absoluteExpiresAt
      ]);

      return assertCreatedSession(parseExactlyOneSession(result.rows), session);
    } catch (error) {
      return throwStorageError(error);
    }
  }

  public async readActive(input: DashboardSessionReadInput): Promise<DashboardSession | undefined> {
    try {
      const validated = validateReadInput(input);
      const result = await this.pool.query(READ_ACTIVE_SESSION_SQL, [
        validated.sessionTokenHmac,
        validated.at
      ]);

      return assertReadActiveSession(
        parseOptionalSession(result.rows),
        validated.sessionTokenHmac,
        validated.at
      );
    } catch (error) {
      return throwStorageError(error);
    }
  }

  public async touchActive(
    input: DashboardSessionTouchInput
  ): Promise<DashboardSession | undefined> {
    try {
      const validated = validateTouchInput(input);
      const result = await this.pool.query(TOUCH_ACTIVE_SESSION_SQL, [
        validated.sessionTokenHmac,
        validated.touchedAt,
        validated.idleExpiresAt
      ]);

      return assertTouchedActiveSession(
        parseOptionalSession(result.rows),
        validated.sessionTokenHmac,
        validated.touchedAt
      );
    } catch (error) {
      return throwStorageError(error);
    }
  }

  public async revoke(input: DashboardSessionRevokeInput): Promise<void> {
    try {
      const validated = validateRevokeInput(input);
      await this.pool.query(REVOKE_SESSION_SQL, [validated.sessionTokenHmac, validated.revokedAt]);
    } catch (error) {
      return throwStorageError(error);
    }
  }
}

type ValidatedSession = Readonly<DashboardSession>;

const validateCreateInput = (input: DashboardSessionCreateInput): ValidatedSession => {
  if (
    !isRecord(input) ||
    !isIdentifier(input.id) ||
    !isIdentifier(input.principalId) ||
    !isSha256Hex(input.sessionTokenHmac) ||
    !isSha256Hex(input.csrfTokenHmac) ||
    input.sessionTokenHmac === input.csrfTokenHmac ||
    !isCanonicalIsoUtc(input.issuedAt) ||
    !isCanonicalIsoUtc(input.lastSeenAt) ||
    !isCanonicalIsoUtc(input.idleExpiresAt) ||
    !isCanonicalIsoUtc(input.absoluteExpiresAt) ||
    compareIsoUtc(input.issuedAt, input.lastSeenAt) > 0 ||
    compareIsoUtc(input.lastSeenAt, input.idleExpiresAt) >= 0 ||
    compareIsoUtc(input.idleExpiresAt, input.absoluteExpiresAt) > 0
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    absoluteExpiresAt: input.absoluteExpiresAt,
    csrfTokenHmac: input.csrfTokenHmac,
    id: input.id,
    idleExpiresAt: input.idleExpiresAt,
    issuedAt: input.issuedAt,
    lastSeenAt: input.lastSeenAt,
    principalId: input.principalId,
    sessionTokenHmac: input.sessionTokenHmac
  });
};

const validateReadInput = (
  input: DashboardSessionReadInput
): Readonly<DashboardSessionReadInput> => {
  if (!isRecord(input) || !isSha256Hex(input.sessionTokenHmac) || !isCanonicalIsoUtc(input.at)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({ at: input.at, sessionTokenHmac: input.sessionTokenHmac });
};

const validateTouchInput = (
  input: DashboardSessionTouchInput
): Readonly<DashboardSessionTouchInput> => {
  if (
    !isRecord(input) ||
    !isSha256Hex(input.sessionTokenHmac) ||
    !isCanonicalIsoUtc(input.touchedAt) ||
    !isCanonicalIsoUtc(input.idleExpiresAt) ||
    compareIsoUtc(input.touchedAt, input.idleExpiresAt) >= 0
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    idleExpiresAt: input.idleExpiresAt,
    sessionTokenHmac: input.sessionTokenHmac,
    touchedAt: input.touchedAt
  });
};

const validateRevokeInput = (
  input: DashboardSessionRevokeInput
): Readonly<DashboardSessionRevokeInput> => {
  if (
    !isRecord(input) ||
    !isSha256Hex(input.sessionTokenHmac) ||
    !isCanonicalIsoUtc(input.revokedAt)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({ revokedAt: input.revokedAt, sessionTokenHmac: input.sessionTokenHmac });
};

const parseOptionalSession = (
  rows: readonly Readonly<Record<string, unknown>>[]
): DashboardSession | undefined => {
  if (rows.length === 0) {
    return undefined;
  }

  return parseExactlyOneSession(rows);
};

const parseExactlyOneSession = (
  rows: readonly Readonly<Record<string, unknown>>[]
): DashboardSession => {
  if (rows.length !== 1) {
    throw new PostgresStorageError();
  }

  const row = rows[0];

  if (row === undefined) {
    throw new PostgresStorageError();
  }

  const id = row.session_id;
  const principalId = row.principal_id;
  const sessionTokenHmac = row.session_token_hmac;
  const csrfTokenHmac = row.csrf_token_hmac;
  const issuedAt = row.issued_at;
  const lastSeenAt = row.last_seen_at;
  const idleExpiresAt = row.idle_expires_at;
  const absoluteExpiresAt = row.absolute_expires_at;
  const revokedAt = row.revoked_at;

  if (
    !isIdentifier(id) ||
    !isIdentifier(principalId) ||
    !isSha256Hex(sessionTokenHmac) ||
    !isSha256Hex(csrfTokenHmac) ||
    sessionTokenHmac === csrfTokenHmac ||
    !isCanonicalIsoUtc(issuedAt) ||
    !isCanonicalIsoUtc(lastSeenAt) ||
    !isCanonicalIsoUtc(idleExpiresAt) ||
    !isCanonicalIsoUtc(absoluteExpiresAt) ||
    (revokedAt !== null && !isCanonicalIsoUtc(revokedAt)) ||
    compareIsoUtc(issuedAt, lastSeenAt) > 0 ||
    compareIsoUtc(lastSeenAt, idleExpiresAt) >= 0 ||
    compareIsoUtc(idleExpiresAt, absoluteExpiresAt) > 0 ||
    (revokedAt !== null && compareIsoUtc(revokedAt, issuedAt) < 0)
  ) {
    throw new PostgresStorageError();
  }

  return Object.freeze({
    absoluteExpiresAt,
    csrfTokenHmac,
    id,
    idleExpiresAt,
    issuedAt,
    lastSeenAt,
    principalId,
    ...(revokedAt === null ? {} : { revokedAt }),
    sessionTokenHmac
  });
};

const assertCreatedSession = (
  stored: DashboardSession,
  expected: ValidatedSession
): DashboardSession => {
  if (
    stored.id !== expected.id ||
    stored.principalId !== expected.principalId ||
    stored.sessionTokenHmac !== expected.sessionTokenHmac ||
    stored.csrfTokenHmac !== expected.csrfTokenHmac ||
    stored.issuedAt !== expected.issuedAt ||
    stored.lastSeenAt !== expected.lastSeenAt ||
    stored.idleExpiresAt !== expected.idleExpiresAt ||
    stored.absoluteExpiresAt !== expected.absoluteExpiresAt ||
    stored.revokedAt !== undefined
  ) {
    throw new PostgresStorageError();
  }

  return stored;
};

const assertReadActiveSession = (
  session: DashboardSession | undefined,
  sessionTokenHmac: string,
  at: string
): DashboardSession | undefined => {
  if (session === undefined) {
    return undefined;
  }

  if (
    session.sessionTokenHmac !== sessionTokenHmac ||
    session.revokedAt !== undefined ||
    compareIsoUtc(session.issuedAt, at) > 0 ||
    compareIsoUtc(session.lastSeenAt, at) > 0 ||
    compareIsoUtc(session.idleExpiresAt, at) <= 0 ||
    compareIsoUtc(session.absoluteExpiresAt, at) <= 0
  ) {
    throw new PostgresStorageError();
  }

  return session;
};

const assertTouchedActiveSession = (
  session: DashboardSession | undefined,
  sessionTokenHmac: string,
  touchedAt: string
): DashboardSession | undefined => {
  if (session === undefined) {
    return undefined;
  }

  if (
    session.sessionTokenHmac !== sessionTokenHmac ||
    session.revokedAt !== undefined ||
    session.lastSeenAt !== touchedAt ||
    compareIsoUtc(session.idleExpiresAt, touchedAt) <= 0 ||
    compareIsoUtc(session.absoluteExpiresAt, touchedAt) <= 0
  ) {
    throw new PostgresStorageError();
  }

  return session;
};

const throwStorageError = (error: unknown): never => {
  if (error instanceof PostgresStorageError) {
    throw error;
  }

  throw new PostgresStorageError();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && value !== '.' && value !== '..';

const isSha256Hex = (value: unknown): value is string =>
  typeof value === 'string' && SHA_256_HEX_PATTERN.test(value);

const isCanonicalIsoUtc = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const compareIsoUtc = (left: string, right: string): number => left.localeCompare(right);
