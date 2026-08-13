import { createHmac, randomBytes as defaultRandomBytes } from 'node:crypto';

import type { DashboardSession, DashboardSessionStore } from '@open-channel-hub/domain';

import { matchesSecret } from '../http/secret-match.js';

const CSRF_TOKEN_BYTES = 32;
const SESSION_IDLE_MILLISECONDS = 30 * 60 * 1_000;
const SESSION_ABSOLUTE_MILLISECONDS = 8 * 60 * 60 * 1_000;
const SESSION_ID_BYTES = 24;
const SESSION_TOKEN_BYTES = 32;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export interface DashboardSessionManagerDependencies {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface IssuedDashboardSession {
  readonly csrfToken: string;
  readonly sessionToken: string;
}

/** A non-diagnostic session boundary failure for safe route handling. */
export class DashboardSessionManagerError extends Error {
  public constructor() {
    super('The dashboard session is invalid.');
    this.name = 'DashboardSessionManagerError';
  }
}

/**
 * Owns all raw browser-token handling. PostgreSQL receives only HMACs, while
 * routes receive a raw token only long enough to issue or validate a cookie.
 */
export interface DashboardSessionManager {
  createLoginCsrfToken: () => string;
  createSession: (principalId: string) => Promise<IssuedDashboardSession>;
  matchesCsrf: (session: DashboardSession, csrfToken: string | undefined) => boolean;
  readActiveSession: (sessionToken: string | undefined) => Promise<DashboardSession | undefined>;
  revokeSession: (sessionToken: string | undefined) => Promise<void>;
  touchActiveSession: (sessionToken: string | undefined) => Promise<DashboardSession | undefined>;
}

export const createDashboardSessionManager = (
  sessionStore: DashboardSessionStore,
  sessionIdPepper: string,
  dependencies: DashboardSessionManagerDependencies = {}
): DashboardSessionManager => {
  const now = dependencies.now ?? (() => new Date());
  const randomBytes = dependencies.randomBytes ?? defaultRandomBytes;

  return Object.freeze({
    createLoginCsrfToken: (): string => createOpaqueToken(randomBytes, CSRF_TOKEN_BYTES),
    createSession: async (principalId: string): Promise<IssuedDashboardSession> => {
      if (!isIdentifier(principalId)) {
        throw new DashboardSessionManagerError();
      }

      const issuedAt = currentIso(now);
      const sessionToken = createOpaqueToken(randomBytes, SESSION_TOKEN_BYTES);
      const csrfToken = createOpaqueToken(randomBytes, CSRF_TOKEN_BYTES);
      const sessionId = createSessionId(randomBytes);
      const idleExpiresAt = addMilliseconds(issuedAt, SESSION_IDLE_MILLISECONDS);
      const absoluteExpiresAt = addMilliseconds(issuedAt, SESSION_ABSOLUTE_MILLISECONDS);

      await sessionStore.create({
        absoluteExpiresAt,
        csrfTokenHmac: tokenHmac(sessionIdPepper, 'csrf', csrfToken),
        id: sessionId,
        idleExpiresAt,
        issuedAt,
        lastSeenAt: issuedAt,
        principalId,
        sessionTokenHmac: tokenHmac(sessionIdPepper, 'session', sessionToken)
      });

      return Object.freeze({ csrfToken, sessionToken });
    },
    matchesCsrf: (session: DashboardSession, csrfToken: string | undefined): boolean =>
      isOpaqueToken(csrfToken) &&
      matchesSecret(tokenHmac(sessionIdPepper, 'csrf', csrfToken), session.csrfTokenHmac),
    readActiveSession: async (
      sessionToken: string | undefined
    ): Promise<DashboardSession | undefined> => {
      if (!isOpaqueToken(sessionToken)) {
        return undefined;
      }

      return sessionStore.readActive({
        at: currentIso(now),
        sessionTokenHmac: tokenHmac(sessionIdPepper, 'session', sessionToken)
      });
    },
    revokeSession: async (sessionToken: string | undefined): Promise<void> => {
      if (!isOpaqueToken(sessionToken)) {
        return;
      }

      await sessionStore.revoke({
        revokedAt: currentIso(now),
        sessionTokenHmac: tokenHmac(sessionIdPepper, 'session', sessionToken)
      });
    },
    touchActiveSession: async (
      sessionToken: string | undefined
    ): Promise<DashboardSession | undefined> => {
      if (!isOpaqueToken(sessionToken)) {
        return undefined;
      }

      const touchedAt = currentIso(now);

      return sessionStore.touchActive({
        idleExpiresAt: addMilliseconds(touchedAt, SESSION_IDLE_MILLISECONDS),
        sessionTokenHmac: tokenHmac(sessionIdPepper, 'session', sessionToken),
        touchedAt
      });
    }
  });
};

const createOpaqueToken = (randomBytes: (size: number) => Buffer, size: number): string => {
  const value = randomBytes(size).toString('base64url');

  if (!isOpaqueToken(value)) {
    throw new DashboardSessionManagerError();
  }

  return value;
};

const createSessionId = (randomBytes: (size: number) => Buffer): string => {
  const value = randomBytes(SESSION_ID_BYTES).toString('base64url');

  if (!SESSION_ID_PATTERN.test(value)) {
    throw new DashboardSessionManagerError();
  }

  return value;
};

const currentIso = (now: () => Date): string => {
  const value = now();

  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new DashboardSessionManagerError();
  }

  return value.toISOString();
};

const addMilliseconds = (iso: string, milliseconds: number): string => {
  const timestamp = Date.parse(iso);
  const result = new Date(timestamp + milliseconds);

  if (!Number.isFinite(timestamp) || !Number.isFinite(result.getTime())) {
    throw new DashboardSessionManagerError();
  }

  return result.toISOString();
};

const tokenHmac = (pepper: string, purpose: 'csrf' | 'session', value: string): string =>
  createHmac('sha256', pepper)
    .update(`open-channel-hub/dashboard/${purpose}\u0000${value}`, 'utf8')
    .digest('hex');

const isIdentifier = (value: string): boolean =>
  /^[A-Za-z0-9._:-]{1,128}$/.test(value) && value !== '.' && value !== '..';

const isOpaqueToken = (value: string | undefined): value is string =>
  value !== undefined && OPAQUE_TOKEN_PATTERN.test(value);
