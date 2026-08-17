import { describe, expect, it } from 'vitest';

import { PostgresDashboardGoogleIdentityStore } from './postgres-dashboard-google-identity-store.js';
import { PostgresStorageError } from './postgres-error.js';
import type { SqlPool, SqlQueryResult } from './sql.js';

const PRINCIPAL_ID = 'support-agent';
const SUBJECT_HMAC = 'a'.repeat(64);

describe('PostgresDashboardGoogleIdentityStore', () => {
  it('binds an opaque Google subject HMAC through parameterized SQL without raw identity data', async () => {
    const pool = createPool({ insertRows: [bindingRow()] });
    const store = new PostgresDashboardGoogleIdentityStore(pool);

    await expect(
      store.bind({ principalId: PRINCIPAL_ID, subjectHmac: SUBJECT_HMAC })
    ).resolves.toEqual({ kind: 'created' });

    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('INSERT INTO open_channel_hub.dashboard_google_identities'),
      values: [SUBJECT_HMAC, PRINCIPAL_ID]
    });
    expect(pool.queries[0]?.sql).toContain('ON CONFLICT DO NOTHING');
    expect(pool.queries[0]?.sql).not.toContain(SUBJECT_HMAC);
    expect(pool.queries[0]?.sql).not.toContain(PRINCIPAL_ID);
    expect(pool.queries[0]?.sql).not.toContain('email');
    expect(pool.queries[0]?.sql).not.toContain('refresh_token');
  });

  it('returns an idempotent replay only for the same immutable identity-to-principal pair', async () => {
    const replayPool = createPool({ existingRows: [bindingRow()] });
    const store = new PostgresDashboardGoogleIdentityStore(replayPool);

    await expect(
      store.bind({ principalId: PRINCIPAL_ID, subjectHmac: SUBJECT_HMAC })
    ).resolves.toEqual({ kind: 'idempotent_replay' });
    expect(replayPool.queries).toHaveLength(2);
    expect(replayPool.queries[1]?.values).toEqual([SUBJECT_HMAC, PRINCIPAL_ID]);

    const conflictPool = createPool({
      existingRows: [bindingRow({ principal_id: 'other-principal' })]
    });

    await expect(
      new PostgresDashboardGoogleIdentityStore(conflictPool).bind({
        principalId: PRINCIPAL_ID,
        subjectHmac: SUBJECT_HMAC
      })
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('looks up only the configured principal through the HMAC and treats no row as unlinked', async () => {
    const linkedPool = createPool({ lookupRows: [{ principal_id: PRINCIPAL_ID }] });
    const linkedStore = new PostgresDashboardGoogleIdentityStore(linkedPool);

    await expect(linkedStore.findPrincipalId({ subjectHmac: SUBJECT_HMAC })).resolves.toBe(
      PRINCIPAL_ID
    );
    expect(linkedPool.queries[0]).toMatchObject({
      sql: expect.stringContaining('WHERE subject_hmac = $1'),
      values: [SUBJECT_HMAC]
    });
    expect(linkedPool.queries[0]?.sql).not.toContain(SUBJECT_HMAC);

    await expect(
      new PostgresDashboardGoogleIdentityStore(createPool()).findPrincipalId({
        subjectHmac: SUBJECT_HMAC
      })
    ).resolves.toBeUndefined();
  });

  it('fails closed before SQL for malformed inputs and malformed database results', async () => {
    const invalidPool = createPool();
    const invalidStore = new PostgresDashboardGoogleIdentityStore(invalidPool);

    for (const input of [
      { principalId: '..', subjectHmac: SUBJECT_HMAC },
      { principalId: PRINCIPAL_ID, subjectHmac: 'A'.repeat(64) },
      { principalId: PRINCIPAL_ID, subjectHmac: 'short' }
    ]) {
      await expect(invalidStore.bind(input)).rejects.toBeInstanceOf(PostgresStorageError);
    }

    await expect(
      invalidStore.findPrincipalId({ subjectHmac: 'A'.repeat(64) })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidPool.queries).toEqual([]);

    const malformedLookupPool = createPool({ lookupRows: [{ principal_id: '..' }] });
    await expect(
      new PostgresDashboardGoogleIdentityStore(malformedLookupPool).findPrincipalId({
        subjectHmac: SUBJECT_HMAC
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const failingPool = createPool({ fail: true });
    await expect(
      new PostgresDashboardGoogleIdentityStore(failingPool).bind({
        principalId: PRINCIPAL_ID,
        subjectHmac: SUBJECT_HMAC
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
  });
});

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakePool extends SqlPool {
  readonly queries: readonly RecordedQuery[];
}

interface PoolOptions {
  readonly existingRows?: readonly Readonly<Record<string, unknown>>[];
  readonly fail?: boolean;
  readonly insertRows?: readonly Readonly<Record<string, unknown>>[];
  readonly lookupRows?: readonly Readonly<Record<string, unknown>>[];
}

const createPool = (options: PoolOptions = {}): FakePool => {
  const queries: RecordedQuery[] = [];

  return Object.freeze({
    get queries(): readonly RecordedQuery[] {
      return queries;
    },
    connect: async () => {
      throw new Error('Dashboard Google identities never need a dedicated client.');
    },
    query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
      queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (options.fail === true) {
        throw new Error('Synthetic database detail must not cross this boundary.');
      }

      if (sql.includes('INSERT INTO open_channel_hub.dashboard_google_identities')) {
        return Object.freeze({ rows: options.insertRows ?? [] });
      }

      if (sql.includes('OR principal_id = $2')) {
        return Object.freeze({ rows: options.existingRows ?? [] });
      }

      return Object.freeze({ rows: options.lookupRows ?? [] });
    }
  });
};

const bindingRow = (
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
  Object.freeze({ principal_id: PRINCIPAL_ID, subject_hmac: SUBJECT_HMAC, ...overrides });
