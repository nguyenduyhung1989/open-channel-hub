import type { DashboardSession, DashboardSessionCreateInput } from '@open-channel-hub/domain';
import { describe, expect, it } from 'vitest';

import { PostgresDashboardSessionStore } from './postgres-dashboard-session-store.js';
import { PostgresStorageError } from './postgres-error.js';
import type { SqlPool, SqlQueryResult } from './sql.js';

const SESSION_TOKEN_HMAC = 'a'.repeat(64);
const CSRF_TOKEN_HMAC = 'b'.repeat(64);
const SESSION: DashboardSession = Object.freeze({
  absoluteExpiresAt: '2026-08-14T12:00:00.000Z',
  csrfTokenHmac: CSRF_TOKEN_HMAC,
  id: '4bf59e62-836e-4a2c-8a8e-85cfad3f06cb',
  idleExpiresAt: '2026-08-13T12:30:00.000Z',
  issuedAt: '2026-08-13T12:00:00.000Z',
  lastSeenAt: '2026-08-13T12:00:00.000Z',
  principalId: 'dashboard-admin',
  sessionTokenHmac: SESSION_TOKEN_HMAC
});

describe('PostgresDashboardSessionStore', () => {
  it('creates a canonical session through a parameterized query without raw bearer values', async () => {
    const pool = createPool({ createRows: [row(SESSION)] });
    const store = new PostgresDashboardSessionStore(pool);

    const result = await store.create(createInput(SESSION));

    expect(result).toEqual(SESSION);
    expect(Object.isFrozen(result)).toBe(true);
    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('INSERT INTO open_channel_hub.dashboard_sessions'),
      values: [
        SESSION.id,
        SESSION.principalId,
        SESSION_TOKEN_HMAC,
        CSRF_TOKEN_HMAC,
        SESSION.issuedAt,
        SESSION.lastSeenAt,
        SESSION.idleExpiresAt,
        SESSION.absoluteExpiresAt
      ]
    });
    expect(pool.queries[0]?.sql).toContain('$8::timestamptz');
    expect(pool.queries[0]?.sql).not.toContain(SESSION_TOKEN_HMAC);
    expect(pool.queries[0]?.sql).not.toContain(CSRF_TOKEN_HMAC);
  });

  it('reads only an active unrevoked session through a parameterized lookup', async () => {
    const pool = createPool({ readRows: [row(SESSION)] });
    const store = new PostgresDashboardSessionStore(pool);

    await expect(
      store.readActive({ at: '2026-08-13T12:05:00.000Z', sessionTokenHmac: SESSION_TOKEN_HMAC })
    ).resolves.toEqual(SESSION);

    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('SELECT'),
      values: [SESSION_TOKEN_HMAC, '2026-08-13T12:05:00.000Z']
    });
    expect(pool.queries[0]?.sql).toContain('revoked_at IS NULL');
    expect(pool.queries[0]?.sql).toContain('issued_at <= $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('last_seen_at <= $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('idle_expires_at > $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('absolute_expires_at > $2::timestamptz');
    expect(pool.queries[0]?.sql).not.toContain(SESSION_TOKEN_HMAC);
  });

  it('treats revoked and expired sessions as absent without leaking their state', async () => {
    const store = new PostgresDashboardSessionStore(createPool({ readRows: [] }));

    await expect(
      store.readActive({ at: '2026-08-13T12:05:00.000Z', sessionTokenHmac: SESSION_TOKEN_HMAC })
    ).resolves.toBeUndefined();
  });

  it('fails safe if a read query returns a valid-looking row that is revoked, expired, or for another HMAC', async () => {
    const invalidRows = [
      row(SESSION, { revoked_at: '2026-08-13T12:01:00.000Z' }),
      row(SESSION, { idle_expires_at: '2026-08-13T12:05:00.000Z' }),
      row(SESSION, {
        issued_at: '2026-08-13T12:06:00.000Z',
        last_seen_at: '2026-08-13T12:06:00.000Z'
      }),
      row(SESSION, { session_token_hmac: 'c'.repeat(64) })
    ];

    for (const invalidRow of invalidRows) {
      await expect(
        new PostgresDashboardSessionStore(createPool({ readRows: [invalidRow] })).readActive({
          at: '2026-08-13T12:05:00.000Z',
          sessionTokenHmac: SESSION_TOKEN_HMAC
        })
      ).rejects.toBeInstanceOf(PostgresStorageError);
    }
  });

  it('touches a live session in one atomic update and returns the database-capped idle expiry', async () => {
    const touchedSession: DashboardSession = Object.freeze({
      ...SESSION,
      idleExpiresAt: SESSION.absoluteExpiresAt,
      lastSeenAt: '2026-08-13T12:10:00.000Z'
    });
    const pool = createPool({ touchRows: [row(touchedSession)] });
    const store = new PostgresDashboardSessionStore(pool);

    const result = await store.touchActive({
      idleExpiresAt: '2026-08-14T13:00:00.000Z',
      sessionTokenHmac: SESSION_TOKEN_HMAC,
      touchedAt: '2026-08-13T12:10:00.000Z'
    });

    expect(result).toEqual(touchedSession);
    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('UPDATE open_channel_hub.dashboard_sessions'),
      values: [SESSION_TOKEN_HMAC, '2026-08-13T12:10:00.000Z', '2026-08-14T13:00:00.000Z']
    });
    expect(pool.queries[0]?.sql).toContain(
      'idle_expires_at = LEAST(GREATEST(idle_expires_at, $3::timestamptz), absolute_expires_at)'
    );
    expect(pool.queries[0]?.sql).toContain('last_seen_at <= $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('idle_expires_at > $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('absolute_expires_at > $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('$3::timestamptz > $2::timestamptz');
    expect(pool.queries[0]?.sql).toContain('revoked_at IS NULL');
  });

  it('does not revive revoked, expired, or stale sessions when an atomic touch updates no row', async () => {
    const store = new PostgresDashboardSessionStore(createPool({ touchRows: [] }));

    await expect(
      store.touchActive({
        idleExpiresAt: '2026-08-13T12:40:00.000Z',
        sessionTokenHmac: SESSION_TOKEN_HMAC,
        touchedAt: '2026-08-13T12:10:00.000Z'
      })
    ).resolves.toBeUndefined();
  });

  it('fails safe if an atomic touch returns a row that was not actually touched or is no longer active', async () => {
    const invalidRows = [
      row(SESSION),
      row(SESSION, {
        last_seen_at: '2026-08-13T12:10:00.000Z',
        revoked_at: '2026-08-13T12:10:00.000Z'
      }),
      row(SESSION, {
        idle_expires_at: '2026-08-13T12:10:00.000Z',
        last_seen_at: '2026-08-13T12:10:00.000Z'
      })
    ];

    for (const invalidRow of invalidRows) {
      await expect(
        new PostgresDashboardSessionStore(createPool({ touchRows: [invalidRow] })).touchActive({
          idleExpiresAt: '2026-08-13T12:40:00.000Z',
          sessionTokenHmac: SESSION_TOKEN_HMAC,
          touchedAt: '2026-08-13T12:10:00.000Z'
        })
      ).rejects.toBeInstanceOf(PostgresStorageError);
    }
  });

  it('revokes by HMAC through an idempotent parameterized update', async () => {
    const pool = createPool();
    const store = new PostgresDashboardSessionStore(pool);

    await expect(
      store.revoke({
        revokedAt: '2026-08-13T12:15:00.000Z',
        sessionTokenHmac: SESSION_TOKEN_HMAC
      })
    ).resolves.toBeUndefined();

    expect(pool.queries).toHaveLength(1);
    expect(pool.queries[0]).toMatchObject({
      sql: expect.stringContaining('UPDATE open_channel_hub.dashboard_sessions'),
      values: [SESSION_TOKEN_HMAC, '2026-08-13T12:15:00.000Z']
    });
    expect(pool.queries[0]?.sql).toContain('revoked_at = COALESCE(revoked_at, $2::timestamptz)');
    expect(pool.queries[0]?.sql).not.toContain(SESSION_TOKEN_HMAC);
  });

  it('rejects malformed HMACs, identifiers, and ISO time boundaries before querying', async () => {
    const invalidCreateInputs: readonly unknown[] = [
      Object.freeze({ ...createInput(SESSION), sessionTokenHmac: 'A'.repeat(64) }),
      Object.freeze({ ...createInput(SESSION), csrfTokenHmac: 'b'.repeat(63) }),
      Object.freeze({ ...createInput(SESSION), id: '../not-a-session' }),
      Object.freeze({ ...createInput(SESSION), principalId: '..' }),
      Object.freeze({ ...createInput(SESSION), issuedAt: '2026-08-13T12:00:00Z' }),
      Object.freeze({
        ...createInput(SESSION),
        lastSeenAt: '2026-08-13T12:30:00.001Z'
      }),
      Object.freeze({
        ...createInput(SESSION),
        idleExpiresAt: '2026-08-13T12:00:00.000Z'
      }),
      Object.freeze({
        ...createInput(SESSION),
        absoluteExpiresAt: '2026-08-13T12:29:59.999Z'
      })
    ];

    for (const input of invalidCreateInputs) {
      const pool = createPool();
      await expect(
        new PostgresDashboardSessionStore(pool).create(input as DashboardSessionCreateInput)
      ).rejects.toBeInstanceOf(PostgresStorageError);
      expect(pool.queries).toEqual([]);
    }

    const punctuatedPrincipalSession: DashboardSession = Object.freeze({
      ...SESSION,
      principalId: 'dashboard.admin:main'
    });
    await expect(
      new PostgresDashboardSessionStore(
        createPool({ createRows: [row(punctuatedPrincipalSession)] })
      ).create(createInput(punctuatedPrincipalSession))
    ).resolves.toEqual(punctuatedPrincipalSession);

    const invalidTouchPool = createPool();
    await expect(
      new PostgresDashboardSessionStore(invalidTouchPool).touchActive({
        idleExpiresAt: '2026-08-13T12:10:00.000Z',
        sessionTokenHmac: SESSION_TOKEN_HMAC,
        touchedAt: '2026-08-13T12:10:00.000Z'
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidTouchPool.queries).toEqual([]);

    const invalidReadPool = createPool();
    await expect(
      new PostgresDashboardSessionStore(invalidReadPool).readActive({
        at: '2026-08-13T12:05:00.000Z',
        sessionTokenHmac: 'A'.repeat(64)
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidReadPool.queries).toEqual([]);

    const invalidRevokePool = createPool();
    await expect(
      new PostgresDashboardSessionStore(invalidRevokePool).revoke({
        revokedAt: 'not-an-iso-timestamp',
        sessionTokenHmac: SESSION_TOKEN_HMAC
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);
    expect(invalidRevokePool.queries).toEqual([]);
  });

  it('converts malformed database rows and query failures into one safe storage error', async () => {
    const malformedReadPool = createPool({
      readRows: [row(SESSION, { csrf_token_hmac: 'B'.repeat(64) })]
    });
    await expect(
      new PostgresDashboardSessionStore(malformedReadPool).readActive({
        at: '2026-08-13T12:05:00.000Z',
        sessionTokenHmac: SESSION_TOKEN_HMAC
      })
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });

    const malformedTouchPool = createPool({
      touchRows: [row(SESSION, { last_seen_at: 'not-an-iso-timestamp' })]
    });
    await expect(
      new PostgresDashboardSessionStore(malformedTouchPool).touchActive({
        idleExpiresAt: '2026-08-13T12:40:00.000Z',
        sessionTokenHmac: SESSION_TOKEN_HMAC,
        touchedAt: '2026-08-13T12:10:00.000Z'
      })
    ).rejects.toBeInstanceOf(PostgresStorageError);

    const failingPool = createPool({ failOnQuery: true });
    await expect(
      new PostgresDashboardSessionStore(failingPool).create(createInput(SESSION))
    ).rejects.toMatchObject({
      message: 'PostgreSQL storage is unavailable.',
      name: 'PostgresStorageError'
    });

    const mismatchedCreatePool = createPool({
      createRows: [row(SESSION, { principal_id: 'unexpected-principal' })]
    });
    await expect(
      new PostgresDashboardSessionStore(mismatchedCreatePool).create(createInput(SESSION))
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
  readonly createRows?: readonly Readonly<Record<string, unknown>>[];
  readonly failOnQuery?: boolean;
  readonly readRows?: readonly Readonly<Record<string, unknown>>[];
  readonly touchRows?: readonly Readonly<Record<string, unknown>>[];
}

const createPool = (options: PoolOptions = {}): FakePool => {
  const queries: RecordedQuery[] = [];

  return Object.freeze({
    get queries(): readonly RecordedQuery[] {
      return queries;
    },
    connect: async () => {
      throw new Error('Dashboard session operations must not need a dedicated client.');
    },
    query: async (sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult> => {
      queries.push(Object.freeze({ sql, values: Object.freeze([...values]) }));

      if (options.failOnQuery === true) {
        throw new Error('Synthetic PostgreSQL detail that must not cross the storage boundary.');
      }

      if (sql.includes('INSERT INTO open_channel_hub.dashboard_sessions')) {
        return Object.freeze({ rows: options.createRows ?? [row(SESSION)] });
      }

      if (sql.includes('UPDATE open_channel_hub.dashboard_sessions')) {
        return Object.freeze({ rows: options.touchRows ?? [] });
      }

      return Object.freeze({ rows: options.readRows ?? [] });
    }
  });
};

const createInput = (session: DashboardSession): DashboardSessionCreateInput =>
  Object.freeze({
    absoluteExpiresAt: session.absoluteExpiresAt,
    csrfTokenHmac: session.csrfTokenHmac,
    id: session.id,
    idleExpiresAt: session.idleExpiresAt,
    issuedAt: session.issuedAt,
    lastSeenAt: session.lastSeenAt,
    principalId: session.principalId,
    sessionTokenHmac: session.sessionTokenHmac
  });

const row = (
  session: DashboardSession,
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> =>
  Object.freeze({
    absolute_expires_at: session.absoluteExpiresAt,
    csrf_token_hmac: session.csrfTokenHmac,
    idle_expires_at: session.idleExpiresAt,
    issued_at: session.issuedAt,
    last_seen_at: session.lastSeenAt,
    principal_id: session.principalId,
    revoked_at: session.revokedAt ?? null,
    session_id: session.id,
    session_token_hmac: session.sessionTokenHmac,
    ...overrides
  });
