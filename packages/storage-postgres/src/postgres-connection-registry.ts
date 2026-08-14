import {
  CHANNELS,
  CONNECTOR_TIERS,
  type Channel,
  type ConnectionRegistration,
  type ConnectorTier
} from '@open-channel-hub/contracts';
import type { ConnectionRegistry } from '@open-channel-hub/domain';

import { PostgresStorageError } from './postgres-error.js';
import {
  CONNECTION_REGISTRY_LOCK_KEY,
  INBOUND_EVENT_APPEND_LOCK_KEY
} from './postgres-lock-keys.js';
import { POSTGRES_SCHEMA } from './postgres-migrations.js';
import type { SqlClient, SqlPool } from './sql.js';

const MAXIMUM_CONNECTION_REGISTRATIONS = 100;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_IDENTITY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

const UPSERT_CONNECTION_REGISTRATION_SQL = `
INSERT INTO ${POSTGRES_SCHEMA}.connection_registry AS existing (
  connection_id,
  connector_id,
  channel,
  provider_identity_fingerprint,
  tier
)
SELECT $1, $2, $3, $4::text, $5
WHERE $4::text IS NULL
  OR NOT EXISTS (
    SELECT 1
    FROM ${POSTGRES_SCHEMA}.inbound_events AS history
    WHERE history.connection_id = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${POSTGRES_SCHEMA}.connection_registry AS registered
        WHERE registered.connection_id = $1
      )
  )
ON CONFLICT (connection_id) DO UPDATE
SET
  connection_id = EXCLUDED.connection_id,
  provider_identity_fingerprint = EXCLUDED.provider_identity_fingerprint
WHERE existing.connector_id = EXCLUDED.connector_id
  AND existing.channel = EXCLUDED.channel
  AND (
    existing.provider_identity_fingerprint IS NOT DISTINCT FROM EXCLUDED.provider_identity_fingerprint
    OR (
      existing.provider_identity_fingerprint IS NULL
      AND EXCLUDED.provider_identity_fingerprint IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ${POSTGRES_SCHEMA}.inbound_events AS history
        WHERE history.connection_id = existing.connection_id
      )
    )
  )
  AND existing.tier = EXCLUDED.tier
RETURNING connection_id, connector_id, channel, provider_identity_fingerprint, tier
`;

/**
 * PostgreSQL implementation of the domain-owned connection registry. A
 * connection id is immutable once registered: restarting with identical
 * metadata is safe, while a changed connector, channel, or tier aborts the
 * entire registration transaction before provider traffic can cross accounts.
 */
export class PostgresConnectionRegistry implements ConnectionRegistry {
  public constructor(private readonly pool: SqlPool) {}

  public async ensureRegistered(connections: readonly ConnectionRegistration[]): Promise<void> {
    let client: SqlClient | undefined;
    let transactionStarted = false;

    try {
      const registrations = validateRegistrations(connections);

      if (registrations.length === 0) {
        return;
      }

      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query('SELECT pg_advisory_xact_lock($1)', [CONNECTION_REGISTRY_LOCK_KEY]);
      await client.query('SELECT pg_advisory_xact_lock($1)', [INBOUND_EVENT_APPEND_LOCK_KEY]);

      for (const registration of registrations) {
        const result = await client.query(
          UPSERT_CONNECTION_REGISTRATION_SQL,
          valuesFor(registration)
        );

        if (!hasMatchingRegistration(result.rows, registration)) {
          throw new PostgresStorageError();
        }
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

const validateRegistrations = (value: unknown): readonly ConnectionRegistration[] => {
  if (!Array.isArray(value) || value.length > MAXIMUM_CONNECTION_REGISTRATIONS) {
    throw new PostgresStorageError();
  }

  const ids = new Set<string>();
  const registrations = value.map((candidate) => {
    if (!isConnectionRegistration(candidate) || ids.has(candidate.id)) {
      throw new PostgresStorageError();
    }

    ids.add(candidate.id);

    return Object.freeze({
      id: candidate.id,
      connectorId: candidate.connectorId,
      channel: candidate.channel,
      tier: candidate.tier,
      ...(candidate.providerIdentityFingerprint === undefined
        ? {}
        : { providerIdentityFingerprint: candidate.providerIdentityFingerprint })
    });
  });

  return Object.freeze(registrations);
};

const isConnectionRegistration = (value: unknown): value is ConnectionRegistration =>
  isRecord(value) &&
  isIdentifier(value.id) &&
  isIdentifier(value.connectorId) &&
  isChannel(value.channel) &&
  isConnectorTier(value.tier) &&
  (value.providerIdentityFingerprint === undefined ||
    isProviderIdentityFingerprint(value.providerIdentityFingerprint)) &&
  (!requiresProviderIdentityFingerprint(value.channel) ||
    (value.providerIdentityFingerprint !== undefined &&
      isProviderIdentityFingerprint(value.providerIdentityFingerprint)));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER_PATTERN.test(value);

const isChannel = (value: unknown): value is Channel =>
  typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);

const isConnectorTier = (value: unknown): value is ConnectorTier =>
  typeof value === 'string' && (CONNECTOR_TIERS as readonly string[]).includes(value);

const requiresProviderIdentityFingerprint = (channel: Channel): boolean =>
  channel === 'telegram_bot' ||
  channel === 'zalo_oa' ||
  channel === 'facebook_page' ||
  channel === 'whatsapp_business';

const isProviderIdentityFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && PROVIDER_IDENTITY_FINGERPRINT_PATTERN.test(value);

const valuesFor = (registration: ConnectionRegistration): readonly unknown[] =>
  Object.freeze([
    registration.id,
    registration.connectorId,
    registration.channel,
    registration.providerIdentityFingerprint ?? null,
    registration.tier
  ]);

const hasMatchingRegistration = (
  rows: readonly Readonly<Record<string, unknown>>[],
  registration: ConnectionRegistration
): boolean => {
  if (rows.length !== 1) {
    return false;
  }

  const row = rows[0];

  return (
    row?.connection_id === registration.id &&
    row.connector_id === registration.connectorId &&
    row.channel === registration.channel &&
    row.provider_identity_fingerprint === (registration.providerIdentityFingerprint ?? null) &&
    row.tier === registration.tier
  );
};
