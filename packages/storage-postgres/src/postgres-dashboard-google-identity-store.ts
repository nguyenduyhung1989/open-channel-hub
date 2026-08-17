import type {
  DashboardGoogleIdentityBindInput,
  DashboardGoogleIdentityBindResult,
  DashboardGoogleIdentityLookupInput,
  DashboardGoogleIdentityStore
} from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlPool } from './sql.js';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/;

const INSERT_IDENTITY_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.dashboard_google_identities (
  subject_hmac,
  principal_id
)
VALUES ($1, $2)
ON CONFLICT DO NOTHING
RETURNING subject_hmac, principal_id
`;

const FIND_IDENTITY_OR_PRINCIPAL_SQL = `
SELECT subject_hmac, principal_id
FROM ${POSTGRES_SCHEMA}.dashboard_google_identities
WHERE subject_hmac = $1
   OR principal_id = $2
`;

const FIND_PRINCIPAL_SQL = `
SELECT principal_id
FROM ${POSTGRES_SCHEMA}.dashboard_google_identities
WHERE subject_hmac = $1
`;

/**
 * PostgreSQL boundary for Google-to-dashboard-principal links. It receives
 * only a domain-separated SHA-256 HMAC of Google `sub`, never raw Google
 * account data or OAuth tokens.
 */
export class PostgresDashboardGoogleIdentityStore implements DashboardGoogleIdentityStore {
  public constructor(private readonly pool: SqlPool) {}

  public async bind(
    input: DashboardGoogleIdentityBindInput
  ): Promise<DashboardGoogleIdentityBindResult> {
    try {
      const binding = validateBindingInput(input);
      const inserted = await this.pool.query(INSERT_IDENTITY_SQL, [
        binding.subjectHmac,
        binding.principalId
      ]);

      if (inserted.rows.length === 1) {
        const row = parseBindingRow(inserted.rows[0]);

        if (row.subjectHmac !== binding.subjectHmac || row.principalId !== binding.principalId) {
          throw new PostgresStorageError();
        }

        return Object.freeze({ kind: 'created' });
      }

      if (inserted.rows.length !== 0) {
        throw new PostgresStorageError();
      }

      const existing = await this.pool.query(FIND_IDENTITY_OR_PRINCIPAL_SQL, [
        binding.subjectHmac,
        binding.principalId
      ]);
      const rows = existing.rows.map(parseBindingRow);

      if (rows.length < 1 || rows.length > 2) {
        throw new PostgresStorageError();
      }

      return rows.some(
        (row) => row.subjectHmac === binding.subjectHmac && row.principalId === binding.principalId
      )
        ? Object.freeze({ kind: 'idempotent_replay' })
        : Object.freeze({ kind: 'conflict' });
    } catch (error) {
      return throwStorageError(error);
    }
  }

  public async findPrincipalId(
    input: DashboardGoogleIdentityLookupInput
  ): Promise<string | undefined> {
    try {
      const subjectHmac = validateLookupInput(input);
      const result = await this.pool.query(FIND_PRINCIPAL_SQL, [subjectHmac]);

      if (result.rows.length === 0) {
        return undefined;
      }

      if (result.rows.length !== 1) {
        throw new PostgresStorageError();
      }

      const principalId = result.rows[0]?.principal_id;

      if (!isIdentifier(principalId)) {
        throw new PostgresStorageError();
      }

      return principalId;
    } catch (error) {
      return throwStorageError(error);
    }
  }
}

interface BindingRow {
  readonly principalId: string;
  readonly subjectHmac: string;
}

const validateBindingInput = (
  input: DashboardGoogleIdentityBindInput
): Readonly<DashboardGoogleIdentityBindInput> => {
  if (!isRecord(input) || !isIdentifier(input.principalId) || !isSha256Hex(input.subjectHmac)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({ principalId: input.principalId, subjectHmac: input.subjectHmac });
};

const validateLookupInput = (input: DashboardGoogleIdentityLookupInput): string => {
  if (!isRecord(input) || !isSha256Hex(input.subjectHmac)) {
    throw new PostgresStorageError();
  }

  return input.subjectHmac;
};

const parseBindingRow = (row: Readonly<Record<string, unknown>> | undefined): BindingRow => {
  const subjectHmac = row?.subject_hmac;
  const principalId = row?.principal_id;

  if (!isSha256Hex(subjectHmac) || !isIdentifier(principalId)) {
    throw new PostgresStorageError();
  }

  return Object.freeze({ principalId, subjectHmac });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && value !== '.' && value !== '..';

const isSha256Hex = (value: unknown): value is string =>
  typeof value === 'string' && SHA_256_HEX_PATTERN.test(value);

const throwStorageError = (error: unknown): never => {
  if (error instanceof PostgresStorageError) {
    throw error;
  }

  throw new PostgresStorageError();
};
