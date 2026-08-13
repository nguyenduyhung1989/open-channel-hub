import { createHmac } from 'node:crypto';

import type { DashboardSession, DashboardSessionStore } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  createDashboardSessionManager,
  DashboardSessionManagerError
} from './dashboard-session-manager.js';

const PEPPER = 'synthetic_dashboard_session_pepper_012345678901234';
const NOW = new Date('2026-08-13T00:00:00.000Z');
const SESSION_TOKEN = Buffer.alloc(32, 1).toString('base64url');
const CSRF_TOKEN = Buffer.alloc(32, 2).toString('base64url');
const SESSION_ID = Buffer.alloc(24, 3).toString('base64url');

describe('dashboard session manager', () => {
  it('persists only HMACs of freshly issued browser tokens with bounded expiries', async () => {
    const store = createStore();
    const manager = createDashboardSessionManager(store, PEPPER, {
      now: () => NOW,
      randomBytes: sequentialBytes([SESSION_TOKEN, CSRF_TOKEN, SESSION_ID])
    });

    const issued = await manager.createSession('support-agent');

    expect(issued).toEqual({ csrfToken: CSRF_TOKEN, sessionToken: SESSION_TOKEN });
    expect(store.create).toHaveBeenCalledWith({
      absoluteExpiresAt: '2026-08-13T08:00:00.000Z',
      csrfTokenHmac: tokenHmac('csrf', CSRF_TOKEN),
      id: SESSION_ID,
      idleExpiresAt: '2026-08-13T00:30:00.000Z',
      issuedAt: '2026-08-13T00:00:00.000Z',
      lastSeenAt: '2026-08-13T00:00:00.000Z',
      principalId: 'support-agent',
      sessionTokenHmac: tokenHmac('session', SESSION_TOKEN)
    });
    expect(JSON.stringify(store.create.mock.calls)).not.toContain(SESSION_TOKEN);
    expect(JSON.stringify(store.create.mock.calls)).not.toContain(CSRF_TOKEN);
  });

  it('touches only a structurally valid session token and verifies CSRF with a separate HMAC', async () => {
    const store = createStore({ touchResult: session() });
    const manager = createDashboardSessionManager(store, PEPPER, { now: () => NOW });

    await expect(manager.touchActiveSession('not-a-token')).resolves.toBeUndefined();
    await expect(manager.touchActiveSession(SESSION_TOKEN)).resolves.toEqual(session());

    expect(store.touchActive).toHaveBeenCalledWith({
      idleExpiresAt: '2026-08-13T00:30:00.000Z',
      sessionTokenHmac: tokenHmac('session', SESSION_TOKEN),
      touchedAt: '2026-08-13T00:00:00.000Z'
    });
    expect(manager.matchesCsrf(session(), CSRF_TOKEN)).toBe(true);
    expect(manager.matchesCsrf(session(), Buffer.alloc(32, 9).toString('base64url'))).toBe(false);
  });

  it('reads and revokes only valid opaque tokens without exposing storage input for junk cookies', async () => {
    const store = createStore({ readResult: session() });
    const manager = createDashboardSessionManager(store, PEPPER, { now: () => NOW });

    await expect(manager.readActiveSession(SESSION_TOKEN)).resolves.toEqual(session());
    await manager.revokeSession(SESSION_TOKEN);
    await manager.revokeSession('invalid');

    expect(store.readActive).toHaveBeenCalledWith({
      at: '2026-08-13T00:00:00.000Z',
      sessionTokenHmac: tokenHmac('session', SESSION_TOKEN)
    });
    expect(store.revoke).toHaveBeenCalledWith({
      revokedAt: '2026-08-13T00:00:00.000Z',
      sessionTokenHmac: tokenHmac('session', SESSION_TOKEN)
    });
    expect(store.revoke).toHaveBeenCalledOnce();
  });

  it('fails closed when entropy or time cannot produce a safe durable session', async () => {
    const store = createStore();
    const invalidEntropy = createDashboardSessionManager(store, PEPPER, {
      randomBytes: () => Buffer.alloc(1),
      now: () => NOW
    });
    const invalidClock = createDashboardSessionManager(store, PEPPER, {
      now: () => new Date('invalid')
    });

    expect(() => invalidEntropy.createLoginCsrfToken()).toThrow(DashboardSessionManagerError);
    await expect(invalidClock.createSession('support-agent')).rejects.toThrow(
      DashboardSessionManagerError
    );
  });
});

const createStore = (
  options: Readonly<{
    readResult?: DashboardSession;
    touchResult?: DashboardSession;
  }> = {}
): DashboardSessionStore &
  Readonly<
    Record<'create' | 'readActive' | 'revoke' | 'touchActive', ReturnType<typeof vi.fn>>
  > => {
  const create = vi.fn(async (): Promise<DashboardSession> => session());
  const readActive = vi.fn(async (): Promise<DashboardSession | undefined> => options.readResult);
  const revoke = vi.fn(async (): Promise<void> => undefined);
  const touchActive = vi.fn(async (): Promise<DashboardSession | undefined> => options.touchResult);

  return Object.freeze({ create, readActive, revoke, touchActive });
};

const session = (): DashboardSession =>
  Object.freeze({
    absoluteExpiresAt: '2026-08-13T08:00:00.000Z',
    csrfTokenHmac: tokenHmac('csrf', CSRF_TOKEN),
    id: SESSION_ID,
    idleExpiresAt: '2026-08-13T00:30:00.000Z',
    issuedAt: '2026-08-13T00:00:00.000Z',
    lastSeenAt: '2026-08-13T00:00:00.000Z',
    principalId: 'support-agent',
    sessionTokenHmac: tokenHmac('session', SESSION_TOKEN)
  });

const sequentialBytes = (values: readonly string[]): ((size: number) => Buffer) => {
  const queue = [...values];

  return (size: number): Buffer => {
    const value = queue.shift();

    if (value === undefined) {
      throw new Error('No synthetic entropy remains.');
    }

    const result = Buffer.from(value, 'base64url');

    if (result.length !== size) {
      throw new Error('The synthetic entropy length is invalid.');
    }

    return result;
  };
};

const tokenHmac = (purpose: 'csrf' | 'session', value: string): string =>
  createHmac('sha256', PEPPER)
    .update(`open-channel-hub/dashboard/${purpose}\u0000${value}`, 'utf8')
    .digest('hex');
